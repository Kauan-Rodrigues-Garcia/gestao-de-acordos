/**
 * empresaAtiva.service.ts — o super_admin escolhe em qual empresa está.
 *
 * ## Por que existe
 *
 * `bookplay` e `pagueplay` são deploys separados, cada um com `VITE_TENANT_SLUG`
 * fixo no build, e `useEmpresa` amarra a empresa nesse slug. Um super_admin
 * atende as duas, e trocar significava trocar de domínio.
 *
 * No banco isso já era permitido: `fn_can_access_empresa` deixa super_admin
 * passar por qualquer `empresa_id`, e as tabelas grandes ainda têm uma policy
 * `*_super_admin_total` por cima. Faltava só a tela deixar escolher.
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
 * Devolve `null` — e APAGA a escolha — quando quem está logado não é
 * super_admin, quando a empresa sumiu ou foi desativada, ou quando não há
 * sessão. Apagar importa: uma chave que sobrevive a um rebaixamento de cargo
 * continuaria pintando a tela com a outra empresa a cada carregamento.
 */
export async function resolverEmpresaEscolhida(): Promise<Empresa | null> {
  const escolhida = getEmpresaEscolhida();
  if (!escolhida) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;   // sem sessão não se decide nada; a chave fica.

  const { data: meuPerfil, error: erroPerfil } = await supabase
    .from('perfis').select('perfil').eq('id', user.id).maybeSingle();

  // Erro de rede não é resposta: apagar aqui derrubaria a escolha de um
  // super_admin legítimo por causa de uma consulta que falhou.
  if (erroPerfil) return null;

  if ((meuPerfil as { perfil?: string } | null)?.perfil !== 'super_admin') {
    esquecerEmpresaEscolhida();
    return null;
  }

  const { data, error } = await supabase
    .from('empresas').select('*').eq('id', escolhida).eq('ativo', true).maybeSingle();
  if (error) return null;
  if (!data) { esquecerEmpresaEscolhida(); return null; }

  return data as Empresa;
}
