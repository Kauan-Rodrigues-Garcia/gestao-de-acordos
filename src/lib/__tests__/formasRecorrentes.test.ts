/**
 * formasRecorrentes.test.ts — a regra das cobranças automáticas, travada.
 *
 * As três consequências foram pedidas juntas em 05/09/2026 e valem só para PIX
 * Automático e Cartão Recorrente: parcela única, vencimento nunca no passado, e
 * o aviso de que a comissão sai da aba Pix Automático. O que este arquivo
 * protege é a LISTA — se uma forma nova entrar nela sem querer, três telas
 * mudam de comportamento de uma vez.
 */
import { describe, expect, it } from 'vitest';
import {
  FORMAS_RECORRENTES, ehFormaRecorrente, nomeDaFormaRecorrente,
  erroVencimentoRecorrente, ultimoDiaDoMesDe,
} from '@/lib/formasRecorrentes';
import { TIPOS_BOOKPLAY } from '@/components/AcordoNovoInline/constants';
import { isTipoParcelado } from '@/components/AcordoDetalheInline/helpers';

describe('formasRecorrentes', () => {
  it('são exatamente duas: PIX Automático e Cartão Recorrente', () => {
    expect([...FORMAS_RECORRENTES]).toEqual(['pix_automatico', 'cartao_recorrente']);
  });

  it('reconhece as duas e recusa as demais', () => {
    expect(ehFormaRecorrente('pix_automatico')).toBe(true);
    expect(ehFormaRecorrente('cartao_recorrente')).toBe(true);
    // 'pix' e 'cartao' são as formas AVULSAS — parcelam e aceitam data passada.
    expect(ehFormaRecorrente('pix')).toBe(false);
    expect(ehFormaRecorrente('cartao')).toBe(false);
    expect(ehFormaRecorrente('boleto')).toBe(false);
    expect(ehFormaRecorrente(null)).toBe(false);
    expect(ehFormaRecorrente(undefined)).toBe(false);
    expect(ehFormaRecorrente('')).toBe(false);
  });

  it('nomeia as duas para as frases da tela', () => {
    expect(nomeDaFormaRecorrente('pix_automatico')).toBe('PIX Automático');
    expect(nomeDaFormaRecorrente('cartao_recorrente')).toBe('Cartão Recorrente');
  });

  /*
   * O elo entre a lista e o formulário.
   *
   * `parcelado: false` é o que faz o campo "Parcelas" sumir e o que força
   * `parcelasStr` de volta para '1' em `handleChangeTipo`. Se alguém religar o
   * parcelamento numa dessas formas, é aqui que aparece.
   */
  it('nenhuma forma recorrente parcela no formulário da BookPlay', () => {
    for (const t of TIPOS_BOOKPLAY) {
      expect(t.parcelado).toBe(!ehFormaRecorrente(t.value));
    }
  });

  it('as duas existem no formulário da BookPlay', () => {
    const valores = TIPOS_BOOKPLAY.map(t => t.value);
    for (const forma of FORMAS_RECORRENTES) expect(valores).toContain(forma);
  });

  // Marcar pago na lista não oferece reagendar a "próxima" (22/09/2026).
  it('nenhuma forma recorrente reagenda parcela na lista de acordos', () => {
    for (const forma of FORMAS_RECORRENTES) expect(isTipoParcelado(forma, false)).toBe(false);
    expect(isTipoParcelado('boleto', false)).toBe(true);
  });
});

describe('vencimento recorrente: só o mês atual, de hoje em diante', () => {
  const HOJE = '2026-09-22';

  it('aceita de hoje até o último dia do mês', () => {
    expect(erroVencimentoRecorrente('pix_automatico', '2026-09-22', HOJE)).toBeNull();
    expect(erroVencimentoRecorrente('pix_automatico', '2026-09-30', HOJE)).toBeNull();
  });

  it('recusa data passada', () => {
    expect(erroVencimentoRecorrente('pix_automatico', '2026-09-21', HOJE)).toMatch(/data passada/);
  });

  it('recusa o mês que vem', () => {
    expect(erroVencimentoRecorrente('cartao_recorrente', '2026-10-01', HOJE))
      .toMatch(/^Cartão Recorrente só pode ser lançado no mês atual/);
  });

  it('último dia do mês respeita mês curto e bissexto', () => {
    expect(ultimoDiaDoMesDe('2026-09-22')).toBe('2026-09-30');
    expect(ultimoDiaDoMesDe('2026-02-10')).toBe('2026-02-28');
    expect(ultimoDiaDoMesDe('2028-02-10')).toBe('2028-02-29');
    expect(ultimoDiaDoMesDe('2026-12-05')).toBe('2026-12-31');
  });
});
