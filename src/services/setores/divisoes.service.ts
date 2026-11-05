/**
 * divisoes.service.ts — ler e gravar as divisões dos setores.
 *
 * A regra mora em `divisoes.ts`; aqui só o banco (migration 20261105120500).
 *
 * Leitura tolerante: sem a migration aplicada, as tabelas não existem e a
 * resposta é «nenhuma divisão» — toda tela segue exatamente como antes.
 */
import { supabase } from '@/lib/supabase';
import { normalizarUsuario, type DivisaoDoSetor } from './divisoes';

export interface DivisoesDaEmpresa {
  divisoes: DivisaoDoSetor[];
  /** login do recebedor (minúsculo) → id do perfil com esse `usuario`. */
  perfilPorUsuario: Record<string, string>;
  /** false = tabelas ausentes (migration pendente). */
  disponivel: boolean;
}

export const SEM_DIVISOES: DivisoesDaEmpresa = {
  divisoes: [], perfilPorUsuario: {}, disponivel: false,
};

export async function buscarDivisoesDaEmpresa(empresaId: string): Promise<DivisoesDaEmpresa> {
  const [div, eqs, rec] = await Promise.all([
    supabase.from('setor_divisoes')
      .select('id, setor_id, nome, ordem, ativo')
      .eq('empresa_id', empresaId),
    supabase.from('setor_divisao_equipes')
      .select('equipe_id, divisao_id')
      .eq('empresa_id', empresaId),
    supabase.from('setor_divisao_recebedores')
      .select('usuario, divisao_id')
      .eq('empresa_id', empresaId),
  ]);
  if (div.error) {
    // Tabela ausente é o caso esperado antes da migration; o resto, avisa.
    if (!/does not exist|schema cache|relation/i.test(div.error.message)) {
      console.warn('[divisoes] leitura:', div.error.message);
    }
    return SEM_DIVISOES;
  }

  const equipesPorDivisao = new Map<string, string[]>();
  for (const l of eqs.data ?? []) {
    const lista = equipesPorDivisao.get(l.divisao_id) ?? [];
    lista.push(l.equipe_id);
    equipesPorDivisao.set(l.divisao_id, lista);
  }
  const recebedoresPorDivisao = new Map<string, string[]>();
  for (const l of rec.data ?? []) {
    const lista = recebedoresPorDivisao.get(l.divisao_id) ?? [];
    lista.push(normalizarUsuario(l.usuario));
    recebedoresPorDivisao.set(l.divisao_id, lista);
  }

  const divisoes: DivisaoDoSetor[] = (div.data ?? []).map(d => ({
    id: d.id,
    setorId: d.setor_id,
    nome: d.nome,
    ordem: d.ordem,
    ativo: d.ativo,
    equipes: equipesPorDivisao.get(d.id) ?? [],
    recebedores: (recebedoresPorDivisao.get(d.id) ?? []).sort(),
  }));

  // Os recebedores com cadastro: `perfis.usuario` sem olhar maiúscula.
  const perfilPorUsuario: Record<string, string> = {};
  const logins = [...new Set(divisoes.flatMap(d => d.recebedores))];
  if (logins.length) {
    const { data: perfis } = await supabase.from('perfis')
      .select('id, usuario')
      .eq('empresa_id', empresaId)
      .not('usuario', 'is', null);
    const procurados = new Set(logins);
    for (const p of (perfis ?? []) as { id: string; usuario: string | null }[]) {
      const u = p.usuario ? normalizarUsuario(p.usuario) : '';
      if (u && procurados.has(u)) perfilPorUsuario[u] = p.id;
    }
  }

  return { divisoes, perfilPorUsuario, disponivel: true };
}

function erro(e: { message: string } | null): string | null {
  return e ? e.message : null;
}

export async function criarDivisao(p: {
  empresaId: string; setorId: string; nome: string; ordem: number; criadoPor?: string | null;
}): Promise<string | null> {
  const { error } = await supabase.from('setor_divisoes').insert({
    empresa_id: p.empresaId, setor_id: p.setorId, nome: p.nome.trim(), ordem: p.ordem,
    criado_por: p.criadoPor ?? null,
  });
  if (error && /idx_setor_divisoes_setor_nome|duplicate/i.test(error.message)) {
    return 'Já existe uma divisão com esse nome neste setor.';
  }
  return erro(error);
}

export async function renomearDivisao(id: string, nome: string): Promise<string | null> {
  const { error } = await supabase.from('setor_divisoes').update({ nome: nome.trim() }).eq('id', id);
  if (error && /idx_setor_divisoes_setor_nome|duplicate/i.test(error.message)) {
    return 'Já existe uma divisão com esse nome neste setor.';
  }
  return erro(error);
}

/** Apaga a divisão; as equipes e os recebedores dela saem junto (CASCADE). */
export async function excluirDivisao(id: string): Promise<string | null> {
  const { error } = await supabase.from('setor_divisoes').delete().eq('id', id);
  return erro(error);
}

/** Põe a equipe na divisão (ou tira, com `divisaoId` nulo). Uma equipe, uma divisão. */
export async function definirDivisaoDaEquipe(p: {
  empresaId: string; equipeId: string; divisaoId: string | null;
}): Promise<string | null> {
  if (!p.divisaoId) {
    const { error } = await supabase.from('setor_divisao_equipes').delete().eq('equipe_id', p.equipeId);
    return erro(error);
  }
  const { error } = await supabase.from('setor_divisao_equipes').upsert(
    { equipe_id: p.equipeId, divisao_id: p.divisaoId, empresa_id: p.empresaId },
    { onConflict: 'equipe_id' },
  );
  return erro(error);
}

/** Põe o login na divisão. Se já estava em outra do mesmo setor, muda de divisão. */
export async function definirRecebedor(p: {
  empresaId: string; setorId: string; divisaoId: string; usuario: string;
}): Promise<string | null> {
  const usuario = normalizarUsuario(p.usuario);
  if (!usuario) return 'Informe o login do relatório.';
  const { error } = await supabase.from('setor_divisao_recebedores').upsert(
    { setor_id: p.setorId, usuario, divisao_id: p.divisaoId, empresa_id: p.empresaId },
    { onConflict: 'setor_id,usuario' },
  );
  return erro(error);
}

export async function removerRecebedor(setorId: string, usuario: string): Promise<string | null> {
  const { error } = await supabase.from('setor_divisao_recebedores').delete()
    .eq('setor_id', setorId).eq('usuario', normalizarUsuario(usuario));
  return erro(error);
}
