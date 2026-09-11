/**
 * mensagemEquipe.test.ts
 *
 * O texto vai para o grupo dos operadores, que não têm o painel aberto. O que
 * estes casos protegem:
 *
 *   • os números são os do CARD — a mesma `detalharEquipe` desenha os dois;
 *   • o recado é da equipe, não de uma pessoa: a distribuição por faixa entra,
 *     e o único nome citado é o destaque positivo. Quem está atrás nunca é
 *     exposto num grupo;
 *   • sem meta, o que depende dela some em vez de virar «—» ou «NaN».
 */
import { describe, it, expect } from 'vitest';
import { montarMensagemEquipe } from './mensagemEquipe';
import { detalharEquipe, type OperadorNaEquipe } from './desempenhoEquipe';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';

/**
 * Meta individual de 20.000 em 20 dias úteis, 10 trabalhados → esperado 10.000.
 * Quartis padrão: 1º ≥ 100%, 2º ≥ 80%, 3º ≥ 50%, 4º o resto.
 */
const OPERADORES: OperadorNaEquipe[] = [
  { id: 'a', nome: 'Ana Paula',   recebido: 12_000, meta: 20_000 },  // 120% → 1º
  { id: 'b', nome: 'Bruno Lima',  recebido: 9_000,  meta: 20_000 },  //  90% → 2º
  { id: 'c', nome: 'Carla Souza', recebido: 3_000,  meta: 20_000 },  //  30% → 4º
  { id: 'd', nome: 'Diego Reis',  recebido: 1_000,  meta: null },    // sem meta
];

/** Equipe: meta 100.000, 10 de 20 dias úteis, 45.000 recebidos → 90%, 2º quartil. */
function montar(opts: {
  acumulado?: number;
  meta?: number | null;
  operadores?: OperadorNaEquipe[];
  ehSetor?: boolean;
  rotuloUnidade?: string | null;
  acumuladoHO?: number | null;
} = {}) {
  const acumulado = opts.acumulado ?? 45_000;
  const meta = opts.meta === undefined ? 100_000 : opts.meta;
  return montarMensagemEquipe({
    titulo: 'Time Matheus',
    ehSetor: opts.ehSetor,
    mes: '2026-09',
    acumulado,
    meta,
    rotuloUnidade: opts.rotuloUnidade ?? null,
    acumuladoHO: opts.acumuladoHO ?? null,
    detalhe: detalharEquipe({
      acumulado, meta, totalUteis: 20, decorridos: 10, quartis: QUARTIS_PADRAO,
      operadores: opts.operadores ?? OPERADORES,
    }),
  });
}

