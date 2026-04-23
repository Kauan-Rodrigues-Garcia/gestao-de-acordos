/**
 * src/lib/setores-ordem.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Persistência e aplicação da ordem de setores escolhida pelo usuário
 * via drag-and-drop na aba Setores (AdminSetores.tsx).
 *
 * Como não há coluna `ordem` na tabela `setores`, a ordem é guardada em
 * localStorage por empresa (chave `setores-ordem:${empresaId}`).
 *
 * Setores ausentes na ordem persistida vão para o fim em ordem alfabética.
 */

export function chaveOrdemSetores(empresaId: string): string {
  return `setores-ordem:${empresaId}`;
}

export function lerOrdemSetores(empresaId: string): string[] {
  try {
    const raw = localStorage.getItem(chaveOrdemSetores(empresaId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((x: unknown): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function salvarOrdemSetores(empresaId: string, ordem: string[]): void {
  try {
    localStorage.setItem(chaveOrdemSetores(empresaId), JSON.stringify(ordem));
  } catch {
    // Ignora erros de quota/privacidade — a UI continua funcional.
  }
}

/**
 * Ordena uma lista de setores conforme a ordem persistida.
 * Setores não presentes na ordem persistida vão para o fim, em ordem
 * alfabética pelo nome. Estável: não muta o input.
 */
export function aplicarOrdemSetores<T extends { id: string; nome: string }>(
  setores: T[],
  empresaId: string | undefined | null,
): T[] {
  if (!empresaId) {
    return [...setores].sort((a, b) => a.nome.localeCompare(b.nome));
  }
  const ordem = lerOrdemSetores(empresaId);
  if (ordem.length === 0) {
    return [...setores].sort((a, b) => a.nome.localeCompare(b.nome));
  }
  const posById = new Map(ordem.map((id, i) => [id, i]));
  return [...setores].sort((a, b) => {
    const pa = posById.has(a.id) ? posById.get(a.id)! : Number.POSITIVE_INFINITY;
    const pb = posById.has(b.id) ? posById.get(b.id)! : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome);
  });
}
