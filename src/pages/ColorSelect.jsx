import React, { useState, useEffect } from 'react';
import NavBtn from '../components/NavBtn';

// S&S serves the odd swatch chip as a 404, which rendered the swatch as an
// empty circle with no way to tell what colour it was.
//
// The hex is the fallback, not the garment photo. Every catalog colourway
// carries a hex and it is the same colour the photo shows, so it fills the
// circle cleanly and sits right next to the real chips. The garment photo is
// shot on white, so at 34px it reads as a white chip with a tiny shirt on it,
// which is worse than the hole it was filling. It stays as the last resort for
// the handful of colourways with no hex.
function swatchFallback(color) {
    return (e) => {
        const img = e.currentTarget;
        if (color.hex && img.parentElement) {
            img.style.display = 'none';
            img.parentElement.style.background = color.hex;
            return;
        }
        if (color.previewImage && !img.dataset.triedPreview) {
            img.dataset.triedPreview = '1';
            img.src = color.previewImage;
            return;
        }
        img.style.display = 'none';
    };
}

export default function ColorSelect({ onNext, onPrevious, selectedGarment, selectedColor, setSelectedColor }) {
    if (!selectedGarment || !selectedGarment.colors || selectedGarment.colors.length === 0) {
        return <div className='headingColor text-center p-6'>No garment selected.</div>;
    }

    const heroSrc = (c) => c?.previewImage || c?.image;
    const [selectedImage, setSelectedImage] = useState(heroSrc(selectedColor) || heroSrc(selectedGarment.colors[0]));

    // Fall back to the first swatch whenever the held color does not belong to this
    // garment. Going back and picking a different style used to keep the old color,
    // which showed the wrong photo and, worse, priced off the old light/dark flag.
    const colorBelongs = selectedColor
        && selectedGarment.colors.some((c) => c.name === selectedColor.name);

    useEffect(() => {
        if (!colorBelongs && selectedGarment.colors.length > 0) {
            setSelectedColor(selectedGarment.colors[0]);
            setSelectedImage(heroSrc(selectedGarment.colors[0]));
        }
    }, [selectedGarment, colorBelongs]);

    const handleColorSelect = (color) => {
        setSelectedColor(color);
        setSelectedImage(heroSrc(color));
    };

    return (
        <>
            <div className='slide-header' style={{ padding: '16px 24px 4px' }}>
                <h1 className='text-2xl headingColor'>Choose garment color</h1>
                <p className='bodyColor' style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                    {selectedColor ? selectedColor.name : 'Tap a swatch to preview.'}
                </p>
            </div>
            <div className='slide-content' style={{ justifyContent: 'flex-start', gap: '8px', padding: '0 20px' }}>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <img
                        src={selectedImage}
                        alt={selectedColor?.name || 'Selected Color'}
                        className='color-img'
                        onError={(e) => {
                            // Same 404 risk as the chips. Try the other image S&S
                            // gives us for this colourway before giving up.
                            const img = e.currentTarget;
                            const alt = selectedColor?.image;
                            if (alt && img.src !== alt && !img.dataset.triedAlt) {
                                img.dataset.triedAlt = '1';
                                img.src = alt;
                                return;
                            }
                            img.style.visibility = 'hidden';
                        }}
                        style={{ maxHeight: '200px', margin: '0 auto' }}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignContent: 'flex-start',
                    gap: '5px',
                    padding: '4px 0',
                    overflowY: 'auto',
                    flex: '1 1 auto',
                    minHeight: 0,
                }}>
                    {selectedGarment.colors.map((color) => {
                        const isSelected = selectedColor?.name === color.name;
                        return (
                            <button
                                key={color.name}
                                type='button'
                                aria-label={color.name}
                                aria-pressed={isSelected}
                                onClick={() => handleColorSelect(color)}
                                title={color.name}
                                style={{
                                    width: '34px',
                                    height: '34px',
                                    borderRadius: '50%',
                                    border: isSelected ? '3px solid var(--fi-teal)' : '2px solid rgba(14,27,32,0.22)',
                                    padding: '2px',
                                    cursor: 'pointer',
                                    background: 'transparent',
                                    transition: 'all 0.15s ease',
                                    outline: isSelected ? '2px solid rgba(46,91,107,0.35)' : 'none',
                                    outlineOffset: '2px',
                                    flexShrink: 0,
                                }}
                            >
                                <img
                                    src={color.image}
                                    alt={color.name}
                                    onError={swatchFallback(color)}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                    }}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className='slide-nav'>
                <NavBtn onClick={onPrevious} direction='prev'>&larr; Prev</NavBtn>
                <NavBtn onClick={onNext}>Next &rarr;</NavBtn>
            </div>
        </>
    );
}
