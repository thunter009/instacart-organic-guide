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

  // The anchor's full text ("$5.19Wegmans Organic Cauliflower Florets10 oz") is
  // noisier than a clean title but classify() matches on whole words, so the
  // price and size are harmless — and this needs no per-layout title selector.
  function titleOf(link) {
    return (link.textContent || '').trim() || link.getAttribute('aria-label') || '';
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

  function badgeLink(link) {
    if (link.dataset[MARK]) return;
    const title = titleOf(link);
    if (!title) return; // tile still skeleton-loading; leave unmarked so we retry

    const verdict = classify(title);
    link.dataset[MARK] = verdict ? verdict.key : 'none';
    if (!verdict || !shouldBadge(verdict)) return;

    if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
    link.appendChild(makeBadge(verdict));
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
  observer.observe(document.body, { childList: true, subtree: true });
})();
