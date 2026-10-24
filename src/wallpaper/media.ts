// Música tocando no Windows (Spotify, YouTube no navegador etc.), pelas APIs de mídia do Wallpaper Engine.
// O wallpaper só lê: não dá para dar play/pause por aqui.
import { PLAYBACK } from './engine';
import { parseColor } from './palette';
import type { RGB } from '../particles/field';

export interface Track {
  title: string;
  artist: string;
}

export interface Cover {
  url: string;
  /** cores principais da capa calculadas pelo Wallpaper Engine (null: calcular aqui) */
  colors: [RGB, RGB] | null;
}

export interface MediaHandlers {
  onTrack: (track: Track | null) => void;
  onCover: (cover: Cover | null) => void;
  onPlaying: (playing: boolean) => void;
  onTimeline: (position: number, duration: number) => void;
}

export function connectMedia(h: MediaHandlers) {
  window.wallpaperRegisterMediaStatusListener?.((e) => {
    if (!e.enabled) {
      h.onTrack(null);
      h.onCover(null);
    }
  });

  window.wallpaperRegisterMediaPropertiesListener?.((e) => {
    const title = e.title?.trim();
    h.onTrack(title ? { title, artist: (e.artist || e.albumArtist || e.subTitle || '').trim() } : null);
  });

  window.wallpaperRegisterMediaThumbnailListener?.((e) => {
    if (!e.thumbnail) return h.onCover(null);
    const primary = parseColor(e.primaryColor);
    const secondary = parseColor(e.secondaryColor) ?? parseColor(e.tertiaryColor);
    h.onCover({ url: e.thumbnail, colors: primary && secondary ? [primary, secondary] : null });
  });

  window.wallpaperRegisterMediaPlaybackListener?.((e) => {
    h.onPlaying(e.state === PLAYBACK.playing);
    if (e.state === PLAYBACK.stopped) {
      h.onTrack(null);
      h.onCover(null);
    }
  });

  window.wallpaperRegisterMediaTimelineListener?.((e) => h.onTimeline(e.position, e.duration));
}
