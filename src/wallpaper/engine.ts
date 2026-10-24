// APIs que o Wallpaper Engine injeta na página de um wallpaper web.
// https://docs.wallpaperengine.io/en/web/audio/visualizer.html
// https://docs.wallpaperengine.io/en/web/api/media.html

export interface MediaPropertiesEvent {
  title: string;
  artist: string;
  subTitle: string;
  albumTitle: string;
  albumArtist: string;
}

export interface MediaThumbnailEvent {
  /** imagem da capa como data URL */
  thumbnail: string;
  primaryColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  textColor: string;
  highContrastColor: string;
}

export interface MediaPlaybackEvent {
  state: number;
}

export interface MediaTimelineEvent {
  /** segundos */
  position: number;
  duration: number;
}

export interface UserProperty {
  value: string | number | boolean;
}

export interface PropertyListener {
  applyUserProperties?: (props: Record<string, UserProperty>) => void;
  applyGeneralProperties?: (props: { fps?: number }) => void;
  setPaused?: (paused: boolean) => void;
}

declare global {
  interface Window {
    wallpaperPropertyListener?: PropertyListener;
    /** 128 valores: 0..63 canal esquerdo, 64..127 direito, do grave ao agudo */
    wallpaperRegisterAudioListener?: (cb: (audio: number[]) => void) => void;
    wallpaperRegisterMediaStatusListener?: (cb: (e: { enabled: boolean }) => void) => void;
    wallpaperRegisterMediaPropertiesListener?: (cb: (e: MediaPropertiesEvent) => void) => void;
    wallpaperRegisterMediaThumbnailListener?: (cb: (e: MediaThumbnailEvent) => void) => void;
    wallpaperRegisterMediaPlaybackListener?: (cb: (e: MediaPlaybackEvent) => void) => void;
    wallpaperRegisterMediaTimelineListener?: (cb: (e: MediaTimelineEvent) => void) => void;
    wallpaperMediaIntegration?: { PLAYBACK_STOPPED: number; PLAYBACK_PLAYING: number; PLAYBACK_PAUSED: number };
  }
}

export const isWallpaperEngine = () => typeof window.wallpaperRegisterAudioListener === 'function';

export const PLAYBACK = {
  get stopped() {
    return window.wallpaperMediaIntegration?.PLAYBACK_STOPPED ?? 0;
  },
  get playing() {
    return window.wallpaperMediaIntegration?.PLAYBACK_PLAYING ?? 1;
  },
  get paused() {
    return window.wallpaperMediaIntegration?.PLAYBACK_PAUSED ?? 2;
  },
};
