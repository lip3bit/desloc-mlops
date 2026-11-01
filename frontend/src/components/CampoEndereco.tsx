import { useEffect, useId, useState, type KeyboardEvent, type Ref } from 'react';
import { MIN_CARACTERES, useBuscaEndereco } from '../hooks/useBuscaEndereco';
import type { Campo, Local, Sugestao } from '../types';

interface Props {
  campo: Campo;
  local: Local | null;
  ativo: boolean;
  onAtivar: () => void;
  onSelecionar: (s: Sugestao) => void;
  onLimpar: () => void;
  ref?: Ref<HTMLInputElement>;
}

const TEXTOS: Record<Campo, { rotulo: string; placeholder: string; testId: string }> = {
  origem: { rotulo: 'Origem', placeholder: 'De onde você sai?', testId: 'input-origem' },
  destino: { rotulo: 'Destino', placeholder: 'Para onde você vai?', testId: 'input-destino' },
};

export function CampoEndereco({ campo, local, ativo, onAtivar, onSelecionar, onLimpar, ref }: Props) {
  const id = useId();
  const idInput = `${id}-input`;
  const idLista = `${id}-lista`;
  const idDica = `${id}-dica`;
  const t = TEXTOS[campo];

  const [texto, setTexto] = useState(local?.rotulo ?? '');
  const [editando, setEditando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(-1);

  // Sincroniza com mudanças externas (clique no mapa, inversão, limpeza...).
  useEffect(() => {
    setTexto(local?.rotulo ?? '');
    setEditando(false);
    setAberto(false);
    setDestaque(-1);
  }, [local?.rotulo, local?.ponto.lat, local?.ponto.lon]);

  const { sugestoes, carregando, erro, consultada } = useBuscaEndereco(texto, editando);
  const termo = texto.trim();
  const mostrarLista = aberto && editando && termo.length >= MIN_CARACTERES;
  const resultadosValidos = consultada === termo ? sugestoes : [];

  function selecionar(s: Sugestao) {
    onSelecionar(s);
    setTexto(s.rotulo);
    setEditando(false);
    setAberto(false);
    setDestaque(-1);
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!resultadosValidos.length) return;
      e.preventDefault();
      setAberto(true);
      setDestaque((i) => (i + 1) % resultadosValidos.length);
    } else if (e.key === 'ArrowUp') {
      if (!resultadosValidos.length) return;
      e.preventDefault();
      setDestaque((i) => (i <= 0 ? resultadosValidos.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (mostrarLista && resultadosValidos.length) {
        e.preventDefault();
        selecionar(resultadosValidos[destaque >= 0 ? destaque : 0]);
      }
    } else if (e.key === 'Escape') {
      if (mostrarLista) {
        e.preventDefault();
        setAberto(false);
      } else if (editando) {
        setTexto(local?.rotulo ?? '');
        setEditando(false);
      }
    }
  }

  function aoSair() {
    setAberto(false);
    setDestaque(-1);
    // Texto digitado sem escolher sugestão: volta ao endereço já definido.
    if (editando && local) {
      setTexto(local.rotulo);
      setEditando(false);
    }
  }

  const descricao = !editando && local ? (local.resolvendo ? 'Identificando endereço…' : local.descricao) : undefined;

  return (
    <div className={`campo campo--${campo}${ativo ? ' campo--ativo' : ''}`}>
      <span className={`campo__marcador campo__marcador--${campo}`} aria-hidden="true" />
      <div className="campo__corpo">
        <label className="campo__rotulo" htmlFor={idInput}>
          {t.rotulo}
          {ativo && (
            <span className="campo__selo" id={idDica}>
              ou toque no mapa
            </span>
          )}
        </label>
        <input
          ref={ref}
          id={idInput}
          data-testid={t.testId}
          className={`campo__input${local?.resolvendo && !editando ? ' campo__input--resolvendo' : ''}`}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t.placeholder}
          value={texto}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostrarLista}
          aria-controls={idLista}
          aria-describedby={ativo ? idDica : undefined}
          aria-activedescendant={mostrarLista && destaque >= 0 ? `${idLista}-${destaque}` : undefined}
          onFocus={() => {
            onAtivar();
            if (editando) setAberto(true);
          }}
          onBlur={aoSair}
          onChange={(e) => {
            setTexto(e.target.value);
            setEditando(true);
            setAberto(true);
            setDestaque(-1);
          }}
          onKeyDown={aoTeclar}
        />
        {descricao && (
          <span className="campo__descricao" title={descricao}>
            {descricao}
          </span>
        )}
      </div>
      {(texto || local) && (
        <button
          type="button"
          className="campo__limpar"
          aria-label={`Limpar ${t.rotulo.toLowerCase()}`}
          title={`Limpar ${t.rotulo.toLowerCase()}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setTexto('');
            setEditando(false);
            setAberto(false);
            onLimpar();
          }}
        >
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <ul
        id={idLista}
        role="listbox"
        aria-label={`Sugestões de ${t.rotulo.toLowerCase()}`}
        className="sugestoes"
        hidden={!mostrarLista}
      >
        {mostrarLista && carregando && !resultadosValidos.length && (
          <li className="sugestoes__estado" role="presentation">
            <span className="spinner spinner--pequeno" aria-hidden="true" /> Buscando endereços…
          </li>
        )}
        {mostrarLista && !carregando && erro && (
          <li className="sugestoes__estado sugestoes__estado--erro" role="presentation">
            {erro}
          </li>
        )}
        {mostrarLista && !carregando && !erro && consultada === termo && !sugestoes.length && (
          <li className="sugestoes__estado" role="presentation">
            Nenhum endereço encontrado na Grande São Paulo.
          </li>
        )}
        {mostrarLista &&
          resultadosValidos.map((s, i) => (
            <li
              key={s.id}
              id={`${idLista}-${i}`}
              role="option"
              aria-selected={i === destaque}
              data-testid="sugestao-item"
              className={`sugestoes__item${i === destaque ? ' sugestoes__item--destaque' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setDestaque(i)}
              onClick={() => selecionar(s)}
            >
              <svg className="sugestoes__icone" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                <path
                  d="M10 18s6-5.6 6-10a6 6 0 10-12 0c0 4.4 6 10 6 10z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="10" cy="8" r="2.2" fill="currentColor" />
              </svg>
              <span className="sugestoes__textos">
                <span className="sugestoes__rotulo">{s.rotulo}</span>
                <span className="sugestoes__descricao">{s.descricao}</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
