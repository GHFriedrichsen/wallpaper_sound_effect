// Cimática: a geometria do som na esfera de poeira.
// Cada nota faz a esfera vibrar num modo próprio, uma onda estacionária: um harmônico esférico Y(l, m). Nota mais
// aguda = modo de ordem maior = figura com mais linhas. A mesma nota desenha sempre a mesma figura; um acorde
// soma os modos das notas.
// Como a areia numa placa de Chladni, cada grão é sacudido conforme a vibração no ponto onde está: no ventre é
// jogado longe, na linha nodal fica parado, e quicando ele acaba onde a superfície se mexe menos. A areia se
// junta nas linhas e a figura aparece; quando a nota muda, ela escorre para as linhas da nota nova. Sem som,
// nada vibra e o desenho fica como está.
import type { ShapeCloud } from './sampler';

/** nota detectada no espectro (ver audio.ts) */
export interface Note {
  /** posição no espectro, 0..63 (fracionária), do grave ao agudo */
  pos: number;
  /** 0..1 */
  strength: number;
}

interface Mode {
  l: number;
  m: number;
  /** maior |Y| na esfera, para normalizar em -1..1 */
  max: number;
}

/** Os modos, do mais grave ao mais agudo: cada faixa do espectro cai sempre no mesmo. */
const MODES: Mode[] = [];
for (let l = 2; l <= 11; l++) {
  // até l = 5 todas as variações; depois só gomos, grade e anéis, que são as que mais se distinguem
  const ms = l <= 5 ? Array.from({ length: l + 1 }, (_, m) => l - m) : [l, Math.ceil(l / 2), 0];
  for (const m of ms) MODES.push({ l, m, max: 0 });
}

/** a figura fica com o polo quase de frente para a tela: aparece como mandala, como a cimática vista de cima */
const TILT = 1.25;
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);

/** quanto um grão no ventre anda por quadro com som no máximo (rad) */
const SHAKE = 0.12;
/** um resto de agitação até na linha nodal (fração do ventre), para a areia não congelar */
const SHAKE_FLOOR = 0.03;
/** chance de um grão aceitar um quique que o leva para onde vibra mais (sem isso a areia empaca em linhas velhas) */
const UPHILL = 0.08;
const TURNS = 3;
/** subida e descida da força de cada modo (por leitura do áudio, ~30 por segundo) */
const ATTACK = 0.35;
const RELEASE = 0.06;

export function modeIndex(pos: number) {
  return Math.max(0, Math.min(MODES.length - 1, Math.floor((pos / 64) * MODES.length)));
}

/** Harmônico esférico real (sem a constante de normalização), com o eixo inclinado para a tela. */
function harmonic(mode: Mode, x: number, y: number, z: number) {
  const y1 = y * COS_T - z * SIN_T;
  const z1 = y * SIN_T + z * COS_T;
  // cos(mφ) pela recorrência de Chebyshev, sem atan2 nem cos: roda dezenas de milhares de vezes por quadro
  const rho = Math.sqrt(x * x + z1 * z1);
  const c1 = rho > 1e-9 ? x / rho : 1;
  let prev = 1;
  let cur = c1;
  if (mode.m === 0) cur = 1;
  for (let k = 2; k <= mode.m; k++) {
    const next = 2 * c1 * cur - prev;
    prev = cur;
    cur = next;
  }
  return legendre(mode.l, mode.m, y1) * cur;
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

function normalizeMode(mode: Mode) {
  if (mode.max > 0) return;
  let max = 1e-6;
  for (let i = 0; i < 3000; i++) {
    const [x, y, z] = randomDirection();
    max = Math.max(max, Math.abs(harmonic(mode, x, y, z)));
  }
  mode.max = max;
}

/** Esfera de diâmetro 1, areia espalhada por igual: a figura se forma com o som. */
export function sphereCloud(count: number): ShapeCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = randomDirection();
    // poucos grãos enchem o miolo; o resto fica na casca
    const r = 0.5 * (Math.random() < 0.05 ? Math.cbrt(Math.random()) : 0.96 + Math.random() * 0.04);
    positions.set([x * r, y * r, z * r], i * 3);
  }
  return { count, aspect: 1, positions, colors: new Float32Array(count * 3).fill(1), wave: new Float32Array(count) };
}

