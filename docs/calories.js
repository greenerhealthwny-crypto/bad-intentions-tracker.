/* Calorie estimates from plain-language food notes (BI-004).
 * Values come from docs/foods.json, built from USDA FoodData Central (SR Legacy).
 * "4 eggs, 2 cups oatmeal with peanut butter, 8 oz chicken" → per-item kcal + total.
 * Anything it can't match is returned in `unknown` so it is never silently counted.
 */
(function (root) {
  'use strict';
  const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, couple: 2, few: 3, dozen: 12 };
  const WEIGHT = { g: 1, gram: 1, grams: 1, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6 };
  const COUNT_UNITS = ['cups', 'cup', 'tbsp', 'tablespoons', 'tablespoon', 'slices', 'slice', 'scoops', 'scoop', 'servings', 'serving', 'pieces', 'piece', 'bowls', 'bowl', 'glasses', 'glass', 'large', 'medium', 'small'];
  const SIZE = { large: 1.25, small: 0.75 };

  function parseQty(s) {
    const m = s.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*/);
    if (m) {
      const t = m[1].trim();
      let q;
      if (/\s/.test(t)) { const [w, f] = t.split(/\s+/); const [a, b] = f.split('/'); q = +w + a / b; }
      else if (t.includes('/')) { const [a, b] = t.split('/'); q = a / b; }
      else q = parseFloat(t);
      return { qty: q, rest: s.slice(m[0].length) };
    }
    const w = s.match(/^\s*([a-z]+)\s+/i);
    if (w && WORD_NUM[w[1].toLowerCase()] != null) return { qty: WORD_NUM[w[1].toLowerCase()], rest: s.slice(w[0].length) };
    return { qty: null, rest: s };
  }

  function buildIndex(foods) {
    const idx = [];
    for (const f of foods) for (const a of f.aliases) idx.push({ alias: a.toLowerCase(), food: f });
    idx.sort((x, y) => y.alias.length - x.alias.length); // longest match wins: "cream cheese" before "cheese"
    return idx;
  }

  function splitItems(text) {
    return text
      .toLowerCase()
      .replace(/\b(breakfast|lunch|dinner|snack|snacks|pre[- ]?workout|post[- ]?workout|meal \d+)\s*:/g, ',')
      .split(/[,;\n+&]|\band\b|\bwith\b|\bplus\b/)
      .map((s) => s.trim().replace(/^(of|some)\s+/, ''))
      .filter(Boolean);
  }

  function estimate(text, data) {
    const index = data._index || (data._index = buildIndex(data.foods));
    const items = [], unknown = [];
    for (const seg of splitItems(text || '')) {
      const hit = index.find((e) => new RegExp(`(^|[^a-z])${e.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(seg));
      if (!hit) { unknown.push(seg); continue; }
      const f = hit.food;
      let { qty, rest } = parseQty(seg);
      let grams;
      const um = rest.match(/^\s*([a-z]+)\b\.?\s*(of\s+)?/i);
      const unitWord = um ? um[1].toLowerCase() : '';
      if (qty == null) qty = 1;
      if (WEIGHT[unitWord]) grams = qty * WEIGHT[unitWord];
      else {
        let mult = 1;
        if (SIZE[unitWord] && !/large|small/.test(f.unitLabel)) mult = SIZE[unitWord];
        // USDA serving is a fraction of a cup (e.g. "serving 1/2 cup") but the user said cups.
        const frac = f.unitLabel.match(/(\d+)\/(\d+)\s*cup/);
        if (/^cups?$/.test(unitWord) && frac) mult = frac[2] / frac[1];
        grams = qty * f.unitGrams * mult;
      }
      items.push({ text: seg, food: f.key, fdc: f.fdc, grams: Math.round(grams), kcal: Math.round((f.kcal100 * grams) / 100) });
    }
    const total = items.reduce((a, i) => a + i.kcal, 0);
    return { items, unknown, total };
  }

  const api = { estimate, splitItems, parseQty };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BICalories = api;
})(typeof window !== 'undefined' ? window : globalThis);
