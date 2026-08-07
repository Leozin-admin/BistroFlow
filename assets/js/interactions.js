/* interactions.js — formulário de CTA, faq toggle, misc */
(function () {
  // ===== Form CTA =====
  const form = $('#ctaForm');
  const msg  = $('#ctaMsg');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const value = input.value.trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      if (!ok) {
        msg.textContent = 'Hmm, esse e-mail não parece válido. Dá uma olhadinha?';
        msg.style.color = 'var(--bad)';
        input.focus();
        return;
      }
      msg.textContent = 'Pronto! Em 15 minutos o Bistro te chama no e-mail. ✨';
      msg.style.color = 'var(--ok)';
      form.reset();

      // confete simples
      confettiBurst();
    });
  }

  // ===== Confete leve (DOM-only) =====
  function confettiBurst() {
    const reduce = utils.prefersReducedMotion();
    if (reduce) return;
    const colors = ['#FF5B1F', '#FFB089', '#1F9D55', '#0E0E0C'];
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    document.body.appendChild(wrap);
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('span');
      s.style.background = colors[i % colors.length];
      s.style.left = (Math.random() * 100) + 'vw';
      s.style.animationDelay = (Math.random() * 200) + 'ms';
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(s);
    }
    setTimeout(() => wrap.remove(), 2400);
  }

  // ===== Tilt 3D nos tcards =====
  const tcards = $$('.tcard');
  if (tcards.length && !utils.prefersReducedMotion()) {
    tcards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width  - 0.5;
        const y = (e.clientY - r.top)  / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }
})();
