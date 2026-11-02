import React, { useEffect } from 'react';
import NavBtn from '../components/NavBtn';
import SHOP_CONFIG from '../config/shop';
import tshirtImage from '/assets/tshirtspgarment.png';
import longSleeveImage from '/assets/longsleevespgarment.png';
import hoodieImage from '/assets/hoodiespgarment.png';

// Flash Ink's ConvertCalculator opened on this exact question (GT: T Shirt / Long Sleeve /
// Hoodie), so it is the first slide here too. Flash Ink's calculator only ever priced screen
// printing on these three, so there is no project-type step, no polos, no hats.
export const GARMENT_TYPES = [
    { id: 'tshirts', name: 'T-Shirt', image: tshirtImage },
    { id: 'longsleeves', name: 'Long Sleeve', image: longSleeveImage },
    { id: 'hoodies', name: 'Hoodie', image: hoodieImage },
];

export default function GarmentTypeSelect({ selectedGarmentType, setSelectedGarmentType, onNext }) {
    useEffect(() => {
        if (!selectedGarmentType) setSelectedGarmentType(GARMENT_TYPES[0]);
    }, []);

    const shown = selectedGarmentType || GARMENT_TYPES[0];

    return (
        <>
            <div className='slide-header'>
                <img src={SHOP_CONFIG.logo} alt={SHOP_CONFIG.shop_name} className='intro-logo' style={{ width: '120px', height: 'auto', margin: '0 auto 10px' }} />
                <h1 className='text-3xl headingColor'>What type of garment are you printing on?</h1>
                <p className='mt-1 text-sm bodyColor'>
                    Build your order and see your price as you go. We will send you mockups and a final proof to approve.
                </p>
            </div>
            <div className='slide-content'>
                <div className='flex items-center gap-6 garment-layout'>
                    <div className='w-1/2 flex items-center justify-center garment-preview'>
                        <img src={shown.image} alt={shown.name} className='garment-img' />
                    </div>
                    <div className='w-1/2 grid grid-cols-1 gap-3 garment-buttons'>
                        {GARMENT_TYPES.map((garment) => (
                            <button
                                key={garment.id}
                                type='button'
                                aria-pressed={selectedGarmentType?.id === garment.id}
                                className={`w-full py-3 px-5 rounded-lg cursor-pointer text-base font-semibold transition duration-300 ${
                                    selectedGarmentType?.id === garment.id ? 'btnColor' : 'btnInactive'
                                }`}
                                onClick={() => setSelectedGarmentType(garment)}
                            >
                                {garment.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className='slide-nav nav-end'>
                <NavBtn onClick={onNext}>Next &rarr;</NavBtn>
            </div>
        </>
    );
}
