# wallpaper_sound_effect

Wallpaper web para o [Wallpaper Engine](https://www.wallpaperengine.io): relógio, música tocando e clima,
tudo feito de grãos que flutuam e reagem ao áudio. Quando uma música começa (Spotify, YouTube no navegador
ou qualquer player que apareça no controle de mídia do Windows), a capa se forma em grãos e o fundo e a
poeira mudam para as cores dela.

O motor de grãos vem do [portfolio](https://github.com/GHFriedrichsen/portifolio) (`src/lib/particles`),
adaptado para várias formas ao mesmo tempo.

## Rodar

```bash
npm install
npm run dev        # abre no navegador; use ?demo para música e áudio de mentira
npm run build      # gera dist/, que é a pasta do wallpaper
```

## Instalar no Wallpaper Engine

1. `npm run build`
2. No Wallpaper Engine: **Abrir wallpaper → Abrir do arquivo** e escolha `dist/project.json`
   (ou `dist/index.html`).
3. Para a capa e o título aparecerem, a integração de mídia precisa estar ligada nas configurações do
   Wallpaper Engine.

No painel do wallpaper dá para mudar a cidade do clima, °C/°F, relógio 12/24 h, quantidade e tamanho dos
grãos, intensidade da reação ao áudio, brilho, se o mouse empurra os grãos e se o fundo segue a cor da
música (desligado, aparece um seletor para escolher a cor do fundo).

## Estrutura

| Arquivo | O quê |
|---|---|
| `src/layout.ts` | onde cada forma fica na tela e quantos grãos ela usa |
| `src/particles/field.ts` | o campo de grãos (Three.js): física, áudio, paleta |
| `src/particles/sampler.ts` | transforma texto, imagem ou desenho em pontos |
| `src/shapes.ts` | o que cada forma desenha (relógio, título, progresso, clima e ícones) |
| `src/wallpaper/media.ts` | música tocando, via APIs de mídia do Wallpaper Engine |
| `src/wallpaper/audio.ts` | graves, energia e batidas a partir do espectro |
| `src/wallpaper/weather.ts` | clima pela [Open-Meteo](https://open-meteo.com) (sem chave) |
| `src/wallpaper/palette.ts` | cores do wallpaper a partir da capa |
| `public/project.json` | metadados e propriedades do Wallpaper Engine |

O build sai num script clássico (não módulo), com as fontes embutidas: o Wallpaper Engine abre o
`index.html` direto do disco, onde script `type="module"` é bloqueado.

O wallpaper só **lê** o que está tocando; não controla o player.
