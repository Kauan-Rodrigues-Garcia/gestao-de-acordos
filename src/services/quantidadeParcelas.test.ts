import { describe, it, expect } from 'vitest';
import { planejarQuantidade, descreverRemocao, type LinhaDoGrupo } from './quantidadeParcelas';

function linha(numero: number, extra: Partial<LinhaDoGrupo> = {}): LinhaDoGrupo {
  return {
    id:             `p${numero}`,
    numero_parcela: numero,
    vencimento:     `2026-0${Math.min(9, numero)}-10`,
    valor:          400,
    status:         'verificar_pendente',
    ...extra,
  };
}

const base = {
  valorNovasParcelas: 400,
  tipo:               'boleto',
  isPaguePlay:        false,
};

describe('planejarQuantidade — nada a fazer', () => {
  it('mesma quantidade não mexe em nada', () => {
    const p = planejarQuantidade({
      ...base, linhas: [linha(1), linha(2)], quantidadeAtual: 2, novaQuantidade: 2,
    });
    expect(p.acao).toBe('nada');
  });
});

describe('planejarQuantidade — limites', () => {
  it('recusa zero', () => {
    const p = planejarQuantidade({ ...base, linhas: [linha(1)], quantidadeAtual: 1, novaQuantidade: 0 });
    expect(p).toEqual({ acao: 'bloqueado', motivo: expect.stringContaining('pelo menos 1') });
  });

  it('recusa acima de 99', () => {
    const p = planejarQuantidade({ ...base, linhas: [linha(1)], quantidadeAtual: 1, novaQuantidade: 100 });
    expect(p.acao).toBe('bloqueado');
  });

  it('recusa quantidade não numérica', () => {
    const p = planejarQuantidade({ ...base, linhas: [linha(1)], quantidadeAtual: 1, novaQuantidade: NaN });
    expect(p.acao).toBe('bloqueado');
  });
});

describe('planejarQuantidade — aumentar', () => {
  it('cria as parcelas que faltam, continuando a cadência do acordo', () => {
    const p = planejarQuantidade({
      ...base,
      linhas: [linha(1, { vencimento: '2026-08-20' }), linha(2, { vencimento: '2026-09-20' })],
      quantidadeAtual: 2,
      novaQuantidade:  4,
    });
    if (p.acao !== 'criar') throw new Error(`esperava criar, veio ${p.acao}`);
    expect(p.novoTotal).toBe(4);
    expect(p.inputs.map(i => i.vencimento)).toEqual(['2026-10-20', '2026-11-20']);
    expect(p.inputs.every(i => i.valor === 400)).toBe(true);
    expect(p.inputs.every(i => i.status === 'verificar_pendente')).toBe(true);
  });

  it('usa o valor das DEMAIS num acordo com entrada, nunca o da entrada', () => {
    const p = planejarQuantidade({
      ...base,
      valorNovasParcelas: 150,   // demais; a entrada (parcela 1) vale 1000
      linhas: [linha(1, { valor: 1000, vencimento: '2026-08-10' }), linha(2, { valor: 150, vencimento: '2026-09-10' })],
      quantidadeAtual: 2,
      novaQuantidade:  3,
    });
    if (p.acao !== 'criar') throw new Error(`esperava criar, veio ${p.acao}`);
    expect(p.inputs).toHaveLength(1);
    expect(p.inputs[0].valor).toBe(150);
  });

  it('PaguePlay continua caindo no fim do mês', () => {
    const p = planejarQuantidade({
      ...base,
      isPaguePlay: true,
      linhas: [linha(1, { vencimento: '2026-08-31' })],
      quantidadeAtual: 1,
      novaQuantidade:  3,
    });
    if (p.acao !== 'criar') throw new Error(`esperava criar, veio ${p.acao}`);
    expect(p.inputs.map(i => i.vencimento)).toEqual(['2026-09-30', '2026-10-31']);
  });

  it('só o contador quando as linhas já existem além do total declarado', () => {
    // Grupo com 5 linhas mas `parcelas` dizendo 3 — o número novo (5) já é
    // verdade no banco, ninguém precisa inserir nada.
    const p = planejarQuantidade({
      ...base,
      linhas: [linha(1), linha(2), linha(3), linha(4), linha(5)],
      quantidadeAtual: 3,
      novaQuantidade:  5,
    });
    expect(p).toEqual({ acao: 'contador', novoTotal: 5 });
  });

  it('bloqueia quando não há valor para as novas parcelas', () => {
    const p = planejarQuantidade({
      ...base, valorNovasParcelas: 0, linhas: [linha(1)], quantidadeAtual: 1, novaQuantidade: 2,
    });
    expect(p.acao).toBe('bloqueado');
  });
});

describe('planejarQuantidade — reduzir', () => {
  it('remove as parcelas de número mais alto', () => {
    const p = planejarQuantidade({
      ...base,
      linhas: [linha(1), linha(2), linha(3), linha(4)],
      quantidadeAtual: 4,
      novaQuantidade:  2,
    });
    if (p.acao !== 'remover') throw new Error(`esperava remover, veio ${p.acao}`);
    expect(p.linhas.map(l => l.numero_parcela)).toEqual([3, 4]);
    expect(p.novoTotal).toBe(2);
  });

  it('BLOQUEIA quando uma das parcelas apagadas está paga', () => {
    const p = planejarQuantidade({
      ...base,
      linhas: [linha(1), linha(2), linha(3, { status: 'pago' }), linha(4)],
      quantidadeAtual: 4,
      novaQuantidade:  2,
    });
    if (p.acao !== 'bloqueado') throw new Error(`esperava bloqueado, veio ${p.acao}`);
    expect(p.motivo).toContain('3');
    expect(p.motivo).toContain('paga');
  });

  it('reduzir sem linha sobrando mexe só no contador', () => {
    // 2 linhas reais e `parcelas` = 6: as 4 restantes eram virtuais.
    const p = planejarQuantidade({
      ...base, linhas: [linha(1), linha(2)], quantidadeAtual: 6, novaQuantidade: 2,
    });
    expect(p).toEqual({ acao: 'contador', novoTotal: 2 });
  });

  it('linha sem numero_parcela conta como parcela 1 e não é apagada', () => {
    const p = planejarQuantidade({
      ...base,
      linhas: [linha(1, { numero_parcela: null }), linha(2), linha(3)],
      quantidadeAtual: 3,
      novaQuantidade:  1,
    });
    if (p.acao !== 'remover') throw new Error(`esperava remover, veio ${p.acao}`);
    expect(p.linhas.map(l => l.id)).toEqual(['p2', 'p3']);
  });
});

describe('descreverRemocao', () => {
  it('singular', () => {
    expect(descreverRemocao({ acao: 'remover', novoTotal: 2, linhas: [linha(3)] }))
      .toBe('A parcela 3 será apagada.');
  });

  it('plural em ordem', () => {
    expect(descreverRemocao({ acao: 'remover', novoTotal: 1, linhas: [linha(3), linha(2)] }))
      .toBe('As parcelas 2, 3 serão apagadas.');
  });
});
