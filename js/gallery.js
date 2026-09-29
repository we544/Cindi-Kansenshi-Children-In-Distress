/* ============================================================
   CINDI Kansenshi — Gallery JS (filter + lightbox)
   ============================================================ */
(async function () {
  'use strict';
  await window.CindiContentReady;

  /* ── FILTER ──────────────────────────────────── */
  const filters  = document.querySelectorAll('.g-filter');
  const items    = document.querySelectorAll('.g-item');
  const noResult = document.getElementById('galleryNoResults');

  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      let visible = 0;
      items.forEach(item => {
        const show = cat === 'all' || item.dataset.cat === cat;
        item.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      noResult.style.display = visible === 0 ? 'block' : 'none';
    });
  });

  /* ── LIGHTBOX ────────────────────────────────── */
  const lightbox  = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lbImg');
  const lbVideo   = document.getElementById('lbVideo');
  const lbEmbed   = document.getElementById('lbEmbed');
  const lbTitle   = document.getElementById('lbTitle');
  const lbDate    = document.getElementById('lbDate');
  const lbClose   = document.getElementById('lbClose');
  const lbPrev    = document.getElementById('lbPrev');
  const lbNext    = document.getElementById('lbNext');
  const lbBackdrop= document.getElementById('lbBackdrop');

  let visibleItems = [];
  let currentIdx   = 0;

  function getVisible() {
    return [...items].filter(i => i.style.display !== 'none');
  }

  function openLightbox(item) {
    visibleItems = getVisible();
    currentIdx   = visibleItems.indexOf(item);
    showLightboxItem(currentIdx);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function stopMedia() {
    lbVideo.pause();
    lbVideo.removeAttribute('src');
    lbVideo.load();
    lbVideo.style.display = 'none';
    lbEmbed.src = '';
    lbEmbed.style.display = 'none';
    lbImg.style.display = '';
  }

  function showLightboxItem(idx) {
    const item = visibleItems[idx];
    if (!item) return;
    stopMedia();
    lbTitle.textContent = item.dataset.title || '';
    lbDate.textContent  = item.dataset.date  || '';

    if (item.dataset.type === 'video') {
      const ref = item.dataset.video || '';
      const kind = item.dataset.videoKind || 'file';
      if (kind === 'embed') {
        lbImg.style.display = 'none';
        lbEmbed.style.display = '';
        lbEmbed.src = ref;
      } else {
        lbImg.style.display = 'none';
        lbVideo.style.display = '';
        if (ref.indexOf('idb:') === 0 && window.CindiMediaStore) {
          window.CindiMediaStore.getObjectURL(ref.slice(4)).then(url => { if (url) lbVideo.src = url; });
        } else {
          lbVideo.src = ref;
        }
      }
    } else {
      const img = item.querySelector('img');
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lbImg.style.opacity = '0';
      setTimeout(() => { lbImg.style.opacity = '1'; }, 50);
    }

    // Prev/next visibility
    lbPrev.style.opacity = idx === 0 ? '0.3' : '1';
    lbNext.style.opacity = idx === visibleItems.length - 1 ? '0.3' : '1';
  }

  function closeLightbox() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    stopMedia();
  }

  items.forEach(item => {
    item.addEventListener('click', () => openLightbox(item));
  });

  lbClose.addEventListener('click', closeLightbox);
  lbBackdrop.addEventListener('click', closeLightbox);

  lbPrev.addEventListener('click', () => {
    if (currentIdx > 0) { currentIdx--; showLightboxItem(currentIdx); }
  });
  lbNext.addEventListener('click', () => {
    if (currentIdx < visibleItems.length - 1) { currentIdx++; showLightboxItem(currentIdx); }
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  lbPrev.click();
    if (e.key === 'ArrowRight') lbNext.click();
  });

  // Touch swipe support
  let touchStartX = 0;
  lightbox.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend',   e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? lbNext.click() : lbPrev.click();
  });

})();
