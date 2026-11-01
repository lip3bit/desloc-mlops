import type { Ponto } from '../types';

/** Centro de São Paulo (Praça da Sé). */
export const CENTRO_SP: [number, number] = [-23.5505, -46.6333];
export const ZOOM_INICIAL = 13;

/** Caixa aproximada da Grande São Paulo. */
export const LIMITES_GRANDE_SP = {
  oeste: -47.2,
  leste: -46.1,
  norte: -23.15,
  sul: -24.1,
} as const;

export function dentroDaGrandeSP({ lat, lon }: Ponto): boolean {
  const l = LIMITES_GRANDE_SP;
  return lat <= l.norte && lat >= l.sul && lon >= l.oeste && lon <= l.leste;
}

export function mesmoPonto(a: Ponto, b: Ponto, toleranciaGraus = 1e-5): boolean {
  return Math.abs(a.lat - b.lat) < toleranciaGraus && Math.abs(a.lon - b.lon) < toleranciaGraus;
}

export function formatarCoordenadas({ lat, lon }: Ponto): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** Aguarda `ms`, interrompendo se o sinal for abortado. */
export function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Abortado', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', aoAbortar);
      resolve();
    }, ms);
    function aoAbortar() {
      clearTimeout(t);
      reject(new DOMException('Abortado', 'AbortError'));
    }
    signal?.addEventListener('abort', aoAbortar, { once: true });
  });
}

export function ehAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
