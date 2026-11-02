// The quote payload FinalQuote sends to obg-mail-api send_quote, as a pure module.
//
// It used to be built inline inside FinalQuote.jsx, which meant no test could build the
// exact body the calculator ships. It lives here so FinalQuote and
// scripts/lead-contract-test.mjs call the same code (lead-path-test skill, R1). No React,
// no browser globals: everything it needs comes in as arguments.

import { PRINTS_PER_PLACEMENT } from '../pricing/flashInk';
import { clean, escName, artworkStatus } from './quoteDelivery';
import SHOP_CONFIG from '../config/shop';

export const GARMENT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];

// Free text lands in the shop's HTML email unescaped, so angle brackets go too.
const text = (s, max) => escName(clean(s, max));

// "Next Level 3600 - Most Popular", plus the catalog title when the blank came from the catalog.
export const garmentLabelFor = ({ selectedModel, selectedGarmentType, selectedGarment }) => {
    const baseLabel = selectedModel || selectedGarmentType?.name || '';
    return selectedGarment?.fromCatalog && selectedGarment.title ? `${baseLabel} · ${selectedGarment.title}` : baseLabel;
};

// The human lines shared by the payload, the mailto fallback and the analytics event.
// No underbase or white base anywhere: the price does not include one (ConvertCalculator
// parity, 2026-11-02), so the shop email must not suggest a charge the customer never saw.
export const describeJob = ({ counts, printLocations, quote }) => {
    const sizeLine = GARMENT_SIZES.filter((s) => counts[s] > 0).map((s) => `${s} x ${counts[s]}`).join(' · ');
    const inkLine = (printLocations || [])
        .map((l) => {
            const both = (PRINTS_PER_PLACEMENT[l.name] || 1) > 1 ? ', both sleeves' : '';
            return `${l.name}: ${l.colors} color${l.colors === 1 ? '' : 's'}${both}`;
        })
        .join(', ');
    const priceText = quote.ok ? quote.pricePerItem.toFixed(2) : 'Priced by hand';
    const totalText = quote.ok ? quote.totalQuote.toFixed(2) : 'Priced by hand';
    return { sizeLine, inkLine, priceText, totalText };
};

/**
 * Build the send_quote body plus the file that rides along as an attachment.
 *
 * @returns {{ payload: object, file: File|null, artworkUrl: string|null }}
 *          exactly what FinalQuote hands to sendQuote(payload, { file, artworkUrl }).
 */
export const buildQuotePayload = ({ form, garmentLabel, selectedColor, printLocations, quantity, counts, quote, byHand }) => {
    const { sizeLine, inkLine, priceText, totalText } = describeJob({ counts, printLocations, quote });
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
                special_inks: 'None',
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
