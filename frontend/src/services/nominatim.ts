/**
 * Cliente da API pública do Nominatim (OpenStreetMap).
 *
 * Política de uso (https://operations.osmfoundation.org/policies/nominatim/):
 * no máximo 1 requisição por segundo, sem autocompletar a cada tecla,
 * com atribuição ao OSM e cache de resultados. Este módulo aplica:
 *  - fila global com intervalo mínimo de 1,1 s entre requisições;
 *  - cache em memória para buscas e geocodificação reversa;
 *  - cancelamento via AbortSignal (o debounce fica no hook de busca).
 */
import type { Ponto, Sugestao } from '../types';
import { LIMITES_GRANDE_SP, esperar, formatarCoordenadas } from './geo';

const BASE = 'https://nominatim.openstreetmap.org';
const INTERVALO_MINIMO_MS = 1100;

let proximaJanela = 0;

/** Garante o intervalo mínimo entre chamadas ao Nominatim. */
async function aguardarVez(signal?: AbortSignal): Promise<void> {
  const agora = Date.now();
  const inicio = Math.max(agora, proximaJanela);
  proximaJanela = inicio + INTERVALO_MINIMO_MS;
  if (inicio > agora) await esperar(inicio - agora, signal);
}

interface NominatimEndereco {
  road?: string;
  pedestrian?: string;
  house_number?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  city?: string;
  town?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
}

interface NominatimItem {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimEndereco;
}

const cacheBusca = new Map<string, Sugestao[]>();
const cacheReverso = new Map<string, { rotulo: string; descricao: string }>();

function montarRotulo(item: NominatimItem): { rotulo: string; descricao: string } {
  const a = item.address ?? {};
  const via = a.road ?? a.pedestrian;
  const viaComNumero = via ? (a.house_number ? `${via}, ${a.house_number}` : via) : undefined;
  const bairro = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district;
  const cidade = a.city ?? a.town ?? a.municipality;

  const principal = item.name?.trim() || viaComNumero || item.display_name.split(',')[0].trim();
  const complemento = [principal === viaComNumero ? undefined : viaComNumero, bairro, cidade]
    .filter((p): p is string => Boolean(p) && p !== principal)
    .join(' · ');

  return {
    rotulo: principal,
    descricao: complemento || item.display_name,
  };
}

async function chamar<T>(url: URL, signal?: AbortSignal): Promise<T> {
  await aguardarVez(signal);
  const resp = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Nominatim respondeu HTTP ${resp.status}`);
  return (await resp.json()) as T;
}

export async function buscarEnderecos(consulta: string, signal?: AbortSignal): Promise<Sugestao[]> {
  const chave = consulta.trim().toLowerCase();
  const emCache = cacheBusca.get(chave);
  if (emCache) return emCache;

  const l = LIMITES_GRANDE_SP;
  const url = new URL(`${BASE}/search`);
  url.search = new URLSearchParams({
    q: consulta.trim(),
    format: 'jsonv2',
    addressdetails: '1',
    countrycodes: 'br',
    viewbox: `${l.oeste},${l.norte},${l.leste},${l.sul}`,
    bounded: '1',
    limit: '5',
    'accept-language': 'pt-BR',
  }).toString();

  const itens = await chamar<NominatimItem[]>(url, signal);
  const vistos = new Set<string>();
  const sugestoes = itens
    .map<Sugestao>((item) => ({
      id: String(item.place_id),
      ponto: { lat: Number(item.lat), lon: Number(item.lon) },
      ...montarRotulo(item),
    }))
    // Vias longas aparecem em vários trechos com o mesmo texto; mantém só o primeiro.
    .filter((s) => {
      const chaveTexto = `${s.rotulo}|${s.descricao}`;
      if (vistos.has(chaveTexto)) return false;
      vistos.add(chaveTexto);
      return true;
    });
  cacheBusca.set(chave, sugestoes);
  return sugestoes;
}

export async function geocodificarReverso(
  ponto: Ponto,
  signal?: AbortSignal,
): Promise<{ rotulo: string; descricao: string }> {
  const chave = `${ponto.lat.toFixed(5)},${ponto.lon.toFixed(5)}`;
  const emCache = cacheReverso.get(chave);
  if (emCache) return emCache;

  const url = new URL(`${BASE}/reverse`);
  url.search = new URLSearchParams({
    lat: String(ponto.lat),
    lon: String(ponto.lon),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '18',
    'accept-language': 'pt-BR',
  }).toString();

  const item = await chamar<NominatimItem & { error?: string }>(url, signal);
  const resultado =
    item && !item.error && item.display_name
      ? montarRotulo(item)
      : { rotulo: 'Ponto no mapa', descricao: formatarCoordenadas(ponto) };
  cacheReverso.set(chave, resultado);
  return resultado;
}
