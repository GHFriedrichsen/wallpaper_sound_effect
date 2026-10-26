// Posição de cada forma na tela, tirada do desenho no Excalidraw:
// relógio em cima no centro, capa no meio, título e progresso logo abaixo, clima no canto inferior esquerdo.
// No modo material, a esfera de poeira toma o lugar da capa.
// x/y em fração da tela (y para baixo); height em fração da altura da tela; share = parte dos grãos.
import type { SlotOptions } from './particles/field';

const text = {
  depth: 0,
  swing: 0,
  swingSpeed: 0,
  color: 'ink',
  alpha: 0.95,
  react: 0,
  grain: 0.6,
  glow: true,
  outline: 0.3,
} as const;

export const layout = {
  clock: { ...text, x: 0.5, y: 0.19, height: 0.15, align: 'center', share: 0.14, depth: 0.06, swing: 5, swingSpeed: 0.35, react: 0.3 },
  // capa sem glow: grãos somando brilho lavam as cores e borram os detalhes
  cover: { x: 0.5, y: 0.555, height: 0.42, align: 'center', share: 0.44, depth: 0.05, swing: 9, swingSpeed: 0.3, color: 'source', alpha: 0.95, react: 1, grain: 1, glow: false, outline: 0 },
  // esfera de poeira: quem mexe nela é o material (deform.ts), não o react
  material: { x: 0.5, y: 0.53, height: 0.36, align: 'center', share: 0.44, depth: 1, swing: 0, swingSpeed: 0, spin: 0.12, color: 'dust', alpha: 0.5, react: 0, grain: 0.7, glow: true, outline: 0, material: true },
  title: { ...text, x: 0.5, y: 0.83, height: 0.075, align: 'center', share: 0.12 },
  progress: { ...text, x: 0.5, y: 0.9, height: 0.016, align: 'center', share: 0.05, alpha: 1, grain: 0.7, outline: 0 },
  weather: { ...text, x: 0.035, y: 0.87, height: 0.11, align: 'left', share: 0.09 },
} satisfies Record<string, SlotOptions>;

/** a barra de progresso tem a largura da capa */
export const progressAspect = layout.cover.height / layout.progress.height;
/** o título pode passar um pouco da largura da capa */
export const titleMaxAspect = (layout.cover.height * 1.5) / layout.title.height;
