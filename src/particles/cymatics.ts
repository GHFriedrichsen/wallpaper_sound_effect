// Cimática: a geometria do som na esfera de poeira.
// Uma esfera vibrando numa frequência forma uma onda estacionária, um harmônico esférico Y(l, m). Como a areia
// numa placa de Chladni, os grãos se juntam nas linhas nodais (onde a superfície não se mexe) e desenham a figura;
// o resto da superfície sobe e desce nos ventres, formando lobos. Tom mais agudo = l maior = figura com mais linhas.
import type { ShapeCloud } from './sampler';

export interface Pattern {
  /** ordem do harmônico: 0 = esfera lisa, sem figura */
  l: number;
  /** 0 = anéis (zonal), l = gomos (setorial), entre os dois = grade */
  m: number;
  /** inclinação do eixo da figura, em rad (π/2 = polo virado para a tela) */
  rx: number;
  ry: number;
}

export const restPattern: Pattern = { l: 0, m: 0, rx: 0, ry: 0 };

/** fração dos grãos que vai para as linhas nodais; o resto forma a membrana que vibra */
const LINE_SHARE = 0.75;
/** espessura das linhas nodais, na escala do harmônico normalizado */
const LINE_WIDTH = 0.035;
/** brilho da membrana em relação às linhas */
const MEMBRANE_SHADE = 0.3;

/** Harmônico esférico real (sem a constante de normalização) na direção unitária (x, y, z), eixo em y. */
export function harmonic(l: number, m: number, x: number, y: number, z: number) {
  const phi = Math.atan2(z, x);
  return legendre(l, m, y) * Math.cos(m * phi);
}

/** Polinômio associado de Legendre P(l, m) em c = cos θ, pela recorrência padrão. */
function legendre(l: number, m: number, c: number) {
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  let pmm = 1;
  for (let i = 1; i <= m; i++) pmm *= -(2 * i - 1) * s;
  if (l === m) return pmm;
  let pm1 = c * (2 * m + 1) * pmm;
  for (let ll = m + 2; ll <= l; ll++) {
    const p = (c * (2 * ll - 1) * pm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pm1;
    pm1 = p;
  }
  return pm1;
}

/**
 * Nuvem da esfera (diâmetro 1) com a figura do padrão.
 * `wave` guarda, por ponto, o valor do harmônico (-1..1): é o quanto aquele ponto sobe e desce.
 */
export function cymaticCloud(count: number, p: Pattern): ShapeCloud {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const wave = new Float32Array(count);
  const cx = Math.cos(p.rx);
  const sx = Math.sin(p.rx);
  const cy = Math.cos(p.ry);
  const sy = Math.sin(p.ry);
  // valor do harmônico com o eixo inclinado
  const evaluate = (x: number, y: number, z: number) => {
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    return harmonic(p.l, p.m, x * cy + z1 * sy, y1, -x * sy + z1 * cy);
  };

  let max = 1e-6;
  if (p.l > 0) {
    for (let i = 0; i < 4000; i++) {
      const [x, y, z] = randomDirection();
      max = Math.max(max, Math.abs(evaluate(x, y, z)));
    }
  }

  const lines = p.l > 0 ? Math.round(count * LINE_SHARE) : 0;
  for (let i = 0; i < count; i++) {
    let [x, y, z] = randomDirection();
    let v = p.l > 0 ? evaluate(x, y, z) / max : 0;
    if (i < lines) {
      // sorteia até cair perto de uma linha nodal (v ≈ 0)
      for (let tries = 0; tries < 200 && Math.random() > Math.exp(-(v * v) / (2 * LINE_WIDTH * LINE_WIDTH)); tries++) {
        [x, y, z] = randomDirection();
        v = evaluate(x, y, z) / max;
      }
    }
    // poucos grãos enchem o miolo; o resto fica na casca
    const r = 0.5 * (i >= lines && Math.random() < 0.05 ? Math.cbrt(Math.random()) : 0.96 + Math.random() * 0.04);
    positions[i * 3] = x * r;
    positions[i * 3 + 1] = y * r;
    positions[i * 3 + 2] = z * r;
    wave[i] = Math.max(-1, Math.min(1, v));
    colors.fill(i < lines || p.l === 0 ? 1 : MEMBRANE_SHADE, i * 3, i * 3 + 3);
  }
  // as linhas ficam espalhadas pela nuvem: na troca de figura cada grão vai para um ponto qualquer da nova
  shuffle(positions, colors, wave, count);
  return { count, aspect: 1, positions, colors, wave };
}

function randomDirection(): [number, number, number] {
  const z = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, Math.sin(a) * s, z];
}

function shuffle(positions: Float32Array, colors: Float32Array, wave: Float32Array, count: number) {
  for (let i = count - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    for (let c = 0; c < 3; c++) {
      [positions[i * 3 + c], positions[j * 3 + c]] = [positions[j * 3 + c], positions[i * 3 + c]];
      [colors[i * 3 + c], colors[j * 3 + c]] = [colors[j * 3 + c], colors[i * 3 + c]];
    }
    [wave[i], wave[j]] = [wave[j], wave[i]];
  }
}

/** quanto tempo, no mínimo, uma figura fica antes de trocar (ms) */
const HOLD = 1500;
/** batida forte depois de tanto tempo na mesma figura troca a variação (m) */
const VARIATION_AFTER = 4000;
/** silêncio por tanto tempo volta para a esfera lisa (ms) */
const REST_AFTER = 2500;

/**
 * Escolhe a figura conforme a música: o tom (grave → agudo) decide a ordem l, batidas fortes trocam a
 * variação m, e silêncio volta para a esfera lisa.
 */
export class PatternPicker {
  current: Pattern = restPattern;
  private tone = 0.5;
  private changed = 0;
  private quietSince = 0;
  private variant = (Math.random() * 4) | 0;

  /** Chamado a cada leitura do áudio. Devolve a figura nova quando ela muda. */
  update(energy: number, tone: number, now = performance.now()): Pattern | null {
    this.tone += (tone - this.tone) * 0.05;
    if (energy < 0.08) {
      if (!this.quietSince) this.quietSince = now;
      if (this.current.l > 0 && now - this.quietSince > REST_AFTER) return this.set(restPattern, now);
      return null;
    }
    this.quietSince = 0;
    const l = 2 + Math.round(this.tone * 7);
    if (now - this.changed > HOLD && l !== this.current.l) return this.set(this.make(l), now);
    return null;
  }

  /** Batida: se a figura já está há um tempo, troca a variação mantendo o tom. */
  beat(strength: number, now = performance.now()): Pattern | null {
    if (this.current.l === 0 || strength < 0.6 || now - this.changed < VARIATION_AFTER) return null;
    this.variant++;
    return this.set(this.make(this.current.l), now);
  }

  private make(l: number): Pattern {
    // gomos, anéis, grade: cada variação desenha outra geometria com o mesmo número de linhas
    const ms = [l, 0, Math.ceil(l / 2), Math.max(1, l - 2)];
    // polo quase de frente para a tela: a figura aparece como mandala, como a cimática vista de cima
    return { l, m: ms[this.variant % ms.length], rx: Math.PI / 2 + (Math.random() - 0.5) * 0.6, ry: Math.random() * Math.PI };
  }

  private set(p: Pattern, now: number) {
    this.current = p;
    this.changed = now;
    return p;
  }
}
