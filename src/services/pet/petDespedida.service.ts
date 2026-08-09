/**
 * petDespedida.service — grava que o usuário já se despediu do mascote.
 *
 * ## Por que isto é um serviço, e não duas linhas no componente
 *
 * Era duas linhas no componente, e estava quebrado: a despedida aparecia de
 * novo a cada recarga da página. O motivo é uma armadilha do supabase-js —
 * `supabase.from(...).update(...).eq(...)` devolve um builder **preguiçoso**,
 * e a requisição HTTP só é disparada quando alguém chama `.then()` (por
 * `await` ou `.then` explícito). O código fazia:
 *
 *     void supabase.from('perfis').update({...}).eq('id', id);   // ← nunca envia
 *
 * `void` avalia a expressão e joga fora — sem nunca invocar `.then()`. Nenhum
 * pedido saía, nenhum erro aparecia, e o banco continuava com 'pendente'.
 *
 * Todo outro `void supabase.from(...)` do projeto encadeia `.then(...)`; os
 * dois updates de `perfis` que já existiam usam `await`. Este era o único fora
 * do padrão.
 *
 * Aqui a gravação fica isolada, é de fato aguardada, e o erro vira log em vez
 * de silêncio. Ver `petDespedida.service.test.ts`, que falha se a requisição
 * voltar a não ser executada.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

/**
 * Marca a despedida como concluída para este usuário.
 *
 * Devolve `true` quando gravou. Em caso de falha devolve `false` e registra o
 * motivo: a despedida na tela não é desfeita (o adeus já aconteceu), mas o card
 * volta na próxima sessão — que é o comportamento desejado quando a gravação
 * não aconteceu.
 */
export async function concluirDespedidaPet(usuarioId: string): Promise<boolean> {
  if (!usuarioId) return false;

  const { error } = await supabase
    .from('perfis')
    .update({ pet_despedida: 'concluida' })
    .eq('id', usuarioId);

  if (error) {
    logger.warn('[petDespedida] não consegui gravar a despedida:', error.message);
    return false;
  }
  return true;
}
