import { priceJob } from '../pricing/flashInk.js';

// Glue between the calculator's state and the Flash Ink engine in src/pricing/flashInk.js.
// The engine is the one place prices come from; scripts/price-check.mjs imports the same
// file, so what it proves is what ships.
//
// A curated garment carries the cost from Flash Ink's sheet. A catalog garment carries its
// S&S base_cost. Either way the markup comes from the garment TYPE the customer picked, so a
// catalog hoodie rides SGM and a catalog tee rides BGM, never Local Threads' flat 1.4.
//
// Garment colour does not change the price: no underbase screen, as ConvertCalculator priced it.
const calculateFinalQuote = ({ selectedGarmentType, selectedGarment, printLocations, quantity }) =>
    priceJob({
        garmentTypeId: selectedGarmentType?.id,
        garmentCost: selectedGarment?.cost,
        locations: (printLocations || []).map((l) => ({ name: l.name, colors: l.colors })),
        quantity,
    });

export default calculateFinalQuote;
