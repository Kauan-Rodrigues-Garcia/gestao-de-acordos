import { describe, it, expect } from 'vitest';
import {
  progressoDaMeta, bateuAMeta, rotuloDoAndamento, ehRegua, REGUAS,
  fatorDePresenca, ajustarMetaPorPresenca, rotuloDaPresenca,
  type MetaDoRecorte,
} from './vendasMeta';

/**
 * Os números do rodapé de `Planilha Mensal (1).xlsx`, aba Agosto.
 *
 * Não são exemplo: são o que a liderança calculava na mão. Se um destes testes
 * cair, a tela passou a discordar da planilha que ela substitui.
 */
const AGOSTO = {
  meta:        { regua: 'valor', quantidade: 161, valor: 962_136 } as MetaDoRecorte,
  resumo:      { quantidade: 129, valor: 683_531.24 },
  uteis:       21,
  trabalhados: 16,
};

describe('o rodapé de agosto, número por número', () => {
  const a = progressoDaMeta(AGOSTO);

  it('META DO DIA (faturamento) = 962.136 ÷ 21 = 45.816,00', () => {
    expect(a.ritmoValor!.porDia).toBeCloseTo(45_816, 6);
  });

  it('EXPECT. FATURAMENTO = 45.816 × 16 = 733.056', () => {
    expect(a.ritmoValor!.esperado).toBeCloseTo(733_056, 6);
  });

  it('PROJEÇÃO = 683.531,24 ÷ 733.056 = 93,24%', () => {
    expect((a.ritmoValor!.projecaoPct! * 100).toFixed(2)).toBe('93.24');
  });

  it('Falta p/Meta = 962.136 − 683.531,24 = 278.604,76', () => {
    expect(a.valor.falta).toBeCloseTo(278_604.76, 6);
  });

  it('Por Dia = 278.604,76 ÷ 5 dias restantes = 55.720,95', () => {
    expect(a.ritmoValor!.precisaPorDia!).toBeCloseTo(55_720.952, 3);
  });

  it('META DO DIA (quantidade) = 161 ÷ 21 = 7,67', () => {
    expect(a.ritmoQuantidade!.porDia).toBeCloseTo(7.666_666_667, 8);
  });

  it('EXPECTATIVA DE VENDA = 7,67 × 16 = 122,67', () => {
    expect(a.ritmoQuantidade!.esperado).toBeCloseTo(122.666_666_7, 6);
  });

  it('Faltam para meta = 161 − 129 = 32', () => {
    expect(a.quantidade.falta).toBe(32);
  });
});

describe('só uma régua decide', () => {
  it('a oficial é a que a configuração escolheu', () => {
    const a = progressoDaMeta(AGOSTO);
    expect(a.regua).toBe('valor');
    expect(a.oficial).toBe(a.valor);
    expect(a.ritmoOficial).toBe(a.ritmoValor);
  });

  it('trocar a régua troca quem manda, sem mexer nas contas', () => {
    const a = progressoDaMeta({ ...AGOSTO, meta: { ...AGOSTO.meta, regua: 'quantidade' } });
    expect(a.oficial).toBe(a.quantidade);
    // A outra continua calculada: vender caro ou barato é a segunda leitura.
    expect(a.valor.feito).toBe(683_531.24);
  });

  /*
   * Sem régua, nada foi batido. Aceitar «uma das duas» faria um setor medido
   * por valor, que fez muitas vendas pequenas, aparecer como tendo batido.
   */
  it('sem régua escolhida, NÃO bateu — mesmo com as duas metas cumpridas', () => {
    const a = progressoDaMeta({
      meta: { regua: null, quantidade: 10, valor: 1_000 },
      resumo: { quantidade: 99, valor: 99_999 },
      uteis: 21, trabalhados: 16,
    });
    expect(a.quantidade.bateu).toBe(true);
    expect(a.valor.bateu).toBe(true);
    expect(a.oficial).toBeNull();
    expect(bateuAMeta(a)).toBe(false);
  });

  it('bateu por valor e não por quantidade — e a régua é valor', () => {
    const a = progressoDaMeta({
      meta: { regua: 'valor', quantidade: 100, valor: 50_000 },
      resumo: { quantidade: 40, valor: 60_000 },
      uteis: 20, trabalhados: 20,
    });
    expect(bateuAMeta(a)).toBe(true);
    expect(a.quantidade.bateu).toBe(false);
  });

  it('a mesma venda, medida por quantidade, NÃO bateu', () => {
    const a = progressoDaMeta({
      meta: { regua: 'quantidade', quantidade: 100, valor: 50_000 },
      resumo: { quantidade: 40, valor: 60_000 },
      uteis: 20, trabalhados: 20,
    });
    expect(bateuAMeta(a)).toBe(false);
  });
});

