// Esfera de poeira que se comporta como um material sob som forte (deformação mecânica e acústica não linear).
// Volume baixo quase não mexe; perto do máximo a resposta cresce mais que proporcional.
//
// - a figura (cymatics.ts): a superfície vibra numa onda estacionária; os ventres sobem e descem formando lobos,
//   as linhas nodais ficam paradas. Com volume alto a onda ganha harmônicos e a vibração fica "quadrada", como uma
//   onda sonora forte a caminho de virar choque.
// - graves: um pouco de compressão e um modo de "gelatina" que achata e estica. É um oscilador de Duffing:
//   a mola endurece com a amplitude, então pancada forte vibra mais rápido que pancada fraca.
// - agudos: vibração fina de cada grão (ver ParticleField.step).
// - batida acima do limite de escoamento: amassado que fica e só volta devagar (deformação plástica).

type Vec3 = [number, number, number];

/** batida (0..1) acima disso amassa a esfera */
const YIELD = 0.6;
const MAX_DENTS = 4;
/** quanto do amassado some por segundo */
const CREEP = 0.5;
/** frequência natural do modo de gelatina (rad/s) e o quanto a mola endurece */
const JELLY_W = 13;
const JELLY_HARDEN = 9;

/** resposta não linear: 0,5 de volume dá ~0,31 de deformação, 1 dá 1 */
const nl = (a: number) => (a + a * a * a) / 2;

export class Deformation {
  /** amplitudes já com a resposta não linear, prontas para o quadro */
  breath = 0;
  /** deslocamento dos ventres neste instante (já com o sinal da oscilação) */
  standing = 0;
  /** agitação dos agudos, por grão */
  shake = 0;

  private time = 0;
  private phase = 0;
  private jelly = 0;
  private jellyVel = 0;
  private axis: Vec3 = [0, 1, 0];
  /** xyz + profundidade por amassado */
  private dents = new Float32Array(MAX_DENTS * 4);
  private dentCount = 0;

  update(dt: number, bass: number, mid: number, treble: number) {
    this.time += dt;
    const t = this.time;

    this.breath = nl(bass) * 0.05;

    // Duffing amortecido, empurrado de leve pelo grave contínuo (as batidas entram em impact)
    const x = this.jelly;
    const acc = -JELLY_W * JELLY_W * (x + JELLY_HARDEN * x * x * x) - 2 * 0.25 * JELLY_W * this.jellyVel + nl(bass) * 10;
    this.jellyVel += acc * dt;
    this.jelly = Math.max(-0.2, Math.min(0.2, this.jelly + this.jellyVel * dt));
    // eixo do achatamento gira devagar, para não ficar sempre na vertical
    this.axis = normalize([Math.sin(t * 0.21), Math.cos(t * 0.13), Math.sin(t * 0.17 + 1)]);

    // onda estacionária: a força vem do som todo; os médios aceleram a vibração
    const level = Math.min(1, (bass + mid + treble) / 2.2);
    this.phase += dt * (5 + mid * 7);
    this.standing = nl(level) * 0.3 * steepWave(this.phase, Math.min(0.92, level * level));

    this.shake = treble * treble;

    // amassados voltam devagar (fluência)
    const keep = Math.exp(-dt * CREEP);
    let n = 0;
    for (let i = 0; i < this.dentCount; i++) {
      const depth = this.dents[i * 4 + 3] * keep;
      if (depth < 0.004) continue;
      this.dents.copyWithin(n * 4, i * 4, i * 4 + 3);
      this.dents[n * 4 + 3] = depth;
      n++;
    }
    this.dentCount = n;
  }

  /** Batida: chacoalha a gelatina e, se passar do limite, amassa num ponto qualquer. */
  impact(strength: number) {
    this.jellyVel += strength * 1.5;
    if (strength <= YIELD) return;
    const [x, y, z] = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
    // cheio: o amassado mais raso dá lugar ao novo
    let slot = this.dentCount;
    if (slot === MAX_DENTS) {
      slot = 0;
      for (let i = 1; i < MAX_DENTS; i++) if (this.dents[i * 4 + 3] < this.dents[slot * 4 + 3]) slot = i;
    } else {
      this.dentCount++;
    }
    this.dents.set([x, y, z, Math.min(0.15, (strength - YIELD) * 0.4)], slot * 4);
  }

  /**
   * Fator do raio na direção (nx, ny, nz), unitária. 1 = esfera parada.
   * @param wave valor do harmônico naquele ponto da figura (-1..1)
   */
  radius(nx: number, ny: number, nz: number, wave: number) {
    const [ax, ay, az] = this.axis;
    const c = nx * ax + ny * ay + nz * az;
    // modo l = 2 (Legendre P2): achata nos polos e estica no equador, ou o contrário
    let r = 1 + this.breath + this.jelly * (1.5 * c * c - 0.5) + wave * this.standing;
    for (let i = 0; i < this.dentCount; i++) {
      const d = nx * this.dents[i * 4] + ny * this.dents[i * 4 + 1] + nz * this.dents[i * 4 + 2];
      if (d > 0.6) r -= this.dents[i * 4 + 3] * Math.exp((d - 1) * 10);
    }
    return r;
  }
}

/** cosseno que vira onda quadrada conforme s vai de 0 a 1 (harmônicos ímpares, como numa onda forte) */
function steepWave(p: number, s: number) {
  return Math.cos(p) - (s * Math.cos(3 * p)) / 3 + (s * s * Math.cos(5 * p)) / 5;
}

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
