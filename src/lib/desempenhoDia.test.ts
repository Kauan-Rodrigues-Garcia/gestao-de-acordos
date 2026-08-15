/**
 * desempenhoDia.test.ts
 *
 * As contas do painel do dia. O foco está nos casos que a versão 1.0 errava e
 * nos limites onde "zero" e "não sei" se confundem — que é onde um painel passa
 * a mentir sem quebrar.
 */
import { describe, it, expect } from 'vitest';
import {
  estadoDoAcordo, barraEstados, metaDoDia, variacao,
  diasUteisAnteriores, mediaDiasUteisAnteriores,
  resumoPixDia, fatiasPorTag,
} from './desempenhoDia';

// 2026-08: agosto de 2026 começa num sábado. Dias úteis = 21.
const MES = '2026-08';

describe('estadoDoAcordo', () => {
  it('reconhece os três estados', () => {
    expect(estadoDoAcordo('pago')).toBe('pago');
    expect(estadoDoAcordo('verificar_pendente')).toBe('a_verificar');
    expect(estadoDoAcordo('nao_pago')).toBe('nao_pago');
  });

  it('status desconhecido cai em não pago, não estoura', () => {
    expect(estadoDoAcordo('inventado')).toBe('nao_pago');
    expect(estadoDoAcordo(null)).toBe('nao_pago');
    expect(estadoDoAcordo(undefined)).toBe('nao_pago');
    expect(estadoDoAcordo('  PAGO ')).toBe('pago');
  });
});

describe('barraEstados', () => {
  const acordos = [
    ...Array(31).fill({ status: 'pago' }),
    ...Array(34).fill({ status: 'verificar_pendente' }),
    ...Array(18).fill({ status: 'nao_pago' }),
  ];

  it('separa os três estados e soma o total', () => {
    const b = barraEstados(acordos);
    expect(b).toMatchObject({ pago: 31, aVerificar: 34, naoPago: 18, total: 83 });
  });

  /**
   * O defeito da 1.0, em uma linha. `pagos ÷ agendados` daria 31/83 = 37%, com
   * 34 acordos que ninguém conferiu ainda puxando o número para baixo.
   */
  it('a conversão ignora quem ainda não foi conferido', () => {
    expect(barraEstados(acordos).conversao).toBe(63);   // 31 / (31+18)
  });

  it('dia sem nenhum acordo conferido tem conversão desconhecida, não 0%', () => {
    const b = barraEstados(Array(40).fill({ status: 'verificar_pendente' }));
    expect(b.aVerificar).toBe(40);
    expect(b.conversao).toBeNull();
  });

  it('dia vazio devolve tudo zerado e conversão nula', () => {
    expect(barraEstados([])).toEqual({
      pago: 0, aVerificar: 0, naoPago: 0, total: 0, conversao: null,
    });
  });

  it('dia perfeito é 100%, dia sem nenhum pagamento é 0%', () => {
    expect(barraEstados([{ status: 'pago' }, { status: 'pago' }]).conversao).toBe(100);
    expect(barraEstados([{ status: 'nao_pago' }]).conversao).toBe(0);
  });
});

