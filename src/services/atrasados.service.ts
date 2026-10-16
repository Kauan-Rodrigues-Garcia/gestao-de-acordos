/**
 * atrasados.service — o acordo pendente que venceu vira «Não Pago».
 *
 * Quem chama é `useMarcarAtrasados`, uma vez por sessão, no navegador de quem
 * entra no sistema. Não há rotina no servidor fazendo isso: é o login das
 * pessoas que move a fila.
 *
 * ## Os três defeitos que esta versão fecha (16/10/2026)
 *
 * **1. Desfazia pagamento.** A gravação era `update … in(ids)`, sem conferir o
 * status de novo. Um acordo marcado como pago entre a leitura e a gravação
 * voltava para «Não Pago». Agora o `update` só vale para quem AINDA está em
 * `verificar_pendente` — o banco decide, na mesma instrução.
 *
 * **2. Notificava em dobro.** Dois líderes entrando juntos liam a mesma fila,
 * os dois gravavam e os dois notificavam: o operador recebia o aviso duas
 * vezes. Agora o `update` devolve as linhas que ELE mudou (`.select`), e só
 * elas são notificadas. Quem chegou segundo não muda nada e não avisa ninguém.
 *
 * **3. Pesava no banco e podia falhar inteiro.** Era uma notificação por
 * acordo, uma requisição cada, e a lista de ids ia inteira na URL — com
 * algumas centenas de atrasados, passava do tamanho que o servidor aceita, e
 * a conversão falhava toda. Agora vai em blocos de 100, e as notificações de
 * cada bloco num `insert` só.
 *
 * A leitura também pagina: com mais de 1000 atrasados, o PostgREST cortava a
 * fila sem avisar, e o resto esperava a próxima sessão.
 */
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate } from '@/lib/index';
import { lerTodasAsPaginas } from '@/lib/lerTodasAsPaginas';

/** Ids por pedido. A lista vai na URL do PostgREST. */
export const BLOCO_ATRASADOS = 100;

interface Atrasado {
  id: string;
  operador_id: string | null;
  instituicao: string | null;
  nr_cliente: string | null;
  nome_cliente: string | null;
  valor: number;
  vencimento: string;
  empresa_id: string;
}

/**
 * Converte os atrasados e avisa os donos.
 *
 * `operadorId` nulo = a empresa inteira (quem enxerga além de si no
 * Dashboard); preenchido = só a fila dessa pessoa.
 *
 * Devolve quantos ESTA chamada converteu — os que outro navegador converteu
 * primeiro não contam, e não são notificados de novo.
 */
export async function converterAtrasados(p: {
  empresaId: string;
  operadorId: string | null;
  hoje: string;
}): Promise<number> {
  const atrasados = await lerTodasAsPaginas<Atrasado>((de, ate) => {
    let q = supabase
      .from('acordos')
      .select('id, operador_id, instituicao, nr_cliente, nome_cliente, valor, vencimento, empresa_id')
      .eq('empresa_id', p.empresaId)
      .eq('status', 'verificar_pendente')
      .lt('vencimento', p.hoje);
    if (p.operadorId) q = q.eq('operador_id', p.operadorId);
    return q.order('id', { ascending: true }).range(de, ate);
  });
  if (atrasados.length === 0) return 0;

  const porId = new Map(atrasados.map(a => [a.id, a]));
  let convertidos = 0;

  for (let i = 0; i < atrasados.length; i += BLOCO_ATRASADOS) {
    const ids = atrasados.slice(i, i + BLOCO_ATRASADOS).map(a => a.id);
    const { data, error } = await supabase
      .from('acordos')
      .update({ status: 'nao_pago' })
      .in('id', ids)
      // A trava do defeito 1: pago (ou convertido por outro) no meio do
      // caminho não é tocado.
      .eq('status', 'verificar_pendente')
      .select('id');
    if (error) {
      console.warn('[atrasados] erro ao atualizar:', error.message);
      continue;
    }

    // Só quem ESTA gravação mudou — a trava do defeito 2.
    const mudados = ((data ?? []) as { id: string }[])
      .map(r => porId.get(r.id))
      .filter((a): a is Atrasado => !!a);
    convertidos += mudados.length;

    const avisos = mudados
      .filter(a => !!a.operador_id)
      .map(a => {
        const identificador = a.instituicao
          ? `Código ${a.instituicao}`
          : `NR ${a.nr_cliente || '—'} — ${a.nome_cliente || ''}`;
        return {
          usuario_id: a.operador_id as string,
          titulo:     'Acordo movido para Não Pago',
          mensagem:   `Acordo ${identificador} foi movido para "Não Pago" por atraso de pagamento.\nValor: ${formatCurrency(a.valor)}\nVencimento: ${formatDate(a.vencimento)}`,
          empresa_id: a.empresa_id,
          acordo_id:  a.id,
        };
      });
    if (avisos.length > 0) {
      const { error: erroAviso } = await supabase.from('notificacoes').insert(avisos);
      if (erroAviso) console.warn('[atrasados] erro ao notificar:', erroAviso.message);
    }
  }

  return convertidos;
}
