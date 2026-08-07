/* counters.js — anima métricas numéricas quando entram em viewport */
(function () {
  const reduce = utils.prefersReducedMotion();
  const els = $$('[data-counter]');
  if (!els.length) return;

  const animate = (el) => {
    const to = parseFloat(el.dataset.to || '0');
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const isMoney = el.parentElement?.classList.contains('metric');
    const duration = 1400;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const e = 1 - Math.pow(1 - t, 3);
      const v = to * e;
      el.textContent = prefix + (isMoney ? utils.formatBRL(v) : Math.round(v).toString()) + suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    if (reduce) {
      el.textContent = prefix + (isMoney ? utils.formatBRL(to) : to.toString()) + suffix;
    } else {
      requestAnimationFrame(tick);
    }
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    els.forEach((el) => io.observe(el));
  } else {
    els.forEach(animate);
  }
})();
