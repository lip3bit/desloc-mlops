import { useEffect, useState } from 'react';
import { buscarEnderecos } from '../services/nominatim';
import { ehAbort } from '../services/geo';
import type { Sugestao } from '../types';
import { useDebouncedValue } from './useDebouncedValue';

export const DEBOUNCE_BUSCA_MS = 750;
export const MIN_CARACTERES = 3;

interface EstadoBusca {
  sugestoes: Sugestao[];
  carregando: boolean;
  erro: string | null;
  /** Consulta efetivamente pesquisada (após debounce). */
  consultada: string;
}

const VAZIO: EstadoBusca = { sugestoes: [], carregando: false, erro: null, consultada: '' };

/**
 * Busca de endereços com debounce (≥ 700 ms), mínimo de caracteres e
 * cancelamento de requisições obsoletas via AbortController.
 */
export function useBuscaEndereco(consulta: string, habilitada: boolean): EstadoBusca {
  const termo = habilitada ? consulta.trim() : '';
  const termoAtrasado = useDebouncedValue(termo, DEBOUNCE_BUSCA_MS);
  const [estado, setEstado] = useState<EstadoBusca>(VAZIO);

  useEffect(() => {
    if (!habilitada || termoAtrasado.length < MIN_CARACTERES) {
      setEstado(VAZIO);
      return;
    }
    const controller = new AbortController();
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    buscarEnderecos(termoAtrasado, controller.signal)
      .then((sugestoes) => {
        setEstado({ sugestoes, carregando: false, erro: null, consultada: termoAtrasado });
      })
      .catch((e: unknown) => {
        if (ehAbort(e)) return;
        setEstado({
          sugestoes: [],
          carregando: false,
          erro: 'Não foi possível buscar endereços agora. Tente novamente ou toque no mapa.',
          consultada: termoAtrasado,
        });
      });
    return () => controller.abort();
  }, [termoAtrasado, habilitada]);

  // Enquanto o usuário ainda digita (termo != termo pesquisado), não mostra resultados antigos como atuais.
  const digitando = habilitada && termo.length >= MIN_CARACTERES && termo !== termoAtrasado;
  return { ...estado, carregando: estado.carregando || digitando };
}
