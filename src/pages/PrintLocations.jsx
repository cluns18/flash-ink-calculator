import React, { useEffect, useState } from 'react';
import NavBtn from '../components/NavBtn';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../firebaseConfig';
import { PLACEMENTS, PRINTS_PER_PLACEMENT, MAX_SCREENS } from '../pricing/flashInk';
import SHOP_CONFIG, { telHref } from '../config/shop';

// One tab per print location, each with its own artwork and its own ink colours, because
// that is how the job prices (one matrix lookup per location). Carried from the Local Threads
// calculator's front and back tabs.
//
// Placements are Flash Ink's own (src/pricing/flashInk.js PLACEMENTS): Front Chest, Full
// Front, Full Back, plus Sleeves on long sleeves and hoodies, which prints both arms and so
// counts as two prints, the way ConvertCalculator doubled it.

const BACK_NAME = 'Full Back';
const TAB_LABELS = { 'Full Back': 'Back' };
const tabLabel = (name) => TAB_LABELS[name] || name;

// Artwork upload limits, from the base template's hardened ArtworkSelect.
const MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 60000;
const withTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out')), ms)),
    ]);

let nextId = 1;
export const newLocation = (name) => ({
    id: nextId++,
    name,
    artwork: null,      // Firebase URL, or `pending:<file>` while uploading or after a failure
    file: null,         // the raw File, so it can ride along as a real email attachment
    fileName: null,
    status: 'idle',     // 'idle' | 'uploading' | 'success' | 'error' | 'too-big'
    description: '',
    colors: 1,
});

export const hasArtwork = (loc) => Boolean(loc.artwork || loc.description.trim());

