import type { Erro, EstimativaRequest, EstimativaResponse, Health } from '../types';

/** URL base do backend. Vazio = caminhos relativos (proxy do Vite/nginx). */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** Tempo máximo de uma chamada de estimativa (cold start incluído). */
const TIMEOUT_ESTIMATIVA_MS = 120_000;
const TIMEOUT_HEALTH_MS = 8_000;

export type TipoErroApi = 'rede' | 'validacao' | 'indisponivel' | 'servidor' | 'timeout' | 'cancelado';

export class ApiError extends Error {
  readonly tipo: TipoErroApi;
  readonly status?: number;

  constructor(tipo: TipoErroApi, mensagem: string, status?: number) {
    super(mensagem);
    this.name = 'ApiError';
    this.tipo = tipo;
    this.status = status;
  }
}

const MSG_SEM_CONEXAO =
  'Não foi possível conectar ao servidor da DESLOC. Verifique se o backend está em execução e tente novamente.';

function extrairDetalhe(corpo: unknown): string | undefined {
  if (!corpo || typeof corpo !== 'object') return undefined;
  const { detail } = corpo as Erro;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const msgs = detail.map((d) => d?.msg).filter((m): m is string => typeof m === 'string');
    if (msgs.length) return msgs.join('; ');
  }
  return undefined;
}

function combinarSinais(externo: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let expirou = false;
  const timer = setTimeout(() => {
    expirou = true;
    controller.abort();
  }, timeoutMs);
  const repassar = () => controller.abort();
  if (externo) {
    if (externo.aborted) controller.abort();
    else externo.addEventListener('abort', repassar, { once: true });
  }
  return {
    signal: controller.signal,
    expirou: () => expirou,
    limpar: () => {
      clearTimeout(timer);
      externo?.removeEventListener('abort', repassar);
    },
  };
}

async function requisitar<T>(caminho: string, init: RequestInit, timeoutMs: number, externo?: AbortSignal): Promise<T> {
  const sinais = combinarSinais(externo, timeoutMs);
  let resposta: Response;
  try {
    resposta = await fetch(`${API_BASE}${caminho}`, {
      ...init,
      signal: sinais.signal,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch (e) {
    sinais.limpar();
    if (sinais.expirou()) {
      throw new ApiError('timeout', 'O servidor demorou demais para responder. Tente novamente em instantes.');
    }
    if (externo?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
      throw new ApiError('cancelado', 'Requisição cancelada.');
    }
    throw new ApiError('rede', MSG_SEM_CONEXAO);
  }

  let corpo: unknown = null;
  try {
    const texto = await resposta.text();
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  } finally {
    sinais.limpar();
  }

  if (resposta.ok) {
    if (corpo === null) throw new ApiError('servidor', 'O servidor respondeu sem conteúdo válido.', resposta.status);
    return corpo as T;
  }

  const detalhe = extrairDetalhe(corpo);
  const s = resposta.status;
  if (s === 422 || s === 400) {
    throw new ApiError('validacao', detalhe ?? 'Os dados da corrida são inválidos. Revise origem e destino.', s);
  }
  if (s === 503) {
    throw new ApiError(
      'indisponivel',
      detalhe ?? 'O serviço de inferência está indisponível ou iniciando. Tente novamente em alguns segundos.',
      s,
    );
  }
  // Proxy sem backend (Vite/nginx) costuma responder 500/502/504 sem JSON.
  if (!detalhe && (s === 500 || s === 502 || s === 504)) {
    throw new ApiError('rede', MSG_SEM_CONEXAO, s);
  }
  throw new ApiError('servidor', detalhe ?? `Erro inesperado no servidor (HTTP ${s}).`, s);
}

export function estimarCorrida(req: EstimativaRequest, signal?: AbortSignal): Promise<EstimativaResponse> {
  return requisitar<EstimativaResponse>(
    '/api/v1/estimativa',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    },
    TIMEOUT_ESTIMATIVA_MS,
    signal,
  );
}

export function obterHealth(signal?: AbortSignal): Promise<Health> {
  return requisitar<Health>('/api/health', { method: 'GET' }, TIMEOUT_HEALTH_MS, signal);
}
