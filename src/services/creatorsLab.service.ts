/**
 * creatorsLab.service.ts — o progresso do Creators Lab preso ao usuário.
 * ─────────────────────────────────────────────────────────────────────────────
 * Antes o "descobriu o Easter Egg" e as conquistas moravam só em localStorage,
 * o que prendia o distintivo ao NAVEGADOR: quem descobria em casa chegava no
 * trabalho sem nada, e limpar cache apagava tudo. Agora a fonte da verdade é a
 * tabela `creators_lab_progresso` (migration 20260816210000).
 *
 * ## Tolerância obrigatória
 *
 * Toda função aqui devolve `null`/`false` quando a tabela não existe, quando
 * não há sessão ou quando a rede caiu — nunca lança. O Lab continua
 * funcionando em localStorage nesses casos, exatamente como o pet faz.
 *
 * Isso não é excesso de zelo: a migration é aplicada à mão no SQL Editor, e
 * entre o deploy do front e a aplicação da migration existe uma janela em que
 * a tabela não está lá. Um Easter Egg não pode derrubar página nenhuma.
 */
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import { logger } from '@/lib/logger';

/** O que a tabela guarda, já traduzido para o front. */
export interface ProgressoLabRemoto {
  /** O objeto `Progresso` de `lib/conquistas.ts`, cru. */
  progresso: Record<string, unknown>;
  /** Quando a pessoa achou o Lab pela primeira vez. */
  descobertoEm: string;
}

/** Id do usuário logado, ou `null` se não houver sessão. */
async function usuarioAtual(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * O progresso salvo desta pessoa.
 *
 * `null` significa "não deu para saber" (sem sessão, sem tabela, sem rede) e
 * também "nunca entrou" — quem chama trata os dois igual, porque a resposta
 * prática é a mesma: siga pelo que houver no localStorage.
 */
export async function buscarProgressoLab(): Promise<ProgressoLabRemoto | null> {
  const id = await usuarioAtual();
  if (!id) return null;

  const { data, error } = await supabase
    .from('creators_lab_progresso')
    .select('progresso, descoberto_em')
    .eq('usuario_id', id)
    .maybeSingle();

  if (error) {
    // Tabela ainda não migrada é o caso esperado, não um defeito: registra em
    // debug e segue. Qualquer outro erro também não pode derrubar o Lab.
    logger.debug('[creatorsLab] progresso indisponível:', error.message);
    return null;
  }
  if (!data) return null;

  return {
    progresso: (data.progresso as Record<string, unknown>) ?? {},
    descobertoEm: data.descoberto_em as string,
  };
}

/**
 * Grava o progresso desta pessoa.
 *
 * `upsert` pela chave primária: a primeira chamada cria a linha (e com ela o
 * `descoberto_em`, que o banco preenche e nunca mais é tocado), as seguintes
 * atualizam. Devolve `true` só quando gravou de fato.
 */
export async function salvarProgressoLab(progresso: object): Promise<boolean> {
  const id = await usuarioAtual();
  if (!id) return false;

  const { error } = await supabase
    .from('creators_lab_progresso')
    .upsert(
      {
        usuario_id: id,
        // O tipo gerado espera `Json`; o objeto de progresso é feito só de
        // booleanos, números e listas de string, então a conversão é honesta.
        progresso: progresso as Json,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );

  if (error) {
    logger.debug('[creatorsLab] falha ao salvar progresso:', error.message);
    return false;
  }
  return true;
}

/**
 * Só a pergunta do distintivo: esta pessoa já achou o Lab?
 *
 * Existe separado de `buscarProgressoLab` porque quem pergunta é o `Layout`,
 * que roda em toda página do Gestão e não tem nada a ver com conquistas. Traz
 * uma coluna de uma linha.
 */
export async function jaDescobriuOLab(): Promise<boolean> {
  const id = await usuarioAtual();
  if (!id) return false;

  const { data, error } = await supabase
    .from('creators_lab_progresso')
    .select('usuario_id')
    .eq('usuario_id', id)
    .maybeSingle();

  if (error) return false;
  return !!data;
}
