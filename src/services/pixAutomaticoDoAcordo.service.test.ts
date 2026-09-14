/**
 * pixAutomaticoDoAcordo.service.test.ts — o acordo recorrente entra no Pix pelas
 * mesmas regras do botão da aba.
 *
 * O que se fixa aqui é a ORDEM e o caminho de cada recusa: interruptor do setor
 * antes de tudo, o trigger decidindo a duplicidade, e o NR de outra pessoa
 * virando pedido aos líderes em vez de erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { criarAcordoPix, fetchConfigsPix, pedirAutorizacaoNr } = vi.hoisted(() => ({
  criarAcordoPix: vi.fn(),
  fetchConfigsPix: vi.fn(),
  pedirAutorizacaoNr: vi.fn(),
}));
vi.mock('@/services/pix_automatico.service', () => ({
  criarAcordoPix, fetchConfigsPix, pedirAutorizacaoNr,
}));

import { registrarAcordoNoPixAutomatico } from './pixAutomaticoDoAcordo.service';

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
