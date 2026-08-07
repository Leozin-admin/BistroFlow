/* animations.js — scroll reveal, smooth scroll, cursor customizado */
(function () {
  const reduce = utils.prefersReducedMotion();

  // ===== Cursor customizado =====
  const dot  = $('#cursorDot');
  const ring = $('#cursorRing');
  let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0;

  if (dot && ring && !reduce && matchMedia('(hover: hover)').matches) {
    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    });

    const loop = () => {
      ringX += (mouseX - ringX) * 0.18;
      ringY += (mouseY - ringY) * 0.18;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    };
    loop();

    // hover state
    $$('a, button, [data-link]').forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('is-hover'));
    });
  }

  // ===== Scroll reveal =====
  const revealItems = $$('[data-reveal]');
  if (reduce) {
    revealItems.forEach((el) => el.classList.add('is-in'));
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = entry.target.dataset.revealDelay || 0;
            entry.target.style.setProperty('--reveal-delay', `${delay}ms`);
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    revealItems.forEach((el) => io.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add('is-in'));
  }

  // ===== Smooth scroll para [data-link] âncoras =====
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length <= 1) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // ===== Parallax sutil nos glows do hero =====
  const glowA = document.querySelector('.hero__glow--a');
  const glowB = document.querySelector('.hero__glow--b');
  if (glowA && glowB && !reduce) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      glowA.style.transform = `translate3d(${y * -0.04}px, ${y * -0.08}px, 0)`;
      glowB.style.transform = `translate3d(${y *  0.06}px, ${y * -0.05}px, 0)`;
    }, { passive: true });
  }
})();
