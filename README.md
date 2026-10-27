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

## Poeira que deforma com o som (experimental)

Em **No centro → Poeira que deforma com o som**, a capa dá lugar a uma esfera de poeira que mostra a geometria do
som (cimática). A esfera vibra numa onda estacionária (um harmônico esférico): como a areia numa placa de Chladni,
os grãos se juntam nas linhas nodais e desenham a figura, e o resto da superfície sobe e desce formando lobos.

- **tom da música** (do mais grave ao mais agudo que a música já teve): escolhe a figura; mais agudo = mais linhas.
  Quando muda, os grãos migram para o desenho novo.
- **batida forte** depois de uns segundos na mesma figura: troca a variação (gomos, anéis, grade).
- **volume**: amplitude da vibração, com resposta não linear; alto, a vibração fica "quadrada" (harmônicos ímpares).
- **graves**: um pouco de compressão e um balanço de gelatina cuja mola endurece com a amplitude (Duffing).
- **agudos**: os ventres tremem e cintilam; as linhas nodais ficam paradas.
- **batida muito forte**: passa do limite de escoamento e deixa um amassado que só volta devagar.
- **silêncio**: volta para a esfera lisa.

No painel do wallpaper dá para mudar a cidade do clima, °C/°F, relógio 12/24 h, quantidade e tamanho dos
grãos, intensidade da reação ao áudio, brilho e se o mouse empurra os grãos.

## Estrutura

| Arquivo | O quê |
|---|---|
| `src/layout.ts` | onde cada forma fica na tela e quantos grãos ela usa |
| `src/particles/field.ts` | o campo de grãos (Three.js): física, áudio, paleta |
| `src/particles/deform.ts` | o material da esfera de poeira (modo experimental) |
| `src/particles/cymatics.ts` | as figuras da cimática e a escolha da figura pelo tom |
| `src/particles/sampler.ts` | transforma texto, imagem ou desenho em pontos |
| `src/shapes.ts` | o que cada forma desenha (relógio, título, progresso, clima e ícones) |
| `src/wallpaper/media.ts` | música tocando, via APIs de mídia do Wallpaper Engine |
| `src/wallpaper/audio.ts` | graves, médios, agudos, energia, tom e batidas a partir do espectro |
| `src/wallpaper/weather.ts` | clima pela [Open-Meteo](https://open-meteo.com) (sem chave) |
| `src/wallpaper/palette.ts` | cores do wallpaper a partir da capa |
| `public/project.json` | metadados e propriedades do Wallpaper Engine |

O build sai num script clássico (não módulo), com as fontes embutidas: o Wallpaper Engine abre o
`index.html` direto do disco, onde script `type="module"` é bloqueado.

O wallpaper só **lê** o que está tocando; não controla o player.
