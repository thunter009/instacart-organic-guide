// Maps an Instacart product title to a produce verdict.
(function (root) {
  'use strict';

  const { PRODUCE, TIERS } = root.ProduceData;

  // Titles that name a fruit or vegetable but aren't the produce itself. In
  // nearly every false positive the fruit is a FLAVOR or SCENT modifier —
  // "Apple & Citrus Laundry Detergent", "Energy Drink Mix, Blueberry" — and the
  // residue rankings plainly don't transfer to detergent.
  //
  // Prepared forms of the vegetable (riced, steamable, frozen florets, pearls,
  // pre-cut) are deliberately NOT listed: that's still cauliflower, and the
  // pesticide advice still applies.
  //
  // Matched as whole words. A substring check reads "tea" inside "steamable"
  // and silently drops the tile — that bug shipped once already.
  const NON_PRODUCE = [
    // household / personal care — the fruit is a scent
    'detergent', 'laundry', 'softener', 'bleach', 'cleaner', 'cleaning', 'spray',
    'freshener', 'wipes', 'sanitizer', 'deodorant', 'candle', 'soap', 'shampoo',
    'conditioner', 'lotion', 'fragrance', 'perfume', 'scented', 'scent',
    // beverages — the fruit is a flavor
    'drink', 'drinks', 'beverage', 'soda', 'cola', 'seltzer', 'sparkling', 'energy',
    'electrolyte', 'juice', 'lemonade', 'smoothie', 'shake', 'coffee', 'latte', 'tea',
    'kombucha', 'beer', 'wine', 'vodka', 'seltzers', 'cider', 'drink mix', 'water',
    // packaged food — the fruit is a flavor
    'flavored', 'flavor', 'candy', 'gummy', 'gummies', 'chocolate', 'cookie', 'cookies',
    'cake', 'pie', 'muffin', 'granola', 'cereal', 'bar', 'bars', 'chips', 'crisps',
    'crackers', 'snack', 'yogurt', 'ice cream', 'creamer', 'pudding', 'jerky',
    'jam', 'jelly', 'preserve', 'preserves', 'syrup', 'sauce', 'salsa', 'dressing',
    'vinegar', 'oil', 'extract', 'hummus', 'dip', 'pizza', 'crust', 'powder',
    // dairy & deli — the fruit is a flavor ("Goat Cheese, Strawberry Spritz")
    'cheese', 'creamery', 'cream', 'butter', 'milk', 'kefir', 'cottage',
    'ricotta', 'mozzarella', 'cheddar', 'gouda', 'brie', 'feta', 'spread',
    'spritz', 'custard', 'mousse', 'gelato', 'sorbet', 'sherbet', 'frosting',
    // prepared meats — same story ("Apple Chicken Sausage")
    'sausage', 'bacon', 'ham', 'salami', 'deli', 'patty', 'burger', 'meatball',
    // condiments
    'relish', 'chutney', 'compote', 'marinade', 'glaze',
    // supplements
    'supplement', 'supplements', 'vitamin', 'vitamins', 'protein', 'collagen',
  ];

  // Fresh produce is never sold by fluid volume. A liquid measure is proof the
  // item is a drink or a cleaner, whatever else the title claims — this catches
  // packaged goods whose vocabulary isn't in the blocklist above.
  const LIQUID_UNITS = ['fl oz', 'fluid ounce', 'fluid ounces', 'liter', 'liters', 'ml', 'gallon'];

  function normalize(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      // DOM textContent glues sizes/prices onto words with no separator
      // ("Cauliflower1 each", "Strawberries16 oz", "$5.19Wegmans"). A word
      // never legitimately mixes letters and digits in this domain, so treat
      // every letter<->digit boundary as a word break.
      .replace(/([a-z])(?=[0-9])/g, '$1 ')
      .replace(/([0-9])(?=[a-z])/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function containsPhrase(haystack, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\s)' + escaped + '(\\s|$)').test(haystack);
  }

  // Test the NORMALIZED title: \b on the raw string misses glued textContent
  // like "$6.49Organic…" (digit->letter is not a \b boundary).
  function isOrganic(title) {
    return containsPhrase(normalize(title), 'organic');
  }

  // Fresh produce whose NAME contains a blocklisted word. "Creamer potatoes"
  // are potatoes — Dirty Dozen — but "creamer" reads as coffee creamer and
  // silently dropped them; "butter lettuce" is lettuce, not dairy.
  //
  // These are stripped before the processed-food check only. Classification
  // still sees the untouched title, so the produce word itself survives.
  const FRESH_PHRASES = [
    'butter lettuce', 'creamer potato', 'creamer potatoes', 'cream peas',
  ];

  function withoutFreshPhrases(normalized) {
    let out = normalized;
    for (const phrase of FRESH_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp('(^|\\s)' + escaped + '(\\s|$)', 'g'), ' ');
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  function looksProcessed(normalized) {
    const scanned = withoutFreshPhrases(normalized);
    return NON_PRODUCE.some((phrase) => containsPhrase(scanned, phrase)) ||
      LIQUID_UNITS.some((unit) => containsPhrase(scanned, unit));
  }

  // Returns { entry, tier, badge, advice, organic, matchedAlias } or null.
  function classify(title) {
    const normalized = normalize(title);
    if (!normalized) return null;

    // A blocker on ANY entry that fires (e.g. "grape tomato") must also suppress
    // the entry it blocks, so collect matches first and filter after.
    let best = null;

    for (const entry of PRODUCE) {
      const blocked = (entry.blockers || []).some((b) => normalized.includes(normalize(b)));
      if (blocked) continue;

      for (const alias of entry.aliases) {
        const a = normalize(alias);
        if (!containsPhrase(normalized, a)) continue;
        // Longest alias wins: "sweet corn" beats "corn", "bell pepper" beats nothing.
        if (!best || a.length > best.matchedAlias.length) {
          best = { entry, matchedAlias: a };
        }
      }
    }

    if (!best) return null;
    if (looksProcessed(normalized)) return null;

    const tier = TIERS[best.entry.tier];
    return {
      key: best.entry.key,
      label: best.entry.label,
      tier: best.entry.tier,
      rank: best.entry.rank || null,
      badge: tier.badge,
      advice: tier.advice,
      organic: isOrganic(title),
      matchedAlias: best.matchedAlias,
    };
  }

  root.ProduceMatch = { classify, normalize, isOrganic };
})(typeof window !== 'undefined' ? window : globalThis);
