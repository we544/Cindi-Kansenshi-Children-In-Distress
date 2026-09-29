/* ============================================================
   CINDI Kansenshi — HTML Sanitizer
   ------------------------------------------------------------
   Used to clean up the rich-text editor output in the admin
   Posts panel before it's saved, and again before it's rendered
   on the public Posts page (defense in depth — sanitizing twice
   costs nothing and protects against a tampered localStorage
   value, e.g. from a hand-edited import file).
   Approach: allow-list only. Anything not explicitly allowed is
   unwrapped (its children are kept, the tag itself is dropped)
   rather than deleted outright, so formatting mistakes don't
   eat content. <script>, <style>, event handler attributes
   (onclick, onerror, ...), and javascript:/data: URLs are always
   removed regardless of tag.
   ============================================================ */
(function (global) {
  'use strict';

  const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'H3', 'H4', 'BLOCKQUOTE', 'A', 'SPAN', 'DIV']);
  const ALWAYS_STRIP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'BASE']);

  function isSafeHref(href) {
    if (!href) return false;
    const trimmed = href.trim();
    return /^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed);
  }

  function clean(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString('<div id="__root">' + html + '</div>', 'text/html');
    const root = doc.getElementById('__root');
    if (!root) return '';

    // Capture safe hrefs in a WeakMap first, since attribute-stripping below
    // would otherwise remove them along with everything else on the element.
    const keptHrefs = new WeakMap();
    root.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (isSafeHref(href)) keptHrefs.set(a, href.trim());
    });

    function walk(node) {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) return; // text is always safe
        if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); return; }

        const tag = child.tagName;

        if (ALWAYS_STRIP.has(tag)) { child.remove(); return; }

        if (!ALLOWED_TAGS.has(tag)) {
          // Unwrap: keep the children, drop the wrapping element.
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          walk(node);
          return;
        }

        const hrefToRestore = tag === 'A' ? keptHrefs.get(child) : null;
        Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
        if (hrefToRestore) {
          child.setAttribute('href', hrefToRestore);
          child.setAttribute('rel', 'noopener noreferrer');
          child.setAttribute('target', '_blank');
        }
        walk(child);
      });
    }

    walk(root);
    return root.innerHTML;
  }

  global.CindiSanitize = { clean };
})(window);
