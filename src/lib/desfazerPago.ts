/**
 * desfazerPago.ts — «Marcar como pago» por engano tem volta por 5 minutos.
 *
 * Pedido do Cleber (08/10/2026): depois de marcar um acordo como pago, o
 * botão de pago da linha vira «Desfazer» por alguns minutos, e devolve o
 * acordo ao status de antes (verificar, pendente...). Antes só existia o
 * «Desfazer» do aviso, que some em 5 segundos.
 *
 * O que se desfaz é o que o clique gravou: status, vencimento (o recebimento é
 * atribuído ao vencimento, e marcar pago com data move o vencimento) e
 * `data_pagamento`. A memória é do navegador e do módulo: sobrevive à troca de
 * aba dentro do sistema, não a recarregar a página — e passa sozinha depois de
 * `DESFAZER_PAGO_MS`.
 */
import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

export const DESFAZER_PAGO_MS = 5 * 60_000;

export interface PagoDesfazivel {
  statusAnterior: string;
  vencimentoAnterior: string;
  dataPagamentoAnterior: string | null;
  /** Até quando (epoch ms) o «Desfazer» fica na linha. */
  ate: number;
}

const guardados = new Map<string, PagoDesfazivel>();
const ouvintes = new Set<() => void>();
let versao = 0;
const avisar = () => { versao++; for (const f of ouvintes) f(); };

/** Chamado logo depois de gravar o «pago». */
export function guardarPagoDesfazivel(
  id: string, antes: Omit<PagoDesfazivel, 'ate'>, agora: number = Date.now(),
): void {
  guardados.set(id, { ...antes, ate: agora + DESFAZER_PAGO_MS });
  avisar();
}

export function esquecerPagoDesfazivel(id: string): void {
  if (guardados.delete(id)) avisar();
}

/** O que dá para desfazer neste acordo agora, ou `null` (nada, ou passou da hora). */
export function pagoDesfazivel(id: string, agora: number = Date.now()): PagoDesfazivel | null {
  const g = guardados.get(id);
  if (!g) return null;
  if (g.ate <= agora) { guardados.delete(id); return null; }
  return g;
}

function assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f); }; }

/**
 * A linha da tabela pergunta por aqui. Redesenha quando alguém guarda ou
 * esquece, e de novo na hora em que a janela fecha.
 */
export function usePagoDesfazivel(id: string): PagoDesfazivel | null {
  useSyncExternalStore(assinar, () => versao);
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  const atual = pagoDesfazivel(id);
  const ate = atual?.ate ?? null;
  useEffect(() => {
    if (ate == null) return;
    const t = setTimeout(redesenhar, Math.max(0, ate - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [ate]);
  return atual;
}

/**
 * Para tabela que desenha as linhas sem componente próprio (o Dashboard): o
 * corpo inteiro redesenha quando algo muda e quando a próxima janela fecha;
 * cada linha pergunta com `pagoDesfazivel(id)`.
 */
export function useRelogioDesfazerPago(): void {
  useSyncExternalStore(assinar, () => versao);
  const [, redesenhar] = useReducer((n: number) => n + 1, 0);
  let proxima: number | null = null;
  for (const g of guardados.values()) if (proxima == null || g.ate < proxima) proxima = g.ate;
  useEffect(() => {
    if (proxima == null) return;
    const t = setTimeout(redesenhar, Math.max(0, proxima - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [proxima]);
}

/**
 * Devolve no banco o que o «pago» trocou. Devolve a mensagem de erro, ou
 * `null` quando deu certo. Mesmo recuo do «pago» quando a coluna
 * `data_pagamento` não existe.
 */
export async function desfazerPagoNoBanco(id: string, antes: PagoDesfazivel): Promise<string | null> {
  const base = { status: antes.statusAnterior, vencimento: antes.vencimentoAnterior };
  let { error } = await supabase.from('acordos')
    .update({ ...base, data_pagamento: antes.dataPagamentoAnterior } as never)
    .eq('id', id);
  if (error && (String(error.code) === '42703' || error.message?.toLowerCase().includes('column'))) {
    ({ error } = await supabase.from('acordos').update(base as never).eq('id', id));
  }
  return error ? error.message : null;
}

/** «até 14:35», para o título do botão. */
export function horaLimite(p: PagoDesfazivel): string {
  return new Date(p.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
