/**
 * pixAutomaticoDoAcordo.service.test.ts — o acordo recorrente entra no Pix pelas
 * mesmas regras do botão da aba.
 *
 * O que se fixa aqui é a ORDEM e o caminho de cada recusa: interruptor do setor
 * antes de tudo, o trigger decidindo a duplicidade, e o NR de outra pessoa
 * virando pedido aos líderes em vez de erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { criarAcordoPix, fetchConfigsPix, pedirAutorizacaoNr, perfilDono } = vi.hoisted(() => ({
  criarAcordoPix: vi.fn(),
  fetchConfigsPix: vi.fn(),
  pedirAutorizacaoNr: vi.fn(),
  perfilDono: vi.fn(),
}));
vi.mock('@/services/pix_automatico.service', () => ({
  criarAcordoPix, fetchConfigsPix, pedirAutorizacaoNr,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => perfilDono() }) }),
    }),
  },
}));

import {
  registrarAcordoNoPixAutomatico, registrarAcordoPagoNoPix, avisoPixDoAcordoPago,
} from './pixAutomaticoDoAcordo.service';

const BASE = {
  empresaId: 'emp-1',
  operadorId: 'op-1',
  operadorNome: 'Operador',
  setorId: 'setor-A',
  nrCliente: ' 12345 ',
  valor: 1_800,
  podeAgirSobreOutros: false,
};

beforeEach(() => {
  criarAcordoPix.mockReset().mockResolvedValue({ ok: true });
  fetchConfigsPix.mockReset().mockResolvedValue([]);
  pedirAutorizacaoNr.mockReset().mockResolvedValue({ ok: true });
  perfilDono.mockReset().mockResolvedValue({
    data: { nome: 'Dona do Acordo', email: 'd@x', setor_id: 'setor-A' }, error: null,
  });
});

describe('registrarAcordoNoPixAutomatico', () => {
  it('registra com o NR limpo, o valor do acordo e o dono de quem tabulou', async () => {
    const r = await registrarAcordoNoPixAutomatico({ ...BASE, extra: true });
    expect(r).toEqual({ tipo: 'registrado' });
    expect(criarAcordoPix).toHaveBeenCalledWith({
      empresaId: 'emp-1', operadorId: 'op-1', operadorNome: 'Operador', setorId: 'setor-A',
      nrCliente: '12345', valor: 1_800, extra: true,
    });
  });

  it('setor com registro desligado barra o operador, sem tentar gravar', async () => {
    fetchConfigsPix.mockResolvedValue([{ setor_id: 'setor-A', permite_registro_operador: false }]);
    const r = await registrarAcordoNoPixAutomatico(BASE);
    expect(r.tipo).toBe('nao_registrado');
    expect(criarAcordoPix).not.toHaveBeenCalled();
  });

  it('quem age sobre outros passa pelo interruptor, como na aba', async () => {
    fetchConfigsPix.mockResolvedValue([{ setor_id: 'setor-A', permite_registro_operador: false }]);
    const r = await registrarAcordoNoPixAutomatico({ ...BASE, podeAgirSobreOutros: true });
    expect(r).toEqual({ tipo: 'registrado' });
    expect(fetchConfigsPix).not.toHaveBeenCalled();
  });

  it('NR já desta pessoa não é erro nem pedido: o registro já existe', async () => {
    criarAcordoPix.mockResolvedValue({ ok: false, nrMesmoOperador: true, error: 'x' });
    const r = await registrarAcordoNoPixAutomatico(BASE);
    expect(r).toEqual({ tipo: 'ja_registrado' });
    expect(pedirAutorizacaoNr).not.toHaveBeenCalled();
  });

  it('NR de outra pessoa vira pedido de autorização aos líderes', async () => {
    criarAcordoPix.mockResolvedValue({ ok: false, nrDuplicado: true, error: 'dup' });
    const r = await registrarAcordoNoPixAutomatico({ ...BASE, extra: true });
    expect(r).toEqual({ tipo: 'pedido_enviado' });
    expect(pedirAutorizacaoNr).toHaveBeenCalledWith({
      operadorId: 'op-1', nrCliente: '12345', valor: 1_800, extra: true,
    });
  });

  it('pedido recusado devolve o motivo para a tela', async () => {
    criarAcordoPix.mockResolvedValue({ ok: false, nrDuplicado: true, error: 'dup' });
    pedirAutorizacaoNr.mockResolvedValue({ ok: false, error: 'Já existe um pedido aberto.' });
    const r = await registrarAcordoNoPixAutomatico(BASE);
    expect(r).toEqual({ tipo: 'nao_registrado', motivo: 'Já existe um pedido aberto.' });
  });

  it('valor inválido não chega ao banco', async () => {
    const r = await registrarAcordoNoPixAutomatico({ ...BASE, valor: 0 });
    expect(r.tipo).toBe('nao_registrado');
    expect(criarAcordoPix).not.toHaveBeenCalled();
  });
});

/*
 * O acordo que vira pago DEPOIS de gravado (22/09/2026).
 *
 * Antes só o cadastro registrava: o acordo lançado como "Não pago" e marcado
 * pago depois, e os anteriores a 14/09, nunca entravam no Pix.
 */
