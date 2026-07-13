// Paste into the Firefox console on Instacart WITH THE CART DRAWER OPEN.
// Prints the structure of the cart so cart detection can be built from the real
// DOM instead of guessed selectors. Read-only: it mutates nothing.
(() => {
  const out = {};

  out.url = location.pathname;

  // Which of the current (failing) guesses match anything at all?
  out.currentGuesses = [
    '[data-testid="cart-sidesheet"]',
    '[data-testid="cart-side-sheet"]',
    '[aria-label*="cart" i]',
    '[data-testid*="order-item-list"]',
  ].map((sel) => ({ sel, matches: document.querySelectorAll(sel).length }));

  // Anything that smells like a cart, by any attribute.
  const smells = [...document.querySelectorAll('*')].filter((el) => {
    const s = (el.getAttribute('data-testid') || '') + ' ' +
              (el.getAttribute('aria-label') || '') + ' ' +
              (el.getAttribute('id') || '') + ' ' +
              (typeof el.className === 'string' ? el.className : '');
    return /cart|basket|sidesheet|side-sheet|drawer/i.test(s);
  });
  out.cartishElements = smells.slice(0, 25).map((el) => ({
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute('data-testid'),
    role: el.getAttribute('role'),
    ariaLabel: el.getAttribute('aria-label'),
    cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
    productLinks: el.querySelectorAll('a[href*="/products/"]').length,
    pos: getComputedStyle(el).position,
  }));

  // Overlays: the drawer is almost certainly fixed-position.
  out.fixedContainers = [...document.querySelectorAll('*')]
    .filter((el) => {
      const p = getComputedStyle(el).position;
      return (p === 'fixed' || p === 'sticky') && el.querySelectorAll('a,li,img').length > 3;
    })
    .slice(0, 15)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid'),
      role: el.getAttribute('role'),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
      productLinks: el.querySelectorAll('a[href*="/products/"]').length,
      listItems: el.querySelectorAll('li').length,
      text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
    }));

  out.dialogs = [...document.querySelectorAll('[role="dialog"], dialog, aside')].map((el) => ({
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute('data-testid'),
    ariaLabel: el.getAttribute('aria-label'),
    productLinks: el.querySelectorAll('a[href*="/products/"]').length,
    listItems: el.querySelectorAll('li').length,
    text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 120),
  }));

  out.totalProductLinks = document.querySelectorAll('a[href*="/products/"]').length;

  // THE KEY QUESTION: do cart rows even use /products/ links, or something else?
  // Find an element whose text looks like a cart line item and dump its markup.
  const dialog = document.querySelector('[role="dialog"], aside');
  if (dialog) {
    const row = dialog.querySelector('li') || dialog.querySelector('a');
    out.sampleCartRowHTML = row ? row.outerHTML.slice(0, 900) : '(no li/a inside dialog)';
  } else {
    out.sampleCartRowHTML = '(no [role=dialog] or aside found)';
  }

  console.log(JSON.stringify(out, null, 2));
  return out;
})();
