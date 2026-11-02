// Flash Ink (Bend, OR) pricing engine.
//
// Ported from the ConvertCalculator build Flash Ink has run on flashink.com/get-a-quote
// since Feb 2025 (calc qj5JhGhtgNscdh4ei, extracted 2026-08-04, spec at
// ~/Projects/convertcalc-export/flashink-spec.md). The spec's engine is:
//
//   PPI = VLOOKUP(PQ, SPM, IMP, TRUE) + GCL + (IMP * 25) / PQ
//   GCL = (SSG + LSG + SNS) * VLOOKUP(PQ, BGM, 1, 1) + HDG * VLOOKUP(PQ, SGM, 1, 1)
//   FM  = PPI * PQ
//
// This matches ConvertCalculator's prices exactly (Brian, 2026-11-02, reversing the
// per-location and underbase house rules for Flash Ink only). IMP is the total ink colours
// across every location, sleeves counted twice (the spec's 2 * QAY), and SPM is looked up
// ONCE on that total. Light or dark garment does not change the price: no underbase screen.
//
// The rest is the spec, to the cent: Dan's SPM matrix, the $25 screen amortized over the
// run, and the split garment markup he asked for ("Hoodies have a different markup", Dan
// Wellisch, Nov 2024): tees and long sleeves on BGM, hoodies on SGM. Where ConvertCalculator
// showed nothing (IMP past 8, an empty cell, under 12 pieces), this returns a code and the
// quote step offers "we will price it by hand" while the lead still submits.
//
// This file is plain ESM with no imports so the price check can run it straight in node.

export const SCREEN_FEE = 25;

// Smallest order the calculator prices. ConvertCalculator's quantity slider started at 12,
// and 12 is the first matrix row a customer could ever reach (the qty-1 row was never
// reachable through the slider).
export const MIN_QTY = 12;

// SPM, "Smaller Pricing Matrix". Print cost per piece. Rows are quantity breaks, columns are
// IMP, the total ink colours across the whole job, 1 through 8. `null` is a cell that is empty in Flash Ink's
// own sheet.
//
// KNOWN DEFECT CARRIED OVER ON PURPOSE, flag to Dan before launch: the 7 and 8 columns for
// qty 1 to 400 are Earthbound's DE values, left behind when the calculator was cloned from
// Earthbound's. Several sit BELOW the 6-screen price in the same row (qty 72: 8.12 at 6
// screens, 4.39 at 7). They are ported unchanged because this rebuild has to quote what the
// live calculator quotes. Replace them the day Dan sends real 7 and 8 screen numbers.
export const PRINT_MATRIX = [
    { quantity: 1,    prices: [11.89, 15.65, 18.24, 22.40, 26.28, 30.17, 14.60, 16.10] },
    { quantity: 12,   prices: [7.06, 9.92, 12.77, 15.33, 18.48, 21.33, 12.60, 14.10] },
    { quantity: 24,   prices: [6.05, 7.40, 8.75, 10.11, 11.44, 12.79, 8.35, 10.60] },
    { quantity: 48,   prices: [4.31, 5.31, 6.37, 7.38, 8.43, 9.43, 8.10, 9.10] },
    { quantity: 72,   prices: [3.91, 4.74, 5.59, 6.42, 7.25, 8.12, 4.39, 4.80] },
    { quantity: 144,  prices: [3.63, 4.39, 5.20, 5.96, 6.77, 7.52, 3.60, 4.40] },
    { quantity: 200,  prices: [2.99, 3.76, 4.52, 5.29, 6.05, 6.79, 3.50, 4.30] },
    { quantity: 400,  prices: [2.75, 3.33, 3.91, 4.49, 5.47, 5.69, 2.75, 3.15] },
    { quantity: 600,  prices: [2.31, 2.99, 3.63, 4.35, 4.98, 5.67, null, null] },
    { quantity: 1000, prices: [2.20, 2.75, 3.27, 3.78, 4.35, 4.98, null, null] },
    { quantity: 2000, prices: [2.15, 2.53, 2.97, 3.40, 3.78, 4.21, null, null] },
    { quantity: 5000, prices: [1.64, 2.15, 2.63, 3.12, 3.61, 4.09, null, null] },
];

// Widest IMP the sheet prices.
export const MAX_SCREENS = Math.max(...PRINT_MATRIX.map((row) => row.prices.length));

// BGM, garment markup for tees and long sleeves. Note the cliff at 200 (1.70 straight to
// 1.30), which is in Dan's sheet and produces a visible price drop at 200 pieces.
export const BGM = [
    { quantity: 1,    markup: 1.70 },
    { quantity: 12,   markup: 1.70 },
    { quantity: 24,   markup: 1.70 },
    { quantity: 48,   markup: 1.70 },
    { quantity: 72,   markup: 1.70 },
    { quantity: 144,  markup: 1.70 },
    { quantity: 200,  markup: 1.30 },
    { quantity: 400,  markup: 1.30 },
    { quantity: 600,  markup: 1.30 },
    { quantity: 1000, markup: 1.30 },
    { quantity: 2000, markup: 1.30 },
    { quantity: 5000, markup: 1.30 },
];

