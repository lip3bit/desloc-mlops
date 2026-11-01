import { useEffect, useState } from 'react';
import { buscarRota, rotaEmLinhaReta } from '../services/osrm';
import { ehAbort } from '../services/geo';
import type { Ponto, Rota } from '../types';

interface EstadoRota {
  rota: Rota | null;
  carregando: boolean;
}

/** Calcula a rota para exibição; em caso de falha do OSRM, usa linha reta. */
export function useRota(origem: Ponto | null, destino: Ponto | null): EstadoRota {
  const [estado, setEstado] = useState<EstadoRota>({ rota: null, carregando: false });

  const oLat = origem?.lat;
  const oLon = origem?.lon;
  const dLat = destino?.lat;
  const dLon = destino?.lon;

  useEffect(() => {
    if (oLat === undefined || oLon === undefined || dLat === undefined || dLon === undefined) {
      setEstado({ rota: null, carregando: false });
      return;
    }
    const o = { lat: oLat, lon: oLon };
    const d = { lat: dLat, lon: dLon };
    const controller = new AbortController();
    // Mostra a linha reta imediatamente enquanto a rota viária carrega.
    setEstado({ rota: rotaEmLinhaReta(o, d), carregando: true });

    // Pequeno atraso evita chamadas em sequência ao arrastar/trocar pontos.
    const t = setTimeout(() => {
      buscarRota(o, d, controller.signal)
        .then((rota) => setEstado({ rota, carregando: false }))
        .catch((e: unknown) => {
          if (ehAbort(e)) return;
          setEstado({ rota: rotaEmLinhaReta(o, d), carregando: false });
        });
    }, 250);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [oLat, oLon, dLat, dLon]);

  return estado;
}
