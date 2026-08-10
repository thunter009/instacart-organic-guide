# Instacart Organic Guide

Firefox extension. Greys out the produce on Instacart that you shouldn't buy conventional,
so you spend the organic premium only where pesticide-residue data says it matters — and
save it everywhere else.

Organic costs 30–100% more. On the EWG's Clean Fifteen (cauliflower, avocados, onions,
bananas…) that premium buys you close to nothing; on the Dirty Dozen (strawberries,
spinach, grapes…) it buys you a lot. This extension makes that distinction visible while
you shop, instead of asking you to memorize two lists.

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

**Product pages get words, not dimming.** On `/products/…` there's one item and it's
the reason you're there, so it gets a banner under the title instead — and unlike the
grid, the Clean Fifteen verdict is stated outright. "Save your money on avocados" is the
half of the advice people most often miss.

**Frozen counts; canned doesn't.** EWG "ranks popular *fresh* fruits and vegetables,"
so the question is whether a given form still carries a fresh item's residue profile.
Freezing removes nothing — thiram in frozen plums held above 80% after 49 weeks at
−20 °C — and fruit is usually frozen without the blanching step that does reduce
residues. Canning is the opposite: wash, peel, blanch, then sterilize above 115 °C
strips [90–100% of residues](https://pmc.ncbi.nlm.nih.gov/articles/PMC3907644). So
frozen strawberries get the Dirty Dozen treatment and canned peaches are ignored.

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
  class names but still their DOM. When they redesign, this will need a fix. `tileOf()`
  refuses to climb to any ancestor holding a second product link, so a bad guess dims one
  tile instead of greying out the whole grid.
- Matching is by product title, so a title that names produce in an unusual way can be
  missed, and a *new* category of flavor/scent product could still slip through as a false
  positive (an early build greyed out "Apple & Citrus Laundry Detergent"). Both are pinned
  by tests as they're found — **if you hit one, open an issue with the product title.**
- **Cart audit is built but disabled.** The code and message plumbing are in place, but its
  cart-drawer detection doesn't match Instacart's real DOM, so the button is withheld
  rather than shipped broken. `tools/cart-probe.js` is a read-only console probe for
  capturing the real cart structure — PRs welcome.

## Disclaimer

Not affiliated with, endorsed by, or connected to **Instacart** or the **Environmental
Working Group**. "Dirty Dozen" and "Clean Fifteen" are trademarks of EWG; this is an
independent tool that surfaces their published guidance while you shop. Rankings are a
bundled snapshot of [EWG's Shopper's Guide](https://www.ewg.org/foodnews/) — go read the
original, and note that EWG's methodology has its own critics. Eating conventionally grown
fruit and vegetables is far better than eating none.

## License

MIT — see [LICENSE](LICENSE).
