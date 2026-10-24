// Fontes do portfolio, embutidas no bundle (só o subconjunto latino, que já cobre acentos).
// Carregadas via FontFace para garantir que estejam prontas antes de virar grãos no canvas.
import spaceGrotesk from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?inline';
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';

export const fonts = {
  display: "'Space Grotesk Variable', system-ui, sans-serif",
  body: "'Inter Variable', system-ui, sans-serif",
};

export async function loadFonts() {
  const faces = [
    new FontFace('Space Grotesk Variable', `url(${spaceGrotesk})`, { weight: '300 700' }),
    new FontFace('Inter Variable', `url(${inter})`, { weight: '100 900' }),
  ];
  await Promise.all(
    faces.map(async (face) => {
      try {
        document.fonts.add(await face.load());
      } catch {
        // sem a fonte o canvas usa a do sistema: feio, mas funciona
      }
    }),
  );
}
