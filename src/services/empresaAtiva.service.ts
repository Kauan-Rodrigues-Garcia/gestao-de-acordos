/**
 * empresaAtiva.service.ts — quem atende as duas empresas escolhe em qual está.
 *
 * ## Por que existe
 *
 * `bookplay` e `pagueplay` são deploys separados, cada um com `VITE_TENANT_SLUG`
 * fixo no build, e `useEmpresa` amarra a empresa nesse slug. Um super_admin
 * atende as duas, e trocar significava trocar de domínio. Desde a migration
 * `20260818300000` o super_admin também pode liberar gerência e diretoria
 * nominalmente — ver `acessoMultiempresa.service.ts`.
 *
 * No banco quem decide é `fn_can_access_empresa`: passam super_admin, quem tem
 * acesso multiempresa liberado, e todo mundo na própria empresa.
 *
 * ## O gate é o CARGO, não a leitura da tabela
 *
 * `empresas_select` é `(ativo = true)`: qualquer usuário autenticado lê a linha
 * de qualquer empresa ativa. Conseguir ler a empresa, portanto, não prova nada —
 * quem não é super_admin veria o nome e o logo da outra empresa com todas as
 * telas vazias, porque os dados continuam bloqueados. Feio e confuso.
 *
 * Por isso a troca confere o cargo antes de valer, e a chave é descartada quando
 * a conferência falha. Não é a barreira de segurança — essa é a RLS, e ela
 * continua de pé sozinha. É o que impede a tela de mentir sobre onde se está.
 */

import { supabase } from '@/lib/supabase';
import type { Empresa } from '@/lib/supabase';
import { perfilVeDuasEmpresas } from '@/services/acessoMultiempresa.service';

const CHAVE = 'empresa-ativa-super-admin';

/** Id da empresa escolhida, se houver. Não valida cargo — quem valida é `resolverEmpresaEscolhida`. */
export function getEmpresaEscolhida(): string | null {
  try {
    return localStorage.getItem(CHAVE) || null;
  } catch { return null; }
}

/** Guarda a escolha. `null` volta para a empresa do domínio. */
export function definirEmpresaEscolhida(empresaId: string | null): void {
  try {
    if (empresaId) localStorage.setItem(CHAVE, empresaId);
    else localStorage.removeItem(CHAVE);
  } catch { /* navegador sem storage — a troca só não sobrevive ao reload */ }
}

export function esquecerEmpresaEscolhida(): void {
  definirEmpresaEscolhida(null);
}

/**
 * A empresa escolhida, se a escolha valer.
 *
 * Devolve `null` — e APAGA a escolha — quando quem está logado não atende as
 * duas empresas, quando a empresa sumiu ou foi desativada, ou quando não há
 * sessão. Apagar importa: uma chave que sobrevive a um rebaixamento de cargo, ou
 * à revogação do acesso multiempresa, continuaria pintando a tela com a outra
 * empresa a cada carregamento.
 */
export async function resolverEmpresaEscolhida(): Promise<Empresa | null> {
  const escolhida = getEmpresaEscolhida();
  if (!escolhida) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;   // sem sessão não se decide nada; a chave fica.

  // `select('*')` e não a lista de colunas: `acesso_multiempresa` nasce numa
  // migration, e front e banco não sobem no mesmo instante. Pedir a coluna pelo
  // nome faria o PostgREST recusar a consulta inteira na janela entre o deploy e
  // a migration — e o super_admin perderia a troca de empresa que já tinha.
  const { data: meuPerfil, error: erroPerfil } = await supabase
    .from('perfis').select('*').eq('id', user.id).maybeSingle();

  // Erro de rede não é resposta: apagar aqui derrubaria a escolha de um
  // super_admin legítimo por causa de uma consulta que falhou.
  if (erroPerfil) return null;

  // Não é mais só o cargo `super_admin`: gerência e diretoria liberados pelo
  // super_admin também trocam de empresa (migration 20260818300000). A regra é
  // a mesma que `fn_user_acesso_multiempresa` aplica no banco — flag E cargo —
  // porque uma tela que aceita a troca e um banco que recusa os dados é pior
  // que não ter o botão.
  if (!perfilVeDuasEmpresas(meuPerfil as { perfil?: string; acesso_multiempresa?: boolean } | null)) {
    esquecerEmpresaEscolhida();
    return null;
  }

  const { data, error } = await supabase
    .from('empresas').select('*').eq('id', escolhida).eq('ativo', true).maybeSingle();
  if (error) return null;
  if (!data) { esquecerEmpresaEscolhida(); return null; }

  return data as Empresa;
}
