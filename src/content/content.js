// Injects verdict badges onto Instacart product tiles and answers scan/audit
// requests from the popup.
//
// Badging is deliberately quiet: only items worth acting on get a badge (buy
// organic / prefer organic), plus a check on items that already are organic.
// An unbadged tile means "conventional is fine" — silence is the signal.
(function () {
  'use strict';

  const { classify } = window.ProduceMatch;
  const BADGE_CLASS = 'io-badge';
  const MARK = 'ioBadged';

  // Every product tile — grid, carousel, cart drawer, checkout — wraps its
  // content in a link to /products/. Anchoring to that instead of guessing at
  // card container classes makes badging independent of tile layout, which is
  // what broke whole-head items ("1 each") while bagged florets worked.
  const PRODUCT_LINK = 'a[href*="/products/"]';

  const CART_SELECTORS = [
    '[data-testid="cart-sidesheet"]',
    '[data-testid="cart-side-sheet"]',
    '[aria-label*="cart" i]',
    '[data-testid*="order-item-list"]',
  ];

  function productLinks(root) {
    const scope = root || document;
    const links = [...scope.querySelectorAll(PRODUCT_LINK)];
    // Instacart sometimes nests a second product link inside a tile; badge only
    // the outermost so a tile never gets two pills.
    return links.filter((a) => !links.some((other) => other !== a && other.contains(a)));
  }

  // The anchor's full text is noisier than a clean title but classify()
  // matches on whole words, so price and size are harmless — IF they stay
  // separate words. `textContent` concatenates adjacent elements with NO
  // separator, so the size span glues onto the last title word:
  //   "Wegmans Organic Cauliflower" + "1 each" -> "…Cauliflower1 each"
  // and "cauliflower1" fails the whole-word matcher. That silently unbadged
  // every tile whose title ENDED in the produce word (whole head "1 each",
  // "Frozen Riced Cauliflower" + "16 oz") while "…Cauliflower Florets10 oz"
  // kept working. So we pad each element's text with spaces; normalize()
  // collapses the extras.
  //
  // Our own badge must also be excluded: every badge label contains the word
  // "ORGANIC", so reading it back via textContent would flip a conventional
  // Dirty Dozen item to an organic verdict on the next sweep.
  function textWithoutBadges(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    if (node.classList && node.classList.contains(BADGE_CLASS)) return '';
    let text = '';
    for (const child of node.childNodes) {
      const t = textWithoutBadges(child);
      // Space-pad element boundaries only — text nodes may legitimately split
      // mid-word ("Driscoll" + "’s"), elements are layout boundaries.
      text += child.nodeType === 1 ? ' ' + t + ' ' : t;
    }
    return text;
  }

  function titleOf(link) {
    return textWithoutBadges(link).trim() || (link.getAttribute('aria-label') || '').trim();
  }

  function shouldBadge(verdict) {
    return verdict.organic || verdict.tier === 'dirty' || verdict.tier === 'caution';
  }

  function makeBadge(verdict) {
    const el = document.createElement('span');
    el.className = `${BADGE_CLASS} ${BADGE_CLASS}--${verdict.organic ? 'organic' : verdict.tier}`;
    el.textContent = verdict.organic ? '✓ ORGANIC' : verdict.badge;
    el.title = `${verdict.label} — ${verdict.advice}`;
    return el;
  }

  // Idempotent per-sweep reconciliation of one tile. Two live-page realities
  // make a write-once memo (the old `if (link.dataset[MARK]) return`) wrong:
  //
  //   1. Lazy-loaded tiles mount with PARTIAL non-empty text — a price, a
  //      "Buy it again" chip — before the product name streams in. Classifying
  //      that fragment yields null, and a permanent memo poisons the tile
  //      forever ("Wegmans Organic Cauliflower", "…Frozen Riced Cauliflower").
  //   2. Instacart is a React SPA: a re-render (image load, buy-again state)
  //      can reconcile away our injected span and inline style while keeping
  //      the anchor element — so "marked" never proves "still badged".
  //
  // So: re-derive the verdict from the CURRENT title every sweep and converge
  // the DOM to it, touching the DOM only when it actually differs (otherwise
  // each sweep's mutations would re-trigger the observer in a loop).
  function badgeLink(link) {
    const title = titleOf(link);
    if (!title) return; // tile still skeleton-loading; retry on a later sweep

    const verdict = classify(title);
    link.dataset[MARK] = verdict ? verdict.key : 'none'; // debug/popup breadcrumb only
    const existing = link.querySelector('.' + BADGE_CLASS);

    if (!verdict || !shouldBadge(verdict)) {
      if (existing) existing.remove(); // verdict computed from an earlier partial title
      return;
    }

    const badge = makeBadge(verdict);
    if (existing) {
      if (existing.className === badge.className && existing.textContent === badge.textContent) {
        // Already correct — but re-assert positioning in case a re-render wiped
        // the inline style and left the badge anchored to the wrong ancestor.
        if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
        return;
      }
      existing.remove();
    }
    if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
    link.appendChild(badge);
  }

  function sweep() {
    productLinks().forEach(badgeLink);
  }

  // Instacart is a SPA and lazy-loads tiles on scroll; re-sweep on DOM churn.
  let pending = null;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      sweep();
    }, 250);
  });

  function collect(root) {
    const items = [];
    for (const link of productLinks(root)) {
      const title = titleOf(link);
      if (!title) continue;
      const verdict = classify(title);
      if (verdict) items.push({ title, ...verdict });
    }
    // De-dupe: carousels repeat the same product across rails.
    const seen = new Set();
    return items.filter((i) => (seen.has(i.title) ? false : seen.add(i.title)));
  }

  function findCart() {
    for (const sel of CART_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && collect(el).length) return el;
    }
    return null;
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SCAN_PAGE') {
      sweep();
      return Promise.resolve({ scope: 'page', items: collect(document) });
    }
    if (msg.type === 'AUDIT_CART') {
      const cart = findCart();
      if (!cart) return Promise.resolve({ scope: 'cart', cartFound: false, items: [] });
      return Promise.resolve({ scope: 'cart', cartFound: true, items: collect(cart) });
    }
    return undefined;
  });

  sweep();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Test hook for test/content.dom.test.js (node vm + minimal DOM stub);
  // inert in production.
  window.__ioContentInternals = { productLinks, titleOf, badgeLink, sweep, collect };
})();
