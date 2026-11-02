import React, { useState, useEffect } from 'react';
import './App.css';
import { initAnalytics, trackFunnelStep } from './utils/analytics';
import GarmentTypeSelect from './pages/GarmentTypeSelect';
import GarmentModelSelect from './pages/GarmentModelSelect';
import ColorSelect from './pages/ColorSelect';
import PrintLocations, { hasArtwork } from './pages/PrintLocations';
import FinalQuote from './pages/FinalQuote';
import ThankYou from './pages/ThankYou';

// Flash Ink's flow, in ConvertCalculator's order: garment type, garment, colour, artwork and
// print locations with colours per location, then price, contact and submit. Screen printing
// only, the one thing Flash Ink's calculator ever priced.
const STEPS = {
    garmentType: '1 - Garment Type',
    garmentModel: '2 - Garment Select',
    colorSelect: '3 - Color',
    printLocations: '4 - Artwork & Locations',
    finalQuote: '5 - Quote',
    thankYou: '6 - Confirmation',
};

function App() {
    const [currentSlide, setCurrentSlide] = useState('garmentType');
    const [slideHistory, setSlideHistory] = useState([]);
    const [selectedGarmentType, setSelectedGarmentType] = useState(null);
    const [selectedModel, setSelectedModel] = useState(null);
    const [selectedGarment, setSelectedGarment] = useState(null);
    const [selectedColor, setSelectedColor] = useState(null);
    // One entry per print location, each with its own artwork and ink colours.
    const [printLocations, setPrintLocations] = useState([]);
    const [hasError, setHasError] = useState(false);

    useEffect(() => { initAnalytics(); }, []);
    useEffect(() => {
        trackFunnelStep(currentSlide);
        window.parent.postMessage(
            { event: 'calculator_slide_view', calcSlideName: currentSlide, calcStepName: STEPS[currentSlide] || currentSlide },
            '*'
        );
    }, [currentSlide]);

    const handleNext = () => {
        let isValid = true;
        if (currentSlide === 'garmentType' && !selectedGarmentType) isValid = false;
        else if (currentSlide === 'garmentModel' && !selectedGarment) isValid = false;
        else if (currentSlide === 'colorSelect' && !selectedColor) isValid = false;
        else if (currentSlide === 'printLocations' && !printLocations.some(hasArtwork)) isValid = false;

        if (!isValid) {
            setHasError(true);
            setTimeout(() => setHasError(false), 1000);
            return;
        }
        setHasError(false);

        let nextSlide = '';
        if (currentSlide === 'garmentType') nextSlide = 'garmentModel';
        else if (currentSlide === 'garmentModel') nextSlide = selectedGarment?.colors?.length ? 'colorSelect' : 'printLocations';
        else if (currentSlide === 'colorSelect') nextSlide = 'printLocations';
        else if (currentSlide === 'printLocations') nextSlide = 'finalQuote';
        else if (currentSlide === 'finalQuote') nextSlide = 'thankYou';

        if (nextSlide) {
            setSlideHistory([...slideHistory, currentSlide]);
            setCurrentSlide(nextSlide);
        }
    };

    const handlePrevious = () => {
        if (slideHistory.length === 0) return;
        const previousSlide = slideHistory[slideHistory.length - 1];
        // A different garment type has different placements (no sleeves on a tee) and a
        // different garment list, so drop what was picked under the old one.
        if (previousSlide === 'garmentType') {
            setSelectedModel(null);
            setSelectedGarment(null);
            setSelectedColor(null);
            setPrintLocations([]);
        }
        setCurrentSlide(previousSlide);
        setSlideHistory(slideHistory.slice(0, -1));
    };

    return (
        <div className={`slide-container ${hasError ? 'error-shake' : ''}`}>
            <div className='slide-page'>
                {currentSlide === 'garmentType' && (
                    <GarmentTypeSelect
                        selectedGarmentType={selectedGarmentType}
                        setSelectedGarmentType={setSelectedGarmentType}
                        onNext={handleNext}
                    />
                )}
                {currentSlide === 'garmentModel' && (
                    <GarmentModelSelect
                        selectedGarmentType={selectedGarmentType}
                        selectedGarment={selectedGarment}
                        setSelectedModel={setSelectedModel}
                        setSelectedGarment={setSelectedGarment}
                        onNext={handleNext}
                        onPrevious={handlePrevious}
                    />
                )}
                {currentSlide === 'colorSelect' && (
                    <ColorSelect
                        selectedGarment={selectedGarment}
                        selectedColor={selectedColor}
                        setSelectedColor={setSelectedColor}
                        onNext={handleNext}
                        onPrevious={handlePrevious}
                    />
                )}
                {currentSlide === 'printLocations' && (
                    <PrintLocations
                        onNext={handleNext}
                        onPrevious={handlePrevious}
                        selectedGarmentType={selectedGarmentType}
                        selectedColor={selectedColor}
                        printLocations={printLocations}
                        setPrintLocations={setPrintLocations}
                    />
                )}
                {currentSlide === 'finalQuote' && (
                    <FinalQuote
                        onNext={handleNext}
                        onPrevious={handlePrevious}
                        selectedGarmentType={selectedGarmentType}
                        selectedModel={selectedModel}
                        selectedGarment={selectedGarment}
                        selectedColor={selectedColor}
                        printLocations={printLocations}
                    />
                )}
                {currentSlide === 'thankYou' && <ThankYou />}
            </div>
            {hasError && <p className='error-message' style={{ position: 'absolute', bottom: '8px', left: 0, right: 0 }}>Please make a selection to proceed.</p>}
        </div>
    );
}

export default App;
