// O que cada forma desenha antes de virar grãos.
import { fonts } from './fonts';
import { restPattern, type Pattern } from './particles/cymatics';
import type { ShapeSource, TextLine } from './particles/sampler';
import type { Track } from './wallpaper/media';
import type { Sky, Weather } from './wallpaper/weather';

export function clockShape(text: string): ShapeSource {
  return { kind: 'text', key: `clock:${text}`, lines: [{ text, size: 1, weight: 700, font: fonts.display }] };
}

export function titleShape(track: Track, maxAspect: number): ShapeSource {
  const lines: TextLine[] = [{ text: track.title, size: 1, weight: 700, font: fonts.display }];
  if (track.artist) lines.push({ text: track.artist, size: 0.72, weight: 600, font: fonts.body, alpha: 0.62 });
  return { kind: 'text', key: `title:${track.title}|${track.artist}`, lines, maxAspect };
}

export function coverShape(url: string): ShapeSource {
  // a data URL inteira seria uma chave enorme: o tamanho e o final já distinguem uma capa da outra
  return { kind: 'image', key: `cover:${url.length}:${url.slice(-48)}`, url, radius: 0.1 };
}

/** Esfera de poeira que se deforma com o som (modo material), desenhando a figura do padrão. */
export function materialShape(pattern: Pattern = restPattern): ShapeSource {
  const { l, m, rx, ry } = pattern;
  return { kind: 'sphere', key: `material:${l}:${m}:${rx.toFixed(3)}:${ry.toFixed(3)}`, pattern };
}

export function progressShape(aspect: number): ShapeSource {
  return {
    kind: 'draw',
    key: `progress:${aspect.toFixed(2)}`,
    aspect,
    draw(ctx, w, h) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, h / 2);
      ctx.fill();
    },
  };
}

const measure = document.createElement('canvas').getContext('2d')!;

export function weatherShape(w: Weather): ShapeSource {
  // ícone à esquerda; temperatura grande e "cidade · condição" pequeno à direita
  const H = 200;
  const temp = `${w.temp}°`;
  const info = `${w.place} · ${w.label}`;
  const tempFont = `700 ${H * 0.58}px ${fonts.display}`;
  const infoFont = `600 ${H * 0.26}px ${fonts.body}`;
  measure.font = tempFont;
  const tempW = measure.measureText(temp).width;
  measure.font = infoFont;
  const infoW = measure.measureText(info).width;
  const gap = H * 0.14;
  const width = H + gap + Math.max(tempW, infoW) + H * 0.04;

  return {
    kind: 'draw',
    key: `weather:${temp}|${info}|${w.sky}|${w.isDay}`,
    aspect: width / H,
    draw(ctx, _w, h) {
      const k = h / H;
      ctx.scale(k, k);
      drawSky(ctx, w.sky, w.isDay, 0, 0, H);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      ctx.font = tempFont;
      ctx.fillText(temp, H + gap, H * 0.56);
      ctx.fillStyle = 'rgb(185 185 185)';
      ctx.font = infoFont;
      ctx.fillText(info, H + gap, H * 0.94);
    },
  };
}

// ---------- ícones do clima, desenhados num quadrado de lado s ----------

function drawSky(ctx: CanvasRenderingContext2D, sky: Sky, day: boolean, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  const celestial = (cx: number, cy: number, r: number, shade = 255) => {
    ctx.fillStyle = ctx.strokeStyle = `rgb(${shade} ${shade} ${shade})`;
    if (day) sun(ctx, cx, cy, r);
    else moon(ctx, cx, cy, r);
    ctx.fillStyle = ctx.strokeStyle = '#fff';
  };

  switch (sky) {
    case 'clear':
      celestial(s * 0.5, s * 0.5, s * 0.2);
      break;
    case 'partly':
      celestial(s * 0.36, s * 0.36, s * 0.15, 190);
      cloud(ctx, s * 0.56, s * 0.6, s * 0.8, true);
      break;
    case 'cloudy':
      cloud(ctx, s * 0.5, s * 0.55, s);
      break;
    case 'fog':
      ctx.lineWidth = s * 0.065;
      for (let i = 0; i < 4; i++) {
        const yy = s * (0.3 + i * 0.14);
        const inset = i % 2 ? 0.2 : 0.12;
        line(ctx, s * inset, yy, s * (1 - inset), yy);
      }
      break;
    case 'drizzle':
    case 'rain':
    case 'storm':
    case 'snow': {
      cloud(ctx, s * 0.5, s * 0.4, s * 0.92);
      ctx.lineWidth = s * 0.05;
      const xs = [0.32, 0.5, 0.68];
      if (sky === 'storm') {
        ctx.beginPath();
        ctx.moveTo(s * 0.54, s * 0.6);
        ctx.lineTo(s * 0.4, s * 0.8);
        ctx.lineTo(s * 0.51, s * 0.8);
        ctx.lineTo(s * 0.44, s * 0.97);
        ctx.lineTo(s * 0.64, s * 0.74);
        ctx.lineTo(s * 0.53, s * 0.74);
        ctx.lineTo(s * 0.6, s * 0.6);
        ctx.closePath();
        ctx.fill();
      } else if (sky === 'rain') {
        for (const px of xs) line(ctx, s * px, s * 0.66, s * (px - 0.06), s * 0.88);
      } else {
        const r = s * (sky === 'snow' ? 0.045 : 0.03);
        for (const [px, py] of [[0.32, 0.7], [0.5, 0.78], [0.68, 0.7], [0.41, 0.9], [0.59, 0.9]]) {
          ctx.beginPath();
          ctx.arc(s * px, s * py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
  ctx.restore();
}

function sun(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    line(ctx, cx + Math.cos(a) * r * 1.45, cy + Math.sin(a) * r * 1.45, cx + Math.cos(a) * r * 1.95, cy + Math.sin(a) * r * 1.95);
  }
}

function moon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx + r * 0.65, cy - r * 0.45, r * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** nuvem centrada em (cx, cy) com largura ~w; `cutout` abre um contorno vazio em volta (para ficar na frente do sol) */
function cloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, cutout = false) {
  const u = w / 2;
  const blob = (grow: number) => {
    for (const [dx, dy, r] of [[-0.42, 0.08, 0.3], [-0.05, -0.12, 0.4], [0.4, 0.1, 0.28]]) {
      ctx.beginPath();
      ctx.arc(cx + u * dx, cy + u * dy, u * r + grow, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(cx - u * 0.72 - grow, cy + u * 0.08 - grow, u * 1.44 + grow * 2, u * 0.32 + grow * 2, u * 0.16 + grow);
    ctx.fill();
  };
  if (cutout) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    blob(w * 0.05);
    ctx.restore();
  }
  blob(0);
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
