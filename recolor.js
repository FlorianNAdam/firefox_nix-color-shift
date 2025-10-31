// recolor.js (Manifest V3, dynamic palette)
(async () => {
  // Load palette.json
  let targetPalette = [];
  try {
    const response = await fetch(chrome.runtime.getURL('palette.json'));
    targetPalette = await response.json();
  } catch (err) {
    console.error('Failed to load palette.json:', err);
    return;
  }

  const rangeExtension = 0.2;

  Extend darkest/lightest colors
  const darkColor = targetPalette[0];
  const darkerDark = darkenHex(darkColor, rangeExtension);
  targetPalette.unshift(darkerDark);

  const lightColor = targetPalette[targetPalette.length - 1];
  const lighterLight = lightenHex(lightColor, rangeExtension);
  targetPalette.push(lighterLight);

  // --- HELPER FUNCTIONS ---
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const int = parseInt(hex, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function rgbToHex(r, g, b) {
    return (
      '#' +
      ((1 << 24) + (r << 16) + (g << 8) + b)
        .toString(16)
        .slice(1)
        .toUpperCase()
    );
  }

  function lightenHex(hex, amount = 0.1) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
      Math.min(255, Math.round(r + (255 - r) * amount)),
      Math.min(255, Math.round(g + (255 - g) * amount)),
      Math.min(255, Math.round(b + (255 - b) * amount))
    );
  }

  function darkenHex(hex, amount = 0.1) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
      Math.max(0, Math.round(r * (1 - amount))),
      Math.max(0, Math.round(g * (1 - amount))),
      Math.max(0, Math.round(b * (1 - amount)))
    );
  }

  function rgbStringToHex(rgbString) {
    const match = rgbString.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return null;
    const [_, r, g, b] = match;
    return (
      '#' +
      ((1 << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b))
        .toString(16)
        .slice(1)
        .toUpperCase()
    );
  }

  function luminance({ r, g, b }) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function isGrey({ r, g, b }, tolerance = 10) {
    return Math.abs(r - g) <= tolerance && Math.abs(r - b) <= tolerance && Math.abs(g - b) <= tolerance;
  }

  function findClosestColorByLuminance(targetLum) {
    let closest = targetPalette[0];
    let minDiff = Infinity;

    for (const c of targetPalette) {
      const lum = luminance(hexToRgb(c));
      const diff = Math.abs(lum - targetLum);
      if (diff < minDiff) {
        minDiff = diff;
        closest = c;
      }
    }
    return closest;
  }

  // --- CORE LOGIC ---
  function extractGreyscaleColors() {
    const colors = new Set();
    const elements = document.querySelectorAll('*');

    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      ['backgroundColor', 'color', 'borderColor'].forEach(prop => {
        const value = style[prop];
        if (value && value.startsWith('rgb')) {
          const hex = rgbStringToHex(value);
          if (hex && isGrey(hexToRgb(hex))) colors.add(hex);
        }
      });
    });

    return Array.from(colors);
  }

  function getMinMaxLuminance(colors) {
    let minLum = Infinity, maxLum = -Infinity;
    colors.forEach(c => {
      const lum = luminance(hexToRgb(c));
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    });
    return { minLum, maxLum };
  }

  function mapGreyscaleToTarget(colors) {
    const { minLum, maxLum } = getMinMaxLuminance(colors);
    const targetLums = targetPalette.map(c => luminance(hexToRgb(c)));
    const targetMin = Math.min(...targetLums);
    const targetMax = Math.max(...targetLums);

    const mapping = {};
    colors.forEach(c => {
      const lum = luminance(hexToRgb(c));
      const relative = (lum - minLum) / (maxLum - minLum || 1);
      const mappedLum = targetMin + relative * (targetMax - targetMin);
      mapping[c] = findClosestColorByLuminance(mappedLum);
    });
    return mapping;
  }

  function replaceGreys(mapping) {
    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      ['backgroundColor', 'color', 'borderColor'].forEach(prop => {
        const value = style[prop];
        if (value && value.startsWith('rgb')) {
          const hex = rgbStringToHex(value);
          if (hex && mapping[hex]) el.style[prop] = mapping[hex];
        }
      });
    });
  }

  // RUN
  const greyColors = extractGreyscaleColors();
  const mapping = mapGreyscaleToTarget(greyColors);
  replaceGreys(mapping);

  // Observe dynamic elements
  const observer = new MutationObserver(() => replaceGreys(mapping));
  observer.observe(document.body, { childList: true, subtree: true });
})();
