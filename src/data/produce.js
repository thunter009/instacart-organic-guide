// EWG Shopper's Guide to Pesticides in Produce — bundled snapshot.
// Bump LIST_UPDATED whenever the rankings below are refreshed; the popup warns
// the user once this snapshot is more than 12 months old.
(function (root) {
  'use strict';

  const LIST_UPDATED = '2026-03-24'; // EWG 2026 guide publication
  const LIST_SOURCE = 'https://www.ewg.org/foodnews/';
  const STALE_AFTER_DAYS = 365;

  // tier semantics:
  //   dirty    — EWG Dirty Dozen. Buy organic.
  //   caution  — high residue, on the Dirty Dozen in a recent year. Organic if affordable.
  //   clean    — EWG Clean Fifteen. Conventional is fine.
  //   moderate — known produce, middle of the pack. Conventional is fine.
  //
  // `aliases` are matched as whole words against a normalized product title.
  // `blockers` veto a match when present (e.g. "grape tomato" is not a grape).
  const PRODUCE = [
    // ---- Dirty Dozen (2026), in EWG rank order -------------------------------
    { key: 'spinach', label: 'Spinach', tier: 'dirty', rank: 1, aliases: ['spinach'] },
    { key: 'leafy-greens', label: 'Kale / collard / mustard greens', tier: 'dirty', rank: 2, aliases: ['kale', 'collard', 'collards', 'mustard greens'] },
    { key: 'strawberries', label: 'Strawberries', tier: 'dirty', rank: 3, aliases: ['strawberry', 'strawberries'] },
    { key: 'grapes', label: 'Grapes', tier: 'dirty', rank: 4, aliases: ['grape', 'grapes'], blockers: ['grape tomato', 'grape tomatoes', 'grapefruit', 'grapeseed', 'grape seed'] },
    { key: 'nectarines', label: 'Nectarines', tier: 'dirty', rank: 5, aliases: ['nectarine', 'nectarines'] },
    { key: 'peaches', label: 'Peaches', tier: 'dirty', rank: 6, aliases: ['peach', 'peaches'] },
    { key: 'cherries', label: 'Cherries', tier: 'dirty', rank: 7, aliases: ['cherry', 'cherries'], blockers: ['cherry tomato', 'cherry tomatoes'] },
    { key: 'apples', label: 'Apples', tier: 'dirty', rank: 8, aliases: ['apple', 'apples'], blockers: ['pineapple', 'pineapples', 'apple juice', 'apple cider', 'custard apple'] },
    { key: 'blackberries', label: 'Blackberries', tier: 'dirty', rank: 9, aliases: ['blackberry', 'blackberries'] },
    { key: 'pears', label: 'Pears', tier: 'dirty', rank: 10, aliases: ['pear', 'pears'], blockers: ['prickly pear'] },
    { key: 'potatoes', label: 'Potatoes', tier: 'dirty', rank: 11, aliases: ['potato', 'potatoes'], blockers: ['sweet potato', 'sweet potatoes'] },
    { key: 'blueberries', label: 'Blueberries', tier: 'dirty', rank: 12, aliases: ['blueberry', 'blueberries'] },

    // ---- Recently dirty, still high residue ----------------------------------
    { key: 'bell-peppers', label: 'Bell peppers', tier: 'caution', aliases: ['bell pepper', 'bell peppers'] },
    { key: 'hot-peppers', label: 'Hot peppers', tier: 'caution', aliases: ['hot pepper', 'hot peppers', 'jalapeno', 'jalapenos', 'serrano', 'serranos', 'habanero', 'habaneros', 'chili pepper', 'chile pepper'] },
    { key: 'green-beans', label: 'Green beans', tier: 'caution', aliases: ['green bean', 'green beans', 'string bean', 'string beans', 'haricot vert', 'haricots verts'] },
    { key: 'celery', label: 'Celery', tier: 'caution', aliases: ['celery'], blockers: ['celery root', 'celeriac', 'celery salt'] },
    { key: 'tomatoes', label: 'Tomatoes', tier: 'caution', aliases: ['tomato', 'tomatoes'], blockers: ['tomato sauce', 'tomato paste', 'sun dried', 'sun-dried'] },

    // ---- Clean Fifteen (2026) -------------------------------------------------
    { key: 'pineapple', label: 'Pineapple', tier: 'clean', aliases: ['pineapple', 'pineapples'] },
    { key: 'sweet-corn', label: 'Sweet corn', tier: 'clean', aliases: ['corn', 'sweet corn', 'corn on the cob'], blockers: ['corn chip', 'cornmeal', 'corn meal', 'popcorn', 'corn tortilla', 'baby corn', 'corn starch', 'cornstarch'] },
    { key: 'avocado', label: 'Avocado', tier: 'clean', aliases: ['avocado', 'avocados'] },
    { key: 'papaya', label: 'Papaya', tier: 'clean', aliases: ['papaya', 'papayas'] },
    { key: 'onion', label: 'Onion', tier: 'clean', aliases: ['onion', 'onions', 'shallot', 'shallots'] },
    { key: 'sweet-peas', label: 'Sweet peas (frozen)', tier: 'clean', aliases: ['sweet pea', 'sweet peas', 'green pea', 'green peas'], blockers: ['snap pea', 'snap peas', 'snow pea', 'snow peas'] },
    { key: 'asparagus', label: 'Asparagus', tier: 'clean', aliases: ['asparagus'] },
    { key: 'cabbage', label: 'Cabbage', tier: 'clean', aliases: ['cabbage'] },
    { key: 'watermelon', label: 'Watermelon', tier: 'clean', aliases: ['watermelon', 'watermelons'] },
    { key: 'cauliflower', label: 'Cauliflower', tier: 'clean', aliases: ['cauliflower'] },
    { key: 'bananas', label: 'Bananas', tier: 'clean', aliases: ['banana', 'bananas'], blockers: ['banana pepper', 'banana peppers', 'banana bread'] },
    { key: 'mango', label: 'Mango', tier: 'clean', aliases: ['mango', 'mangoes', 'mangos'] },
    { key: 'carrots', label: 'Carrots', tier: 'clean', aliases: ['carrot', 'carrots'] },
    { key: 'mushrooms', label: 'Mushrooms', tier: 'clean', aliases: ['mushroom', 'mushrooms', 'cremini', 'portobello', 'shiitake', 'button mushroom'] },
    { key: 'kiwi', label: 'Kiwi', tier: 'clean', aliases: ['kiwi', 'kiwis', 'kiwifruit'] },

    // ---- Middle of the pack ---------------------------------------------------
    { key: 'broccoli', label: 'Broccoli', tier: 'moderate', aliases: ['broccoli', 'broccolini'] },
    { key: 'brussels-sprouts', label: 'Brussels sprouts', tier: 'moderate', aliases: ['brussels sprout', 'brussels sprouts', 'brussel sprouts'] },
    { key: 'cucumber', label: 'Cucumber', tier: 'moderate', aliases: ['cucumber', 'cucumbers'] },
    { key: 'zucchini', label: 'Zucchini / summer squash', tier: 'moderate', aliases: ['zucchini', 'summer squash', 'yellow squash'] },
    { key: 'winter-squash', label: 'Winter squash', tier: 'moderate', aliases: ['butternut squash', 'acorn squash', 'winter squash', 'spaghetti squash'] },
    { key: 'lettuce', label: 'Lettuce', tier: 'moderate', aliases: ['lettuce', 'romaine', 'iceberg', 'arugula', 'spring mix', 'mixed greens'] },
    { key: 'sweet-potato', label: 'Sweet potato', tier: 'moderate', aliases: ['sweet potato', 'sweet potatoes', 'yam', 'yams'] },
    { key: 'eggplant', label: 'Eggplant', tier: 'moderate', aliases: ['eggplant', 'eggplants', 'aubergine'] },
    { key: 'raspberries', label: 'Raspberries', tier: 'moderate', aliases: ['raspberry', 'raspberries'] },
    { key: 'plums', label: 'Plums', tier: 'moderate', aliases: ['plum', 'plums'], blockers: ['plum tomato', 'plum tomatoes'] },
    { key: 'oranges', label: 'Oranges', tier: 'moderate', aliases: ['orange', 'oranges', 'clementine', 'clementines', 'mandarin', 'mandarins', 'tangerine', 'tangerines'], blockers: ['orange juice'] },
    { key: 'grapefruit', label: 'Grapefruit', tier: 'moderate', aliases: ['grapefruit', 'grapefruits'] },
    { key: 'lemons-limes', label: 'Lemons / limes', tier: 'moderate', aliases: ['lemon', 'lemons', 'lime', 'limes'], blockers: ['lemonade', 'lemon juice', 'lime juice'] },
    { key: 'melon', label: 'Cantaloupe / honeydew', tier: 'moderate', aliases: ['cantaloupe', 'honeydew', 'melon'], blockers: ['watermelon'] },
    { key: 'apricots', label: 'Apricots', tier: 'moderate', aliases: ['apricot', 'apricots'] },
    { key: 'beets', label: 'Beets', tier: 'moderate', aliases: ['beet', 'beets'] },
    { key: 'radish', label: 'Radish', tier: 'moderate', aliases: ['radish', 'radishes'] },
    { key: 'garlic', label: 'Garlic', tier: 'moderate', aliases: ['garlic'], blockers: ['garlic powder', 'garlic salt'] },
    { key: 'ginger', label: 'Ginger', tier: 'moderate', aliases: ['ginger'], blockers: ['ginger ale', 'gingerbread'] },
    { key: 'herbs', label: 'Fresh herbs', tier: 'moderate', aliases: ['cilantro', 'parsley', 'basil', 'mint', 'dill', 'thyme', 'rosemary'] },
    { key: 'green-onion', label: 'Green onions', tier: 'moderate', aliases: ['green onion', 'green onions', 'scallion', 'scallions'] },
    { key: 'artichoke', label: 'Artichoke', tier: 'moderate', aliases: ['artichoke', 'artichokes'] },
  ];

  // `badge` doubles as the inline pill text (dirty/caution only — clean and
  // moderate are left unbadged on the page) and the popup's section heading,
  // so the four labels must read as four distinct verdicts.
  const TIERS = {
    dirty: { badge: 'BUY ORGANIC', advice: 'Dirty Dozen — highest pesticide residue.' },
    caution: { badge: 'PREFER ORGANIC', advice: 'High residue; on the Dirty Dozen in a recent year.' },
    moderate: { badge: 'CONVENTIONAL OK', advice: 'Middle of the pack — organic is optional.' },
    clean: { badge: 'CLEAN FIFTEEN', advice: 'Lowest pesticide residue — save your money.' },
  };

  function daysSinceUpdate(now) {
    const updated = Date.parse(LIST_UPDATED + 'T00:00:00Z');
    return Math.floor((now.getTime() - updated) / 86400000);
  }

  function staleness(now) {
    const days = daysSinceUpdate(now || new Date());
    return {
      days,
      months: Math.floor(days / 30.44),
      isStale: days > STALE_AFTER_DAYS,
      updated: LIST_UPDATED,
      source: LIST_SOURCE,
    };
  }

  root.ProduceData = { PRODUCE, TIERS, LIST_UPDATED, LIST_SOURCE, STALE_AFTER_DAYS, staleness };
})(typeof window !== 'undefined' ? window : globalThis);
