/**
 * Os números deste arquivo são reais.
 *
 * Foram medidos em 15/09/2026 no lote geral vigente de setembro
 * (`Prospeccao_202609.csv`, 2.973 linhas) contra o setor Vendas Bookplay, com
 * as cinco franquias BOOKPLAY MUNDIAL vinculadas e as 49 contas do Comercial
 * criadas. Não são fixtures inventadas: se a régua, a gaveta de destino ou a
 * equipe que credita mudarem, este arquivo mostra ONDE mudou.
 *
 * A conta que ele prova é a mesma do 59 da cobrança:
 *
 *     2.834 + 138 + 1 = 2.973
 *     13.424.041,59 + 778.243,92 + 3.087,20 = 14.205.372,71
 */
import { describe, it, expect } from 'vitest';
import {
  normalizarLinhas,
  organizarFechamento,
  osDestinosSomamOTotal,
  oGravadoBateComORetrato,
  osRecortesSomamOSetor,
  fatiaDaAutomacao,
  ORDEM_DOS_DESTINOS,
  type LinhaFechamento,
} from './vendasFechamento';

/** O retrato de setembro como o banco o devolveu — `numeric` vem como string. */
const DO_BANCO: unknown[] = [
  { escopo: 'total', chave: null, rotulo: 'Retrato do mês',
    linhas: 2973, valor: '14205372.71', linhas_na_regua: 2614, valor_na_regua: '12481361.84' },

  { escopo: 'destino', chave: 'deste_setor', rotulo: 'Deste setor',
    linhas: 138, valor: '778243.92', linhas_na_regua: 129, valor_na_regua: '727622.80' },
  { escopo: 'destino', chave: 'sem_franquia', rotulo: 'Franquia que ninguém vinculou',
    linhas: 2834, valor: '13424041.59', linhas_na_regua: 2484, valor_na_regua: '11750651.84' },
  { escopo: 'destino', chave: 'sem_operador', rotulo: 'Login sem perfil no sistema',
    linhas: 1, valor: '3087.20', linhas_na_regua: 1, valor_na_regua: '3087.20' },

  { escopo: 'equipe', chave: 'e2', rotulo: 'PEC 2 - GRUPO PRESENCIAL',
    linhas: 71, valor: '385334.00', linhas_na_regua: 65, valor_na_regua: '352234.00' },
  { escopo: 'equipe', chave: 'e5', rotulo: 'PEC 5 - GRUPO HOME OFFICE',
    linhas: 48, valor: '274243.32', linhas_na_regua: 46, valor_na_regua: '263694.20' },
  { escopo: 'equipe', chave: 'e4', rotulo: 'PEC 4 - GRUPO SEGUNDO TURNO',
    linhas: 10, valor: '60456.00', linhas_na_regua: 9, valor_na_regua: '53484.00' },
  { escopo: 'equipe', chave: 'sem_equipe', rotulo: 'Sem equipe',
    linhas: 9, valor: '58210.60', linhas_na_regua: 9, valor_na_regua: '58210.60' },

  { escopo: 'natureza', chave: 'humano', rotulo: 'Pessoas',
    linhas: 135, valor: '757327.92', linhas_na_regua: 126, valor_na_regua: '706706.80' },
  { escopo: 'natureza', chave: 'robo', rotulo: 'Automação',
    linhas: 3, valor: '20916.00', linhas_na_regua: 3, valor_na_regua: '20916.00' },

  // A projeção ainda não rodou: o retrato diz 138, `vendas` tem zero.
  { escopo: 'conferencia', chave: 'em_vendas', rotulo: 'Gravado em Vendas',
    linhas: 0, valor: '0', linhas_na_regua: 0, valor_na_regua: '0' },
];

const SETEMBRO = normalizarLinhas(DO_BANCO);

/** O mesmo retrato, mas já projetado — `vendas` bate com o destino do setor. */
const PROJETADO: LinhaFechamento[] = SETEMBRO.map(l =>
  l.escopo === 'conferencia'
    ? { ...l, linhas: 138, valor: 778243.92, linhas_na_regua: 129, valor_na_regua: 727622.80 }
    : l,
);

describe('normalizarLinhas', () => {
  it('converte o numeric que vem como string', () => {
    const total = SETEMBRO.find(l => l.escopo === 'total')!;
    expect(total.valor).toBe(14205372.71);
    expect(total.valor_na_regua).toBe(12481361.84);
    expect(typeof total.valor).toBe('number');
  });

  it('não quebra com lista vazia nem com lixo', () => {
    expect(normalizarLinhas([])).toEqual([]);
    const lixo = normalizarLinhas([{ escopo: 'total', valor: 'abacaxi', linhas: null }]);
    expect(lixo[0].valor).toBe(0);
    expect(lixo[0].linhas).toBe(0);
  });
});

