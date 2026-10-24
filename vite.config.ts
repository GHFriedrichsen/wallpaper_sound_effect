import { defineConfig, type Plugin } from 'vite';

// O Wallpaper Engine abre o index.html direto do disco (file://). Script com type="module" vindo
// do disco é bloqueado por CORS no Chromium, então o build sai num script clássico (IIFE).
const classicScript = (): Plugin => ({
  name: 'classic-script',
  apply: 'build',
  transformIndexHtml: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer'),
});

export default defineConfig({
  base: './',
  plugins: [classicScript()],
  build: {
    target: 'es2022',
    modulePreload: false,
    // fontes viram data URL (ver src/fonts.ts): nada de requisição extra no file://
    assetsInlineLimit: 200_000,
    // o wallpaper é um arquivo só de propósito (three.js incluso)
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: { format: 'iife' },
    },
  },
});
