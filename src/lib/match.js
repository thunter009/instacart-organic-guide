// Maps an Instacart product title to a produce verdict.
(function (root) {
  'use strict';

  const { PRODUCE, TIERS } = root.ProduceData;

  // Titles that are clearly not fresh produce, even though they name a fruit.
  // Residue rankings apply to the fresh item, so don't badge processed goods.
  const NON_PRODUCE = [
    'juice', 'jam', 'jelly', 'preserve', 'yogurt', 'ice cream', 'smoothie', 'candle',
    'soap', 'shampoo', 'lotion', 'candy', 'gummy', 'soda', 'seltzer', 'sparkling',
    'flavored', 'scented', 'pie', 'cake', 'cookie', 'cereal', 'bar', 'chips', 'crisps',
    'sauce', 'salsa', 'dressing', 'vinegar', 'oil', 'extract', 'syrup', 'tea', 'kombucha',
    'supplement', 'vitamin', 'puree', 'baby food', 'pouch', 'canned', 'dried', 'freeze dried',
  ];

  function normalize(title) {
    return String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function containsPhrase(haystack, phrase) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|\\s)' + escaped + '(\\s|$)').test(haystack);
  }

  function isOrganic(title) {
    return /\borganic\b/i.test(String(title || ''));
  }

  function looksProcessed(normalized) {
    return NON_PRODUCE.some((word) => normalized.includes(word));
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
