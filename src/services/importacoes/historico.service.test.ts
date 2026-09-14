/**
 * A linha do tempo das importações dos dois relatórios.
 *
 * ## O que se trava aqui
 *
 * **`null` não é zero.** O 59 substitui o mês inteiro e não responde «quantas
 * linhas foram inseridas»; o 58 não responde «qual o valor do lote». Se o
 * mapeamento transformar esses ausentes em `0`, a tela passa a afirmar «zero
 * linhas inseridas» onde a verdade é «esta pergunta não se faz a este
 * relatório» — e alguém vai concluir que uma importação não fez nada.
 *
 * **A marca de remoção grande.** O incidente que fundou a régua: um export
 * salvo da manhã do dia 11, importado no dia 13, apagou 413 linhas e
 * R$ 175.768,38 do Receptivo, e o único registro foi uma frase no log depois do
 * fato. A lista existe para essa linha se enxergar de longe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  porRpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  args: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      mock.args[nome] = args;
      const r = mock.porRpc[nome] ?? { data: null, error: null };
      return { then: (ok: (v: unknown) => unknown) => ok(r) };
    },
  },
}));

import {
  buscarDetalheDaImportacao,
  buscarHistoricoImportacoes,
  CORTE_REMOCAO,
  removeuDemais,
  resumoDoHistorico,
  ROTULO_ORIGEM,
  temContagemDeLinhas,
  temDetalhe,
  totalDoDetalhe,
  type DetalheDeSetor,
  type EventoImportacao,
} from './historico.service';

const DO_58 = {
  origem: '58' as const,
  evento_id: 'log-1',
  lote_id: 'lote-58',
  quando: '2026-09-13T12:40:00Z',
  quem_id: 'u-1',
  quem: 'Fulana',
  setor_id: 'setor-receptivo',
  setor_nome: 'Receptivo',
  mes: '2026-09',
  arquivo: 'Mês 2026-09',
  linhas: '2517',
  inseridos: '414',
  atualizados: '1',
  removidos: '1',
  valor: null,
  estado: 'concluida',
  deu_errado: false,
  descricao: 'Importou relatório analítico: 414 linha(s) nova(s)…',
};

const DO_59 = {
  origem: '59' as const,
  evento_id: 'lote-1',
  lote_id: 'lote-1',
  quando: '2026-09-13T21:00:00Z',
  quem_id: 'u-2',
  quem: 'Beltrano',
  setor_id: null,
  setor_nome: null,
  mes: '2026-09',
  arquivo: 'mestre.csv',
  linhas: '13307',
  inseridos: null,
  atualizados: null,
  removidos: null,
  valor: '3622488.42',
  estado: 'vigente',
  deu_errado: false,
  descricao: 'Lote vigente do mes',
};

const evento = (over: Partial<EventoImportacao> = {}): EventoImportacao => ({
  origem: '58', id: 'e', loteId: 'lote-e', quando: '2026-09-13T12:00:00Z',
  quemId: 'u', quem: 'Alguém', setorId: 's', setorNome: 'S',
  mes: '2026-09', arquivo: 'a', linhas: 10,
  inseridos: 1, atualizados: 0, removidos: 0, valor: null,
  estado: 'concluida', deuErrado: false, descricao: 'd',
  ...over,
});

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarHistoricoImportacoes', () => {
  it('converte os números de texto e preserva a identidade do evento', async () => {
    mock.porRpc = { fn_importacoes_historico: { data: [DO_58], error: null } };

    const [e] = await buscarHistoricoImportacoes('emp-1');

    expect(e.origem).toBe('58');
    expect(e.quem).toBe('Fulana');
    expect(e.linhas).toBe(2517);
    expect(e.inseridos).toBe(414);
    expect(e.setorNome).toBe('Receptivo');
  });

  /*
   * O ponto. O 59 não responde «inseridos»; virar 0 faria a tela dizer que a
   * importação não inseriu nada, que é uma afirmação — e falsa.
   */
  it('o que a origem não responde continua null, não vira zero', async () => {
    mock.porRpc = { fn_importacoes_historico: { data: [DO_59], error: null } };

    const [e] = await buscarHistoricoImportacoes('emp-1');

    expect(e.inseridos).toBeNull();
    expect(e.atualizados).toBeNull();
    expect(e.removidos).toBeNull();
    expect(e.valor).toBeCloseTo(3622488.42, 2);
  });

  it('e o 58 não responde valor', async () => {
    mock.porRpc = { fn_importacoes_historico: { data: [DO_58], error: null } };
    const [e] = await buscarHistoricoImportacoes('emp-1');
    expect(e.valor).toBeNull();
  });

  it('repassa os filtros, e null quando não há', async () => {
    mock.porRpc = { fn_importacoes_historico: { data: [], error: null } };

    await buscarHistoricoImportacoes('emp-1');
    expect(mock.args.fn_importacoes_historico).toMatchObject({
      p_mes: null, p_origem: null, p_limite: 200,
    });

    await buscarHistoricoImportacoes('emp-1', { mes: '2026-09', origem: '59', limite: 50 });
    expect(mock.args.fn_importacoes_historico).toMatchObject({
      p_mes: '2026-09', p_origem: '59', p_limite: 50,
    });
  });

  it('lista vazia não vira erro', async () => {
    mock.porRpc = { fn_importacoes_historico: { data: null, error: null } };
    await expect(buscarHistoricoImportacoes('emp-1')).resolves.toEqual([]);
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_importacoes_historico: { data: null, error: { message: 'Sem acesso a esta empresa.' } },
    };
    await expect(buscarHistoricoImportacoes('emp-1'))
      .rejects.toThrow('Sem acesso a esta empresa.');
  });
});

