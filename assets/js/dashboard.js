/* dashboard.js — UI do painel + CRUDs + navegação entre views */
(function () {
  // ===== auth guard =====
  const session = Auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  Store.seedMenuIfEmpty();
  Store.seedOrdersIfEmpty();
  Store.seedCustomersIfEmpty();
  Store.seedInventoryIfEmpty();

  // ===== user info =====
  $('#userName').textContent  = session.name;
  $('#userRest').textContent  = session.restaurant || '—';
  $('#userAvatar').textContent = session.name.charAt(0).toUpperCase();
  $('#helloName').textContent = session.name.split(' ')[0];

  const logoutBtn = $('#logoutBtn');
  logoutBtn.addEventListener('click', () => {
    Auth.logout();
    window.location.href = 'index.html';
  });

  // ===== navegação entre views =====
  const navButtons = $$('#dashNav button');
  const views = $$('.dash__view');
  const goto = (name) => {
    navButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
    views.forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
    render(name);
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
  const modalBody  = $('#modalBody');
  const modalFoot  = $('#modalFoot');
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

  // ===== orders badge =====
  const refreshBadge = () => {
    const open = (Store.getOrders() || []).filter((o) => o.status !== 'entregue' && o.status !== 'cancelado').length;
    $('#badgeOrders').textContent = open;
  };

  // ============================================================
  // RENDER: VISÃO GERAL
  // ============================================================
  function renderOverview() {
    const orders = Store.getOrders() || [];
    const today = new Date().toDateString();
    const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today);
    const revenue = todayOrders.reduce((s, o) => s + o.total, 0);
    const ticket  = todayOrders.length ? revenue / todayOrders.length : 0;

    $('#mRevenue').textContent = BRL(revenue);
    $('#mOrders').textContent  = todayOrders.length;
    $('#mTicket').textContent  = BRL(ticket);

    // chart: vendas últimos 7 dias (simulado)
    const data = [320, 540, 410, 680, 590, 720, revenue || 480];
    const max = Math.max(...data);
    $('#chartBars').innerHTML = data.map((v, i) => {
      const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Hoje'];
      return `<div class="chart__bar" style="height:${(v / max) * 100}%" data-label="${labels[i]}" title="${BRL(v)}"></div>`;
    }).join('');

    // pedidos recentes
    const recent = orders.slice(0, 5);
    $('#recentOrders').innerHTML = recent.length ? recent.map((o) => `
      <tr>
        <td><strong>${escapeHTML(o.customer)}</strong></td>
        <td>${escapeHTML(o.items)}</td>
        <td>${BRL(o.total)}</td>
        <td><span class="status-pill status-pill--${o.status}">${o.status}</span></td>
      </tr>
    `).join('') : '<tr><td colspan="4"><div class="empty"><div class="empty__icon">📭</div>Sem pedidos ainda</div></td></tr>';

    refreshBadge();
  }

  // ============================================================
  // RENDER: PEDIDOS
  // ============================================================
  function renderOrders() {
    const orders = Store.getOrders() || [];
    const body = $('#ordersBody');
    if (!orders.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty"><div class="empty__icon">📭</div>Nenhum pedido ainda. Que sorte!</div></td></tr>';
    } else {
      body.innerHTML = orders.map((o) => `
        <tr>
          <td><code>${o.id.toUpperCase()}</code></td>
          <td><strong>${escapeHTML(o.customer)}</strong><br><small style="color:var(--ink-mute)">${escapeHTML(o.phone)}</small></td>
          <td>${escapeHTML(o.items)}</td>
          <td>${escapeHTML(o.channel)}</td>
          <td><strong>${BRL(o.total)}</strong></td>
          <td>
            <select onchange="window.__bfSetStatus('${o.id}', this.value)" style="padding:6px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg-elev);font-size:12px">
              <option value="novo"       ${o.status==='novo'?'selected':''}>Novo</option>
              <option value="confirmado" ${o.status==='confirmado'?'selected':''}>Confirmado</option>
              <option value="preparando" ${o.status==='preparando'?'selected':''}>Preparando</option>
              <option value="pronto"     ${o.status==='pronto'?'selected':''}>Pronto</option>
              <option value="entregue"   ${o.status==='entregue'?'selected':''}>Entregue</option>
              <option value="cancelado"  ${o.status==='cancelado'?'selected':''}>Cancelado</option>
            </select>
          </td>
          <td>${timeAgo(o.createdAt)}</td>
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
    refreshBadge();
  }

  window.__bfSetStatus = (id, status) => {
    Store.updateOrderStatus(id, status);
    renderOrders();
  };
  window.__bfDelOrder = (id) => {
    if (confirm('Excluir este pedido?')) {
      Store.deleteOrder(id);
      renderOrders();
    }
  };

  // modal de novo pedido
  function newOrderModal() {
    const menu = Store.getMenu() || [];
    openModal('Novo pedido', `
      <div class="field">
        <label>Nome do cliente</label>
        <input type="text" id="np-customer" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Telefone</label>
          <input type="tel" id="np-phone" />
        </div>
        <div class="field">
          <label>Canal</label>
          <select id="np-channel" style="padding:14px 16px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--bg-elev)">
            <option value="balcao">Balcão</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="ifood">iFood</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>Itens (separe por vírgula)</label>
        <input type="text" id="np-items" placeholder="2x Pizza Margherita, 1x Coca" />
      </div>
      <div class="field">
        <label>Total (R$)</label>
        <input type="number" id="np-total" step="0.01" min="0" />
      </div>
    `, `
      <button class="btn btn--ghost" onclick="document.getElementById('modal').classList.remove('is-open')">Cancelar</button>
      <button class="btn btn--primary" id="np-save">Criar pedido</button>
    `);
    $('#np-save').addEventListener('click', () => {
      const o = {
        customer: $('#np-customer').value.trim() || 'Cliente',
        phone:    $('#np-phone').value.trim() || '—',
        items:    $('#np-items').value.trim() || '—',
        total:    parseFloat($('#np-total').value) || 0,
        channel:  $('#np-channel').value,
        status:   'novo'
      };
      Store.addOrder(o);
      closeModal();
      renderOrders();
    });
  }
  $('#btnNewOrder').addEventListener('click', newOrderModal);
  $('#btnNewOrder2').addEventListener('click', newOrderModal);

  // ============================================================
  // RENDER: CARDÁPIO
  // ============================================================
  function renderMenu() {
    const items = Store.getMenu() || [];
    const body = $('#menuBody');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty__icon">🍽️</div>Cardápio vazio. Adicione seu primeiro item!</div></td></tr>';
    } else {
      body.innerHTML = items.map((i) => {
        const margin = i.price > 0 ? Math.round(((i.price - i.cost) / i.price) * 100) : 0;
        return `
          <tr>
            <td>
              <strong>${escapeHTML(i.name)}</strong>
              ${i.description ? `<br><small style="color:var(--ink-mute)">${escapeHTML(i.description).slice(0, 60)}${i.description.length > 60 ? '...' : ''}</small>` : ''}
            </td>
            <td>${escapeHTML(i.category)}</td>
            <td><strong>${BRL(i.price)}</strong></td>
            <td>${BRL(i.cost)}</td>
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
        <label>Nome</label>
        <input type="text" id="mi-name" value="${isEdit ? escapeHTML(item.name) : ''}" />
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" id="mi-desc" value="${isEdit ? escapeHTML(item.description) : ''}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Categoria</label>
          <input type="text" id="mi-cat" value="${isEdit ? escapeHTML(item.category) : 'Pratos'}" />
        </div>
        <div class="field">
          <label>Estoque</label>
          <input type="number" id="mi-stock" value="${isEdit ? item.stock : 100}" min="0" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Preço (R$)</label>
          <input type="number" id="mi-price" value="${isEdit ? item.price : 0}" step="0.01" min="0" />
        </div>
        <div class="field">
          <label>Custo (R$)</label>
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
    $('#mi-save').addEventListener('click', () => {
      const data = {
        name:        $('#mi-name').value.trim() || 'Item',
        description: $('#mi-desc').value.trim(),
        category:    $('#mi-cat').value.trim() || 'Pratos',
        stock:       parseInt($('#mi-stock').value, 10) || 0,
        price:       parseFloat($('#mi-price').value) || 0,
        cost:        parseFloat($('#mi-cost').value) || 0,
        available:   $('#mi-avail').checked
      };
      if (isEdit) Store.updateMenuItem(item.id, data);
      else Store.addMenuItem(data);
      closeModal();
      renderMenu();
    });
  }

  window.__bfEditMenu = (id) => {
    const item = (Store.getMenu() || []).find((x) => x.id === id);
    if (item) menuItemModal(item);
  };
  window.__bfDelMenu = (id) => {
    if (confirm('Excluir este item do cardápio?')) {
      Store.deleteMenuItem(id);
      renderMenu();
    }
  };
  $('#btnNewItem').addEventListener('click', () => menuItemModal(null));

  // ============================================================
  // RENDER: ESTOQUE
  // ============================================================
  function renderInventory() {
    const items = Store.getInventory() || [];
    const body = $('#inventoryBody');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">Sem itens</div></td></tr>';
    } else {
      body.innerHTML = items.map((i) => {
        const low = i.qty < i.min;
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
            <td>${BRL(i.cost)}</td>
            <td>
              <div class="actions">
                <button onclick="window.__bfRestock('${i.id}')" title="Repor">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
  window.__bfSetStock = (id, val) => {
    Store.updateInventory(id, { qty: parseFloat(val) || 0 });
    renderInventory();
  };
  window.__bfRestock = (id) => {
    const item = (Store.getInventory() || []).find((x) => x.id === id);
    if (!item) return;
    const qty = prompt(`Repor ${item.name}. Quantidade a adicionar (em ${item.unit}):`, '10');
    if (qty && !isNaN(qty)) {
      Store.updateInventory(id, { qty: item.qty + parseFloat(qty) });
      renderInventory();
    }
  };

  // ============================================================
  // RENDER: CLIENTES
  // ============================================================
  function renderCustomers() {
    const customers = Store.getCustomers() || [];
    const body = $('#customersBody');
    if (!customers.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty">Sem clientes ainda</div></td></tr>';
    } else {
      body.innerHTML = customers.map((c) => `
        <tr>
          <td><strong>${escapeHTML(c.name)}</strong></td>
          <td>${escapeHTML(c.phone)}</td>
          <td>${escapeHTML(c.email)}</td>
          <td>${c.orders}</td>
          <td><strong>${BRL(c.total)}</strong></td>
          <td>${escapeHTML(c.lastOrder)}</td>
        </tr>
      `).join('');
    }
  }

  // ============================================================
  // RENDER: CONFIGURAÇÕES
  // ============================================================
  function renderSettings() {
    const s = Store.getSettings();
    $('#setName').value  = s.restaurantName || session.restaurant || '';
    $('#setWhats').value = s.whatsapp || '';
    $('#setNotif').checked = s.notifications !== false;
    $('#setAuto').checked  = s.autoConfirm !== false;
  }
  $('#btnSaveSettings').addEventListener('click', () => {
    Store.setSettings({
      restaurantName: $('#setName').value.trim(),
      whatsapp:       $('#setWhats').value.trim(),
      notifications:  $('#setNotif').checked,
      autoConfirm:    $('#setAuto').checked
    });
    alert('Configurações salvas! ✓');
  });
  $('#btnResetData').addEventListener('click', () => {
    if (confirm('Isso vai apagar todos os dados de demo. Continuar?')) {
      Object.values(Store.getMenu() || []).forEach((i) => Store.deleteMenuItem(i.id));
      // re-seed
      ['menu', 'orders', 'customers', 'inventory'].forEach((k) => localStorage.removeItem({
        menu: KEYS_REF.menu, orders: KEYS_REF.orders, customers: KEYS_REF.customers, inventory: KEYS_REF.inventory
      }[k]));
      Store.seedMenuIfEmpty();
      Store.seedOrdersIfEmpty();
      Store.seedCustomersIfEmpty();
      Store.seedInventoryIfEmpty();
      render('overview');
      alert('Dados resetados!');
    }
  });

  // acesso às chaves do store pro reset
  const KEYS_REF = {
    menu: 'bf_menu', orders: 'bf_orders', customers: 'bf_customers', inventory: 'bf_inventory'
  };

  // ============================================================
  // RENDER: dispatcher
  // ============================================================
  function render(view) {
    switch (view) {
      case 'overview':   renderOverview();  break;
      case 'orders':     renderOrders();    break;
      case 'menu':       renderMenu();      break;
      case 'inventory':  renderInventory(); break;
      case 'customers':  renderCustomers(); break;
      case 'settings':   renderSettings();  break;
    }
  }

  // ============================================================
  // EXPORTAR RELATÓRIO
  // ============================================================
  $('#btnExport').addEventListener('click', () => {
    const orders = Store.getOrders() || [];
    const csv = [
      ['ID', 'Cliente', 'Telefone', 'Itens', 'Canal', 'Total', 'Status', 'Criado em'],
      ...orders.map((o) => [o.id, o.customer, o.phone, o.items, o.channel, o.total.toFixed(2), o.status, o.createdAt])
    ].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bistroflow-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  // primeira renderização
  render('overview');
})();
