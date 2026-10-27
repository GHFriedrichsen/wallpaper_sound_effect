import './styles.css';
import { startDemo } from './demo';
import { loadFonts } from './fonts';
import { layout, progressAspect, titleMaxAspect } from './layout';
import { defaultPalette, ParticleField } from './particles/field';
import { clockShape, coverShape, materialShape, progressShape, titleShape, weatherShape } from './shapes';
import { createAudioAnalyzer } from './wallpaper/audio';
import { isWallpaperEngine } from './wallpaper/engine';
import { connectMedia, type MediaHandlers, type Track } from './wallpaper/media';
import { extractColors, paletteFrom } from './wallpaper/palette';
import { WeatherService } from './wallpaper/weather';

const settings = {
  city: 'São Paulo',
  unit: 'C' as 'C' | 'F',
  clock24: true,
  /** o que fica no meio da tela: a capa em grãos ou a esfera de poeira que deforma com o som */
  center: 'material' as 'material' | 'cover',
};
/** fontes carregadas: antes disso o texto viraria grãos na fonte errada */
let ready = false;

const field = new ParticleField(document.querySelector<HTMLCanvasElement>('#field')!, layout);
const weather = new WeatherService((w) => field.setShape('weather', w ? weatherShape(w) : null));

// o Wallpaper Engine chama isto logo ao carregar (com todas as propriedades) e depois a cada mudança no painel
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    if (p.center) {
      settings.center = p.center.value === 'cover' ? 'cover' : 'material';
      updateCenter();
    }
    if (p.city) settings.city = String(p.city.value);
    if (p.units) settings.unit = p.units.value === 'fahrenheit' ? 'F' : 'C';
    if (p.clock24) {
      settings.clock24 = Boolean(p.clock24.value);
      updateClock();
    }
    if (p.grains) field.update({ count: Number(p.grains.value) });
    if (p.grainsize) field.update({ size: Number(p.grainsize.value) / 10 });
    if (p.audioreact) field.update({ audio: Number(p.audioreact.value) / 100 });
    if (p.glow) field.update({ glow: Boolean(p.glow.value) });
    // 0 desliga; 100% é a força de antes
    if (p.mouseforce) field.update({ mouseForce: (Number(p.mouseforce.value) / 100) * 70 });
    if (p.mouseradius) field.update({ mouseRadius: Number(p.mouseradius.value) / 100 });
    if (ready) weather.configure(settings.city, settings.unit);
  },
  applyGeneralProperties(p) {
    if (p.fps) field.update({ fps: p.fps });
  },
};

// ---------- relógio ----------

let clockText = '';
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  if (!settings.clock24) h = h % 12 || 12;
  const text = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (!ready || text === clockText) return;
  // a primeira vez os grãos vêm da poeira; depois só andam até os números novos
  field.setShape('clock', clockShape(text), clockText !== '');
  clockText = text;
}

// ---------- música ----------

let track: Track | null = null;
let playing = false;
let timeline = { position: 0, duration: 0, at: 0 };
let coverToken = 0;
let coverUrl: string | null = null;

function updateCenter() {
  const material = settings.center === 'material';
  field.setShape('material', material ? materialShape : null);
  field.setShape('cover', !material && coverUrl ? coverShape(coverUrl) : null);
}

const media: MediaHandlers = {
  onTrack(t) {
    track = t;
    field.setShape('title', t ? titleShape(t, titleMaxAspect) : null);
    if (!t) field.setShape('progress', null);
  },
  async onCover(cover) {
    const token = ++coverToken;
    coverUrl = cover?.url ?? null;
    updateCenter();
    if (!cover) {
      field.setPalette(defaultPalette);
      return;
    }
    try {
      const [primary, secondary] = cover.colors ?? (await extractColors(cover.url));
      if (token === coverToken) field.setPalette(paletteFrom(primary, secondary));
    } catch {
      // capa que não decodifica: fica a paleta anterior
    }
  },
  onPlaying(p) {
    playing = p;
    // pausado: capa e título apagam um pouco
    field.setDim('cover', p ? 1 : 0.4);
    field.setDim('title', p ? 1 : 0.55);
  },
  onTimeline(position, duration) {
    timeline = { position, duration, at: performance.now() };
    field.setShape('progress', track && duration > 0 ? progressShape(progressAspect) : null);
  },
};

// o Wallpaper Engine só avisa a posição quando ela muda de verdade (seek, troca de faixa): o resto é contado aqui
setInterval(() => {
  const { position, duration, at } = timeline;
  if (duration <= 0) return;
  const elapsed = playing ? (performance.now() - at) / 1000 : 0;
  field.setReveal('progress', (position + elapsed) / duration);
}, 250);

// ---------- início ----------

const analyze = createAudioAnalyzer({
  onLevels: ({ bass, mid, treble, energy, notes }) => {
    field.setAudio(bass, energy, mid, treble);
    field.setNotes(notes);
  },
  onBeat: (strength) => (settings.center === 'material' ? field.kick('material', strength) : field.kick('cover', 0.8 + strength * 1.6)),
});

updateCenter();

loadFonts().then(() => {
  ready = true;
  updateClock();
  setInterval(updateClock, 1000);
  weather.configure(settings.city, settings.unit);

  if (isWallpaperEngine()) {
    window.wallpaperRegisterAudioListener!(analyze);
    connectMedia(media);
  } else if (new URLSearchParams(location.search).has('demo')) {
    startDemo(media, analyze);
  }
});