describe('os cinco destinos somam o retrato', () => {
  it('fecha em setembro, e fecha em centavos', () => {
    const r = osDestinosSomamOTotal(SETEMBRO);
    expect(r.aplicavel).toBe(true);
    expect(r.fecha).toBe(true);
    expect(r.diferencaLinhas).toBe(0);
    expect(r.diferencaValor).toBe(0);
  });

  it('acusa um centavo a menos — que é exatamente o que precisa doer', () => {
    const furado = SETEMBRO.map(l =>
      l.chave === 'sem_franquia' ? { ...l, valor: l.valor - 0.01 } : l,
    );
    const r = osDestinosSomamOTotal(furado);
    expect(r.fecha).toBe(false);
    expect(r.diferencaValor).toBeCloseTo(0.01, 10);
  });

  it('acusa linha perdida mesmo com o dinheiro certo', () => {
    const furado = SETEMBRO.map(l =>
      l.chave === 'sem_franquia' ? { ...l, linhas: l.linhas - 1 } : l,
    );
    const r = osDestinosSomamOTotal(furado);
    expect(r.fecha).toBe(false);
    expect(r.diferencaLinhas).toBe(1);
    expect(r.diferencaValor).toBe(0);
  });

  it('sem retrato do mês não inventa igualdade', () => {
    const r = osDestinosSomamOTotal(SETEMBRO.filter(l => l.escopo !== 'total'));
    expect(r.aplicavel).toBe(false);
  });
});

describe('o gravado bate com o retrato', () => {
  it('não bate enquanto a projeção não rodou, e diz por quanto', () => {
    const r = oGravadoBateComORetrato(SETEMBRO);
    expect(r.aplicavel).toBe(true);
    expect(r.fecha).toBe(false);
    expect(r.diferencaLinhas).toBe(138);
    expect(r.diferencaValor).toBe(778243.92);
  });

  it('bate depois de projetar', () => {
    const r = oGravadoBateComORetrato(PROJETADO);
    expect(r.fecha).toBe(true);
    expect(r.diferencaValor).toBe(0);
  });
});

describe('os recortes de dentro somam a parcela do setor', () => {
  it('equipe fecha: 71 + 48 + 10 + 9 = 138', () => {
    const r = osRecortesSomamOSetor(SETEMBRO, 'equipe');
    expect(r.fecha).toBe(true);
    expect(r.diferencaLinhas).toBe(0);
    expect(r.diferencaValor).toBe(0);
  });

  it('natureza fecha: 135 pessoas + 3 robôs = 138', () => {
    const r = osRecortesSomamOSetor(SETEMBRO, 'natureza');
    expect(r.fecha).toBe(true);
    expect(r.diferencaValor).toBe(0);
  });

  it('se um líder perder a equipe que credita, a soma acusa', () => {
    // É o defeito que a Fase 6 corrigiu: líder com `perfis.equipe_id` nulo
    // caía fora de equipe nenhuma. Aqui, 10 linhas da PEC 4 somem.
    const furado = SETEMBRO.filter(l => l.chave !== 'e4');
    const r = osRecortesSomamOSetor(furado, 'equipe');
    expect(r.fecha).toBe(false);
    expect(r.diferencaLinhas).toBe(10);
    expect(r.diferencaValor).toBe(60456);
  });
});

describe('organizarFechamento', () => {
  const f = organizarFechamento(SETEMBRO);

  it('mostra as cinco gavetas mesmo quando duas estão vazias', () => {
    expect(f.destinos).toHaveLength(5);
    expect(f.destinos.map(d => d.destino)).toEqual(ORDEM_DOS_DESTINOS);

    const outro = f.destinos.find(d => d.destino === 'outro_setor')!;
    const ignorada = f.destinos.find(d => d.destino === 'ignorada')!;
    expect(outro.linhas).toBe(0);
    expect(ignorada.linhas).toBe(0);
  });

  it('o setor vem primeiro porque é a resposta', () => {
    expect(f.destinos[0].destino).toBe('deste_setor');
    expect(f.destinos[0].valor_na_regua).toBe(727622.80);
  });

  it('ordena equipe por produção na régua', () => {
    expect(f.equipes.map(e => e.rotulo)).toEqual([
      'PEC 2 - GRUPO PRESENCIAL',
      'PEC 5 - GRUPO HOME OFFICE',
      'Sem equipe',
      'PEC 4 - GRUPO SEGUNDO TURNO',
    ]);
  });

  it('separa pessoas de automação sem tirar o robô do setor', () => {
    expect(f.pessoas.linhas).toBe(135);
    expect(f.automacao.linhas).toBe(3);
    // A soma continua sendo a parcela do setor: o robô conta.
    expect(f.pessoas.valor_na_regua + f.automacao.valor_na_regua)
      .toBeCloseTo(f.destinos[0].valor_na_regua, 2);
  });

  it('tudoFecha é falso enquanto a projeção não rodou', () => {
    expect(f.destinosSomam.fecha).toBe(true);
    expect(f.equipesSomam.fecha).toBe(true);
    expect(f.naturezasSomam.fecha).toBe(true);
    expect(f.gravadoBate.fecha).toBe(false);
    expect(f.tudoFecha).toBe(false);
  });

  it('e verdadeiro depois dela', () => {
    expect(organizarFechamento(PROJETADO).tudoFecha).toBe(true);
  });

  it('sem lote nenhum, temRetrato é falso e nada explode', () => {
    const vazio = organizarFechamento([]);
    expect(vazio.temRetrato).toBe(false);
    expect(vazio.total).toBeNull();
    expect(vazio.destinos).toHaveLength(5);
    expect(vazio.tudoFecha).toBe(true);
  });
});

describe('fatiaDaAutomacao', () => {
  it('mede contra a régua, não contra o bruto', () => {
    // 20.916,00 / 727.622,80 — e não 20.916,00 / 778.243,92.
    expect(fatiaDaAutomacao(organizarFechamento(SETEMBRO))).toBeCloseTo(2.8746, 3);
  });

  it('é zero quando o setor não produziu, sem dividir por zero', () => {
    expect(fatiaDaAutomacao(organizarFechamento([]))).toBe(0);
  });
});
