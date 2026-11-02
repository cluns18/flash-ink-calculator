import G6440 from './longsleeves/G6440';
import NL6211 from './longsleeves/NL6211';
import BC3501 from './longsleeves/BC3501';
import CC6014 from './longsleeves/CC6014';

// Flash Ink's long-sleeve lineup, in ConvertCalculator order. The spec names the Next Level
// slot "Next Level 6411" at $8.41; this module is the 6211 (photos and colours) carrying that
// $8.41, exactly as the Earthbound rebuild ships it. Confirm the style with Dan.
const longsleeveGarments = { G6440, NL6211, BC3501, CC6014 };

export default longsleeveGarments;
