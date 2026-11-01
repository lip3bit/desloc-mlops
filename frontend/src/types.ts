/** Coordenada geográfica no formato usado pelo backend. */
export interface Ponto {
  lat: number;
  lon: number;
}

/** Campo de endereço do formulário. */
export type Campo = 'origem' | 'destino';

/** Local escolhido pelo usuário (busca, clique no mapa ou geolocalização). */
export interface Local {
  ponto: Ponto;
  /** Texto curto exibido no campo. */
  rotulo: string;
  /** Endereço completo (quando disponível). */
  descricao?: string;
  /** Indica que o rótulo ainda está sendo resolvido via geocodificação reversa. */
  resolvendo?: boolean;
}

/** Sugestão retornada pela busca de endereços. */
export interface Sugestao {
  id: string;
  rotulo: string;
  descricao: string;
  ponto: Ponto;
}

/** Rota desenhada no mapa (apenas visual). */
export interface Rota {
  /** Pares [lat, lon] para o Leaflet. */
  coordenadas: [number, number][];
  /** "osrm" = rota viária; "reta" = fallback em linha reta. */
  fonte: 'osrm' | 'reta';
  distanciaKm?: number;
  duracaoMin?: number;
}

// ---- Contrato da API (specs/001-previsao-corrida/contracts/openapi.yaml) ----

export interface EstimativaRequest {
  origem: Ponto;
  destino: Ponto;
  /** ISO 8601. Padrão no backend = agora, fuso America/Sao_Paulo. */
  datahora_solicitacao?: string;
}

export interface ModeloInfo {
  endpoint?: string;
  versao?: string | null;
}

export interface EstimativaResponse {
  valor_previsto: number;
  duracao_estimada_min: number;
  distancia_km: number;
  moeda: string;
  modelo: ModeloInfo;
  datahora_solicitacao?: string;
}

export interface Health {
  status?: 'ok' | 'misconfigured';
  endpoint?: string;
  inferencia_configurada?: boolean;
}

export interface Erro {
  detail?: string | { msg?: string }[];
}
