// Lê o espectro do Wallpaper Engine e resume em graves, médios, agudos, energia geral, notas e batidas.
// Os valores crus dependem muito do volume do sistema e da música, então passam por um ganho automático:
// cada nível é dividido pelo pico recente, e música baixa reage quase tanto quanto música alta.

import type { Note } from '../particles/cymatics';

export interface AudioLevels {
  /** 0..1, já normalizado */
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  /**
   * Notas que se destacam agora (até 3, da mais forte para a mais fraca). Com 64 faixas não dá para separar
   * semitons: é a faixa do espectro onde há um pico, não o nome da nota.
   */
  notes: Note[];
}

export interface AudioHandlers {
  onLevels: (levels: AudioLevels) => void;
  /** batida detectada nos graves; strength ~0..1 */
  onBeat: (strength: number) => void;
}

/** abaixo disso é silêncio: não amplifica ruído */
const FLOOR = { bass: 0.04, mid: 0.02, treble: 0.01, energy: 0.015 };
/** quanto o pico cai por chamada (~30 por segundo): ~4 s para cair pela metade */
const PEAK_DECAY = 0.995;
/** destaque mínimo de um pico para contar como nota */
const NOTE_FLOOR = 0.01;

export function createAudioAnalyzer({ onLevels, onBeat }: AudioHandlers) {
  const peak = { ...FLOOR };
  let avgBass = 0;
  let lastBeat = 0;
  let notePeak = NOTE_FLOOR;
  const mono = new Float32Array(64);

  const normalize = (key: keyof typeof FLOOR, raw: number) => {
    peak[key] = Math.max(raw, peak[key] * PEAK_DECAY, FLOOR[key]);
    // raiz: realça os níveis médios, que é onde a maior parte da música fica
    return Math.sqrt(Math.min(1, raw / peak[key]));
  };

  /**
   * Nota = pico no espectro: uma faixa mais alta que as vizinhas. O destaque é a altura acima do vale mais alto
   * dos dois lados (até 3 faixas), então a inclinação geral do espectro (grave sempre mais alto) não conta.
   */
  const findNotes = (): Note[] => {
    const n = mono.length;
    const found: Note[] = [];
    let best = 0;
    for (let i = 1; i < n - 1; i++) {
      const v = mono[i];
      if (v <= mono[i - 1] || v < mono[i + 1]) continue;
      let left = v;
      let right = v;
      for (let k = 1; k <= 3; k++) {
        left = Math.min(left, mono[Math.max(0, i - k)]);
        right = Math.min(right, mono[Math.min(n - 1, i + k)]);
      }
      const prominence = v - Math.max(left, right);
      if (prominence < NOTE_FLOOR) continue;
      // interpolação parabólica: a nota pode cair entre duas faixas
      const a = mono[i - 1];
      const c = mono[i + 1];
      const d = a - 2 * v + c;
      found.push({ pos: i + (d < 0 ? (0.5 * (a - c)) / d : 0), strength: prominence });
      best = Math.max(best, prominence);
    }
    notePeak = Math.max(best, notePeak * PEAK_DECAY, NOTE_FLOOR);
    return found
      .filter((f) => f.strength > best * 0.3)
      .sort((x, y) => y.strength - x.strength)
      .slice(0, 3)
      .map((f) => ({ pos: f.pos, strength: Math.sqrt(Math.min(1, f.strength / notePeak)) }));
  };

  return (spectrum: ArrayLike<number>) => {
    const half = spectrum.length / 2;
    for (let i = 0; i < half && i < mono.length; i++) mono[i] = (Math.min(1, spectrum[i]) + Math.min(1, spectrum[i + half])) / 2;
    const band = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += Math.min(1, spectrum[i]) + Math.min(1, spectrum[i + half]);
      return sum / ((to - from) * 2);
    };
    // as 64 faixas vão do grave ao agudo: 0..5 graves, 6..23 médios, 24..63 agudos
    const bass = normalize('bass', band(0, 6));
    const mid = normalize('mid', band(6, 24));
    const treble = normalize('treble', band(24, half));
    const energy = normalize('energy', band(0, half));

    onLevels({ bass, mid, treble, energy, notes: findNotes() });

    // batida = grave acima da média recente
    const now = performance.now();
    if (bass > 0.55 && bass > avgBass * 1.18 && now - lastBeat > 150) {
      lastBeat = now;
      onBeat(Math.min(1, (bass - avgBass) * 3));
    }
    avgBass += (bass - avgBass) * 0.1;
  };
}
