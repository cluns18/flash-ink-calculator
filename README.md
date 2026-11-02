# Flash Ink calculator

Replacement for Flash Ink's ConvertCalculator (`qj5JhGhtgNscdh4ei`) on flashink.com/get-a-quote.
Built on the Local Threads calculator (catalog browse, three-card garment step, per-location
artwork tabs, iframe auto-height, analytics) with Flash Ink's pricing and brand.

- Pricing: `src/pricing/flashInk.js` (SPM matrix, BGM for tees and long sleeves, SGM for hoodies,
  $25 a screen amortized, ONE lookup on total colours across all locations with sleeves
  counted twice, no underbase charge: ConvertCalculator's prices exactly, per Brian 2026-11-02).
- Price proof: `npm run test:price` checks the calculator against the spec, case by case.
- Quotes: `src/utils/quoteDelivery.js` posts to obg-mail-api `send_quote` with `shop_id: flashink`.
  The registry draft is `mail-api-shop.flashink.json` (goes in obg-mail-api `shops/flashink.json`).
- Env: copy `.env.example` to `.env.local`. Never commit `.env.local` or `dist/`.
