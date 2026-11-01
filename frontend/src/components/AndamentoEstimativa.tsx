import type { EstadoEstimativa } from '../hooks/useEstimativa';

interface Props {
  estado: EstadoEstimativa;
  onCancelar: () => void;
  onTentarNovamente: () => void;
}

/** Mensagens de carregamento (incluindo cold start) e de erro da estimativa. */
export function AndamentoEstimativa({ estado, onCancelar, onTentarNovamente }: Props) {
  if (estado.status === 'carregando') {
    return (
      <div className={`andamento${estado.lento ? ' andamento--lento' : ''}`} role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <div className="andamento__textos">
          {estado.lento ? (
            <>
              <strong>Acordando o modelo no Databricks…</strong>
              <span>
                O endpoint de Model Serving escala a zero quando fica ocioso. A primeira previsão pode levar alguns
                minutos.
                {estado.tentativa > 1 && ` Tentativa ${estado.tentativa} de ${estado.totalTentativas}.`}
              </span>
            </>
          ) : (
            <strong>Consultando o modelo…</strong>
          )}
        </div>
        <button type="button" className="botao-texto" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    );
  }

  if (estado.status === 'erro' && estado.erro) {
    return (
      <div className="alerta alerta--erro" role="alert">
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" className="alerta__icone">
          <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 5.5v5.5M10 13.6v.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <div className="alerta__textos">
          <strong>Não foi possível estimar a corrida</strong>
          <span>{estado.erro}</span>
          <button type="button" className="botao-texto alerta__acao" onClick={onTentarNovamente}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return null;
}
