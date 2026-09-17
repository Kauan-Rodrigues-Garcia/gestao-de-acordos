/**
 * mensagemEmDia.test.ts
 *
 * O texto é um parabéns que a liderança encaminha ao operador. Ele só pode
 * afirmar o que a estrela da tela afirma, e precisa chegar legível no WhatsApp:
 * sem «NaN», sem «undefined» e sem negrito de Markdown aparecendo literal.
 *
 * A variante do MÊS saiu em 17/09/2026 junto com a lente: a estrela é do dia, e
 * um parabéns pelo mês não teria mais de onde nascer.
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
    avaliacao: avaliarEmDia({ ...REGUA, valor })!,
  });
}

describe('montarMensagemEmDia', () => {
  it('abre com a estrela, o nome e o EM DIA', () => {
    expect(doDia().split('\n')[0]).toBe('⭐ *Ana Paula* — EM DIA');
  });

  it('usa negrito de WhatsApp, nunca de Markdown', () => {
    expect(doDia()).not.toContain('**');
  });

  it('diz de que dia se trata', () => {
    expect(doDia()).toContain('11/09/2026');
  });

  it('parabeniza pelo valor recebido no dia', () => {
    expect(doDia()).toMatch(/Parabéns pelos \*R\$\s?1\.250,00\* recebidos no dia/);
  });

  it('diz que atingiu a média diária necessária, com o valor dela', () => {
    expect(doDia()).toMatch(/atingiu a média diária necessária de \*R\$\s?1\.000,00\*/);
  });

  it('termina incentivando a manter o desempenho', () => {
    const linhas = doDia().trim().split('\n');
    expect(linhas[linhas.length - 1]).toContain('Continue mantendo esse desempenho');
  });

  it('não parabeniza quem não está em dia', () => {
    expect(doDia(500)).toBe('');
  });

  it('não deixa vazar undefined, NaN nem objeto', () => {
    expect(doDia()).not.toMatch(/undefined|NaN|null|\[object/);
  });
});
