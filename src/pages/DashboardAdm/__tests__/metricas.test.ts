/**
 * As contas do Dashboard – ADM.
 *
 * O que estes testes travam é o que a tela PROMETE: o dia em que cada fato cai,
 * o que conta como retorno banido, e por que o aquecimento é a mediana dos
 * cadastrados no período. Gráfico nenhum é montado aqui.
 */
import { describe, it, expect } from 'vitest';
import {
  inicioDoPeriodo, serieDoFluxo, somarFluxo, banimentoPorSetor, motivosDeRetorno,
  aquecimentoMediano, retratoDoAcervo, distribuicaoPorSetor,
} from '../metricas';
import type { MovimentacaoResumoRow, NumeroRow } from '@/services/numeros/numeros.service';

/** 11/09/2026, 15h, no fuso de quem roda o teste — as contas são locais. */
const HOJE = new Date(2026, 8, 11, 15, 0);
const dia = (d: number, h = 10, mes = 8) => new Date(2026, mes, d, h);

let seq = 0;
function mov(
  tipo: string, quando: Date, extra: Partial<MovimentacaoResumoRow> = {},
): MovimentacaoResumoRow {
  seq++;
  return {
    id: `m${seq}`, numero_id: 'n1', tipo, situacao_nova: null, motivo: null,
    setor_origem_id: null, setor_destino_id: null, descricao: '', autor_nome: null,
    criado_em: quando.toISOString(), ...extra,
  };
}

function numero(extra: Partial<NumeroRow>): NumeroRow {
  return {
    id: 'n1', empresa_id: 'e1', celular_id: 'c1', setor_id: 's1', numero: '18999999999',
    situacao: 'ativo', posse: 'nucleo', operador_id: null, motivo_retorno: null,
    observacao_retorno: null, etiquetas: [], tratamento: null, criado_por: null,
    criado_por_nome: null, criado_em: dia(1).toISOString(), atualizado_em: dia(1).toISOString(),
    ...extra,
  };
}

describe('o período', () => {
  it('começa à meia-noite e inclui hoje', () => {
    expect(inicioDoPeriodo(7, HOJE)).toEqual(new Date(2026, 8, 5));
  });

  it('atravessa o mês sem se perder', () => {
    const serie = serieDoFluxo([], 30, HOJE);
    expect(serie).toHaveLength(30);
    expect(serie[0].rotulo).toBe('13/08');
    expect(serie[29].rotulo).toBe('11/09');
  });
});

describe('o fluxo, dia a dia', () => {
  const movs = [
    mov('cadastro', dia(11, 9)),
    mov('liberado_ao_setor', dia(10)),
    mov('situacao_alterada', dia(9), { situacao_nova: 'ativo' }),
    mov('situacao_alterada', dia(9, 11), { situacao_nova: 'banido' }),
    mov('situacao_alterada', dia(9, 12), { situacao_nova: 'em_aquecimento' }),
    mov('relancado_ao_nucleo', dia(5, 0)),
    mov('cadastro', dia(4, 23)), // antes do período
  ];
  const serie = serieDoFluxo(movs, 7, HOJE);

  it('um ponto por dia, inclusive os dias parados', () => {
    expect(serie.map(p => p.rotulo)).toEqual(
      ['05/09', '06/09', '07/09', '08/09', '09/09', '10/09', '11/09']);
    expect(serie[1]).toMatchObject({ cadastrados: 0, liberados: 0, retornos: 0 });
  });

  it('cada fato cai no dia em que aconteceu', () => {
    expect(serie[6].cadastrados).toBe(1);
    expect(serie[5].liberados).toBe(1);
    expect(serie[4]).toMatchObject({ ativados: 1, banidos: 1 });
    expect(serie[0].retornos).toBe(1);
  });

  it('o que veio antes do período fica de fora, e voltar ao aquecimento não conta', () => {
    expect(somarFluxo(serie)).toEqual({
      cadastrados: 1, liberados: 1, retornos: 1, ativados: 1, banidos: 1,
    });
  });
});

