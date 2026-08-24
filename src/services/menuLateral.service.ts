/**
 * menuLateral.service — leitura e gravação da ordem das abas, por cargo.
 *
 * Falha de leitura NÃO é erro fatal: sem ordem salva o menu usa a do código.
 * Isso também cobre o intervalo entre publicar o frontend e aplicar a
 * migration, quando a tabela (ou a coluna `cargo`) ainda não existe.
 *
 * ## A ordem GERAL é a linha de cargo vazio
 *
 * `cargo = ''` vale para todo cargo que não tem linha própria. É o que faz a
 * mudança para «por cargo» ser sem perda: a ordem que existia antes virou a
 * geral, e cargo novo herda dela até alguém decidir o contrário.
 */

import { supabase } from '@/lib/supabase';

const TABELA = 'menu_lateral_ordem';

/** A chave da ordem que vale para quem não tem linha própria. */
export const CARGO_GERAL = '';

/** `cargo` → rotas na ordem desejada. A chave `''` é a ordem geral. */
export type OrdensPorCargo = Record<string, string[]>;

const tabela = () => supabase.from(TABELA);

/**
 * Todas as ordens salvas da empresa, por cargo.
 *
 * Uma consulta só, e não uma por cargo: são no máximo nove linhas minúsculas, e
 * o editor precisa de todas de qualquer forma para mostrar quais cargos já têm
 * ordem própria.
 */
export async function carregarOrdensMenu(empresaId: string): Promise<OrdensPorCargo> {
  const { data, error } = await tabela()
    .select('cargo, ordem')
    .eq('empresa_id', empresaId);

  if (error) {
    console.warn('[menuLateral.service] carregarOrdensMenu:', error.message);
    return {};
  }

  const saida: OrdensPorCargo = {};
  for (const linha of (data ?? []) as { cargo: string | null; ordem: string[] | null }[]) {
    saida[linha.cargo ?? CARGO_GERAL] = linha.ordem ?? [];
  }
  return saida;
}

/**
 * A ordem que vale para um cargo: a dele, ou a geral.
 *
 * Pura, e separada da leitura, porque é ela que o menu e a prévia do editor
 * respondem — e as duas precisam responder igual.
 *
 * **Array vazio conta como ausência**, e não como «ordem vazia». Não há policy
 * de DELETE nesta tabela (uma porta a menos), então «desfazer» é gravar `[]` —
 * e desfazer a ordem de um cargo tem de devolvê-lo à geral, não deixá-lo com um
 * menu sem abas. Na linha geral, `[]` devolve à ordem do código.
 */
export function ordemDoCargo(ordens: OrdensPorCargo, cargo: string): string[] {
  const propria = ordens[cargo];
  if (propria?.length) return propria;
  const geral = ordens[CARGO_GERAL];
  return geral?.length ? geral : [];
}

/**
 * Grava a ordem de um cargo. Array vazio significa «volta ao padrão do código».
 *
 * Devolve `true` só quando o banco confirmou. Quem chama usa isso para decidir
 * entre avisar sucesso e avisar falha — gravar em silêncio e mostrar sucesso
 * seria a pior das saídas num painel de configuração.
 */
export async function salvarOrdemMenu(
  empresaId: string,
  ordem: string[],
  opcoes?: { cargo?: string; atualizadoPor?: string },
): Promise<boolean> {
  const { error } = await tabela().upsert(
    {
      empresa_id: empresaId,
      cargo: opcoes?.cargo ?? CARGO_GERAL,
      ordem,
      atualizado_em: new Date().toISOString(),
      atualizado_por: opcoes?.atualizadoPor ?? null,
    },
    { onConflict: 'empresa_id,cargo' },
  );

  if (error) {
    console.warn('[menuLateral.service] salvarOrdemMenu:', error.message);
    return false;
  }
  return true;
}