// SGM, garment markup for hoodies.
export const SGM = [
    { quantity: 1,    markup: 1.50 },
    { quantity: 12,   markup: 1.50 },
    { quantity: 24,   markup: 1.50 },
    { quantity: 48,   markup: 1.50 },
    { quantity: 72,   markup: 1.50 },
    { quantity: 144,  markup: 1.50 },
    { quantity: 200,  markup: 1.50 },
    { quantity: 400,  markup: 1.40 },
    { quantity: 600,  markup: 1.40 },
    { quantity: 1000, markup: 1.30 },
    { quantity: 2000, markup: 1.30 },
    { quantity: 5000, markup: 1.30 },
];

// Which markup curve a garment type rides. Catalog garments go through the same map by
// the garment type the customer picked, so a catalog hoodie is on SGM like a curated one.
export const MARKUP_BY_TYPE = {
    tshirts: BGM,
    longsleeves: BGM,
    hoodies: SGM,
};

// Print placements per garment type, and how many prints each one is. ConvertCalculator's
// SSI question offered Front Chest, Full Front and Full Back (each 1), and its LSI question
// offered Sleeves, which counted TWICE (2 * QAY in IMP) because it prints both arms. LSI
// reads as the long-sleeve placement, so Sleeves is offered on long sleeves and hoodies.
export const PLACEMENTS = {
    tshirts: ['Front Chest', 'Full Front', 'Full Back'],
    longsleeves: ['Front Chest', 'Full Front', 'Full Back', 'Sleeves'],
    hoodies: ['Front Chest', 'Full Front', 'Full Back', 'Sleeves'],
};
export const PRINTS_PER_PLACEMENT = { Sleeves: 2 };

// VLOOKUP(x, table, col, TRUE): the last row whose first column is <= x. Walk from the top
// down; Array.find() on an ascending table would always hand back the smallest tier.
export const rowFor = (table, quantity) => {
    for (let i = table.length - 1; i >= 0; i--) {
        if (quantity >= table[i].quantity) return table[i];
    }
    return null;
};

// IMP = (2 * (QAY + QAW)) + (QX + QAU + QBG + QBB): every colour at every location, sleeves twice.
export const impressionsFor = (locations) =>
    (locations || []).reduce((sum, l) => sum + Math.floor(Number(l.colors)) * (PRINTS_PER_PLACEMENT[l.name] || 1), 0);

// Print cost per piece for the job's IMP. null when the sheet cannot price it: past the
// matrix width, or an empty cell (7 or 8 at 600 pieces and up). That is the only gate. Never coerce a null to 0, which is how other calculators handed back cheap quotes.
export const printCost = (screens, quantity) => {
    const row = rowFor(PRINT_MATRIX, quantity);
    if (!row || screens < 1 || screens > row.prices.length) return null;
    const cell = row.prices[screens - 1];
    return typeof cell === 'number' ? cell : null;
};

export const garmentMarkup = (garmentTypeId, quantity) => {
    const curve = MARKUP_BY_TYPE[garmentTypeId];
    const row = curve ? rowFor(curve, quantity) : null;
    return row ? row.markup : null;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Price one job.
 *
 * @param {object} job
 * @param {string} job.garmentTypeId  'tshirts' | 'longsleeves' | 'hoodies'
 * @param {number} job.garmentCost    blank cost before markup (spec cost, or S&S base_cost)
 * @param {Array<{name:string, colors:number}>} job.locations
 * @param {number} job.quantity
 * @returns {{ ok: true, pricePerItem, totalQuote, rawPricePerItem, breakdown }
 *         | { ok: false, code, message, ... }}
 */
export function priceJob({ garmentTypeId, garmentCost, locations, quantity }) {
    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < MIN_QTY) {
        return { ok: false, code: 'BELOW_MINIMUM', minimum: MIN_QTY, message: `Minimum order is ${MIN_QTY} pieces.` };
    }
    const markup = garmentMarkup(garmentTypeId, qty);
    const cost = Number(garmentCost);
    if (markup === null || !Number.isFinite(cost) || cost <= 0) {
        return { ok: false, code: 'NO_GARMENT_COST', message: 'This garment has no price on our sheet.' };
    }
    const spots = (locations || []).filter((l) => l && Number(l.colors) >= 1);
    if (spots.length === 0) {
        return { ok: false, code: 'INCOMPLETE', message: 'Add at least one print location.' };
    }

    const imp = impressionsFor(spots);
    const decoration = printCost(imp, qty);
    if (decoration === null) {
        const pastWidth = imp > MAX_SCREENS;
        return {
            ok: false,
            code: pastWidth ? 'SCREENS_EXCEEDED' : 'NO_PRICE_CELL',
            impressions: imp,
            maxScreens: MAX_SCREENS,
            message: pastWidth
                ? `This job has ${imp} ink colors across its prints. Our instant pricing tops out at ${MAX_SCREENS}.`
                : `${imp} ink colors at ${qty} pieces is not on our instant price sheet.`,
        };
    }

    const garment = cost * markup;
    const screenFees = (imp * SCREEN_FEE) / qty;
    const raw = decoration + garment + screenFees;

    return {
        ok: true,
        rawPricePerItem: raw,
        pricePerItem: round2(raw),
        // FM = PPI * PQ on the unrounded PPI, as ConvertCalculator computed it.
        totalQuote: round2(raw * qty),
        breakdown: { garment, markup, decoration, screenFees, impressions: imp },
    };
}
