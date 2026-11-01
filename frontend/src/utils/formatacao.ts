const FUSO_SP = 'America/Sao_Paulo';

export function formatarMoeda(valor: number, moeda = 'BRL'): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(valor);
  } catch {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  }
}

export function formatarDuracao(minutos: number): string {
  const total = Math.max(1, Math.round(minutos));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
}

export function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(km)} km`;
}

export function formatarSegundos(ms: number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000)} s`;
}

export function formatarDataHora(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(data) : data;
  if (Number.isNaN(d.getTime())) return String(data);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_SP,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Data/hora atual no fuso de São Paulo, no formato de <input type="datetime-local">. */
export function agoraEmSaoPauloLocal(): string {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: FUSO_SP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  // "2026-11-01 08:15" -> "2026-11-01T08:15"
  return partes.replace(' ', 'T');
}

/**
 * Converte o valor de um datetime-local (interpretado como horário de São Paulo)
 * para ISO 8601 com offset. O Brasil não adota horário de verão desde 2019 (UTC-03:00).
 */
export function localSaoPauloParaIso(valor: string): string {
  const base = valor.length === 16 ? `${valor}:00` : valor;
  return `${base}-03:00`;
}
