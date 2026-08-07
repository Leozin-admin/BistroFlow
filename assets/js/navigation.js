/* navigation.js — header ao rolar, menu mobile, FAB voltar ao topo */
(function () {
  const nav    = $('#nav');
  const burger = $('#navBurger');
  const fab    = $('#fab');
  const links  = $$('.nav__links a');

  // header encolhe/sombra ao rolar
  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('is-scrolled', y > 16);
    if (fab) fab.classList.toggle('is-visible', y > 600);
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // menu mobile
  if (burger) {
    burger.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    });
    links.forEach((l) => l.addEventListener('click', () => {
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }));
  }

  // FAB scrollTop
  if (fab) {
    fab.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: utils.prefersReducedMotion() ? 'auto' : 'smooth' });
    });
  }

  // ano no footer
  const y = $('#year');
  if (y) y.textContent = new Date().getFullYear();
})();
