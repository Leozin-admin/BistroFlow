/* main.js — bootstrap final, health check, eventos globais */
(function () {
  // só dispara quando DOM e fontes estão prontas
  const ready = () => document.documentElement.classList.add('is-ready');
  if (document.readyState !== 'loading') ready();
  else document.addEventListener('DOMContentLoaded', ready);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(ready);
  }

  // year fallback
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((error) => {
        console.warn('[BistroFlow] Service worker não registrado:', error);
      });
    });
  }
})();
