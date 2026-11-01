import { useCallback, useEffect, useState } from 'react';
import { obterHealth } from '../api/client';

export type SituacaoApi = 'verificando' | 'online' | 'sem-configuracao' | 'offline';

/** Consulta GET /api/health para exibir a situação do backend. */
export function useHealth() {
  const [situacao, setSituacao] = useState<SituacaoApi>('verificando');
  const [endpoint, setEndpoint] = useState<string | undefined>();

  const verificar = useCallback(async (signal?: AbortSignal) => {
    try {
      const h = await obterHealth(signal);
      setEndpoint(h.endpoint);
      setSituacao(h.status === 'ok' && h.inferencia_configurada !== false ? 'online' : 'sem-configuracao');
    } catch {
      if (signal?.aborted) return;
      setSituacao('offline');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void verificar(controller.signal);
    return () => controller.abort();
  }, [verificar]);

  const marcarOnline = useCallback(() => setSituacao('online'), []);

  return { situacao, endpoint, verificar, marcarOnline };
}
