/**
 * ordenacao.test.ts — precedência da lista "em aberto".
 *
 * A regra tem três níveis e a ordem entre eles é o que o usuário pediu
 * explicitamente: o que eu assumi vem antes da fila, e o tempo de espera só
 * desempata DENTRO de cada faixa. Trocar a ordem dos critérios não quebra
 * compilação nenhuma — por isso os casos abaixo.
 */
import { describe, it, expect } from 'vitest';
import { ordenarEmAberto, faixaPrioridade } from './ordenacao';
import type {
  SolicitacaoWhatsapp, StatusSolicitacao,
} from '@/services/solicitacoesWhatsapp.service';

const EU    = 'user-eu';
const OUTRO = 'user-outro';

/** Só os campos que a ordenação lê; o resto é preenchido para satisfazer o tipo. */
function pedido(over: {
  id:            string;
  status:        StatusSolicitacao;
  responsavel_id?: string | null;
  solicitante_id?: string;
  criado_em?:    string;
}): SolicitacaoWhatsapp {
  return {
    id:             over.id,
    empresa_id:     'emp',
    solicitante_id: over.solicitante_id ?? OUTRO,
    setor_id:       null,
    equipe_id:      null,
    codigo_cliente: '1',
    nome_cliente:   null,
    estado_uf:      null,
    whatsapp:       '11999999999',
    categoria:      'outros',
    mensagem:       '',
    status:         over.status,
    responsavel_id: over.responsavel_id ?? null,
    iniciado_em:    null,
    finalizado_em:  null,
    criado_em:      over.criado_em ?? '2026-07-30T12:00:00.000Z',
    atualizado_em:  '2026-07-30T12:00:00.000Z',
  };
}

const ids = (l: SolicitacaoWhatsapp[]) => l.map(s => s.id);

describe('faixaPrioridade', () => {
  // Faixa 0 é "assumido por mim", em qualquer status em aberto.
  it.each(['pendente', 'em_andamento', 'falta_info'] as StatusSolicitacao[])(
    '%s assumido por mim é faixa 0',
    status => { expect(faixaPrioridade({ status, responsavel_id: EU }, EU)).toBe(0); },
  );

  it('pendente sem dono é faixa 1', () => {
    expect(faixaPrioridade({ status: 'pendente', responsavel_id: null }, EU)).toBe(1);
  });
  it('pendente assumido por outro cai na fila comum', () => {
    expect(faixaPrioridade({ status: 'pendente', responsavel_id: OUTRO }, EU)).toBe(1);
  });
  it('em_andamento de outro é faixa 2', () => {
    expect(faixaPrioridade({ status: 'em_andamento', responsavel_id: OUTRO }, EU)).toBe(2);
  });
  it('falta_info de outro é faixa 2', () => {
    expect(faixaPrioridade({ status: 'falta_info', responsavel_id: OUTRO }, EU)).toBe(2);
  });
  it('sem usuário logado nada é "meu"', () => {
    expect(faixaPrioridade({ status: 'pendente', responsavel_id: EU }, null)).toBe(1);
  });
});

