import type { SituacaoApi } from '../hooks/useHealth';

const TEXTO: Record<SituacaoApi, string> = {
  verificando: 'Verificando API…',
  online: 'API online',
  'sem-configuracao': 'API sem modelo configurado',
  offline: 'API offline',
};

export function StatusApi({ situacao, endpoint }: { situacao: SituacaoApi; endpoint?: string }) {
  const titulo = endpoint ? `${TEXTO[situacao]} · endpoint ${endpoint}` : TEXTO[situacao];
  return (
    <span className={`status-api status-api--${situacao}`} title={titulo} role="status">
      <span className="status-api__ponto" aria-hidden="true" />
      {TEXTO[situacao]}
    </span>
  );
}
