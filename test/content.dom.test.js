// node test/content.dom.test.js
//
// DOM-layer regression tests for src/content/content.js, zero-dependency.
// match.test.js proves classify() is correct on all the Wegmans cauliflower
// titles; the live bug was in the tile-finding / badge-injection layer, so
// these tests drive content.js's real functions against a minimal DOM stub
// using structures observed on a live Instacart search grid:
//
//   - tiles that mount with PARTIAL text (price / "Buy it again" chip) before
//     the product name streams in (lazy-loaded "Wegmans Organic Cauliflower"
//     and "Wegmans Organic Frozen Riced Cauliflower" tiles)
//   - React re-renders that strip our injected badge but keep the anchor
//   - our own badge text feeding back into the title on later sweeps
//   - nested product links inside one tile
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Minimal DOM stub — just enough surface for content.js.
// ---------------------------------------------------------------------------
class TextNode {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = String(value);
    this.parentNode = null;
  }
}

class Element {
  constructor(tagName) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = {};
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.title = '';
  }
  get classList() {
    const self = this;
    const parts = () => String(self.className).split(/\s+/).filter(Boolean);
    return {
      contains: (c) => parts().includes(c),
      add: (c) => { if (!parts().includes(c)) self.className = [...parts(), c].join(' '); },
      remove: (c) => { self.className = parts().filter((p) => p !== c).join(' '); },
    };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i >= 0) this.childNodes.splice(i, 0, node);
    else this.childNodes.push(node);
    return node;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const sibs = this.parentNode.childNodes;
    return sibs[sibs.indexOf(this) + 1] || null;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  get textContent() {
    let out = '';
    for (const c of this.childNodes) out += c.nodeType === 3 ? c.nodeValue : c.textContent;
    return out;
  }
  set textContent(value) {
    this.childNodes = [];
    if (value !== '') this.appendChild(new TextNode(value));
  }
  addText(value) { return this.appendChild(new TextNode(value)); }
  *descendants() {
    for (const c of this.childNodes) {
      if (c.nodeType === 1) { yield c; yield* c.descendants(); }
    }
  }
  matches(sel) {
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    // Bare attribute selectors: [role="dialog"], [aria-modal="true"]
    const bare = sel.match(/^\[([-\w]+)="([^"]*)"\]$/);
    if (bare) return this.getAttribute(bare[1]) === bare[2];
    const attr = sel.match(/^([a-z]+)\[([-\w]+)\*="([^"]*)"\]$/i);
    if (attr) {
      return this.tagName === attr[1].toUpperCase() &&
        (this.getAttribute(attr[2]) || '').includes(attr[3]);
    }
    return this.tagName === sel.toUpperCase();
  }
  querySelectorAll(sel) {
    return sel.split(',').map((s) => s.trim()).flatMap(
      (s) => [...this.descendants()].filter((e) => e.matches(s)),
    );
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const body = new Element('body');
const documentStub = {
  body,
  createElement: (tag) => new Element(tag),
  querySelectorAll: (sel) => body.querySelectorAll(sel),
  querySelector: (sel) => body.querySelector(sel),
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  document: documentStub,
  // Mutable so tests can simulate SPA navigation between a grid and a PDP.
  location: { pathname: '/store/wegmans/s' },
  getComputedStyle: (el) => ({ position: el.style.position || 'static' }),
  MutationObserver: class { constructor() {} observe() {} disconnect() {} },
  browser: {
    runtime: { onMessage: { addListener() {} } },
    storage: { local: { get: (d) => Promise.resolve(d), set: () => Promise.resolve() } },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['src/data/produce.js', 'src/lib/match.js', 'src/content/content.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const { sweep, titleOf, productLinks, tileOf, setHideMode, heroTitle } = sandbox.window.__ioContentInternals;

// ---------------------------------------------------------------------------
// Fixture builders — shapes taken from the live Wegmans "cauliflower" grid.
// ---------------------------------------------------------------------------
function tile(href) {
  const wrapper = new Element('div');
  const link = new Element('a');
  link.setAttribute('href', href);
  wrapper.appendChild(link);
  body.appendChild(wrapper);
  return link;
}

function fullTile(href, priceText, titleText, sizeText) {
  const link = tile(href);
  const price = new Element('span'); price.textContent = priceText;
  const name = new Element('h2'); name.textContent = titleText;
  const size = new Element('span'); size.textContent = sizeText;
  link.appendChild(price); link.appendChild(name); link.appendChild(size);
  return link;
}

const badgesIn = (link) => link.querySelectorAll('.io-badge');

let failed = 0;
function check(name, cond, detail) {
  if (!cond) {
    failed++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

// --- 1. Fully rendered organic tile is badged on the first sweep ------------
const florets = fullTile('/store/items/products/101', '$5.19', 'Wegmans Organic Cauliflower Florets', '10 oz');
sweep();
check('fully-rendered organic tile badged', badgesIn(florets).length === 1);
check('badge says ✓ ORGANIC', badgesIn(florets)[0] && badgesIn(florets)[0].textContent === '✓ ORGANIC');

// --- 2. THE BUG: lazy tile mounts with partial text (price + "Buy it again"
//        chip), gets swept, and only later receives its product name ---------
const wholeHead = tile('/store/items/products/102');
const chip = new Element('button'); chip.textContent = 'Buy it again';
const price102 = new Element('span'); price102.textContent = '$4.29';
wholeHead.appendChild(chip); wholeHead.appendChild(price102);
sweep(); // classifies "Buy it again$4.29" -> null; must NOT poison the tile
check('partial tile not badged yet', badgesIn(wholeHead).length === 0);
const name102 = new Element('h2'); name102.textContent = 'Wegmans Organic Cauliflower';
const size102 = new Element('span'); size102.textContent = '1 each';
wholeHead.appendChild(name102); wholeHead.appendChild(size102);
sweep(); // title has now streamed in
check('late-loading "Wegmans Organic Cauliflower" (1 each) gets badged',
  badgesIn(wholeHead).length === 1,
  `dataset=${JSON.stringify(wholeHead.dataset)} text=${JSON.stringify(wholeHead.textContent)}`);

// Same shape for the frozen riced tile.
const riced = tile('/store/items/products/103');
riced.addText('$2.99');
sweep();
check('price-only riced tile not badged yet', badgesIn(riced).length === 0);
riced.addText('Wegmans Organic Frozen Riced Cauliflower16 oz');
sweep();
check('late-loading "Wegmans Organic Frozen Riced Cauliflower" gets badged',
  badgesIn(riced).length === 1);

// --- 3. Skeleton tile (no text at all) also recovers -------------------------
const skeleton = tile('/store/items/products/104');
sweep();
skeleton.addText('Wegmans Organic Strawberries1 lb');
sweep();
check('skeleton tile recovers once text arrives', badgesIn(skeleton).length === 1);

// --- 4. React reconciliation strips the badge; sweep must restore it --------
badgesIn(florets)[0].remove();
florets.style.position = ''; // re-render also wiped our inline style
sweep();
check('badge re-injected after React re-render removed it', badgesIn(florets).length === 1);
check('position re-asserted after re-render', florets.style.position === 'relative');

// --- 5. Conventional Dirty Dozen is DEMOTED, not badged ----------------------
// An organic strawberry (tile 104) is already on the page, so a conventional
// one has somewhere better to send the shopper.
const conventional = fullTile('/store/items/products/105', '$3.99', 'Driscoll’s Strawberries', '16 oz');
sweep();
const convTile = tileOf(conventional);
check('conventional dirty item greyed out', convTile.classList.contains('io-demote--strong'));
check('conventional dirty item carries no badge', badgesIn(conventional).length === 0);
check('organic sibling keeps its ✓ ORGANIC', badgesIn(skeleton).length === 1);
check('organic item is never demoted', !tileOf(skeleton).classList.contains('io-demote--strong'));

sweep(); sweep();
check('title excludes injected badge text', !/ORGANIC/.test(titleOf(skeleton).replace(/Organic/g, '')));
check('demote class not duplicated across sweeps',
  (convTile.className.match(/io-demote--strong/g) || []).length === 1);

// --- 6. Sweeps are idempotent: never a second badge --------------------------
sweep(); sweep(); sweep();
for (const [label, link] of [['florets', florets], ['whole head', wholeHead], ['riced', riced]]) {
  check(`idempotent sweeps leave exactly one badge on ${label}`, badgesIn(link).length === 1,
    `got ${badgesIn(link).length}`);
}

// --- 7. Clean non-organic tiles stay silent ----------------------------------
const cleanTile = fullTile('/store/items/products/106', '$2.49', 'Wegmans Cauliflower Florets, FAMILY PACK', '2 lb');
sweep();
check('clean conventional tile stays unbadged', badgesIn(cleanTile).length === 0);

// --- 8. Nested product links: only the outermost is badged -------------------
const outer = tile('/store/items/products/107');
outer.addText('Wegmans Organic Blueberries18 oz');
const inner = new Element('a');
inner.setAttribute('href', '/store/items/products/107');
inner.addText('Wegmans Organic Blueberries');
outer.appendChild(inner);
sweep();
check('outermost link filter keeps outer', productLinks().includes(outer));
check('outermost link filter drops inner', !productLinks().includes(inner));
check('nested links produce exactly one badge in the tile',
  badgesIn(outer).length === 1 && badgesIn(inner).length === 0);

// --- 9. A verdict computed from partial text is corrected, not appended to ---
// (early text classified organic-strawberry; the real title turns out to be
// a non-produce item -> badge must be removed)
const morphing = tile('/store/items/products/108');
morphing.addText('Organic Strawberry');
sweep();
check('morphing tile briefly badged from partial text', badgesIn(morphing).length === 1);
morphing.addText(' Ice Cream1 pt');
sweep();
check('stale badge removed when full title reveals non-produce', badgesIn(morphing).length === 0);

// --- 10. Escape hatch: no organic alternative on the page -> don't demote -----
// A store with no organic peaches must not render a wall of grey with nothing
// to switch to. Leave the tiles alone and say so instead.
const peachA = fullTile('/store/items/products/201', '$4.99', 'Wegmans Peaches', '2 lb');
const peachB = fullTile('/store/items/products/202', '$5.99', 'Yellow Peaches', '3 lb');
sweep();
check('sole-option peaches are NOT greyed out',
  !tileOf(peachA).classList.contains('io-demote--strong') &&
  !tileOf(peachB).classList.contains('io-demote--strong'));
check('sole-option peaches explain themselves',
  peachA.querySelectorAll('.io-note').length === 1 &&
  peachA.querySelectorAll('.io-note')[0].textContent === 'NO ORGANIC OPTION');

// ...until an organic peach lazy-loads in, which flips the whole group.
const peachOrganic = fullTile('/store/items/products/203', '$7.99', 'Wegmans Organic Peaches', '2 lb');
sweep();
check('organic peach arriving flips the group to demoted',
  tileOf(peachA).classList.contains('io-demote--strong') &&
  tileOf(peachB).classList.contains('io-demote--strong'));
check('"no organic option" note removed once an alternative exists',
  peachA.querySelectorAll('.io-note').length === 0);
check('the organic peach itself is badged, not demoted',
  badgesIn(peachOrganic).length === 1 &&
  !tileOf(peachOrganic).classList.contains('io-demote--strong'));

// --- 11. Caution tier gets the LIGHT treatment, not the strong one ------------
const organicPepper = fullTile('/store/items/products/301', '$2.99', 'Organic Bell Pepper', '1 each');
const plainPepper = fullTile('/store/items/products/302', '$1.49', 'Green Bell Pepper', '1 each');
sweep();
check('caution tier dimmed lightly', tileOf(plainPepper).classList.contains('io-demote--light'));
check('caution tier NOT greyed like Dirty Dozen',
  !tileOf(plainPepper).classList.contains('io-demote--strong'));
check('organic pepper badged', badgesIn(organicPepper).length === 1);

// --- 12. Hide mode removes Dirty Dozen only, and is reversible ----------------
setHideMode(true);
sweep();
check('hide mode hides conventional Dirty Dozen', tileOf(conventional).classList.contains('io-hidden'));
check('hide mode does NOT hide the caution tier', !tileOf(plainPepper).classList.contains('io-hidden'));
check('hide mode does NOT hide organic items', !tileOf(skeleton).classList.contains('io-hidden'));
setHideMode(false);
sweep();
check('toggling hide mode off restores the tile', !tileOf(conventional).classList.contains('io-hidden'));

// --- 13. The guard that stops us greying out the entire grid ------------------
// tileOf climbs to the largest ancestor holding exactly ONE product link. The
// grid container holds many, so it must never be selected — otherwise a single
// conventional strawberry greys out every result on the page.
check('tileOf never climbs to an ancestor containing other products',
  body.querySelectorAll('a[href*="/products/"]').length > 1 &&
  tileOf(conventional) !== body &&
  tileOf(conventional).querySelectorAll('a[href*="/products/"]').length === 1);
check('demoting one tile leaves its neighbours untouched',
  !tileOf(peachOrganic).classList.contains('io-demote--strong') &&
  !tileOf(cleanTile).classList.contains('io-demote--strong') &&
  !tileOf(cleanTile).classList.contains('io-demote--light'));

// --- 14. Product detail page: the hero item, which has no tile ---------------
// The item you opened isn't a link to itself, so the grid logic never sees it.
// This is the view where the buy decision happens, so it gets a banner.
//
// The title comes from the URL slug, NOT the DOM. Observed on a live page:
// Instacart opens a product in a MODAL over the search results, so the page's
// <h1> still reads `Results for "strawberries"`. Classifying that heading
// stamped BUY ORGANIC across a page of ORGANIC strawberries — the exact
// inversion of the advice. The regression test for it is below.
const banner = () => body.querySelector('.io-pdp');

// The search page underneath, with its own heading — deliberately naming a
// DIFFERENT product than the URL does.
const searchHeading = new Element('h1');
searchHeading.textContent = 'Results for "strawberries"';
body.appendChild(searchHeading);

sandbox.location.pathname = '/store/wegmans/storefront';
sweep();
check('an <h1> off a product page is never bannered', banner() === null);

// The live bug, verbatim.
sandbox.location.pathname = '/products/17327024-organic-strawberries-package-32-oz';
sweep();
check('modal PDP reads the URL, not the search heading behind it',
  heroTitle() && heroTitle().title === 'organic strawberries package 32 oz');
check('organic product on a "strawberries" search is NOT told to buy organic',
  banner() !== null && banner().classList.contains('io-pdp--organic'));
check('banner text matches the organic verdict', banner().textContent === '✓ ORGANIC');

// With a modal present the banner belongs INSIDE it — anything outside the
// modal is the page the user was on before, and annotating that is wrong.
const modal = new Element('div');
modal.setAttribute('role', 'dialog');
body.appendChild(modal);
sweep();
check('banner moves inside the modal when one exists', modal.firstChild === banner());
check('banner is not left behind outside the modal',
  body.querySelectorAll('.io-pdp').length === 1);

// Idempotence: content.js's own MutationObserver re-fires on every write, so a
// sweep that re-inserted the banner each time would loop forever.
const firstBanner = banner();
sweep();
sweep();
check('repeated sweeps neither duplicate nor replace the banner',
  body.querySelectorAll('.io-pdp').length === 1 && banner() === firstBanner);

// Conventional item: the same slug shape without "organic".
sandbox.location.pathname = '/products/17327025-driscolls-strawberries-16-oz';
sweep();
check('conventional Dirty Dozen hero gets the dirty verdict',
  banner() !== null && banner().classList.contains('io-pdp--dirty'));
check('hero is NOT dimmed — dimming the page you opened is useless',
  !modal.classList.contains('io-demote--strong') &&
  !modal.classList.contains('io-demote--light'));

// Clean Fifteen states the verdict outright here, unlike on a tile: "save your
// money" is the advice people most often get wrong.
sandbox.location.pathname = '/products/992-large-hass-avocado-1-each';
sweep();
check('Clean Fifteen hero is bannered, not silent',
  banner() !== null && banner().classList.contains('io-pdp--clean'));

// A slug with no leading numeric id still resolves.
sandbox.location.pathname = '/products/fresh-spinach-bunch';
sweep();
check('slug without a numeric id still classifies', banner() !== null);

// SPA navigation swaps products without a reload — a stale banner from the
// previous product would be actively wrong.
sandbox.location.pathname = '/products/551-charmin-ultra-soft-toilet-paper';
sweep();
check('banner removed when the product is not produce', banner() === null);

sandbox.location.pathname = '/products/17327024-organic-strawberries-package-32-oz';
sweep();
check('banner returns after navigating to another product', banner() !== null);

sandbox.location.pathname = '/store/wegmans/storefront';
sweep();
check('banner removed when navigating off the product page', banner() === null);

const TOTAL = 57;
console.log(`\n${TOTAL - failed}/${TOTAL} passed`);
process.exit(failed ? 1 : 0);
