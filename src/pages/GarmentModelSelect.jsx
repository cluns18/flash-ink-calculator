import React, { useEffect, useState } from 'react';
import NavBtn from '../components/NavBtn';
import { curatedList } from '../garments';
import { searchCatalog, countCatalog, catalogEnabled, PAGE_SIZE } from '../utils/catalog';
import { FEATURED, GARMENT_NOTES, cardFields } from '../utils/garmentNotes';

// The garment step, in the design studio's three-card style (carried from the Local Threads
// calculator): three featured blanks per type, the rest of Flash Ink's sheet one tap away,
// and the full S&S catalog behind that.
//
// PRICING INVARIANT: a curated pick carries the cost from Flash Ink's sheet; a catalog pick
// carries its S&S base_cost (`fromCatalog`). Both price through src/pricing/flashInk.js on
// the markup curve for the garment TYPE (BGM for tees and long sleeves, SGM for hoodies).
// Curated garments are matched by module id, never by a label string.

// How expensive this blank is relative to others of the same garment type, the
// way Yelp rates a restaurant. The customer needs to tell a cheap tee from a
// pricey one without us publishing what the garment itself costs.
function PriceTier({ tier }) {
    if (!tier) return null;
    const level = Math.min(4, Math.max(1, tier));
    return (
        <div className='price-tier' role='img' aria-label={`${level} out of 4 on price`}>
            {[1, 2, 3, 4].map((i) => (
                <span key={i} aria-hidden='true' className={i <= level ? 'price-tier-on' : 'price-tier-off'}>$</span>
            ))}
        </div>
    );
}

// A row of colour dots so nobody thinks the blank only comes in white.
function Swatches({ colors, max = 8 }) {
    if (!colors?.length) return null;
    const shown = colors.slice(0, max);
    const more = colors.length - shown.length;
    return (
        <div className='pick-swatches' role='img' aria-label={`${colors.length} colors available`}>
            {shown.map((c) => (
                <span
                    key={c.name}
                    title={c.name}
                    className='pick-swatch'
                    style={c.hex ? { backgroundColor: c.hex } : { backgroundImage: `url(${c.image})`, backgroundSize: 'cover' }}
                />
            ))}
            {more > 0 && <span className='pick-swatch-more'>+{more}</span>}
        </div>
    );
}

function CheckIcon() {
    return (
        <svg viewBox='0 0 16 16' fill='none' aria-hidden='true' className='pick-check'>
            <path d='M3 8.5L6.5 12L13 4' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
    );
}

// One card shape for the featured three, the rest of the sheet, and the catalog
// grid, so nothing on this step reads as a bare text list next to photographed
// cards. `note` (badge + headline + bullets) is what makes a featured card.
function PickCard({ fields, note, colors, active, onClick, index = 0, compact = false }) {
    const { brand, styleName, title, blurb, priceTier, stockImage } = fields;
    const headline = note ? note.headline : blurb;
    return (
        <button
            type='button'
            onClick={onClick}
            className={`pick-card ${active ? 'is-active' : ''} ${compact ? 'pick-card--compact' : ''}`}
            aria-pressed={active}
            style={{ animation: `fadeSlideUp 0.45s ease-out ${index * 80}ms both` }}
        >
            {note?.badge && <span className='pick-badge'>{note.badge}</span>}
            {active && (
                <span className='pick-selected' aria-hidden='true'>
                    <CheckIcon />
                </span>
            )}
            <div className='pick-card-img'>
                {stockImage ? (
                    <img src={stockImage} alt={`${brand || ''} ${styleName}`.trim()} loading='lazy' />
                ) : (
                    <span className='pick-card-noimg'>No photo</span>
                )}
            </div>
            {brand && <div className='pick-card-brand'>{brand}</div>}
            <div className='pick-card-style'>{styleName}</div>
            {title && <div className='pick-card-title'>{title}</div>}
            {headline && <div className='pick-card-head'>{headline}</div>}
            {note?.bullets?.length > 0 && (
                <ul className='pick-card-bullets'>
                    {note.bullets.map((b) => (
                        <li key={b}><CheckIcon /><span>{b}</span></li>
                    ))}
                </ul>
            )}
            <div className='pick-card-foot'>
                <Swatches colors={colors} />
                {colors?.length > 0 && (
                    <div className='pick-card-count'>{colors.length} {colors.length === 1 ? 'color' : 'colors'}</div>
                )}
                <PriceTier tier={priceTier} />
            </div>
        </button>
    );
}

const SEARCH_HINT = {
    tshirts: 'Try "Comfort Colors" or "3001"',
    longsleeves: 'Try "Gildan" or "2400"',
    hoodies: 'Try "Independent" or "18500"',
};

// ConvertCalculator's own line for this step, minus the "Hit other" sentence (that pointed at
// a quote form Flash Ink never had; the full catalog is the "other" now).
const STEP_LEAD = 'We can print on countless garments. These are our most popular and have instant pricing.';

const labelFor = (g) => g.label || g.name || g.id;

function splitCurated(typeId) {
    const all = curatedList(typeId);
    const byId = new Map(all.map((g) => [g.id, g]));
    let featured = (FEATURED[typeId] || []).map((id) => byId.get(id)).filter(Boolean);
    if (featured.length < 2) featured = all.slice(0, 3);
    const ids = new Set(featured.map((g) => g.id));
    return { featured, rest: all.filter((g) => !ids.has(g.id)) };
}

