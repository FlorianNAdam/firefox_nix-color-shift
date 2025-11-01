// recolor.js
function parseColor(colorStr) {
  const rgba = colorStr.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
  if (!rgba) return { r: 255, g: 255, b: 255, a: 1 }; // fallback white
  return {
    r: parseInt(rgba[1]),
    g: parseInt(rgba[2]),
    b: parseInt(rgba[3]),
    a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
  };
}

function blendColors(top, bottom) {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha),
    g: Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha),
    b: Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha),
    a: alpha,
  };
}

function getFinalColor(el) {
  if (!el) return { r: 255, g: 255, b: 255, a: 1 }; // fallback white
  const style = window.getComputedStyle(el);
  const color = parseColor(style.backgroundColor);

  if (color.a === 1) return color; // fully opaque
  if (color.a === 0) return getFinalColor(el.parentElement); // fully transparent

  // partially transparent → blend with parent
  const parentColor = getFinalColor(el.parentElement);
  return blendColors(color, parentColor);
}

const colorCache = new WeakMap();
function getColorAt(x, y) {
  const element = document.elementFromPoint(x, y);
  if (colorCache.has(element)) {
    return colorCache.get(element);
  }
  const color = getFinalColor(element);
  colorCache.set(element, color);
  return color;
}

function isPageDark(step = 100) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const brightnessValues = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const color = getColorAt(x, y);

      const brightness = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
      brightnessValues.push(brightness);
    }
  }

  brightnessValues.sort((a, b) => a - b);
  const mid = Math.floor(brightnessValues.length / 2);
  const medianBrightness =
    brightnessValues.length % 2 === 0
      ? (brightnessValues[mid - 1] + brightnessValues[mid]) / 2
      : brightnessValues[mid];

  return medianBrightness < 128;
}

