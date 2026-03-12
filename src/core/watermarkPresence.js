const MIN_STANDARD_SPATIAL_SCORE = 0.3;
const MIN_STANDARD_GRADIENT_SCORE = 0.12;
const MIN_ADAPTIVE_CONFIDENCE = 0.5;
const MIN_ADAPTIVE_SPATIAL_SCORE = 0.45;
const MIN_ADAPTIVE_GRADIENT_SCORE = 0.12;
const MIN_ADAPTIVE_SIZE = 40;
const MAX_ADAPTIVE_SIZE = 192;

function toFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function hasReliableStandardWatermarkSignal({ spatialScore, gradientScore }) {
    const spatial = toFiniteNumber(spatialScore);
    const gradient = toFiniteNumber(gradientScore);

    return spatial !== null &&
        gradient !== null &&
        spatial >= MIN_STANDARD_SPATIAL_SCORE &&
        gradient >= MIN_STANDARD_GRADIENT_SCORE;
}

export function hasReliableAdaptiveWatermarkSignal(adaptiveResult) {
    if (!adaptiveResult || adaptiveResult.found !== true) return false;

    const confidence = toFiniteNumber(adaptiveResult.confidence);
    const spatial = toFiniteNumber(adaptiveResult.spatialScore);
    const gradient = toFiniteNumber(adaptiveResult.gradientScore);
    const size = toFiniteNumber(adaptiveResult?.region?.size);

    return confidence !== null &&
        spatial !== null &&
        gradient !== null &&
        size !== null &&
        confidence >= MIN_ADAPTIVE_CONFIDENCE &&
        spatial >= MIN_ADAPTIVE_SPATIAL_SCORE &&
        gradient >= MIN_ADAPTIVE_GRADIENT_SCORE &&
        size >= MIN_ADAPTIVE_SIZE &&
        size <= MAX_ADAPTIVE_SIZE;
}
