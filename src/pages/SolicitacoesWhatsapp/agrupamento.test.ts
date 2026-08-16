/**
 * agrupamento.test.ts
 *
 * A divisão em baldes é a regra inteira da aba 2.0. Se ela errar, o pedido
 * aparece no bloco errado — e o bloco errado é justamente o que nasce
 * recolhido, então o pedido some da vista sem ninguém perceber.
 */
import { describe, it, expect } from 'vitest';
import {
  baldeDoPedido, separarEmBaldes, agruparPor, valeAgrupar, SEM_PESSOA,
} from './agrupamento';
import type {
  SolicitacaoWhatsapp, StatusSolicitacao,
} from '@/services/solicitacoesWhatsapp.service';

const EU = 'u-eu';
const JOAO = { id: 'u-joao', nome: 'João Silva', foto_url: null };
const ANA  = { id: 'u-ana',  nome: 'Ana Paula',  foto_url: null };

function ped(over: Partial<SolicitacaoWhatsapp> & { id: string }): SolicitacaoWhatsapp {
  return {
    empresa_id: 'e-1',
    solicitante_id: EU,
    setor_id: null, equipe_id: null,
    codigo_cliente: '123', nome_cliente: 'Cliente', estado_uf: 'PB',
    whatsapp: '83999999999', categoria: 'proposta', mensagem: 'oi',
    status: 'pendente' as StatusSolicitacao,
    responsavel_id: null,
    iniciado_em: null, finalizado_em: null,
    criado_em: '2026-08-10T12:00:00Z', atualizado_em: '2026-08-10T12:00:00Z',
    solicitante: null, responsavel: null,
    ...over,
  } as SolicitacaoWhatsapp;
}

describe('baldeDoPedido', () => {
  it('feito é histórico, mesmo que eu seja o responsável', () => {
    expect(baldeDoPedido({ status: 'feito', responsavel_id: EU }, EU)).toBe('concluidos');
  });

  it('pendente é fila, sempre', () => {
    expect(baldeDoPedido({ status: 'pendente', responsavel_id: null }, EU)).toBe('fila');
  });

  it('em andamento comigo é minha mesa', () => {
    expect(baldeDoPedido({ status: 'em_andamento', responsavel_id: EU }, EU)).toBe('comigo');
  });

  it('em andamento com outra pessoa não é minha mesa', () => {
    expect(baldeDoPedido({ status: 'em_andamento', responsavel_id: JOAO.id }, EU)).toBe('outros');
  });

  /**
   * `falta_info` tem ZERO linhas em produção. Não ganha bloco próprio — segue
   * quem atende, como qualquer pedido em andamento.
   */
  it('falta_info acompanha quem atende, sem bloco próprio', () => {
    expect(baldeDoPedido({ status: 'falta_info', responsavel_id: EU }, EU)).toBe('comigo');
    expect(baldeDoPedido({ status: 'falta_info', responsavel_id: JOAO.id }, EU)).toBe('outros');
  });

  /**
   * Acontece quando alguém muda o status sem assumir. Ninguém está com ele, e
   * mandá-lo para "com outra pessoa" o esconderia num bloco recolhido.
   */
  it('em andamento sem responsável volta para a fila', () => {
    expect(baldeDoPedido({ status: 'em_andamento', responsavel_id: null }, EU)).toBe('fila');
    expect(baldeDoPedido({ status: 'falta_info', responsavel_id: null }, EU)).toBe('fila');
  });

  /** Sem sessão nada é "meu" — não pode cair na mesa de ninguém. */
  it('sem usuário, o que está em andamento é sempre de outro', () => {
    expect(baldeDoPedido({ status: 'em_andamento', responsavel_id: JOAO.id }, null)).toBe('outros');
  });
});

