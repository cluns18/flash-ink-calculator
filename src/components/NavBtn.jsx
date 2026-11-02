import React from 'react';

// Hover is .btnColor:hover (the site's own teal-hover, white label at 5.3:1). No opacity on
// top of it: on a phone :hover sticks after a tap, and a faded button reads as disabled.
const NavBtn = ({ onClick, direction = 'next', children }) => (
    <button
        type='button'
        onClick={onClick}
        className='btnColor py-2 px-6 rounded-full text-white text-lg font-semibold transition cursor-pointer'
    >
        {children || (direction === 'next' ? 'Next →' : '← Prev')}
    </button>
);

export default NavBtn;
