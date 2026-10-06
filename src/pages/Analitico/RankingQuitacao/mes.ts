/** `2026-09-01` → `setembro de 2026`. */
export function nomeDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  if (!ano || !m) return mes;
  return new Date(ano, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** O mês do Analítico (`AAAA-MM` ou `AAAA-MM-DD`) como primeiro dia, `AAAA-MM-01`. */
export function primeiroDia(mes: string): string {
  return `${mes.slice(0, 7)}-01`;
}
