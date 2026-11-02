// Live lead contract test for the Flash Ink calculator (lead-path-test skill, R1).
//
// npm run test:lead              DRY RUN (default). Builds the quote with the SHIPPED pricing
//                                and payload builder, runs it through the shipped sendQuote
//                                with fetch stubbed out, and prints it. Sends nothing.
// npm run test:lead -- --live    Posts that same quote through the shipped sendQuote to the
//                                LIVE obg-mail-api send_quote, in canary mode.
//
// Every piece of the body comes from the code the calculator ships, loaded through Vite in
// production mode (so the endpoint is the one the bundle uses, not a dev override):
//   src/utils/functions.js     calculateFinalQuote, the price FinalQuote shows
//   src/utils/quotePayload.js  buildQuotePayload, the body FinalQuote sends
//   src/utils/quoteDelivery.js sendQuote, the attach / retry / fallback ladder
//   src/garments/tshirts/NL3600.js, the real garment and colour
//
// Canary mode is the ONLY reroute used here. The flashink kit mails info@flashink.com, so the
// request carries X-OBG-Canary = OBG_CANARY_KEY (read from ~/.config/obg-automation/keys.env,
// never printed), and obg-mail-api (lib/canary.py) then sends every recipient to OBG's canary
// inbox and forces the sender to "OBG Canary Test". No key, no live run. A live response
// without `canary: true` means the mail went to Flash Ink, and the test fails loudly.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const LIVE = process.argv.includes('--live');
const OBG_INBOX = 'olivebranchgrowth@gmail.com';
const PROD_ENDPOINT = 'https://obg-mail-api.vercel.app/api/send_quote';
const KEYS_FILE = path.join(os.homedir(), '.config/obg-automation/keys.env');
const root = new URL('..', import.meta.url).pathname;

