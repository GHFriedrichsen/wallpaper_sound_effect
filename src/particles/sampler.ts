// Transforma texto, imagem ou um desenho de canvas numa nuvem de pontos.
// Adaptado do sampler do portfolio (github.com/GHFriedrichsen/portifolio), que só fazia logos quadrados:
// aqui a forma pode ter qualquer proporção, porque relógio, título e clima são largos e baixos.
import { sphereCloud } from './cymatics';

export interface TextLine {
  text: string;
  /** tamanho relativo da linha (1 = linha principal) */
  size: number;
  weight: number;
  font: string;
  /** brilho da linha, 0..1: vira a intensidade da cor de tinta no grão */
  alpha?: number;
}

export type ShapeSource =
  | { kind: 'text'; key: string; lines: TextLine[]; maxAspect?: number }
  | { kind: 'image'; key: string; url: string; radius?: number }
  | { kind: 'draw'; key: string; aspect: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }
  | { kind: 'sphere'; key: string };

export interface ShapeCloud {
  count: number;
  /** largura / altura da forma */
  aspect: number;
  /** xyz por ponto, normalizado pela altura: y vai de -0,5 a 0,5 e x de -aspect/2 a aspect/2 */
  positions: Float32Array;
  /** rgb 0..1 por ponto, tirado do pixel */
  colors: Float32Array;
  /** esfera: quanto cada ponto sobe e desce na onda estacionária agora (-1..1; 0 = linha nodal) */
  wave?: Float32Array;
}

export interface SampleOptions {
  count: number;
  /** espessura da forma extrudada, na escala da altura */
  depth: number;
  /** fração dos grãos da frente que vai no contorno (0..1) */
  outline: number;
}

const RES_H = 240; // altura do raster usado para amostrar texto e desenho
const IMAGE_RES = 360; // capa: mais pixels para os grãos pegarem os detalhes
const MAX_W = 2000;

interface Raster {
  w: number;
  h: number;
  /** índices dos pixels preenchidos */
  fill: Int32Array;
  /** índices dos pixels de borda (preenchidos com vizinho vazio) */
  edge: Int32Array;
  data: Uint8ClampedArray;
  /** texto e desenho: os pontos saem ordenados da esquerda para a direita (ver buildCloud) */
  sorted: boolean;
}

// o relógio gera uma forma nova por minuto: o cache guarda só as últimas
const rasterCache = new Map<string, Promise<Raster>>();
const CACHE_MAX = 24;

export async function sampleShape(source: ShapeSource, opts: SampleOptions): Promise<ShapeCloud> {
  if (source.kind === 'sphere') return sphereCloud(opts.count);
  let raster = rasterCache.get(source.key);
  if (!raster) {
    raster = rasterize(source);
    rasterCache.set(source.key, raster);
    if (rasterCache.size > CACHE_MAX) rasterCache.delete(rasterCache.keys().next().value!);
    raster.catch(() => rasterCache.delete(source.key));
  }
  return buildCloud(await raster, opts);
}