describe('registrarAcordoPagoNoPix', () => {
  const PAGO = {
    tipo: 'pix_automatico', status: 'pago', nr_cliente: ' 777 ', valor: 1_200,
    vencimento: '2026-09-22', operador_id: 'op-1', empresa_id: 'emp-1',
    setor_id: 'setor-velho', tipo_vinculo: null,
  };
  const CTX = { empresaId: 'emp-tela', quemAgeId: 'op-1', podeAgirSobreOutros: false, hoje: '2026-09-22' };

  it('recorrente pago registra no nome e no setor ATUAL do dono, no mês corrente', async () => {
    const r = await registrarAcordoPagoNoPix({ acordo: PAGO, ...CTX });
    expect(r).toEqual({ tipo: 'registrado' });
    expect(criarAcordoPix).toHaveBeenCalledWith({
      empresaId: 'emp-1', operadorId: 'op-1', operadorNome: 'Dona do Acordo', setorId: 'setor-A',
      nrCliente: '777', valor: 1_200, extra: false,
    });
  });

  it('forma não recorrente ou "Não pago": nada a fazer', async () => {
    expect(await registrarAcordoPagoNoPix({ acordo: { ...PAGO, tipo: 'boleto' }, ...CTX })).toBeNull();
    expect(await registrarAcordoPagoNoPix({ acordo: { ...PAGO, status: 'nao_pago' }, ...CTX })).toBeNull();
    expect(criarAcordoPix).not.toHaveBeenCalled();
  });

  it('Cartão Recorrente segue a mesma regra', async () => {
    const r = await registrarAcordoPagoNoPix({ acordo: { ...PAGO, tipo: 'cartao_recorrente' }, ...CTX });
    expect(r).toEqual({ tipo: 'registrado' });
  });

  it('acordo de outro mês nasce no mês do vencimento, como a aba faz', async () => {
    await registrarAcordoPagoNoPix({ acordo: { ...PAGO, vencimento: '2026-08-28' }, ...CTX });
    expect(criarAcordoPix).toHaveBeenCalledWith(expect.objectContaining({ dia: '2026-08-28' }));
  });

  it('líder do Pix marcando pago registra no nome do operador', async () => {
    const r = await registrarAcordoPagoNoPix({
      acordo: PAGO, ...CTX, quemAgeId: 'lider-1', podeAgirSobreOutros: true,
    });
    expect(r).toEqual({ tipo: 'registrado' });
    expect(criarAcordoPix).toHaveBeenCalledWith(expect.objectContaining({ operadorId: 'op-1' }));
  });

  it('quem não é o dono nem age sobre outros no Pix não tenta gravar', async () => {
    const r = await registrarAcordoPagoNoPix({ acordo: PAGO, ...CTX, quemAgeId: 'outro' });
    expect(r?.tipo).toBe('nao_registrado');
    expect(criarAcordoPix).not.toHaveBeenCalled();
  });

  it('linha sem empresa_id usa a empresa da tela', async () => {
    await registrarAcordoPagoNoPix({ acordo: { ...PAGO, empresa_id: undefined }, ...CTX });
    expect(criarAcordoPix).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'emp-tela' }));
  });

  it('Extra vai com a etiqueta', async () => {
    await registrarAcordoPagoNoPix({ acordo: { ...PAGO, tipo_vinculo: 'extra' }, ...CTX });
    expect(criarAcordoPix).toHaveBeenCalledWith(expect.objectContaining({ extra: true }));
  });
});

describe('avisoPixDoAcordoPago', () => {
  it('fica quieto quando não há nada a dizer', () => {
    expect(avisoPixDoAcordoPago(null, '1')).toBeNull();
    expect(avisoPixDoAcordoPago({ tipo: 'ja_registrado' }, '1')).toBeNull();
  });

  it('não registrado vira aviso com o motivo', () => {
    const a = avisoPixDoAcordoPago({ tipo: 'nao_registrado', motivo: 'Setor desligado.' }, '9');
    expect(a?.tipo).toBe('aviso');
    expect(a?.texto).toContain('Setor desligado.');
    expect(a?.texto).toContain('NR 9');
  });

  it('registrado e pedido enviado são sucesso', () => {
    expect(avisoPixDoAcordoPago({ tipo: 'registrado' }, '9')?.tipo).toBe('sucesso');
    expect(avisoPixDoAcordoPago({ tipo: 'pedido_enviado' }, '9')?.tipo).toBe('sucesso');
  });
});
