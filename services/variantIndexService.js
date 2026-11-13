const COLOR_PALETTE = [
  "#000000", "#ffffff", "#808080", "#777c6d", "#d9c7a3", "#3d2b1f",
  "#7b3306", "#9f0712", "#ff937e", "#f4a6c0", "#f57c00", "#fff085",
  "#7bf1a8", "#89986d", "#2e7d32", "#193cb8", "#0f2854", "#3c467b",
  "#301ca0", "#6e11b0", "#540863",
];

const NAMED_COLORS = {
  black: "#000000", onyx: "#000000", "أسود": "#000000", "اسود": "#000000",
  white: "#ffffff", ivory: "#fffff0", "أبيض": "#ffffff", "ابيض": "#ffffff",
  gray: "#808080", grey: "#808080", silver: "#c0c0c0", charcoal: "#36454f",
  "رمادي": "#808080", "فضي": "#c0c0c0",
  red: "#e53935", crimson: "#9f0712", maroon: "#800000", burgundy: "#800020",
  "أحمر": "#e53935", "احمر": "#e53935", "عنابي": "#800020",
  blue: "#1e56d8", navy: "#0f2854", cobalt: "#193cb8", sky: "#87ceeb",
  skyblue: "#87ceeb", teal: "#008080", cyan: "#00bcd4", turquoise: "#40e0d0",
  "أزرق": "#1e56d8", "ازرق": "#1e56d8", "كحلي": "#0f2854", "سماوي": "#87ceeb",
  "تركواز": "#40e0d0",
  green: "#2e7d32", olive: "#808000", mint: "#7bf1a8", lime: "#9acd32",
  khaki: "#bdb76b", sage: "#89986d", "أخضر": "#2e7d32", "اخضر": "#2e7d32",
  "زيتي": "#808000",
  yellow: "#ffd600", butter: "#fff085", gold: "#d4af37", mustard: "#e1ad01",
  "أصفر": "#ffd600", "اصفر": "#ffd600", "ذهبي": "#d4af37", "خردلي": "#e1ad01",
  orange: "#f57c00", coral: "#ff937e", peach: "#ffcba4", "برتقالي": "#f57c00",
  pink: "#f4a6c0", rose: "#e75480", fuchsia: "#d81b60", magenta: "#d81b60",
  "وردي": "#f4a6c0", "روز": "#e75480", "فوشيا": "#d81b60",
  purple: "#6e11b0", violet: "#6e11b0", plum: "#540863", lavender: "#b497d6",
  indigo: "#301ca0", lilac: "#c8a2c8", "بنفسجي": "#6e11b0", "موف": "#6e11b0",
  "لافندر": "#b497d6",
  brown: "#7b4a1e", espresso: "#3d2b1f", cognac: "#7b3306", chocolate: "#5d3a1a",
  tan: "#d2b48c", camel: "#c19a6b", "بني": "#7b4a1e", "جملي": "#c19a6b",
  "قهوة": "#3d2b1f", "قهوي": "#3d2b1f",
  beige: "#d9c7a3", cream: "#fffdd0", sand: "#c2b280", offwhite: "#f5f5dc",
  "بيج": "#d9c7a3", "كريمي": "#fffdd0", "سكني": "#d9c7a3",
  stone: "#777c6d", slate: "#3c467b",
};

const SIZE_ALIASES = {
  xxs: "XXS", "xx-small": "XXS", xxsmall: "XXS", "2xs": "XXS",
  xs: "XS", "x-small": "XS", xsmall: "XS", "extra small": "XS",
  s: "S", small: "S",
  m: "M", medium: "M",
  l: "L", large: "L",
  xl: "XL", "x-large": "XL", xlarge: "XL", "extra large": "XL",
  "2xl": "2XL", xxl: "2XL", "xx-large": "2XL", xxlarge: "2XL",
  "3xl": "3XL", xxxl: "3XL", "3x-large": "3XL",
  "4xl": "4XL", xxxxl: "4XL", "4x-large": "4XL",
  "one size": "ONE SIZE", onesize: "ONE SIZE", "free size": "ONE SIZE",
  freesize: "ONE SIZE", "مقاس واحد": "ONE SIZE",
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const expandHex = (value) => {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return null;
};

const toHex = (value) => {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const hex = expandHex(raw);
  if (hex) return hex;

  const rgb = raw.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/);
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((part) => Math.min(255, Number(part)));
    return `#${channels.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }

  const key = raw.replace(/[\s_-]+/g, "");
  return NAMED_COLORS[key] ?? NAMED_COLORS[raw] ?? null;
};

const hexToLab = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (component) => component > 0.008856 ? Math.cbrt(component) : 7.787 * component + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const PALETTE_LAB = COLOR_PALETTE.map((hex) => ({ hex, lab: hexToLab(hex) }));

const colorFamily = (value) => {
  const hex = toHex(value);
  if (!hex) return null;
  const lab = hexToLab(hex);
  let best = PALETTE_LAB[0];
  let bestDistance = Infinity;
  for (const entry of PALETTE_LAB) {
    const distance = entry.lab.reduce((sum, part, index) => sum + (part - lab[index]) ** 2, 0);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best.hex;
};

const normalizeSizeValue = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return SIZE_ALIASES[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
};

const buildVariantIndexFields = (product = {}) => {
  const colors = Array.isArray(product.colors) ? product.colors : typeof product.colors === "string" ? product.colors.split(",") : [];
  const sizes = Array.isArray(product.size) ? product.size : typeof product.size === "string" ? product.size.split(",") : [];
  return {
    colorFamilyValues: unique(colors.map(colorFamily)),
    sizeValues: unique(sizes.map(normalizeSizeValue)),
  };
};

const getColorAliases = (family) => unique([
  family,
  family.replace(/^#/, "#"),
  ...Object.entries(NAMED_COLORS).filter(([, hex]) => colorFamily(hex) === family).map(([name]) => name),
]);

const getSizeAliases = (normalizedSize) => unique([
  normalizedSize,
  ...Object.entries(SIZE_ALIASES).filter(([, canonical]) => canonical === normalizedSize).map(([alias]) => alias),
]);

export {
  buildVariantIndexFields,
  colorFamily,
  normalizeSizeValue,
  getColorAliases,
  getSizeAliases,
};
