// Demotes Instacart produce you shouldn't buy conventional, and answers
// scan/audit requests from the popup.
//
// The page itself is the interface. Rather than badge every tile, we change how
// tiles LOOK so the eye skips the wrong ones:
//
//   conventional Dirty Dozen  -> greyed + faded (or hidden, if the user asks)
//   conventional caution tier -> lightly faded ("meh", not "no")
//   organic (any tier)        -> ✓ ORGANIC check, the thing to steer toward
//   clean / moderate          -> untouched. Silence means conventional is fine.
//
// Demotion is never absolute: a dimmed tile restores on hover and stays
// clickable, so the user can always overrule us.
(function () {
  'use strict';

  const { classify } = window.ProduceMatch;
  const BADGE_CLASS = 'io-badge';
  const NOTE_CLASS = 'io-note';
  const MARK = 'ioBadged';

  // Every product tile — grid, carousel, cart drawer, checkout — wraps its
  // content in a link to /products/. Anchoring to that instead of guessing at
  // card container classes makes this independent of tile layout.
  const PRODUCT_LINK = 'a[href*="/products/"]';

  // The product detail page is the one view with no tile to treat: the item
  // you're looking at isn't a link to itself, so the grid logic above sees
  // nothing (only the related-item carousels below it). That's the view where
  // the buy decision actually happens, so it gets its own treatment — a banner
  // under the title rather than dimming, since dimming the page you chose to
  // open is useless.
  const PDP_CLASS = 'io-pdp';

  // The product slug in the URL, minus its leading numeric id:
  //   /products/17327024-organic-strawberries-package-32-oz
  //             -> "organic strawberries package 32 oz"
  //
  // The URL is the title source, NOT the DOM. Instacart opens a product as a
  // MODAL over whatever you were looking at, so the first <h1> on a product
  // page is still the search heading — reading it classified
  // `Results for "strawberries"` and stamped BUY ORGANIC onto a page of
  // organic strawberries. The slug is unambiguous and can't drift with layout.
  const PDP_PATH = /\/products\/(?:\d+-)?([^/?#]+)/;

  const CART_SELECTORS = [
    '[data-testid="cart-sidesheet"]',
    '[data-testid="cart-side-sheet"]',
    '[aria-label*="cart" i]',
    '[data-testid*="order-item-list"]',
  ];

  let hideMode = false; // false = dim (default), true = remove from the grid

  function productLinks(root) {
    const scope = root || document;
    const links = [...scope.querySelectorAll(PRODUCT_LINK)];
    // Instacart sometimes nests a second product link inside a tile; keep only
    // the outermost so a tile is never processed twice.
    return links.filter((a) => !links.some((other) => other !== a && other.contains(a)));
  }

  // Dimming has to apply to the whole tile (image, name, price), not just the
  // <a>. Climb from the link to the largest ancestor that still contains
  // exactly ONE product link — the moment an ancestor wraps a second product,
  // we've left the tile and are about to grey out the entire grid.
  function tileOf(link) {
    let best = link;
    let node = link.parentNode;
    for (let depth = 0; node && node.nodeType === 1 && node !== document.body && depth < 8; depth++) {
      if (node.querySelectorAll(PRODUCT_LINK).length !== 1) break;
      best = node;
      node = node.parentNode;
    }
    return best;
  }

  // `textContent` concatenates adjacent elements with NO separator, so the size
  // span glues onto the last title word:
  //   "Wegmans Organic Cauliflower" + "1 each" -> "…Cauliflower1 each"
  // and "cauliflower1" fails the whole-word matcher — which silently skipped
  // every tile whose title ENDED in the produce word. Pad element boundaries;
  // normalize() collapses the extras.
  //
  // Our own badge is excluded: its label contains "ORGANIC", so reading it back
  // would flip a conventional item to an organic verdict on the next sweep.
  function textWithoutBadges(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    if (node.classList &&
        (node.classList.contains(BADGE_CLASS) ||
         node.classList.contains(NOTE_CLASS) ||
         node.classList.contains(PDP_CLASS))) return '';
    let text = '';
    for (const child of node.childNodes) {
      const t = textWithoutBadges(child);
      // Space-pad element boundaries only — text nodes may legitimately split
      // mid-word ("Driscoll" + "’s"); elements are layout boundaries.
      text += child.nodeType === 1 ? ' ' + t + ' ' : t;
    }
    return text;
  }

  function titleOf(link) {
    return textWithoutBadges(link).trim() || (link.getAttribute('aria-label') || '').trim();
  }

  // What this tile should look like, given its verdict and whether an organic
  // alternative for the same produce exists anywhere on the page.
  //
  // `hasOrganicAlt` is the escape hatch: if the store stocks no organic
  // strawberries, dimming every strawberry leaves a wall of grey and no way
  // forward. In that case we leave the tiles alone and say so instead.
  function desiredState(verdict, hasOrganicAlt) {
    if (!verdict) return { badge: null, demote: null, hidden: false };
    if (verdict.organic) return { badge: 'organic', demote: null, hidden: false };

    const actionable = verdict.tier === 'dirty' || verdict.tier === 'caution';
    if (!actionable) return { badge: null, demote: null, hidden: false };

    if (!hasOrganicAlt) {
      // Nothing better to switch to — don't punish the only option available.
      return { badge: verdict.tier === 'dirty' ? 'note' : null, demote: null, hidden: false };
    }
    return {
      badge: null,
      demote: verdict.tier === 'dirty' ? 'strong' : 'light',
      hidden: hideMode && verdict.tier === 'dirty',
    };
  }

  function makeBadge(verdict, kind) {
    const el = document.createElement('span');
    if (kind === 'note') {
      el.className = NOTE_CLASS;
      el.textContent = 'NO ORGANIC OPTION';
      el.title = `${verdict.label} — ${verdict.advice} No organic alternative on this page.`;
      return el;
    }
    el.className = `${BADGE_CLASS} ${BADGE_CLASS}--organic`;
    el.textContent = '✓ ORGANIC';
    el.title = `${verdict.label} — ${verdict.advice}`;
    return el;
  }

  const DEMOTE_CLASSES = ['io-demote--strong', 'io-demote--light'];

  // Converge one tile's DOM to `state`, touching it only where it differs.
  // Idempotence is load-bearing: every mutation we make re-triggers the
  // MutationObserver, so a sweep that always writes would loop forever.
  //
  // It also can't be a write-once memo. Two live-page realities break that:
  //   1. Lazy tiles mount with PARTIAL text (a price, a "Buy it again" chip)
  //      before the name streams in — classifying that fragment yields null and
  //      a permanent memo would poison the tile forever.
  //   2. Instacart is React: a re-render can reconcile away our injected span
  //      while keeping the anchor, so "marked" never proves "still styled".
  function applyTile(link, verdict, hasOrganicAlt) {
    const state = desiredState(verdict, hasOrganicAlt);
    const tile = tileOf(link);

    const existing = link.querySelector('.' + BADGE_CLASS) || link.querySelector('.' + NOTE_CLASS);
    if (state.badge) {
      const wanted = makeBadge(verdict, state.badge);
      if (!existing || existing.className !== wanted.className || existing.textContent !== wanted.textContent) {
        if (existing) existing.remove();
        if (getComputedStyle(link).position === 'static') link.style.position = 'relative';
        link.appendChild(wanted);
      } else if (getComputedStyle(link).position === 'static') {
        link.style.position = 'relative'; // re-render wiped our inline style
      }
    } else if (existing) {
      existing.remove();
    }

    const wantedDemote = state.demote ? `io-demote--${state.demote}` : null;
    for (const cls of DEMOTE_CLASSES) {
      if (cls !== wantedDemote && tile.classList.contains(cls)) tile.classList.remove(cls);
    }
    if (wantedDemote && !tile.classList.contains(wantedDemote)) tile.classList.add(wantedDemote);

    if (state.hidden && !tile.classList.contains('io-hidden')) tile.classList.add('io-hidden');
    if (!state.hidden && tile.classList.contains('io-hidden')) tile.classList.remove('io-hidden');
  }

  // Read the product name off the URL. See PDP_PATH: the DOM heading belongs to
  // the page BEHIND the modal, so it names the wrong product.
  function heroTitle() {
    const match = PDP_PATH.exec(location.pathname);
    if (!match) return null;
    const title = decodeURIComponent(match[1]).replace(/-/g, ' ').trim();
    if (!title) return null;
    const verdict = classify(title);
    return verdict ? { title, verdict } : null;
  }

  // Where the banner goes. The modal is the product; anything outside it
  // belongs to the page the user was on before, so a banner there would
  // annotate the wrong thing.
  function heroAnchor() {
    const dialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
    if (dialog) return { node: dialog, position: 'inside' };
    // Direct navigation renders the product as a full page, where the first
    // heading really is the product name.
    const h1 = document.querySelector('h1');
    return h1 ? { node: h1, position: 'after' } : null;
  }

  // On a tile, silence means "conventional is fine" — badging every clean item
  // would be noise across a whole grid. A product page is one deliberate item,
  // so the clean and moderate verdicts are worth stating outright: "save your
  // money here" is the advice people most often get wrong.
  function heroBanner(verdict) {
    const el = document.createElement('div');
    const mod = verdict.organic ? 'organic' : verdict.tier;
    el.className = `${PDP_CLASS} ${PDP_CLASS}--${mod}`;
    el.textContent = verdict.organic ? '✓ ORGANIC' : verdict.badge;
    el.title = `${verdict.label} — ${verdict.advice}`;
    return el;
  }

  // Same convergence contract as applyTile: idempotent, and re-derived every
  // sweep rather than memoized. SPA navigation swaps the <h1> in place without
  // a reload, so a stale banner has to be removable on any sweep.
  function applyHero() {
    const existing = document.querySelector('.' + PDP_CLASS);
    const hero = heroTitle();
    const anchor = hero ? heroAnchor() : null;

    if (!hero || !anchor) {
      if (existing) existing.remove();
      return;
    }

    const wanted = heroBanner(hero.verdict);
    const placed = anchor.position === 'inside'
      ? existing && existing.parentNode === anchor.node
      : existing && existing.parentNode === anchor.node.parentNode;

    if (placed &&
        existing.className === wanted.className &&
        existing.textContent === wanted.textContent) return;
    // Either the verdict changed or the modal re-mounted around a different
    // product, leaving our banner attached to a stale container.
    if (existing) existing.remove();

    if (anchor.position === 'inside') {
      anchor.node.insertBefore(wanted, anchor.node.firstChild);
    } else if (anchor.node.parentNode) {
      anchor.node.parentNode.insertBefore(wanted, anchor.node.nextSibling);
    }
  }

  function sweep() {
    applyHero();
    const links = productLinks();

    // Pass 1: classify. A tile whose title hasn't streamed in yet is skipped
    // entirely (not marked), so a later sweep retries it.
    const seen = [];
    for (const link of links) {
      const title = titleOf(link);
      if (!title) continue;
      const verdict = classify(title);
      link.dataset[MARK] = verdict ? verdict.key : 'none'; // debug breadcrumb
      seen.push({ link, verdict });
    }

    // Pass 2: does an organic alternative exist on this page, per produce type?
    // Recomputed every sweep so an organic tile that lazy-loads in later can
    // flip its group from "leave alone" to "demote".
    const hasOrganic = new Set();
    for (const { verdict } of seen) {
      if (verdict && verdict.organic) hasOrganic.add(verdict.key);
    }

    // Pass 3: converge.
    for (const { link, verdict } of seen) {
      applyTile(link, verdict, verdict ? hasOrganic.has(verdict.key) : false);
    }
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
    if (msg.type === 'SET_MODE') {
      hideMode = msg.hideMode;
      sweep();
      return Promise.resolve({ ok: true });
    }
    if (msg.type === 'SCAN_PAGE') {
      sweep();
      // The hero product has no tile, so collect() can't see it. On a product
      // page it's the item the user is asking about — list it first.
      const hero = heroTitle();
      const items = collect(document);
      if (hero && hero.verdict && !items.some((i) => i.title === hero.title)) {
        items.unshift({ title: hero.title, ...hero.verdict });
      }
      return Promise.resolve({ scope: 'page', items });
    }
    if (msg.type === 'AUDIT_CART') {
      const cart = findCart();
      if (!cart) return Promise.resolve({ scope: 'cart', cartFound: false, items: [] });
      return Promise.resolve({ scope: 'cart', cartFound: true, items: collect(cart) });
    }
    return undefined;
  });

  if (typeof browser !== 'undefined' && browser.storage) {
    // Falling back to dim-mode on a storage failure is the safe default: it
    // shows every tile. Silently hiding items because we couldn't read a pref
    // would be the worst outcome.
    browser.storage.local.get({ hideMode: false })
      .then((cfg) => { hideMode = !!cfg.hideMode; sweep(); })
      .catch(() => { hideMode = false; });
  }

  sweep();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // Test hook for test/content.dom.test.js; inert in production.
  window.__ioContentInternals = {
    productLinks, titleOf, tileOf, sweep, collect, heroTitle, applyHero,
    setHideMode: (v) => { hideMode = v; },
  };
})();