export default function PrintLocations({ onNext, onPrevious, selectedGarmentType, selectedColor, printLocations, setPrintLocations }) {
    const placements = PLACEMENTS[selectedGarmentType?.id] || [];
    // A dark garment spends one screen per location on the white underbase, so the most ink
    // colours one spot can carry is the matrix width less that screen. A colour with no
    // flag is treated as dark, matching the price engine.
    const dark = selectedColor ? selectedColor.underbase !== 0 : true;
    const maxColors = MAX_SCREENS - (dark ? 1 : 0);

    const [activeId, setActiveId] = useState(printLocations[0]?.id ?? null);
    const [showHint, setShowHint] = useState(false);

    // Start with the first placement. Start over if the garment changed underneath a
    // placement the new garment does not have (Sleeves on a tee).
    useEffect(() => {
        if (placements.length === 0) return;
        const stale = printLocations.length === 0 || printLocations.some((l) => !placements.includes(l.name));
        if (stale) {
            const first = newLocation(placements[0]);
            setPrintLocations([first]);
            setActiveId(first.id);
        } else if (!printLocations.some((l) => l.id === activeId)) {
            setActiveId(printLocations[0].id);
        }
    }, [placements, printLocations, activeId, setPrintLocations]);

    // Going back and switching to a dark colour lowers the ceiling. Pull any location that
    // is now over it back down rather than quoting a job the sheet cannot price.
    useEffect(() => {
        if (printLocations.some((l) => l.colors > maxColors)) {
            setPrintLocations((prev) => prev.map((l) => (l.colors > maxColors ? { ...l, colors: maxColors } : l)));
        }
    }, [maxColors, printLocations, setPrintLocations]);

    const active = printLocations.find((l) => l.id === activeId) || printLocations[0];
    const used = printLocations.map((l) => l.name);
    const unused = placements.filter((p) => !used.includes(p));
    const backFree = unused.includes(BACK_NAME);
    const otherUnused = unused.filter((p) => p !== BACK_NAME);

    const update = (id, patch) =>
        setPrintLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

    const add = (name) => {
        const loc = newLocation(name);
        setPrintLocations((prev) => [...prev, loc]);
        setActiveId(loc.id);
        setShowHint(false);
    };

    const remove = (id) => {
        const rest = printLocations.filter((l) => l.id !== id);
        setPrintLocations(rest);
        setActiveId(rest[0]?.id ?? null);
    };

    const handleFile = async (id, file) => {
        if (!file) return;
        if (file.size > MAX_BYTES) {
            update(id, { file: null, fileName: file.name, artwork: null, status: 'too-big' });
            return;
        }
        update(id, { file, fileName: file.name, status: 'uploading', artwork: `pending:${file.name}` });
        setShowHint(false);

        // Unique, FLAT key under uploads/. The bucket rule is `match /uploads/{fileName}`, a
        // single path segment, so a nested key 403s. Unique so two customers' "logo.png"
        // never overwrite each other.
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_');
        const storageRef = ref(storage, `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
        try {
            await withTimeout(uploadBytes(storageRef, file), UPLOAD_TIMEOUT_MS);
            const downloadURL = await withTimeout(getDownloadURL(storageRef), 15000);
            update(id, { artwork: downloadURL, status: 'success' });
        } catch (error) {
            // Keep the `pending:` marker so the shop's email flags the incomplete upload, and
            // tell the customer plainly. Never report a failed upload as uploaded.
            console.error('Error uploading file:', error);
            update(id, { status: 'error' });
        }
    };

    const uploading = printLocations.some((l) => l.status === 'uploading');

    const handleNext = () => {
        if (uploading) return;
        if (!printLocations.some(hasArtwork)) {
            setShowHint(true);
            return;
        }
        onNext();
    };

    const detail = (loc) => {
        const prints = PRINTS_PER_PLACEMENT[loc.name] || 1;
        const colors = `${loc.colors} ${loc.colors === 1 ? 'color' : 'colors'}`;
        return prints > 1 ? `${colors}, both sleeves` : colors;
    };

    if (!active) return null;

    return (
        <>
            <div className='slide-header'>
                <h1 className='text-3xl headingColor'>Where do you want your art?</h1>
                <p className='mt-1 text-sm bodyColor'>
                    Every ink color on each design location requires another screen. Screens and setup time determine price.
                </p>
            </div>
            <div className='slide-content final-quote-content'>
                <div className='loc-tabs' role='tablist' aria-label='Print locations'>
                    {printLocations.map((loc) => (
                        <button
                            key={loc.id}
                            type='button'
                            role='tab'
                            aria-selected={loc.id === active.id}
                            className={`loc-tab ${loc.id === active.id ? 'btnColor' : 'btnInactive'}`}
                            onClick={() => setActiveId(loc.id)}
                        >
                            {tabLabel(loc.name)}
                        </button>
                    ))}
                    {backFree && (
                        <button type='button' className='loc-tab loc-tab-add' onClick={() => add(BACK_NAME)}>
                            + Back
                        </button>
                    )}
                    {otherUnused.length > 0 && (
                        <button type='button' className='loc-tab loc-tab-add' onClick={() => add(otherUnused[0])}>
                            + Another Spot
                        </button>
                    )}
                </div>

                <div className='loc-panel text-left' role='tabpanel'>
                    <label className='block text-sm font-semibold headingColor mb-2'>Where does this one go?</label>
                    <div className='flex flex-wrap gap-2 mb-4'>
                        {placements.filter((p) => p === active.name || !used.includes(p)).map((p) => (
                            <button
                                key={p}
                                type='button'
                                aria-pressed={p === active.name}
                                className={`loc-chip ${p === active.name ? 'btnColor' : 'btnInactive'}`}
                                onClick={() => update(active.id, { name: p })}
                            >
                                {p}
                            </button>
                        ))}
                    </div>

                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <div>
                            <label className='block text-sm font-semibold headingColor mb-1'>Upload the {tabLabel(active.name)} artwork</label>
                            <p className='text-xs bodyColor mb-2'>JPG, PNG, PDF, AI, EPS or SVG, up to 20MB</p>
                            <label className='loc-file btnInactive'>
                                {active.fileName && active.status !== 'too-big' ? 'Replace File' : 'Choose File'}
                                <input
                                    key={active.id}
                                    type='file'
                                    accept='image/*,.pdf,.ai,.eps,.svg'
                                    onChange={(e) => handleFile(active.id, e.target.files[0])}
                                    className='sr-only'
                                />
                            </label>
                            {active.status === 'uploading' && (
                                <p className='text-xs mt-2 bodyColor' style={{ fontWeight: 600 }}>Uploading {active.fileName}...</p>
                            )}
                            {active.status === 'success' && (
                                <p className='text-xs mt-2' style={{ color: '#0f6b3a', fontWeight: 600 }}>Uploaded: {active.fileName}</p>
                            )}
                            {(active.status === 'error' || active.status === 'too-big') && (
                                <div className='mt-2 p-3 rounded-lg' style={{ background: '#fde8e8', border: '1px solid #f5b5b5' }}>
                                    <p className='text-xs' style={{ color: '#b42318', fontWeight: 700 }}>
                                        {active.status === 'too-big' ? 'That file is over 20MB.' : "Your file didn't finish uploading."}
                                    </p>
                                    <p className='text-xs mt-1' style={{ color: '#7a1b12' }}>
                                        Try again, or describe your design below and we will email you for the artwork.
                                        Your quote will still go through.
                                    </p>
                                </div>
                            )}
                            <label htmlFor={`loc-desc-${active.id}`} className='block text-sm font-semibold headingColor mt-4 mb-1'>
                                Or describe your artwork
                            </label>
                            <p className='text-xs bodyColor mb-2'>
                                It's okay if you don't have any right now, we've got artists that can help you create an incredible design or logo.
                            </p>
                            <textarea
                                key={`d-${active.id}`}
                                id={`loc-desc-${active.id}`}
                                placeholder='Wording, colors, layout...'
                                value={active.description}
                                onChange={(e) => { update(active.id, { description: e.target.value }); setShowHint(false); }}
                                className='w-full p-3 border-2 rounded-lg h-20 resize-none transition text-sm'
                                style={{ fontFamily: 'var(--fi-font-body)' }}
                            />
                        </div>

                        <div>
                            <label className='block text-sm font-semibold headingColor mb-1'>How many colors are on the {tabLabel(active.name).toLowerCase()} design?</label>
                            <p className='text-xs bodyColor mb-2'>Each color is its own screen, so it changes the price.</p>
                            <div className='loc-stepper'>
                                <button
                                    type='button'
                                    className='loc-step btnInactive'
                                    aria-label='Fewer ink colors'
                                    disabled={active.colors <= 1}
                                    onClick={() => update(active.id, { colors: Math.max(1, active.colors - 1) })}
                                >
                                    -
                                </button>
                                <span className='loc-count headingColor' aria-live='polite'>{active.colors}</span>
                                <button
                                    type='button'
                                    className='loc-step btnInactive'
                                    aria-label='More ink colors'
                                    disabled={active.colors >= maxColors}
                                    onClick={() => update(active.id, { colors: Math.min(maxColors, active.colors + 1) })}
                                >
                                    +
                                </button>
                                <span className='text-sm bodyColor'>{active.colors === 1 ? 'color' : 'colors'}</span>
                            </div>
                            {PRINTS_PER_PLACEMENT[active.name] > 1 && (
                                <p className='text-xs bodyColor mt-2'>Sleeves prints both arms, so it prices as two prints.</p>
                            )}
                            {dark && (
                                <p className='text-xs bodyColor mt-2'>
                                    {selectedColor?.name || 'This color'} is a dark garment, so we lay down a white base first to keep
                                    your colors bright. That base uses one screen.
                                </p>
                            )}
                            {active.colors >= maxColors && (
                                <p className='text-xs bodyColor mt-2'>
                                    More than {maxColors} colors in one spot? Call us at{' '}
                                    <a href={telHref} className='underline font-semibold' style={{ color: 'var(--fi-teal)' }}>{SHOP_CONFIG.shop_phone}</a>{' '}
                                    and we will price it.
                                </p>
                            )}
                            {printLocations.length > 1 && (
                                <button type='button' className='loc-remove' onClick={() => remove(active.id)}>
                                    Remove the {tabLabel(active.name)} print
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <p className='text-sm bodyColor mt-4 mb-3 text-center'>
                    {printLocations.length} print {printLocations.length === 1 ? 'location' : 'locations'} on your quote:{' '}
                    {printLocations.map((l) => `${tabLabel(l.name)} (${detail(l)})`).join(', ')}
                </p>
                {showHint && (
                    <p className='text-sm mb-3 text-center' role='alert' style={{ color: 'var(--fi-error)', fontWeight: 600 }}>
                        Upload a file or describe your design for at least one location.
                    </p>
                )}
            </div>
            <div className='slide-nav'>
                <NavBtn onClick={onPrevious} direction='prev'>&larr; Prev</NavBtn>
                <NavBtn onClick={handleNext}>{uploading ? 'Uploading...' : <>Next &rarr;</>}</NavBtn>
            </div>
        </>
    );
}