describe('montarMensagemEquipe', () => {
  it('abre com o nome da equipe e o mês por extenso', () => {
    expect(montar().split('\n')[0]).toBe('*Time Matheus* — setembro/2026');
  });

  it('usa negrito de WhatsApp, nunca de Markdown', () => {
    const texto = montar();
    expect(texto).toContain('*Ritmo*');
    expect(texto).not.toContain('**');
  });

  describe('onde a equipe está', () => {
    it('diz o recebido da equipe, sem unidade na BookPlay', () => {
      const texto = montar();
      expect(texto).toMatch(/\*Recebido da equipe:\* R\$\s?45\.000,00/);
      expect(texto).not.toContain('H.O.');
    });

    it('na PaguePlay nomeia a unidade e traz o H.O., como o card', () => {
      const texto = montar({ rotuloUnidade: 'Bruto', acumuladoHO: 11_232 });
      expect(texto).toMatch(/\*Recebido da equipe \(Bruto\):\* R\$\s?45\.000,00/);
      expect(texto).toMatch(/\*H\.O\.:\* R\$\s?11\.232,00/);
    });

    it('no card de setor, o recebido é do setor', () => {
      expect(montar({ ehSetor: true })).toMatch(/\*Recebido do setor:\* R\$\s?45\.000,00/);
    });

    it('traz a meta com a porcentagem já calculada', () => {
      expect(montar()).toMatch(/\*Meta:\* R\$\s?100\.000,00 \(45% da meta\)/);
    });

    it('traz a projeção e a faixa da equipe', () => {
      expect(montar()).toContain('*Projeção:* 90% — 2º quartil');
    });
  });

  describe('ritmo', () => {
    it('média, dias restantes, fechamento e o necessário por dia', () => {
      const texto = montar();
      expect(texto).toMatch(/Média por dia útil: R\$\s?4\.500,00/);
      expect(texto).toContain('Dias úteis restantes: 10');
      expect(texto).toMatch(/fecha o mês em R\$\s?90\.000,00/);
      expect(texto).toMatch(/Para bater a meta: R\$\s?5\.500,00 por dia útil restante/);
    });

    it('meta batida vira comemoração em vez de ritmo necessário', () => {
      const texto = montar({ acumulado: 110_000 });
      expect(texto).toContain('Meta do mês já batida');
      expect(texto).not.toContain('Para bater a meta:');
    });
  });

  describe('faixas', () => {
    it('lista só as faixas que faltam, com quanto falta', () => {
      const texto = montar();
      expect(texto).toContain('*Para subir de faixa*');
      expect(texto).toMatch(/1º quartil: faltam R\$\s?5\.000,00/);
      expect(texto).not.toContain('2º quartil: faltam');
    });

    it('equipe na melhor faixa recebe elogio, não uma lista vazia', () => {
      const texto = montar({ acumulado: 60_000 });
      expect(texto).toContain('A equipe já está na melhor faixa.');
      expect(texto).not.toContain('*Para subir de faixa*');
    });

    it('o elogio do setor fala do setor', () => {
      expect(montar({ acumulado: 60_000, ehSetor: true })).toContain('O setor já está na melhor faixa.');
    });
  });

  describe('pessoas', () => {
    it('conta quantas pessoas há em cada faixa', () => {
      const linhas = montar().split('\n');
      expect(linhas).toContain('*Pessoas por faixa*');
      expect(linhas).toContain('• 1º quartil: 1 pessoa');
      expect(linhas).toContain('• 2º quartil: 1 pessoa');
      expect(linhas).toContain('• 3º quartil: 0 pessoas');
      expect(linhas).toContain('• 4º quartil: 1 pessoa');
    });

    it('cita só o destaque positivo — nunca quem está atrás', () => {
      const texto = montar();
      expect(texto).toMatch(/🔥 \*Destaque:\* Ana Paula — R\$\s?12\.000,00/);
      expect(texto).not.toContain('Bruno');
      expect(texto).not.toContain('Carla');
      expect(texto).not.toContain('Diego');
    });

    it('sem operadores, a seção de pessoas e o destaque somem', () => {
      const texto = montar({ operadores: [] });
      expect(texto).not.toContain('Pessoas por faixa');
      expect(texto).not.toContain('Destaque');
    });

    it('ninguém com recebimento não tem destaque', () => {
      const texto = montar({
        operadores: [{ id: 'x', nome: 'Xavier', recebido: 0, meta: 20_000 }],
      });
      expect(texto).not.toContain('Destaque');
    });
  });

  it('sem meta, a meta, a projeção e as faixas somem em vez de mostrar traço', () => {
    const texto = montar({ meta: null });
    expect(texto).not.toContain('*Meta:*');
    expect(texto).not.toContain('*Projeção:*');
    expect(texto).not.toContain('*Para subir de faixa*');
    expect(texto).not.toContain('melhor faixa');
    expect(texto).toContain('*Ritmo*');
    expect(texto).not.toMatch(/NaN|null|undefined/);
  });

  it('não deixa vazar objeto nem undefined no texto final', () => {
    const texto = montar();
    expect(texto).not.toContain('undefined');
    expect(texto).not.toContain('[object');
  });
});
