import { priceJob } from '../pricing/flashInk.js';

// Glue between the calculator's state and the Flash Ink engine in src/pricing/flashInk.js.
// The engine is the one place prices come from; scripts/price-check.mjs imports the same
// file, so what it proves is what ships.
//
// A curated garment carries the cost from Flash Ink's sheet. A catalog garment carries its
// S&S base_cost. Either way the markup comes from the garment TYPE the customer picked, so a
// catalog hoodie rides SGM and a catalog tee rides BGM, never Local Threads' flat 1.4.
//
// Underbase: the colour's `underbase` flag (1 = dark). A colour with no flag prices as dark,
// which quotes high rather than low.
const calculateFinalQuote = ({ selectedGarmentType, selectedGarment, selectedColor, printLocations, quantity }) =>
    priceJob({
        garmentTypeId: selectedGarmentType?.id,
        garmentCost: selectedGarment?.cost,
        darkGarment: selectedColor ? selectedColor.underbase !== 0 : true,
        locations: (printLocations || []).map((l) => ({ name: l.name, colors: l.colors })),
        quantity,
    });

export default calculateFinalQuote;