async function rasterize(source: Exclude<ShapeSource, { kind: 'sphere' }>): Promise<Raster> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let h = RES_H;

  if (source.kind === 'text') {
    const total = source.lines.reduce((sum, l) => sum + l.size * 1.12, 0);
    const unit = h / total;
    const setFont = (l: TextLine) => {
      const px = l.size * unit;
      ctx.font = `${l.weight} ${px}px ${l.font}`;
      ctx.letterSpacing = `${(px * 0.03).toFixed(1)}px`;
    };
    const maxW = Math.min(MAX_W, (source.maxAspect ?? 8) * h);
    const texts = source.lines.map((l) => {
      setFont(l);
      return ellipsize(ctx, l.text, maxW * 0.96);
    });
    const widest = Math.max(
      ...source.lines.map((l, i) => {
        setFont(l);
        return ctx.measureText(texts[i]).width;
      }),
    );
    canvas.width = Math.ceil(Math.min(maxW, widest * 1.04 + h * 0.08));
    canvas.height = h;
    // mudar o tamanho do canvas zera o contexto
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let y = 0;
    source.lines.forEach((l, i) => {
      const lh = l.size * 1.12 * unit;
      setFont(l);
      const v = Math.round(255 * (l.alpha ?? 1));
      ctx.fillStyle = `rgb(${v} ${v} ${v})`;
      ctx.fillText(texts[i], canvas.width / 2, y + lh / 2 + l.size * unit * 0.04);
      y += lh;
    });
  } else if (source.kind === 'image') {
    const img = new Image();
    img.src = source.url;
    await img.decode();
    h = IMAGE_RES;
    canvas.width = canvas.height = h;
    const r = (source.radius ?? 0) * h;
    ctx.beginPath();
    ctx.roundRect(0, 0, h, h, r);
    ctx.clip();
    // preenche o quadrado cortando o excesso (capas de vídeo do YouTube são 16:9)
    const s = Math.max(h / img.width, h / img.height);
    ctx.drawImage(img, (h - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    // forma muito larga (barra de progresso): baixa a altura do raster para caber a proporção inteira
    h = Math.max(8, Math.min(RES_H, Math.floor(MAX_W / source.aspect)));
    canvas.width = Math.round(source.aspect * h);
    canvas.height = h;
    source.draw(ctx, canvas.width, h);
  }

  const w = canvas.width;
  h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);
  const filled = (i: number) => data[i * 4 + 3] > 140;
  const fill: number[] = [];
  const edge: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!filled(i)) continue;
      fill.push(i);
      const border =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !filled(i - 1) || !filled(i + 1) || !filled(i - w) || !filled(i + w);
      if (border) edge.push(i);
    }
  }
  if (!fill.length) throw new Error(`forma vazia: ${source.key}`);
  return {
    w,
    h,
    fill: Int32Array.from(fill),
    edge: Int32Array.from(edge),
    data,
    sorted: source.kind !== 'image',
  };
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '…';
}

function buildCloud(r: Raster, { count, depth, outline }: SampleOptions): ShapeCloud {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const half = depth / 2;
  const { w, h, data } = r;

  const put = (n: number, pixel: number, z: number) => {
    const x = pixel % w;
    const y = (pixel / w) | 0;
    positions[n * 3] = (x + Math.random() - w / 2) / h;
    positions[n * 3 + 1] = -(y + Math.random() - h / 2) / h;
    positions[n * 3 + 2] = z;
    colors[n * 3] = data[pixel * 4] / 255;
    colors[n * 3 + 1] = data[pixel * 4 + 1] / 255;
    colors[n * 3 + 2] = data[pixel * 4 + 2] / 255;
  };

  const pick = (list: Int32Array) => list[(Math.random() * list.length) | 0];

  // a maior parte na frente (é o que se vê); com espessura, verso e laterais (pelos pixels de borda) dão o volume
  const front = depth > 0 ? Math.round(count * 0.8) : count;
  const back = depth > 0 ? Math.round(count * 0.06) : 0;
  for (let n = 0; n < count; n++) {
    if (n < front) put(n, pick(Math.random() < outline ? r.edge : r.fill), half);
    else if (n < front + back) put(n, pick(r.fill), -half);
    else put(n, pick(r.edge), -half + Math.random() * depth);
  }

  // ordenar por x faz o grão j da forma nova cair perto do grão j da antiga:
  // quando o relógio troca de minuto, os grãos só andam um pouco em vez de cruzar a forma toda
  if (r.sorted) {
    const idx = Array.from({ length: count }, (_, i) => i).sort((a, b) => positions[a * 3] - positions[b * 3]);
    const p = positions.slice();
    const c = colors.slice();
    idx.forEach((from, to) => {
      positions.set(p.subarray(from * 3, from * 3 + 3), to * 3);
      colors.set(c.subarray(from * 3, from * 3 + 3), to * 3);
    });
  }

  return { count, aspect: w / h, positions, colors };
}
