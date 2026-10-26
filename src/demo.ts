// Fora do Wallpaper Engine (abrindo com ?demo no navegador): música, capa e áudio de mentira,
// para ver o wallpaper funcionando sem instalar nada.
import type { MediaHandlers } from './wallpaper/media';

const tracks = [
  { title: 'Grãos de Luz', artist: 'GHF', colors: ['#ff4d6d', '#5b2a86', '#ffd166'] },
  { title: 'Maré Noturna', artist: 'Orquestra do Desktop', colors: ['#06d6a0', '#118ab2', '#073b4c'] },
  { title: 'Poeira Dourada', artist: 'Partículas', colors: ['#f4a261', '#e76f51', '#264653'] },
];

function fakeCover([a, b, c]: string[]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 300;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 300, 300);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 300, 300);
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(190, 120, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
  ctx.fillRect(40, 220, 220, 18);
  return canvas.toDataURL('image/png');
}

export function startDemo(media: MediaHandlers, onSpectrum: (spectrum: number[]) => void) {
  const DURATION = 40;
  let index = 0;
  let started = performance.now();

  const play = () => {
    const t = tracks[index % tracks.length];
    media.onTrack({ title: t.title, artist: t.artist });
    media.onCover({ url: fakeCover(t.colors), colors: null });
    media.onPlaying(true);
    started = performance.now();
    media.onTimeline(0, DURATION);
  };
  play();
  setInterval(() => {
    index++;
    play();
  }, DURATION * 1000);

  // 120 bpm: graves batendo a cada 0,5 s, médios oscilando e chimbal nos agudos a cada 0,25 s;
  // a cada 8 s um trecho mais forte (refrão), para ver o material passar do limite
  const spectrum = new Array<number>(128).fill(0);
  setInterval(() => {
    const t = (performance.now() - started) / 1000;
    const loud = t % 8 > 6 ? 1 : 0.55;
    const kick = Math.exp(-((t % 0.5) * 9)) * loud;
    const hat = Math.exp(-((t % 0.25) * 30)) * loud;
    for (let i = 0; i < 64; i++) {
      const v =
        i < 6 ? kick * 0.9 : i < 24 ? 0.35 * loud * Math.abs(Math.sin(t * 2 + i * 0.4)) : 0.05 + hat * 0.3 * (1 - i / 90);
      spectrum[i] = spectrum[i + 64] = v;
    }
    onSpectrum(spectrum);
  }, 33);
}
