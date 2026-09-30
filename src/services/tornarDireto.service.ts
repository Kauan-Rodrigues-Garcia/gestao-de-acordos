/**
 * tornarDireto.service.ts — EXTRA vira DIRETO (e DIRETO sem par vira EXTRA).
 *
 * ## Nada aqui decide nada
 *
 * As três operações são RPCs `SECURITY DEFINER` da migration `20260930150000`.
 * O botão antigo do detalhe fazia o caminho inteiro no navegador — lia o DIRETO
 * do colega, mandava para a lixeira e dava `DELETE` — e com a RLS de quem clica
 * o DELETE de acordo alheio afetava zero linhas sem erro. O servidor enxerga os
 * dois lados e decide numa transação só.
 *
 * ## Os dois caminhos
 *
 *   • EXTRA manual (ninguém segura o NR/Código): o dono confirma e vira DIRETO.
 *   • EXTRA vinculado (é o DIRETO de outra pessoa): vira pedido na gaveta de
 *     autorizações — ou executa na hora, se quem clica já pode decidir
 *     (chave `acordos_autorizar_tornar_direto`).
 */

import { rpcSemTipo } from '@/lib/supabaseSemTipo';

export interface PreviaTornarDireto {
  /** O NR/Código é o DIRETO de outra pessoa — vai tirar dela. */
  vinculado: boolean;
  donoId: string | null;
  donoNome: string | null;
  nrLabel: string;
  nrValor: string | null;
  souDono: boolean;
  /** Quem olha já pode decidir: confirmar executa, sem pedido. */
  souAutorizador: boolean;
  /** Já existe pedido em análise para este acordo. */
  pedidoPendenteId: string | null;
}

export type ResultadoTornarDireto =
  | {
      ok: true; resultado: 'convertido'; vinculado: boolean; donoAnterior: string | null;
      /** O DIRETO do colega que foi para a lixeira — a lista tira a linha. */
      diretoRemovidoId: string | null;
    }
  | { ok: true; resultado: 'pedido'; repetido: boolean }
  | { ok: false; erro: string };

export type ResultadoTornarExtra =
  | { ok: true }
  | { ok: false; erro: string };

const ERROS: Record<string, string> = {
  sem_sessao:          'Sessão expirada. Entre novamente.',
  acordo_inexistente:  'O acordo não existe mais.',
  empresa_negada:      'Este acordo é de outra empresa.',
  nao_e_extra:         'Este acordo não é EXTRA.',
  nao_autorizado:      'Você não tem permissão para mudar o vínculo deste acordo.',
  direto_com_extra:    'Este acordo é o DIRETO de um par: outra pessoa tem ele como EXTRA.',
  falha_tornar_direto: 'Não foi possível tornar o acordo DIRETO. Nada foi alterado.',
};

export function mensagemTornarDireto(codigo: string | null | undefined, extra?: string | null): string {
  const c = String(codigo ?? '').trim();
  if (c === 'direto_com_extra' && extra) {
    return `Este acordo é o DIRETO de um par: ${extra} tem ele como EXTRA. `
      + 'Para inverter, quem tem o EXTRA usa «Tornar direto».';
  }
  return ERROS[c] ?? (c ? `Não foi possível concluir (${c}).` : 'Não foi possível concluir.');
}

/** O que vai acontecer se a pessoa confirmar. Só leitura. */
export async function previaTornarDireto(acordoId: string): Promise<PreviaTornarDireto | { erro: string }> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>>('fn_tornar_direto_previa', { p_acordo_id: acordoId });
  if (error) return { erro: error.message };
  const r = data;
  if (!r?.ok) return { erro: mensagemTornarDireto(r?.erro as string | undefined) };
  return {
    vinculado:        r.vinculado === true,
    donoId:           (r.dono_id as string | null) ?? null,
    donoNome:         (r.dono_nome as string | null) ?? null,
    nrLabel:          String(r.nr_label ?? 'NR'),
    nrValor:          (r.nr_valor as string | null) ?? null,
    souDono:          r.sou_dono === true,
    souAutorizador:   r.sou_autorizador === true,
    pedidoPendenteId: (r.pedido_pendente as string | null) ?? null,
  };
}

/** Executa (manual ou autorizador) ou abre o pedido (vinculado). */
export async function tornarDireto(acordoId: string): Promise<ResultadoTornarDireto> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>>('fn_tornar_direto', { p_acordo_id: acordoId });
  if (error) return { ok: false, erro: error.message };
  const r = data;
  if (!r?.ok) return { ok: false, erro: mensagemTornarDireto(r?.erro as string | undefined) };
  if (r.resultado === 'pedido') return { ok: true, resultado: 'pedido', repetido: r.repetido === true };
  return {
    ok: true, resultado: 'convertido',
    vinculado: r.vinculado === true,
    donoAnterior: (r.dono_anterior as string | null) ?? null,
    diretoRemovidoId: (r.direto_removido as string | null) ?? null,
  };
}

/** DIRETO sem EXTRA vinculado passa a EXTRA (acompanhamento). */
export async function tornarExtra(acordoId: string): Promise<ResultadoTornarExtra> {
  const { data, error } = await rpcSemTipo<Record<string, unknown>>('fn_tornar_extra', { p_acordo_id: acordoId });
  if (error) return { ok: false, erro: error.message };
  const r = data;
  if (!r?.ok) return { ok: false, erro: mensagemTornarDireto(r?.erro as string | undefined, r?.extra_nome as string | undefined) };
  return { ok: true };
}
