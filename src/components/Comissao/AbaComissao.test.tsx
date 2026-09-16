/**
 * AbaComissao.test.tsx — os estados da aba Comissão na tela de Metas.
 *
 * As contas têm testes próprios. Aqui ficam as regras do pedido que moram na
 * tela: mês novo não copia nada sozinho, importar depende de haver mês anterior
 * e respeita a trava, e a confirmação da meta do setor só libera com o
 * acumulado na meta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ConfigComissao } from '@/services/comissao/comissao';

const { estado, servico } = vi.hoisted(() => ({
  estado: {
    atual:     { configs: [] as unknown[], bonus: [] as unknown[], dbAtiva: true, carregado: true } as { configs: unknown[]; bonus?: unknown[]; dbAtiva: boolean; carregado: boolean },
    anterior:  { configs: [] as unknown[], bonus: [] as unknown[], dbAtiva: true, carregado: true } as { configs: unknown[]; bonus?: unknown[]; dbAtiva: boolean; carregado: boolean },
    acumulado: { acumulado: null as null | { bruto: number; ho: number; ajuste: number }, resumos: [] as unknown[], carregado: true },
  },
  servico: {
    salvarConfig:        vi.fn(async () => ({ ok: true, dados: 'cfg' })),
    importarMesAnterior: vi.fn(async () => ({ ok: true, dados: 1 })),
    excluirExcecao:      vi.fn(async () => ({ ok: true })),
    confirmarMetaSetor:  vi.fn(async () => ({ ok: true })),
    salvarBonus:         vi.fn(async () => ({ ok: true, dados: 'bonus' })),
    excluirBonus:        vi.fn(async () => ({ ok: true })),
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

vi.mock('@/hooks/useAnaliticoDashboard', () => ({
  useAnaliticoDashboard: () => ({ linhas: [], carregado: true, dbAtiva: true, refetch: vi.fn() }),
}));

vi.mock('@/services/metas/recebimentoIndireto.service', () => ({
  buscarRecebimentoIndireto: vi.fn(async () => ({})),
}));

import { AbaComissao } from './AbaComissao';

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg-set', empresaId: 'e1', setorId: 's1', equipeId: null, grupoUsuarios: false, usuarioIds: [],
    ano: 2026, mes: 9,
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
  operadores: [
    { id: 'op1', nome: 'Ana Paula', setorOrigemId: 's1', equipeOrigemId: 'eq-x', equipeAquiId: 'eq-x', clonadoDe: null },
    { id: 'op2', nome: 'Bruno Lima', setorOrigemId: 's1', equipeOrigemId: 'eq-x', equipeAquiId: 'eq-x', clonadoDe: null },
    // Clone de outro setor: aparece na lista de comissão, mas não se configura aqui.
    { id: 'op9', nome: 'Zeca Clone', setorOrigemId: 's2', equipeOrigemId: 'eq-z', equipeAquiId: 'eq-x', clonadoDe: 'Play 5' },
  ],
  metas: [
    { tipo: 'operador', referencia_id: 'op1', meta_valor: 34_000, metas_extras: [37_000] },
    { tipo: 'setor', referencia_id: 's1', meta_valor: 800_000 },
  ],
};

describe('AbaComissao', () => {
  beforeEach(() => {
    estado.atual = { configs: [], bonus: [], dbAtiva: true, carregado: true };
    estado.anterior = { configs: [], bonus: [], dbAtiva: true, carregado: true };
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

  it('exceção por usuário: escolhe várias pessoas do setor e cria uma exceção só, com o % do padrão', async () => {
    estado.atual = { configs: [config()], bonus: [], dbAtiva: true, carregado: true };
    render(<AbaComissao {...PROPS} />);

    const campo = screen.getByRole('combobox', { name: 'Pessoas para a nova exceção' });
    fireEvent.focus(campo);
    const lista = screen.getByRole('listbox');
    // Só gente do setor: o clone não entra.
    expect(within(lista).queryByText('Zeca Clone')).toBeNull();
    fireEvent.click(within(lista).getByRole('checkbox', { name: /Marcar todas/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Criar exceção para 2 pessoas' }));
    await waitFor(() => expect(servico.salvarConfig).toHaveBeenCalledTimes(1));
    expect(servico.salvarConfig.mock.calls[0][0]).toMatchObject({
      grupoUsuarios: true,
      equipeId: null,
      usuarios: ['op1', 'op2'],
      regraSetor: 'nenhuma',
      faixas: [{ ordem: 1, pct: 1.75 }, { ordem: 2, pct: 2.11 }],
    });
  });

  it('quem já está numa exceção por usuário não pode entrar em outra', () => {
    estado.atual = {
      configs: [config(), config({ id: 'cfg-u', grupoUsuarios: true, usuarioIds: ['op1'] })],
      bonus: [], dbAtiva: true, carregado: true,
    };
    render(<AbaComissao {...PROPS} />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Pessoas para a nova exceção' }));
    const ana = within(screen.getByRole('listbox')).getByRole('option', { name: /Ana Paula/ });
    expect(ana).toHaveAttribute('aria-disabled', 'true');
    expect(within(ana).getByText('já tem exceção')).toBeInTheDocument();
  });

  it('sem padrão do setor não há exceção por usuário; o bônus existe mesmo assim', () => {
    render(<AbaComissao {...PROPS} />);
    expect(screen.queryByText('Exceções por usuário')).toBeNull();
    expect(screen.getByText('Bônus por usuário')).toBeInTheDocument();
  });

  it('bônus: escolhe as pessoas e abre a criação com as três formas', () => {
    render(<AbaComissao {...PROPS} />);
    expect(screen.getByRole('button', { name: 'Criar bônus' })).toBeDisabled();

    fireEvent.focus(screen.getByRole('combobox', { name: 'Pessoas para o novo bônus' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('checkbox', { name: /Marcar todas/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar bônus para 2 pessoas' }));

    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Meta existente')).toBeInTheDocument();
    expect(within(dialogo).getByText('Valor realizado')).toBeInTheDocument();
    expect(within(dialogo).getByText('Meta especial')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Criar para 2 pessoas' })).toBeDisabled();
  });

  it('bônus gravado aparece com a condição e as pessoas', () => {
    estado.atual = {
      configs: [], dbAtiva: true, carregado: true,
      bonus: [{
        id: 'b1', empresaId: 'e1', setorId: 's1', ano: 2026, mes: 9, tipo: 'meta', metaOrdem: 4,
        valorAlvo: null, periodoInicio: null, periodoFim: null, valorBonus: 200, descricao: null,
        usuarioIds: ['op1', 'op2'],
      }],
    };
    render(<AbaComissao {...PROPS} />);
    expect(screen.getByText(/R\$\s?200,00 ao bater a 4ª Meta/)).toBeInTheDocument();
    expect(screen.getByText('Ana Paula, Bruno Lima')).toBeInTheDocument();
  });

  it('sem regra do setor, não há confirmação a fazer', () => {
    estado.atual = { configs: [config()], dbAtiva: true, carregado: true };
    render(<AbaComissao {...PROPS} />);
    expect(screen.queryByRole('button', { name: /Confirmar meta atingida/ })).toBeNull();
  });
});
