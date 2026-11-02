// Price check: the calculator's own pricing path against an independent reading of the spec.
//
//   node scripts/price-check.mjs            (or: npm run test:price)
//
// The "spec" side does NOT import the engine's tables. It parses Flash Ink's extracted
// ConvertCalculator spec (~/Projects/convertcalc-export/flashink-spec.md, or SPEC=<path>)
// for SPM, BGM, SGM and the garment costs, and reads each curated garment's `cost:` straight
// out of src/garments/**. The "calc" side runs src/utils/functions.js, the exact function the
// FinalQuote step calls, with the same state shape the UI hands it.
//
// Reading of the spec used here (ConvertCalculator exactly, Brian 2026-11-02):
//   - IMP = total ink colours across every location, sleeves counted twice (the spec's 2 * QAY).
//   - SPM looked up ONCE on IMP. No underbase screen; light and dark price the same.
//   - VLOOKUP(..., TRUE): last row whose quantity is <= the order quantity.
//   - An empty SPM cell or IMP past 8 means no price (the calc offers a hand price instead).
//   - Garment = cost * BGM (tees, long sleeves) or SGM (hoodies). $25 a screen (IMP) / quantity.
//   - Total = unrounded PPI * quantity, then rounded to cents, as FM = PPI * PQ.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import calculateFinalQuote from '../src/utils/functions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = process.env.SPEC || path.join(os.homedir(), 'Projects/convertcalc-export/flashink-spec.md');
const md = fs.readFileSync(SPEC, 'utf8');

// ---------- parse the spec ----------
const section = (start, end) => {
    const i = md.indexOf(start);
    if (i < 0) throw new Error(`spec section not found: ${start}`);
    const j = end ? md.indexOf(end, i + start.length) : -1;
    return md.slice(i, j < 0 ? undefined : j);
};
const tableRows = (text) =>
    text.split('\n')
        .filter((l) => /^\|\s*[0-9]/.test(l))
        .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