describe('removeuDemais', () => {
  /*
   * O caso real: 413 linhas do Receptivo, 13/09/2026, por um export salvo da
   * manhã do dia 11.
   */
  it('marca o incidente de 413 linhas', () => {
    expect(removeuDemais(evento({ removidos: 413 }))).toBe(true);
  });

  it('não marca a remoção normal de uma ou duas linhas', () => {
    expect(removeuDemais(evento({ removidos: 0 }))).toBe(false);
    expect(removeuDemais(evento({ removidos: 2 }))).toBe(false);
  });

  it('o corte é inclusivo', () => {
    expect(removeuDemais(evento({ removidos: CORTE_REMOCAO - 1 }))).toBe(false);
    expect(removeuDemais(evento({ removidos: CORTE_REMOCAO }))).toBe(true);
  });

  /* O 59 não remove linha nenhuma — ele troca o lote inteiro. `null` não pode
     ser lido como «removeu», nem estourar. */
  it('null do 59 não marca nada', () => {
    expect(removeuDemais(evento({ origem: '59', removidos: null }))).toBe(false);
  });
});

describe('temContagemDeLinhas e os rótulos', () => {
  it('só o 58 tem contagem de linhas', () => {
    expect(temContagemDeLinhas(evento({ origem: '58' }))).toBe(true);
    expect(temContagemDeLinhas(evento({ origem: '59' }))).toBe(false);
  });

  it('as duas origens têm rótulo e explicação', () => {
    for (const o of ['58', '59'] as const) {
      expect(ROTULO_ORIGEM[o].curto.length).toBeGreaterThan(0);
      expect(ROTULO_ORIGEM[o].longo.length).toBeGreaterThan(20);
    }
  });
});

