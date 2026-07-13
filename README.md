# Instacart Organic Guide

Firefox extension. Badges produce on Instacart with EWG Dirty Dozen / Clean Fifteen
verdicts, so you spend the organic premium only where residue data says it matters.

The page itself is the interface. Instead of badging every tile, it changes how tiles
**look**, so your eye skips the wrong ones:

| Item | Treatment |
|---|---|
| Conventional **Dirty Dozen** | greyscale + faded to 32% — or hidden outright, if you flip the toggle |
| Conventional **caution tier** (peppers, green beans, celery, tomatoes) | lightly faded to 70% — reads "meh", not "no" |
| **Organic**, any tier | `✓ ORGANIC` check — the thing to steer toward |
| **Clean Fifteen** / middle-of-the-pack | untouched. Silence means conventional is fine |

Two things keep the dimming honest:

- **Demotion is advice, not a wall.** A dimmed tile restores on hover and stays
  clickable. You can always overrule it and buy the conventional strawberries.
- **The escape hatch.** Dimming is skipped entirely when the page has *no organic
  alternative* for that produce — otherwise a store that doesn't stock organic peaches
  renders a wall of grey with nowhere to go. Those tiles render normally and say
  `NO ORGANIC OPTION` instead. It's recomputed every sweep, so an organic tile that
  lazy-loads in later flips its whole group to demoted.

**Prepared forms count as the vegetable.** Riced, steamable, frozen, and pre-cut
cauliflower classify the same as the fresh head; residue carries through. Only genuinely
different products (juice, sauce, pizza crust, shampoo) are skipped.
- **Cart audit** in the toolbar popup: lists the conventional items in your cart that
  are worth swapping to organic.
- **Staleness warning**: EWG republishes annually. The popup warns loudly once the
  bundled list is more than 12 months old.

## Install (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → pick `manifest.json`
3. Visit instacart.com. Badges appear on product tiles; click the toolbar icon to audit.

Temporary add-ons are unloaded when Firefox restarts. For a permanent install, sign the
extension with `web-ext sign` (needs an AMO API key) and install the resulting `.xpi`.

## Updating the produce list

EWG publishes a new Shopper's Guide every spring. When the popup warns that the list is
stale:

1. Read the current lists at <https://www.ewg.org/foodnews/>
2. Update `PRODUCE` ranks/tiers and bump `LIST_UPDATED` in `src/data/produce.js`
3. `node test/match.test.js`

Current snapshot: **EWG 2026 guide** (`LIST_UPDATED = 2026-03-24`).

## Layout

```
manifest.json            MV3, Firefox (gecko id + strict_min_version)
src/data/produce.js      EWG snapshot + tier definitions + staleness check
src/lib/match.js         product title → verdict (aliases, blockers, processed-food filter)
src/content/             tile demotion + badges + MutationObserver for lazy-loaded tiles
src/popup/               cart audit, dim/hide toggle, staleness warning
test/match.test.js       title → verdict tests (node, no deps)
test/content.dom.test.js DOM-layer tests against a minimal stub (node, no deps)
```

`node test/match.test.js && node test/content.dom.test.js`

## Two bugs worth not reintroducing

Both are pinned by tests.

1. **`textContent` glues adjacent elements together with no separator.** The size span
   runs into the last word of the title: `"Wegmans Organic Cauliflower" + "1 each"` reads
   as `…Cauliflower1 each`, whose token is `cauliflower1` — which fails a whole-word
   match. This silently skipped *only* the tiles whose title ended in the produce word,
   which is a maddening way for it to present. `titleOf()` space-pads element boundaries,
   and `normalize()` treats every letter↔digit boundary as a word break.

2. **A write-once "already processed" memo poisons lazy tiles.** Instacart mounts tiles
   with partial text (a price, a "Buy it again" chip) before the product name streams in.
   Classifying that fragment yields nothing, and a permanent mark means the tile is never
   revisited. Each sweep now re-derives the verdict from the current title and converges
   the DOM to it — but only writes where something actually differs, since every write
   re-triggers the MutationObserver.

## Known limits

- Tile identification hangs on `a[href*="/products/"]`, far more stable than Instacart's
  class names but still their DOM. `tileOf()` refuses to climb to any ancestor holding a
  second product link, so a bad guess dims one tile instead of greying out the whole grid.
- Cart audit needs the cart drawer open — the extension reads the DOM, not Instacart's
  API — and its selectors are **not yet verified against the live cart.**
