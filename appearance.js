import { state } from './state.js';

export const DEFAULT_LOGO_SRC = 'COPOM-NOVO (1).png';
export const DEFAULT_BACKGROUND_SRC = 'logo2.png';

function cssUrl(value) {
    return `url("${String(value).replace(/"/g, '\\"')}")`;
}

export function applyAppearanceConfig(config = state.appearanceConfig) {
    const currentConfig = config || {};
    const logoSrc = currentConfig.logoDataUrl || DEFAULT_LOGO_SRC;
    const backgroundSrc = currentConfig.backgroundDataUrl || DEFAULT_BACKGROUND_SRC;
    const availableDayColor = currentConfig.availableDayColor || '#26be4c';
    const availableDayBorderWidth = Math.max(1, Math.min(8, parseInt(currentConfig.availableDayBorderWidth || 2, 10) || 2));

    const logo = document.querySelector('img.logo');
    if (logo && logo.getAttribute('src') !== logoSrc) {
        logo.src = logoSrc;
    }

    document.documentElement.style.setProperty('--app-background-image', cssUrl(backgroundSrc));
    document.documentElement.style.setProperty('--calendar-available-bg', availableDayColor);
    document.documentElement.style.setProperty('--calendar-available-border', availableDayColor);
    document.documentElement.style.setProperty('--calendar-available-border-width', availableDayBorderWidth + 'px');

    const backgroundPreview = document.getElementById('visualBackgroundPreview');
    if (backgroundPreview) {
        backgroundPreview.style.backgroundImage = cssUrl(backgroundSrc);
    }

    const logoPreview = document.getElementById('visualLogoPreview');
    if (logoPreview && logoPreview.getAttribute('src') !== logoSrc) {
        logoPreview.src = logoSrc;
    }

    const availableDayPreview = document.getElementById('visualAvailableDayPreview');
    if (availableDayPreview) {
        availableDayPreview.style.background = availableDayColor;
        availableDayPreview.style.borderColor = availableDayColor;
        availableDayPreview.style.borderWidth = availableDayBorderWidth + 'px';
    }

    const availableColorInput = document.getElementById('visualAvailableDayColor');
    if (availableColorInput && availableColorInput.value !== availableDayColor) {
        availableColorInput.value = availableDayColor;
    }

    const borderWidthInput = document.getElementById('visualAvailableDayBorderWidth');
    const borderWidthValue = document.getElementById('visualAvailableDayBorderWidthValue');
    if (borderWidthInput && String(borderWidthInput.value) !== String(availableDayBorderWidth)) {
        borderWidthInput.value = String(availableDayBorderWidth);
    }
    if (borderWidthValue) borderWidthValue.textContent = availableDayBorderWidth + 'px';
}
