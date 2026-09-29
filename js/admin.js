/* ============================================================
   CINDI Kansenshi — Admin Dashboard Logic
   ------------------------------------------------------------
   Server-backed authentication and content storage are used
   when the Python app is available. Static-host fallback remains
   for local previews only.
   ============================================================ */
(function () {
  'use strict';

  const LS = {
    meta: 'cindi_admin_meta',
    attempts: 'cindi_login_attempts',
    stats: 'cindi_site_stats',
    news: 'cindi_news_posts',
    gallery: 'cindi_gallery',
    posts: 'cindi_posts',
    documents: 'cindi_documents',
    audit: 'cindi_audit_log'
  };
  const SS_SESSION = 'cindi_session';
  const IDLE_LIMIT_MS = 15 * 60 * 1000;      // 15 min inactivity
  const ABSOLUTE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hour hard cap
  const MAX_ATTEMPTS = 5;

  const DEFAULT_STATS = { children: 1200, completion: 85, families: 450, years: 12 };
  const CONTENT_KEYS = { [LS.stats]: 'stats', [LS.news]: 'news', [LS.gallery]: 'gallery', [LS.posts]: 'posts', [LS.documents]: 'documents' };
  let backendEnabled = false;
  let backendAuthenticated = false;
  let backendWriteQueue = Promise.resolve();

  /* ── SMALL HELPERS ─────────────────────────────── */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));
  const toast = (msg, type) => { if (window.CindiToast) window.CindiToast(msg, type); };

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (err) { return fallback; }
  }
  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    const contentKey = CONTENT_KEYS[key];
    if (backendEnabled && backendAuthenticated && contentKey) {
      backendWriteQueue = backendWriteQueue.then(() => apiRequest(`/api/admin/content/${contentKey}`, {
        method: 'PUT', body: JSON.stringify(value)
      })).catch(error => toast(`Saved in this browser, but the server update failed: ${error.message}`, 'error'));
    }
    return backendWriteQueue;
  }

  async function apiRequest(path, options) {
    const response = await fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}));
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }

  function currentContent() {
    return {
      stats: readJSON(LS.stats, DEFAULT_STATS),
      news: readJSON(LS.news, window.CindiSeed ? window.CindiSeed.news : []),
      gallery: readJSON(LS.gallery, window.CindiSeed ? window.CindiSeed.gallery : []),
      posts: readJSON(LS.posts, window.CindiSeed ? window.CindiSeed.posts : []),
      documents: readJSON(LS.documents, [])
    };
  }

  async function syncServerContent() {
    const content = await apiRequest('/api/admin/content');
    Object.entries(CONTENT_KEYS).forEach(([storageKey, contentKey]) => {
      if (content[contentKey] !== null && content[contentKey] !== undefined) {
        localStorage.setItem(storageKey, JSON.stringify(content[contentKey]));
      }
    });
  }

  async function uploadToServer(file, category) {
    const body = new FormData();
    body.append('file', file);
    body.append('category', category);
    const result = await apiRequest('/api/admin/media', { method: 'POST', body });
    return result.url;
  }

  function bytesToHex(bytes) {
    return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /* ── PBKDF2 PASSWORD HASHING ───────────────────── */
  const ITERATIONS = 150000;
  async function deriveHash(password, saltHex, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return bytesToHex(bits);
  }
  function randomSaltHex() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return bytesToHex(arr);
  }

  /* ── AUDIT LOG ──────────────────────────────────── */
  function logEvent(action, ok) {
    const log = readJSON(LS.audit, []);
    log.unshift({ action, ok: ok !== false, ts: Date.now() });
    writeJSON(LS.audit, log.slice(0, 50));
  }
  function formatWhen(ts) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function renderAudit(target) {
    const log = readJSON(LS.audit, []);
    target.innerHTML = '';
    if (!log.length) {
      target.innerHTML = '<p style="color:var(--gray-600);font-size:0.85rem">No activity yet.</p>';
      return;
    }
    log.forEach(entry => {
      const row = document.createElement('div');
      row.className = 'audit-row';
      const left = document.createElement('span');
      left.className = entry.ok ? 'audit-tag-success' : 'audit-tag-fail';
      left.textContent = entry.action;
      const right = document.createElement('span');
      right.className = 'when';
      right.textContent = formatWhen(entry.ts);
      row.append(left, right);
      target.appendChild(row);
    });
  }

  /* ── LOGIN ATTEMPT / LOCKOUT ────────────────────── */
  function getAttempts() { return readJSON(LS.attempts, { count: 0, lockUntil: 0 }); }
  function setAttempts(v) { writeJSON(LS.attempts, v); }
  function isLockedOut() { return getAttempts().lockUntil > Date.now(); }
  function lockRemainingSeconds() { return Math.max(0, Math.ceil((getAttempts().lockUntil - Date.now()) / 1000)); }
  function registerFailedAttempt() {
    const a = getAttempts();
    a.count += 1;
    if (a.count >= MAX_ATTEMPTS) {
      const extra = a.count - MAX_ATTEMPTS;
      const seconds = Math.min(30 * Math.pow(2, extra), 300);
      a.lockUntil = Date.now() + seconds * 1000;
    }
    setAttempts(a);
    return a;
  }
  function clearAttempts() { setAttempts({ count: 0, lockUntil: 0 }); }

  /* ── SESSION ────────────────────────────────────── */
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SS_SESSION)); } catch (err) { return null; }
  }
  function startSession(username) {
    const now = Date.now();
    sessionStorage.setItem(SS_SESSION, JSON.stringify({
      username, loginAt: now, lastActivity: now, hardExpiry: now + ABSOLUTE_LIMIT_MS
    }));
  }
  function touchSession() {
    const s = getSession();
    if (!s) return;
    s.lastActivity = Date.now();
    sessionStorage.setItem(SS_SESSION, JSON.stringify(s));
  }
  function endSession() { sessionStorage.removeItem(SS_SESSION); }
  function sessionValid() {
    const s = getSession();
    if (!s) return false;
    const now = Date.now();
    if (now > s.hardExpiry) return false;
    if (now - s.lastActivity > IDLE_LIMIT_MS) return false;
    return true;
  }

  /* ── VALIDATION HELPERS ─────────────────────────── */
  function isSafeMediaUrl(url) {
    if (!url) return false;
    url = url.trim();
    if (/^images\//.test(url)) return true;
    if (/^\/uploads\/[a-f0-9]+\.[a-z0-9]+$/i.test(url)) return true;
    if (/^https:\/\//i.test(url)) return true;
    return false;
  }
  function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 10) score++;
    if (pw.length >= 14) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return Math.min(score, 4);
  }

  const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
  const MAX_DOC_BYTES = 15 * 1024 * 1024;

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  // Turns a pasted YouTube/Vimeo/direct-file URL into what the lightbox needs.
  function classifyVideoUrl(raw) {
    const url = (raw || '').trim();
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    if (m) return { kind: 'embed', src: 'https://www.youtube.com/embed/' + m[1] };
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return { kind: 'embed', src: 'https://player.vimeo.com/video/' + m[1] };
    if (/^https:\/\//i.test(url)) return { kind: 'file', src: url };
    return null;
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = meta.match(/data:(.*);base64/)[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Wires a document.execCommand-based toolbar to a contenteditable area.
  // Output is sanitized separately at save-time (and again at render-time),
  // so execCommand's occasional messy markup is never trusted as-is.
  function wireRichTextToolbar(toolbarId, editorId) {
    const toolbar = document.getElementById(toolbarId);
    const editor = document.getElementById(editorId);
    if (!toolbar || !editor) return;
    toolbar.querySelectorAll('.editor-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        editor.focus();
        const cmd = btn.dataset.cmd;
        const val = btn.dataset.val || null;
        try { document.execCommand(cmd, false, val); } catch (err) {}
      });
    });
  }

  // Lets a whole field (label + file input) act as a drop target: dropped
  // files are assigned to the input and a 'change' event is dispatched, so
  // existing input.addEventListener('change', ...) handlers run unchanged.
  function wireDropzone(zoneId, inputId) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;
    ['dragenter', 'dragover'].forEach(evt => {
      zone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drag-over'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
      zone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag-over'); });
    });
    zone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      try {
        input.files = files;
      } catch (err) {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  wireRichTextToolbar('postEditorToolbar', 'postBodyEditor');
  wireDropzone('postUploadField', 'postCoverFile');
  wireDropzone('galleryUploadField', 'galleryFile');
  wireDropzone('docUploadField', 'docFile');

  // Wires up a row of .toggle-btn elements sharing a container id.
  function wireToggleGroup(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return () => {};
    const btns = $$('.toggle-btn', container);
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.dataset.value);
      });
    });
    return () => (container.querySelector('.toggle-btn.active') || {}).dataset?.value;
  }

  async function refreshStorageMeter() {
    if (backendEnabled) {
      const card = $('#storageUsageCard');
      if (card) card.style.display = 'none';
      $('#storageLabelSecurity').textContent = 'Content and uploads are stored on the server.';
      return;
    }
    if (!window.CindiMediaStore) return;
    const est = await window.CindiMediaStore.estimateUsage();
    const card = $('#storageUsageCard');
    if (est && est.quota) {
      if (card) card.style.display = 'block';
      const pct = Math.min(100, (est.usage / est.quota) * 100);
      const label = `${formatBytes(est.usage)} used of about ${formatBytes(est.quota)} available in this browser.`;
      [['#storageFill', '#storageLabel'], ['#storageFillSecurity', '#storageLabelSecurity']].forEach(([fillSel, labelSel]) => {
        const fill = $(fillSel), lbl = $(labelSel);
        if (fill) { fill.style.width = pct.toFixed(1) + '%'; fill.style.background = pct > 85 ? '#C62828' : pct > 60 ? '#F9A825' : 'var(--green)'; }
        if (lbl) lbl.textContent = label;
      });
    } else if (card) {
      card.style.display = 'none';
    }
  }

  /* ── UI: SCREEN SWITCHING ───────────────────────── */
  const setupScreen = $('#setupScreen');
  const loginScreen = $('#loginScreen');
  const shell = $('#adminShell');

  function showSetup() { setupScreen.style.display = 'flex'; loginScreen.style.display = 'none'; shell.classList.remove('active'); }
  function showLogin() { setupScreen.style.display = 'none'; loginScreen.style.display = 'flex'; shell.classList.remove('active'); }
  function showDashboard(username) {
    setupScreen.style.display = 'none';
    loginScreen.style.display = 'none';
    shell.classList.add('active');
    $('#sidebarUsername').textContent = username || 'admin';
    refreshOverview();
    renderStatsForm();
    renderNews();
    renderPosts();
    renderGallery();
    renderDocuments();
    renderMessages();
    refreshStorageMeter();
    renderAudit($('#fullAudit'));
  }

  async function boot() {
    try {
      const status = await apiRequest('/api/admin/status');
      backendEnabled = true;
      if (!status.configured) { showSetup(); return; }
      if (status.authenticated) {
        const current = await apiRequest('/api/admin/session');
        backendAuthenticated = true;
        startSession(current.username);
        await syncServerContent();
        showDashboard(current.username);
        return;
      }
      showLogin();
      return;
    } catch (error) {
      backendEnabled = false;
    }
    const meta = readJSON(LS.meta, null);
    if (!meta) { showSetup(); return; }
    if (sessionValid()) { showDashboard(getSession().username); return; }
    endSession();
    showLogin();
  }

  /* ── PASSWORD VISIBILITY TOGGLES ────────────────── */
  $$('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.toggle);
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });
  });

  /* ── STRENGTH METER (setup screen) ──────────────── */
  const setupPassword = $('#setupPassword');
  if (setupPassword) {
    setupPassword.addEventListener('input', () => {
      const score = passwordStrength(setupPassword.value);
      const pct = (score / 4) * 100;
      const fill = $('#strengthFill');
      const labels = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'];
      const colors = ['#C62828', '#C62828', '#E65100', '#F9A825', '#2E7D32'];
      fill.style.width = pct + '%';
      fill.style.background = colors[score];
      $('#strengthLabel').textContent = setupPassword.value.length < 10
        ? 'Minimum 10 characters'
        : labels[score] + ' password';
    });
  }

  /* ── SETUP FORM ──────────────────────────────────── */
  const setupForm = $('#setupForm');
  if (setupForm) {
    setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = $('#setupError');
      errBox.classList.remove('show');
      const username = $('#setupUsername').value.trim();
      const pw = $('#setupPassword').value;
      const pw2 = $('#setupPasswordConfirm').value;

      if (pw !== pw2) return showError(errBox, "Passwords don't match.");
      if (pw.length < 10) return showError(errBox, 'Password must be at least 10 characters.');
      if (pw.toLowerCase().includes(username.toLowerCase())) return showError(errBox, "Password shouldn't contain your username.");

      if (backendEnabled) {
        const submitBtn = setupForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Securing your account…';
        try {
          await apiRequest('/api/admin/setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password: pw, setupToken: $('#setupToken').value, content: currentContent() })
          });
          backendAuthenticated = true;
          clearAttempts();
          logEvent('Admin account created', true);
          startSession(username);
          await syncServerContent();
          setupForm.reset();
          toast('Admin account created. You are now signed in.', 'success');
          showDashboard(username);
        } catch (error) {
          showError(errBox, error.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account & Continue';
        }
        return;
      }

      const submitBtn = setupForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Securing your account…';

      const saltHex = randomSaltHex();
      const hashHex = await deriveHash(pw, saltHex, ITERATIONS);
      writeJSON(LS.meta, { username, saltHex, hashHex, iterations: ITERATIONS, createdAt: Date.now() });
      clearAttempts();
      logEvent('Admin account created', true);
      startSession(username);
      toast('Admin account created. You are now signed in.', 'success');
      showDashboard(username);
    });
  }

  /* ── LOGIN FORM ──────────────────────────────────── */
  const loginForm = $('#loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errBox = $('#loginError');
      errBox.classList.remove('show');

      if (backendEnabled) {
        const submitBtn = $('#loginSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Checking…';
        try {
          const result = await apiRequest('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: $('#loginUsername').value.trim(), password: $('#loginPassword').value })
          });
          backendAuthenticated = true;
          startSession(result.username);
          loginForm.reset();
          await syncServerContent();
          logEvent('Signed in', true);
          showDashboard(result.username);
        } catch (error) {
          showError(errBox, error.message);
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        }
        return;
      }

      if (isLockedOut()) {
        return showError(errBox, `Too many failed attempts. Try again in ${lockRemainingSeconds()}s.`);
      }

      const username = $('#loginUsername').value.trim();
      const pw = $('#loginPassword').value;
      const meta = readJSON(LS.meta, null);
      if (!meta) { showSetup(); return; }

      const submitBtn = $('#loginSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking…';

      const candidateHash = await deriveHash(pw, meta.saltHex, meta.iterations);
      const usernameOk = timingSafeEqual(username.toLowerCase(), meta.username.toLowerCase());
      const passwordOk = timingSafeEqual(candidateHash, meta.hashHex);

      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';

      if (usernameOk && passwordOk) {
        clearAttempts();
        logEvent('Signed in', true);
        startSession(meta.username);
        loginForm.reset();
        showDashboard(meta.username);
      } else {
        const a = registerFailedAttempt();
        logEvent('Failed sign-in attempt', false);
        if (a.lockUntil > Date.now()) {
          showError(errBox, `Too many failed attempts. Locked for ${lockRemainingSeconds()}s.`);
        } else {
          showError(errBox, `Incorrect username or password. ${MAX_ATTEMPTS - a.count} attempt(s) left before a lockout.`);
        }
      }
    });
  }

  function showError(box, msg) {
    box.querySelector('span').textContent = msg;
    box.classList.add('show');
  }

  /* ── FORGOT PASSWORD / RESET ACCOUNT ─────────────── */
  function resetAccount(reasonToast) {
    localStorage.removeItem(LS.meta);
    clearAttempts();
    endSession();
    logEvent('Admin account removed from this device', true);
    toast(reasonToast || 'Admin account removed from this device.', 'info');
    showSetup();
  }
  const forgotLink = $('#forgotLink');
  if (forgotLink) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (backendEnabled) return showError($('#loginError'), 'Ask the site administrator to reset the server account.');
      if (confirm("This will remove the admin account stored in this browser so you can create a new one. Published news/gallery/stats content is kept. Continue?")) {
        resetAccount('Account reset. Create a new admin account to continue.');
      }
    });
  }
  const resetAccountBtn = $('#resetAccountBtn');
  if (resetAccountBtn) {
    resetAccountBtn.addEventListener('click', () => {
      if (backendEnabled) return toast('Server accounts cannot be removed from this browser.', 'error');
      if (confirm('Remove the admin account from this device? You will need to set up a new username and password on next visit.')) {
        resetAccount('Admin account removed.');
      }
    });
  }

  /* ── LOGOUT & SESSION TIMEOUT ─────────────────────── */
  async function doLogout(reason) {
    if (backendEnabled) {
      try { await apiRequest('/api/admin/logout', { method: 'POST' }); } catch (error) {}
      backendAuthenticated = false;
    }
    endSession();
    logEvent('Signed out', true);
    showLogin();
    if (reason) toast(reason, 'info');
  }
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => doLogout());
  const logoutAllBtn = $('#logoutAllBtn');
  if (logoutAllBtn) logoutAllBtn.addEventListener('click', () => doLogout('Session ended.'));

  ['click', 'keydown', 'mousemove', 'scroll'].forEach(evt => {
    document.addEventListener(evt, () => { if (shell.classList.contains('active')) touchSession(); }, { passive: true });
  });
  setInterval(() => {
    if (!shell.classList.contains('active')) return;
    if (!sessionValid()) doLogout('Signed out — your session expired.');
    else {
      const s = getSession();
      const idleLeft = Math.max(0, IDLE_LIMIT_MS - (Date.now() - s.lastActivity));
      $('#sessionInfo').textContent = idleLeft < 60000
        ? `Session active — signing out in ${Math.ceil(idleLeft / 1000)}s of inactivity`
        : 'Session active';
    }
  }, 5000);

  /* ── SIDEBAR NAV ───────────────────────────────────── */
  $$('.admin-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.admin-nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.admin-panel').forEach(p => p.classList.remove('active'));
      $(`.admin-panel[data-panel="${btn.dataset.panel}"]`).classList.add('active');
    });
  });

  /* ── OVERVIEW ─────────────────────────────────────── */
  function refreshOverview() {
    const stats = readJSON(LS.stats, DEFAULT_STATS);
    const news = readJSON(LS.news, []);
    const gallery = readJSON(LS.gallery, []);
    const posts = readJSON(LS.posts, []);
    const docs = readJSON(LS.documents, []);
    const videoCount = gallery.filter(g => g.type === 'video').length;
    const cards = [
      { label: 'News Articles', num: news.length },
      { label: 'Blog Posts', num: posts.length },
      { label: 'Photos / Videos', num: `${gallery.length - videoCount} / ${videoCount}` },
      { label: 'Documents', num: docs.length }
    ];
    const wrap = $('#overviewCards');
    wrap.innerHTML = '';
    cards.forEach(c => {
      const div = document.createElement('div');
      div.className = 'stat-card';
      const num = document.createElement('div'); num.className = 'num'; num.textContent = c.num;
      const label = document.createElement('div'); label.className = 'label'; label.textContent = c.label;
      div.append(num, label);
      wrap.appendChild(div);
    });
    renderAudit($('#overviewAudit'));
  }

  async function renderMessages() {
    const wrap = $('#messagesList');
    if (!wrap) return;
    if (!backendEnabled || !backendAuthenticated) {
      wrap.textContent = 'Contact submissions are available when the Python backend is running.';
      return;
    }
    wrap.textContent = 'Loading messages…';
    try {
      const messages = await apiRequest('/api/admin/messages');
      wrap.innerHTML = '';
      if (!messages.length) {
        wrap.textContent = 'No inquiries have been received yet.';
        return;
      }
      messages.forEach(message => {
        const article = document.createElement('article');
        article.className = 'inbox-message' + (message.read ? '' : ' unread');
        const heading = document.createElement('div');
        heading.className = 'inbox-message-heading';
        const title = document.createElement('strong');
        title.textContent = message.category.charAt(0).toUpperCase() + message.category.slice(1);
        const time = document.createElement('time');
        time.textContent = new Date(message.createdAt * 1000).toLocaleString();
        heading.append(title, time);
        article.appendChild(heading);
        Object.entries(message.fields).forEach(([key, value]) => {
          if (!value) return;
          const row = document.createElement('p');
          const label = document.createElement('strong');
          label.textContent = key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase()) + ': ';
          row.append(label, document.createTextNode(value));
          article.appendChild(row);
        });
        if (!message.read) {
          const markRead = document.createElement('button');
          markRead.type = 'button';
          markRead.className = 'btn btn-ghost btn-sm';
          markRead.textContent = 'Mark as read';
          markRead.addEventListener('click', async () => {
            try {
              await apiRequest(`/api/admin/messages/${message.id}`, { method: 'PATCH' });
              renderMessages();
            } catch (error) { toast(error.message, 'error'); }
          });
          article.appendChild(markRead);
        }
        wrap.appendChild(article);
      });
    } catch (error) {
      wrap.textContent = error.message;
    }
  }

  const refreshMessagesBtn = $('#refreshMessagesBtn');
  if (refreshMessagesBtn) refreshMessagesBtn.addEventListener('click', renderMessages);

  /* ── SITE STATS PANEL ─────────────────────────────── */
  function renderStatsForm() {
    const stats = readJSON(LS.stats, DEFAULT_STATS);
    $('#statChildren').value = stats.children;
    $('#statCompletion').value = stats.completion;
    $('#statFamilies').value = stats.families;
    $('#statYears').value = stats.years;
  }
  const statsForm = $('#statsForm');
  if (statsForm) {
    statsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const stats = {
        children: Number($('#statChildren').value) || 0,
        completion: Math.min(100, Number($('#statCompletion').value) || 0),
        families: Number($('#statFamilies').value) || 0,
        years: Number($('#statYears').value) || 0
      };
      writeJSON(LS.stats, stats);
      logEvent('Updated homepage stats', true);
      toast('Homepage stats published.', 'success');
      refreshOverview();
    });
  }
  const resetStatsBtn = $('#resetStatsBtn');
  if (resetStatsBtn) {
    resetStatsBtn.addEventListener('click', () => {
      if (backendEnabled) writeJSON(LS.stats, DEFAULT_STATS);
      else localStorage.removeItem(LS.stats);
      renderStatsForm();
      logEvent('Reset homepage stats to defaults', true);
      toast('Stats reset to defaults.', 'info');
      refreshOverview();
    });
  }

  /* ── NEWS PANEL ────────────────────────────────────── */
  const newsForm = $('#newsForm');
  function renderNews() {
    const posts = readJSON(LS.news, []);
    const wrap = $('#newsTableWrap');
    if (!posts.length) {
      wrap.innerHTML = '<div class="table-empty"><i class="fas fa-newspaper"></i>No posts published yet. Add one above.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Headline</th><th>Category</th><th>Date</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    posts.forEach(post => {
      const tr = document.createElement('tr');
      const tdTitle = document.createElement('td'); tdTitle.textContent = post.title;
      const tdCat = document.createElement('td');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = post.category;
      tdCat.appendChild(pill);
      const tdDate = document.createElement('td'); tdDate.textContent = post.date || '—';
      const tdActions = document.createElement('td'); tdActions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.className = 'btn btn-ghost btn-sm'; editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editBtn.addEventListener('click', () => editNews(post.id));
      const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.addEventListener('click', () => deleteNews(post.id));
      tdActions.append(editBtn, delBtn);
      tr.append(tdTitle, tdCat, tdDate, tdActions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }
  function editNews(id) {
    const post = readJSON(LS.news, []).find(p => p.id === id);
    if (!post) return;
    $('#newsId').value = post.id;
    $('#newsTitle').value = post.title;
    $('#newsCategory').value = post.category;
    $('#newsDate').value = post.date || '';
    $('#newsImage').value = post.image || '';
    $('#newsExcerpt').value = post.excerpt || '';
    $('#newsFormTitle').textContent = 'Edit News Post';
    $('#newsCancelEdit').style.display = 'inline-flex';
    document.querySelector('.admin-nav button[data-panel="news"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function deleteNews(id) {
    if (!confirm('Delete this post from the public News page?')) return;
    const posts = readJSON(LS.news, []).filter(p => p.id !== id);
    writeJSON(LS.news, posts);
    logEvent('Deleted a news post', true);
    toast('Post deleted.', 'info');
    renderNews();
    refreshOverview();
  }
  if (newsForm) {
    newsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const image = $('#newsImage').value.trim();
      if (image && !isSafeMediaUrl(image)) {
        toast('Image must be an images/ path or an https:// URL.', 'error');
        return;
      }
      const posts = readJSON(LS.news, []);
      const id = $('#newsId').value || ('n' + Date.now());
      const entry = {
        id,
        title: $('#newsTitle').value.trim().slice(0, 120),
        category: $('#newsCategory').value,
        date: $('#newsDate').value.trim().slice(0, 30),
        image: image,
        excerpt: $('#newsExcerpt').value.trim().slice(0, 400)
      };
      const idx = posts.findIndex(p => p.id === id);
      if (idx >= 0) posts[idx] = entry; else posts.unshift(entry);
      writeJSON(LS.news, posts);
      logEvent(idx >= 0 ? 'Edited a news post' : 'Published a news post', true);
      toast('Post saved and live on the News page.', 'success');
      newsForm.reset();
      $('#newsId').value = '';
      $('#newsFormTitle').textContent = 'Add a News Post';
      $('#newsCancelEdit').style.display = 'none';
      renderNews();
      refreshOverview();
    });
  }
  const newsCancelEdit = $('#newsCancelEdit');
  if (newsCancelEdit) {
    newsCancelEdit.addEventListener('click', () => {
      newsForm.reset();
      $('#newsId').value = '';
      $('#newsFormTitle').textContent = 'Add a News Post';
      newsCancelEdit.style.display = 'none';
    });
  }
  const resetNewsBtn = $('#resetNewsBtn');
  if (resetNewsBtn) {
    resetNewsBtn.addEventListener('click', () => {
      if (!window.CindiSeed) return;
      if (!confirm('This replaces every News article (including any you\'ve added or edited) with the site\'s original content. Continue?')) return;
      writeJSON(LS.news, window.CindiSeed.news);
      logEvent('Restored original News content', true);
      toast('News restored to original content.', 'info');
      renderNews();
      refreshOverview();
    });
  }

  /* ── GALLERY PANEL (photos & videos) ─────────────────── */
  const galleryForm = $('#galleryForm');
  let galleryType = 'photo';
  let gallerySource = 'upload';
  let galleryPickedFile = null;

  function updateGalleryFieldLabels() {
    $('#galleryFileLabel').textContent = galleryType === 'video' ? 'Choose a video' : 'Choose a photo';
    $('#galleryFile').accept = galleryType === 'video' ? 'video/*' : 'image/*';
    $('#galleryFileHint').textContent = galleryType === 'video'
      ? 'MP4 or WEBM — up to ' + formatBytes(MAX_VIDEO_BYTES) + '.'
      : 'JPG, PNG, GIF, or WEBP — up to ' + formatBytes(MAX_PHOTO_BYTES) + '.';
    $('#galleryUrlLabel').textContent = galleryType === 'video' ? 'Video link' : 'Image URL';
    $('#galleryUrl').placeholder = galleryType === 'video'
      ? 'YouTube/Vimeo link, or a direct https://video.mp4 URL'
      : 'images/hero.svg or https://...';
    $('#galleryUrlHint').textContent = galleryType === 'video'
      ? 'Paste a YouTube or Vimeo link, or a direct link to an mp4/webm file.'
      : 'A path from the images/ folder, or a full https:// image URL.';
  }
  wireToggleGroup('galleryTypeToggle', (val) => { galleryType = val; updateGalleryFieldLabels(); resetGalleryUploadPreview(); });
  wireToggleGroup('gallerySourceToggle', (val) => {
    gallerySource = val;
    $('#galleryUploadField').style.display = val === 'upload' ? '' : 'none';
    $('#galleryUrlField').style.display = val === 'url' ? '' : 'none';
  });
  updateGalleryFieldLabels();

  function resetGalleryUploadPreview() {
    galleryPickedFile = null;
    $('#galleryFile').value = '';
    $('#galleryUploadPreview').style.display = 'none';
    $('#galleryUploadPreview').innerHTML = '';
  }

  const galleryFileInput = $('#galleryFile');
  if (galleryFileInput) {
    galleryFileInput.addEventListener('change', () => {
      const file = galleryFileInput.files[0];
      if (!file) return;
      const cap = galleryType === 'video' ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
      if (file.size > cap) {
        toast(`That file is ${formatBytes(file.size)} — the limit is ${formatBytes(cap)}.`, 'error');
        resetGalleryUploadPreview();
        return;
      }
      galleryPickedFile = file;
      const preview = $('#galleryUploadPreview');
      const url = URL.createObjectURL(file);
      preview.innerHTML = '';
      const media = document.createElement(galleryType === 'video' ? 'video' : 'img');
      media.src = url;
      if (galleryType === 'video') media.muted = true;
      const name = document.createElement('span'); name.className = 'name'; name.textContent = file.name;
      const size = document.createElement('span'); size.className = 'size'; size.textContent = formatBytes(file.size);
      preview.append(media, name, size);
      preview.style.display = 'flex';
    });
  }

  async function resolveGalleryThumb(entry) {
    const ref = entry.thumbnail || (entry.type === 'video' ? null : entry.url);
    if (!ref) return 'images/hero.svg';
    if (ref.indexOf('idb:') === 0 && window.CindiMediaStore) {
      try {
        const url = await window.CindiMediaStore.getObjectURL(ref.slice(4));
        return url || 'images/hero.svg';
      } catch (err) { return 'images/hero.svg'; }
    }
    return ref;
  }

  async function renderGalleryGrid(items) {
    const grid = $('#adminGalleryGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (const item of items) {
      const tile = document.createElement('div');
      tile.className = 'admin-media-tile';

      const img = document.createElement('img');
      img.alt = item.caption || '';
      img.loading = 'lazy';
      resolveGalleryThumb(item).then(src => { img.src = src; });
      tile.appendChild(img);

      if (item.type === 'video') {
        const badge = document.createElement('span');
        badge.className = 'tile-video-badge';
        badge.innerHTML = '<i class="fas fa-video"></i> Video';
        tile.appendChild(badge);
      }

      const overlay = document.createElement('div');
      overlay.className = 'tile-overlay';
      const editBtn = document.createElement('button');
      editBtn.className = 'tile-btn edit';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editBtn.addEventListener('click', () => editGallery(item.id));
      const delBtn = document.createElement('button');
      delBtn.className = 'tile-btn delete';
      delBtn.title = 'Delete';
      delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.addEventListener('click', () => deleteGallery(item.id));
      overlay.append(editBtn, delBtn);
      tile.appendChild(overlay);

      const caption = document.createElement('div');
      caption.className = 'tile-caption';
      caption.textContent = item.caption || '';
      tile.appendChild(caption);

      grid.appendChild(tile);
    }
  }

  function renderGallery() {
    const items = readJSON(LS.gallery, []);
    renderGalleryGrid(items);
    const wrap = $('#galleryTableWrap');
    if (!items.length) {
      wrap.innerHTML = '<div class="table-empty"><i class="fas fa-images"></i>No photos or videos published yet. Add one above.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Caption</th><th>Type</th><th>Category</th><th>Date</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    items.forEach(item => {
      const tr = document.createElement('tr');
      const tdCap = document.createElement('td'); tdCap.textContent = item.caption;
      const tdType = document.createElement('td');
      const typePill = document.createElement('span'); typePill.className = 'pill'; typePill.textContent = item.type === 'video' ? 'Video' : 'Photo';
      tdType.appendChild(typePill);
      const tdCat = document.createElement('td');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = item.category;
      tdCat.appendChild(pill);
      const tdDate = document.createElement('td'); tdDate.textContent = item.date || '—';
      const tdActions = document.createElement('td'); tdActions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.className = 'btn btn-ghost btn-sm'; editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editBtn.addEventListener('click', () => editGallery(item.id));
      const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.addEventListener('click', () => deleteGallery(item.id));
      tdActions.append(editBtn, delBtn);
      tr.append(tdCap, tdType, tdCat, tdDate, tdActions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }
  function editGallery(id) {
    const item = readJSON(LS.gallery, []).find(p => p.id === id);
    if (!item) return;
    $('#galleryId').value = item.id;
    $('#galleryBlobId').value = item.blobId || '';
    $('#galleryCaption').value = item.caption;
    $('#galleryCategory').value = item.category;
    $('#galleryDate').value = item.date || '';
    galleryType = item.type || 'photo';
    $(`#galleryTypeToggle .toggle-btn[data-value="${galleryType}"]`).click();
    // Editing an existing item always shows the URL field (re-uploading isn't required to edit metadata).
    $('#gallerySourceToggle .toggle-btn[data-value="url"]').click();
    $('#galleryUrl').value = item.url && item.url.indexOf('idb:') === 0 ? '' : (item.url || '');
    if (item.url && item.url.indexOf('idb:') === 0) {
      $('#galleryUrl').placeholder = '(currently an uploaded file — leave blank to keep it, or paste a link to replace it)';
    }
    $('#galleryFormTitle').textContent = 'Edit ' + (galleryType === 'video' ? 'Video' : 'Photo');
    $('#galleryCancelEdit').style.display = 'inline-flex';
    document.querySelector('.admin-nav button[data-panel="gallery"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function deleteGallery(id) {
    if (!confirm('Delete this item from the public Gallery page?')) return;
    const items = readJSON(LS.gallery, []);
    const item = items.find(p => p.id === id);
    if (item && item.blobId && window.CindiMediaStore) {
      try { await window.CindiMediaStore.deleteBlob(item.blobId); } catch (err) {}
    }
    writeJSON(LS.gallery, items.filter(p => p.id !== id));
    logEvent('Deleted a gallery item', true);
    toast('Deleted.', 'info');
    renderGallery();
    refreshOverview();
    refreshStorageMeter();
  }
  function resetGalleryForm() {
    galleryForm.reset();
    $('#galleryId').value = '';
    $('#galleryBlobId').value = '';
    $('#galleryFormTitle').textContent = 'Add a Photo or Video';
    $('#galleryCancelEdit').style.display = 'none';
    resetGalleryUploadPreview();
    $('#galleryTypeToggle .toggle-btn[data-value="photo"]').click();
    $('#gallerySourceToggle .toggle-btn[data-value="upload"]').click();
  }
  if (galleryForm) {
    galleryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const items = readJSON(LS.gallery, []);
      const id = $('#galleryId').value || ('g' + Date.now());
      let url = null, videoKind = 'file', blobId = $('#galleryBlobId').value || null, thumbnail = null;

      if (gallerySource === 'upload') {
        if (galleryPickedFile) {
          if (backendEnabled) {
            try {
              url = await uploadToServer(galleryPickedFile, galleryType === 'video' ? 'video' : 'photo');
              blobId = null;
              if (galleryType === 'photo') thumbnail = url;
            } catch (err) {
              toast(err.message, 'error');
              return;
            }
          } else {
            blobId = 'gal_' + Date.now();
            try {
              await window.CindiMediaStore.putBlob(blobId, galleryPickedFile, { mime: galleryPickedFile.type, name: galleryPickedFile.name });
            } catch (err) {
              toast('Could not store that file on this device (it may be low on space).', 'error');
              return;
            }
            url = 'idb:' + blobId;
            if (galleryType === 'photo') thumbnail = url;
          }
        } else if (!blobId) {
          toast('Choose a file to upload, or switch to "Paste a link".', 'error');
          return;
        } else {
          url = 'idb:' + blobId; // kept existing upload during an edit
        }
      } else {
        const raw = $('#galleryUrl').value.trim();
        if (galleryType === 'video') {
          const classified = classifyVideoUrl(raw);
          if (!raw) { toast('Paste a video link.', 'error'); return; }
          if (!classified) { toast('That video link needs to start with https://', 'error'); return; }
          url = classified.src;
          videoKind = classified.kind;
        } else {
          if (!isSafeMediaUrl(raw)) { toast('Image must be an images/ path or an https:// URL.', 'error'); return; }
          url = raw;
        }
      }

      const entry = {
        id,
        type: galleryType,
        url,
        videoKind: galleryType === 'video' ? videoKind : undefined,
        blobId: gallerySource === 'upload' ? blobId : null,
        thumbnail,
        caption: $('#galleryCaption').value.trim().slice(0, 120),
        category: $('#galleryCategory').value,
        date: $('#galleryDate').value.trim().slice(0, 30)
      };
      const idx = items.findIndex(p => p.id === id);
      if (idx >= 0) items[idx] = entry; else items.unshift(entry);
      writeJSON(LS.gallery, items);
      logEvent(idx >= 0 ? 'Edited a gallery item' : 'Published a gallery item', true);
      toast('Saved and live on the Gallery page.', 'success');
      resetGalleryForm();
      renderGallery();
      refreshOverview();
      refreshStorageMeter();
    });
  }
  const galleryCancelEdit = $('#galleryCancelEdit');
  if (galleryCancelEdit) galleryCancelEdit.addEventListener('click', resetGalleryForm);
  const resetGalleryBtn = $('#resetGalleryBtn');
  if (resetGalleryBtn) {
    resetGalleryBtn.addEventListener('click', async () => {
      if (!window.CindiSeed) return;
      if (!confirm('This replaces every photo/video (including any you\'ve added or edited) with the site\'s original content. Uploaded files you added will also be removed from this device. Continue?')) return;
      const current = readJSON(LS.gallery, []);
      for (const item of current) {
        if (item.blobId && window.CindiMediaStore) { try { await window.CindiMediaStore.deleteBlob(item.blobId); } catch (err) {} }
      }
      writeJSON(LS.gallery, window.CindiSeed.gallery);
      logEvent('Restored original Gallery content', true);
      toast('Gallery restored to original content.', 'info');
      renderGallery();
      refreshOverview();
      refreshStorageMeter();
    });
  }

  /* ── POSTS PANEL (long-form blog posts) ──────────────── */
  const postForm = $('#postForm');
  let postSource = 'upload';
  let postPickedFile = null;

  wireToggleGroup('postSourceToggle', (val) => {
    postSource = val;
    $('#postUploadField').style.display = val === 'upload' ? '' : 'none';
    $('#postUrlField').style.display = val === 'url' ? '' : 'none';
  });
  const postCoverFileInput = $('#postCoverFile');
  if (postCoverFileInput) {
    postCoverFileInput.addEventListener('change', () => {
      const file = postCoverFileInput.files[0];
      if (!file) return;
      if (file.size > MAX_PHOTO_BYTES) {
        toast(`That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_PHOTO_BYTES)}.`, 'error');
        postCoverFileInput.value = '';
        postPickedFile = null;
        return;
      }
      postPickedFile = file;
      const preview = $('#postUploadPreview');
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      const name = document.createElement('span'); name.className = 'name'; name.textContent = file.name;
      const size = document.createElement('span'); size.className = 'size'; size.textContent = formatBytes(file.size);
      preview.append(img, name, size);
      preview.style.display = 'flex';
    });
  }

  function renderPosts() {
    const posts = readJSON(LS.posts, []);
    const wrap = $('#postsTableWrap');
    if (!posts.length) {
      wrap.innerHTML = '<div class="table-empty"><i class="fas fa-pen-nib"></i>No posts published yet. Add one above.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Title</th><th>Category</th><th>Date</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    posts.forEach((post, idx) => {
      const tr = document.createElement('tr');
      const tdTitle = document.createElement('td');
      tdTitle.textContent = post.title + (idx === 0 ? ' \u2605' : '');
      const tdCat = document.createElement('td');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = post.category;
      tdCat.appendChild(pill);
      const tdDate = document.createElement('td'); tdDate.textContent = post.date || '—';
      const tdActions = document.createElement('td'); tdActions.className = 'actions';
      const upBtn = document.createElement('button'); upBtn.className = 'btn btn-ghost btn-sm'; upBtn.title = 'Make featured'; upBtn.innerHTML = '<i class="fas fa-star"></i>';
      upBtn.addEventListener('click', () => featurePost(post.id));
      const editBtn = document.createElement('button'); editBtn.className = 'btn btn-ghost btn-sm'; editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editBtn.addEventListener('click', () => editPost(post.id));
      const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.addEventListener('click', () => deletePost(post.id));
      tdActions.append(upBtn, editBtn, delBtn);
      tr.append(tdTitle, tdCat, tdDate, tdActions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }
  function featurePost(id) {
    const posts = readJSON(LS.posts, []);
    const idx = posts.findIndex(p => p.id === id);
    if (idx <= 0) return;
    const [post] = posts.splice(idx, 1);
    posts.unshift(post);
    writeJSON(LS.posts, posts);
    logEvent('Changed the featured post', true);
    toast('That post is now featured on the Posts page.', 'success');
    renderPosts();
  }
  function editPost(id) {
    const post = readJSON(LS.posts, []).find(p => p.id === id);
    if (!post) return;
    $('#postId').value = post.id;
    $('#postCoverBlobId').value = post.blobId || '';
    $('#postTitle').value = post.title || '';
    $('#postAuthor').value = post.author || '';
    $('#postCategory').value = post.category || 'story';
    $('#postDate').value = post.date || '';
    $('#postRead').value = post.read || '';
    $('#postExcerpt').value = post.excerpt || '';
    const bodyEditor = $('#postBodyEditor');
    const rawBody = Array.isArray(post.body) ? post.body.join('\n\n') : (post.body || '');
    const looksLikeHTML = /<\/?(p|br|b|strong|i|em|u|s|ul|ol|li|h3|h4|blockquote|a)\b/i.test(rawBody);
    if (looksLikeHTML) {
      bodyEditor.innerHTML = window.CindiSanitize ? window.CindiSanitize.clean(rawBody) : '';
    } else {
      bodyEditor.innerHTML = '';
      rawBody.split(/\n\s*\n/).forEach(block => {
        block = block.trim();
        if (!block) return;
        const p = document.createElement('p');
        p.textContent = block;
        bodyEditor.appendChild(p);
      });
    }
    $('#postSourceToggle .toggle-btn[data-value="url"]').click();
    $('#postImage').value = post.image && post.image.indexOf('idb:') === 0 ? '' : (post.image || '');
    if (post.image && post.image.indexOf('idb:') === 0) {
      $('#postImage').placeholder = '(currently an uploaded file — leave blank to keep it, or paste a link to replace it)';
    }
    $('#postFormTitle').textContent = 'Edit Post';
    $('#postCancelEdit').style.display = 'inline-flex';
    document.querySelector('.admin-nav button[data-panel="blogposts"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function deletePost(id) {
    if (!confirm('Delete this post from the public Posts page?')) return;
    const posts = readJSON(LS.posts, []);
    const post = posts.find(p => p.id === id);
    if (post && post.blobId && window.CindiMediaStore) {
      try { await window.CindiMediaStore.deleteBlob(post.blobId); } catch (err) {}
    }
    writeJSON(LS.posts, posts.filter(p => p.id !== id));
    logEvent('Deleted a post', true);
    toast('Post deleted.', 'info');
    renderPosts();
    refreshOverview();
    refreshStorageMeter();
  }
  function resetPostForm() {
    postForm.reset();
    $('#postId').value = '';
    $('#postCoverBlobId').value = '';
    $('#postFormTitle').textContent = 'Add a Post';
    $('#postCancelEdit').style.display = 'none';
    postPickedFile = null;
    $('#postUploadPreview').style.display = 'none';
    $('#postUploadPreview').innerHTML = '';
    $('#postCoverFile').value = '';
    $('#postBodyEditor').innerHTML = '';
    $('#postSourceToggle .toggle-btn[data-value="upload"]').click();
  }
  if (postForm) {
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const posts = readJSON(LS.posts, []);
      const id = $('#postId').value || ('post' + Date.now());
      let image = null, blobId = $('#postCoverBlobId').value || null;

      if (postSource === 'upload') {
        if (postPickedFile) {
          if (backendEnabled) {
            try {
              image = await uploadToServer(postPickedFile, 'photo');
              blobId = null;
            } catch (err) {
              toast(err.message, 'error');
              return;
            }
          } else {
            blobId = 'post_' + Date.now();
            try {
              await window.CindiMediaStore.putBlob(blobId, postPickedFile, { mime: postPickedFile.type, name: postPickedFile.name });
            } catch (err) {
              toast('Could not store that image on this device (it may be low on space).', 'error');
              return;
            }
            image = 'idb:' + blobId;
          }
        } else if (!blobId) {
          toast('Choose a cover image to upload, or switch to "Paste a link".', 'error');
          return;
        } else {
          image = 'idb:' + blobId;
        }
      } else {
        const raw = $('#postImage').value.trim();
        if (!isSafeMediaUrl(raw)) { toast('Image must be an images/ path or an https:// URL.', 'error'); return; }
        image = raw;
      }

      const bodyHTML = window.CindiSanitize ? window.CindiSanitize.clean($('#postBodyEditor').innerHTML) : '';
      if (!bodyHTML || !bodyHTML.replace(/<[^>]*>/g, '').trim()) {
        toast('Write the full post before saving.', 'error');
        return;
      }

      const entry = {
        id,
        title: $('#postTitle').value.trim().slice(0, 140),
        author: $('#postAuthor').value.trim().slice(0, 100),
        category: $('#postCategory').value,
        date: $('#postDate').value.trim().slice(0, 30),
        read: $('#postRead').value.trim().slice(0, 20) || '3 min read',
        image,
        blobId: postSource === 'upload' ? blobId : null,
        excerpt: $('#postExcerpt').value.trim().slice(0, 240),
        body: bodyHTML.slice(0, 12000)
      };
      const idx = posts.findIndex(p => p.id === id);
      if (idx >= 0) posts[idx] = entry; else posts.unshift(entry);
      writeJSON(LS.posts, posts);
      logEvent(idx >= 0 ? 'Edited a post' : 'Published a post', true);
      toast('Post saved and live on the Posts page.', 'success');
      resetPostForm();
      renderPosts();
      refreshOverview();
      refreshStorageMeter();
    });
  }
  const postCancelEdit = $('#postCancelEdit');
  if (postCancelEdit) postCancelEdit.addEventListener('click', resetPostForm);
  const resetPostsBtn = $('#resetPostsBtn');
  if (resetPostsBtn) {
    resetPostsBtn.addEventListener('click', async () => {
      if (!window.CindiSeed) return;
      if (!confirm('This replaces every post (including any you\'ve added or edited) with the site\'s original content. Uploaded cover images you added will also be removed from this device. Continue?')) return;
      const current = readJSON(LS.posts, []);
      for (const post of current) {
        if (post.blobId && window.CindiMediaStore) { try { await window.CindiMediaStore.deleteBlob(post.blobId); } catch (err) {} }
      }
      writeJSON(LS.posts, window.CindiSeed.posts);
      logEvent('Restored original Posts content', true);
      toast('Posts restored to original content.', 'info');
      renderPosts();
      refreshOverview();
      refreshStorageMeter();
    });
  }

  /* ── DOCUMENTS PANEL ──────────────────────────────────── */
  const documentForm = $('#documentForm');
  let docSource = 'upload';
  let docPickedFile = null;

  wireToggleGroup('docSourceToggle', (val) => {
    docSource = val;
    $('#docUploadField').style.display = val === 'upload' ? '' : 'none';
    $('#docUrlField').style.display = val === 'url' ? '' : 'none';
  });
  const docFileInput = $('#docFile');
  if (docFileInput) {
    docFileInput.addEventListener('change', () => {
      const file = docFileInput.files[0];
      if (!file) return;
      if (file.size > MAX_DOC_BYTES) {
        toast(`That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_DOC_BYTES)}.`, 'error');
        docFileInput.value = '';
        docPickedFile = null;
        return;
      }
      docPickedFile = file;
      if (!$('#docTitle').value) $('#docTitle').value = file.name.replace(/\.[^.]+$/, '');
    });
  }

  function renderDocuments() {
    const docs = readJSON(LS.documents, []);
    const wrap = $('#documentsTableWrap');
    if (!docs.length) {
      wrap.innerHTML = '<div class="table-empty"><i class="fas fa-file-lines"></i>No documents published yet. Add one above.</div>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Title</th><th>Category</th><th>Date</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    docs.forEach(doc => {
      const tr = document.createElement('tr');
      const tdTitle = document.createElement('td'); tdTitle.textContent = doc.title;
      const tdCat = document.createElement('td');
      const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = doc.category;
      tdCat.appendChild(pill);
      const tdDate = document.createElement('td'); tdDate.textContent = doc.date || '—';
      const tdActions = document.createElement('td'); tdActions.className = 'actions';
      const editBtn = document.createElement('button'); editBtn.className = 'btn btn-ghost btn-sm'; editBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editBtn.addEventListener('click', () => editDocument(doc.id));
      const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.innerHTML = '<i class="fas fa-trash"></i>';
      delBtn.addEventListener('click', () => deleteDocument(doc.id));
      tdActions.append(editBtn, delBtn);
      tr.append(tdTitle, tdCat, tdDate, tdActions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }
  function editDocument(id) {
    const doc = readJSON(LS.documents, []).find(d => d.id === id);
    if (!doc) return;
    $('#docId').value = doc.id;
    $('#docBlobId').value = doc.blobId || '';
    $('#docTitle').value = doc.title;
    $('#docCategory').value = doc.category;
    $('#docDate').value = doc.date || '';
    $('#docDescription').value = doc.description || '';
    $('#docSourceToggle .toggle-btn[data-value="url"]').click();
    $('#docUrl').value = doc.url && doc.url.indexOf('idb:') === 0 ? '' : (doc.url || '');
    if (doc.url && doc.url.indexOf('idb:') === 0) {
      $('#docUrl').placeholder = '(currently an uploaded file — leave blank to keep it, or paste a link to replace it)';
    }
    $('#docFormTitle').textContent = 'Edit Document';
    $('#docCancelEdit').style.display = 'inline-flex';
    document.querySelector('.admin-nav button[data-panel="documents"]').click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function deleteDocument(id) {
    if (!confirm('Delete this document from the public Documents page?')) return;
    const docs = readJSON(LS.documents, []);
    const doc = docs.find(d => d.id === id);
    if (doc && doc.blobId && window.CindiMediaStore) {
      try { await window.CindiMediaStore.deleteBlob(doc.blobId); } catch (err) {}
    }
    writeJSON(LS.documents, docs.filter(d => d.id !== id));
    logEvent('Deleted a document', true);
    toast('Document deleted.', 'info');
    renderDocuments();
    refreshOverview();
    refreshStorageMeter();
  }
  function resetDocumentForm() {
    documentForm.reset();
    $('#docId').value = '';
    $('#docBlobId').value = '';
    $('#docFormTitle').textContent = 'Add a Document';
    $('#docCancelEdit').style.display = 'none';
    docPickedFile = null;
    $('#docSourceToggle .toggle-btn[data-value="upload"]').click();
  }
  if (documentForm) {
    documentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const docs = readJSON(LS.documents, []);
      const id = $('#docId').value || ('doc' + Date.now());
      let url = null, blobId = $('#docBlobId').value || null, fileName = null;

      if (docSource === 'upload') {
        if (docPickedFile) {
          if (backendEnabled) {
            try {
              url = await uploadToServer(docPickedFile, 'document');
              blobId = null;
              fileName = docPickedFile.name;
            } catch (err) {
              toast(err.message, 'error');
              return;
            }
          } else {
            blobId = 'doc_' + Date.now();
            try {
              await window.CindiMediaStore.putBlob(blobId, docPickedFile, { mime: docPickedFile.type, name: docPickedFile.name });
            } catch (err) {
              toast('Could not store that file on this device (it may be low on space).', 'error');
              return;
            }
            url = 'idb:' + blobId;
            fileName = docPickedFile.name;
          }
        } else if (!blobId) {
          toast('Choose a file to upload, or switch to "Paste a link".', 'error');
          return;
        } else {
          url = 'idb:' + blobId;
        }
      } else {
        const raw = $('#docUrl').value.trim();
        if (!/^https:\/\//i.test(raw) && !/^\/uploads\/[a-f0-9]+\.[a-z0-9]+$/i.test(raw)) { toast('Document link must start with https://', 'error'); return; }
        url = raw;
      }

      const entry = {
        id,
        url,
        blobId: docSource === 'upload' ? blobId : null,
        fileName,
        title: $('#docTitle').value.trim().slice(0, 120),
        category: $('#docCategory').value,
        date: $('#docDate').value.trim().slice(0, 30),
        description: $('#docDescription').value.trim().slice(0, 200)
      };
      const idx = docs.findIndex(d => d.id === id);
      if (idx >= 0) docs[idx] = entry; else docs.unshift(entry);
      writeJSON(LS.documents, docs);
      logEvent(idx >= 0 ? 'Edited a document' : 'Published a document', true);
      toast('Document saved and live on the Documents page.', 'success');
      resetDocumentForm();
      renderDocuments();
      refreshOverview();
      refreshStorageMeter();
    });
  }
  const docCancelEdit = $('#docCancelEdit');
  if (docCancelEdit) docCancelEdit.addEventListener('click', resetDocumentForm);

  /* ── CHANGE PASSWORD ───────────────────────────────── */
  const passwordForm = $('#passwordForm');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (backendEnabled) {
        const current = $('#curPassword').value;
        const next = $('#newPassword').value;
        if (next !== $('#newPasswordConfirm').value) return toast("New passwords don't match.", 'error');
        try {
          await apiRequest('/api/admin/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current, password: next })
          });
          toast('Password updated.', 'success');
          passwordForm.reset();
        } catch (error) { toast(error.message, 'error'); }
        return;
      }
      const meta = readJSON(LS.meta, null);
      if (!meta) return;
      const cur = $('#curPassword').value;
      const next = $('#newPassword').value;
      const next2 = $('#newPasswordConfirm').value;
      if (next !== next2) return toast("New passwords don't match.", 'error');
      if (next.length < 10) return toast('New password must be at least 10 characters.', 'error');

      const curHash = await deriveHash(cur, meta.saltHex, meta.iterations);
      if (!timingSafeEqual(curHash, meta.hashHex)) {
        logEvent('Failed password change (wrong current password)', false);
        return toast('Current password is incorrect.', 'error');
      }
      const saltHex = randomSaltHex();
      const hashHex = await deriveHash(next, saltHex, ITERATIONS);
      writeJSON(LS.meta, Object.assign({}, meta, { saltHex, hashHex, iterations: ITERATIONS }));
      logEvent('Password changed', true);
      toast('Password updated.', 'success');
      passwordForm.reset();
    });
  }

  /* ── BACKUP EXPORT / IMPORT ────────────────────────── */
  const exportBtn = $('#exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Preparing backup…';
      try {
        const gallery = readJSON(LS.gallery, []);
        const documents = readJSON(LS.documents, []);
        const posts = readJSON(LS.posts, []);
        const blobsOut = {};
        // Embed every on-device upload as base64 so the backup is portable to another browser/device.
        for (const item of [...gallery, ...documents, ...posts]) {
          if (item.blobId && window.CindiMediaStore) {
            const rec = await window.CindiMediaStore.getRecord(item.blobId);
            if (rec && rec.blob) blobsOut[item.blobId] = { dataUrl: await blobToDataURL(rec.blob), mime: rec.mime, name: rec.name };
          }
        }
        const backup = {
          exportedAt: new Date().toISOString(),
          stats: readJSON(LS.stats, DEFAULT_STATS),
          news: readJSON(LS.news, []),
          posts,
          gallery,
          documents,
          blobs: blobsOut
        };
        const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cindi-content-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        logEvent('Exported content backup', true);
      } catch (err) {
        toast('Export failed — see console for details.', 'error');
        console.error(err);
      } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="fas fa-download"></i> Export backup';
      }
    });
  }
  const importFile = $('#importFile');
  if (importFile) {
    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== 'object') throw new Error('bad format');
          if (!confirm('This will replace your current stats, news, gallery, and documents with the file you selected. Continue?')) return;
          if (data.blobs && window.CindiMediaStore) {
            for (const [blobId, rec] of Object.entries(data.blobs)) {
              try { await window.CindiMediaStore.putBlob(blobId, dataURLToBlob(rec.dataUrl), { mime: rec.mime, name: rec.name }); } catch (err) {}
            }
          }
          if (data.stats) writeJSON(LS.stats, data.stats);
          if (Array.isArray(data.news)) writeJSON(LS.news, data.news);
          if (Array.isArray(data.posts)) writeJSON(LS.posts, data.posts);
          if (Array.isArray(data.gallery)) writeJSON(LS.gallery, data.gallery);
          if (Array.isArray(data.documents)) writeJSON(LS.documents, data.documents);
          logEvent('Imported content backup', true);
          toast('Backup imported successfully.', 'success');
          renderStatsForm(); renderNews(); renderPosts(); renderGallery(); renderDocuments(); refreshOverview(); refreshStorageMeter();
        } catch (err) {
          toast('That file could not be read as a valid backup.', 'error');
        }
      };
      reader.readAsText(file);
      importFile.value = '';
    });
  }

  /* ── GO ─────────────────────────────────────────────── */
  boot();

})();