describe('metaDoDia', () => {
  it('divide a meta mensal pelos dias úteis do mês', () => {
    const m = metaDoDia({ metaMensal: 21000, mes: MES, realizadoNoDia: 500 });
    expect(m?.diasUteis).toBe(21);
    expect(m?.valor).toBe(1000);
    expect(m?.percentual).toBe(50);
  });

  it('feriado no meio da semana aumenta a meta diária', () => {
    // Menos um dia útil para distribuir a mesma meta.
    const semFeriado = metaDoDia({ metaMensal: 21000, mes: MES, realizadoNoDia: 0 });
    const comFeriado = metaDoDia({
      metaMensal: 21000, mes: MES, realizadoNoDia: 0, feriados: ['2026-08-12'],
    });
    expect(comFeriado!.diasUteis).toBe(semFeriado!.diasUteis - 1);
    expect(comFeriado!.valor).toBeGreaterThan(semFeriado!.valor);
  });

  it('feriado em fim de semana não muda nada', () => {
    // 2026-08-01 é sábado — já não era dia útil.
    const m = metaDoDia({
      metaMensal: 21000, mes: MES, realizadoNoDia: 0, feriados: ['2026-08-01'],
    });
    expect(m?.diasUteis).toBe(21);
  });

  /**
   * Sem meta gravada o painel não desenha barra nenhuma. Zero aqui viraria uma
   * barra vermelha cobrando um alvo que ninguém estabeleceu.
   */
  it('sem meta devolve null, e não zero', () => {
    expect(metaDoDia({ metaMensal: null, mes: MES, realizadoNoDia: 900 })).toBeNull();
    expect(metaDoDia({ metaMensal: undefined, mes: MES, realizadoNoDia: 900 })).toBeNull();
    expect(metaDoDia({ metaMensal: 0, mes: MES, realizadoNoDia: 900 })).toBeNull();
    expect(metaDoDia({ metaMensal: NaN, mes: MES, realizadoNoDia: 900 })).toBeNull();
  });

  it('passar da meta do dia mostra mais de 100%', () => {
    const m = metaDoDia({ metaMensal: 21000, mes: MES, realizadoNoDia: 1500 });
    expect(m?.percentual).toBe(150);
  });
});

describe('variacao', () => {
  it('calcula a variação percentual contra a base', () => {
    expect(variacao(110, 100).pct).toBe(10);
    expect(variacao(90, 100).pct).toBe(-10);
    expect(variacao(100, 100).pct).toBe(0);
  });

  /**
   * Sair de zero não é "aumento infinito". O painel omite o chip nesse caso.
   */
  it('base zero devolve null, e não infinito', () => {
    expect(variacao(1000, 0).pct).toBeNull();
    expect(variacao(0, 0).pct).toBeNull();
    expect(variacao(1000, -5).pct).toBeNull();
  });

  it('devolve a base junto, para o tooltip', () => {
    expect(variacao(110, 100).base).toBe(100);
  });
});

describe('diasUteisAnteriores', () => {
  it('pula o fim de semana', () => {
    // 2026-08-17 é segunda. Os dois anteriores são sexta 14 e quinta 13.
    expect(diasUteisAnteriores('2026-08-17', 2)).toEqual(['2026-08-13', '2026-08-14']);
  });

  it('pula feriado', () => {
    expect(diasUteisAnteriores('2026-08-17', 2, ['2026-08-14']))
      .toEqual(['2026-08-12', '2026-08-13']);
  });

  it('devolve do mais antigo para o mais novo', () => {
    const dias = diasUteisAnteriores('2026-08-17', 3);
    expect(dias).toEqual([...dias].sort());
  });

  it('atravessa a virada do mês', () => {
    // 2026-08-03 é segunda; antes dela vem sexta 31/07.
    expect(diasUteisAnteriores('2026-08-03', 1)).toEqual(['2026-07-31']);
  });

  it('data inválida devolve lista vazia em vez de estourar', () => {
    expect(diasUteisAnteriores('', 5)).toEqual([]);
    expect(diasUteisAnteriores('nao-e-data', 5)).toEqual([]);
  });
});

describe('mediaDiasUteisAnteriores', () => {
  it('tira a média dos dias úteis anteriores', () => {
    const porDia = { '2026-08-13': 1000, '2026-08-14': 2000 };
    expect(mediaDiasUteisAnteriores({ porDia, dia: '2026-08-17', quantidade: 2 }))
      .toBe(1500);
  });

  /**
   * Dia útil sem recebimento conta como zero. Descartá-lo mudaria a pergunta
   * para "quanto entra nos dias em que entra alguma coisa".
   */
  it('dia útil sem recebimento entra na média como zero', () => {
    const porDia = { '2026-08-14': 2000 };  // 13 não teve nada
    expect(mediaDiasUteisAnteriores({ porDia, dia: '2026-08-17', quantidade: 2 }))
      .toBe(1000);
  });

  it('fim de semana não entra na conta', () => {
    // 15 (sáb) e 16 (dom) têm valor alto e devem ser ignorados.
    const porDia = { '2026-08-15': 99999, '2026-08-16': 99999, '2026-08-14': 100 };
    expect(mediaDiasUteisAnteriores({ porDia, dia: '2026-08-17', quantidade: 1 }))
      .toBe(100);
  });
});

