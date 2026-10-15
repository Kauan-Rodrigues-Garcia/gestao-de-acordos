/**
 * permissoes.ts — quem cria comemoração.
 *
 * ⚠️  Esta lista ESPELHA `fn_comemoracao_pode_criar` da migration 20260731e.
 * O front esconde botões; quem garante é a RLS. Se divergirem, o botão aparece
 * e o banco recusa — foi o que aconteceu com as 12 permissões mortas do
 * Admin → Cargos. `permissoes.test.ts` lê a migration e compara.
 */

export const PERFIS_CRIA_COMEMORACAO = [
  'lider', 'elite', 'gerencia', 'diretoria', 'administrador', 'super_admin',
] as const;

/** Pode abrir a aba e criar comemorações. */
export function podeCriarComemoracao(perfil: string | null | undefined): boolean {
  return !!perfil && (PERFIS_CRIA_COMEMORACAO as readonly string[]).includes(perfil);
}

/**
 * A versao que o painel manda: `comemoracoes_gerenciar`.
 *
 * A de cima decide por cargo e continua servindo aos lugares que so tem o
 * perfil em maos. Onde da para perguntar ao painel, pergunte a esta.
 */
export function podeGerenciarComemoracoes(
  temPermissao: (chave: string) => boolean,
): boolean {
  return temPermissao('comemoracoes_gerenciar');
}
