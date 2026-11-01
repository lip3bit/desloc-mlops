import { useEffect, useState } from 'react';

/** Retorna `valor` somente após `atrasoMs` sem alterações. */
export function useDebouncedValue<T>(valor: T, atrasoMs: number): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => clearTimeout(t);
  }, [valor, atrasoMs]);
  return atrasado;
}
