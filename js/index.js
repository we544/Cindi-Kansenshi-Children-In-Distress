/* ============================================================
   CINDI Kansenshi — Homepage JS
   ============================================================ */
(function () {
  // Parallax hero background on scroll
  const heroBg = document.querySelector('.hero-bg');
  if (heroBg) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      heroBg.style.transform = `translateY(${y * 0.35}px)`;
    }, { passive: true });
  }
})();