describe('resumoPixDia', () => {
  const linhas = [
    { status: 'aprovado',    valor: 1000, pct_comissao: 0.25 },
    { status: 'aprovado',    valor: 2000, pct_comissao: 0.25 },
    { status: 'pendente',    valor: 5000, pct_comissao: null },
    { status: 'desaprovado', valor: 3000, pct_comissao: null },
  ];

  it('só o aprovado gera comissão', () => {
    const r = resumoPixDia(linhas);
    expect(r.aprovados).toBe(2);
    expect(r.pendentes).toBe(1);
    expect(r.valorAprovado).toBe(3000);
    expect(r.comissao).toBe(750);   // 25% de 3000
  });

  /**
   * `pct_comissao` é fração no banco (0,2500), não percentual. Tratá-la como
   * percentual daria R$ 75.000 de comissão sobre R$ 3.000 recebidos — número
   * absurdo, mas que passa despercebido numa tela cheia de valores.
   */
  it('trata pct_comissao como fração, não como percentual', () => {
    expect(resumoPixDia([{ status: 'aprovado', valor: 100, pct_comissao: 0.25 }]).comissao)
      .toBe(25);
  });

  it('dia sem Pix devolve tudo zerado', () => {
    expect(resumoPixDia([])).toEqual({
      aprovados: 0, pendentes: 0, comissao: 0, valorAprovado: 0,
    });
  });

  it('aprovado sem pct devolve comissão zero, não NaN', () => {
    const r = resumoPixDia([{ status: 'aprovado', valor: 1000, pct_comissao: null }]);
    expect(r.aprovados).toBe(1);
    expect(r.comissao).toBe(0);
  });
});

describe('fatiasPorTag', () => {
  const tags = [
    { id: 't1', nome: 'IA DE VOZ', cor: '#ff0000' },
    { id: 't2', nome: 'Retorno',   cor: '#00ff00' },
  ];

  it('soma por tag e ordena da maior para a menor', () => {
    const fatias = fatiasPorTag([
      { valor: 1000, tag_ids: ['t1'] },
      { valor: 3000, tag_ids: ['t2'] },
    ], tags);
    expect(fatias.map(f => f.nome)).toEqual(['Retorno', 'IA DE VOZ']);
    expect(fatias[0].valor).toBe(3000);
  });

  /**
   * O denominador é o total do DIA, e acordo sem tag não vira fatia. Nos dados
   * reais 99% dos acordos não têm tag: uma fatia "Sem tag" de 99% deixaria as
   * reais invisíveis.
   */
  it('acordo sem tag entra no denominador mas não vira fatia', () => {
    const fatias = fatiasPorTag([
      { valor: 1000, tag_ids: ['t1'] },
      { valor: 9000, tag_ids: null },
    ], tags);
    expect(fatias).toHaveLength(1);
    expect(fatias[0].pct).toBe(10);   // 1000 de 10000
  });

  it('dia sem nenhuma tag devolve lista vazia — o bloco some', () => {
    expect(fatiasPorTag([{ valor: 500, tag_ids: [] }], tags)).toEqual([]);
  });

  it('acordo com duas tags conta nas duas', () => {
    const fatias = fatiasPorTag([{ valor: 1000, tag_ids: ['t1', 't2'] }], tags);
    expect(fatias).toHaveLength(2);
    expect(fatias.every(f => f.valor === 1000)).toBe(true);
  });

  it('tag apagada não some da conta, ganha rótulo', () => {
    const fatias = fatiasPorTag([{ valor: 100, tag_ids: ['sumiu'] }], tags);
    expect(fatias[0].nome).toBe('Tag removida');
  });
});
