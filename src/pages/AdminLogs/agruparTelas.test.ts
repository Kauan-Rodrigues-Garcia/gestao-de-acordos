import { describe, it, expect } from 'vitest';
import { agruparPorTela, telaTeveUso } from './agruparTelas';
import type { UsoPorTela } from '@/services/uso.service';

const linha = (tela: string, segundos: number, aberturas = 1, pessoas = 1): UsoPorTela =>
  ({ tela, segundos, aberturas, pessoas });

describe('agruparPorTela', () => {
  /**
   * O defeito que o agrupamento evita: o Analítico em seis linhas pequenas
   * perdia o ranking para uma tela de aba única com menos tempo.
   */
  it('soma as abas na tela do menu e ordena pelo total', () => {
    const grupos = agruparPorTela([
      linha('acordos', 500),
      linha('analitico:analitico/mes/ranking', 300),
      linha('analitico:colchao', 200),
      linha('analitico:desafios/catalogo', 100),
    ]);
    expect(grupos.map(g => g.raiz)).toEqual(['analitico', 'acordos']);
    expect(grupos[0].segundos).toBe(600);
    expect(grupos[0].abas.map(a => a.tela)).toEqual([
      'analitico:analitico/mes/ranking', 'analitico:colchao', 'analitico:desafios/catalogo',
    ]);
  });

  it('soma aberturas', () => {
    const [g] = agruparPorTela([linha('lider:desempenho', 10, 3), linha('lider:quartis', 5, 2)]);
    expect(g.aberturas).toBe(5);
  });

  /** A mesma pessoa em três abas contaria três vezes numa soma. */
  it('pessoas é o maior valor entre as abas, e não a soma', () => {
    const [g] = agruparPorTela([
      linha('lider:desempenho', 10, 1, 4),
      linha('lider:quartis', 5, 1, 7),
      linha('lider:grafico', 1, 1, 2),
    ]);
    expect(g.pessoasMinimo).toBe(7);
    expect(g.pessoasExato).toBe(false);
  });

  it('tela de uma linha só tem o número de pessoas exato', () => {
    const [g] = agruparPorTela([linha('tickets', 10, 1, 3)]);
    expect(g.pessoasMinimo).toBe(3);
    expect(g.pessoasExato).toBe(true);
  });

  /** `acordos/novo` tem rota própria: é outra tela do menu, não aba de Acordos. */
  it('rota filha não entra no grupo da rota mãe', () => {
    const grupos = agruparPorTela([linha('acordos:todos', 10), linha('acordos/novo', 5)]);
    expect(grupos.map(g => g.raiz).sort()).toEqual(['acordos', 'acordos/novo']);
  });

  it('número vindo do banco como texto não vira concatenação', () => {
    const [g] = agruparPorTela([
      { tela: 'lider:a', segundos: '10' as unknown as number, aberturas: '1' as unknown as number, pessoas: 1 },
      { tela: 'lider:b', segundos: '5' as unknown as number, aberturas: '2' as unknown as number, pessoas: 1 },
    ]);
    expect(g.segundos).toBe(15);
    expect(g.aberturas).toBe(3);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(agruparPorTela([])).toEqual([]);
  });
});

describe('telaTeveUso', () => {
  it('a tela do menu conta pelo uso de qualquer aba', () => {
    expect(telaTeveUso('analitico', ['analitico:analitico/mes'])).toBe(true);
    expect(telaTeveUso('analitico', ['analitico'])).toBe(true);
  });

  it('a aba conta pelo uso das abas de dentro dela', () => {
    expect(telaTeveUso('admin/configuracoes:logs', ['admin/configuracoes:logs/trilha'])).toBe(true);
  });

  it('prefixo de nome não é aba', () => {
    // `lider` e `lider-extra` são telas diferentes; `lider:des` não é `lider:desempenho`.
    expect(telaTeveUso('lider', ['lider-extra'])).toBe(false);
    expect(telaTeveUso('lider:des', ['lider:desempenho'])).toBe(false);
  });

  it('rota filha não conta como uso da rota mãe', () => {
    expect(telaTeveUso('acordos', ['acordos/novo'])).toBe(false);
  });

  it('aba vizinha não conta', () => {
    expect(telaTeveUso('lider:quartis', ['lider:desempenho'])).toBe(false);
  });
});