export class Cymatics {
  /** força atual de cada modo (índice em MODES); só os que estão soando */
  private amps = new Map<number, number>();
  private active: { mode: Mode; weight: number }[] = [];
  /** um terço dos grãos por quadro, em rodízio: a conta é pesada e a areia não precisa de mais */
  private turn = 0;

  /** Notas da leitura atual do áudio. Cada uma acende o seu modo; o que parou de soar apaga devagar. */
  setNotes(notes: Note[]) {
    const target = new Map<number, number>();
    for (const n of notes) {
      const k = modeIndex(n.pos);
      target.set(k, Math.max(target.get(k) ?? 0, n.strength));
    }
    for (const k of new Set([...this.amps.keys(), ...target.keys()])) {
      const cur = this.amps.get(k) ?? 0;
      const tgt = target.get(k) ?? 0;
      const next = cur + (tgt - cur) * (tgt > cur ? ATTACK : RELEASE);
      if (next < 0.02 && tgt === 0) this.amps.delete(k);
      else this.amps.set(k, next);
    }
    // os 3 mais fortes, com pesos somando 1: a figura é a da nota dominante, misturada com as outras do acorde
    const top = [...this.amps].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const total = top.reduce((s, [, a]) => s + a, 0) || 1;
    this.active = top.map(([k, a]) => {
      normalizeMode(MODES[k]);
      return { mode: MODES[k], weight: a / total };
    });
  }

  /**
   * Um quadro da areia: sacode cada grão conforme a vibração onde ele está e grava em `wave` o deslocamento
   * daquele ponto (-1..1), que o material usa para formar os lobos.
   * @param level volume geral, 0..1: sem som a areia não se mexe
   */
  step(dt: number, cloud: ShapeCloud, level: number) {
    const { positions, wave } = cloud;
    if (!wave) return;
    const active = this.active;
    if (active.length === 0) {
      wave.fill(0);
      return;
    }
    const value = (x: number, y: number, z: number) => {
      let v = 0;
      for (const { mode, weight } of active) v += (harmonic(mode, x, y, z) / mode.max) * weight;
      return v;
    };
    // cada grão anda a cada três quadros: o passo vale por três
    const move = level * Math.sqrt(dt * 60 * TURNS);
    this.turn = (this.turn + 1) % TURNS;
    for (let i = this.turn; i < cloud.count; i += TURNS) {
      const i3 = i * 3;
      // Math.hypot é bem mais lento que a raiz direta, e isto roda para cada grão
      const r = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2) || 1e-6;
      const x = positions[i3] / r;
      const y = positions[i3 + 1] / r;
      const z = positions[i3 + 2] / r;
      const v = value(x, y, z);
      wave[i] = v;
      if (move < 0.001) continue;
      // quique aleatório do tamanho da vibração local, na superfície
      const step = (Math.abs(v) + SHAKE_FLOOR) * SHAKE * move;
      let nx = x + (Math.random() - 0.5) * 2 * step;
      let ny = y + (Math.random() - 0.5) * 2 * step;
      let nz = z + (Math.random() - 0.5) * 2 * step;
      const k = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
      nx *= k;
      ny *= k;
      nz *= k;
      const nv = value(nx, ny, nz);
      // fica onde vibra menos; para onde vibra mais, só de vez em quando
      if (Math.abs(nv) > Math.abs(v) && Math.random() > UPHILL) continue;
      positions[i3] = nx * r;
      positions[i3 + 1] = ny * r;
      positions[i3 + 2] = nz * r;
      wave[i] = nv;
    }
  }
}

function randomDirection(): [number, number, number] {
  const z = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, Math.sin(a) * s, z];
}
