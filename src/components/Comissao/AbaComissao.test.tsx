/**
 * AbaComissao.test.tsx — os estados da aba Comissão na tela de Metas.
 *
 * As contas têm testes próprios. Aqui ficam as regras do pedido que moram na
 * tela: mês novo não copia nada sozinho, importar depende de haver mês anterior
 * e respeita a trava, e a confirmação da meta do setor só libera com o
 * acumulado na meta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ConfigComissao } from '@/services/comissao/comissao';

const { estado, servico } = vi.hoisted(() => ({
  estado: {
    atual:     { configs: [] as unknown[], dbAtiva: true, carregado: true },
    anterior:  { configs: [] as unknown[], dbAtiva: true, carregado: true },
    acumulado: { acumulado: null as null | { bruto: number; ho: number; ajuste: number }, resumos: [] as unknown[], carregado: true },
  },
  servico: {
    salvarConfig:        vi.fn(async () => ({ ok: true, dados: 'cfg' })),
    importarMesAnterior: vi.fn(async () => ({ ok: true, dados: 1 })),
    excluirExcecao:      vi.fn(async () => ({ ok: true })),
    confirmarMetaSetor:  vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao: () => true }),
}));

vi.mock('@/services/comissao/useConfigsComissao', () => ({
  useConfigsComissao: ({ mes }: { mes: number }) => ({
    ...(mes === 9 ? estado.atual : estado.anterior),
    recarregar: vi.fn(),
  }),
}));

vi.mock('@/services/comissao/useAcumuladoDoSetorNoMes', () => ({
  useAcumuladoDoSetorNoMes: () => estado.acumulado,
}));

vi.mock('@/services/comissao/comissao.service', () => ({
  mesAnterior: (ano: number, mes: number) => (mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }),
  ...servico,
}));

vi.mock('@/services/metas/recebimentoIndireto.service', () => ({
  buscarRecebimentoIndireto: vi.fn(async () => ({})),
}));

import { AbaComissao } from './AbaComissao';

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg-set', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: 2 },
      { ordem: 2, pct: 2.11, pctEspecial: 2.24 },
    ],
    ...over,
  };
}

const PROPS = {
  empresaId: 'e1',
  setorId: 's1',
  setorNome: 'Play 4',
  ano: 2026,
  mes: 9,
  isPaguePlay: false,
  metaTravada: false,
  equipes: [{ id: 'eq-x', nome: 'Equipe X' }],
  operadores: [{
    id: 'op1', nome: 'Ana Paula', setorOrigemId: 's1', equipeOrigemId: 'eq-x',
    equipeAquiId: 'eq-x', clonadoDe: null,
  }],
  metas: [
    { tipo: 'operador', referencia_id: 'op1', meta_valor: 34_000, metas_extras: [37_000] },
    { tipo: 'setor', referencia_id: 's1', meta_valor: 800_000 },
  ],
};

describe('AbaComissao', () => {
  beforeEach(() => {
    estado.atual = { configs: [], dbAtiva: true, carregado: true };
    estado.anterior = { configs: [], dbAtiva: true, carregado: true };
    estado.acumulado = { acumulado: null, resumos: [], carregado: true };
    Object.values(servico).forEach(f => f.mockClear());
  });

  it('banco sem a migration: avisa em vez de mostrar o formulário', () => {
    estado.atual = { configs: [], dbAtiva: false, carregado: true };
    render(<AbaComissao {...PROPS} />);
    expect(screen.getByText(/A comissão ainda não está disponível/)).toBeInTheDocument();
    expect(screen.queryByText(/Padrão do setor/)).toBeNull();
  });

  it('mês sem configuração convida a preencher ou importar, e não copia nada sozinho', () => {
    render(<AbaComissao {...PROPS} />);
    expect(screen.getByText(/ainda não foi configurada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importar configuração de agosto/ })).toBeDisabled();
    expect(servico.salvarConfig).not.toHaveBeenCalled();
    expect(servico.importarMesAnterior).not.toHaveBeenCalled();
  });

  it('com agosto configurado, a importação fica disponível', () => {
    estado.anterior = { configs: [config({ id: 'cfg-ago', mes: 8 })], dbAtiva: true, carregado: true };
    render(<AbaComissao {...PROPS} />);
    expect(screen.getByRole('button', { name: /Importar configuração de agosto/ })).toBeEnabled();
  });

  it('meta do setor validada bloqueia a importação e avisa por quê', () => {
    estado.anterior = { configs: [config({ id: 'cfg-ago', mes: 8 })], dbAtiva: true, carregado: true };
    render(<AbaComissao {...PROPS} metaTravada />);
    expect(screen.getByRole('button', { name: /Importar configuração de agosto/ })).toBeDisabled();
    expect(screen.getByText(/validada/)).toBeInTheDocument();
  });

  it('confirmar a meta do setor só libera com o acumulado na meta', () => {
    estado.atual = { configs: [config({ regraSetor: 'percentual_especial' })], dbAtiva: true, carregado: true };
    estado.acumulado = { acumulado: { bruto: 700_000, ho: 0, ajuste: 0 }, resumos: [], carregado: true };
    const { rerender } = render(<AbaComissao {...PROPS} />);
    expect(screen.getByRole('button', { name: /Confirmar meta atingida/ })).toBeDisabled();

    estado.acumulado = { acumulado: { bruto: 812_400, ho: 0, ajuste: 0 }, resumos: [], carregado: true };
    rerender(<AbaComissao {...PROPS} />);
    expect(screen.getByRole('button', { name: /Confirmar meta atingida/ })).toBeEnabled();
  });

  it('sem regra do setor, não há confirmação a fazer', () => {
    estado.atual = { configs: [config()], dbAtiva: true, carregado: true };
    render(<AbaComissao {...PROPS} />);
    expect(screen.queryByRole('button', { name: /Confirmar meta atingida/ })).toBeNull();
  });
});
