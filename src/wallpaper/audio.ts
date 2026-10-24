// Lê o espectro do Wallpaper Engine e resume em graves, energia geral e batidas.
// Os valores crus dependem muito do volume do sistema e da música, então passam por um ganho automático:
// cada nível é dividido pelo pico recente, e música baixa reage quase tanto quanto música alta.

export interface AudioLevels {
  /** 0..1, já normalizado */
  bass: number;
  energy: number;
}

export interface AudioHandlers {
  onLevels: (levels: AudioLevels) => void;
  /** batida detectada nos graves; strength ~0..1 */
  onBeat: (strength: number) => void;
}

/** abaixo disso é silêncio: não amplifica ruído */
const FLOOR = { bass: 0.04, energy: 0.015 };
/** quanto o pico cai por chamada (~30 por segundo): ~4 s para cair pela metade */
const PEAK_DECAY = 0.995;

export function createAudioAnalyzer({ onLevels, onBeat }: AudioHandlers) {
  const peak = { bass: FLOOR.bass, energy: FLOOR.energy };
  let avgBass = 0;
  let lastBeat = 0;

  const normalize = (key: 'bass' | 'energy', raw: number) => {
    peak[key] = Math.max(raw, peak[key] * PEAK_DECAY, FLOOR[key]);
    // raiz: realça os níveis médios, que é onde a maior parte da música fica
    return Math.sqrt(Math.min(1, raw / peak[key]));
  };

  return (spectrum: ArrayLike<number>) => {
    const half = spectrum.length / 2;
    const band = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += Math.min(1, spectrum[i]) + Math.min(1, spectrum[i + half]);
      return sum / ((to - from) * 2);
    };
    const bass = normalize('bass', band(0, 6));
    const energy = normalize('energy', band(0, half));
    onLevels({ bass, energy });

    // batida = grave acima da média recente
    const now = performance.now();
    if (bass > 0.55 && bass > avgBass * 1.18 && now - lastBeat > 150) {
      lastBeat = now;
      onBeat(Math.min(1, (bass - avgBass) * 3));
    }
    avgBass += (bass - avgBass) * 0.1;
  };
}