export default function GarmentModelSelect({ selectedGarmentType, selectedGarment, setSelectedModel, setSelectedGarment, onNext, onPrevious }) {
    const typeId = selectedGarmentType?.id;
    const { featured, rest } = splitCurated(typeId);

    const [browsing, setBrowsing] = useState(false);
    const [catalogTotal, setCatalogTotal] = useState(0);
    const [results, setResults] = useState([]);
    const [resultTotal, setResultTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showAll, setShowAll] = useState(false);

    const pick = (g) => {
        setSelectedGarment(g);
        setSelectedModel(labelFor(g));
    };

    // Default to the first featured blank so Next always has something priced behind it.
    useEffect(() => {
        if (!selectedGarment && featured.length > 0) pick(featured[0]);
    }, [typeId]);

    useEffect(() => { setShowAll(false); }, [typeId]);

    useEffect(() => {
        if (!catalogEnabled || !typeId) return;
        let cancelled = false;
        countCatalog(typeId).then((n) => { if (!cancelled) setCatalogTotal(n); });
        return () => { cancelled = true; };
    }, [typeId]);

    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 250);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => {
        if (!browsing || !typeId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        searchCatalog({ garmentTypeId: typeId, search, page })
            .then(({ garments, total }) => {
                if (cancelled) return;
                setResults(garments);
                setResultTotal(total);
                setLoading(false);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e.message);
                setResults([]);
                setResultTotal(0);
                setLoading(false);
            });
        return () => { cancelled = true; };
    }, [browsing, typeId, search, page]);

    const garmentTypeName = selectedGarmentType?.name || 'Garment';
    const lastPage = Math.max(0, Math.ceil(resultTotal / PAGE_SIZE) - 1);

    if (browsing) {
        return (
            <>
                <div className='slide-header' style={{ padding: '16px 24px 4px' }}>
                    <h1 className='text-2xl headingColor'>Full catalog</h1>
                    <p className='bodyColor' style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                        {resultTotal || catalogTotal} {garmentTypeName.toLowerCase()} options, most popular first.
                        Search by brand or style number.
                    </p>
                </div>
                <div className='slide-content' style={{ justifyContent: 'flex-start', gap: '8px', padding: '0 20px' }}>
                    <input
                        type='text'
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder={SEARCH_HINT[typeId] || 'Search by brand or style number'}
                        className='catalog-search'
                        aria-label='Search the catalog'
                        autoFocus
                    />

                    {error && (
                        <p className='bodyColor catalog-msg'>
                            We could not load the full catalog right now. Pick one of our regulars and we will sort the rest out on the quote.
                        </p>
                    )}
                    {!error && loading && <p className='bodyColor catalog-msg'>Loading styles...</p>}
                    {!error && !loading && results.length === 0 && (
                        <p className='bodyColor catalog-msg'>Nothing matched that. Try a brand name or a style number.</p>
                    )}

                    {!error && !loading && results.length > 0 && (
                        <div className='pick-grid pick-grid--catalog'>
                            {results.map((g, i) => (
                                <PickCard
                                    key={g.id}
                                    fields={g}
                                    colors={g.colors}
                                    active={selectedGarment?.id === g.id}
                                    onClick={() => { pick(g); setBrowsing(false); }}
                                    index={i}
                                    compact
                                />
                            ))}
                        </div>
                    )}

                    {!error && resultTotal > PAGE_SIZE && (
                        <div className='catalog-pager'>
                            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>&larr; Back</button>
                            <span className='bodyColor'>{page + 1} of {lastPage + 1}</span>
                            <button onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page >= lastPage}>Next &rarr;</button>
                        </div>
                    )}
                </div>
                <div className='slide-nav'>
                    <NavBtn onClick={() => setBrowsing(false)} direction='prev'>&larr; Our picks</NavBtn>
                    <NavBtn onClick={() => onNext()}>Next &rarr;</NavBtn>
                </div>
            </>
        );
    }

    const pickedFromCatalog = selectedGarment?.fromCatalog ? selectedGarment : null;

    const renderCurated = (g, i, withNote) => (
        <PickCard
            key={g.id}
            fields={cardFields(g)}
            note={withNote ? GARMENT_NOTES[g.id] : null}
            colors={g.colors}
            active={!pickedFromCatalog && selectedGarment?.id === g.id}
            onClick={() => pick(g)}
            index={i}
            compact={!withNote}
        />
    );

    return (
        <>
            <div className='slide-header'>
                <h1 className='text-3xl headingColor'>Choose your {garmentTypeName.toLowerCase()}</h1>
                <p className='mt-1 text-sm bodyColor'>{STEP_LEAD}</p>
            </div>
            <div className='slide-content pick-content'>
                {pickedFromCatalog && (
                    <div className='pick-grid pick-grid--picked'>
                        <PickCard fields={pickedFromCatalog} colors={pickedFromCatalog.colors} active onClick={() => {}} compact />
                    </div>
                )}

                <div className='pick-grid pick-grid--featured'>
                    {featured.map((g, i) => renderCurated(g, i, true))}
                </div>

                {showAll && rest.length > 0 && (
                    <div className='pick-grid pick-grid--more'>
                        {rest.map((g, i) => renderCurated(g, i, false))}
                    </div>
                )}

                <div className='pick-actions'>
                    {rest.length > 0 && !showAll && (
                        <button type='button' className='catalog-open' onClick={() => setShowAll(true)}>
                            Show {rest.length} more from our sheet
                        </button>
                    )}
                    {catalogEnabled && catalogTotal > 0 && (
                        <button type='button' className='catalog-open' onClick={() => { setSearchInput(''); setSearch(''); setPage(0); setBrowsing(true); }}>
                            Explore all {catalogTotal} options &rarr;
                        </button>
                    )}
                </div>
            </div>
            <div className='slide-nav'>
                <NavBtn onClick={onPrevious} direction='prev'>&larr; Prev</NavBtn>
                <NavBtn onClick={() => onNext()}>Next &rarr;</NavBtn>
            </div>
        </>
    );
}
