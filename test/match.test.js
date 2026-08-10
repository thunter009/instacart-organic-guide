// node test/match.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console };
vm.createContext(sandbox);
for (const f of ['src/data/produce.js', 'src/lib/match.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox);
}
const { classify } = sandbox.ProduceMatch;

const CASES = [
  ['Organic Strawberries, 1 lb', 'strawberries', 'dirty', true],
  ['Driscoll’s Strawberries, 16 oz', 'strawberries', 'dirty', false],
  ['Cauliflower, 1 each', 'cauliflower', 'clean', false],
  ['Fresh Pineapple', 'pineapple', 'clean', false],
  ['Honeycrisp Apples, 3 lb Bag', 'apples', 'dirty', false],
  ['Grape Tomatoes, 1 pint', 'tomatoes', 'caution', false],
  ['Cherry Tomatoes on the Vine', 'tomatoes', 'caution', false],
  ['Red Seedless Grapes, 2 lb', 'grapes', 'dirty', false],
  ['Sweet Corn, 4 ct', 'sweet-corn', 'clean', false],
  ['Sweet Potatoes, 2 lb', 'sweet-potato', 'moderate', false],
  ['Russet Potatoes, 5 lb', 'potatoes', 'dirty', false],
  ['Green Bell Pepper', 'bell-peppers', 'caution', false],
  ['Ruby Red Grapefruit', 'grapefruit', 'moderate', false],
  ['Organic Baby Spinach, 5 oz', 'spinach', 'dirty', true],
  // Fresh produce whose name contains a blocklisted word. Creamer potatoes are
  // Dirty Dozen and were being dropped silently by the "creamer" blocker.
  ['Creamer Potatoes, 1.5 lb', 'potatoes', 'dirty', false],
  ['Organic Creamer Potatoes', 'potatoes', 'dirty', true],
  ['Butter Lettuce, 1 head', 'lettuce', 'moderate', false],
];

// Real tiles from a Wegmans "cauliflower" search. Prepared forms are still the
// vegetable, so they must classify identically to the fresh head.
const SCREENSHOT_TILES = [
  ['Wegmans Organic Cauliflower 1 each', 'cauliflower', 'clean', true],
  ['Wegmans Cauliflower 1 each', 'cauliflower', 'clean', false],
  ['Wegmans Organic Cauliflower Florets 10 oz', 'cauliflower', 'clean', true],
  ['Wegmans Cauliflower Florets, FAMILY PACK 2 lb', 'cauliflower', 'clean', false],
  ['Wegmans Cleaned & Cut Cauliflower Florets 12 oz', 'cauliflower', 'clean', false],
  ['Wegmans Steamable Cauliflower Florets 12 oz', 'cauliflower', 'clean', false],
  ['Wegmans Cauliflower Pearls 16 oz', 'cauliflower', 'clean', false],
  ['Wegmans Organic Frozen Riced Cauliflower 16 oz', 'cauliflower', 'clean', true],
  ['Wegmans Organic Cauliflower Rice 10 oz', 'cauliflower', 'clean', true],
  ['Broccoli Crowns $2.29 / lb', 'broccoli', 'moderate', false],
  ['Wegmans Cleaned & Cut Broccoli Florets, FAMILY PACK 3 lb', 'broccoli', 'moderate', false],
  // Anchor text carries price/size noise — classification must survive it.
  ['$5.19Wegmans Organic Cauliflower Florets10 oz', 'cauliflower', 'clean', true],
  // textContent glues the size onto the LAST title word with no separator.
  // These two are the live-bug tiles: the produce word ends the title, so the
  // glued digit broke the whole-word match ("cauliflower1", "cauliflower16").
  ['$4.29Wegmans Organic Cauliflower1 each', 'cauliflower', 'clean', true],
  ['$2.99Wegmans Organic Frozen Riced Cauliflower16 oz', 'cauliflower', 'clean', true],
  ['$6.49Organic Strawberries1 lb', 'strawberries', 'dirty', true],
];
CASES.push(...SCREENSHOT_TILES);

// Guard against over-blocking. Expanding NON_PRODUCE to kill flavor/scent false
// positives can easily start eating real produce: "spring mix" vs "drink mix",
// "watermelon" vs "water", "celery sticks" vs "powder sticks", "snacking
// peppers" vs "snack". These must all still classify.
const MUST_STILL_MATCH = [
  ['Organic Spring Mix, 5 oz', 'lettuce', 'moderate', true],
  ['Seedless Watermelon, 1 each', 'watermelon', 'clean', false],
  ['Wegmans Celery Sticks, 16 oz', 'celery', 'caution', false],
  ['Organic Blueberries, 1 pt', 'blueberries', 'dirty', true],
  ['Fresh Strawberries, 2 lb', 'strawberries', 'dirty', false],
  ['Wegmans Baby Carrots, 1 lb', 'carrots', 'clean', false],
  ['Organic Baby Spinach, 5 oz', 'spinach', 'dirty', true],
  ['Sweet Onions, 3 lb Bag', 'onion', 'clean', false],
];
CASES.push(...MUST_STILL_MATCH);

const NON_MATCHES = [
  'Simply Orange Juice, 52 fl oz',
  'Strawberry Ice Cream, 1 pt',
  'Apple Cider Vinegar',
  'Tomato Sauce, 24 oz',
  'Yellow Corn Tortilla Chips',
  'Cauliflower Pizza Crust, 10 oz',
  'Spinach & Artichoke Dip',
  // Glued size must not break the NON_PRODUCE phrase match either.
  'Organic Strawberry Ice Cream1 pt',

  // FALSE POSITIVES seen live: the fruit is a scent/flavor, not the product.
  // Both were greyed out as Dirty Dozen items on a real Instacart page.
  ['$17.29Spend $20, save $3HEX Apple & Citrus Laundry Detergent50 fl oz'],
  ['$13.29Celsius On-the-Go On The Go Energy Drink Mix, Blueberry...2.7 oz'],
  // Neighbours of the above — same product line, different flavor words.
  ['Celsius On The Go Energy Drink Mix, Dragonfruit Lime2.7 oz'],
  ['Celsius On The Go Energy Drink Mix, Berry Powder Sticks2.5 oz'],
  // The fl-oz rule alone must kill these, even with no blocklist word present.
  ['Strawberry Sparkling Water, 12 fl oz'],
  ['Blueberry Hand Soap, 8 fl oz'],
  // More scent/flavor shapes.
  'Apple Cinnamon Air Freshener',
  'Peach Scented Candle',
  'Spinach & Kale Protein Powder',
  'Grape Flavored Gummy Vitamins',
  // Dairy, deli and confections where the fruit is a flavor. The goat cheese
  // was a live false positive: it wore a NO ORGANIC OPTION note on a real
  // search grid because "Strawberry" matched.
  'Vermont Creamery Goat Cheese, Strawberry Spritz, Smooth & Sweet',
  'Strawberry Cream Cheese Spread',
  'Blueberry Greek Yogurt, 5.3 oz',
  'Peach Cottage Cheese',
  'Apple Chicken Sausage, 12 oz',
  'Cherry Almond Gelato',
  'Blackberry Fruit Spread',
  'Apple Cider Donut Creamer',
  'Mango Habanero Glaze',
  'Cranberry Orange Relish',
  // The exceptions above must not punch holes in the blocklist itself.
  'Coffee Creamer, French Vanilla',
  'Cream of Potato Soup',
  'Lettuce Wrap Kit with Peanut Sauce',
].flat();

let failed = 0;
for (const [title, key, tier, organic] of CASES) {
  const r = classify(title);
  const ok = r && r.key === key && r.tier === tier && r.organic === organic;
  if (!ok) {
    failed++;
    console.log(`FAIL  ${title}\n      want ${key}/${tier}/organic=${organic}, got ${r ? `${r.key}/${r.tier}/organic=${r.organic}` : 'null'}`);
  }
}
for (const title of NON_MATCHES) {
  const r = classify(title);
  if (r) {
    failed++;
    console.log(`FAIL  ${title}\n      want null (not fresh produce), got ${r.key}/${r.tier}`);
  }
}

const total = CASES.length + NON_MATCHES.length;
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
