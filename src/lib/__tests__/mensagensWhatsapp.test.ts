/**
 * As mensagens de WhatsApp por status (pedido de 28/09/2026).
 *
 * O que importa provar: quem nunca abriu o editor manda EXATAMENTE o texto de
 * antes; as variáveis viram o dado do cliente; e a padrão é a primeira do
 * grupo certo.
 */
import { describe, it, expect } from 'vitest';
import type { Acordo } from '@/lib/supabase';
import { buildMensagem } from '@/pages/Dashboard/helpers';
import { formatCurrency } from '@/lib/index';
import {
  grupoDoStatus, preencherMensagem, valoresDoAcordo, mensagemParaAcordo,
  mensagensDoGrupo, variaveisDesconhecidas, LIMITE_DO_GRUPO,
  type MensagemWhatsapp,
} from '../mensagensWhatsapp';

function acordo(p: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a1', nome_cliente: 'Maria da Silva', nr_cliente: '13073500',
    data_cadastro: '2026-09-01', vencimento: '2026-09-30', valor: 350,
    tipo: 'boleto', parcelas: 5, numero_parcela: 2, whatsapp: '11999999999',
    status: 'verificar_pendente', operador_id: 'op', setor_id: null,
    observacoes: null, estado_uf: 'SP', instituicao: 'Coren-SP',
    criado_em: '2026-09-01T00:00:00Z', atualizado_em: '2026-09-01T00:00:00Z',
    ...p,
  };
}

const msg = (p: Partial<MensagemWhatsapp>): MensagemWhatsapp => ({
  id: 'm', status: 'pendente', titulo: 'M', conteudo: 'x', ordem: 0, ...p,
});

describe('sem mensagem própria, nada muda', () => {
  it.each(['verificar_pendente', 'pago', 'nao_pago'] as const)('status %s manda o texto de sempre', status => {
    const a = acordo({ status });
    expect(mensagemParaAcordo(a, [])).toBe(buildMensagem(a));
  });
});

describe('grupos e limites', () => {
  it('pendente junta tudo que não é pago nem não pago', () => {
    expect(grupoDoStatus('verificar_pendente')).toBe('pendente');
    expect(grupoDoStatus('pago')).toBe('pago');
    expect(grupoDoStatus('nao_pago')).toBe('nao_pago');
  });

  it('os limites do pedido: 3 pendente, 2 pago, 5 não pago', () => {
    expect(LIMITE_DO_GRUPO).toEqual({ pendente: 3, pago: 2, nao_pago: 5 });
  });
});

describe('as variáveis', () => {
  it('viram o dado do cliente', () => {
    const texto = preencherMensagem(
      'Oi {{primeiro_nome}}, NR {{nr_cliente}}, {{valor}} em {{vencimento}} ({{forma_pagamento}} {{parcela}}) — {{operador}}',
      valoresDoAcordo(acordo(), 'Ana'),
    );
    // `formatCurrency` usa o espaço inseparável do Intl entre «R$» e o número.
    expect(texto).toBe(`Oi Maria, NR 13073500, ${formatCurrency(350)} em 30/09/2026 (Boleto 2/5) — Ana`);
  });

  it('aceita espaço e maiúscula dentro das chaves', () => {
    expect(preencherMensagem('{{ NOME_CLIENTE }}', valoresDoAcordo(acordo()))).toBe('Maria da Silva');
  });

  it('variável que não existe fica escrita, e o editor avisa', () => {
    expect(preencherMensagem('{{nome}}', valoresDoAcordo(acordo()))).toBe('{{nome}}');
    expect(variaveisDesconhecidas('{{nome}} {{valor}} {{cpf}}')).toEqual(['nome', 'cpf']);
  });

  it('acordo de parcela única não escreve «1/1»', () => {
    expect(valoresDoAcordo(acordo({ parcelas: 1, numero_parcela: 1 })).parcela).toBe('');
  });
});

describe('qual mensagem sai', () => {
  const mensagens = [
    msg({ id: 'p2', status: 'pendente', titulo: 'Segunda', conteudo: 'P2 {{nr_cliente}}', ordem: 1 }),
    msg({ id: 'p1', status: 'pendente', titulo: 'Primeira', conteudo: 'P1 {{nr_cliente}}', ordem: 0 }),
    msg({ id: 'n1', status: 'nao_pago', titulo: 'Atraso', conteudo: 'N1', ordem: 0 }),
  ];

  it('a padrão é a de menor ordem do grupo do status', () => {
    expect(mensagemParaAcordo(acordo(), mensagens)).toBe('P1 13073500');
    expect(mensagemParaAcordo(acordo({ status: 'nao_pago' }), mensagens)).toBe('N1');
  });

  it('escolher uma do grupo manda aquela', () => {
    expect(mensagemParaAcordo(acordo(), mensagens, null, 'p2')).toBe('P2 13073500');
  });

  it('pago sem mensagem própria cai no texto do sistema, mesmo com outras salvas', () => {
    const a = acordo({ status: 'pago' });
    expect(mensagemParaAcordo(a, mensagens)).toBe(buildMensagem(a));
  });

  it('mensagensDoGrupo ordena e filtra', () => {
    expect(mensagensDoGrupo(mensagens, 'pendente').map(m => m.id)).toEqual(['p1', 'p2']);
  });
});
