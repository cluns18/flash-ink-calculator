import React, { useMemo, useState } from 'react';
import NavBtn from '../components/NavBtn';
import calculateFinalQuote from '../utils/functions';
import { MIN_QTY, PRINTS_PER_PLACEMENT } from '../pricing/flashInk';
import { sendQuote, clean, escName, artworkStatus } from '../utils/quoteDelivery';
import { trackEvent } from '../utils/analytics';
import SHOP_CONFIG, { telHref } from '../config/shop';

// Final step: sizes, price, contact, submit.
//
// ConvertCalculator showed YOUR PRICE (Price Per Item, Total Cost) before it asked for any
// contact details, then took Name, Email, Company, Phone and Delivery Address and sent the
// project. Same order here. The quantity is the sum of the size breakdown (carried from the
// Local Threads calculator), minimum 12, the floor of Flash Ink's old quantity slider.
//
// Never lose the quote: a withheld price still submits ("we will price it by hand"), and a
// failed send keeps everything on screen with the phone, the email and a prefilled mail link.

const GARMENT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
const MAX_PER_SIZE = 10000;

// Free text lands in the shop's HTML email unescaped, so angle brackets go too.
const text = (s, max) => escName(clean(s, max));

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FinalQuote({
    onNext, onPrevious, selectedGarmentType, selectedModel, selectedGarment, selectedColor, printLocations,
}) {
    // Raw strings while typing, so clearing a field to retype never snaps it back. Clamped on blur.
    const [sizes, setSizes] = useState(() => Object.fromEntries(GARMENT_SIZES.map((s) => [s, ''])));
    const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', address: '' });
    const [touched, setTouched] = useState({});
    const [status, setStatus] = useState('idle'); // idle | sending | failed

    const counts = Object.fromEntries(GARMENT_SIZES.map((s) => [s, parseInt(sizes[s], 10) || 0]));
    const quantity = Object.values(counts).reduce((a, b) => a + b, 0);
    const belowMin = quantity < MIN_QTY;

    const quote = useMemo(
        () => calculateFinalQuote({ selectedGarmentType, selectedGarment, selectedColor, printLocations, quantity }),
        [selectedGarmentType, selectedGarment, selectedColor, printLocations, quantity]
    );
    // Priced by hand: the sheet has no number for this job (7 or 8 screens at 600+, or past
    // the matrix), but the lead is still worth sending.
    const byHand = !belowMin && !quote.ok && (quote.code === 'NO_PRICE_CELL' || quote.code === 'SCREENS_EXCEEDED');

    const dark = selectedColor ? selectedColor.underbase !== 0 : true;
    const baseLabel = selectedModel || selectedGarmentType?.name || '';
    const garmentLabel = selectedGarment?.fromCatalog && selectedGarment.title ? `${baseLabel} · ${selectedGarment.title}` : baseLabel;

    const setSize = (size, raw) => {
        const digits = raw.replace(/[^0-9]/g, '').slice(0, 5);
        setSizes((prev) => ({ ...prev, [size]: digits }));
    };
    const blurSize = (size) => {
        setSizes((prev) => {
            const n = Math.min(Math.max(parseInt(prev[size], 10) || 0, 0), MAX_PER_SIZE);
            return { ...prev, [size]: n ? String(n) : '' };
        });
    };
    const bump = (size, delta) => {
        setSizes((prev) => {
            const n = Math.min(Math.max((parseInt(prev[size], 10) || 0) + delta, 0), MAX_PER_SIZE);
            return { ...prev, [size]: n ? String(n) : '' };
        });
    };

    const errors = {};
    if (!form.name.trim()) errors.name = 'Please add your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Please add a valid email.';
    const phoneDigits = form.phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) errors.phone = 'Please add a phone number we can call.';
    const formValid = Object.keys(errors).length === 0;
    const uploading = (printLocations || []).some((l) => l.status === 'uploading');
    const canSubmit = !belowMin && formValid && (quote.ok || byHand) && status !== 'sending' && !uploading;

    const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    const blur = (e) => setTouched((t) => ({ ...t, [e.target.name]: true }));

    const sizeLine = GARMENT_SIZES.filter((s) => counts[s] > 0).map((s) => `${s} x ${counts[s]}`).join(' · ');
    const inkLine = (printLocations || [])
        .map((l) => {
            const both = (PRINTS_PER_PLACEMENT[l.name] || 1) > 1 ? ', both sleeves' : '';
            return `${l.name}: ${l.colors} color${l.colors === 1 ? '' : 's'}${dark ? ' + white base' : ''}${both}`;
        })
        .join(', ');
    const priceText = quote.ok ? quote.pricePerItem.toFixed(2) : 'Priced by hand';
    const totalText = quote.ok ? quote.totalQuote.toFixed(2) : 'Priced by hand';

    const buildPayload = () => {
        const locs = printLocations || [];
        const uploaded = locs.find((l) => l.artwork && !l.artwork.startsWith('pending:'));
        const pending = locs.find((l) => l.artwork && l.artwork.startsWith('pending:'));
        // One file rides as a real attachment (quoteDelivery attaches one). Every location's
        // file and notes also go in the notes line, so a second location's art is never lost.
        const notes = locs
            .map((l) => {
                const bits = [];
                if (l.description.trim()) bits.push(text(l.description, 1500));
                if (l.artwork && !l.artwork.startsWith('pending:')) bits.push(`file: ${l.artwork}`);
                else if (l.artwork) bits.push(`upload incomplete: ${text(l.fileName, 200)}`);
                return bits.length ? `${l.name}: ${bits.join(', ')}` : null;
            })
            .filter(Boolean);
        const address = text(form.address, 300);
        if (address) notes.push(`Delivery address: ${address}`);
        if (byHand) notes.push(`No instant price: ${quote.message}`);

        return {
            payload: {
                shop_id: SHOP_CONFIG.shop_id,
                customer: {
                    name: escName(clean(form.name, 120)),
                    email: clean(form.email, 200),
                    company: text(form.company, 200) || 'N/A',
                    phone: clean(form.phone, 40),
                },
                quote: {
                    project: 'Screen Printing',
                    garment_name: text(garmentLabel, 200),
                    color: text(selectedColor?.name || '', 80),
                    locations: locs.map((l) => l.name).join(', ') || 'None',
                    ink_details: inkLine || 'Standard',
                    special_inks: dark ? 'White underbase (dark garment)' : 'None',
                    size_breakdown: sizeLine || 'N/A',
                    quantity,
                    price_per_item: priceText,
                    total_price: totalText,
                    artwork_status: artworkStatus({
                        artworkUrl: uploaded?.artwork || null,
                        pendingFilename: !uploaded && pending ? pending.fileName : null,
                    }),
                    artwork_description: clean(notes.join(' | '), 4000) || 'No description provided',
                    // Not rendered by the current templates; carried so a template can add it.
                    delivery_address: address || '',
                },
            },
            file: uploaded?.file || null,
            artworkUrl: uploaded?.artwork || null,
        };
    };

    const submit = async () => {
        setTouched({ name: true, email: true, phone: true });
        if (!canSubmit) return;
        setStatus('sending');
        const { payload, file, artworkUrl } = buildPayload();
        try {
            await sendQuote(payload, { file, artworkUrl });
            const detail = { totalQuote: totalText, pricePerItem: priceText, quantity };
            trackEvent('calculator_submission', detail);
            window.parent.postMessage({ event: 'calculator_submission', ...detail }, '*');
            onNext();
        } catch (err) {
            console.error('Quote submission failed:', err);
            trackEvent('calculator_send_failed', { message: String(err?.message || err).slice(0, 200) });
            setStatus('failed');
        }
    };

    const mailtoHref = () => {
        const body = [
            `Name: ${form.name}`, `Email: ${form.email}`, `Phone: ${form.phone}`, `Company: ${form.company}`,
            `Delivery address: ${form.address}`, '',
            `Garment: ${garmentLabel} (${selectedColor?.name || ''})`, `Prints: ${inkLine}`,
            `Sizes: ${sizeLine}`, `Quantity: ${quantity}`,
            `Price per item: ${priceText}`, `Total: ${totalText}`,
        ].join('\n');
        return `mailto:${SHOP_CONFIG.shop_email}?subject=${encodeURIComponent(`Quote request: ${quantity} ${garmentLabel}`)}&body=${encodeURIComponent(body)}`;
    };

    const fieldError = (name) => touched[name] && errors[name] ? <span className='field-error'>{errors[name]}</span> : null;

    return (
        <>
            <div className='slide-header' style={{ padding: '14px 24px 4px' }}>
                <h1 className='text-2xl headingColor'>Your price</h1>
                <p className='bodyColor' style={{ fontSize: '0.8rem' }}>
                    {garmentLabel}{selectedColor?.name ? ` in ${selectedColor.name}` : ''}
                </p>
            </div>
            <div className='slide-content final-quote-content'>
                <p className='text-sm font-semibold headingColor mb-2 text-center'>How many of each size?</p>
                <div className='size-grid'>
                    {GARMENT_SIZES.map((size) => (
                        <div key={size} className={`size-cell ${counts[size] > 0 ? 'is-active' : ''}`}>
                            <label className='size-label' htmlFor={`size-${size}`}>{size}</label>
                            <div className='size-row'>
                                <button type='button' className='size-btn' aria-label={`One less ${size}`} onClick={() => bump(size, -1)}>-</button>
                                <input
                                    id={`size-${size}`}
                                    className='size-input'
                                    type='text'
                                    inputMode='numeric'
                                    placeholder='0'
                                    value={sizes[size]}
                                    onChange={(e) => setSize(size, e.target.value)}
                                    onBlur={() => blurSize(size)}
                                    onFocus={(e) => e.target.select()}
                                />
                                <button type='button' className='size-btn' aria-label={`One more ${size}`} onClick={() => bump(size, 1)}>+</button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className='price-card' aria-live='polite'>
                    {belowMin ? (
                        <p className='price-note'>
                            Minimum order: {MIN_QTY} pieces.{' '}
                            {quantity > 0 ? `Add ${MIN_QTY - quantity} more to see your price.` : 'Add your sizes to see your price.'}
                        </p>
                    ) : quote.ok ? (
                        <>
                            <div className='price-row'>
                                <div>
                                    <div className='price-label'>Price Per Item</div>
                                    <div className='price-value'>{money(quote.pricePerItem)}</div>
                                </div>
                                <div>
                                    <div className='price-label'>Total Cost</div>
                                    <div className='price-value price-total'>{money(quote.totalQuote)}</div>
                                </div>
                                <div>
                                    <div className='price-label'>Pieces</div>
                                    <div className='price-value'>{quantity}</div>
                                </div>
                            </div>
                            <p className='price-note'>
                                Local pickup price. For delivery estimates, submit your address below. Price may vary slightly on final approval.
                            </p>
                        </>
                    ) : byHand ? (
                        <p className='price-note'>
                            {quote.message} Send it over and we will price it by hand, or call us at{' '}
                            <a href={telHref}>{SHOP_CONFIG.shop_phone}</a>.
                        </p>
                    ) : (
                        <p className='price-note'>
                            We could not price this combination. Call us at <a href={telHref}>{SHOP_CONFIG.shop_phone}</a> and we will sort it out.
                        </p>
                    )}
                </div>

                <p className='text-sm font-semibold headingColor mt-4 mb-2 text-center'>We will send you mockups and a final proof to approve</p>
                <div className='form-grid'>
                    <label className='form-field'>
                        <span>Your Name *</span>
                        <input name='name' type='text' autoComplete='name' value={form.name} onChange={change} onBlur={blur} />
                        {fieldError('name')}
                    </label>
                    <label className='form-field'>
                        <span>Your Best Email *</span>
                        <input name='email' type='email' autoComplete='email' value={form.email} onChange={change} onBlur={blur} />
                        {fieldError('email')}
                    </label>
                    <label className='form-field'>
                        <span>Phone Number *</span>
                        <input name='phone' type='tel' autoComplete='tel' value={form.phone} onChange={change} onBlur={blur} />
                        {fieldError('phone')}
                    </label>
                    <label className='form-field'>
                        <span>Company Name</span>
                        <input name='company' type='text' autoComplete='organization' value={form.company} onChange={change} />
                    </label>
                    <label className='form-field form-field--wide'>
                        <span>Delivery Address</span>
                        <input name='address' type='text' autoComplete='street-address' value={form.address} onChange={change} placeholder='Leave blank for local pickup in Bend' />
                    </label>
                </div>

                {status === 'failed' && (
                    <div className='send-failed' role='alert'>
                        <p><strong>Your project did not send.</strong> Everything you entered is still here. Try again, or reach us directly:</p>
                        <p>
                            <a href={telHref}>{SHOP_CONFIG.shop_phone}</a>{' · '}
                            <a href={mailtoHref()}>Email it to {SHOP_CONFIG.shop_email}</a>
                        </p>
                    </div>
                )}

                <div className='text-center mt-3 mb-3'>
                    <button type='button' className='submit-btn btnColor' onClick={submit} disabled={!canSubmit}>
                        {status === 'sending'
                            ? 'Sending...'
                            : belowMin
                            ? `Minimum ${MIN_QTY} pieces`
                            : uploading
                            ? 'Waiting for your artwork upload...'
                            : !formValid
                            ? 'Add your name, email and phone'
                            : status === 'failed'
                            ? 'Try Again'
                            : 'Submit for Mockups & Full Proposal'}
                    </button>
                </div>
            </div>
            <div className='slide-nav'>
                <NavBtn onClick={onPrevious} direction='prev'>&larr; Prev</NavBtn>
                <div></div>
            </div>
        </>
    );
}
