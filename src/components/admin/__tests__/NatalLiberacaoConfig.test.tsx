/**
 * O card do Natal em Configurações › Geral (09/11/2026): liberar, recolher e o
 * acompanhamento por cidade. O banco é simulado (`rpcSemTipo`); a leitura da
 * liberação também (`Natal/liberacao.ts`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { rpc, liberado, liberar } = vi.hoisted(() => ({
  rpc: vi.fn(),
  liberado: { atual: false },
  liberar: vi.fn(),
}));

vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: rpc }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'e1' } }) }));
vi.mock('@/components/Natal/liberacao', () => ({
  useNatalLiberado: () => liberado.atual,
  liberarNatal: liberar,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import NatalLiberacaoConfig from '../NatalLiberacaoConfig';

const pessoa = (nome: string, cidade: string | null, extra: Record<string, unknown> = {}) => ({
  usuario_id: nome, nome, cargo: 'Operador', empresa_nome: 'BookPlay', setor_nome: `Setor ${cidade ?? '-'}`,
  cidade, video: null, assistiu_em: null, pulou_em: null, liberou_em: null, adiou_vezes: 0, ...extra,
});

const PAINEL = {
  liberacao: null,
  pessoas: [
    pessoa('Ana', 'birigui', { liberou_em: '2026-11-10T13:00:00Z', assistiu_em: '2026-11-10T12:58:00Z' }),
    pessoa('Bia', 'birigui', { liberou_em: '2026-11-10T14:00:00Z', pulou_em: '2026-11-10T13:59:00Z' }),
    pessoa('Caio', 'birigui', { adiou_vezes: 2 }),
    pessoa('Duda', 'marilia', { liberou_em: '2026-11-10T15:00:00Z', assistiu_em: '2026-11-10T14:58:00Z' }),
    pessoa('Edu', 'marilia'),
    pessoa('Fabi', null),
  ],
};

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cliente}><NatalLiberacaoConfig /></QueryClientProvider>);
}

describe('NatalLiberacaoConfig', () => {
  beforeEach(() => {
    rpc.mockReset();
    liberar.mockReset();
    liberado.atual = false;
    rpc.mockResolvedValue({ data: PAINEL, error: null });
  });

  it('o cabeçalho mostra o andamento e que só o super admin vê', async () => {
    montar();
    expect(await screen.findByText('3 de 6 já entraram no Natal · 2 ainda não abriram')).toBeTruthy();
    expect(screen.getByText('Só super admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Liberar para todos/ })).toBeTruthy();
  });

  it('aberto, separa por cidade e lista as pessoas de cada uma', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Tema de Natal/ }));
    const abas = screen.getAllByRole('tab');
    expect(abas.map(a => a.textContent)).toEqual([
      expect.stringContaining('Birigui'), expect.stringContaining('Marília'), expect.stringContaining('Sem cidade'),
    ]);
    // Birigui: Ana (vídeo inteiro), Bia (pulou), Caio (deixou para depois, 2×).
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('vídeo inteiro')).toBeTruthy();
    expect(screen.getByText('pulou')).toBeTruthy();
    expect(screen.getByText('2×')).toBeTruthy();
    expect(screen.queryByText('Duda')).toBeNull();

    fireEvent.click(abas[1]);
    expect(screen.getByText('Duda')).toBeTruthy();
    expect(screen.getByText('Edu')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull();

    fireEvent.click(abas[2]);
    expect(screen.getByText('Fabi')).toBeTruthy();
  });

  it('o filtro de situação', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Tema de Natal/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ainda não abriu' }));
    expect(screen.queryByText('Ana')).toBeNull();
    expect(screen.getByText('Ninguém com esses filtros.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deixou para depois' }));
    expect(screen.getByText('Caio')).toBeTruthy();
  });

  it('filtra quem pulou e quem assistiu, pelo filtro e pelos cartões do resumo', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Tema de Natal/ }));
    // Birigui: Ana assistiu inteiro, Bia pulou, Caio deixou para depois.
    fireEvent.click(screen.getByRole('button', { name: 'Pulou o vídeo' }));
    expect(screen.getByText('Bia')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull();
    expect(screen.queryByText('Caio')).toBeNull();

    const cartao = (rotulo: string) => screen.getByText(rotulo).closest('button') as HTMLButtonElement;
    fireEvent.click(cartao('Assistiram inteiro'));
    expect(cartao('Assistiram inteiro').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.queryByText('Bia')).toBeNull();

    fireEvent.click(cartao('Deixaram para depois'));
    expect(screen.getByText('Caio')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull();

    // Clicar de novo no mesmo cartão volta para todas.
    fireEvent.click(cartao('Deixaram para depois'));
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('Bia')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('o filtro de setor, dentro da cidade, filtra o resumo e a lista', async () => {
    rpc.mockResolvedValue({ data: { liberacao: null, pessoas: [
      pessoa('Ana', 'birigui', { setor_nome: 'Play 2', liberou_em: '2026-11-10T13:00:00Z', assistiu_em: '2026-11-10T12:58:00Z' }),
      pessoa('Bia', 'birigui', { setor_nome: 'Play 3' }),
      pessoa('Caio', 'birigui', { setor_nome: 'Play 3', adiou_vezes: 1 }),
      pessoa('Duda', 'marilia', { setor_nome: 'Receptivo' }),
    ] }, error: null });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Tema de Natal/ }));
    const setor = screen.getByRole('combobox', { name: 'Filtrar por setor' }) as HTMLSelectElement;
    // Só os setores de Birigui.
    expect([...setor.options].map(o => o.textContent)).toEqual(['Todos os setores (3)', 'Play 2 (1)', 'Play 3 (2)']);

    fireEvent.change(setor, { target: { value: 'BookPlay|Play 3' } });
    expect(screen.queryByText('Ana')).toBeNull();
    expect(screen.getByText('Bia')).toBeTruthy();
    expect(screen.getByText('Caio')).toBeTruthy();
    expect(screen.getByText('Pessoas de Play 3 · Birigui')).toBeTruthy();
    expect(screen.getByText('Deixaram para depois').nextSibling?.textContent).toBe('1');
    expect(screen.getByText('Assistiram inteiro').nextSibling?.textContent).toBe('0');

    // Trocar de cidade volta para todos os setores.
    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect((screen.getByRole('combobox', { name: 'Filtrar por setor' }) as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Duda')).toBeTruthy();
  });

  it('liberar pede confirmação e chama o banco', async () => {
    liberar.mockResolvedValue({ erro: null });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Liberar para todos/ }));
    expect(await screen.findByText('Liberar o Natal para todos?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Liberar agora' }));
    await waitFor(() => expect(liberar).toHaveBeenCalledWith(true));
  });

  it('liberado, o botão é recolher', async () => {
    liberado.atual = true;
    liberar.mockResolvedValue({ erro: null });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Recolher/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recolher' }));
    await waitFor(() => expect(liberar).toHaveBeenCalledWith(false));
  });

  it('sem a migration, avisa qual arquivo falta', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function fn_natal_abertura_painel does not exist' } });
    montar();
    fireEvent.click(await screen.findByRole('button', { name: /Tema de Natal/ }));
    expect(await screen.findByText('20261109150000_natal_liberacao_e_abertura.sql')).toBeTruthy();
  });
});
