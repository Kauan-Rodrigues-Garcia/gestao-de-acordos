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
