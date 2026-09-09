/**
 * diretoriaSetores.service.test.ts — as contas da aba «Setores e equipes».
 *
 * As duas funções aqui têm o mesmo perfil de risco da fase 1: erradas, elas não
 * quebram — devolvem um número plausível. Uma participação com o denominador
 * errado e uma projeção medida com a régua errada são exatamente o tipo de
 * coisa que ninguém confere porque já veio pronta na tela.
 */
import { describe, it, expect } from 'vitest';
import { participacao, projecaoDoSetor } from './diretoriaSetores.service';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';

describe('participacao', () => {
  it('divide pelo total recebido', () => {
    expect(participacao(250, 1000)).toBeCloseTo(25, 6);
  });

  it('total zero devolve null, e não zero', () => {
    // «0% do total» e «não há total» dizem coisas diferentes, e só a segunda
    // justifica a tela omitir a porcentagem.
    expect(participacao(100, 0)).toBeNull();
    expect(participacao(100, -5)).toBeNull();
  });

  it('não devolve NaN para entrada inválida', () => {
    expect(participacao(Number.NaN, 100)).toBeNull();
    expect(participacao(100, Number.NaN)).toBeNull();
  });

  it('a soma das participações fecha em 100 quando o total é a soma dos setores', () => {
    // É este o contrato que obriga o denominador a ser a soma dos SETORES e não
    // o total da empresa: com Integral cruzado os dois são diferentes, e usar o
    // total da empresa faria as fatias passarem de 100%.
    const setores = [400, 350, 250];
    const total = setores.reduce((s, v) => s + v, 0);
    const soma = setores.reduce((s, v) => s + (participacao(v, total) ?? 0), 0);
    expect(soma).toBeCloseTo(100, 6);
  });
});

describe('projecaoDoSetor', () => {
  // Setembro de 2026: 30 dias, começa numa terça. Sem feriados, 22 dias úteis.
  const base = {
    mes: '2026-09',
    feriados: [] as string[],
    quartis: QUARTIS_PADRAO,
    contarDiaAtual: false,
  };

  it('sem meta devolve null, e não uma projeção de zero', () => {
    // Setor sem meta não está a 0% da meta: ele não está medido. O card precisa
    // poder dizer «sem meta» em vez de pintar de vermelho.
    expect(projecaoDoSetor({ ...base, meta: 0, recebido: 5000, diaCorte: 10 })).toBeNull();
    expect(projecaoDoSetor({ ...base, meta: null, recebido: 5000, diaCorte: 10 })).toBeNull();
    expect(projecaoDoSetor({ ...base, meta: undefined, recebido: 5000, diaCorte: 10 })).toBeNull();
  });

  it('mês inválido devolve null em vez de inventar calendário', () => {
    expect(projecaoDoSetor({ ...base, mes: 'xxxx-yy', meta: 100, recebido: 10, diaCorte: 5 })).toBeNull();
    expect(projecaoDoSetor({ ...base, mes: '2026-13', meta: 100, recebido: 10, diaCorte: 5 })).toBeNull();
  });

  it('o dia de CORTE faz o papel de hoje', () => {
    // O ponto central do arquivo: mover o corte tem que mover o esperado junto.
    // Se a projeção ignorasse o corte, os dois resultados abaixo seriam iguais
    // e o card despencaria ao investigar um dia anterior.
    const cedo  = projecaoDoSetor({ ...base, meta: 220_000, recebido: 50_000, diaCorte: 5 });
    const tarde = projecaoDoSetor({ ...base, meta: 220_000, recebido: 50_000, diaCorte: 25 });
    expect(cedo).not.toBeNull();
    expect(tarde).not.toBeNull();
    expect(cedo!.esperado).toBeLessThan(tarde!.esperado);
    // Mesmo recebido, esperado maior ⇒ projeção menor. É a leitura correta.
    expect(cedo!.projecaoPct).toBeGreaterThan(tarde!.projecaoPct);
  });

  it('a meta diária sai da meta do mês sobre os dias ÚTEIS', () => {
    const r = projecaoDoSetor({ ...base, meta: 220_000, recebido: 100_000, diaCorte: 15 });
    expect(r).not.toBeNull();
    // 22 dias úteis em setembro/2026 sem feriados.
    expect(r!.metaDiaria).toBeCloseTo(220_000 / 22, 6);
  });

  it('feriado reduz os dias úteis e sobe a meta diária', () => {
    const sem = projecaoDoSetor({ ...base, meta: 220_000, recebido: 100_000, diaCorte: 15 });
    const com = projecaoDoSetor({
      ...base, feriados: ['2026-09-07'], meta: 220_000, recebido: 100_000, diaCorte: 15,
    });
    expect(com!.metaDiaria).toBeGreaterThan(sem!.metaDiaria);
  });

  it('corte no dia 1 não divide por zero', () => {
    // `calcularProjecao` põe piso de 1 em `decorridos`; aqui só se garante que
    // o caminho chega lá sem Infinity nem NaN.
    const r = projecaoDoSetor({ ...base, meta: 220_000, recebido: 1_000, diaCorte: 1 });
    expect(r).not.toBeNull();
    expect(Number.isFinite(r!.projecaoPct)).toBe(true);
    expect(Number.isFinite(r!.esperado)).toBe(true);
  });

  it('devolve o quartil alcançado pela projeção', () => {
    const r = projecaoDoSetor({ ...base, meta: 220_000, recebido: 500_000, diaCorte: 10 });
    expect(r).not.toBeNull();
    expect(r!.quartil).not.toBeNull();
  });

  it('contarDiaAtual muda o esperado, e não é ignorado', () => {
    const sem = projecaoDoSetor({ ...base, meta: 220_000, recebido: 100_000, diaCorte: 15 });
    const com = projecaoDoSetor({
      ...base, contarDiaAtual: true, meta: 220_000, recebido: 100_000, diaCorte: 15,
    });
    // Dia 15/09/2026 é uma terça — dia útil. Contá-lo acrescenta um dia ao
    // esperado; se os dois viessem iguais, a config não estaria chegando lá.
    expect(com!.esperado).toBeGreaterThan(sem!.esperado);
  });
});