describe('sem meta não é 0%', () => {
  const a = progressoDaMeta({
    meta: { regua: 'valor', quantidade: 0, valor: 0 },
    resumo: { quantidade: 12, valor: 40_000 },
    uteis: 21, trabalhados: 10,
  });

  it('percentual é null — 0% poria o setor no fim do ranking sem motivo', () => {
    expect(a.valor.pct).toBeNull();
    expect(a.quantidade.pct).toBeNull();
  });

  it('e não há ritmo para calcular', () => {
    expect(a.ritmoValor).toBeNull();
    expect(a.ritmoQuantidade).toBeNull();
  });

  it('nem bateu', () => {
    expect(bateuAMeta(a)).toBe(false);
  });
});

describe('falta nunca é negativa', () => {
  it('bater a meta não produz «falta −9» como na planilha de janeiro', () => {
    const a = progressoDaMeta({
      meta: { regua: 'quantidade', quantidade: 181, valor: 0 },
      resumo: { quantidade: 190, valor: 0 },
      uteis: 21, trabalhados: 21,
    });
    expect(a.quantidade.falta).toBe(0);
    expect(a.quantidade.bateu).toBe(true);
    // A planilha de janeiro mostrava «Falta p/Meta -9». O percentual continua
    // passando de 100 — é ele que mede o quanto passou.
    expect(a.quantidade.pct).toBeCloseTo(190 / 181, 10);
  });
});

describe('o primeiro dia do mês não estoura', () => {
  const a = progressoDaMeta({
    meta: { regua: 'valor', quantidade: 161, valor: 962_136 },
    resumo: { quantidade: 0, valor: 0 },
    uteis: 21, trabalhados: 0,
  });

  it('dividir por zero dias viraria Infinity — o piso é um dia', () => {
    expect(a.ritmoValor!.esperado).toBeCloseTo(45_816, 6);
    expect(Number.isFinite(a.ritmoValor!.projecaoPct!)).toBe(true);
    expect(a.ritmoValor!.projecaoPct).toBe(0);
  });
});

describe('mês fechado', () => {
  it('sem dia restante, não há «quanto por dia»', () => {
    const a = progressoDaMeta({
      meta: { regua: 'valor', quantidade: 161, valor: 962_136 },
      resumo: { quantidade: 150, valor: 900_000 },
      uteis: 21, trabalhados: 21,
    });
    expect(a.ritmoValor!.precisaPorDia).toBeNull();
    expect(a.valor.falta).toBeCloseTo(62_136, 6);
  });
});

describe('rótulo', () => {
  it('por quantidade, mostra as vendas', () => {
    const a = progressoDaMeta({ ...AGOSTO, meta: { ...AGOSTO.meta, regua: 'quantidade' } });
    expect(rotuloDoAndamento(a)).toBe('129 de 161 vendas · 80%');
  });

  it('por valor, mostra o percentual', () => {
    expect(rotuloDoAndamento(progressoDaMeta(AGOSTO))).toBe('71% do faturamento');
  });

  it('sem régua, diz que falta configurar', () => {
    const a = progressoDaMeta({ ...AGOSTO, meta: { ...AGOSTO.meta, regua: null } });
    expect(rotuloDoAndamento(a)).toBe('Sem meta definida');
  });
});

describe('a régua é valor fechado', () => {
  it('só as duas existem', () => {
    expect([...REGUAS]).toEqual(['quantidade', 'valor']);
  });

  it('lixo não vira régua', () => {
    expect(ehRegua('quantidade')).toBe(true);
    expect(ehRegua('valor')).toBe(true);
    expect(ehRegua('faturamento')).toBe(false);
    expect(ehRegua(null)).toBe(false);
    expect(ehRegua('')).toBe(false);
  });
});

