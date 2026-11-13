/**
 * quadroPessoal.service.ts — a leitura do Quadro de Pessoal. Só leitura.
 *
 * São as mesmas tabelas que a aba Usuários lê (`setores`, `rh_celulas`,
 * `equipes`, `perfis`, `equipe_lideres`, `equipe_subgrupos`,
 * `equipe_operadores_clones`), e o recorte é o da RLS: com o alcance «todos os
 * setores» do RH Gestão, `perfis_select` entrega a empresa inteira. Ninguém
 * filtra de novo aqui.
 *
 * As peças opcionais (subgrupos, clones, líderes, o vínculo de subgrupo)
 * toleram tabela ou coluna ausente e voltam vazias: nomear uma coluna que não
 * existe derruba a consulta inteira no PostgREST, e o quadro sem subgrupo é
 * melhor que quadro nenhum.
 */
import { supabase } from '@/lib/supabase';
import { lerOrdemSetores } from '@/lib/setores-ordem';
import { listarClonesEquipes } from '@/services/equipes/equipesClones.service';
import { listarLideresEquipes } from '@/services/equipes/equipesLideres.service';
import { listarSubgrupos } from '@/services/equipes/equipesSubgrupos.service';
import { listarCrachas } from './rhGestao.service';
import type { DadosBrutos, EquipeBruta, PessoaBruta, SetorBruto } from './quadroPessoal';

export async function carregarQuadro(empresaId: string): Promise<DadosBrutos> {
  const [setores, cidades, equipes, pessoas, lideres, subgrupos, clones, vinculos, crachas] = await Promise.all([
    supabase.from('setores')
      .select('id, nome, ativo, tipo, cidade_id, regra, descricao, alternativo')
      .eq('empresa_id', empresaId).order('nome'),
    supabase.from('rh_celulas').select('id, nome').eq('empresa_id', empresaId),
    supabase.from('equipes')
      .select('id, nome, setor_id, treinamento')
      .eq('empresa_id', empresaId).order('nome'),
    supabase.from('perfis')
      .select('id, empresa_id, nome, email, perfil, setor_id, equipe_id, situacao, ferias_ate, foto_url, arquivado, criado_em')
      .eq('empresa_id', empresaId).order('nome'),
    listarLideresEquipes(empresaId),
    listarSubgrupos(empresaId),
    listarClonesEquipes(empresaId),
    supabase.from('perfis').select('id, subgrupo_id').eq('empresa_id', empresaId),
    // O crachá oficial (o mesmo do RH Gestão). A RLS entrega o que o alcance
    // do RH vê; sem alcance, a coluna fica vazia e o resto do quadro segue.
    listarCrachas(empresaId),
  ]);

  if (setores.error) throw setores.error;
  if (equipes.error) throw equipes.error;
  if (pessoas.error) throw pessoas.error;

  const subgrupoDe = new Map(
    ((vinculos.error ? [] : vinculos.data) as { id: string; subgrupo_id: string | null }[] ?? [])
      .map(v => [v.id, v.subgrupo_id] as const),
  );

  return {
    setores: (setores.data ?? []) as unknown as SetorBruto[],
    cidades: cidades.error ? [] : ((cidades.data ?? []) as { id: string; nome: string }[]),
    equipes: (equipes.data ?? []) as unknown as EquipeBruta[],
    pessoas: ((pessoas.data ?? []) as unknown as PessoaBruta[])
      .map(p => ({ ...p, subgrupo_id: subgrupoDe.get(p.id) ?? null })),
    lideres: lideres ?? [],
    subgrupos: subgrupos ?? [],
    clones: (clones ?? []).map(c => ({ equipe_id: c.equipe_id, operador_id: c.operador_id })),
    ordemSetores: lerOrdemSetores(empresaId),
    crachas: Object.fromEntries(crachas.map(c => [c.operador_id, c.cracha])),
  };
}

/**
 * O quadro de várias empresas num só — a visão do RH (20/10/2026).
 *
 * O produto RH não tem setor nem equipe próprios: o que ele olha é a gente das
 * outras operações. Cada empresa é lida à parte (as consultas são por
 * `empresa_id`) e as listas são somadas; os ids são únicos no banco, então
 * nada colide. A cidade continua sendo o agrupamento — Birigui e Marília
 * existem com o mesmo nome em mais de uma empresa e se juntam pelo nome.
 *
 * Quem não alcança uma empresa recebe as listas dela vazias da RLS; a tela
 * mostra o que veio, como em qualquer outra leitura.
 */
export async function carregarQuadroDeVarias(
  empresas: readonly { id: string; nome: string }[],
): Promise<DadosBrutos> {
  const partes = await Promise.all(empresas.map(async e => ({ e, d: await carregarQuadro(e.id) })));
  const junto: DadosBrutos = {
    setores: [], cidades: [], equipes: [], pessoas: [], lideres: [], subgrupos: [], clones: [], ordemSetores: [], crachas: {},
  };
  for (const { e, d } of partes) {
    junto.setores.push(...d.setores.map(s => ({ ...s, empresa_nome: e.nome })));
    junto.cidades.push(...d.cidades);
    junto.equipes.push(...d.equipes);
    junto.pessoas.push(...d.pessoas);
    junto.lideres.push(...d.lideres);
    junto.subgrupos.push(...d.subgrupos);
    junto.clones.push(...d.clones);
    junto.ordemSetores!.push(...(d.ordemSetores ?? []));
    Object.assign(junto.crachas!, d.crachas ?? {});
  }
  return junto;
}
