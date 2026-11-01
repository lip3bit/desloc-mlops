import { useEffect, useRef } from 'react';
import type { EstimativaResponse, Rota } from '../types';
import {
  formatarDataHora,
  formatarDistancia,
  formatarDuracao,
  formatarMoeda,
  formatarSegundos,
} from '../utils/formatacao';

interface Props {
  dados: EstimativaResponse;
  rota: Rota | null;
  tempoRespostaMs: number | null;
  solicitadaEm: Date | null;
}

export function CartaoResultado({ dados, rota, tempoRespostaMs, solicitadaEm }: Props) {
  const versao = dados.modelo?.versao;
  const endpoint = dados.modelo?.endpoint ?? 'não informado';
  const horario = dados.datahora_solicitacao ?? solicitadaEm;
  const ref = useRef<HTMLElement>(null);

  // Garante que o resultado fique visível dentro do painel rolável.
  useEffect(() => {
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: reduzir ? 'auto' : 'smooth' });
  }, [dados]);

  return (
    <section ref={ref} className="resultado" aria-labelledby="resultado-titulo" aria-live="polite">
      <div className="resultado__topo">
        <h2 id="resultado-titulo" className="resultado__titulo">
          Estimativa
        </h2>
        <span className="resultado__selo">Previsão do modelo</span>
      </div>

      <p className="resultado__preco">
        <span className="visualmente-oculto">Preço estimado: </span>
        <span data-testid="resultado-preco">{formatarMoeda(dados.valor_previsto, dados.moeda)}</span>
      </p>

      <dl className="resultado__metricas">
        <div className="metrica">
          <dt>Duração estimada</dt>
          <dd data-testid="resultado-duracao">{formatarDuracao(dados.duracao_estimada_min)}</dd>
        </div>
        <div className="metrica">
          <dt>Distância (linha reta)</dt>
          <dd data-testid="resultado-distancia">{formatarDistancia(dados.distancia_km)}</dd>
        </div>
      </dl>

      {rota && (
        <p className="resultado__rota">
          {rota.fonte === 'osrm' && rota.distanciaKm !== undefined
            ? `Trajeto desenhado no mapa: ${formatarDistancia(rota.distanciaKm)} pelas ruas (OSRM, apenas ilustrativo).`
            : 'Trajeto desenhado em linha reta (rota viária indisponível no momento).'}
        </p>
      )}

      <p className="resultado__meta">
        <span>
          Modelo <code>{endpoint}</code> · versão {versao ?? 'não informada'}
        </span>
        {tempoRespostaMs !== null && <span>Resposta em {formatarSegundos(tempoRespostaMs)}</span>}
        {horario && <span>Solicitada em {formatarDataHora(horario)}</span>}
      </p>
    </section>
  );
}
