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
    return {
      contains: (c) => String(self.className).split(/\s+/).includes(c),
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
  getComputedStyle: (el) => ({ position: el.style.position || 'static' }),
  MutationObserver: class { constructor() {} observe() {} disconnect() {} },
  browser: { runtime: { onMessage: { addListener() {} } } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ['src/data/produce.js', 'src/lib/match.js', 'src/content/content.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f });
}
const { sweep, titleOf, productLinks } = sandbox.window.__ioContentInternals;

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

// --- 5. Our own badge text must not contaminate re-classification -----------
const conventional = fullTile('/store/items/products/105', '$3.99', 'Driscoll’s Strawberries', '16 oz');
sweep();
const firstBadge = badgesIn(conventional)[0];
check('conventional dirty item badged BUY ORGANIC', firstBadge && firstBadge.textContent === 'BUY ORGANIC');
sweep(); sweep();
check('title excludes injected badge text', !/BUY ORGANIC/.test(titleOf(conventional)));
check('badge does not flip to ✓ ORGANIC on later sweeps',
  badgesIn(conventional).length === 1 && badgesIn(conventional)[0].textContent === 'BUY ORGANIC');

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

const TOTAL = 18;
console.log(`\n${TOTAL - failed}/${TOTAL} passed`);
process.exit(failed ? 1 : 0);