/*
 * A meta proporcional à presença — o item que sobrou da Fase 8.
 *
 * O cenário é o mês de agosto da planilha, com 21 dias úteis, numa equipe de
 * 5 pessoas: 105 dias de trabalho disponíveis.
 */
describe('a ausência desconta da meta, e diz por quê', () => {
  const EQUIPE = { uteis: 21, pessoas: 5 };

  it('ninguém faltou: fator 1, e a meta não é tocada', () => {
    const f = fatorDePresenca({ ...EQUIPE, diasAbatidos: 0 });
    expect(f).toBe(1);

    const meta: MetaDoRecorte = { regua: 'valor', quantidade: 161, valor: 962_136 };
    expect(ajustarMetaPorPresenca(meta, f)).toBe(meta);
    expect(rotuloDaPresenca({ ...EQUIPE, diasAbatidos: 0 }, f)).toBeNull();
  });

  it('dez dias perdidos em 105 deixam a equipe com 90,5% do mês', () => {
    const f = fatorDePresenca({ ...EQUIPE, diasAbatidos: 10 })!;
    expect(f).toBeCloseTo(95 / 105, 10);

    const meta: MetaDoRecorte = { regua: 'valor', quantidade: 161, valor: 962_136 };
    const ajustada = ajustarMetaPorPresenca(meta, f);
    expect(ajustada.valor).toBeCloseTo(962_136 * (95 / 105), 6);
    // Meia venda não existe, e arredondar para baixo daria de presente a
    // fração que a proporcionalidade acabou de criar.
    expect(ajustada.quantidade).toBe(Math.ceil(161 * (95 / 105)));
    expect(ajustada.quantidade).toBe(146);
    // A régua não muda: quem decide continua sendo a configuração.
    expect(ajustada.regua).toBe('valor');
  });

  it('`null` não é 1 — «não perguntei» não pode virar «ninguém faltou»', () => {
    expect(fatorDePresenca({ uteis: 0, pessoas: 5, diasAbatidos: 0 })).toBeNull();
    expect(fatorDePresenca({ uteis: 21, pessoas: 0, diasAbatidos: 0 })).toBeNull();

    const meta: MetaDoRecorte = { regua: 'quantidade', quantidade: 161, valor: 0 };
    expect(ajustarMetaPorPresenca(meta, null)).toBe(meta);
  });

  it('ausência marcada errada não gera meta negativa', () => {
    // 200 dias perdidos numa capacidade de 105. O fator trava em 0.
    const f = fatorDePresenca({ ...EQUIPE, diasAbatidos: 200 });
    expect(f).toBe(0);
    const ajustada = ajustarMetaPorPresenca(
      { regua: 'valor', quantidade: 161, valor: 962_136 }, f,
    );
    expect(ajustada.valor).toBe(0);
    expect(ajustada.quantidade).toBe(0);
  });

  it('meio período aparece como 3,5 no rótulo, e não como 3.5', () => {
    const p = { uteis: 21, pessoas: 1, diasAbatidos: 3.5 };
    const f = fatorDePresenca(p)!;
    expect(rotuloDaPresenca(p, f)).toBe('3,5 dias úteis de ausência · meta em 83%');
  });

  it('um dia só fala no singular', () => {
    const p = { uteis: 21, pessoas: 1, diasAbatidos: 1 };
    expect(rotuloDaPresenca(p, fatorDePresenca(p))).toBe('1 dia útil de ausência · meta em 95%');
  });

  it('a meta ajustada é a que o progresso cobra', () => {
    const p = { uteis: 21, pessoas: 1, diasAbatidos: 10.5 };
    const f = fatorDePresenca(p)!;
    const meta = ajustarMetaPorPresenca({ regua: 'valor', quantidade: 0, valor: 100_000 }, f);
    // Metade do mês fora: a meta é metade, e fazer metade bate 100%.
    expect(meta.valor).toBeCloseTo(50_000, 6);

    const a = progressoDaMeta({
      meta, resumo: { quantidade: 0, valor: 50_000 }, uteis: 21, trabalhados: 21,
    });
    expect(bateuAMeta(a)).toBe(true);
  });
});
