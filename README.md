# Instacart Organic Guide

Firefox extension. Badges produce on Instacart with EWG Dirty Dozen / Clean Fifteen
verdicts, so you spend the organic premium only where residue data says it matters.

- **Inline badges** on product tiles as you browse, and only where there's something
  to act on: red `BUY ORGANIC` (Dirty Dozen), amber `PREFER ORGANIC` (recently dirty),
  dark green `✓ ORGANIC` if the item already is. Clean and middle-of-the-pack produce
  is deliberately left unbadged — **an unbadged tile means conventional is fine.**
  Badging everything just reprints "CONVENTIONAL OK" on every tile of a cauliflower
  search, which is noise.
- **Prepared forms count as the vegetable.** Riced, steamable, frozen, and pre-cut
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

## Tiers

| Tier | Badge | Meaning |
|---|---|---|
| `dirty` | BUY ORGANIC | EWG Dirty Dozen — highest residue |
| `caution` | PREFER ORGANIC | High residue; on the Dirty Dozen in a recent year (peppers, green beans, celery, tomatoes) |
| `moderate` | CONVENTIONAL OK | Known produce, middle of the pack |
| `clean` | CONVENTIONAL OK | EWG Clean Fifteen — lowest residue |

## Layout

```
manifest.json          MV3, Firefox (gecko id + strict_min_version)
src/data/produce.js    EWG snapshot + tier definitions + staleness check
src/lib/match.js       product title → verdict (aliases, blockers, processed-food filter)
src/content/           badge injection + MutationObserver for lazy-loaded tiles
src/popup/             cart audit panel + staleness warning
test/match.test.js     matcher unit tests (node, no deps)
```

## Known limits

- Instacart's DOM selectors in `src/content/content.js` are best-effort and will drift
  when they redesign. A generic `a[href*="/products/"]` fallback catches unknown layouts.
- The matcher only badges *fresh* produce; it deliberately skips juice, jam, sauce,
  chips, etc., since residue rankings don't apply to processed goods.
- Cart audit needs the cart drawer open — the extension reads the DOM, not Instacart's API.
