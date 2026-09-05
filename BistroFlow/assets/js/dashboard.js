/* dashboard.js — UI do painel + CRUDs + navegação entre views
   Adaptado para Store assíncrono (Supabase). */
(async function () {
  // ===== auth guard =====
  const session = await Auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  // Stripe return handling
  const params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    alert('Assinatura confirmada! 🎉 Bem-vindo ao seu novo plano.');
    window.history.replaceState({}, '', window.location.pathname);
    await render('settings');
  } else if (params.get('checkout') === 'cancel') {
    window.history.replaceState({}, '', window.location.pathname);
  }

  const userMeta = session.user.user_metadata || {};

  // ===== user info =====
  $('#userName').textContent = userMeta.name || session.user.email;
  $('#userRest').textContent = userMeta.restaurant || '—';
  $('#userAvatar').textContent = (userMeta.name || session.user.email).charAt(0).toUpperCase();
  $('#helloName').textContent = (userMeta.name || session.user.email).split(' ')[0];

  // ===== logout =====
  const logoutBtn = $('#logoutBtn');
  logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    await Auth.logout();
    window.location.href = 'index.html';
  });

  // também responde ao evento global de auth (caso sessão expire)
  Auth.onChange((event) => {
    if (event === 'SIGNED_OUT') window.location.href = 'login.html';
  });

  // ===== navegação entre views =====
  const navButtons = $$('#dashNav button');
  const views = $$('.dash__view');
  const goto = async (name) => {
    navButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    views.forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
    await render(name);
  };
  navButtons.forEach((b) => b.addEventListener('click', () => goto(b.dataset.view)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => goto(b.dataset.goto)));

  // ===== saudação pela hora =====
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  $('#dashDate').textContent = `${greeting}! Aqui está o resumo de hoje`;

  // ===== modal =====
  const modal = $('#modal');
  const modalTitle = $('#modalTitle');
  const modalBody = $('#modalBody');
  const modalFoot = $('#modalFoot');
  const openModal = (title, bodyHTML, footHTML) => {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHTML;
    modalFoot.innerHTML = footHTML || '';
    modal.classList.add('is-open');
  };
  const closeModal = () => modal.classList.remove('is-open');
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ===== helpers de formatação =====
  const BRL = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const timeAgo = (iso) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return 'agora';
    if (diff < 60) return Math.round(diff) + 'min atrás';
    if (diff < 1440) return Math.round(diff / 60) + 'h atrás';
    return Math.round(diff / 1440) + 'd atrás';
  };
  const escapeHTML = utils.escapeHTML;
  const isOpenOrder = (order) => !['entregue', 'cancelado'].includes(order.status);
  const setTrend = (id, current, previous, suffix = '') => {
    const el = $(id);
    if (!previous) {
      el.textContent = current ? 'Sem dados de ontem' : 'Sem movimento hoje';
      el.className = 'metric-card__trend';
      return;
    }
    const delta = ((current - previous) / previous) * 100;
    const signal = delta >= 0 ? '↑' : '↓';
    el.textContent = `${signal} ${Math.abs(delta).toFixed(0)}% vs ontem${suffix}`;
    el.className = `metric-card__trend metric-card__trend--${delta >= 0 ? 'up' : 'down'}`;
  };

  // Plan configuration
  const PLAN_DATA = {
    balcao: { name: 'Balcão', price: 'Grátis', color: 'status-pill--cancelado' },
    salao: { name: 'Salão', price: 'R$ 97,90/mês', color: 'status-pill--preparando' },
    rede: { name: 'Rede', price: 'R$ 159,90/mês', color: 'status-pill--pronto' }
  };

  const STATUS_MAP = {
    active: 'Ativo',
    canceled: 'Cancelado',
    past_due: 'Pagamento pendente',
    trailing: 'Em teste'
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';

  // ===== orders badge =====
  const refreshBadge = async () => {
    const orders = await Store.getOrders();
    const open = orders.filter((o) => o.status !== 'entregue' && o.status !== 'cancelado').length;
    $('#badgeOrders').textContent = open;
  };

  // ============================================================
  // PLAN & BILLING
  // ============================================================
  async function renderPlanCard() {
    const sub = await Store.getSubscription();
    const plan = PLAN_DATA[sub.plan] || PLAN_DATA.balcao;
    const status = STATUS_MAP[sub.status] || sub.status;
    const renewDate = formatDate(sub.current_period_end);

    $('#planCard').innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center">
        <div>
          <span class="status-pill ${plan.color}">${plan.name}</span>
          <strong style="margin-left:10px; font-size:16px">${plan.price}</strong>
        </div>
        <span class="status-pill" style="background:var(--bg-elev); color:var(--ink)">${status}</span>
      </div>
      <div style="font-size:13px; color:var(--ink-mute)">
        ${sub.plan !== 'balcao' ? `Renovação em: <strong>${renewDate}</strong>` : 'Plano gratuito limitado.'}
      </div>
      <div style="display:flex; gap:10px; margin-top:var(--sp-2)">
        <button class="btn btn--primary" id="btnChangePlan">Mudar de plano</button>
        ${sub.plan !== 'balcao' ? `<button class="btn btn--ghost" id="btnManageSub">Gerenciar assinatura</button>` : ''}
      </div>
    `;

    $('#btnChangePlan')?.addEventListener('click', openPlanModal);
    $('#btnManageSub')?.addEventListener('click', manageSubscription);
  }

  function openPlanModal() {
    const session = Auth.getSession(); // Need the session for userId/email

    const plansHTML = Object.entries(PLAN_DATA).map(([id, data]) => {
      // We need to know the current plan to disable the button
      // Since Store.getSubscription is async, we'll handle it inside the click handler of the buttons
      return `
        <div class="plan-option" style="border:1px solid var(--line); padding:var(--sp-4); border-radius:var(--r-md); display:flex; flex-direction:column; gap:var(--sp-3); text-align:center">
          <strong style="font-size:18px">${data.name}</strong>
          <div style="font-size:20px; font-weight:800">${data.price}</div>
          <p style="font-size:12px; color:var(--ink-mute); flex:1">
            ${id === 'balcao' ? 'Ideal para quem está começando.' : id === 'salao' ? 'Mais recursos para seu salão.' : 'Solução completa para rede de lojas.'}
          </p>
          <button class="btn btn--primary btn-sub" data-plan="${id}">Assinar</button>
        </div>
      `;
    }).join('');

    openModal('Escolha seu plano', `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:var(--sp-4)">
        ${plansHTML}
      </div>
    `, `
      <button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Fechar</button>
    `);

    // Handle subscription clicks
    $$('.btn-sub').forEach(btn => {
      btn.addEventListener('click', async () => {
        const planId = btn.dataset.plan;
        const { user } = await session;

        try {
          const res = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan: planId, userId: user.id, userEmail: user.email })
          });
          const { url } = await res.json();
          if (url) window.location.href = url;
          else alert('Erro ao gerar sessão de checkout.');
        } catch (e) {
          alert('Erro na conexão: ' + e.message);
        }
      });
    });

    // Disable current plan
    Store.getSubscription().then(sub => {
      const currentBtn = $(`.btn-sub[data-plan="${sub.plan}"]`);
      if (currentBtn) {
        currentBtn.disabled = true;
        currentBtn.textContent = 'Plano atual';
        currentBtn.classList.replace('btn--primary', 'btn--ghost');
      }
    });
  }

  async function manageSubscription() {
    const { user } = await Auth.getSession();
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
      else alert('Erro ao gerar sessão do portal.');
    } catch (e) {
      alert('Erro na conexão: ' + e.message);
    }
  }

  // ============================================================
  async function renderOverview() {
    const [orders, inventory] = await Promise.all([Store.getOrders(), Store.getInventory()]);
    const today = new Date().toDateString();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toDateString();
    const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === today && o.status !== 'cancelado');
    const yesterdayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === yesterday && o.status !== 'cancelado');
    const revenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
    const ticket = todayOrders.length ? revenue / todayOrders.length : 0;
    const yesterdayRevenue = yesterdayOrders.reduce((s, o) => s + Number(o.total), 0);
    const yesterdayTicket = yesterdayOrders.length ? yesterdayRevenue / yesterdayOrders.length : 0;
    const pending = orders.filter(isOpenOrder).length;
    const lowInventory = inventory.filter((item) => Number(item.qty) < Number(item.min));

    $('#mRevenue').textContent = BRL(revenue);
    $('#mOrders').textContent = todayOrders.length;
    $('#mTicket').textContent = BRL(ticket);
    $('#mPending').textContent = pending;
    $('#mPendingTrend').textContent = pending ? 'Pedidos aguardando ação' : 'Tudo em dia';
    $('#mPendingTrend').className = `metric-card__trend metric-card__trend--${pending ? 'down' : 'up'}`;
    setTrend('#mRevenueTrend', revenue, yesterdayRevenue);
    setTrend('#mOrdersTrend', todayOrders.length, yesterdayOrders.length);
    setTrend('#mTicketTrend', ticket, yesterdayTicket);

    const insights = [
      { icon: pending ? '🧾' : '✓', title: pending ? `${pending} pedido${pending > 1 ? 's' : ''} em andamento` : 'Pedidos em dia', text: pending ? 'Acompanhe preparo e entrega na aba Pedidos.' : 'Nenhum pedido aguardando ação.' },
      { icon: lowInventory.length ? '⚠' : '◌', title: lowInventory.length ? `${lowInventory.length} item${lowInventory.length > 1 ? 's' : ''} com estoque baixo` : 'Estoque saudável', text: lowInventory.length ? lowInventory.slice(0, 2).map((item) => item.name).join(', ') : 'Nenhum insumo abaixo do mínimo.' },
      { icon: '↗', title: `${todayOrders.length} venda${todayOrders.length !== 1 ? 's' : ''} hoje`, text: revenue ? `Ticket médio de ${BRL(ticket)}.` : 'Registre o primeiro pedido do dia.' }
    ];
    $('#dashInsights').innerHTML = insights.map((item) => `<article class="dash__insight"><span class="dash__insight-icon">${item.icon}</span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.text)}</p></div></article>`).join('');

    // chart: vendas dos últimos 7 dias (dado real)
    const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const chartData = days.map((d) => {
      const key = d.toDateString();
      const total = orders
        .filter((o) => new Date(o.created_at).toDateString() === key)
        .reduce((s, o) => s + Number(o.total), 0);
      return { label: key === today ? 'Hoje' : dayLabels[d.getDay()], value: total };
    });

    const max = Math.max(...chartData.map((d) => d.value), 1);
    $('#chartBars').innerHTML = chartData.map((d) =>
      `<div class="chart__bar" style="height:${(d.value / max) * 100}%" data-label="${d.label}" title="${BRL(d.value)}"></div>`
    ).join('');

    // pedidos recentes
    const recent = orders.slice(0, 5);
    $('#recentOrders').innerHTML = recent.length
      ? recent.map((o) => `
      <tr>
        <td><strong>${escapeHTML(o.customer)}</strong></td>
        <td>${escapeHTML(o.items)}</td>
        <td>${BRL(Number(o.total))}</td>
        <td><span class="status-pill status-pill--${o.status}">${o.status}</span></td>
      </tr>
    `).join('')
      : '<tr><td colspan="4"><div class="empty"><div class="empty__icon">📭</div>Sem pedidos ainda</div></td></tr>';

    await refreshBadge();
  }

  // ============================================================
  // RENDER: PEDIDOS
  // ============================================================
  async function renderOrders() {
    const orders = await Store.getOrders();
    const query = $('#orderSearch').value.trim().toLowerCase();
    const status = $('#orderStatusFilter').value;
    const visibleOrders = orders.filter((order) => {
      const matchesText = !query || [order.customer, order.items, order.phone, order.channel]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesText && (!status || order.status === status);
    });
    const body = $('#ordersBody');
    if (!visibleOrders.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="empty__icon">📭</div>${orders.length ? 'Nenhum pedido encontrado com esses filtros.' : 'Nenhum pedido ainda. Que sorte!'}</div></td></tr>`;
    } else {
      body.innerHTML = visibleOrders.map((o) => `
        <tr>
          <td><code>${o.id.slice(0, 8).toUpperCase()}</code></td>
          <td><strong>${escapeHTML(o.customer)}</strong><br><small style="color:var(--ink-mute)">${escapeHTML(o.phone || '')}</small></td>
          <td>${escapeHTML(o.items)}</td>
          <td>${escapeHTML(o.channel)}</td>
          <td><strong>${BRL(Number(o.total))}</strong></td>
          <td>
            <select onchange="window.__bfSetStatus('${o.id}', this.value)" style="padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg-elev);font-size:12px">
              <option value="novo"       ${o.status === 'novo' ? 'selected' : ''}>Novo</option>
              <option value="confirmado" ${o.status === 'confirmado' ? 'selected' : ''}>Confirmado</option>
              <option value="preparando" ${o.status === 'preparando' ? 'selected' : ''}>Preparando</option>
              <option value="pronto"     ${o.status === 'pronto' ? 'selected' : ''}>Pronto</option>
              <option value="entregue"   ${o.status === 'entregue' ? 'selected' : ''}>Entregue</option>
              <option value="cancelado"  ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </td>
          <td>${timeAgo(o.created_at)}</td>
          <td>
            <div class="actions">
              <button class="del" onclick="window.__bfDelOrder('${o.id}')" title="Excluir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }
    await refreshBadge();
  }
  $('#orderSearch').addEventListener('input', () => renderOrders());
  $('#orderStatusFilter').addEventListener('change', () => renderOrders());

  window.__bfSetStatus = async (id, status) => {
    await Store.updateOrderStatus(id, status);
    await renderOrders();
  };
  window.__bfDelOrder = async (id) => {
    if (confirm('Excluir este pedido?')) {
      await Store.deleteOrder(id);
      await renderOrders();
    }
  };

  // modal de novo pedido
  function newOrderModal() {
    openModal('Novo pedido', `
      <div class="field">
        <label for="np-customer">Nome do cliente</label>
        <input type="text" id="np-customer" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="np-phone">Telefone</label>
          <input type="tel" id="np-phone" />
        </div>
        <div class="field">
          <label for="np-channel">Canal</label>
          <select id="np-channel" style="padding:14px 16px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--bg-elev)">
            <option value="balcao">Balcão</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="ifood">iFood</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="np-items">Itens (separe por vírgula)</label>
        <input type="text" id="np-items" placeholder="2x Pizza Margherita, 1x Coca" />
      </div>
      <div class="field">
        <label for="np-total">Total (R$)</label>
        <input type="number" id="np-total" step="0.01" min="0" />
      </div>
    `, `
      <button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button>
      <button class="btn btn--primary" id="np-save">Criar pedido</button>
    `);
    $('#np-save').addEventListener('click', async () => {
      const o = {
        customer: $('#np-customer').value.trim() || 'Cliente',
        phone: $('#np-phone').value.trim() || null,
        items: $('#np-items').value.trim() || '—',
        total: parseFloat($('#np-total').value) || 0,
        channel: $('#np-channel').value,
        status: 'novo'
      };
      try {
        await Store.addOrder(o);
        await Store.recordCustomerOrder(o);
        closeModal();
        await renderOrders();
      } catch (e) {
        alert(e.message);
      }
    });
  }
  $('#btnNewOrder').addEventListener('click', newOrderModal);
  $('#btnNewOrder2').addEventListener('click', newOrderModal);

  // ============================================================
  // RENDER: CARDÁPIO
  // ============================================================
  async function renderMenu() {
    const items = await Store.getMenu();
    const body = $('#menuBody');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty__icon">🍽️</div>Cardápio vazio. Adicione seu primeiro item!</div></td></tr>';
    } else {
      body.innerHTML = items.map((i) => {
        const price = Number(i.price);
        const cost = Number(i.cost);
        const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
        return `
          <tr>
            <td>
              <strong>${escapeHTML(i.name)}</strong>
              ${i.description ? `<br><small style="color:var(--ink-mute)">${escapeHTML(i.description).slice(0, 60)}${i.description.length > 60 ? '...' : ''}</small>` : ''}
            </td>
            <td>${escapeHTML(i.category)}</td>
            <td><strong>${BRL(price)}</strong></td>
            <td>${BRL(cost)}</td>
            <td><span class="status-pill ${margin > 60 ? 'status-pill--pronto' : margin > 30 ? 'status-pill--preparando' : 'status-pill--cancelado'}">${margin}%</span></td>
            <td><span class="status-pill ${i.available ? 'status-pill--pronto' : 'status-pill--cancelado'}">${i.available ? 'Disponível' : 'Indisponível'}</span></td>
            <td>
              <div class="actions">
                <button onclick="window.__bfEditMenu('${i.id}')" title="Editar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="del" onclick="window.__bfDelMenu('${i.id}')" title="Excluir">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  function menuItemModal(item) {
    const isEdit = !!item;
    openModal(isEdit ? 'Editar item' : 'Novo item do cardápio', `
      <div class="field">
        <label for="mi-name">Nome</label>
        <input type="text" id="mi-name" value="${isEdit ? escapeHTML(item.name) : ''}" />
      </div>
      <div class="field">
        <label for="mi-desc">Descrição</label>
        <input type="text" id="mi-desc" value="${isEdit ? escapeHTML(item.description || '') : ''}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="mi-cat">Categoria</label>
          <input type="text" id="mi-cat" value="${isEdit ? escapeHTML(item.category) : 'Pratos'}" />
        </div>
        <div class="field">
          <label for="mi-stock">Estoque</label>
          <input type="number" id="mi-stock" value="${isEdit ? item.stock : 100}" min="0" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="mi-price">Preço (R$)</label>
          <input type="number" id="mi-price" value="${isEdit ? item.price : 0}" step="0.01" min="0" />
        </div>
        <div class="field">
          <label for="mi-cost">Custo (R$)</label>
          <input type="number" id="mi-cost" value="${isEdit ? item.cost : 0}" step="0.01" min="0" />
        </div>
      </div>
      <label class="checkbox">
        <input type="checkbox" id="mi-avail" ${!isEdit || item.available ? 'checked' : ''} /> Disponível para venda
      </label>
    `, `
      <button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button>
      <button class="btn btn--primary" id="mi-save">${isEdit ? 'Salvar' : 'Adicionar'}</button>
    `);
    $('#mi-save').addEventListener('click', async () => {
      const data = {
        name: $('#mi-name').value.trim() || 'Item',
        description: $('#mi-desc').value.trim(),
        category: $('#mi-cat').value.trim() || 'Pratos',
        stock: parseInt($('#mi-stock').value, 10) || 0,
        price: parseFloat($('#mi-price').value) || 0,
        cost: parseFloat($('#mi-cost').value) || 0,
        available: $('#mi-avail').checked
      };
      try {
        if (isEdit) await Store.updateMenuItem(item.id, data);
        else await Store.addMenuItem(data);
        closeModal();
        await renderMenu();
      } catch (e) {
        alert(e.message);
      }
    });
  }

  window.__bfEditMenu = async (id) => {
    const items = await Store.getMenu();
    const item = items.find((x) => x.id === id);
    if (item) menuItemModal(item);
  };
  window.__bfDelMenu = async (id) => {
    if (confirm('Excluir este item do cardápio?')) {
      await Store.deleteMenuItem(id);
      await renderMenu();
    }
  };
  $('#btnNewItem').addEventListener('click', () => menuItemModal(null));

  // ============================================================
  // RENDER: ESTOQUE
  // ============================================================
  async function renderInventory() {
    const items = await Store.getInventory();
    const body = $('#inventoryBody');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">Sem itens</div></td></tr>';
    } else {
      body.innerHTML = items.map((i) => {
        const low = Number(i.qty) < Number(i.min);
        return `
          <tr>
            <td><strong>${escapeHTML(i.name)}</strong></td>
            <td>
              <input type="number" value="${i.qty}" min="0" onchange="window.__bfSetStock('${i.id}', this.value)" style="width:80px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg-elev)" />
              <small style="color:var(--ink-mute)"> ${escapeHTML(i.unit)}</small>
            </td>
            <td>${i.min} ${escapeHTML(i.unit)}</td>
            <td>
              <span class="status-pill ${low ? 'status-pill--cancelado' : 'status-pill--pronto'}">
                ${low ? 'Estoque baixo' : 'OK'}
              </span>
            </td>
            <td>${BRL(Number(i.cost))}</td>
            <td>
              <div class="actions">
                <button onclick="window.__bfRestock('${i.id}')" title="Repor">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>
                </button>
                <button class="del" onclick="window.__bfDelInventory('${i.id}')" title="Excluir insumo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
  window.__bfSetStock = async (id, val) => {
    await Store.updateInventory(id, { qty: parseFloat(val) || 0 });
    await renderInventory();
  };
  window.__bfRestock = async (id) => {
    const items = await Store.getInventory();
    const item = items.find((x) => x.id === id);
    if (!item) return;
    const qty = prompt(`Repor ${item.name}. Quantidade a adicionar (em ${item.unit}):`, '10');
    if (qty && !isNaN(qty)) {
      await Store.updateInventory(id, { qty: Number(item.qty) + parseFloat(qty) });
      await renderInventory();
    }
  };
  window.__bfDelInventory = async (id) => {
    if (!confirm('Excluir este insumo?')) return;
    await Store.deleteInventory(id);
    await renderInventory();
  };

  function newInventoryModal() {
    openModal('Novo insumo', `
      <div class="field"><label for="ni-name">Nome do insumo</label><input id="ni-name" type="text" /></div>
      <div class="field-row">
        <div class="field"><label for="ni-unit">Unidade</label><input id="ni-unit" type="text" value="un" placeholder="kg, un, L" /></div>
        <div class="field"><label for="ni-qty">Estoque atual</label><input id="ni-qty" type="number" min="0" step="0.01" value="0" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="ni-min">Estoque mínimo</label><input id="ni-min" type="number" min="0" step="0.01" value="0" /></div>
        <div class="field"><label for="ni-cost">Custo unitário (R$)</label><input id="ni-cost" type="number" min="0" step="0.01" value="0" /></div>
      </div>
    `, `<button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button><button class="btn btn--primary" id="ni-save">Adicionar insumo</button>`);
    $('#ni-save').addEventListener('click', async () => {
      const name = $('#ni-name').value.trim();
      if (!name) { alert('Digite o nome do insumo.'); return; }
      await Store.addInventory({
        name,
        unit: $('#ni-unit').value.trim() || 'un',
        qty: parseFloat($('#ni-qty').value) || 0,
        min: parseFloat($('#ni-min').value) || 0,
        cost: parseFloat($('#ni-cost').value) || 0
      });
      closeModal();
      await renderInventory();
    });
  }
  $('#btnNewInventory').addEventListener('click', newInventoryModal);

  // ============================================================
  // RENDER: CLIENTES
  // ============================================================
  async function renderCustomers() {
    const customers = await Store.getCustomers();
    const body = $('#customersBody');
    if (!customers.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">Sem clientes ainda</div></td></tr>';
    } else {
      body.innerHTML = customers.map((c) => `
        <tr>
          <td><strong>${escapeHTML(c.name)}</strong></td>
          <td>${escapeHTML(c.phone || '')}</td>
          <td>${escapeHTML(c.email || '')}</td>
          <td>${c.orders}</td>
          <td><strong>${BRL(Number(c.total))}</strong></td>
          <td>${escapeHTML(c.last_order || '')}</td>
          <td><div class="actions"><button onclick="window.__bfEditCustomer('${c.id}')" title="Editar cliente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="del" onclick="window.__bfDelCustomer('${c.id}')" title="Excluir cliente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button></div></td>
        </tr>
      `).join('');
    }
  }

  function newCustomerModal() {
    openModal('Novo cliente', `
      <div class="field">
        <label for="nc-name">Nome</label>
        <input type="text" id="nc-name" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="nc-phone">Telefone</label>
          <input type="tel" id="nc-phone" />
        </div>
        <div class="field">
          <label for="nc-email">E-mail</label>
          <input type="email" id="nc-email" />
        </div>
      </div>
    `, `
      <button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button>
      <button class="btn btn--primary" id="nc-save">Adicionar</button>
    `);
    $('#nc-save').addEventListener('click', async () => {
      const name = $('#nc-name').value.trim();
      if (!name) { alert('Digite o nome do cliente.'); return; }
      await Store.addCustomer({
        name,
        phone: $('#nc-phone').value.trim(),
        email: $('#nc-email').value.trim()
      });
      closeModal();
      await renderCustomers();
    });
  }
  $('#btnNewCustomer').addEventListener('click', newCustomerModal);

  window.__bfEditCustomer = async (id) => {
    const customer = (await Store.getCustomers()).find((item) => item.id === id);
    if (!customer) return;
    openModal('Editar cliente', `
      <div class="field"><label for="ec-name">Nome</label><input id="ec-name" type="text" value="${escapeHTML(customer.name)}" /></div>
      <div class="field-row"><div class="field"><label for="ec-phone">Telefone</label><input id="ec-phone" type="tel" value="${escapeHTML(customer.phone || '')}" /></div><div class="field"><label for="ec-email">E-mail</label><input id="ec-email" type="email" value="${escapeHTML(customer.email || '')}" /></div></div>
    `, `<button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button><button class="btn btn--primary" id="ec-save">Salvar</button>`);
    $('#ec-save').addEventListener('click', async () => {
      const name = $('#ec-name').value.trim();
      if (!name) { alert('Digite o nome do cliente.'); return; }
      await Store.updateCustomer(id, { name, phone: $('#ec-phone').value.trim() || null, email: $('#ec-email').value.trim() || null });
      closeModal();
      await renderCustomers();
    });
  };
  window.__bfDelCustomer = async (id) => {
    if (!confirm('Excluir este cliente? O histórico de pedidos não será apagado.')) return;
    await Store.deleteCustomer(id);
    await renderCustomers();
  };

  // ============================================================
  // RENDER: CONFIGURAÇÕES
  // ============================================================
  async function renderSettings() {
    const s = await Store.getSettings();
    $('#setName').value = s.restaurantName || userMeta.restaurant || '';
    $('#setWhats').value = s.whatsapp || '';
    $('#setNotif').checked = s.notifications !== false;
    $('#setAuto').checked = s.autoConfirm !== false;

    await renderPlanCard();
  }
  $('#btnSaveSettings').addEventListener('click', async () => {
    await Store.setSettings({
      restaurantName: $('#setName').value.trim(),
      whatsapp: $('#setWhats').value.trim(),
      notifications: $('#setNotif').checked,
      autoConfirm: $('#setAuto').checked
    });
    alert('Configurações salvas! ✓');
  });
  $('#btnResetData').addEventListener('click', async () => {
    if (!confirm('Isso vai apagar TODOS os seus dados: cardápio, pedidos, estoque e clientes. Continuar?')) return;
    const [items, orders, inventory, customers] = await Promise.all([
      Store.getMenu(), Store.getOrders(), Store.getInventory(), Store.getCustomers()
    ]);
    await Promise.all([
      ...items.map((item) => Store.deleteMenuItem(item.id)),
      ...orders.map((order) => Store.deleteOrder(order.id)),
      ...inventory.map((item) => Store.deleteInventory(item.id)),
      ...customers.map((customer) => Store.deleteCustomer(customer.id))
    ]);
    alert('Dados resetados com sucesso.');
    await render('overview');
  });

  // ============================================================
  // RENDER: dispatcher
  // ============================================================
  async function render(view) {
    try {
      switch (view) {
        case 'overview': await renderOverview(); break;
        case 'orders': await renderOrders(); break;
        case 'menu': await renderMenu(); break;
        case 'inventory': await renderInventory(); break;
        case 'customers': await renderCustomers(); break;
        case 'settings': await renderSettings(); break;
      }
    } catch (err) {
      console.error('[render]', err);
      alert('Erro ao carregar: ' + (err.message || err));
    }
  }

  // ============================================================
  // EXPORTAR RELATÓRIO
  // ============================================================
  function exportCSV(orders) {
    const csv = [
      ['ID', 'Cliente', 'Telefone', 'Itens', 'Canal', 'Total', 'Status', 'Criado em'],
      ...orders.map((o) => [o.id, o.customer, o.phone || '', o.items, o.channel, Number(o.total).toFixed(2), o.status, o.created_at])
    ].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bistroflow-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function exportPDF(orders) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const restName = userMeta.restaurant || 'Meu Restaurante';
    const today = new Date();
    const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === today.toDateString());
    const revenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
    const ticket = todayOrders.length ? revenue / todayOrders.length : 0;

    doc.setFontSize(18);
    doc.text(restName, 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Relatório gerado em ${today.toLocaleDateString('pt-BR')} às ${today.toLocaleTimeString('pt-BR')}`, 14, 27);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Faturamento hoje: ${BRL(revenue)}`, 14, 38);
    doc.text(`Pedidos hoje: ${todayOrders.length}`, 14, 45);
    doc.text(`Ticket médio: ${BRL(ticket)}`, 14, 52);

    doc.autoTable({
      startY: 60,
      head: [['Cliente', 'Itens', 'Canal', 'Total', 'Status', 'Data']],
      body: orders.map((o) => [
        o.customer,
        o.items,
        o.channel,
        BRL(Number(o.total)),
        o.status,
        new Date(o.created_at).toLocaleDateString('pt-BR')
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 30, 30] }
    });

    doc.save(`bistroflow-relatorio-${today.toISOString().slice(0, 10)}.pdf`);
  }

  $('#btnExport').addEventListener('click', async () => {
    const orders = await Store.getOrders();
    if (!orders.length) { alert('Nenhum pedido para exportar ainda.'); return; }
    openModal('Exportar relatório', `
      <p style="margin-bottom: var(--sp-4); color: var(--ink-soft)">Escolha o formato do relatório:</p>
    `, `
      <button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button>
      <button class="btn btn--ghost" id="exp-csv">Exportar CSV</button>
      <button class="btn btn--primary" id="exp-pdf">Exportar PDF</button>
    `);
    $('#exp-csv').addEventListener('click', () => { exportCSV(orders); closeModal(); });
    $('#exp-pdf').addEventListener('click', () => { exportPDF(orders); closeModal(); });
  });
  // primeira renderização
  await render('overview');
})();
