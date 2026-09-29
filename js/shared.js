/* ============================================================
   CINDI Kansenshi — Shared JavaScript
   ============================================================ */

(async function () {
  'use strict';

  window.CindiContentReady = (async function () {
    try {
    const response = await fetch('/api/content', { credentials: 'same-origin' });
    if (response.ok) {
      const content = await response.json();
      const keys = { stats: 'cindi_site_stats', news: 'cindi_news_posts', gallery: 'cindi_gallery', posts: 'cindi_posts', documents: 'cindi_documents' };
      Object.entries(keys).forEach(([key, storageKey]) => {
        const value = content[key];
        if (value !== null && value !== undefined) localStorage.setItem(storageKey, JSON.stringify(value));
      });
    }
    } catch (err) { /* Static hosting keeps using the browser's local copy. */ }
  })();
  await window.CindiContentReady;

  /* ── SCROLL PROGRESS BAR ────────────────────────── */
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  document.body.appendChild(progress);
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const height = h.scrollHeight - h.clientHeight;
    progress.style.width = height > 0 ? (scrolled / height * 100) + '%' : '0%';
  }, { passive: true });

  /* ── BACK TO TOP ─────────────────────────────────── */
  const toTop = document.createElement('button');
  toTop.className = 'back-to-top';
  toTop.setAttribute('aria-label', 'Back to top');
  toTop.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
  document.body.appendChild(toTop);
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('visible', window.scrollY > 500);
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ── TOAST NOTIFICATIONS (window.CindiToast) ────── */
  const toastStack = document.createElement('div');
  toastStack.className = 'toast-stack';
  toastStack.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastStack);
  const ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  window.CindiToast = function (message, type) {
    type = type || 'success';
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    const icon = document.createElement('i');
    icon.className = 'fas ' + (ICONS[type] || ICONS.info);
    const span = document.createElement('span');
    span.textContent = message; // textContent only — never innerHTML with dynamic text
    el.appendChild(icon);
    el.appendChild(span);
    toastStack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 3600);
  };

  /* ── IMAGE LOAD STATE (clears skeleton shimmer) ─── */
  document.querySelectorAll('img[loading="lazy"]').forEach(img => {
    if (img.complete) img.classList.add('loaded');
    else img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
  });

  /* ── DISCREET STAFF LOGIN FOOTER LINK ───────────── */
  const footerBottom = document.querySelector('.footer-bottom');
  if (footerBottom && !window.location.pathname.endsWith('admin.html')) {
    const p = footerBottom.querySelector('p:last-child') || footerBottom;
    const link = document.createElement('a');
    link.href = 'admin.html';
    link.className = 'footer-admin-link';
    link.textContent = 'Staff Login';
    p.appendChild(document.createTextNode(' \u00B7 '));
    p.appendChild(link);
  }

  /* ── DOCUMENTS NAV/FOOTER LINK (auto-added to every page) ── */
  (function addDocumentsLinks() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks && !navLinks.querySelector('a[href="documents.html"]')) {
      const donateLi = navLinks.querySelector('.nav-donate-btn')?.closest('li');
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = 'documents.html';
      a.textContent = 'Documents';
      li.appendChild(a);
      if (donateLi) navLinks.insertBefore(li, donateLi); else navLinks.appendChild(li);
    }
    const navCol = document.querySelector('.footer-col ul');
    if (navCol && !navCol.querySelector('a[href="documents.html"]')) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = 'documents.html';
      a.textContent = 'Documents';
      li.appendChild(a);
      navCol.appendChild(li);
    }
  })();

  /* ── LIVE STAT OVERRIDES FROM ADMIN DASHBOARD ───── */
  try {
    const saved = JSON.parse(localStorage.getItem('cindi_site_stats') || 'null');
    if (saved) {
      document.querySelectorAll('[data-stat-key]').forEach(el => {
        const key = el.dataset.statKey;
        if (saved[key] !== undefined && !isNaN(parseFloat(saved[key]))) {
          el.dataset.target = saved[key];
        }
      });
    }
  } catch (err) { /* corrupt local data should never break the public site */ }

  /* ── RESOLVE idb: REFERENCES TO ON-DEVICE BLOB URLS ──
     Uploaded photos/videos/documents are referenced as "idb:<id>"
     instead of a real URL. We create the element with a normal
     src/href up front (so layout/filtering work immediately), then
     swap in the real blob URL a moment later once IndexedDB responds. */
  function resolveMediaRef(ref, applyFn) {
    if (!ref) return;
    if (ref.indexOf('idb:') === 0 && window.CindiMediaStore) {
      window.CindiMediaStore.getObjectURL(ref.slice(4)).then(url => {
        if (url) applyFn(url);
      }).catch(() => {});
    } else {
      applyFn(ref);
    }
  }

  /* ── SEED LOCAL STORAGE ON FIRST VISIT ──────────────
     If a content array has never been saved before, initialize it
     from the site's original content (js/seed-data.js) so the
     admin dashboard has real, editable/deletable rows from the
     start instead of just an "add new" form on top of static HTML. */
  function seedIfMissing(key, seedArray) {
    if (localStorage.getItem(key) === null && Array.isArray(seedArray)) {
      localStorage.setItem(key, JSON.stringify(seedArray));
    }
  }
  if (window.CindiSeed) {
    seedIfMissing('cindi_news_posts', window.CindiSeed.news);
    seedIfMissing('cindi_gallery', window.CindiSeed.gallery);
    seedIfMissing('cindi_posts', window.CindiSeed.posts);
  }

  /* ── NEWS: FULL RENDER OF news.html FROM DATA ─────── */
  (function renderNewsPage() {
    const grid = document.getElementById('articlesGrid');
    const featuredSlot = document.getElementById('featuredArticle');
    if (!grid && !featuredSlot) return;
    let posts = [];
    try { posts = JSON.parse(localStorage.getItem('cindi_news_posts') || '[]'); } catch (err) { posts = []; }
    if (grid) grid.innerHTML = '';

    posts.forEach((post, idx) => {
      const cat = post.category || 'community';
      if (idx === 0 && featuredSlot) {
        featuredSlot.dataset.category = cat;
        const img = document.createElement('img');
        img.className = 'featured-img';
        img.alt = post.title || 'Featured news';
        img.loading = 'lazy';
        resolveMediaRef(post.image || 'images/news-christmas.svg', url => { img.src = url; });
        const body = document.createElement('div');
        body.className = 'featured-body';
        const tag = document.createElement('div');
        tag.className = 'news-tag news-tag-' + cat;
        tag.textContent = cat.replace(/^\w/, c => c.toUpperCase());
        const time = document.createElement('time'); time.textContent = post.date || '';
        const h2 = document.createElement('h2'); h2.textContent = post.title || 'Untitled update';
        const p = document.createElement('p'); p.textContent = post.excerpt || '';
        body.append(tag, time, h2, p);
        featuredSlot.append(img, body);
        return;
      }
      if (!grid) return;
      const article = document.createElement('article');
      article.className = 'article-card';
      article.dataset.category = cat;

      const img = document.createElement('img');
      img.alt = post.title || 'News';
      img.loading = 'lazy';
      resolveMediaRef(post.image || 'images/news-christmas.svg', url => { img.src = url; });

      const body = document.createElement('div');
      body.className = 'article-body';
      const tag = document.createElement('div');
      tag.className = 'news-tag news-tag-' + cat;
      tag.textContent = cat.replace(/^\w/, c => c.toUpperCase());
      const time = document.createElement('time'); time.textContent = post.date || '';
      const h3 = document.createElement('h3'); h3.textContent = post.title || 'Untitled update';
      const p = document.createElement('p'); p.textContent = post.excerpt || '';
      body.append(tag, time, h3, p);
      article.append(img, body);
      grid.appendChild(article);
    });
  })();

  /* ── GALLERY: FULL RENDER OF gallery.html FROM DATA ── */
  (function renderGalleryPage() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    let items = [];
    try { items = JSON.parse(localStorage.getItem('cindi_gallery') || '[]'); } catch (err) { items = []; }
    grid.innerHTML = '';

    items.forEach(entry => {
      const cat = entry.category || 'community';
      const isVideo = entry.type === 'video';
      const item = document.createElement('div');
      item.className = 'g-item' + (entry.layout ? ' g-' + entry.layout : '');
      item.dataset.cat = cat;
      item.dataset.type = isVideo ? 'video' : 'photo';
      item.dataset.title = entry.caption || '';
      item.dataset.date = entry.date || '';
      if (isVideo) {
        item.dataset.video = entry.url || '';
        item.dataset.videoKind = entry.videoKind || 'file';
      }

      const imgWrap = document.createElement('div');
      imgWrap.className = 'g-img-wrap';
      const img = document.createElement('img');
      img.alt = entry.caption || 'CINDI Kansenshi photo';
      img.loading = 'lazy';
      resolveMediaRef(entry.thumbnail || (isVideo ? 'images/hero.svg' : entry.url) || 'images/hero.svg', url => { img.src = url; });
      const overlay = document.createElement('div');
      overlay.className = 'g-overlay';
      overlay.innerHTML = isVideo
        ? '<i class="fas fa-circle-play" aria-hidden="true"></i>'
        : '<i class="fas fa-expand" aria-hidden="true"></i>';
      imgWrap.append(img, overlay);
      if (isVideo) {
        const badge = document.createElement('span');
        badge.className = 'g-video-badge';
        badge.innerHTML = '<i class="fas fa-video" aria-hidden="true"></i> Video';
        imgWrap.appendChild(badge);
      }

      const caption = document.createElement('div');
      caption.className = 'g-caption';
      const tag = document.createElement('span');
      tag.className = 'g-tag g-tag-' + cat;
      tag.textContent = cat.replace(/^\w/, c => c.toUpperCase());
      const p = document.createElement('p');
      p.textContent = entry.caption || '';
      caption.append(tag, p);

      item.append(imgWrap, caption);
      grid.appendChild(item);
    });
  })();

  /* ── POSTS: FULL RENDER OF posts.html FROM DATA ─────
     Seed posts (site-authored) may carry trusted HTML bodies.
     Admin-added posts are plain text, turned into <p> elements
     here — never rendered as raw HTML — so a compromised admin
     account can't inject a script through the Posts form. */
  function renderPostBody(container, post) {
    const raw = Array.isArray(post.body) ? post.body.join('\n\n') : (post.body || '');
    const looksLikeHTML = /<\/?(p|br|b|strong|i|em|u|s|ul|ol|li|h3|h4|blockquote|a)\b/i.test(raw);
    if (looksLikeHTML) {
      container.innerHTML = window.CindiSanitize ? window.CindiSanitize.clean(raw) : '';
      return;
    }
    // Plain text fallback (e.g. an older import): split into paragraphs safely.
    container.innerHTML = '';
    raw.split(/\n\s*\n/).forEach(block => {
      block = block.trim();
      if (!block) return;
      const p = document.createElement('p');
      p.textContent = block;
      container.appendChild(p);
    });
  }
  (function renderPostsPage() {
    const grid = document.getElementById('postsGrid');
    const featuredSlot = document.getElementById('featuredPost');
    if (!grid && !featuredSlot) return;
    let posts = [];
    try { posts = JSON.parse(localStorage.getItem('cindi_posts') || '[]'); } catch (err) { posts = []; }
    if (grid) grid.innerHTML = '';

    posts.forEach((post, idx) => {
      const cat = post.category || 'community';
      const tagClass = 'post-tag post-tag-' + cat;
      const tagLabel = cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const fullBody = document.createElement('div');
      renderPostBody(fullBody, post);
      const fullHTML = fullBody.innerHTML;

      if (idx === 0 && featuredSlot) {
        featuredSlot.dataset.cat = cat;
        featuredSlot.dataset.title = post.title || '';
        featuredSlot.dataset.author = post.author || '';
        featuredSlot.dataset.date = post.date || '';
        featuredSlot.dataset.read = post.read || '';
        featuredSlot.dataset.full = fullHTML;
        const img = document.createElement('img');
        img.className = 'fp-img';
        img.alt = post.title || 'Featured post';
        resolveMediaRef(post.image || 'images/hero.svg', url => { img.src = url; });
        const body = document.createElement('div');
        body.className = 'fp-body';
        body.innerHTML = `
          <div class="post-meta-row">
            <span class="${tagClass}">${tagLabel}</span>
            <span class="post-meta-item"><i class="fas fa-user"></i> ${(post.author || '').split(',')[0]}</span>
            <span class="post-meta-item"><i class="fas fa-calendar"></i> ${post.date || ''}</span>
            <span class="post-meta-item"><i class="fas fa-clock"></i> ${post.read || ''}</span>
          </div>`;
        const h2 = document.createElement('h2'); h2.textContent = post.title || 'Untitled post';
        const p = document.createElement('p'); p.textContent = post.excerpt || '';
        const btn = document.createElement('button');
        btn.className = 'btn btn-green read-post-btn';
        btn.innerHTML = 'Read Full Post <i class="fas fa-arrow-right"></i>';
        body.append(h2, p, btn);
        featuredSlot.append(img, body);
        return;
      }
      if (!grid) return;

      const article = document.createElement('article');
      article.className = 'post-card';
      article.dataset.cat = cat;
      article.dataset.title = post.title || '';
      article.dataset.author = post.author || '';
      article.dataset.date = post.date || '';
      article.dataset.read = post.read || '';
      article.dataset.full = fullHTML;

      const img = document.createElement('img');
      img.alt = post.title || 'Post';
      img.loading = 'lazy';
      resolveMediaRef(post.image || 'images/hero.svg', url => { img.src = url; });

      const body = document.createElement('div');
      body.className = 'pc-body';
      const metaRow = document.createElement('div');
      metaRow.className = 'post-meta-row';
      metaRow.innerHTML = `<span class="${tagClass}">${tagLabel}</span><span class="post-meta-item"><i class="fas fa-clock"></i> ${post.read || ''}</span>`;
      const h3 = document.createElement('h3'); h3.textContent = post.title || 'Untitled post';
      const p = document.createElement('p'); p.textContent = post.excerpt || '';
      const footer = document.createElement('div');
      footer.className = 'pc-footer';
      const authorWrap = document.createElement('div');
      authorWrap.className = 'pc-author';
      const authorImg = document.createElement('img');
      authorImg.alt = post.author || '';
      resolveMediaRef(post.authorImage || 'images/hero.svg', url => { authorImg.src = url; });
      const authorText = document.createElement('div');
      authorText.innerHTML = `<strong>${(post.author || '').split(',')[0]}</strong><span>${post.date || ''}</span>`;
      authorWrap.append(authorImg, authorText);
      const readBtn = document.createElement('button');
      readBtn.className = 'text-link read-post-btn';
      readBtn.innerHTML = 'Read <i class="fas fa-arrow-right"></i>';
      footer.append(authorWrap, readBtn);
      body.append(metaRow, h3, p, footer);
      article.append(img, body);
      grid.appendChild(article);
    });
  })();

  /* ── ADMIN-PUBLISHED DOCUMENTS INJECTED INTO documents.html ── */
  (function injectDocuments() {
    const grid = document.getElementById('documentsGrid');
    if (!grid) return;
    let docs = [];
    try { docs = JSON.parse(localStorage.getItem('cindi_documents') || '[]'); } catch (err) { docs = []; }
    const empty = document.getElementById('documentsEmpty');
    if (!docs.length) { if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    const ICONS = { report: 'fa-file-lines', policy: 'fa-file-shield', form: 'fa-file-pen', other: 'fa-file' };
    docs.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'doc-card';

      const icon = document.createElement('div');
      icon.className = 'doc-icon';
      icon.innerHTML = `<i class="fas ${ICONS[doc.category] || ICONS.other}" aria-hidden="true"></i>`;

      const body = document.createElement('div');
      body.className = 'doc-body';
      const h3 = document.createElement('h3');
      h3.textContent = doc.title || 'Untitled document';
      const meta = document.createElement('div');
      meta.className = 'doc-meta';
      const pill = document.createElement('span');
      pill.textContent = (doc.category || 'other').replace(/^\w/, c => c.toUpperCase());
      meta.appendChild(pill);
      if (doc.date) { meta.appendChild(document.createTextNode(' \u00B7 ')); meta.appendChild(document.createTextNode(doc.date)); }
      const desc = document.createElement('p');
      desc.textContent = doc.description || '';
      const link = document.createElement('a');
      link.className = 'doc-download';
      link.target = doc.url && doc.url.indexOf('idb:') === 0 ? '_self' : '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i> <span>Download</span>';
      resolveMediaRef(doc.url, url => { link.href = url; if (doc.fileName) link.download = doc.fileName; });

      body.append(h3, meta, desc, link);
      card.append(icon, body);
      grid.appendChild(card);
    });
  })();

  /* ── NAV SCROLL ────────────────────────────────── */
  const header = document.getElementById('siteHeader');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    });
  }

  /* ── HAMBURGER ─────────────────────────────────── */
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      hamburger.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open);
    });
    // close on nav-link click
    navLinks.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.classList.remove('open');
      })
    );
  }

  /* ── SCROLL-REVEAL ─────────────────────────────── */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.15 }
    );
    revealEls.forEach(el => io.observe(el));
  }

  /* ── COUNTER ANIMATION ─────────────────────────── */
  const counters = document.querySelectorAll('.stat-num');
  if (counters.length && 'IntersectionObserver' in window) {
    const countIO = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          animateCounter(e.target);
          countIO.unobserve(e.target);
        }
      }),
      { threshold: 0.5 }
    );
    counters.forEach(el => countIO.observe(el));
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1400;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      el.textContent = Math.floor(ease * target);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  }

  /* ── SMOOTH SCROLL (fallback for older browsers) ── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ── CONTACT FORM HANDLER ──────────────────────── */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const btn = this.querySelector('button[type="submit"]');
      const original = btn.textContent;
      btn.textContent = '✓ Message Sent!';
      btn.disabled = true;
      btn.style.background = '#2E7D32';
      if (window.CindiToast) window.CindiToast("Thanks — we've received your message and will reply soon.", 'success');
      setTimeout(() => {
        btn.textContent = original;
        btn.disabled = false;
        btn.style.background = '';
        this.reset();
      }, 3000);
    });
  }

})();
