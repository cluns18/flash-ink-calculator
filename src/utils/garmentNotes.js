// What the garment step says about each blank on Flash Ink's own sheet.
//
// Same shape as the Local Threads calculator and the design studio: three featured blanks per
// type, each with a badge, a headline and a few reasons, then the rest of the sheet one tap
// away and the full S&S catalog behind that.
//
// Sources, and nothing else:
//   - badge: the tagline Flash Ink's ConvertCalculator gave the blank ("Economy", "Most
//     Popular", "Thick & Warm"...), carried from the spec.
//   - brand, style, title, spec line, price tier: the shared OBG `calculator_catalog` view
//     (S&S data), read 2026-11-02 for these exact styles, so the shortlist and the browse-all
//     grid describe and rank a blank in the same words.
//   - "Lowest cost ... on our sheet" claims: checked against the costs in src/garments.
//
// Keyed by the garment module id in src/garments/<type>/<id>.js.

export const FEATURED = {
    tshirts: ['G5000', 'NL3600', 'CC1717'],
    longsleeves: ['G6440', 'BC3501', 'CC6014'],
    hoodies: ['G18500', 'JHA001', 'IND4000'],
};

// Card fields, shaped like a catalog row from utils/catalog.js so one card renders both.
export const CARD_META = {
    G5000: { brand: 'Gildan', style: '5000', title: 'Unisex Heavy Cotton T-Shirt', spec: '5.3 oz · 100% U.S. cotton', tier: 1, tagline: 'Economy' },
    NL3600: { brand: 'Next Level', style: '3600', title: 'Unisex Cotton T-Shirt', spec: '4.3 oz · 100% combed ring-spun cotton', tier: 2, tagline: 'Most Popular' },
    NL6210: { brand: 'Next Level', style: '6210', title: 'Unisex CVC T-Shirt', spec: '4.3 oz · 60/40 combed ring-spun cotton/polyester', tier: 2, tagline: 'Quality For Price' },
    BC3001: { brand: 'BELLA + CANVAS', style: '3001', title: 'Jersey Tee', spec: '4.2 oz · 100% Airlume combed and ring-spun cotton', tier: 1, tagline: 'Premium Quality' },
    CC1717: { brand: 'Comfort Colors', style: '1717', title: 'Unisex Garment-Dyed Heavyweight T-Shirt', spec: '6.1 oz · 100% ring-spun cotton', tier: 3, tagline: 'Most Comfortable' },

    G6440: { brand: 'Gildan', style: '64400', title: 'Unisex Softstyle Long Sleeve T-Shirt', spec: '4.5 oz · 100% U.S. ring-spun cotton', tier: 1, tagline: 'Most Popular' },
    NL6211: { brand: 'Next Level', style: '6211', title: 'Unisex CVC Long Sleeve T-Shirt', spec: '4.3 oz · 60/40 combed ring-spun cotton/polyester', tier: 1, tagline: null },
    BC3501: { brand: 'BELLA + CANVAS', style: '3501', title: 'Unisex Jersey Long Sleeve Tee', spec: '4.2 oz · 100% Airlume combed and ring-spun cotton', tier: 1, tagline: 'Quality for Price' },
    CC6014: { brand: 'Comfort Colors', style: '6014', title: 'Unisex Garment-Dyed Heavyweight Long Sleeve T-Shirt', spec: '6.1 oz · 100% ring-spun cotton', tier: 2, tagline: 'Most Comfortable' },

    G18500: { brand: 'Gildan', style: '18500', title: 'Unisex Heavy Blend Hooded Sweatshirt', spec: '8 oz · 50/50 cotton/polyester', tier: 1, tagline: 'Best Value & Most Popular' },
    JHA001: { brand: 'Just Hoods by AWDis', style: 'JHA001', title: null, spec: null, tier: 1, tagline: 'Lighter Fit' },
    IND4000: { brand: 'Independent Trading Co.', style: 'IND4000', title: 'Unisex Heavyweight Hooded Sweatshirt', spec: '10 oz', tier: 2, tagline: 'Thick & Warm' },
};

export const GARMENT_NOTES = {
    G5000: {
        badge: 'Economy',
        headline: 'The classic heavy cotton tee',
        bullets: ['5.3 oz, 100% U.S. cotton', 'Lowest cost tee on our sheet, so more of the budget goes into the print'],
    },
    NL3600: {
        badge: 'Most popular',
        headline: 'Soft and light',
        bullets: ['4.3 oz, 100% combed ring-spun cotton', 'Lighter and softer in the hand than a heavy cotton tee'],
    },
    CC1717: {
        badge: 'Most comfortable',
        headline: 'Heavy, soft, already broken in',
        bullets: ['6.1 oz ring-spun cotton, the heaviest tee on our sheet', 'Garment dyed for a lived-in feel straight out of the bag'],
    },
    G6440: {
        badge: 'Most popular',
        headline: 'The everyday long sleeve',
        bullets: ['4.5 oz, 100% U.S. ring-spun cotton', 'Lowest cost long sleeve on our sheet'],
    },
    BC3501: {
        badge: 'Quality for price',
        headline: 'Soft jersey long sleeve',
        bullets: ['4.2 oz, 100% Airlume combed and ring-spun cotton'],
    },
    CC6014: {
        badge: 'Most comfortable',
        headline: 'Heavyweight and lived-in',
        bullets: ['6.1 oz ring-spun cotton, the heaviest long sleeve on our sheet', 'Garment dyed for a worn-in feel from day one'],
    },
    G18500: {
        badge: 'Best value',
        headline: 'The classic pullover hoodie',
        bullets: ['8 oz, 50/50 cotton and polyester', 'Lowest cost hoodie on our sheet'],
    },
    JHA001: {
        badge: 'Lighter fit',
        headline: 'The lighter-fit hoodie on our sheet',
        bullets: [],
    },
    IND4000: {
        badge: 'Thick & warm',
        headline: 'The heavyweight hoodie',
        bullets: ['10 oz fleece, the heaviest hoodie on our sheet'],
    },
};

export const cardFields = (g) => {
    const meta = CARD_META[g.id] || {};
    return {
        brand: meta.brand || g.brand || null,
        styleName: meta.style || g.id,
        title: meta.title || null,
        blurb: meta.spec || meta.tagline || null,
        priceTier: meta.tier || null,
        stockImage: g.stockImage || null,
    };
};
