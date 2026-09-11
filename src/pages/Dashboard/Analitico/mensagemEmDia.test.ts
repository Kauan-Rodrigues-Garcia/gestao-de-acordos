/**
 * mensagemEmDia.test.ts
 *
 * O texto é um parabéns que a liderança encaminha ao operador. Ele só pode
 * afirmar o que a estrela da tela afirma, e precisa chegar legível no WhatsApp:
 * sem «NaN», sem «undefined» e sem negrito de Markdown aparecendo literal.
 */
import { describe, it, expect } from 'vitest';
import { montarMensagemEmDia } from './mensagemEmDia';
import { avaliarEmDia } from './emDiaOperador';

/** Meta 22.000 em 22 dias úteis → média diária necessária de 1.000. */
const REGUA = { meta: 22_000, totalUteis: 22 };

function doDia(valor = 1_250) {
  return montarMensagemEmDia({
    nome: 'Ana Paula',
    referencia: '2026-09-11',
    avaliacao: avaliarEmDia({ ...REGUA, lente: 'dia', valor, decorridos: 8 })!,
  });
}

function doMes(valor = 11_000) {
  return montarMensagemEmDia({
    nome: 'Ana Paula',
    referencia: '2026-09',
    avaliacao: avaliarEmDia({ ...REGUA, lente: 'mes', valor, decorridos: 10 })!,
  });
}

describe('montarMensagemEmDia', () => {
  it('abre com a estrela, o nome e o EM DIA', () => {
    expect(doDia().split('\n')[0]).toBe('⭐ *Ana Paula* — EM DIA');
    expect(doMes().split('\n')[0]).toBe('⭐ *Ana Paula* — EM DIA');
  });

  it('usa negrito de WhatsApp, nunca de Markdown', () => {
    expect(doDia()).not.toContain('**');
    expect(doMes()).not.toContain('**');
  });

  describe('lente Dia', () => {
    it('diz de que dia se trata', () => {
      expect(doDia()).toContain('11/09/2026');
    });

    it('parabeniza pelo valor recebido no dia', () => {
      expect(doDia()).toMatch(/Parabéns pelos \*R\$\s?1\.250,00\* recebidos no dia/);
    });

    it('diz que atingiu a média diária necessária, com o valor dela', () => {
      expect(doDia()).toMatch(/atingiu a média diária necessária de \*R\$\s?1\.000,00\*/);
    });
  });

  describe('lente Mês', () => {
    it('diz de que mês se trata, por extenso', () => {
      expect(doMes()).toContain('setembro/2026');
    });

    it('parabeniza pelo recebido do mês e mostra a média por dia útil', () => {
      const texto = doMes();
      expect(texto).toMatch(/Parabéns pelos \*R\$\s?11\.000,00\* recebidos no mês/);
      expect(texto).toMatch(/média por dia útil está em \*R\$\s?1\.100,00\*/);
      expect(texto).toMatch(/atingiu a média diária necessária de \*R\$\s?1\.000,00\*/);
    });
  });

  it('termina incentivando a manter o desempenho', () => {
    for (const texto of [doDia(), doMes()]) {
      const linhas = texto.trim().split('\n');
      expect(linhas[linhas.length - 1]).toContain('Continue mantendo esse desempenho');
    }
  });

  it('não parabeniza quem não está em dia', () => {
    expect(doDia(500)).toBe('');
  });

  it('não deixa vazar undefined, NaN nem objeto', () => {
    for (const texto of [doDia(), doMes()]) {
      expect(texto).not.toMatch(/undefined|NaN|null|\[object/);
    }
  });
});
