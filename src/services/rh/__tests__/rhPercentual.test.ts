/**
 * O percentual do operador — e a prova de que ele NÃO é uma segunda conta.
 *
 * O teste mais importante deste arquivo é o último: dado o mesmo par (meta,
 * recebido) e o mesmo calendário, `calcularPercentualRh` devolve exatamente o
 * que `calcularProjecao` devolve. É essa igualdade que impede o RH de pagar por
 * um número que a aba Quartis não reconhece.
 */
import { describe, it, expect } from 'vitest';
import { calcularPercentualRh, formatarPercentual, corPercentual } from '../rhPercentual';
import { calcularProjecao } from '@/lib/projecaoMetas';
import { diasUteisDoMes, diasUteisDecorridos, QUARTIS_PADRAO } from '@/lib/diasUteis';
import type { MetasConfigMes } from '@/lib/supabase';

/** Agosto/2026 sem feriados, conferido depois de encerrado. */
const MES = '2026-08';
const DEPOIS_DO_MES = '2026-09-05';

const CONFIG: MetasConfigMes = {
  id: 'cfg', empresa_id: 'emp', mes: 8, ano: 2026,
  feriados: [], quartis: QUARTIS_PADRAO, contar_dia_atual: false,
  atualizado_por: null, atualizado_em: '2026-08-01T00:00:00Z',
} as unknown as MetasConfigMes;

describe('calcularPercentualRh', () => {
  it('mês encerrado: o percentual é recebido ÷ meta', () => {
    // Não por uma regra especial: num mês já passado, `esperado` é a meta
    // cheia, então a mesma fórmula responde as duas perguntas.
    const r = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 18100,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    expect(r.percentual).toBe(181);
  });

  it('sem meta devolve null, e não zero', () => {
    // «Não bateu nada» e «não tinha meta» são coisas diferentes, e o RH precisa
    // saber qual está olhando antes de decidir um valor.
    const r = calcularPercentualRh({
      mesApuracao: MES, meta: null, recebido: 5000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    expect(r.percentual).toBeNull();
    expect(r.recebido).toBe(5000);
  });

  it('meta zero também é "sem meta"', () => {
    const r = calcularPercentualRh({
      mesApuracao: MES, meta: 0, recebido: 5000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    expect(r.percentual).toBeNull();
  });

  it('recebido zero com meta é 0%, e não «sem meta»', () => {
    const r = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 0,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    expect(r.percentual).toBe(0);
  });

  it('equipe de treinamento conta só os dias em que existiu', () => {
    const cheio = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 5000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    const parcial = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 5000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES, inicioEquipeISO: '2026-08-17',
    });
    expect(parcial.diasUteis).toBeLessThan(cheio.diasUteis);
  });

  it('no MEIO do mês o treinamento melhora a leitura da equipe nova', () => {
    // A correção que a aba Quartis já faz: cobrar o mês inteiro de quem entrou
    // no dia 17 faz a pessoa parecer pior do que foi.
    const noMeioDoMes = '2026-08-20';
    const cheio = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 5000,
      configMes: CONFIG, hojeISO: noMeioDoMes,
    });
    const parcial = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 5000,
      configMes: CONFIG, hojeISO: noMeioDoMes, inicioEquipeISO: '2026-08-17',
    });
    expect(parcial.percentual!).toBeGreaterThan(cheio.percentual!);
  });

  it('em mês ENCERRADO o treinamento não muda o percentual — e isso é correto', () => {
    // `esperado = (meta ÷ dias úteis) × decorridos`. Num mês fechado,
    // `decorridos` é igual a `dias úteis` dos dois lados, então os fatores se
    // cancelam e sobra `recebido ÷ meta`.
    //
    // Não é um caso não tratado: é o comportamento que a aba Quartis já tem, e
    // reproduzi-lo é o ponto. A meta do mês é a meta do mês; o ajuste de
    // treinamento existe para a leitura DURANTE o período, não para reduzir a
    // meta de quem entrou no meio dele.
    const cheio = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 5000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    const parcial = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 5000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES, inicioEquipeISO: '2026-08-17',
    });
    expect(parcial.percentual).toBe(cheio.percentual);
    expect(cheio.percentual).toBe(50);
  });

  it('sem configuração de mês usa os quartis padrão em vez de quebrar', () => {
    const r = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 10000,
      configMes: null, hojeISO: DEPOIS_DO_MES,
    });
    expect(r.percentual).toBe(100);
    expect(r.quartil).not.toBeNull();
  });

  it('feriado reduz os dias úteis do mês', () => {
    const comFeriado = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 10000,
      configMes: { ...CONFIG, feriados: ['2026-08-03', '2026-08-04'] } as MetasConfigMes,
      hojeISO: DEPOIS_DO_MES,
    });
    const semFeriado = calcularPercentualRh({
      mesApuracao: MES, meta: 10000, recebido: 10000,
      configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });
    expect(comFeriado.diasUteis).toBe(semFeriado.diasUteis - 2);
  });

  it('CONTRATO: dá exatamente o mesmo que `calcularProjecao`', () => {
    // Este é o teste que impede o segundo cálculo de nascer. Se alguém
    // reescrever a conta aqui, ele quebra.
    const meta = 12345, recebido = 20000;
    const totalUteis = diasUteisDoMes(2026, 8, []);
    const decorridos = Math.max(
      diasUteisDecorridos(2026, 8, [], DEPOIS_DO_MES, undefined, false), 1);

    const referencia = calcularProjecao({
      meta, recebido, totalUteis, decorridos, quartis: QUARTIS_PADRAO,
    });
    const nosso = calcularPercentualRh({
      mesApuracao: MES, meta, recebido, configMes: CONFIG, hojeISO: DEPOIS_DO_MES,
    });

    expect(nosso.percentual).toBe(referencia!.projecaoPct);
    expect(nosso.quartil?.quartil).toBe(referencia!.quartil?.quartil);
  });
});

describe('formatação', () => {
  it('arredonda e põe o símbolo', () => {
    expect(formatarPercentual(181.4)).toBe('181%');
    expect(formatarPercentual(0)).toBe('0%');
  });

  it('sem percentual mostra travessão — não «0%»', () => {
    expect(formatarPercentual(null)).toBe('—');
    expect(formatarPercentual(undefined)).toBe('—');
    expect(formatarPercentual(Number.NaN)).toBe('—');
  });

  it('a cor acompanha a escala já usada no resto do sistema', () => {
    expect(corPercentual(120)).toContain('emerald');
    expect(corPercentual(85)).toContain('sky');
    expect(corPercentual(65)).toContain('amber');
    expect(corPercentual(20)).toContain('red');
    expect(corPercentual(null)).toContain('muted');
  });
});
