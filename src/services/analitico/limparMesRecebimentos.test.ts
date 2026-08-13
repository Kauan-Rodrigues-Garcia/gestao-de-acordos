/**
 * limparMesRecebimentos.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A garantia: apagar o mês do analítico apaga o mês do diário junto.
 *
 * Na BookPlay as duas abas saem do MESMO arquivo (`useAnaliticoImport` chama
 * `importarLoteAnalitico` e depois `importarLoteDiario`). Enquanto só o analítico
 * era limpo, o diário sobrava — R$ 8.991,78 acima do analítico em agosto/2026,
 * com dois setores tendo diário sem uma única linha de analítico.
 *
 * O que estes testes travam é o CONTRATO entre os dois lados, que é onde a regra
 * se perde: o mesmo escopo nos dois, a ordem (analítico primeiro) e o erro do
 * diário chegando separado — porque nesse caso o analítico JÁ saiu e a tela tem
 * de dizer as duas coisas, senão o líder clica de novo achando que nada foi feito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const limparDadosDoMesMock      = vi.fn();
const limparDadosDoMesSetorMock = vi.fn();
const limparMesDiarioMock       = vi.fn();

vi.mock('./analitico.service', () => ({
  limparDadosDoMes:      (...a: unknown[]) => limparDadosDoMesMock(...a),
  limparDadosDoMesSetor: (...a: unknown[]) => limparDadosDoMesSetorMock(...a),
}));

vi.mock('@/services/diario/diario.service', () => ({
  limparMesDiario: (...a: unknown[]) => limparMesDiarioMock(...a),
}));

const { limparMesRecebimentos } = await import('./limparMesRecebimentos');

const EMPRESA = 'emp-1';
const MES     = '2026-08';
const ESCOPO  = { setorId: 'setor-play-5', perfilIds: ['op-1'], porRelatorio: true };

beforeEach(() => {
  limparDadosDoMesMock.mockReset().mockResolvedValue({ error: null });
  limparDadosDoMesSetorMock.mockReset().mockResolvedValue({ error: null });
  limparMesDiarioMock.mockReset().mockResolvedValue({ error: null });
});

describe('limparMesRecebimentos — BookPlay', () => {
  it('apaga o diário do mês junto com o analítico', async () => {
    const r = await limparMesRecebimentos({
      empresaId: EMPRESA, mes: MES, escopo: ESCOPO, incluirDiario: true,
    });

    expect(r).toEqual({ error: null, erroDiario: null });
    expect(limparDadosDoMesSetorMock).toHaveBeenCalledTimes(1);
    expect(limparMesDiarioMock).toHaveBeenCalledTimes(1);
  });

  it('passa ao diário o MESMO escopo do analítico', async () => {
    // Escopos diferentes nos dois lados é a versão nova do defeito original:
    // sobra dinheiro num mês supostamente zerado, agora na outra aba.
    await limparMesRecebimentos({
      empresaId: EMPRESA, mes: MES, escopo: ESCOPO, incluirDiario: true,
    });

    expect(limparDadosDoMesSetorMock).toHaveBeenCalledWith(EMPRESA, MES, ESCOPO);
    expect(limparMesDiarioMock).toHaveBeenCalledWith(EMPRESA, MES, ESCOPO);
  });

  it('sem setor em foco, os dois lados apagam a empresa inteira', async () => {
    await limparMesRecebimentos({
      empresaId: EMPRESA, mes: MES, escopo: null, incluirDiario: true,
    });

    expect(limparDadosDoMesMock).toHaveBeenCalledWith(EMPRESA, MES);
    expect(limparDadosDoMesSetorMock).not.toHaveBeenCalled();
    expect(limparMesDiarioMock).toHaveBeenCalledWith(EMPRESA, MES, null);
  });

  it('analítico primeiro: se ele falha, o diário não é tocado', async () => {
    // A ordem é a garantia. O estado inverso — diário apagado, analítico de pé —
    // é o pior possível: o botão que reconstrói o diário é a reimportação, e ela
    // dedupe contra o analítico que sobrou.
    limparDadosDoMesSetorMock.mockResolvedValue({ error: 'RLS: permission denied' });

    const r = await limparMesRecebimentos({
      empresaId: EMPRESA, mes: MES, escopo: ESCOPO, incluirDiario: true,
    });

    expect(r).toEqual({ error: 'RLS: permission denied', erroDiario: null });
    expect(limparMesDiarioMock).not.toHaveBeenCalled();
  });

  it('falha só no diário volta como erroDiario, não como error', async () => {
    limparMesDiarioMock.mockResolvedValue({ error: 'timeout' });

    const r = await limparMesRecebimentos({
      empresaId: EMPRESA, mes: MES, escopo: ESCOPO, incluirDiario: true,
    });

    // `error: null` porque o analítico saiu de verdade; a tela avisa do resto.
    expect(r).toEqual({ error: null, erroDiario: 'timeout' });
  });
});

describe('limparMesRecebimentos — PaguePlay', () => {
  it('não toca no diário: lá ele tem relatório próprio', async () => {
    const r = await limparMesRecebimentos({
      empresaId: EMPRESA, mes: MES, escopo: ESCOPO, incluirDiario: false,
    });

    expect(r).toEqual({ error: null, erroDiario: null });
    expect(limparDadosDoMesSetorMock).toHaveBeenCalledTimes(1);
    expect(limparMesDiarioMock).not.toHaveBeenCalled();
  });
});
