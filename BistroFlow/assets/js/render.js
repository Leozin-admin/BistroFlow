/* render.js — injeta conteúdo dinâmico vindo de content.js */
(function () {
  const data = window.SITE_DATA || {};
  const esc = utils.escapeHTML;

  // LOGOS
  const logosGrid = $('#logosGrid');
  if (logosGrid && data.logos) {
    logosGrid.innerHTML = data.logos.map((l) => `
      <div class="logo">
        <span class="logo__mark"></span>
        <span class="logo__text">${esc(l.name)}</span>
      </div>
    `).join('');
  }

  // DEMO LIST
  const demoList = $('#demoList');
  if (demoList && data.demoList) {
    demoList.innerHTML = data.demoList.map((d) => `
      <li>
        <span class="check">✓</span>
        <div>
          <strong>${esc(d.title)}</strong>
          <p>${esc(d.text)}</p>
        </div>
      </li>
    `).join('');
  }

  // PANEL ORDERS
  const panelOrders = $('#panelOrders');
  if (panelOrders && data.panelOrders) {
    panelOrders.innerHTML = data.panelOrders.map((o) => `
      <li class="porder">
        <div class="porder__avatar">${esc(o.name.charAt(0))}</div>
        <div class="porder__body">
          <div class="porder__top">
            <strong>${esc(o.name)}</strong>
            <span>${esc(o.time)}</span>
          </div>
          <div class="porder__item">${esc(o.item)}</div>
          <div class="porder__bot">
            <span class="porder__status porder__status--${esc(o.status.replace(/\s/g, '-'))}">${esc(o.status)}</span>
            <span class="porder__value">R$ ${utils.formatBRL(o.value)}</span>
          </div>
        </div>
      </li>
    `).join('');
  }

  // CASES
  const casesGrid = $('#casesGrid');
  if (casesGrid && data.cases) {
    casesGrid.innerHTML = data.cases.map((c) => `
      <article class="case reveal" data-reveal data-tone="${esc(c.tone)}">
        <div class="case__tag">${esc(c.tag)}</div>
        <h3 class="case__title">${esc(c.title)}</h3>
        <p class="case__quote">${esc(c.quote)}</p>
        <div class="case__metric">
          <span class="case__metric-value">${esc(c.metric)}</span>
          <span class="case__metric-label">${esc(c.metricLabel)}</span>
        </div>
      </article>
    `).join('');
    // re-observa os novos elementos
    const fresh = casesGrid.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window && !utils.prefersReducedMotion()) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const delay = e.target.dataset.revealDelay || 0;
            e.target.style.setProperty('--reveal-delay', `${delay}ms`);
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12 });
      fresh.forEach((el) => io.observe(el));
    } else {
      fresh.forEach((el) => el.classList.add('is-in'));
    }
  }

  // PRICING
  const pricingGrid = $('#pricingGrid');
  if (pricingGrid && data.pricing) {
    pricingGrid.innerHTML = data.pricing.map((p, i) => `
      <article class="price reveal ${p.featured ? 'price--featured' : ''}" data-reveal ${p.featured ? '' : `data-reveal-delay="${i * 100}"`} data-plan-id="${esc(p.id)}">
        ${p.featured ? '<span class="price__flag">Mais escolhido</span>' : ''}
        <h3 class="price__name">${esc(p.name)}</h3>
        <p class="price__tag">${esc(p.tagline)}</p>
        <div class="price__value">
          <span class="price__currency">R$</span>
          <span class="price__num" data-counter data-to="${p.price}">${p.price}</span>
          <span class="price__period">${esc(p.period)}</span>
        </div>
        <a href="cadastro.html?plan=${esc(p.id)}" class="btn ${p.featured ? 'btn--primary' : 'btn--ghost'} btn--block">${esc(p.cta)}</a>
        <ul class="price__list">
          ${p.features.map((f) => `<li><span class="check">✓</span> ${esc(f)}</li>`).join('')}
        </ul>
      </article>
    `).join('');
    // re-anima os contadores
    const counters = pricingGrid.querySelectorAll('[data-counter]');
    counters.forEach((el) => {
      // o counters.js já roda, mas eles estão fora da viewport inicialmente — forçar animação
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const to = parseFloat(e.target.dataset.to);
            const dur = 1200;
            const start = performance.now();
            const step = (now) => {
              const t = Math.min(1, (now - start) / dur);
              const ease = 1 - Math.pow(1 - t, 3);
              e.target.textContent = Math.round(to * ease);
              if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.4 });
      io.observe(el);
    });
    // reveal dos cards
    const fresh = pricingGrid.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window && !utils.prefersReducedMotion()) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const delay = e.target.dataset.revealDelay || 0;
            e.target.style.setProperty('--reveal-delay', `${delay}ms`);
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12 });
      fresh.forEach((el) => io.observe(el));
    } else {
      fresh.forEach((el) => el.classList.add('is-in'));
    }
  }

  // FAQ
  const faqList = $('#faqList');
  if (faqList && data.faq) {
    faqList.innerHTML = data.faq.map((f, i) => `
      <details class="faq__item" ${i === 0 ? 'open' : ''}>
        <summary>
          <span>${esc(f.q)}</span>
          <span class="faq__plus" aria-hidden="true"></span>
        </summary>
        <div class="faq__answer"><p>${esc(f.a)}</p></div>
      </details>
    `).join('');
  }
})();