describe('o que volta banido', () => {
  it('conta por setor o que foi liberado e o que voltou banido', () => {
    const r = banimentoPorSetor([
      ...Array.from({ length: 4 }, () => mov('liberado_ao_setor', dia(8), { setor_destino_id: 's1' })),
      mov('relancado_ao_nucleo', dia(9), { setor_origem_id: 's1', motivo: 'banido' }),
      mov('relancado_ao_nucleo', dia(9), { setor_origem_id: 's1', motivo: 'sem_uso' }),
      mov('relancado_ao_nucleo', dia(9), { setor_origem_id: 's2', motivo: 'banido' }),
    ]);
    expect(r).toEqual([
      { setorId: 's1', liberados: 4, voltaramBanidos: 1, taxa: 0.25 },
      { setorId: 's2', liberados: 0, voltaramBanidos: 1, taxa: null },
    ]);
  });

  it('a taxa não passa de 100% quando voltou o que foi liberado antes do período', () => {
    const [s] = banimentoPorSetor([
      mov('liberado_ao_setor', dia(8), { setor_destino_id: 's1' }),
      ...Array.from({ length: 3 }, () =>
        mov('relancado_ao_nucleo', dia(9), { setor_origem_id: 's1', motivo: 'banido' })),
    ]);
    expect(s.taxa).toBe(1);
  });

  it('os motivos contam só o retorno ao Núcleo', () => {
    expect(motivosDeRetorno([
      mov('relancado_ao_nucleo', dia(9), { motivo: 'banido' }),
      mov('relancado_ao_nucleo', dia(9), { motivo: 'banido' }),
      mov('relancado_ao_nucleo', dia(9), { motivo: 'sem_uso' }),
      mov('devolvido_a_lideranca', dia(9), { motivo: 'banido' }),
    ])).toEqual([{ motivo: 'banido', quantos: 2 }, { motivo: 'sem_uso', quantos: 1 }]);
  });
});

describe('o aquecimento', () => {
  const inicio = inicioDoPeriodo(7, HOJE);
  const numeros = [
    { id: 'a', criado_em: dia(5).toISOString() },
    { id: 'b', criado_em: dia(6).toISOString() },
    { id: 'c', criado_em: dia(8).toISOString() },
    { id: 'antigo', criado_em: dia(1).toISOString() },
  ];

  it('é a mediana do cadastro à PRIMEIRA ativação, só de quem nasceu no período', () => {
    const r = aquecimentoMediano(numeros, [
      mov('situacao_alterada', dia(7), { numero_id: 'a', situacao_nova: 'ativo' }),
      mov('situacao_alterada', dia(10), { numero_id: 'a', situacao_nova: 'ativo' }),
      mov('situacao_alterada', dia(10), { numero_id: 'b', situacao_nova: 'ativo' }),
      mov('situacao_alterada', dia(9), { numero_id: 'c', situacao_nova: 'ativo' }),
      mov('situacao_alterada', dia(9), { numero_id: 'antigo', situacao_nova: 'ativo' }),
    ], inicio);
    // a: 2 dias · b: 4 dias · c: 1 dia · antigo: fora
    expect(r).toEqual({ dias: 2, amostra: 3 });
  });

  it('sem ativação no período, não inventa número', () => {
    expect(aquecimentoMediano(numeros, [], inicio)).toEqual({ dias: null, amostra: 0 });
  });
});

describe('o acervo, hoje', () => {
  const acervo = [
    numero({ id: '1', situacao: 'ativo', posse: 'nucleo' }),
    numero({ id: '2', situacao: 'ativo', posse: 'nucleo', tratamento: 'pendente' }),
    numero({ id: '3', situacao: 'em_aquecimento', posse: 'nucleo', tratamento: 'em_andamento' }),
    numero({ id: '4', situacao: 'ativo', posse: 'setor', setor_id: 's1', operador_id: 'op' }),
    numero({ id: '5', situacao: 'ativo', posse: 'setor', setor_id: 's1' }),
    numero({ id: '6', situacao: 'banido', posse: 'setor', setor_id: 's1', operador_id: 'op' }),
    numero({ id: '7', situacao: 'ativo', posse: 'setor', setor_id: 's2' }),
  ];

  it('o retrato conta pronto para liberar do mesmo jeito que o botão Liberar', () => {
    expect(retratoDoAcervo(acervo)).toEqual({
      total: 7, ativos: 5, aquecendo: 1, banidos: 1,
      noNucleo: 3, nosSetores: 4, prontos: 1, esperando: 1, tratando: 1,
      aguardando: 0, emRestricao: 0, noProxy: 0,
    });
  });

  it('as situações com tempo têm contagem própria, e não passam por «pronto para liberar»', () => {
    expect(retratoDoAcervo([
      numero({ id: 'a', situacao: 'aguardando_12h' }),
      numero({ id: 'b', situacao: 'aguardando_24h' }),
      numero({ id: 'c', situacao: 'em_restricao' }),
      numero({ id: 'd', situacao: 'movimentando_proxy' }),
    ])).toMatchObject({
      total: 4, aguardando: 2, emRestricao: 1, noProxy: 1, ativos: 0, prontos: 0,
    });
  });

  it('a distribuição separa em uso, aguardando e banido — banido não conta como em uso', () => {
    expect(distribuicaoPorSetor(acervo)).toEqual([
      { setorId: 's1', total: 3, comOperador: 1, aguardando: 1, banidos: 1 },
      { setorId: 's2', total: 1, comOperador: 0, aguardando: 1, banidos: 0 },
    ]);
  });
});
