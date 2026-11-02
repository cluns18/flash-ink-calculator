// Live S&S catalog, read from the shared OBG garment database (the same
// Supabase project that powers the design lab) through the `calculator_catalog`
// view. The view only exposes styles that are in stock, priced, and have at
// least one photographed colorway, and it rolls the colorways up as jsonb so a
// page of results is a single request.
//
// The hand-built styles in src/garments/ stay as the curated shortlist. This is
// the "browse everything else" path behind it.

import { supabase, catalogEnabled } from '../lib/supabase';

export { catalogEnabled };

// The funnel uses plural ids; the catalog stores the singular S&S category.
const TYPE_MAP = {
    tshirts: 'tshirt',
    longsleeves: 'longsleeve',
    hoodies: 'hoodie',
    polos: 'polo',
    hats: 'hat',
};

export const PAGE_SIZE = 12;

// Screen print pricing needs to know whether a garment takes an underbase, which
// is really "is this shirt dark". Every colorway in the catalog carries a hex, so
// derive it rather than hand-tagging thousands of colors. The 0.59 cutoff was
// fitted against the 321 colorways already tagged by hand in src/garments/ and
// agrees with them on 97%; the misses lean toward calling a color dark, which
// quotes high rather than low.
const UNDERBASE_LUMINANCE_CUTOFF = 0.59;

export function needsUnderbase(hex) {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return 1;
    const channel = (v) => {
        const c = parseInt(v, 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = channel(hex.slice(1, 3));
    const g = channel(hex.slice(3, 5));
    const b = channel(hex.slice(5, 7));
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance >= UNDERBASE_LUMINANCE_CUTOFF ? 0 : 1;
}

// S&S serves a thumbnail by default; `_fl` is the 1000x1250 variant.
function large(url) {
    return url ? url.replace(/_fm\.(jpg|jpeg|png)$/i, '_fl.$1') : url;
}

// Shape a catalog row like the hand-built garment modules, so ColorSelect,
// FinalQuote and the pricing math treat both sources identically.
function mapRow(row) {
    const colors = (row.colors || []).map((c) => ({
        name: c.name,
        hex: c.hex,
        image: c.swatch || c.image,
        previewImage: c.image,
        underbase: needsUnderbase(c.hex),
    }));

    const label = `${row.brand} ${row.style_name}`.trim();

    return {
        id: row.slug || String(row.id),
        label,
        name: label,
        brand: row.brand,
        styleName: row.style_name,
        // S&S's own product name ("Unisex Heavy Cotton T-Shirt") and a one-line
        // spec ("5.3 oz · 100% U.S. cotton"). Both can be null on the handful of
        // styles S&S no longer publishes, so every use site has to tolerate that.
        title: row.title || null,
        blurb: row.blurb || null,
        // 1-4, a quartile of the wholesale cost against other styles of the same
        // garment type. The customer sees this instead of a garment price.
        priceTier: Number(row.price_tier) || 1,
        cost: Number(row.base_cost),
        stockImage: large(row.image_url) || colors[0]?.previewImage || null,
        colors,
        popularity: Number(row.popularity_qty || 0),
        fromCatalog: true,
    };
}

const SELECT = 'id, slug, brand, style_name, style_number, base_cost, image_url, popularity_qty, colors, title, blurb, price_tier';

/**
 * Page through the catalog for one garment type.
 *
 * Sorted by popularity, measured as the number of units S&S currently stocks
 * across every SKU of the style. They stock deep on what sells, so this floats
 * the blanks people actually order (Gildan 5000, Comfort Colors 1717) above the
 * long tail. base_cost breaks ties so the order is stable across pages.
 */
// Supabase hands back the occasional 503 when a project wakes up. Retry once
// before giving up, because a single blip on the count call is enough to hide
// the browse-all entry point completely and the customer never learns the rest
// of the catalog is there.
async function withRetry(run) {
    const first = await run();
    if (!first.error) return first;
    await new Promise((r) => setTimeout(r, 600));
    return run();
}

export async function searchCatalog({ garmentTypeId, search = '', page = 0, pageSize = PAGE_SIZE }) {
    const garmentType = TYPE_MAP[garmentTypeId];
    if (!catalogEnabled || !garmentType) return { garments: [], total: 0 };

    const from = page * pageSize;
    const term = search.trim();
    // PostgREST reads these characters as filter syntax, so drop them.
    const safe = term.replace(/[%,()]/g, ' ').trim();

    const { data, error, count } = await withRetry(() => {
        let query = supabase
            .from('calculator_catalog')
            .select(SELECT, { count: 'exact' })
            .eq('garment_type', garmentType);

        if (safe) query = query.or(`brand.ilike.%${safe}%,style_name.ilike.%${safe}%`);

        return query
            .order('popularity_qty', { ascending: false })
            .order('base_cost', { ascending: true })
            .range(from, from + pageSize - 1);
    });

    if (error) throw new Error(error.message);

    return { garments: (data || []).map(mapRow), total: count || 0 };
}

/** Total number of styles available for a garment type, for the browse-all prompt. */
export async function countCatalog(garmentTypeId) {
    const garmentType = TYPE_MAP[garmentTypeId];
    if (!catalogEnabled || !garmentType) return 0;

    const { count, error } = await withRetry(() => supabase
        .from('calculator_catalog')
        .select('id', { count: 'exact', head: true })
        .eq('garment_type', garmentType));

    if (error) return 0;
    return count || 0;
}