describe('o detalhe por setor', () => {
  /*
   * O caso real da primeira sincronização automática, em 14/09/2026 11:17: o
   * Receptivo recebeu 2.549 linhas no lugar de 2.542, ganhando R$ 1.577,15.
   */
  it('converte os números e calcula a diferença', async () => {
    mock.porRpc = {
      fn_importacoes_detalhe: {
        data: [{
          setor_id: 'setor-receptivo', setor_nome: 'Receptivo',
          entrou_linhas: '2549', entrou_valor: '1168927.69',
          saiu_linhas: '2542', saiu_valor: '1167350.54',
          delta: '1577.15', saiu_restaurado: '0',
        }],
        error: null,
      },
    };

    const [d] = await buscarDetalheDaImportacao('emp-1', 'lote-1');

    expect(d.setorNome).toBe('Receptivo');
    expect(d.entrouLinhas).toBe(2549);
    expect(d.saiuLinhas).toBe(2542);
    expect(d.delta).toBeCloseTo(1577.15, 2);
  });

  /*
   * Importação antiga cujas linhas já foram todas substituídas não tem o que
   * atribuir a ela hoje. A tela precisa dizer isso — lista vazia que parece
   * defeito é pior que a frase explicando.
   */
  it('lista vazia não vira erro', async () => {
    mock.porRpc = { fn_importacoes_detalhe: { data: null, error: null } };
    await expect(buscarDetalheDaImportacao('emp-1', 'lote-1')).resolves.toEqual([]);
  });

  it('repassa o lote para o banco', async () => {
    mock.porRpc = { fn_importacoes_detalhe: { data: [], error: null } };
    await buscarDetalheDaImportacao('emp-1', 'lote-abc');
    expect(mock.args.fn_importacoes_detalhe).toMatchObject({
      p_empresa_id: 'emp-1', p_lote_id: 'lote-abc',
    });
  });

  it('sem lote não há detalhe para abrir', () => {
    expect(temDetalhe(evento({ loteId: 'x' }))).toBe(true);
    expect(temDetalhe(evento({ loteId: null }))).toBe(false);
  });
});

describe('totalDoDetalhe', () => {
  const setor = (over: Partial<DetalheDeSetor> = {}): DetalheDeSetor => ({
    setorId: 's', setorNome: 'S',
    entrouLinhas: 10, entrouValor: 100, saiuLinhas: 8, saiuValor: 80,
    delta: 20, saiuRestaurado: 0, ...over,
  });

  it('soma as duas metades e a diferença', () => {
    const t = totalDoDetalhe([
      setor({ entrouLinhas: 2549, entrouValor: 1168927.69, saiuLinhas: 2542, saiuValor: 1167350.54, delta: 1577.15 }),
      setor({ entrouLinhas: 3697, entrouValor: 977018.78, saiuLinhas: 3696, saiuValor: 976815.30, delta: 203.48 }),
    ]);

    expect(t.entrouLinhas).toBe(6246);
    expect(t.saiuLinhas).toBe(6238);
    expect(t.delta).toBeCloseTo(1780.63, 2);
  });

  /* O total de uma lista vazia é zero, não `NaN` nem exceção. */
  it('lista vazia devolve tudo zerado', () => {
    const t = totalDoDetalhe([]);
    expect(t.entrouValor).toBe(0);
    expect(t.saiuValor).toBe(0);
    expect(t.delta).toBe(0);
  });
});

describe('resumoDoHistorico', () => {
  it('conta eventos, falhas, linhas removidas e pessoas distintas', () => {
    const r = resumoDoHistorico([
      evento({ quemId: 'a', removidos: 413 }),
      evento({ quemId: 'a', removidos: 1 }),
      evento({ quemId: 'b', deuErrado: true, removidos: 0 }),
      evento({ origem: '59', quemId: 'c', removidos: null }),
    ]);

    expect(r.total).toBe(4);
    expect(r.falhas).toBe(1);
    expect(r.removidas).toBe(414);
    expect(r.pessoas).toBe(3);
  });

  it('lista vazia devolve tudo zerado, sem estourar', () => {
    expect(resumoDoHistorico([])).toEqual({ total: 0, falhas: 0, removidas: 0, pessoas: 0 });
  });
});
