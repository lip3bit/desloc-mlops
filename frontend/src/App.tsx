import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from './api/client';
import { AndamentoEstimativa } from './components/AndamentoEstimativa';
import { CampoEndereco } from './components/CampoEndereco';
import { CartaoResultado } from './components/CartaoResultado';
import { MapaCorrida } from './components/MapaCorrida';
import { Marca } from './components/Marca';
import { StatusApi } from './components/StatusApi';
import { useEstimativa } from './hooks/useEstimativa';
import { ErroGeolocalizacao, useGeolocalizacao } from './hooks/useGeolocalizacao';
import { useHealth } from './hooks/useHealth';
import { useRota } from './hooks/useRota';
import { dentroDaGrandeSP, ehAbort, formatarCoordenadas, mesmoPonto } from './services/geo';
import { geocodificarReverso } from './services/nominatim';
import type { Campo, EstimativaRequest, Local, Ponto, Sugestao } from './types';
import { agoraEmSaoPauloLocal, localSaoPauloParaIso } from './utils/formatacao';

const AVISO_FORA_SP =
  'Atenção: o modelo foi treinado apenas com corridas em São Paulo. Pontos fora da região podem gerar estimativas pouco confiáveis.';

type Quando = 'agora' | 'agendado';

export default function App() {
  const [origem, setOrigem] = useState<Local | null>(null);
  const [destino, setDestino] = useState<Local | null>(null);
  const [campoAtivo, setCampoAtivo] = useState<Campo>('origem');
  const [aviso, setAviso] = useState<string | null>(null);
  const [quando, setQuando] = useState<Quando>('agora');
  const [dataAgendada, setDataAgendada] = useState<string>(() => agoraEmSaoPauloLocal());
  const [recolhido, setRecolhido] = useState(false);

  const inputOrigemRef = useRef<HTMLInputElement>(null);
  const inputDestinoRef = useRef<HTMLInputElement>(null);
  const reversoRef = useRef<Record<Campo, AbortController | null>>({ origem: null, destino: null });

  const { rota, carregando: carregandoRota } = useRota(origem?.ponto ?? null, destino?.ponto ?? null);
  const { estado, estimar, cancelar } = useEstimativa();
  const { obter: obterPosicao, carregando: localizando } = useGeolocalizacao();
  const { situacao, endpoint, verificar: verificarApi, marcarOnline } = useHealth();

  const definir = useCallback((campo: Campo, local: Local | null) => {
    (campo === 'origem' ? setOrigem : setDestino)(local);
  }, []);

  /** Define um ponto e resolve o endereço via geocodificação reversa. */
  const definirPorPonto = useCallback(
    (campo: Campo, ponto: Ponto) => {
      reversoRef.current[campo]?.abort();
      const controller = new AbortController();
      reversoRef.current[campo] = controller;

      definir(campo, { ponto, rotulo: 'Ponto no mapa', descricao: formatarCoordenadas(ponto), resolvendo: true });
      setAviso(dentroDaGrandeSP(ponto) ? null : AVISO_FORA_SP);

      geocodificarReverso(ponto, controller.signal)
        .then(({ rotulo, descricao }) => {
          if (controller.signal.aborted) return;
          definir(campo, { ponto, rotulo, descricao });
        })
        .catch((e: unknown) => {
          if (ehAbort(e) || controller.signal.aborted) return;
          definir(campo, { ponto, rotulo: 'Ponto no mapa', descricao: formatarCoordenadas(ponto) });
        });
    },
    [definir],
  );

  const aoClicarMapa = useCallback(
    (ponto: Ponto) => {
      const campo = campoAtivo;
      definirPorPonto(campo, ponto);
      // Ordem natural: origem primeiro, depois destino.
      if (campo === 'origem' && !destino) setCampoAtivo('destino');
      else if (campo === 'destino' && !origem) setCampoAtivo('origem');
      (document.activeElement as HTMLElement | null)?.blur?.();
    },
    [campoAtivo, definirPorPonto, destino, origem],
  );

  const aoArrastarPino = useCallback((campo: Campo, ponto: Ponto) => definirPorPonto(campo, ponto), [definirPorPonto]);

  function aoSelecionarSugestao(campo: Campo, s: Sugestao) {
    reversoRef.current[campo]?.abort();
    definir(campo, { ponto: s.ponto, rotulo: s.rotulo, descricao: s.descricao });
    setAviso(null);
    if (campo === 'origem' && !destino) {
      setCampoAtivo('destino');
      inputDestinoRef.current?.focus();
    }
  }

  function limparCampo(campo: Campo) {
    reversoRef.current[campo]?.abort();
    definir(campo, null);
    setCampoAtivo(campo);
    (campo === 'origem' ? inputOrigemRef : inputDestinoRef).current?.focus();
  }

  async function usarMinhaLocalizacao() {
    setAviso(null);
    try {
      const ponto = await obterPosicao();
      definirPorPonto('origem', ponto);
      if (!destino) setCampoAtivo('destino');
    } catch (e) {
      setAviso(e instanceof ErroGeolocalizacao ? e.message : 'Não foi possível obter sua localização.');
    }
  }

  function inverter() {
    reversoRef.current.origem?.abort();
    reversoRef.current.destino?.abort();
    setOrigem(destino ? { ...destino, resolvendo: false } : null);
    setDestino(origem ? { ...origem, resolvendo: false } : null);
  }

  function limparTudo() {
    reversoRef.current.origem?.abort();
    reversoRef.current.destino?.abort();
    cancelar();
    setOrigem(null);
    setDestino(null);
    setAviso(null);
    setCampoAtivo('origem');
    inputOrigemRef.current?.focus();
  }

  const mesmoLocal = Boolean(origem && destino && mesmoPonto(origem.ponto, destino.ponto));
  const podeEstimar = Boolean(origem && destino) && !mesmoLocal && estado.status !== 'carregando';

  function solicitarEstimativa() {
    if (!origem || !destino) return;
    if (mesmoLocal) {
      setAviso('Origem e destino precisam ser diferentes.');
      return;
    }
    const req: EstimativaRequest = { origem: origem.ponto, destino: destino.ponto };
    if (quando === 'agendado' && dataAgendada) req.datahora_solicitacao = localSaoPauloParaIso(dataAgendada);
    setRecolhido(false);
    void estimar(req);
  }

  // Resultado deixa de valer quando origem, destino ou horário mudam.
  useEffect(() => {
    cancelar();
  }, [origem?.ponto.lat, origem?.ponto.lon, destino?.ponto.lat, destino?.ponto.lon, quando, dataAgendada, cancelar]);

  // Mantém o indicador de saúde da API coerente com o resultado das chamadas.
  useEffect(() => {
    if (estado.status === 'sucesso') marcarOnline();
    if (estado.status === 'erro') void verificarApi();
  }, [estado.status, marcarOnline, verificarApi]);

  const dicaMapa = campoAtivo === 'origem' ? 'Toque no mapa para marcar a origem' : 'Toque no mapa para marcar o destino';

  return (
    <div className="app">
      <MapaCorrida
        origem={origem}
        destino={destino}
        rota={rota}
        onClicarMapa={aoClicarMapa}
        onArrastarPino={aoArrastarPino}
      />

      <div className="dica-mapa" aria-hidden="true">
        <span className={`dica-mapa__ponto dica-mapa__ponto--${campoAtivo}`} />
        {dicaMapa}
      </div>

      <aside className={`painel${recolhido ? ' painel--recolhido' : ''}`} aria-label="Planejar corrida">
        <button
          type="button"
          className="painel__alca"
          aria-expanded={!recolhido}
          aria-controls="painel-conteudo"
          onClick={() => setRecolhido((r) => !r)}
        >
          <span className="painel__alca-barra" aria-hidden="true" />
          <span className="visualmente-oculto">{recolhido ? 'Expandir painel' : 'Recolher painel'}</span>
        </button>

        <header className="painel__cabecalho">
          <Marca />
          <StatusApi situacao={situacao} endpoint={endpoint} />
        </header>

        <div className="painel__conteudo" id="painel-conteudo">
          <h1 className="painel__titulo">Para onde vamos hoje?</h1>
          <p className="painel__subtitulo">Escolha origem e destino em São Paulo e veja o preço previsto pelo modelo.</p>

          <div className="trajeto">
            <CampoEndereco
              ref={inputOrigemRef}
              campo="origem"
              local={origem}
              ativo={campoAtivo === 'origem'}
              onAtivar={() => setCampoAtivo('origem')}
              onSelecionar={(s) => aoSelecionarSugestao('origem', s)}
              onLimpar={() => limparCampo('origem')}
            />
            <CampoEndereco
              ref={inputDestinoRef}
              campo="destino"
              local={destino}
              ativo={campoAtivo === 'destino'}
              onAtivar={() => setCampoAtivo('destino')}
              onSelecionar={(s) => aoSelecionarSugestao('destino', s)}
              onLimpar={() => limparCampo('destino')}
            />
            <button
              type="button"
              className="trajeto__inverter"
              onClick={inverter}
              disabled={!origem && !destino}
              aria-label="Inverter origem e destino"
              title="Inverter origem e destino"
              data-testid="btn-inverter"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  d="M8 4v14m0 0l-3.5-3.5M8 18l3.5-3.5M16 20V6m0 0l-3.5 3.5M16 6l3.5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="acoes">
            <button
              type="button"
              className="botao-secundario"
              onClick={usarMinhaLocalizacao}
              disabled={localizando}
              data-testid="btn-localizacao"
            >
              {localizando ? (
                <span className="spinner spinner--pequeno" aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" fill="currentColor" />
                  <path
                    d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              )}
              {localizando ? 'Localizando…' : 'Usar minha localização'}
            </button>
            <button
              type="button"
              className="botao-secundario"
              onClick={limparTudo}
              disabled={!origem && !destino && estado.status === 'ocioso'}
              data-testid="btn-limpar"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              Limpar
            </button>
          </div>

          <fieldset className="quando">
            <legend className="quando__legenda">Quando?</legend>
            <div className="quando__opcoes">
              <label className={`chip${quando === 'agora' ? ' chip--ativo' : ''}`}>
                <input
                  type="radio"
                  name="quando"
                  value="agora"
                  checked={quando === 'agora'}
                  onChange={() => setQuando('agora')}
                />
                Agora
              </label>
              <label className={`chip${quando === 'agendado' ? ' chip--ativo' : ''}`}>
                <input
                  type="radio"
                  name="quando"
                  value="agendado"
                  checked={quando === 'agendado'}
                  onChange={() => setQuando('agendado')}
                />
                Escolher horário
              </label>
            </div>
            {quando === 'agendado' && (
              <label className="quando__data">
                <span className="visualmente-oculto">Data e hora da corrida (horário de Brasília)</span>
                <input
                  type="datetime-local"
                  value={dataAgendada}
                  onChange={(e) => setDataAgendada(e.target.value)}
                  data-testid="input-datahora"
                />
              </label>
            )}
          </fieldset>

          {aviso && (
            <p className="alerta alerta--aviso" role="status">
              {aviso}
            </p>
          )}

          <button
            type="button"
            className="botao-primario"
            onClick={solicitarEstimativa}
            disabled={!podeEstimar}
            aria-busy={estado.status === 'carregando'}
            data-testid="btn-estimar"
          >
            {estado.status === 'carregando' ? (
              <>
                <span className="spinner spinner--claro" aria-hidden="true" /> Estimando…
              </>
            ) : (
              'Estimar corrida'
            )}
          </button>
          {!origem || !destino ? (
            <p className="painel__nota">Defina origem e destino para estimar.</p>
          ) : mesmoLocal ? (
            <p className="painel__nota">Origem e destino precisam ser diferentes.</p>
          ) : carregandoRota ? (
            <p className="painel__nota">Traçando o trajeto no mapa…</p>
          ) : null}

          <AndamentoEstimativa estado={estado} onCancelar={cancelar} onTentarNovamente={solicitarEstimativa} />

          {estado.status === 'sucesso' && estado.dados && (
            <CartaoResultado
              dados={estado.dados}
              rota={rota}
              tempoRespostaMs={estado.tempoRespostaMs}
              solicitadaEm={estado.solicitadaEm}
            />
          )}

          <footer className="painel__rodape">
            Projeto acadêmico de MLOps. Preço e duração previstos por modelo servido no Databricks; trajeto
            ilustrativo via OSRM; endereços via Nominatim/OpenStreetMap.
            <a
              className="painel__link-api"
              href={`${API_BASE}/docs`}
              target="_blank"
              rel="noreferrer"
              data-testid="link-swagger"
            >
              Documentação da API (Swagger) ↗
            </a>
          </footer>
        </div>
      </aside>
    </div>
  );
}