(async () => {
  // --- Load palette.json ---
  let targetPalette = [];
  try {
    const response = await fetch(chrome.runtime.getURL("palette.json"));
    targetPalette = await response.json();
  } catch (err) {
    console.error("Failed to load palette.json:", err);
    targetPalette = [
      "#282828",
      "#3c3836",
      "#504945",
      "#665c54",
      "#bdae93",
      "#d5c4a1",
      "#ebdbb2",
      "#fbf1c7",
    ];
  }

  const rangeExtension = 0.2;

  // Extend darkest/lightest colors
  const darkColor = targetPalette[0];
  const darkerDark = darkenHex(darkColor, rangeExtension);
  targetPalette.unshift(darkerDark);

  const lightColor = targetPalette[targetPalette.length - 1];
  const lighterLight = lightenHex(lightColor, rangeExtension);
  targetPalette.push(lighterLight);

  // --- HELPER FUNCTIONS ---
  const colorAttrs = ["backgroundColor", "color", "borderColor"];

  function toCSSProp(camelCase) {
    return camelCase.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
  }

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    const int = parseInt(hex, 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
    );
  }

  function lightenHex(hex, amount = 0.1) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
      Math.min(255, Math.round(r + (255 - r) * amount)),
      Math.min(255, Math.round(g + (255 - g) * amount)),
      Math.min(255, Math.round(b + (255 - b) * amount)),
    );
  }

  function darkenHex(hex, amount = 0.1) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
      Math.max(0, Math.round(r * (1 - amount))),
      Math.max(0, Math.round(g * (1 - amount))),
      Math.max(0, Math.round(b * (1 - amount))),
    );
  }

  function rgbStringToHex(rgbString) {
    const match = rgbString.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return null;
    const [_, r, g, b] = match;
    return (
      "#" +
      ((1 << 24) + (parseInt(r) << 16) + (parseInt(g) << 8) + parseInt(b))
        .toString(16)
        .slice(1)
        .toUpperCase()
    );
  }

  function luminance({ r, g, b }) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function isGrey({ r, g, b }, tolerance = 20) {
    return (
      Math.abs(r - g) <= tolerance &&
      Math.abs(r - b) <= tolerance &&
      Math.abs(g - b) <= tolerance
    );
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
  function getMinMaxLuminance(colors) {
    let minLum = Infinity;
    let maxLum = -Infinity;
    colors.forEach((c) => {
      const lum = luminance(hexToRgb(c));
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    });
    return { minLum, maxLum };
  }

  function mapGreyscaleToTarget(colors) {
    const { minLum, maxLum } = getMinMaxLuminance(colors);
    const targetLums = targetPalette.map((c) => luminance(hexToRgb(c)));
    const targetMin = Math.min(...targetLums);
    const targetMax = Math.max(...targetLums);

    const mapping = {};

    colors.forEach((c) => {
      const lum = luminance(hexToRgb(c));
      const relative = (lum - minLum) / (maxLum - minLum || 1);
      const mappedLum = targetMin + relative * (targetMax - targetMin);
      mapping[c] = findClosestColorByLuminance(mappedLum);
    });

    return {
      mapping,
      minLum,
      maxLum,
      targetMin,
      targetMax,
      extendMapping(newColors) {
        newColors.forEach((c) => {
          if (!mapping[c]) {
            const lum = luminance(hexToRgb(c));
            const relative = (lum - minLum) / (maxLum - minLum || 1);
            const mappedLum = targetMin + relative * (targetMax - targetMin);
            mapping[c] = findClosestColorByLuminance(mappedLum);
          }
        });
        return mapping;
      },
    };
  }

  function applyRecolor(el, prop, hex, mapData) {
    let replacement = mapData.mapping[hex];
    if (!replacement) {
      const lum = luminance(hexToRgb(hex));
      const relative =
        (lum - mapData.minLum) / (mapData.maxLum - mapData.minLum || 1);
      const mappedLum =
        mapData.targetMin +
        relative * (mapData.targetMax - mapData.minLum || 1); // safe fallback
      const mappedLumCorrected =
        mapData.targetMin + relative * (mapData.targetMax - mapData.targetMin);
      replacement = findClosestColorByLuminance(mappedLumCorrected);
      mapData.mapping[hex] = replacement;
    }
    el.style.setProperty(toCSSProp(prop), replacement, "important");
  }

  function recolorElement(el, mapData) {
    const style = window.getComputedStyle(el);
    colorAttrs.forEach((prop) => {
      const value = style[prop];
      if (value && value.startsWith("rgb")) {
        const hex = rgbStringToHex(value);
        if (hex && isGrey(hexToRgb(hex))) {
          applyRecolor(el, prop, hex, mapData);
        }
      }
    });
  }

  function isVisible(el) {
    if (!el.offsetParent && el !== document.body) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // --- INITIAL RUN ---
  const allEls = document.querySelectorAll("*");
  const greyColors = new Set();
  const recolorCandidates = [];

  const t1 = performance.now();

  allEls.forEach((el) => {
    if (!isVisible(el)) return;
    const style = window.getComputedStyle(el);
    colorAttrs.forEach((prop) => {
      const value = style[prop];
      if (value && value.startsWith("rgb")) {
        const hex = rgbStringToHex(value);
        if (hex && isGrey(hexToRgb(hex))) {
          greyColors.add(hex);
          recolorCandidates.push({ el, prop, value, hex });
        }
      }
    });
  });

  const t2 = performance.now();
  console.log(`Grey extraction took ${(t2 - t1).toFixed(2)} ms`);

  const mapData = mapGreyscaleToTarget(Array.from(greyColors));

  const t3 = performance.now();
  console.log(`Initial mapping took ${(t3 - t2).toFixed(2)} ms`);

  recolorCandidates.forEach(({ el, prop, hex }) => {
    applyRecolor(el, prop, hex, mapData);
  });

  const t4 = performance.now();
  console.log(`Initial recolor took ${(t4 - t3).toFixed(2)} ms`);

  const observerAttrs = ["style", "class", ...colorAttrs.map(toCSSProp)];
  const observer = new MutationObserver((mutations) => {
    const t1 = performance.now();

    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            recolorElement(node, mapData);
            node
              .querySelectorAll("*")
              .forEach((child) => recolorElement(child, mapData));
          }
        });
      } else if (m.type === "attributes") {
        if (observerAttrs.includes(m.attributeName)) {
          recolorElement(m.target, mapData);
        }
      }
    }

    const t2 = performance.now();
    console.log(`Mutation recolor took ${(t2 - t1).toFixed(2)} ms`);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: observerAttrs,
  });
})();
