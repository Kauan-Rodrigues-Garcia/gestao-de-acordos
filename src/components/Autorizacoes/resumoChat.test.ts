/**
 * resumoChat.test.ts — a conversa «Autorizações» na lista do chat.
 *
 * O que se perde se isto quebrar: pedido esperando escondido no meio da lista,
 * o aviso sumindo antes de alguém decidir, ou o líder sendo avisado do próprio
 * pedido.
 */
import { describe, it, expect } from 'vitest';
import type { PedidoAutorizacao } from '@/services/autorizacaoPedidos.service';
import {
  pedidosQueChegaram, posicaoDasAutorizacoes, resumoDasAutorizacoes, tituloDasAutorizacoes,
} from './resumoChat';

const AGORA = Date.parse('2026-10-15T15:00:00Z');
const FUTURO = '2026-10-16T15:00:00Z';

function pedido(over: Partial<PedidoAutorizacao>): PedidoAutorizacao {
  return {
    id: 'p1', empresa_id: 'e', solicitante_id: 'op', solicitante_nome: 'Ana Souza', setor_id: 's',
    modo: 'transferencia_completa', nr_label: 'NR', nr_valor: '123', acordo_alvo_id: null,
    dono_id: null, dono_nome: null, extra_atual_id: null, extra_atual_op_id: null,
    extra_atual_op_nome: null, resumo: {}, status: 'pendente', decidido_por_id: null,
    decidido_por_nome: null, decidido_em: null, motivo_recusa: null, erro: null,
    acordo_criado_id: null, criado_em: '2026-10-15T14:00:00Z', expira_em: FUTURO, ...over,
  };
}

describe('tituloDasAutorizacoes', () => {
  it('líder vê o próprio setor; diretoria vê a empresa', () => {
    expect(tituloDasAutorizacoes('lider', 'Play 3')).toBe('Autorizações · Play 3');
    expect(tituloDasAutorizacoes('diretoria', 'Play 3')).toBe('Autorizações · todos os setores');
    expect(tituloDasAutorizacoes('lider', null)).toBe('Autorizações');
  });
});

describe('resumoDasAutorizacoes', () => {
  it('pendente manda: conta e mostra o mais novo', () => {
    const r = resumoDasAutorizacoes([
      pedido({ id: 'a', criado_em: '2026-10-15T13:00:00Z' }),
      pedido({ id: 'b', solicitante_nome: 'Bruno Lima', nr_valor: '999', criado_em: '2026-10-15T14:30:00Z' }),
    ], AGORA);
    expect(r.pendentes).toBe(2);
    expect(r.previa).toBe('Bruno pede autorização · NR 999 · e mais 1');
  });

  it('vencido não conta como pendente', () => {
    const r = resumoDasAutorizacoes([pedido({ expira_em: '2026-10-15T14:59:00Z' })], AGORA);
    expect(r.pendentes).toBe(0);
  });

  it('sem pendente, mostra a última decisão', () => {
    const r = resumoDasAutorizacoes([
      pedido({ status: 'aprovado', decidido_por_nome: 'Carla Dias', decidido_em: '2026-10-15T14:10:00Z' }),
    ], AGORA);
    expect(r.previa).toBe('Aprovado por Carla · NR 123');
    expect(r.ultimaEm).toBe('2026-10-15T14:10:00Z');
  });

  it('lista vazia não quebra', () => {
    expect(resumoDasAutorizacoes([], AGORA)).toEqual({ pendentes: 0, previa: 'Nenhum pedido por enquanto', ultimaEm: null });
  });
});

describe('posicaoDasAutorizacoes', () => {
  const conversas = [
    { fixada: true, ultima_mensagem_em: '2026-10-15T09:00:00Z' },
    { fixada: false, ultima_mensagem_em: '2026-10-15T14:00:00Z' },
    { fixada: false, ultima_mensagem_em: '2026-10-15T12:00:00Z' },
  ];

  it('com pendência vai para o topo, acima das fixadas', () => {
    expect(posicaoDasAutorizacoes(conversas, { pendentes: 1, ultimaEm: null })).toBe(0);
  });

  it('sem pendência entra pela hora, depois das fixadas', () => {
    expect(posicaoDasAutorizacoes(conversas, { pendentes: 0, ultimaEm: '2026-10-15T13:00:00Z' })).toBe(2);
    expect(posicaoDasAutorizacoes(conversas, { pendentes: 0, ultimaEm: '2026-10-15T15:00:00Z' })).toBe(1);
    expect(posicaoDasAutorizacoes(conversas, { pendentes: 0, ultimaEm: null })).toBe(3);
  });
});

describe('pedidosQueChegaram', () => {
  it('só o pendente novo, e nunca o meu', () => {
    const lista = [
      pedido({ id: 'velho' }),
      pedido({ id: 'novo' }),
      pedido({ id: 'meu', solicitante_id: 'eu' }),
      pedido({ id: 'decidido', status: 'aprovado' }),
    ];
    expect(pedidosQueChegaram(new Set(['velho']), lista, 'eu', AGORA).map((p) => p.id)).toEqual(['novo']);
  });
});
