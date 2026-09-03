/**
 * equipesSubgrupos.service.ts — a divisão interna de uma equipe.
 *
 * Um subgrupo é um recorte de LEITURA dentro da equipe: quem soma dinheiro
 * continua sendo `perfis.equipe_id`. O subgrupo só decide com quem a pessoa
 * aparece nos Destaques do Dia e no ranking por equipe.
 *
 * Nasceu de uma situação concreta: um líder saiu, a divisão de baixo dele
 * deixou de existir, e todo mundo foi para uma equipe só para o recebimento
 * por equipe continuar fechando. Recriar equipes mexeria em meta, liderança e
 * no retrato do mês; dividir por dentro não mexe em nada disso.
 *
 * Como `equipesLideres.service.ts`, toda função aqui tolera a tabela ausente
 * (migration ainda não aplicada) devolvendo `null`/`false`: a tela esconde o
 * recurso e volta a se comportar como antes de ele existir.
 */

import { supabase } from '@/lib/supabase';

export interface SubgrupoEquipe {
  id: string;
  equipe_id: string;
  nome: string;
}

/**
 * Subgrupos da empresa inteira.
 *
 * `null` = tabela ausente. A tela distingue isso de `[]` (tabela existe, ainda
 * não criaram subgrupo nenhum): no primeiro caso o botão de criar nem aparece,
 * no segundo ele é justamente o que falta.
 */
export async function listarSubgrupos(empresaId: string): Promise<SubgrupoEquipe[] | null> {
  const { data, error } = await supabase
    .from('equipe_subgrupos')
    .select('id, equipe_id, nome')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) return null;
  return (data as SubgrupoEquipe[]) ?? [];
}

/** Cria um subgrupo dentro de uma equipe. `null` = recusado (RLS ou nome repetido). */
export async function criarSubgrupo(
  empresaId: string,
  equipeId: string,
  nome: string,
  criadoPor?: string | null,
): Promise<SubgrupoEquipe | null> {
  const limpo = nome.trim();
  if (!limpo) return null;

  const { data, error } = await supabase
    .from('equipe_subgrupos')
    .insert({
      empresa_id: empresaId,
      equipe_id:  equipeId,
      nome:       limpo,
      criado_por: criadoPor ?? null,
    })
    .select('id, equipe_id, nome')
    .single();
  if (error) return null;
  return data as SubgrupoEquipe;
}

/** Renomeia um subgrupo. `false` quando a RLS recusa ou o nome já existe na equipe. */
export async function renomearSubgrupo(subgrupoId: string, nome: string): Promise<boolean> {
  const limpo = nome.trim();
  if (!limpo) return false;

  const { data, error } = await supabase
    .from('equipe_subgrupos')
    .update({ nome: limpo })
    .eq('id', subgrupoId)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Apaga um subgrupo. Quem estava nele volta a contar direto na equipe.
 *
 * O `.select()` no fim tem o mesmo motivo de `removerLiderEquipe`: um DELETE
 * que a RLS filtra apaga zero linhas e volta SEM erro. Sem conferir o retorno,
 * a tela some com o subgrupo, avisa que apagou, e ele reaparece no próximo
 * carregamento.
 *
 * `perfis.subgrupo_id` é `ON DELETE SET NULL` — não é preciso limpar antes.
 */
export async function excluirSubgrupo(subgrupoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('equipe_subgrupos')
    .delete()
    .eq('id', subgrupoId)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Move uma pessoa para um subgrupo (ou para fora, com `null`).
 *
 * Não valida se o subgrupo é da equipe da pessoa: quem valida é o trigger
 * `trg_perfis_subgrupo_coerente`, e ele ZERA em vez de recusar. Duplicar a
 * regra aqui criaria duas versões dela para divergir depois.
 */
export async function moverParaSubgrupo(
  perfilId: string,
  subgrupoId: string | null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('perfis')
    .update({ subgrupo_id: subgrupoId })
    .eq('id', perfilId)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

/**
 * O grupo de leitura de cada pessoa: o subgrupo dela, ou a equipe quando não há
 * subgrupo.
 *
 * É a MESMA regra de `fn_analitico_destaques_dia_por_grupo` no banco, escrita
 * em TypeScript porque o ranking agrupa no cliente (o recebimento já veio, uma
 * segunda RPC só para agrupar seria uma ida a mais para o mesmo dado).
 *
 * As duas versões precisam concordar. Se uma mudar, a outra muda junto — é o
 * tipo de par que só se mantém honesto com teste, e é o que
 * `rankingCriterio.test.ts` cobre do lado daqui.
 */
export function grupoDaPessoa(
  pessoa: { equipe_id: string | null; subgrupo_id?: string | null },
  subgruposPorId: Map<string, SubgrupoEquipe>,
): string | null {
  const sg = pessoa.subgrupo_id ? subgruposPorId.get(pessoa.subgrupo_id) : undefined;
  // Subgrupo de outra equipe não vale — mesma condição do JOIN da RPC.
  if (sg && sg.equipe_id === pessoa.equipe_id) return sg.id;
  return pessoa.equipe_id ?? null;
}