const SPM = tableRows(section('## 2. Print cost matrix SPM', '### Does Dan')).map((r) => ({
    quantity: Number(r[0]),
    prices: r.slice(1).map((c) => (/^[0-9.]+$/.test(c) ? Number(c) : null)),
}));
const BGM = tableRows(section('### BGM', '### SGM')).map((r) => ({ quantity: Number(r[0]), markup: Number(r[1]) }));
// SGM's first row reads "1 to 200 | 1.50": every SPM break from 1 up to 200 carries 1.50.
const SGM = tableRows(section('### SGM', '### Unused')).flatMap((r) => {
    const m = r[0].match(/^(\d+) to (\d+)$/);
    if (!m) return [{ quantity: Number(r[0]), markup: Number(r[1]) }];
    return SPM.filter((s) => s.quantity >= +m[1] && s.quantity <= +m[2]).map((s) => ({ quantity: s.quantity, markup: Number(r[1]) }));
});
const garmentText = section('## 4. Garment costs', '## 5.');
const specCost = (label) => {
    const m = garmentText.match(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+([0-9.]+)'));
    if (!m) throw new Error(`no spec cost for ${label}`);
    return Number(m[1]);
};

// Curated garments: module path, the spec's own label for it, garment type.
const GARMENTS = {
    G5000: ['tshirts/G5000', 'Gildan 5000', 'tshirts'],
    NL3600: ['tshirts/NL3600', 'Next Level 3600', 'tshirts'],
    NL6210: ['tshirts/NL6210', 'Next Level 6210', 'tshirts'],
    BC3001: ['tshirts/BC3001', 'Bella Canvas 3001', 'tshirts'],
    CC1717: ['tshirts/CC1717', 'Comfort Colors C1717', 'tshirts'],
    G6440: ['longsleeves/G6440', 'Gildan G6440', 'longsleeves'],
    NL6211: ['longsleeves/NL6211', 'Next Level 6411', 'longsleeves'],
    BC3501: ['longsleeves/BC3501', 'Bella Canvas 3501', 'longsleeves'],
    CC6014: ['longsleeves/CC6014', 'Comfort Colors C6014', 'longsleeves'],
    G18500: ['hoodies/G18500', 'Gildan G18500', 'hoodies'],
    JHA001: ['hoodies/JHA001', 'Just Hoods JHA001', 'hoodies'],
    IND4000: ['hoodies/IND4000', 'Independent IND4000', 'hoodies'],
};
const moduleCost = (rel) => {
    const src = fs.readFileSync(path.join(ROOT, 'src/garments', rel + '.js'), 'utf8');
    const m = src.match(/\bcost:\s*([0-9.]+)/);
    if (!m) throw new Error(`no cost in ${rel}`);
    return Number(m[1]);
};

let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL ' + msg); };

console.log('Garment costs: spec vs src/garments');
for (const [id, [rel, label]] of Object.entries(GARMENTS)) {
    const s = specCost(label);
    const c = moduleCost(rel);
    if (s !== c) fail(`${id}: spec ${s} vs module ${c}`);
}
console.log(failures ? '' : '  all 12 match\n');

// ---------- independent spec reading ----------
const vlookup = (table, q) => { let hit = null; for (const r of table) if (r.quantity <= q) hit = r; return hit; };
const PRINTS = { Sleeves: 2 };
// ConvertCalculator exactly: PPI = VLOOKUP(PQ, SPM, IMP, TRUE) + GCL + (IMP * 25) / PQ, with
// IMP = every colour at every location, sleeves twice, and ONE lookup. No underbase, so the
// garment shade is not an input. An IMP past 8, an empty cell or under 12 pieces is no price.
const specSingleLookup = ({ garment, locations, qty }) => {
    const [, label, type] = GARMENTS[garment];
    if (qty < 12) return null;
    const imp = locations.reduce((s, l) => s + l.colors * (PRINTS[l.name] || 1), 0);
    const cell = vlookup(SPM, qty).prices[imp - 1];
    if (cell === null || cell === undefined) return { none: true, imp };
    const ppi = cell + specCost(label) * vlookup(type === 'hoodies' ? SGM : BGM, qty).markup + (imp * 25) / qty;
    return { ppi: Math.round(ppi * 100) / 100, total: Math.round(ppi * qty * 100) / 100, imp };
};

// ---------- the calculator's own path ----------
const calc = ({ garment, dark, locations, qty }) => {
    const [, , type] = GARMENTS[garment];
    return calculateFinalQuote({
        selectedGarmentType: { id: type },
        selectedGarment: { id: garment, cost: moduleCost(GARMENTS[garment][0]) },
        selectedColor: { name: dark ? 'Black' : 'White', underbase: dark ? 1 : 0 },
        printLocations: locations.map((l, i) => ({ id: i + 1, name: l.name, colors: l.colors })),
        quantity: qty,
    });
};

// expectTotal pins a number ConvertCalculator itself was read to give.
const CASES = [
    { garment: 'NL3600', dark: true, qty: 24, locations: [{ name: 'Front Chest', colors: 2 }, { name: 'Full Back', colors: 1 }], expectTotal: 456.36 },
    { garment: 'NL3600', dark: false, qty: 24, locations: [{ name: 'Front Chest', colors: 2 }, { name: 'Full Back', colors: 1 }], expectTotal: 456.36 },
    { garment: 'G5000', dark: false, qty: 12, locations: [{ name: 'Front Chest', colors: 1 }] },
    { garment: 'NL3600', dark: true, qty: 48, locations: [{ name: 'Front Chest', colors: 2 }, { name: 'Full Back', colors: 1 }] },
    { garment: 'G18500', dark: false, qty: 48, locations: [{ name: 'Full Front', colors: 3 }] },
    { garment: 'BC3501', dark: true, qty: 72, locations: [{ name: 'Front Chest', colors: 1 }, { name: 'Sleeves', colors: 1 }] },
    { garment: 'IND4000', dark: true, qty: 144, locations: [{ name: 'Full Front', colors: 6 }] },
    { garment: 'BC3001', dark: false, qty: 144, locations: [{ name: 'Full Front', colors: 8 }] },
    { garment: 'G5000', dark: false, qty: 199, locations: [{ name: 'Full Front', colors: 1 }] },
    { garment: 'G5000', dark: false, qty: 200, locations: [{ name: 'Full Front', colors: 1 }] },
    { garment: 'G6440', dark: true, qty: 400, locations: [{ name: 'Full Front', colors: 4 }, { name: 'Full Back', colors: 2 }, { name: 'Sleeves', colors: 1 }] },
    { garment: 'JHA001', dark: false, qty: 600, locations: [{ name: 'Full Front', colors: 4 }, { name: 'Full Back', colors: 2 }] },
    { garment: 'CC1717', dark: false, qty: 600, locations: [{ name: 'Full Front', colors: 7 }] },
    { garment: 'CC6014', dark: true, qty: 600, locations: [{ name: 'Full Front', colors: 4 }, { name: 'Full Back', colors: 3 }] },
    { garment: 'G18500', dark: false, qty: 1000, locations: [{ name: 'Front Chest', colors: 1 }] },
    { garment: 'G5000', dark: true, qty: 2000, locations: [{ name: 'Full Front', colors: 2 }, { name: 'Full Back', colors: 1 }] },
    { garment: 'NL6210', dark: false, qty: 2000, locations: [{ name: 'Full Front', colors: 8 }] },
    { garment: 'IND4000', dark: true, qty: 48, locations: [{ name: 'Full Front', colors: 6 }, { name: 'Full Back', colors: 3 }] },
    { garment: 'NL6211', dark: true, qty: 72, locations: [{ name: 'Full Front', colors: 4 }, { name: 'Sleeves', colors: 3 }] },
];

const money = (n) => (n === null || n === undefined ? '-' : '$' + n.toFixed(2));
const desc = (c) => `${c.qty} ${c.garment} ${c.dark ? 'dark' : 'light'}, ${c.locations.map((l) => `${l.name} ${l.colors}c`).join(' + ')}`;
const BY_HAND = ['NO_PRICE_CELL', 'SCREENS_EXCEEDED'];

console.log('Case | IMP | spec PPI | calc PPI | spec total | calc total | result');
for (const c of CASES) {
    const s = specSingleLookup(c);
    const q = calc(c);
    let result;
    if (s.none) {
        result = !q.ok && BY_HAND.includes(q.code) ? `both no price, calc offers by hand (${q.code})` : 'MISMATCH (spec has no price)';
        if (q.ok || !BY_HAND.includes(q.code)) fail(desc(c));
    } else if (!q.ok) {
        result = `MISMATCH (calc withheld: ${q.code})`;
        fail(desc(c));
    } else {
        const same = s.ppi === q.pricePerItem && s.total === q.totalQuote;
        result = same ? 'match' : 'MISMATCH';
        if (!same) fail(desc(c));
    }
    if (c.expectTotal !== undefined && (!q.ok || q.totalQuote !== c.expectTotal || s.total !== c.expectTotal)) {
        fail(`${desc(c)}: expected ConvertCalculator's ${money(c.expectTotal)}`);
        result += ` (expected ${money(c.expectTotal)})`;
    }
    console.log(`${desc(c)} | ${s.imp} | ${money(s.ppi)} | ${q.ok ? money(q.pricePerItem) : '-'} | ${money(s.total)} | ${q.ok ? money(q.totalQuote) : '-'} | ${result}`);
}

// Shade never moves the price.
for (const c of CASES) {
    const a = calc({ ...c, dark: true }), b = calc({ ...c, dark: false });
    if (a.ok !== b.ok || a.totalQuote !== b.totalQuote) fail(`${desc(c)}: dark and light price differently`);
}

// Below-minimum and empty-job guards.
const below = calc({ ...CASES[2], qty: 11 });
if (below.ok || below.code !== 'BELOW_MINIMUM') fail('qty 11 should be BELOW_MINIMUM');
const none = calculateFinalQuote({ selectedGarmentType: { id: 'tshirts' }, selectedGarment: { cost: 2.52 }, printLocations: [], quantity: 50 });
if (none.ok) fail('no locations should not price');

console.log(failures ? `\n${failures} FAILURE(S)` : `\nAll ${CASES.length} cases match ConvertCalculator to the cent.`);
process.exit(failures ? 1 : 0);
