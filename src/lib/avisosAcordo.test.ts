import { describe, it, expect } from 'vitest';
import { avisosAntesDeSalvar } from './avisosAcordo';

const base = {
  nomeCliente: 'Maria Souza',
  valores: [{ rotulo: 'Valor', valor: 250 }],
  vencimento: '2026-11-20',
  status: 'verificar_pendente',
  hoje: '2026-11-11',
};

describe('avisosAntesDeSalvar', () => {
  it('acordo comum não tem aviso', () => {
    expect(avisosAntesDeSalvar(base)).toEqual([]);
  });

  it('número no nome do cliente', () => {
    expect(avisosAntesDeSalvar({ ...base, nomeCliente: 'Maria 12' }).map(a => a.campo)).toEqual(['nome']);
  });

  it('valor acima de R$ 10.000 avisa; exatamente 10.000 não', () => {
    expect(avisosAntesDeSalvar({ ...base, valores: [{ rotulo: 'Valor', valor: 10_000.01 }] })[0].campo).toBe('valor');
    expect(avisosAntesDeSalvar({ ...base, valores: [{ rotulo: 'Valor', valor: 10_000 }] })).toEqual([]);
  });

  it('valor abaixo de R$ 10 avisa', () => {
    const [a] = avisosAntesDeSalvar({ ...base, valores: [{ rotulo: 'Entrada', valor: 9.99 }] });
    expect(a.campo).toBe('valor');
    expect(a.texto).toMatch(/^Entrada/);
  });

  it('vencimento no passado avisa, menos em acordo lançado já pago ou não pago', () => {
    expect(avisosAntesDeSalvar({ ...base, vencimento: '2026-11-10' })[0].campo).toBe('vencimento');
    expect(avisosAntesDeSalvar({ ...base, vencimento: '2026-11-10', status: 'pago' })).toEqual([]);
    expect(avisosAntesDeSalvar({ ...base, vencimento: '2026-11-10', status: 'nao_pago' })).toEqual([]);
  });

  it('vencimento a mais de 60 dias avisa; 60 não', () => {
    expect(avisosAntesDeSalvar({ ...base, vencimento: '2027-01-11' })[0].campo).toBe('vencimento');
    expect(avisosAntesDeSalvar({ ...base, vencimento: '2027-01-10' })).toEqual([]);
  });
});
