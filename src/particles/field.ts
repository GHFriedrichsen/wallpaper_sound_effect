// Campo de grãos do portfolio (github.com/GHFriedrichsen/portifolio), adaptado para o wallpaper:
// em vez de um logo por vez, várias formas ao mesmo tempo (relógio, capa, título, progresso, clima),
// cada uma com sua parte dos grãos. Os grãos que sobram flutuam como poeira, e o áudio mexe em tudo.
import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DynamicDrawUsage,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three';
import { Deformation } from './deform';
import { sampleShape, type ShapeCloud, type ShapeSource } from './sampler';

export type RGB = [number, number, number];

export interface Palette {
  bg: RGB;
  /** cor dos grãos soltos */
  dust: RGB;
  /** cor dos grãos de texto (relógio, título, clima) */
  ink: RGB;
}

export interface FieldOptions {
  /** total de grãos */
  count: number;
  /** tamanho base do grão em px */
  size: number;
  /** rigidez da "mola" que puxa o grão até a forma */
  formSpeed: number;
  /** força com que o mouse empurra os grãos */
  mouseForce: number;
  /** raio do mouse, em fração da altura visível */
  mouseRadius: number;
  /** quanto as formas inclinam seguindo o mouse, em graus */
  tilt: number;
  /** quanto os grãos soltos flutuam */
  drift: number;
  /** multiplica a opacidade dos grãos soltos */
  dustAlpha: number;
  /** soma as cores dos grãos soltos e das formas com glow (brilho); desligado, um grão só cobre o outro */
  glow: boolean;
  /** intensidade da reação ao áudio (0 = desligada, 1 = normal) */
  audio: number;
  /** limite de quadros por segundo (0 = sem limite) */
  fps: number;
}

export const defaultFieldOptions: FieldOptions = {
  count: 60000,
  size: 2.8,
  formSpeed: 16,
  mouseForce: 70,
  mouseRadius: 0.16,
  tilt: 10,
  drift: 1,
  dustAlpha: 1,
  glow: true,
  audio: 1,
  fps: 0,
};

export interface SlotOptions {
  /** posição em fração da tela (0..1, y para baixo): o centro, ou a borda esquerda com align 'left' */
  x: number;
  y: number;
  /** altura da forma em fração da altura da tela */
  height: number;
  align: 'center' | 'left';
  /** fração do total de grãos reservada para esta forma */
  share: number;
  /** espessura da forma, em fração da altura dela */
  depth: number;
  /** amplitude do balanço, em graus */
  swing: number;
  swingSpeed: number;
  /** 'source': cor do pixel (capa); 'ink': cor de tinta da paleta, com o brilho do pixel; 'dust': cor da poeira */
  color: 'source' | 'ink' | 'dust';
  /** opacidade dos grãos da forma */
  alpha: number;
  /** quanto a forma "respira" com os graves */
  react: number;
  /** tamanho do grão na forma, relativo ao solto (texto pede grão menor para ficar legível) */
  grain: number;
  /** grãos sobrepostos somam brilho; desligado, cobrem um ao outro (a capa mantém as cores reais) */
  glow: boolean;
  /** fração dos grãos da frente que vai no contorno da forma (deixa as letras nítidas) */
  outline: number;
  /** giro contínuo em torno do eixo vertical, rad/s */
  spin?: number;
  /** a forma se deforma com o som como um material (ver deform.ts); só uma forma por campo */
  material?: boolean;
}

export const defaultPalette: Palette = {
  bg: [0.039, 0.039, 0.047],
  dust: [0.86, 0.86, 0.82],
  ink: [0.96, 0.96, 0.93],
};

const CAM_Z = 12;
const FOV = 40;
const Z_NEAR = 3;
const Z_FAR = -8;
/** com mais poeira que isso, cada grão solto apaga um pouco: o fundo fica parecido com 10 mil ou com 100 mil grãos */
const DUST_REF = 7000;

