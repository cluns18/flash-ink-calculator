// Flash Ink (Bend, OR). Screen printing, promotions and embroidery. Owner Dan Wellisch.
//
// shop_id selects the brand kit in obg-mail-api/shops/flashink.json, which owns the email
// styling, recipients and copy, so nothing sensitive lives in this front end. The draft of
// that file sits in this repo as mail-api-shop.flashink.json until it is placed in the service.
//
// shop_phone and shop_email are the single source for every number and address shown in the
// calculator. Both read off www.flashink.com on 2026-11-02 (the tel: link in the header
// banner and the mailto: on /get-a-quote). The site lists no street address, so none is shown.
//
// Colours are the site's own Webflow custom properties; see the header of src/App.css.
const SHOP_CONFIG = {
    shop_id: 'flashink',
    shop_name: 'Flash Ink',
    shop_email: 'info@flashink.com',
    shop_phone: '(541) 323-5274',
    shop_city: 'Bend, OR',
    owner_name: 'Dan',
    logo: '/flashink-logo.svg',
    accent_color: '#2e5b6b',
    bg_color: '#edf3f6',
    card_color: '#ffffff',
};

export const telHref = `tel:+1${SHOP_CONFIG.shop_phone.replace(/[^0-9]/g, '')}`;

export default SHOP_CONFIG;
