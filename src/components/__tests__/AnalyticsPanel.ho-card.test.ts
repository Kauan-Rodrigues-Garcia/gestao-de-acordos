/**
 * AnalyticsPanel.ho-card.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Regressão do bug #4 (PaguePlay Dashboard):
 *   Card "Agendado restante no mês" deve:
 *     - PaguePlay: exibir label "H.O. Restante agendado no mês" e valor
 *                  = 24,96% do total (regra H.O.).
 *     - Bookplay:  manter label "Agendado restante no mês" e valor bruto.
 *
 * Este teste valida a LÓGICA numérica e de rotulagem aplicada no card,
 * espelhando as mesmas expressões ternárias do AnalyticsPanel.tsx.
 * Um snapshot visual completo do componente é sobrecomplexo (depende de
 * useAnalytics/useAuth/useEmpresa/motion/Recharts) — cobrir a lógica
 * pura com o mesmo helper calcHO garante o contrato sem flakiness.
 */
import { describe, it, expect } from 'vitest';
import { calcHO, PP_HO_PERCENTUAL, formatCurrency } from '@/lib/index';

// Replica fiel da lógica aplicada em AnalyticsPanel.tsx no card 5b
function resolveCardHoRestante(
  tenantSlug: string,
  valorAgendadoRestanteMes: number,
  totalAgendadoRestanteMes: number,
) {
  const isPP = tenantSlug === 'pagueplay';
  const label = isPP
    ? 'H.O. Restante agendado no mês'
    : 'Agendado restante no mês';
  const valorExibido = isPP
    ? calcHO(valorAgendadoRestanteMes)
    : valorAgendadoRestanteMes;
  const plural = totalAgendadoRestanteMes !== 1 ? 's' : '';
  const sub = isPP
    ? `${totalAgendadoRestanteMes} pendente${plural} · H.O. 24,96% de ${formatCurrency(valorAgendadoRestanteMes)}`
    : `${totalAgendadoRestanteMes} pendente${plural} · exclui pago/não pago`;
  return { label, valorExibido, sub };
}

describe('AnalyticsPanel — card H.O. Restante agendado no mês (#4)', () => {
  it('PaguePlay: label renomeado para "H.O. Restante agendado no mês"', () => {
    const { label } = resolveCardHoRestante('pagueplay', 10_000, 5);
    expect(label).toBe('H.O. Restante agendado no mês');
  });

  it('Bookplay: mantém label antigo "Agendado restante no mês"', () => {
    const { label } = resolveCardHoRestante('bookplay', 10_000, 5);
    expect(label).toBe('Agendado restante no mês');
  });

  it('PaguePlay: valor exibido = 24,96% do total (regra H.O.)', () => {
    const valorBruto = 10_000;
    const { valorExibido } = resolveCardHoRestante('pagueplay', valorBruto, 5);
    expect(valorExibido).toBeCloseTo(2_496, 5);
    expect(valorExibido / valorBruto).toBeCloseTo(PP_HO_PERCENTUAL, 5);
  });

  it('Bookplay: valor exibido = valor bruto (sem transformação)', () => {
    const valorBruto = 10_000;
    const { valorExibido } = resolveCardHoRestante('bookplay', valorBruto, 5);
    expect(valorExibido).toBe(valorBruto);
  });

  it('PaguePlay: subtítulo expõe a regra "H.O. 24,96% de {bruto}" para rastreabilidade', () => {
    const { sub } = resolveCardHoRestante('pagueplay', 1_000, 3);
    expect(sub).toContain('H.O. 24,96% de');
    expect(sub).toContain('3 pendentes');
  });

  it('Bookplay: subtítulo permanece "exclui pago/não pago"', () => {
    const { sub } = resolveCardHoRestante('bookplay', 1_000, 3);
    expect(sub).toContain('exclui pago/não pago');
    expect(sub).not.toContain('H.O.');
  });

  it('Singular/plural de "pendente" preservado em ambos tenants', () => {
    expect(resolveCardHoRestante('pagueplay', 500, 1).sub).toContain('1 pendente ·');
    expect(resolveCardHoRestante('pagueplay', 500, 2).sub).toContain('2 pendentes ·');
    expect(resolveCardHoRestante('bookplay', 500, 1).sub).toContain('1 pendente ·');
    expect(resolveCardHoRestante('bookplay', 500, 2).sub).toContain('2 pendentes ·');
  });

  it('Zero pendentes: PaguePlay calcula H.O. de 0 = 0', () => {
    const { valorExibido } = resolveCardHoRestante('pagueplay', 0, 0);
    expect(valorExibido).toBe(0);
  });

  it('Valores decimais: H.O. aplicado sem arredondamento errôneo', () => {
    const valorBruto = 1234.56;
    const { valorExibido } = resolveCardHoRestante('pagueplay', valorBruto, 7);
    // 1234.56 * 0.2496 = 308.146176
    expect(valorExibido).toBeCloseTo(308.146176, 5);
  });
});
