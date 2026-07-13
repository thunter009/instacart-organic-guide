// Maps an Instacart product title to a produce verdict.
(function (root) {
  'use strict';

  const { PRODUCE, TIERS } = root.ProduceData;

  // Titles that name a fruit or vegetable but aren't the produce itself — the
  // residue rankings don't transfer to juice or shampoo.
  //
  // Prepared forms of the vegetable (riced, steamable, frozen florets, pearls,
  // pre-cut) are NOT listed here: that's still cauliflower, and the pesticide
  // advice still applies. Matched as whole words — a substring check reads "tea"
  // inside "steamable" and silently drops the tile.
  const NON_PRODUCE = [
    'juice', 'jam', 'jelly', 'preserve', 'preserves', 'yogurt', 'ice cream', 'smoothie',
    'candle', 'soap', 'shampoo', 'lotion', 'candy', 'gummy', 'gummies', 'soda', 'seltzer',
    'flavored', 'scented', 'pie', 'cake', 'cookie', 'cookies', 'cereal', 'chips', 'crisps',
    'sauce', 'salsa', 'dressing', 'vinegar', 'oil', 'extract', 'syrup', 'tea', 'kombucha',
    'supplement', 'vitamin', 'vitamins', 'jerky', 'pizza', 'crust', 'hummus', 'dip',
  ];

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

  function looksProcessed(normalized) {
    return NON_PRODUCE.some((phrase) => containsPhrase(normalized, phrase));
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
