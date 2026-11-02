import React from 'react';
import SHOP_CONFIG, { telHref } from '../config/shop';

export default function ThankYou() {
    return (
        <>
            <div className='slide-header'>
                <img src={SHOP_CONFIG.logo} alt={SHOP_CONFIG.shop_name} style={{ width: '96px', height: 'auto', margin: '0 auto 10px' }} />
                <h1 className='text-3xl headingColor'>Submitted!</h1>
                <p className='mt-1 text-sm bodyColor'>
                    We've got your project. A copy of your quote is on the way to your inbox.
                </p>
            </div>
            <div className='slide-content'>
                <div className='p-6 rounded-lg' style={{ background: 'var(--fi-paper)', border: '1px solid rgba(14,27,32,0.12)' }}>
                    <p className='text-base bodyColor mb-4'>
                        We will send you mockups and a final proof to approve before anything goes to press.
                    </p>
                    <p className='text-base headingColor'>Questions? Call us.</p>
                    <p className='mt-2 text-lg'>
                        <a href={telHref} className='font-semibold underline' style={{ color: 'var(--fi-teal-deep)' }}>{SHOP_CONFIG.shop_phone}</a>
                    </p>
                    <p className='mt-1 text-lg'>
                        <a href={`mailto:${SHOP_CONFIG.shop_email}`} className='font-semibold underline' style={{ color: 'var(--fi-teal-deep)' }}>{SHOP_CONFIG.shop_email}</a>
                    </p>
                </div>
            </div>
            <div className='slide-nav nav-end'></div>
        </>
    );
}
