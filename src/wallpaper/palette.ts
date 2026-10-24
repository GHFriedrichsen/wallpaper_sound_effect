// Cores do wallpaper a partir da capa da música.
import type { Palette, RGB } from '../particles/field';

const probe = document.createElement('canvas').getContext('2d')!;

/** Converte qualquer cor CSS ("#ff0000", "rgb(…)", "red") para rgb 0..1. */
export function parseColor(css: string | undefined): RGB | null {
  if (!css) return null;
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  const v = String(probe.fillStyle);
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1, 7), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m = v.match(/[\d.]+/g);
  return m ? [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255] : null;
}

/** Duas cores que mais aparecem na imagem, dando preferência às saturadas. */
export async function extractColors(url: string): Promise<RGB[]> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const S = 48;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  ctx.canvas.width = ctx.canvas.height = S;
  ctx.drawImage(img, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);

  // agrupa em caixas de 3 bits por canal (grossas, para um degradê não se espalhar em várias caixas)
  const boxes = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [, s, l] = rgbToHsl([r / 255, g / 255, b / 255]);
    const w = 0.15 + s * (1 - Math.abs(l - 0.5) * 1.6);
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const box = boxes.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    box.w += w;
    box.r += r * w;
    box.g += g * w;
    box.b += b * w;
    boxes.set(key, box);
  }
  const ranked = [...boxes.values()]
    .sort((a, b) => b.w - a.w)
    .map((box): RGB => [box.r / box.w / 255, box.g / box.w / 255, box.b / box.w / 255]);
  const first = ranked[0];
  // a segunda tem que ser diferente o bastante da primeira
  const second = ranked.find((c) => distance(c, first) > 0.25) ?? first;
  return [first, second];
}

/** Fundo bem escuro no tom da capa, poeira na segunda cor e tinta quase branca. */
export function paletteFrom(primary: RGB, secondary: RGB): Palette {
  const [h1, s1] = rgbToHsl(primary);
  const [h2, s2, l2] = rgbToHsl(secondary);
  return {
    bg: hslToRgb(h1, Math.min(s1, 0.6), 0.075),
    dust: hslToRgb(h2, Math.min(Math.max(s2, 0.25), 0.75), Math.min(Math.max(l2, 0.58), 0.75)),
    ink: hslToRgb(h1, Math.min(s1, 0.35), 0.93),
  };
}

function distance(a: RGB, b: RGB) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rgbToHsl([r, g, b]: RGB): RGB {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)];
}
