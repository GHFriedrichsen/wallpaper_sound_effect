// Lê o espectro do Wallpaper Engine e resume em graves, médios, agudos, energia geral e batidas.
// Os valores crus dependem muito do volume do sistema e da música, então passam por um ganho automático:
// cada nível é dividido pelo pico recente, e música baixa reage quase tanto quanto música alta.

export interface AudioLevels {
  /** 0..1, já normalizado */
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  /** 0..1: onde está o "centro" do espectro agora, do mais grave ao mais agudo que esta música já teve */
  tone: number;
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

export function createAudioAnalyzer({ onLevels, onBeat }: AudioHandlers) {
  const peak = { ...FLOOR };
  let avgBass = 0;
  let lastBeat = 0;
  // faixa de centroides desta música: abre na hora e fecha devagar, para o tom se adaptar a cada música
  let toneLo = 0.2;
  let toneHi = 0.3;
  let tone = 0.5;

  const normalize = (key: keyof typeof FLOOR, raw: number) => {
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
    // as 64 faixas vão do grave ao agudo: 0..5 graves, 6..23 médios, 24..63 agudos
    const bass = normalize('bass', band(0, 6));
    const mid = normalize('mid', band(6, 24));
    const treble = normalize('treble', band(24, half));
    const energy = normalize('energy', band(0, half));

    // centroide espectral: média das faixas pesada pelo volume de cada uma
    let sum = 0;
    let weighted = 0;
    for (let i = 0; i < half; i++) {
      const v = Math.min(1, spectrum[i]) + Math.min(1, spectrum[i + half]);
      sum += v;
      weighted += v * i;
    }
    if (sum > 0.05) {
      const c = weighted / sum / half;
      toneLo = Math.min(c, toneLo + (c - toneLo) * 0.002);
      toneHi = Math.max(c, toneHi - (toneHi - c) * 0.002);
      tone = (c - toneLo) / Math.max(0.02, toneHi - toneLo);
    }
    onLevels({ bass, mid, treble, energy, tone });

    // batida = grave acima da média recente
    const now = performance.now();
    if (bass > 0.55 && bass > avgBass * 1.18 && now - lastBeat > 150) {
      lastBeat = now;
      onBeat(Math.min(1, (bass - avgBass) * 3));
    }
    avgBass += (bass - avgBass) * 0.1;
  };
}
