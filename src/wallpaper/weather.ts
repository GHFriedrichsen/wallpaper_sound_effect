// Clima atual pela Open-Meteo (https://open-meteo.com): gratuita, sem chave e com CORS liberado,
// então funciona de dentro do Wallpaper Engine. A cidade vem das propriedades do wallpaper.

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export interface Weather {
  temp: number;
  unit: 'C' | 'F';
  sky: Sky;
  isDay: boolean;
  label: string;
  place: string;
}

interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

const REFRESH = 15 * 60_000; // a Open-Meteo atualiza o "current" a cada 15 min
const RETRY = 2 * 60_000;

export class WeatherService {
  private city = '';
  private unit: 'C' | 'F' = 'C';
  private place: Place | null = null;
  private timer = 0;

  constructor(private onChange: (w: Weather | null) => void) {}

  configure(city: string, unit: 'C' | 'F') {
    city = city.trim();
    if (city === this.city && unit === this.unit) return;
    if (city !== this.city) this.place = null;
    this.city = city;
    this.unit = unit;
    this.refresh();
  }

  private async refresh() {
    clearTimeout(this.timer);
    if (!this.city) return this.onChange(null);
    try {
      this.place ??= await geocode(this.city);
      if (!this.place) {
        console.warn('cidade não encontrada:', this.city);
        return this.onChange(null);
      }
      this.onChange(await current(this.place, this.unit));
      this.timer = window.setTimeout(() => this.refresh(), REFRESH);
    } catch (err) {
      console.warn('clima indisponível', err);
      this.timer = window.setTimeout(() => this.refresh(), RETRY);
    }
  }
}

async function geocode(city: string): Promise<Place | null> {
  const cacheKey = `geo:${city.toLowerCase()}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // sem localStorage: só busca de novo
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const hit = (await res.json()).results?.[0];
  if (!hit) return null;
  const place: Place = { name: hit.name, latitude: hit.latitude, longitude: hit.longitude };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(place));
  } catch {
    // tudo bem não guardar
  }
  return place;
}

async function current(place: Place, unit: 'C' | 'F'): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'auto',
  });
  if (unit === 'F') params.set('temperature_unit', 'fahrenheit');
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  const c = (await res.json()).current;
  const [sky, label] = describe(c.weather_code);
  return { temp: Math.round(c.temperature_2m), unit, sky, isDay: c.is_day === 1, label, place: place.name };
}

/** Códigos WMO usados pela Open-Meteo. */
function describe(code: number): [Sky, string] {
  if (code === 0) return ['clear', 'Céu limpo'];
  if (code === 1) return ['clear', 'Poucas nuvens'];
  if (code === 2) return ['partly', 'Parcialmente nublado'];
  if (code === 3) return ['cloudy', 'Nublado'];
  if (code === 45 || code === 48) return ['fog', 'Neblina'];
  if (code >= 51 && code <= 57) return ['drizzle', 'Garoa'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['rain', 'Chuva'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Neve'];
  if (code >= 95) return ['storm', 'Tempestade'];
  return ['cloudy', 'Nublado'];
}
