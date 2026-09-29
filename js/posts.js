/* ============================================================
   CINDI Kansenshi — Posts JS (search + filter + reading modal)
   ============================================================ */
(async function () {
  'use strict';
  await window.CindiContentReady;

  /* ── ELEMENTS ─────────────────────────────────── */
  const filters     = document.querySelectorAll('.p-filter');
  const allCards    = document.querySelectorAll('.post-card');
  const featuredPost= document.querySelector('.featured-post');
  const noResults   = document.getElementById('postsNoResults');
  const searchInput = document.getElementById('postSearch');
  const clearBtn    = document.getElementById('clearSearch');

  const modal       = document.getElementById('postModal');
  const pmBackdrop  = document.getElementById('pmBackdrop');
  const pmClose     = document.getElementById('pmClose');
  const pmMeta      = document.getElementById('pmMeta');
  const pmTitle     = document.getElementById('pmTitle');
  const pmBody      = document.getElementById('pmBody');
  const pmPanel     = document.getElementById('pmPanel');

  let activeCategory = 'all';
  let searchQuery    = '';

  /* ── FILTER + SEARCH LOGIC ─────────────────────── */
  function applyFilters() {
    let visible = 0;

    // Handle featured post
    if (featuredPost) {
      const cat   = featuredPost.dataset.cat || '';
      const title = (featuredPost.dataset.title || '').toLowerCase();
      const body  = featuredPost.textContent.toLowerCase();
      const catOk = activeCategory === 'all' || cat === activeCategory;
      const srchOk= !searchQuery || title.includes(searchQuery) || body.includes(searchQuery);
      const show  = catOk && srchOk;
      featuredPost.closest('section').style.display = show ? '' : 'none';
      if (show) visible++;
    }

    allCards.forEach(card => {
      const cat   = card.dataset.cat || '';
      const title = (card.dataset.title || '').toLowerCase();
      const body  = card.textContent.toLowerCase();
      const catOk = activeCategory === 'all' || cat === activeCategory;
      const srchOk= !searchQuery || title.includes(searchQuery) || body.includes(searchQuery);
      const show  = catOk && srchOk;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    noResults.style.display = visible === 0 ? 'flex' : 'none';
  }

  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      activeCategory = 'all';
      filters.forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
      applyFilters();
    });
  }

  /* ── READING MODAL ─────────────────────────────── */
  function openPost(el) {
    const title  = el.dataset.title  || '';
    const author = el.dataset.author || '';
    const date   = el.dataset.date   || '';
    const read   = el.dataset.read   || '';
    const full   = el.dataset.full   || '<p>Coming soon.</p>';
    const cat    = el.dataset.cat    || '';

    // Build meta row
    const tagClass = 'post-tag post-tag-' + cat.replace(/\s+/g, '-');
    const tagLabel = cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    pmMeta.innerHTML = `
      <span class="${tagClass}">${tagLabel}</span>
      <span class="post-meta-item"><i class="fas fa-user"></i> ${author}</span>
      <span class="post-meta-item"><i class="fas fa-calendar"></i> ${date}</span>
      <span class="post-meta-item"><i class="fas fa-clock"></i> ${read}</span>
    `;
    pmTitle.textContent = title;
    pmBody.innerHTML    = full;
    pmPanel.scrollTop   = 0;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closePost() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Open from post cards
  allCards.forEach(card => {
    card.addEventListener('click', () => openPost(card));
  });

  // Open from featured post
  if (featuredPost) {
    featuredPost.addEventListener('click', () => openPost(featuredPost));
  }

  // Open from "Read" buttons (stop propagation not needed — parent click works)
  document.querySelectorAll('.read-post-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const parent = btn.closest('[data-title]');
      if (parent) openPost(parent);
    });
  });

  pmClose.addEventListener('click', closePost);
  pmBackdrop.addEventListener('click', closePost);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closePost();
  });

})();