const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aSize;
  attribute float aGrow;
  attribute float aFormSize;
  attribute float aFormOver;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uPulse;
  uniform float uNoGlow;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vOver;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // grão de forma tem o tamanho pedido pela forma; o grão solto pulsa com o áudio
    float grow = mix(uPulse, aFormSize, aGrow);
    gl_PointSize = uSize * aSize * grow * uPixelRatio * (${CAM_Z.toFixed(1)} / -mv.z);
    vColor = aColor;
    vAlpha = aAlpha;
    // 0 = soma brilho, 1 = cobre (ver o blending no material)
    vOver = max(aFormOver * aGrow, uNoGlow);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vOver;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vAlpha;
    if (a < 0.01) discard;
    // cor pré-multiplicada: com alfa de saída 0 o grão só soma (brilho), com alfa cheio ele cobre o que está atrás
    gl_FragColor = vec4(vColor * a, a * vOver);
  }
`;

interface Slot {
  index: number;
  opts: SlotOptions;
  source: ShapeSource | null;
  cloud: ShapeCloud | null;
  budget: number;
  token: number;
  formStart: number;
  /** 0..1: grãos à direita deste ponto ficam apagados (barra de progresso) */
  reveal: number;
  revealNow: number;
  /** multiplica a opacidade (capa apagada quando a música pausa) */
  dim: number;
  dimNow: number;
}

/** valores de cada forma calculados uma vez por quadro */
interface SlotFrame {
  on: boolean;
  ax: number;
  ay: number;
  scale: number;
  cy: number;
  sy: number;
  cx: number;
  sx: number;
  elapsed: number;
  ink: boolean;
  dust: boolean;
  material: boolean;
  alpha: number;
  revealX: number;
  hasReveal: boolean;
}

export class ParticleField {
  opts: FieldOptions;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private material: ShaderMaterial;
  private geometry = new BufferGeometry();
  private points: Points;

  private slots: Slot[] = [];
  private slotByName = new Map<string, Slot>();
  private frames: SlotFrame[] = [];

  // estado por grão
  private pos = new Float32Array(0);
  private vel = new Float32Array(0);
  private home = new Float32Array(0);
  private col = new Float32Array(0);
  private alpha = new Float32Array(0);
  private grow = new Float32Array(0);
  private formSize = new Float32Array(0);
  private formOver = new Float32Array(0);
  private size = new Float32Array(0);
  private seed = new Float32Array(0);
  private baseAlpha = new Float32Array(0);
  private shade = new Float32Array(0);
  /** forma a que o grão pertence (-1 = poeira) */
  private slotOf = new Int16Array(0);
  /** ponto da forma que o grão ocupa */
  private target = new Int32Array(0);
  private delay = new Float32Array(0);
  private order = new Int32Array(0);

  private palette: Palette = clonePalette(defaultPalette);
  private paletteTarget: Palette = clonePalette(defaultPalette);

  private bass = 0;
  private mid = 0;
  private treble = 0;
  private energy = 0;
  private bassIn = 0;
  private midIn = 0;
  private trebleIn = 0;
  private energyIn = 0;
  private deform = new Deformation();
  private dustCount = 0;

  private halfW = 1;
  private halfH = 1;
  private time = 0;
  private driftTime = 0;
  private last = 0;
  private lastFrame = 0;
  private raf = 0;

  private mouse = { x: 0, y: 0, active: false, nx: 0, ny: 0 };
  private tiltX = 0;
  private tiltY = 0;

  constructor(canvas: HTMLCanvasElement, slots: Record<string, SlotOptions>, opts: Partial<FieldOptions> = {}) {
    this.opts = { ...defaultFieldOptions, ...opts };
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.camera.position.z = CAM_Z;

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        uSize: { value: this.opts.size },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uPulse: { value: 1 },
        uNoGlow: { value: this.opts.glow ? 0 : 1 },
      },
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    for (const [name, slotOpts] of Object.entries(slots)) {
      const slot: Slot = {
        index: this.slots.length,
        opts: slotOpts,
        source: null,
        cloud: null,
        budget: 0,
        token: 0,
        formStart: 0,
        reveal: 1,
        revealNow: 1,
        dim: 1,
        dimNow: 1,
      };
      this.slots.push(slot);
      this.slotByName.set(name, slot);
      this.frames.push({} as SlotFrame);
    }

    this.resize();
    this.allocate(this.opts.count);

    addEventListener('resize', this.resize);
    addEventListener('pointermove', this.onPointer, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.start();
  }

  // ---------- API ----------

  /**
   * Forma uma figura na posição `name` (ou solta os grãos dela com null).
   * @param morph os grãos que já estão na forma só andam até a nova, sem se soltar (troca de minuto)
   */
  async setShape(name: string, source: ShapeSource | null, morph = false) {
    const slot = this.slot(name);
    if (source && slot.source?.key === source.key) return;
    slot.source = source;
    const token = ++slot.token;
    if (!source) {
      this.release(slot);
      return;
    }
    try {
      const { depth, outline } = slot.opts;
      const cloud = await sampleShape(source, { count: slot.budget, depth, outline });
      if (token === slot.token) this.assign(slot, cloud, morph);
    } catch (err) {
      console.warn('não deu para formar', source.key, err);
    }
  }

  /** Barra de progresso: só os grãos até `value` (0..1, da esquerda) ficam acesos. */
  setReveal(name: string, value: number) {
    this.slot(name).reveal = Math.min(1, Math.max(0, value));
  }

  /** Apaga (0) ou acende (1) os grãos de uma forma. */
  setDim(name: string, value: number) {
    this.slot(name).dim = value;
  }

  setPalette(p: Palette) {
    this.paletteTarget = clonePalette(p);
  }

  /** Nível atual do áudio, 0..1. Suavizado aqui dentro, a cada quadro. */
  setAudio(bass: number, energy: number, mid = 0, treble = 0) {
    this.bassIn = bass;
    this.energyIn = energy;
    this.midIn = mid;
    this.trebleIn = treble;
  }

  /** Empurrão nos grãos de uma forma (batida da música). */
  kick(name: string, strength: number) {
    const slot = this.slot(name);
    if (!slot.cloud) return;
    const s = strength * this.opts.audio;
    const { vel, slotOf, pos } = this;
    if (slot.opts.material) {
      // onda de choque: empurra para fora a partir do centro e deixa a marca no material
      this.deform.impact(Math.min(1, s));
      const f = this.frames[slot.index];
      for (let i = 0; i < slotOf.length; i++) {
        if (slotOf[i] !== slot.index) continue;
        const dx = pos[i * 3] - f.ax;
        const dy = pos[i * 3 + 1] - f.ay;
        const dz = pos[i * 3 + 2];
        const k = (s * 2.2) / (Math.hypot(dx, dy, dz) + 0.3);
        vel[i * 3] += dx * k;
        vel[i * 3 + 1] += dy * k;
        vel[i * 3 + 2] += dz * k;
      }
      return;
    }
    for (let i = 0; i < slotOf.length; i++) {
      if (slotOf[i] !== slot.index) continue;
      vel[i * 3] += (Math.random() - 0.5) * s;
      vel[i * 3 + 1] += (Math.random() - 0.5) * s;
      vel[i * 3 + 2] += Math.random() * s * 0.8;
    }
  }

  /** Atualiza opções; refaz os grãos só quando a quantidade muda. */
  update(patch: Partial<FieldOptions>) {
    const prev = this.opts;
    this.opts = { ...prev, ...patch };
    this.material.uniforms.uSize.value = this.opts.size;
    this.material.uniforms.uNoGlow.value = this.opts.glow ? 0 : 1;
    if (this.opts.count !== prev.count) {
      this.allocate(this.opts.count);
      // as nuvens foram amostradas para a quantidade antiga: forma tudo de novo
      for (const slot of this.slots) {
        const source = slot.source;
        slot.source = null;
        slot.cloud = null;
        if (source) this.setShape(this.nameOf(slot), source);
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }

  // ---------- montagem ----------

  private slot(name: string) {
    const slot = this.slotByName.get(name);
    if (!slot) throw new Error(`forma desconhecida: ${name}`);
    return slot;
  }

  private nameOf(slot: Slot) {
    for (const [name, s] of this.slotByName) if (s === slot) return name;
    return '';
  }

  private allocate(count: number) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.home = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.grow = new Float32Array(count);
    this.formSize = new Float32Array(count).fill(1);
    this.formOver = new Float32Array(count);
    this.size = new Float32Array(count);
    this.seed = new Float32Array(count);
    this.baseAlpha = new Float32Array(count);
    this.shade = new Float32Array(count);
    this.slotOf = new Int16Array(count).fill(-1);
    this.target = new Int32Array(count);
    this.delay = new Float32Array(count);
    this.order = new Int32Array(count);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
      const spread = (CAM_Z - z) / CAM_Z; // mais longe = mais espalhado, para cobrir a tela toda
      this.home[i3] = (Math.random() * 2.3 - 1.15) * this.halfW * spread;
      this.home[i3 + 1] = (Math.random() * 2.3 - 1.15) * this.halfH * spread;
      this.home[i3 + 2] = z;
      this.pos.set(this.home.subarray(i3, i3 + 3), i3);
      this.seed[i] = Math.random();
      // poucos grãos grandes, muitos pequenos
      this.size[i] = 0.45 + Math.pow(Math.random(), 3) * 1.6;
      this.baseAlpha[i] = 0.25 + Math.random() * 0.5;
      this.shade[i] = 0.55 + Math.random() * 0.45;
      this.order[i] = i;
    }
    // ordem embaralhada: cada forma usa grãos espalhados pela tela inteira
    for (let i = count - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }

    for (const slot of this.slots) slot.budget = Math.floor(count * slot.opts.share);

    this.geometry.dispose();
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aGrow', new BufferAttribute(this.grow, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aFormSize', new BufferAttribute(this.formSize, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aFormOver', new BufferAttribute(this.formOver, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.size, 1));
    this.points.geometry = this.geometry;
  }

  /** Solta os grãos de uma forma, com um empurrão. */
  private release(slot: Slot) {
    const { slotOf, vel } = this;
    for (let i = 0; i < slotOf.length; i++) {
      if (slotOf[i] !== slot.index) continue;
      slotOf[i] = -1;
      vel[i * 3] += (Math.random() - 0.5) * 3;
      vel[i * 3 + 1] += (Math.random() - 0.5) * 3;
      vel[i * 3 + 2] += (Math.random() - 0.5) * 3;
    }
    slot.cloud = null;
  }

  private assign(slot: Slot, cloud: ShapeCloud, morph: boolean) {
    if (morph && slot.cloud && slot.cloud.count === cloud.count) {
      slot.cloud = cloud;
      return;
    }
    this.release(slot);
    slot.cloud = cloud;
    const { slotOf, target, order, delay, formSize, formOver } = this;
    const count = slotOf.length;
    const start = (Math.random() * count) | 0;
    let j = 0;
    for (let k = 0; k < count && j < cloud.count; k++) {
      const i = order[(start + k) % count];
      if (slotOf[i] >= 0) continue;
      slotOf[i] = slot.index;
      target[i] = j++;
      delay[i] = Math.random() * 0.55;
      formSize[i] = slot.opts.grain;
      formOver[i] = slot.opts.glow ? 0 : 1;
    }
    this.geometry.attributes.aFormSize.needsUpdate = true;
    this.geometry.attributes.aFormOver.needsUpdate = true;
    slot.formStart = this.time;
  }

  // ---------- eventos ----------

  private resize = () => {
    const w = innerWidth;
    const h = innerHeight;
    if (!w || !h) return; // janela sem tamanho: espera o próximo resize
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const prevW = this.halfW;
    const prevH = this.halfH;
    this.halfH = Math.tan(((FOV / 2) * Math.PI) / 180) * CAM_Z;
    this.halfW = this.halfH * this.camera.aspect;
    // reescala as posições livres para a nova proporção
    const sx = this.halfW / prevW;
    const sy = this.halfH / prevH;
    for (let i = 0; i < this.home.length; i += 3) {
      this.home[i] *= sx;
      this.home[i + 1] *= sy;
      this.pos[i] *= sx;
      this.pos[i + 1] *= sy;
    }
  };

  private onPointer = (e: PointerEvent) => {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = -((e.clientY / innerHeight) * 2 - 1);
    this.mouse.nx = nx;
    this.mouse.ny = ny;
    this.mouse.x = nx * this.halfW;
    this.mouse.y = ny * this.halfH;
    this.mouse.active = e.pointerType === 'mouse' || e.pointerType === 'pen';
  };

  private onPointerLeave = () => {
    this.mouse.active = false;
  };

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else this.start();
  };

  // ---------- loop ----------

  private start() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    // limite de FPS do Wallpaper Engine: pula o quadro se ainda é cedo
    const fps = this.opts.fps;
    if (fps > 0 && now - this.lastFrame < 1000 / fps - 2) return;
    this.lastFrame = now;
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private stepShared(dt: number) {
    // áudio: sobe rápido, desce devagar
    const audio = this.opts.audio;
    const up = Math.min(1, dt * 18);
    const down = Math.min(1, dt * 5);
    const b = this.bassIn * audio;
    const e = this.energyIn * audio;
    this.bass += (b - this.bass) * (b > this.bass ? up : down);
    this.energy += (e - this.energy) * (e > this.energy ? up : down);
    const m = this.midIn * audio;
    const tr = this.trebleIn * audio;
    this.mid += (m - this.mid) * (m > this.mid ? up : down);
    this.treble += (tr - this.treble) * (tr > this.treble ? up : down);
    this.deform.update(dt, Math.min(1, this.bass), Math.min(1, this.mid), Math.min(1, this.treble));
    // a poeira pulsa com os graves (sobem e descem a cada batida); a energia geral, quase sempre alta depois do
    // ganho automático, só acelera a flutuação
    this.material.uniforms.uPulse.value = 1 + this.bass * 0.7;
    this.driftTime += dt * (1 + this.energy * 2.5);

    // paleta: transição suave quando a capa muda
    const pk = Math.min(1, dt * 1.6);
    for (const key of ['bg', 'dust', 'ink'] as const) {
      const cur = this.palette[key];
      const tgt = this.paletteTarget[key];
      for (let c = 0; c < 3; c++) cur[c] += (tgt[c] - cur[c]) * pk;
    }
    const [r, g, bl] = this.palette.bg;
    this.renderer.setClearColor((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(bl * 255), 1);

    // inclinação suave seguindo o mouse
    const deg = Math.PI / 180;
    const k = Math.min(1, dt * 2.5);
    const o = this.opts;
    this.tiltY += ((this.mouse.active ? this.mouse.nx : 0) * o.tilt * deg - this.tiltY) * k;
    this.tiltX += ((this.mouse.active ? -this.mouse.ny : 0) * o.tilt * 0.6 * deg - this.tiltX) * k;

    const sk = Math.min(1, dt * 4);
    for (const slot of this.slots) {
      const f = this.frames[slot.index];
      const so = slot.opts;
      slot.revealNow += (slot.reveal - slot.revealNow) * sk;
      slot.dimNow += (slot.dim - slot.dimNow) * Math.min(1, dt * 2);
      f.on = slot.cloud !== null;
      if (!slot.cloud) continue;
      const rotY = Math.sin(this.time * so.swingSpeed) * so.swing * deg + this.time * (so.spin ?? 0) + this.tiltY;
      const rotX = this.tiltX;
      f.cy = Math.cos(rotY);
      f.sy = Math.sin(rotY);
      f.cx = Math.cos(rotX);
      f.sx = Math.sin(rotX);
      f.scale = so.height * 2 * this.halfH * (1 + this.bass * so.react * 0.16);
      const width = slot.cloud.aspect * so.height * 2 * this.halfH;
      const left = so.x * 2 * this.halfW - this.halfW;
      f.ax = so.align === 'left' ? left + width / 2 : left;
      f.ay = -(so.y * 2 * this.halfH - this.halfH);
      f.elapsed = this.time - slot.formStart;
      f.ink = so.color === 'ink';
      f.dust = so.color === 'dust';
      f.material = so.material ?? false;
      f.alpha = so.alpha * slot.dimNow;
      f.hasReveal = slot.revealNow < 0.999;
      f.revealX = (slot.revealNow - 0.5) * slot.cloud.aspect;
    }
  }

  private step(dt: number) {
    this.stepShared(dt);
    const o = this.opts;
    const t = this.driftTime;
    const { pos, vel, home, col, alpha, grow, seed, slotOf, target, delay, baseAlpha, shade, frames, slots } = this;
    const count = slotOf.length;
    const { dust, ink } = this.palette;

    const formK = o.formSpeed;
    const freeK = 1.1;
    const formDamp = Math.exp(-2 * Math.sqrt(formK) * 0.72 * dt);
    // o material é mais rígido que as outras formas: acompanha a deformação quase sem atraso
    const matK = formK * 3;
    const matDamp = Math.exp(-2 * Math.sqrt(matK) * 0.5 * dt);
    const deform = this.deform;
    // agudos: cada grão do material treme (independe do fps)
    const shake = deform.shake * 5 * Math.sqrt(dt * 60);
    const sparkle = this.treble;
    const freeDamp = Math.exp(-2 * Math.sqrt(freeK) * 0.9 * dt);

    const mr = o.mouseRadius * 2 * this.halfH;
    const mr2 = mr * mr;
    const mouseOn = this.mouse.active && o.mouseForce > 0;
    const mxw = this.mouse.x;
    const myw = this.mouse.y;
    const drift = o.drift;
    const colorK = Math.min(1, dt * 3.5);
    // a poeira acende um pouco com a música
    const dustAlpha = o.dustAlpha * (1 + this.bass * 0.7 + this.energy * 0.2) * Math.min(1, Math.sqrt(DUST_REF / Math.max(1, this.dustCount)));
    let dustCount = 0;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const si = slotOf[i];
      const f = si >= 0 ? frames[si] : null;
      const forming = f !== null && f.on && f.elapsed > delay[i];
      let tx: number, ty: number, tz: number, spring: number, damp: number;
      let cr: number, cg: number, cb: number, ta: number;

      if (forming) {
        const cloud = slots[si].cloud!;
        const c3 = target[i] * 3;
        let lx = cloud.positions[c3] * f.scale;
        let ly = cloud.positions[c3 + 1] * f.scale;
        let lz = cloud.positions[c3 + 2] * f.scale;
        let strain = 0;
        if (f.material) {
          const px = cloud.positions[c3];
          const py = cloud.positions[c3 + 1];
          const pz = cloud.positions[c3 + 2];
          const len = Math.hypot(px, py, pz) || 1;
          const r = deform.radius(px / len, py / len, pz / len);
          lx *= r;
          ly *= r;
          lz *= r;
          strain = Math.min(1, Math.abs(r - 1 - deform.breath) * 4);
          if (shake > 0.001) {
            const sk = shake * len;
            vel[i3] += (Math.random() - 0.5) * sk;
            vel[i3 + 1] += (Math.random() - 0.5) * sk;
            vel[i3 + 2] += (Math.random() - 0.5) * sk;
          }
        }
        const x1 = lx * f.cy + lz * f.sy;
        const z1 = -lx * f.sy + lz * f.cy;
        tx = f.ax + x1;
        ty = f.ay + ly * f.cx - z1 * f.sx;
        tz = ly * f.sx + z1 * f.cx;
        spring = f.material ? matK : formK;
        damp = f.material ? matDamp : formDamp;

        cr = cloud.colors[c3];
        cg = cloud.colors[c3 + 1];
        cb = cloud.colors[c3 + 2];
        if (f.dust) {
          // onde o material está mais deformado, a poeira esquenta até a cor de tinta
          const sh = shade[i] * (1 - strain) + strain;
          cr = (dust[0] + (ink[0] - dust[0]) * strain) * sh;
          cg = (dust[1] + (ink[1] - dust[1]) * strain) * sh;
          cb = (dust[2] + (ink[2] - dust[2]) * strain) * sh;
        } else if (f.ink) {
          // texto desenhado em cinza: o brilho do pixel vira a intensidade da tinta
          const v = cr;
          cr = ink[0] * v;
          cg = ink[1] * v;
          cb = ink[2] * v;
        }
        ta = f.alpha;
        // agudos fazem os grãos do material cintilar
        if (f.material) ta *= 0.7 + 0.3 * strain + sparkle * 0.5 * Math.sin(this.time * 31 + seed[i] * 97);
        if (f.hasReveal && cloud.positions[c3] > f.revealX) {
          // o que ainda não tocou fica apagado e na cor da poeira: contraste com a parte tocada
          cr = dust[0] * 0.6;
          cg = dust[1] * 0.6;
          cb = dust[2] * 0.6;
          ta *= 0.16;
        }
      } else {
        const s = seed[i] * 50;
        tx = home[i3] + (Math.sin(t * 0.17 + s) * 0.35 + Math.sin(t * 0.07 + s * 0.3) * 0.25) * drift;
        ty = home[i3 + 1] + Math.cos(t * 0.13 + s * 0.7) * 0.3 * drift;
        tz = home[i3 + 2] + Math.sin(t * 0.11 + s * 1.3) * 0.4 * drift;
        spring = freeK;
        damp = freeDamp;
        const sh = shade[i];
        cr = dust[0] * sh;
        cg = dust[1] * sh;
        cb = dust[2] * sh;
        ta = baseAlpha[i] * dustAlpha;
        dustCount++;
      }

      let vx = vel[i3] + (tx - pos[i3]) * spring * dt;
      let vy = vel[i3 + 1] + (ty - pos[i3 + 1]) * spring * dt;
      let vz = vel[i3 + 2] + (tz - pos[i3 + 2]) * spring * dt;

      if (mouseOn) {
        const dx = pos[i3] - mxw;
        const dy = pos[i3 + 1] - myw;
        const d2 = dx * dx + dy * dy;
        if (d2 < mr2 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const fm = (1 - d / mr) ** 2 * o.mouseForce * dt;
          vx += (dx / d) * fm;
          vy += (dy / d) * fm;
          vz += fm * 0.3;
        }
      }

      vx *= damp;
      vy *= damp;
      vz *= damp;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      pos[i3] += vx * dt;
      pos[i3 + 1] += vy * dt;
      pos[i3 + 2] += vz * dt;

      col[i3] += (cr - col[i3]) * colorK;
      col[i3 + 1] += (cg - col[i3 + 1]) * colorK;
      col[i3 + 2] += (cb - col[i3 + 2]) * colorK;
      alpha[i] += (ta - alpha[i]) * colorK;
      grow[i] += ((forming ? 1 : 0) - grow[i]) * colorK;
    }

    this.dustCount = dustCount;

    const attrs = this.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.aColor.needsUpdate = true;
    attrs.aAlpha.needsUpdate = true;
    attrs.aGrow.needsUpdate = true;
  }
}

function clonePalette(p: Palette): Palette {
  return { bg: [...p.bg], dust: [...p.dust], ink: [...p.ink] };
}
