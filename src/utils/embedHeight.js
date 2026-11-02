/**
 * Keep the embedding page's iframe the same height as the calculator.
 *
 * Local Threads (where this came from) pinned the calculator iframe to a
 * fixed height (760px on the homepage, a 780px min-height on the city and
 * service pages) while the card itself runs roughly 430-500px and changes with
 * the slide. The leftover few hundred pixels render as dead charcoal under the
 * card on ~110 pages.
 *
 * A frame cannot resize itself, so the height goes over postMessage and the
 * parent applies it. Two things have to happen together or the number is wrong:
 *
 *  - `.slide-container` has `min-height: 100vh` and `.slide-page` has
 *    `max-height: calc(100vh - 48px)`. Inside a frame, 100vh is the frame's own
 *    height, so measuring would just hand back whatever height the parent
 *    already set. The `is-embedded` class drops both.
 *  - Dropping the max-height also breaks a feedback loop. Left in, the parent
 *    shrinking the frame would shrink 100vh, which would clamp the card, which
 *    would report smaller again.
 *
 * Webflow side (custom code embed on flashink.com/get-a-quote, replacing the
 * ConvertCalculator div). <CALC_URL> is the Netlify URL once deployed:
 *
 *   <iframe id="flashink-calc" src="<CALC_URL>" title="Quick Quote Estimate"
 *           style="width:100%;border:0;height:720px" loading="lazy"></iframe>
 *   <script>
 *     window.addEventListener('message', function (e) {
 *       var d = e.data || {};
 *       if (d.type === 'flashink-calc-height' && d.height) {
 *         document.getElementById('flashink-calc').style.height = d.height + 'px';
 *       }
 *       if (d.event === 'calculator_submission' && window.gtag) {
 *         window.gtag('event', 'generate_lead', { value: Number(d.totalQuote) || 0, currency: 'USD' });
 *       }
 *     });
 *   </script>
 */

const MESSAGE_TYPE = 'flashink-calc-height';

export function isEmbedded() {
    try {
        return window.self !== window.top;
    } catch {
        // Cross-origin access to window.top throws, which only happens when we
        // are in fact framed.
        return true;
    }
}

export function initEmbedHeight() {
    if (typeof window === 'undefined' || !isEmbedded()) return;

    document.documentElement.classList.add('is-embedded');

    const root = document.querySelector('.slide-container') || document.body;
    let last = 0;

    // Measure the card, never the container. The container can end up as tall as
    // the frame, so measuring it makes the number self-fulfilling: it would grow
    // to fit a tall slide and then never shrink back, because the height it
    // reports is the height the parent just gave it. The card's height is purely
    // content driven, so it moves in both directions.
    const measure = () => {
        const card = document.querySelector('.slide-page');
        return card ? Math.ceil(card.getBoundingClientRect().height) : 0;
    };

    const post = () => {
        const height = measure();
        // Sub-pixel churn during transitions would otherwise post on every frame.
        if (!height || Math.abs(height - last) < 2) return;
        last = height;
        window.parent.postMessage({ type: MESSAGE_TYPE, height }, '*');
    };

    if (typeof ResizeObserver === 'function') {
        // Observing the container rather than the card, because React swaps the
        // card element between the loading, error and main branches and an
        // observer bound to a detached node goes quiet.
        const ro = new ResizeObserver(post);
        ro.observe(root);
        const card = document.querySelector('.slide-page');
        if (card) ro.observe(card);
        // Rebind when the card is replaced, otherwise the only signal left is
        // the container, which does not change when the card shrinks.
        new MutationObserver(() => {
            const next = document.querySelector('.slide-page');
            if (next) ro.observe(next);
            post();
        }).observe(root, { childList: true, subtree: true });
    } else {
        window.addEventListener('resize', post);
    }

    // Web fonts and the garment photos both land after first paint and both
    // change the card's height.
    window.addEventListener('load', post);
    if (document.fonts?.ready) document.fonts.ready.then(post);

    post();
}
