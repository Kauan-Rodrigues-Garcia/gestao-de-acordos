/**
 * logs-descricao.test.ts
 *
 * `normalizarDescricao` conserta, na LEITURA, o texto que duas falhas gravaram em
 * ~872 linhas até 17/08/2026. A migration 20260817200000 corrige a origem; estas
 * linhas ficam como estão, porque a trilha é somente-acréscimo.
 *
 * O risco de uma função assim é passar do ponto: alterar o sentido de uma frase
 * de auditoria é a única coisa que ela não pode fazer. Metade dos testes existe
 * para garantir que ela NÃO mexe no que não deve.
 */
import { describe, it, expect } from 'vitest';
import { normalizarDescricao } from '../logs-catalogo';

describe('NR duplicado', () => {
  /** Frases reais colhidas da tabela em 17/08/2026. */
  it('conserta a titularidade alterada', () => {
    expect(normalizarDescricao(
      'Alterou a titularidade de NR NR 12983305 — Sirlei Stephanie: acordo id',
    )).toBe('Alterou a titularidade do NR 12983305 — Sirlei Stephanie: acordo');
  });

  it('conserta a titularidade excluída', () => {
    expect(normalizarDescricao(
      'Excluiu a titularidade de NR NR 6953334 — Aline Pupim',
    )).toBe('Excluiu a titularidade do NR 6953334 — Aline Pupim');
  });

  it('a rede pega "NR NR" sem o "de" na frente', () => {
    expect(normalizarDescricao('Qualquer coisa NR NR 999')).toBe('Qualquer coisa NR 999');
  });
});

describe('nomes de coluna que escaparam', () => {
  it.each([
    [': acordo id',            ': acordo'],
    [': acordo grupo id',      ': grupo de parcelas'],
    [': nr value',             ': NR'],
    [': operador nome',        ': operador'],
    [': vinculo operador id',  ': operador do vínculo'],
  ])('%s → %s', (bruto, limpo) => {
    expect(normalizarDescricao(`Alterou o acordo X${bruto}`)).toBe(`Alterou o acordo X${limpo}`);
  });
});

describe('o que NÃO deve mudar', () => {
  it('frase já correta passa intacta', () => {
    const ok = 'Alterou o acordo NR 12983305 — TATIANE RIEGEL: parcelas';
    expect(normalizarDescricao(ok)).toBe(ok);
  });

  it('frase sem NR passa intacta', () => {
    const ok = 'Alterou o acordo PRISCYLA DE SOUSA FEITOSA: observações';
    expect(normalizarDescricao(ok)).toBe(ok);
  });

  /**
   * "NR" pode aparecer num nome de cliente. Sem a âncora no dígito seguinte, a
   * substituição comeria parte do nome — alterando o sentido de uma linha de
   * auditoria, que é o limite desta função.
   */
  it('cliente chamado NR não é mexido', () => {
    const ok = 'Alterou o acordo NR NR SERVICOS LTDA: valor';
    expect(normalizarDescricao(ok)).toBe(ok);
  });

  it('"de NR" seguido de número, sem duplicar, passa intacto', () => {
    const ok = 'Excluiu a titularidade de NR 6953334 — Aline';
    expect(normalizarDescricao(ok)).toBe(ok);
  });

  /** Só troca depois de ": ", que é onde a frase lista os campos. */
  it('"acordo id" fora da lista de campos não é trocado', () => {
    const ok = 'Mexeu no acordo id do cliente';
    expect(normalizarDescricao(ok)).toBe(ok);
  });

  it('nulo e vazio devolvem string vazia', () => {
    expect(normalizarDescricao(null)).toBe('');
    expect(normalizarDescricao(undefined)).toBe('');
    expect(normalizarDescricao('')).toBe('');
  });

  it('é idempotente — aplicar duas vezes dá o mesmo', () => {
    const bruto = 'Alterou a titularidade de NR NR 12983305 — X: acordo id';
    const uma = normalizarDescricao(bruto);
    expect(normalizarDescricao(uma)).toBe(uma);
  });
});
