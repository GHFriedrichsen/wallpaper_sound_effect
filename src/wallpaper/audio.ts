// Lê o espectro do Wallpaper Engine e resume em graves, energia geral e batidas.

export interface AudioLevels {
  bass: number;
  energy: number;
}

export interface AudioHandlers {
  onLevels: (levels: AudioLevels) => void;
  /** batida detectada nos graves; strength ~0..1 */
  onBeat: (strength: number) => void;
}

export function createAudioAnalyzer({ onLevels, onBeat }: AudioHandlers) {
  let avgBass = 0;
  let lastBeat = 0;

  return (spectrum: ArrayLike<number>) => {
    const half = spectrum.length / 2;
    const band = (from: number, to: number) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += Math.min(1, spectrum[i]) + Math.min(1, spectrum[i + half]);
      return sum / ((to - from) * 2);
    };
    const bass = band(0, 6);
    const energy = band(0, half);
    onLevels({ bass, energy });

    // batida = grave bem acima da média recente
    const now = performance.now();
    if (bass > 0.22 && bass > avgBass * 1.4 && now - lastBeat > 180) {
      lastBeat = now;
      onBeat(Math.min(1, (bass - avgBass) * 2.5));
    }
    avgBass += (bass - avgBass) * 0.08;
  };
}
