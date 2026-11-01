import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, estimarCorrida } from '../api/client';
import { esperar, ehAbort } from '../services/geo';
import type { EstimativaRequest, EstimativaResponse } from '../types';

/** A partir deste tempo, a UI avisa que o modelo pode estar "acordando". */
export const LIMIAR_LENTO_MS = 5_000;
/** Novas tentativas automáticas quando o Model Serving responde 503 (scale-to-zero). */
const TENTATIVAS_503 = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 5_000;

export type StatusEstimativa = 'ocioso' | 'carregando' | 'sucesso' | 'erro';

export interface EstadoEstimativa {
  status: StatusEstimativa;
  lento: boolean;
  tentativa: number;
  totalTentativas: number;
  dados: EstimativaResponse | null;
  erro: string | null;
  tempoRespostaMs: number | null;
  solicitadaEm: Date | null;
}

const INICIAL: EstadoEstimativa = {
  status: 'ocioso',
  lento: false,
  tentativa: 0,
  totalTentativas: TENTATIVAS_503 + 1,
  dados: null,
  erro: null,
  tempoRespostaMs: null,
  solicitadaEm: null,
};

export function useEstimativa() {
  const [estado, setEstado] = useState<EstadoEstimativa>(INICIAL);
  const controllerRef = useRef<AbortController | null>(null);
  const timerLentoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pararTimers = () => {
    if (timerLentoRef.current) clearTimeout(timerLentoRef.current);
    timerLentoRef.current = null;
  };

  const cancelar = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    pararTimers();
    setEstado(INICIAL);
  }, []);

  useEffect(() => () => {
    controllerRef.current?.abort();
    pararTimers();
  }, []);

  const estimar = useCallback(async (req: EstimativaRequest) => {
    controllerRef.current?.abort();
    pararTimers();
    const controller = new AbortController();
    controllerRef.current = controller;

    const solicitadaEm = new Date();
    const inicio = performance.now();
    setEstado({ ...INICIAL, status: 'carregando', tentativa: 1, solicitadaEm });
    timerLentoRef.current = setTimeout(() => {
      setEstado((e) => (e.status === 'carregando' ? { ...e, lento: true } : e));
    }, LIMIAR_LENTO_MS);

    let tentativa = 1;
    for (;;) {
      try {
        const dados = await estimarCorrida(req, controller.signal);
        if (controller.signal.aborted) return;
        pararTimers();
        setEstado({
          ...INICIAL,
          status: 'sucesso',
          tentativa,
          dados,
          tempoRespostaMs: performance.now() - inicio,
          solicitadaEm,
        });
        return;
      } catch (e) {
        if (controller.signal.aborted || ehAbort(e)) return;
        const erroApi = e instanceof ApiError ? e : null;
        if (erroApi?.tipo === 'cancelado') return;

        if (erroApi?.tipo === 'indisponivel' && tentativa <= TENTATIVAS_503) {
          tentativa += 1;
          setEstado((s) => ({ ...s, lento: true, tentativa }));
          try {
            await esperar(ESPERA_ENTRE_TENTATIVAS_MS, controller.signal);
          } catch {
            return;
          }
          continue;
        }

        pararTimers();
        setEstado({
          ...INICIAL,
          status: 'erro',
          tentativa,
          erro: erroApi?.message ?? 'Ocorreu um erro inesperado ao estimar a corrida.',
          tempoRespostaMs: performance.now() - inicio,
          solicitadaEm,
        });
        return;
      }
    }
  }, []);

  return { estado, estimar, cancelar };
}
