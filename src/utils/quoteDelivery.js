// Quote delivery for OBG calculators.
//
// Ported from the blink-threads lead form, which learned this the hard way:
// artwork that only exists as a link is artwork the shop can lose. The
// calculator used to POST a single fetch carrying a Firebase URL and nothing
// else, so the shop had to click out to see what the customer sent, and one
// failed request threw the whole quote away behind an alert().
//
// Design rule, same as the lead forms: THE QUOTE MUST SURVIVE. A customer's
// name, number and order are worth far more than their logo file, so anything
// that can go wrong with the artwork degrades the artwork and never blocks the
// quote. See sendQuote().

// Vercel rejects request bodies over 4.5MB with a 413 before our handler ever
// runs. Measured against the live endpoint (blink, 2026-07-30): a 3MB file
// encodes to 4.00MB and passes, 3.5MB encodes to 4.67MB and is rejected. Budget
// under that and measure the REAL encoded body, because the size breakdown,
// description and contact fields share the same budget.
const MAX_BODY_BYTES = 3.8 * 1024 * 1024;

const REQUEST_TIMEOUT_MS = 30000;
const RETRIES = 2; // transient-failure retries, on top of the first try
const RETRY_BASE_MS = 800;

// Field caps. Generous for a human, tight enough that no single field can eat
// the body budget or produce an unreadable email.
const LIMITS = { name: 120, company: 200, email: 200, phone: 40, description: 4000 };

// Collapse anything that could forge an email header. The server strips these
// too, but doing it here means the value is already clean when it reaches the
// subject line and the Reply-To address.
export const clean = (s, max) =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]+/g, ' ')
    .trim()
    .slice(0, max);

// The name lands in BOTH the HTML body and the plain-text subject line, so a
// full escape would show "Bob &amp; Sue" in the subject. Dropping angle
// brackets kills tag injection while leaving the subject readable.
export const escName = (s) => String(s ?? '').replace(/[<>]/g, '');

export const toBase64 = async (file) => {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

// artwork_status is the field obg-mail-api actually reads. It regexes a URL out
// of this string to build the "Download Artwork" link, and decides the
// "Free Mockup Included" panel with startswith("uploaded"|"attached"|"yes"),
// so wording that merely CONTAINS "upload" will not trip it. Do not reword the
// leading token without checking api/send_quote.py:_artwork_section.
export const artworkStatus = ({ artworkUrl, pendingFilename }) => {
  if (artworkUrl) return `Uploaded: ${artworkUrl}`;
  if (pendingFilename) return `Upload incomplete: ${pendingFilename}`;
  return 'No file uploaded';
};

const post = async (endpoint, body) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.ok === false) {
      const err = new Error(out.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST a quote to obg-mail-api, attaching the artwork file when we can.
 *
 * @param {object}  payload   the {shop_id, customer, quote} body, already built
 * @param {File?}   file      the raw artwork File, when the customer picked one
 * @param {string?} artworkUrl the Firebase URL, only set if the upload succeeded
 * @param {string?} endpoint  override, defaults to the live service
 */
export const sendQuote = async (payload, { file, artworkUrl, endpoint } = {}) => {
  const url =
    endpoint ||
    import.meta.env.VITE_QUOTE_ENDPOINT ||
    'https://obg-mail-api.vercel.app/api/send_quote';

  // Only attach a file we actually managed to upload, so the shop always has
  // the Firebase link as a second copy of anything it receives. Attaching an
  // un-uploaded file would leave the shop with no fallback if the mail fails.
  let attachment = null;
  if (file && artworkUrl) {
    try {
      attachment = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: await toBase64(file),
      };
    } catch {
      attachment = null; // an unreadable file must not cost us the quote
    }
  }

  const slim = payload;
  let full = attachment
    ? { ...payload, quote: { ...payload.quote, attachments: [attachment] } }
    : slim;

  // Measure the real encoded body. If the attachment pushes us near the
  // platform limit, drop it up front rather than eating a guaranteed 413.
  if (attachment && new Blob([JSON.stringify(full)]).size > MAX_BODY_BYTES) full = slim;

  // Degrade ladder. Attempt the best payload we can, and on failure fall back
  // to the quote on its own before giving up. The artwork still reaches the
  // shop as a Firebase link inside the slim payload.
  const attempts = full === slim ? [slim] : [full, slim];
  let lastErr;
  for (const body of attempts) {
    for (let i = 0; i <= RETRIES; i++) {
      try {
        return await post(url, body);
      } catch (err) {
        lastErr = err;
        // Any 4xx is deterministic for THIS body: a 413 will be too big every
        // time and a 400 rejected every time. Stop retrying this payload and
        // let the ladder fall through to the smaller one.
        if (err.status && err.status >= 400 && err.status < 500) break;
        if (i < RETRIES) await sleep(RETRY_BASE_MS * Math.pow(2, i));
      }
    }
  }
  throw lastErr || new Error('Could not send quote');
};

export const __limits = { LIMITS, MAX_BODY_BYTES, RETRIES };