describe('ordenarEmAberto', () => {
  it('o que assumi vem antes da fila de pendentes', () => {
    const lista = [
      pedido({ id: 'fila',    status: 'pendente' }),
      pedido({ id: 'meu',     status: 'pendente',   responsavel_id: EU }),
      pedido({ id: 'meu-fi',  status: 'falta_info', responsavel_id: EU }),
    ];
    // os dois meus primeiro (empate de data mantém a ordem de entrada), fila depois
    expect(ids(ordenarEmAberto(lista, EU))).toEqual(['meu', 'meu-fi', 'fila']);
  });

  it('pedido MUITO mais antigo de outro não passa na frente do que eu assumi', () => {
    const lista = [
      pedido({ id: 'antigo-de-outro', status: 'pendente', criado_em: '2026-07-01T08:00:00.000Z' }),
      pedido({ id: 'meu-de-hoje',     status: 'pendente', responsavel_id: EU,
               criado_em: '2026-07-30T17:00:00.000Z' }),
    ];
    expect(ids(ordenarEmAberto(lista, EU))).toEqual(['meu-de-hoje', 'antigo-de-outro']);
  });

  it('dentro da mesma faixa, o mais antigo sobe', () => {
    const lista = [
      pedido({ id: 'novo',  status: 'pendente', responsavel_id: EU, criado_em: '2026-07-30T18:00:00.000Z' }),
      pedido({ id: 'velho', status: 'pendente', responsavel_id: EU, criado_em: '2026-07-28T09:00:00.000Z' }),
      pedido({ id: 'meio',  status: 'pendente', responsavel_id: EU, criado_em: '2026-07-29T09:00:00.000Z' }),
    ];
    expect(ids(ordenarEmAberto(lista, EU))).toEqual(['velho', 'meio', 'novo']);
  });

  it('na fila comum, o que eu abri vem antes do de outro', () => {
    const lista = [
      pedido({ id: 'de-outro', status: 'pendente', criado_em: '2026-07-29T09:00:00.000Z' }),
      pedido({ id: 'eu-abri',  status: 'pendente', solicitante_id: EU,
               criado_em: '2026-07-30T09:00:00.000Z' }),
    ];
    expect(ids(ordenarEmAberto(lista, EU))).toEqual(['eu-abri', 'de-outro']);
  });

  it('em_andamento MEU sobe acima da fila de pendentes', () => {
    const lista = [
      pedido({ id: 'pendente-outro', status: 'pendente' }),
      pedido({ id: 'andando-meu',    status: 'em_andamento', responsavel_id: EU }),
    ];
    expect(ids(ordenarEmAberto(lista, EU))).toEqual(['andando-meu', 'pendente-outro']);
  });

  it('em_andamento de OUTRO continua embaixo dos pendentes', () => {
    const lista = [
      pedido({ id: 'andando-outro',  status: 'em_andamento', responsavel_id: OUTRO }),
      pedido({ id: 'pendente-outro', status: 'pendente' }),
    ];
    expect(ids(ordenarEmAberto(lista, EU))).toEqual(['pendente-outro', 'andando-outro']);
  });

  it('ordem completa das três faixas', () => {
    const lista = [
      // Datas distintas: na mesma faixa quem decide é a idade, e sem isto a
      // ordem entre estes dois seria só a de entrada.
      pedido({ id: '6-andando-outro', status: 'em_andamento', responsavel_id: OUTRO,
               criado_em: '2026-07-28T10:00:00.000Z' }),
      pedido({ id: '5-faltainfo-outro', status: 'falta_info', responsavel_id: OUTRO,
               criado_em: '2026-07-27T10:00:00.000Z' }),
      pedido({ id: '4-fila',          status: 'pendente' }),
      // Os três meus, do mais antigo para o mais novo, sem olhar o status.
      pedido({ id: '3-meu-novo',      status: 'pendente',     responsavel_id: EU,
               criado_em: '2026-07-30T10:00:00.000Z' }),
      pedido({ id: '2-meu-meio',      status: 'em_andamento', responsavel_id: EU,
               criado_em: '2026-07-29T10:00:00.000Z' }),
      pedido({ id: '1-meu-velho',     status: 'falta_info',   responsavel_id: EU,
               criado_em: '2026-07-28T10:00:00.000Z' }),
    ];
    expect(ids(ordenarEmAberto(lista, EU))).toEqual([
      '1-meu-velho', '2-meu-meio', '3-meu-novo',
      '4-fila', '5-faltainfo-outro', '6-andando-outro',
    ]);
  });

  it('não altera o array recebido', () => {
    const lista = [
      pedido({ id: 'a', status: 'pendente' }),
      pedido({ id: 'b', status: 'pendente', responsavel_id: EU }),
    ];
    const antes = ids(lista);
    ordenarEmAberto(lista, EU);
    expect(ids(lista)).toEqual(antes);
  });
});
