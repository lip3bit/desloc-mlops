/**
 * Rota viária via servidor público de demonstração do OSRM.
 * Usada apenas para desenhar o trajeto no mapa; o preço vem do backend.
 */
import type { Ponto, Rota } from '../types';

const BASE = 'https://router.project-osrm.org/route/v1/driving';

interface OsrmResposta {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: { type: 'LineString'; coordinates: [number, number][] };
  }[];
}

const cache = new Map<string, Rota>();

export async function buscarRota(origem: Ponto, destino: Ponto, signal?: AbortSignal): Promise<Rota> {
  const chave = [origem.lon, origem.lat, destino.lon, destino.lat].map((n) => n.toFixed(5)).join(',');
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  const url = `${BASE}/${origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=full&geometries=geojson`;
  const resp = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`OSRM respondeu HTTP ${resp.status}`);
  const dados = (await resp.json()) as OsrmResposta;
  const rota = dados.routes?.[0];
  if (dados.code !== 'Ok' || !rota || rota.geometry.coordinates.length < 2) {
    throw new Error(`OSRM sem rota (${dados.code})`);
  }

  const resultado: Rota = {
    fonte: 'osrm',
    // GeoJSON usa [lon, lat]; o Leaflet espera [lat, lon].
    coordenadas: rota.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
    distanciaKm: rota.distance / 1000,
    duracaoMin: rota.duration / 60,
  };
  cache.set(chave, resultado);
  return resultado;
}

/** Fallback: linha reta entre os pontos (desenhada tracejada). */
export function rotaEmLinhaReta(origem: Ponto, destino: Ponto): Rota {
  return {
    fonte: 'reta',
    coordenadas: [
      [origem.lat, origem.lon],
      [destino.lat, destino.lon],
    ],
  };
}
