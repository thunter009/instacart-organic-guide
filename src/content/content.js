// Injects verdict badges onto Instacart product tiles and answers scan/audit
// requests from the popup.
(function () {
  'use strict';

  const { classify } = window.ProduceMatch;
  const BADGE_CLASS = 'io-badge';
  const MARK = 'ioBadged';

  // Instacart ships several card layouts (search grid, aisle carousel, cart
  // drawer, checkout list). Selectors are best-effort and ordered most-specific
  // first; the generic fallback catches layouts we don't know about.
  const CARD_SELECTORS = [
    '[data-testid^="item_list_item"]',
    '[data-testid="item-card"]',
    '[data-testid^="product-card"]',
    'li[data-testid][role="listitem"]',
  ];
  const TITLE_SELECTORS = [
    '[data-testid="item-name"]',
    '[data-testid="itemCardName"]',
    'h3',
    'h4',
    'a[href*="/products/"]',
  ];
  const CART_SELECTORS = [
    '[data-testid="cart-sidesheet"]',
    '[data-testid="cart-side-sheet"]',
    '[aria-label*="cart" i]',
    '[data-testid*="order-item-list"]',
  ];

  function cards(root) {
    const scope = root || document;
    const found = new Set();
    for (const sel of CARD_SELECTORS) {
      scope.querySelectorAll(sel).forEach((el) => found.add(el));
    }
    if (found.size === 0) {
      // Fallback: any product link, badged on its nearest list-ish ancestor.
      scope.querySelectorAll('a[href*="/products/"]').forEach((a) => {
        found.add(a.closest('li, article, [class*="card" i]') || a);
      });
    }
    return [...found];
  }

  function titleOf(card) {
    for (const sel of TITLE_SELECTORS) {
      const el = card.querySelector(sel);
      const text = el && el.textContent.trim();
      if (text) return text;
    }
    return card.getAttribute('aria-label') || '';
  }

  function makeBadge(verdict) {
    const el = document.createElement('div');
    el.className = `${BADGE_CLASS} ${BADGE_CLASS}--${verdict.organic ? 'organic' : verdict.tier}`;
    el.textContent = verdict.organic ? '✓ ORGANIC' : verdict.badge;
    el.title = `${verdict.label} — ${verdict.advice}`;
    return el;
  }

  function badgeCard(card) {
    if (card.dataset[MARK]) return null;
    const title = titleOf(card);
    if (!title) return null;

    const verdict = classify(title);
    card.dataset[MARK] = verdict ? verdict.key : 'none';
    if (!verdict) return null;

    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';
    card.appendChild(makeBadge(verdict));
    return { title, ...verdict };
  }

  function sweep() {
    cards().forEach(badgeCard);
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
    for (const card of cards(root)) {
      const title = titleOf(card);
      if (!title) continue;
      const verdict = classify(title);
      if (verdict) items.push({ title, ...verdict });
    }
    // De-dupe: carousels repeat the same product in multiple rails.
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
