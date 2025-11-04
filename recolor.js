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

function generateRandomId(length = 6) {
  return Math.random().toString(36).substr(2, length).toUpperCase();
}

async function getSettings() {
  return new Promise((resolve, reject) => {
    console.log("getSettings: Sending message to background...");

    browser.runtime.sendMessage({ action: "getSettings" }, (response) => {
      console.log("getSettings: Received response:", response);
      console.log("getSettings: Last error:", browser.runtime.lastError);

      if (browser.runtime.lastError) {
        console.error("getSettings: Runtime error:", browser.runtime.lastError);
        reject(browser.runtime.lastError);
        return;
      }

      if (!response) {
        console.error(
          "getSettings: No response received - background script may not be loaded",
        );
        reject(new Error("No response from background script"));
        return;
      }

      if (!response.settings) {
        console.warn(
          "getSettings: Response received but no settings property:",
          response,
        );
        resolve({}); // Return empty object as fallback
        return;
      }

      console.log("getSettings: Successfully got settings:", response.settings);
      resolve(response.settings);
    });
  });
}

async function setSettings(settings) {
  return new Promise((resolve, reject) => {
    console.log("setSettings: Sending settings to background:", settings);

    browser.runtime.sendMessage(
      {
        action: "setSettings",
        settings: settings,
      },
      (response) => {
        console.log("setSettings: Received response:", response);
        console.log("setSettings: Last error:", browser.runtime.lastError);

        if (browser.runtime.lastError) {
          console.error(
            "setSettings: Runtime error:",
            browser.runtime.lastError,
          );
          reject(browser.runtime.lastError);
          return;
        }

        if (!response) {
          console.error("setSettings: No response received");
          reject(new Error("No response from background script"));
          return;
        }

        console.log("setSettings: Success:", response.success);
        resolve(response.success || false);
      },
    );
  });
}

async function getPalette() {
  const settings = await getSettings();

  if (settings.palette?.length) {
    return settings.palette;
  }

  const defaultPalette = [
    "#282828",
    "#3c3836",
    "#504945",
    "#665c54",
    "#bdae93",
    "#d5c4a1",
    "#ebdbb2",
    "#fbf1c7",
  ];

  await setSettings({ palette: defaultPalette });
  return defaultPalette;
}

(async () => {
  // --- Load palette.json ---
  const targetPalette = await getPalette();
  console.log("Palette loaded:", targetPalette);

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
      // const relative = (lum - minLum) / (maxLum - minLum || 1);
      // const mappedLum = targetMin + relative * (targetMax - targetMin);
      mapping[c] = findClosestColorByLuminance(lum);
    });

    return {
      mapping,
      minLum,
      maxLum,
      targetMin,
      targetMax,
    };
  }

  function applyRecolor(el, prop, hex, mapData) {
    let replacement = mapData.mapping[hex];
    if (!replacement) {
      const lum = luminance(hexToRgb(hex));
      // const relative =
      //   (lum - mapData.minLum) / (mapData.maxLum - mapData.minLum || 1);
      // const mappedLum =
      //   mapData.targetMin +
      //   relative * (mapData.targetMax - mapData.minLum || 1); // safe fallback
      // const mappedLumCorrected =
      //   mapData.targetMin + relative * (mapData.targetMax - mapData.targetMin);
      replacement = findClosestColorByLuminance(lum);
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
  console.log(`>>> Grey extraction took ${(t2 - t1).toFixed(2)} ms`);

  const mapData = mapGreyscaleToTarget(Array.from(greyColors));

  const t3 = performance.now();
  console.log(`>>> Initial mapping took ${(t3 - t2).toFixed(2)} ms`);

  recolorCandidates.forEach(({ el, prop, hex }) => {
    applyRecolor(el, prop, hex, mapData);
  });

  const t4 = performance.now();
  console.log(`>>> Initial recolor took ${(t4 - t3).toFixed(2)} ms`);

  const observerAttrs = ["style", "class", ...colorAttrs.map(toCSSProp)];
  const observer = new MutationObserver((mutations) => {
    const batchId = generateRandomId();

    const t1 = performance.now();

    console.log(`Mutation [${batchId}] >>> length:`, mutations.length);

    const rootCandidates = new Set();
    for (const m of mutations) {
      if (m.type === "childList") {
        console.log(`Mutation [${batchId}] >>> type: childList`);
        m.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            rootCandidates.add(node);
          }
        });
      } else if (m.type === "attributes") {
        console.log(`Mutation [${batchId}] >>> type: attributes`);
        if (observerAttrs.includes(m.attributeName)) {
          rootCandidates.add(m.target);
        }
      }
    }

    console.log(
      `Mutation [${batchId}] >>> root elements:`,
      rootCandidates.size,
    );

    const t2 = performance.now();
    console.log(
      `Mutation [${batchId}] >>> Batch root collection took ${(t2 - t1).toFixed(2)} ms`,
    );

    const sortedRootCandidates = Array.from(rootCandidates).sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_CONTAINED_BY
        ? -1
        : 1,
    );

    const t3 = performance.now();
    console.log(
      `Mutation [${batchId}] >>> root sorting took ${(t3 - t2).toFixed(2)} ms`,
    );

    const elementsToRecolor = new Set();
    for (const elem of sortedRootCandidates) {
      if (!elementsToRecolor.has(elem)) {
        elem.querySelectorAll("*").forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE)
            elementsToRecolor.add(child);
        });
        elementsToRecolor.add(elem);
      }
    }

    const t4 = performance.now();
    console.log(
      `Mutation [${batchId}] >>> Batch mutation collection took ${(t4 - t3).toFixed(2)} ms`,
    );

    console.log(
      `Mutation [${batchId}] >>> total elements:`,
      elementsToRecolor.size,
    );

    elementsToRecolor.forEach((el) => {
      if (isVisible(el)) recolorElement(el, mapData);
    });

    const t5 = performance.now();
    console.log(
      `Mutation [${batchId}] >>> Batch mutation recolor took ${(t5 - t4).toFixed(2)} ms`,
    );
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: observerAttrs,
  });

  document.querySelectorAll("link[rel=stylesheet]").forEach((link) => {
    link.addEventListener("load", () => {
      const batchId = generateRandomId();
      console.log(`CSSLoad  [${batchId}] >>> CSS loaded:`, link.href);
      const t1 = performance.now();

      const elementsToRecolor = new Set();
      document.querySelectorAll("*").forEach((el) => {
        if (isVisible(el)) elementsToRecolor.add(el);
      });
      elementsToRecolor.forEach((el) => recolorElement(el, mapData));

      const t2 = performance.now();
      console.log(
        `CSSLoad  [${batchId}] >>> CSS full recolor took ${(t2 - t1).toFixed(2)} ms`,
      );
    });
  });
})();