const loadCanaryKey = () => {
  let raw;
  try {
    raw = fs.readFileSync(KEYS_FILE, 'utf8');
  } catch {
    return '';
  }
  const line = raw.split('\n').find((l) => /^\s*(export\s+)?OBG_CANARY_KEY\s*=/.test(l));
  if (!line) return '';
  return line.replace(/^\s*(export\s+)?OBG_CANARY_KEY\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
};
const CANARY_KEY = loadCanaryKey();
// lib/canary.py ignores any key shorter than 24 characters, which would send to the shop.
const KEY_OK = CANARY_KEY.length >= 24;

if (LIVE && !KEY_OK) {
  console.error(`REFUSED: OBG_CANARY_KEY is missing or too short in ${KEYS_FILE}.`);
  console.error('Without it send_quote mails info@flashink.com. Not running live.');
  process.exit(1);
}

const vite = await createServer({
  root,
  mode: 'production',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
});

let exitCode = 0;
try {
  const { buildQuotePayload, garmentLabelFor } = await vite.ssrLoadModule('/src/utils/quotePayload.js');
  const { sendQuote } = await vite.ssrLoadModule('/src/utils/quoteDelivery.js');
  const calculateFinalQuote = (await vite.ssrLoadModule('/src/utils/functions.js')).default;
  const { MIN_QTY } = await vite.ssrLoadModule('/src/pricing/flashInk.js');
  const garment = (await vite.ssrLoadModule('/src/garments/tshirts/NL3600.js')).default;

  const stamp = `OBG CONTRACT TEST ${new Date().toISOString()}`;

  // ---- calculator state, shaped exactly as App / PrintLocations / FinalQuote hold it
  const selectedGarmentType = { id: 'tshirts', name: 'T-Shirt' };
  const selectedGarment = garment;
  const selectedModel = garment.label || garment.name || garment.id; // GarmentModelSelect labelFor
  const selectedColor = garment.colors.find((c) => c.name === 'Black');
  // A tiny real PNG (1x1), uploaded on the Front Chest, so the attachment path is exercised.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const file = new File([png], 'obg-contract-test-logo.png', { type: 'image/png' });
  const printLocations = [
    { id: 1, name: 'Front Chest', colors: 2, artwork: 'https://example.com/obg-contract-test/obg-contract-test-logo.png',
      file, fileName: file.name, status: 'success', description: 'OBG internal test. Logo in white and red.' },
    { id: 2, name: 'Full Back', colors: 1, artwork: null, file: null, fileName: null, status: 'idle',
      description: 'OBG internal test. Event dates list, one colour.' },
  ];
  const counts = { XS: 0, S: 8, M: 16, L: 16, XL: 8, '2XL': 0, '3XL': 0 };
  const quantity = Object.values(counts).reduce((a, b) => a + b, 0);
  const form = {
    name: stamp, email: OBG_INBOX, phone: '(541) 555-0100',
    company: 'Olive Branch Growth (internal test, ignore)', address: '123 Test St, Bend, OR 97701',
  };

  // ---- the same derivations FinalQuote makes, then the shipped price and payload
  const quote = calculateFinalQuote({ selectedGarmentType, selectedGarment, selectedColor, printLocations, quantity });
  const belowMin = quantity < MIN_QTY;
  const byHand = !belowMin && !quote.ok && (quote.code === 'NO_PRICE_CELL' || quote.code === 'SCREENS_EXCEEDED');
  const dark = selectedColor ? selectedColor.underbase !== 0 : true;
  const garmentLabel = garmentLabelFor({ selectedModel, selectedGarmentType, selectedGarment });
  const built = buildQuotePayload({ form, garmentLabel, selectedColor, printLocations, dark, quantity, counts, quote, byHand });
  const { payload } = built;

  // ---- run it through the shipped sendQuote, with fetch captured (and stubbed in dry run)
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url, canaryHeader: Boolean(init.headers?.['X-OBG-Canary']), attachments: (body.quote?.attachments || []).length, body });
    if (!LIVE) return new Response(JSON.stringify({ ok: true, dryRun: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return realFetch(url, init);
  };
  let result = null;
  let sendErr = null;
  try {
    result = await sendQuote(payload, {
      file: built.file,
      artworkUrl: built.artworkUrl,
      headers: KEY_OK ? { 'X-OBG-Canary': CANARY_KEY } : undefined,
    });
  } catch (err) {
    sendErr = err;
  } finally {
    globalThis.fetch = realFetch;
  }

  // ---- contract checks
  const problems = [];
  const first = sent[0];
  const q = payload.quote;
  if (!quote.ok) problems.push(`shipped pricing withheld the price (${quote.code}): ${quote.message}`);
  if (!first) problems.push('sendQuote never called fetch');
  else {
    if (first.url !== PROD_ENDPOINT) problems.push(`endpoint is ${first.url}, expected ${PROD_ENDPOINT}`);
    if (first.attachments !== 1) problems.push(`attachment did not ride along (${first.attachments})`);
    if (KEY_OK && !first.canaryHeader) problems.push('X-OBG-Canary header did not reach the request');
  }
  if (payload.shop_id !== 'flashink') problems.push(`shop_id is ${payload.shop_id}`);
  if (payload.customer.name !== stamp) problems.push('customer name lost the stamp');
  for (const k of ['name', 'email', 'phone']) if (!String(payload.customer[k] || '').trim()) problems.push(`empty customer.${k}`);
  for (const k of ['project', 'garment_name', 'color', 'locations', 'ink_details', 'size_breakdown', 'price_per_item', 'total_price', 'artwork_status', 'artwork_description']) {
    if (!String(q[k] ?? '').trim()) problems.push(`empty quote.${k}`);
  }
  if (q.quantity !== 48) problems.push(`quantity is ${q.quantity}`);
  if (!/^\d+\.\d{2}$/.test(q.price_per_item) || !/^\d+\.\d{2}$/.test(q.total_price)) problems.push('price fields are not numbers');
  if (!/^Uploaded: https?:\/\//.test(q.artwork_status)) problems.push(`artwork_status is "${q.artwork_status}"`);
  if (sendErr) problems.push(`sendQuote threw: ${sendErr.message}${sendErr.status ? ` (HTTP ${sendErr.status})` : ''}`);

  const shown = first ? { ...first.body, quote: { ...first.body.quote,
    attachments: (first.body.quote.attachments || []).map((a) => ({ name: a.name, type: a.type, base64_chars: a.data.length })) } } : payload;
  console.log(`mode: ${LIVE ? 'LIVE (canary)' : 'dry run'}`);
  console.log(`canary key: ${KEY_OK ? 'loaded' : 'MISSING'} (value never printed)`);
  console.log(`requests: ${sent.map((s) => `${s.url} [attachments ${s.attachments}, canary header ${s.canaryHeader ? 'yes' : 'NO'}]`).join(' ; ')}`);
  console.log(`stamp: ${stamp}`);
  console.log(JSON.stringify(shown, null, 2));

  if (problems.length) {
    console.error(`\nFAIL contract: ${problems.join('; ')}`);
    exitCode = 1;
  }
  if (LIVE && result) {
    console.log(`\nresponse: ${JSON.stringify(result)}`);
    if (result.canary !== true) {
      console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.error('FAIL: the response has no `canary: true`. The server did NOT take canary mode,');
      console.error('so this test quote was mailed to Flash Ink (info@flashink.com). Tell Brian now.');
      console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      exitCode = 1;
    }
  }
  if (!exitCode) {
    if (LIVE) {
      console.log(`\nPASS: 200, ok:true, canary:true from ${first.url}.`);
      console.log(`Now search Gmail Sent for "${stamp}" and find BOTH the shop notification and the customer auto reply.`);
    } else {
      console.log('\nDRY RUN PASS: priced, built and sent through the shipped modules with fetch stubbed. Nothing left this machine.');
      console.log('Add -- --live to post it in canary mode.');
    }
  }
} finally {
  await vite.close();
}
process.exit(exitCode);
