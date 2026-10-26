// Esfera de poeira que se comporta como um material sob som forte (deformação mecânica e acústica não linear).
// Volume baixo quase não mexe; perto do máximo a resposta cresce mais que proporcional.
//
// - graves: compressão (a esfera incha) e um modo de "gelatina" que achata e estica. É um oscilador de Duffing:
//   a mola endurece com a amplitude, então pancada forte vibra mais rápido que pancada fraca.
// - médios: ondas que correm pela superfície. Com volume alto elas ganham harmônicos (2º e 3º) e ficam
//   íngremes, como uma onda sonora forte a caminho de virar choque.
// - agudos: vibração fina de cada grão (ver ParticleField.step).
// - batida acima do limite de escoamento: amassado que fica e só volta devagar (deformação plástica).

type Vec3 = [number, number, number];

/** batida (0..1) acima disso amassa a esfera */
const YIELD = 0.45;
const MAX_DENTS = 6;
/** quanto do amassado some por segundo */
const CREEP = 0.35;
/** frequência natural do modo de gelatina (rad/s) e o quanto a mola endurece */
const JELLY_W = 13;
const JELLY_HARDEN = 9;

/** resposta não linear: 0,5 de volume dá ~0,31 de deformação, 1 dá 1 */
const nl = (a: number) => (a + a * a * a) / 2;

export class Deformation {
  /** amplitudes já com a resposta não linear, prontas para o quadro */
  breath = 0;
  ripple = 0;
  /** 0..1: quanto as ondas dos médios estão íngremes */
  steep = 0;
  /** agitação dos agudos, por grão */
  shake = 0;

  private time = 0;
  private jelly = 0;
  private jellyVel = 0;
  private axis: Vec3 = [0, 1, 0];
  private w1: Vec3 = [0, 0, 0];
  private w2: Vec3 = [0, 0, 0];
  private phase1 = 0;
  private phase2 = 0;
  /** xyz + profundidade por amassado */
  private dents = new Float32Array(MAX_DENTS * 4);
  private dentCount = 0;

  update(dt: number, bass: number, mid: number, treble: number) {
    this.time += dt;
    const t = this.time;

    this.breath = nl(bass) * 0.2;

    // Duffing amortecido, empurrado pelo grave contínuo (as batidas entram em impact)
    const x = this.jelly;
    const acc = -JELLY_W * JELLY_W * (x + JELLY_HARDEN * x * x * x) - 2 * 0.18 * JELLY_W * this.jellyVel + nl(bass) * 40;
    this.jellyVel += acc * dt;
    this.jelly = Math.max(-0.45, Math.min(0.45, this.jelly + this.jellyVel * dt));

    // eixo do achatamento gira devagar, para não ficar sempre na vertical
    this.axis = normalize([Math.sin(t * 0.21), Math.cos(t * 0.13), Math.sin(t * 0.17 + 1)]);

    this.ripple = nl(mid) * 0.16;
    this.steep = Math.min(0.92, mid * mid);
    const speed = 2.5 + mid * 5;
    this.phase1 += dt * speed;
    this.phase2 -= dt * speed * 0.8;
    this.w1 = normalize([Math.cos(t * 0.05), 0.4, Math.sin(t * 0.05)]);
    this.w2 = normalize([0.3, Math.cos(t * 0.04), Math.sin(t * 0.07)]);

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
    this.jellyVel += strength * 4;
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
    this.dents.set([x, y, z, Math.min(0.3, (strength - YIELD) * 0.6)], slot * 4);
  }

  /** Fator do raio na direção (nx, ny, nz), unitária. 1 = esfera parada. */
  radius(nx: number, ny: number, nz: number) {
    const [ax, ay, az] = this.axis;
    const c = nx * ax + ny * ay + nz * az;
    // modo l = 2 (Legendre P2): achata nos polos e estica no equador, ou o contrário
    let r = 1 + this.breath + this.jelly * (1.5 * c * c - 0.5);

    if (this.ripple > 0.001) {
      const p1 = 7 * (nx * this.w1[0] + ny * this.w1[1] + nz * this.w1[2]) - this.phase1;
      const p2 = 5 * (nx * this.w2[0] + ny * this.w2[1] + nz * this.w2[2]) - this.phase2;
      r += (steepWave(p1, this.steep) * 0.6 + steepWave(p2, this.steep) * 0.4) * this.ripple;
    }

    for (let i = 0; i < this.dentCount; i++) {
      const d = nx * this.dents[i * 4] + ny * this.dents[i * 4 + 1] + nz * this.dents[i * 4 + 2];
      if (d > 0.6) r -= this.dents[i * 4 + 3] * Math.exp((d - 1) * 10);
    }
    return r;
  }
}

/** seno que vira dente de serra conforme s vai de 0 a 1 (série de Fubini resumida) */
function steepWave(p: number, s: number) {
  return (Math.sin(p) + (s * Math.sin(2 * p)) / 2 + (s * s * Math.sin(3 * p)) / 3) / (1 + s / 2 + (s * s) / 3);
}

function normalize([x, y, z]: Vec3): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