describe('separarEmBaldes', () => {
  const lista = [
    ped({ id: 'a', status: 'em_andamento', responsavel_id: EU,      criado_em: '2026-08-10T00:00:00Z' }),
    ped({ id: 'b', status: 'em_andamento', responsavel_id: EU,      criado_em: '2026-08-01T00:00:00Z' }),
    ped({ id: 'c', status: 'pendente',                              criado_em: '2026-08-14T00:00:00Z' }),
    ped({ id: 'd', status: 'em_andamento', responsavel_id: JOAO.id, criado_em: '2026-08-05T00:00:00Z' }),
    ped({ id: 'e', status: 'feito',        responsavel_id: JOAO.id, criado_em: '2026-08-02T00:00:00Z' }),
    ped({ id: 'f', status: 'feito',        responsavel_id: JOAO.id, criado_em: '2026-08-12T00:00:00Z' }),
  ];

  it('cada pedido cai em um balde só, e nenhum se perde', () => {
    const b = separarEmBaldes(lista, EU);
    const total = b.comigo.length + b.fila.length + b.outros.length + b.concluidos.length;
    expect(total).toBe(lista.length);
  });

  it('o que espera há mais tempo sobe nos baldes em aberto', () => {
    const b = separarEmBaldes(lista, EU);
    expect(b.comigo.map(s => s.id)).toEqual(['b', 'a']);
  });

  /** Histórico: o de ontem interessa mais que o do mês passado. */
  it('concluídos vêm do mais novo para o mais antigo', () => {
    const b = separarEmBaldes(lista, EU);
    expect(b.concluidos.map(s => s.id)).toEqual(['f', 'e']);
  });

  it('lista vazia devolve os quatro baldes vazios, não undefined', () => {
    const b = separarEmBaldes([], EU);
    expect(b).toEqual({ comigo: [], fila: [], outros: [], concluidos: [] });
  });

  /**
   * Quem só vê os próprios pedidos nunca é responsável — ser responsável dá
   * visão geral. `comigo` nasce vazio e o bloco some sozinho, sem ramo por
   * papel em lugar nenhum.
   */
  it('para quem só vê os próprios pedidos, a mesa fica vazia', () => {
    const b = separarEmBaldes(lista, 'u-solicitante-qualquer');
    expect(b.comigo).toHaveLength(0);
    expect(b.outros.map(s => s.id)).toEqual(['b', 'd', 'a']);
  });
});

describe('agruparPor', () => {
  const lista = [
    ped({ id: 'a', solicitante_id: JOAO.id, solicitante: JOAO, responsavel_id: ANA.id,  responsavel: ANA }),
    ped({ id: 'b', solicitante_id: ANA.id,  solicitante: ANA,  responsavel_id: ANA.id,  responsavel: ANA }),
    ped({ id: 'c', solicitante_id: JOAO.id, solicitante: JOAO, responsavel_id: JOAO.id, responsavel: JOAO }),
  ];

  it('por solicitante junta quem abriu', () => {
    const g = agruparPor(lista, 'solicitante');
    expect(g.map(x => x.pessoa?.nome)).toEqual(['Ana Paula', 'João Silva']);
    expect(g[1].itens.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('por responsável junta quem atende', () => {
    const g = agruparPor(lista, 'responsavel');
    expect(g.find(x => x.id === ANA.id)?.itens.map(s => s.id)).toEqual(['a', 'b']);
  });

  /** Ordem estável entre aberturas: por nome, nunca por tamanho do grupo. */
  it('ordena por nome, não pelo tamanho do grupo', () => {
    const g = agruparPor(lista, 'responsavel');
    expect(g.map(x => x.pessoa?.nome)).toEqual(['Ana Paula', 'João Silva']);
  });

  it('preserva a ordem que a lista trazia dentro do grupo', () => {
    const g = agruparPor([lista[2], lista[0]], 'solicitante');
    expect(g[0].itens.map(s => s.id)).toEqual(['c', 'a']);
  });

  it('quem não tem a pessoa do eixo cai num grupo próprio, no fim', () => {
    const g = agruparPor([...lista, ped({ id: 'd', responsavel_id: null })], 'responsavel');
    expect(g[g.length - 1].id).toBe(SEM_PESSOA);
    expect(g[g.length - 1].itens.map(s => s.id)).toEqual(['d']);
  });

  /**
   * O primeiro pedido do grupo pode chegar antes de o diretório resolver o
   * nome. Sem isto o bloco inteiro ficaria "Sem nome" por causa de uma linha.
   */
  it('um pedido sem o join não deixa o grupo anônimo', () => {
    const g = agruparPor([
      ped({ id: 'x', solicitante_id: JOAO.id, solicitante: null }),
      ped({ id: 'y', solicitante_id: JOAO.id, solicitante: JOAO }),
    ], 'solicitante');
    expect(g).toHaveLength(1);
    expect(g[0].pessoa?.nome).toBe('João Silva');
  });
});

describe('valeAgrupar', () => {
  it('um grupo só não vira cabeçalho', () => {
    expect(valeAgrupar(agruparPor([ped({ id: 'a' })], 'solicitante'))).toBe(false);
  });

  it('dois ou mais, sim', () => {
    expect(valeAgrupar(agruparPor([
      ped({ id: 'a', solicitante_id: JOAO.id, solicitante: JOAO }),
      ped({ id: 'b', solicitante_id: ANA.id,  solicitante: ANA }),
    ], 'solicitante'))).toBe(true);
  });

  it('lista vazia não agrupa', () => {
    expect(valeAgrupar([])).toBe(false);
  });
});
