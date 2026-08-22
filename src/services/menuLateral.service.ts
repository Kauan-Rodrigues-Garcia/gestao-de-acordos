/**
 * menuLateral.service — leitura e gravação da ordem das abas.
 *
 * A tabela `menu_lateral_ordem` nasce na migration desta mesma entrega, então
 * `database.types.ts` só passa a conhecê-la depois de `supabase db push` e da
 * regeneração dos tipos. Até lá o acesso passa por um cast estreito, isolado
 * nas duas funções abaixo — quando os tipos forem regerados, os casts saem e
 * nada mais muda.
 *
 * Falha de leitura NÃO é erro fatal: sem ordem salva o menu usa a do código.
 * Isso também cobre o intervalo entre publicar o frontend e aplicar a
 * migration, quando a tabela ainda não existe.
 */

import { supabase } from '@/lib/supabase';

const TABELA = 'menu_lateral_ordem';

interface LinhaOrdem {
  empresa_id: string;
  ordem: string[] | null;
}

/** Só o `from` precisa escapar da tipagem gerada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from(TABELA);

/** A ordem salva da empresa, ou `[]` quando não há nenhuma. */
export async function carregarOrdemMenu(empresaId: string): Promise<string[]> {
  const { data, error } = await tabela()
    .select('empresa_id, ordem')
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    console.warn('[menuLateral.service] carregarOrdemMenu:', error.message);
    return [];
  }
  return ((data as LinhaOrdem | null)?.ordem) ?? [];
}

/**
 * Grava a ordem. Array vazio significa "volta ao padrão do código".
 *
 * Devolve `true` só quando o banco confirmou. Quem chama usa isso para decidir
 * entre avisar sucesso e avisar falha — gravar em silêncio e mostrar sucesso
 * seria a pior das saídas num painel de configuração.
 */
export async function salvarOrdemMenu(
  empresaId: string,
  ordem: string[],
  atualizadoPor?: string,
): Promise<boolean> {
  const { error } = await tabela().upsert(
    {
      empresa_id: empresaId,
      ordem,
      atualizado_em: new Date().toISOString(),
      atualizado_por: atualizadoPor ?? null,
    },
    { onConflict: 'empresa_id' },
  );

  if (error) {
    console.warn('[menuLateral.service] salvarOrdemMenu:', error.message);
    return false;
  }
  return true;
}
