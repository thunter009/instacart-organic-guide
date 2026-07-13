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
];

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
