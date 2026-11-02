import tshirts from './tshirts';
import longsleeves from './longsleeves';
import hoodies from './hoodies';

// Curated shortlist per garment type. Picked by garment id, never by a label string, so a
// relabelled garment can never fall out of its own price (the exact-match label bug class).
export const CURATED = { tshirts, longsleeves, hoodies };

export const curatedList = (typeId) => Object.values(CURATED[typeId] || {});
