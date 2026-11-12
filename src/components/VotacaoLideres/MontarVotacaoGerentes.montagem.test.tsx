/**
 * A aba «Gerentes» da Votação da Liderança MONTA e libera certo? (12/11/2026)
 *
 * Pedido: liberar para a operação votar nos gerentes, editável por setor e
 * equipe. Confere: os gerentes vêm marcados; nenhum setor vem marcado; marcar
 * o setor traz as equipes; tirar uma equipe tira as pessoas dela; e «Liberar»
 * manda ao banco quem concorre, quem vota e as regras.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { EquipeDaVotacao, GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag: string) => ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...p }: Record<string, unknown> & { children?: React.ReactNode }) => {
      const Tag = tag as unknown as React.ElementType;
      return <Tag {...p}>{children}</Tag>;
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', perfil: 'super_admin' } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const pessoa = (id: string, nome: string, perfil: string, setorId: string | null, equipeId: string | null = null): Participante => ({
  id, nome, foto: null, perfil, setor: setorId === 's1' ? 'Play 1' : setorId === 's2' ? 'Play 2' : 'Sem setor', setorId, equipeId,
  grupo: 'marca:bookplay', produto: 'cobranca', empresa: 'BookPlay',
});
const PESSOAS: Participante[] = [
  pessoa('g1', 'Gabi Souza', 'gerencia', 's1'),
  pessoa('g2', 'Gustavo Lima', 'gerencia', null),
  pessoa('o1', 'Olga Prado', 'operador', 's1', 'e1'),
  pessoa('o2', 'Oto Reis', 'operador', 's1', 'e2'),
  pessoa('o3', 'Ozias Melo', 'operador', 's2', 'e3'),
];
const GRUPOS: GrupoDaVotacao[] = [{ chave: 'marca:bookplay', rotulo: 'BookPlay · Birigui', produto: 'cobranca', setores: [
  { id: 's1', nome: 'Play 1', grupo: 'marca:bookplay', produto: 'cobranca' },
  { id: 's2', nome: 'Play 2', grupo: 'marca:bookplay', produto: 'cobranca' },
] }];
const EQUIPES: EquipeDaVotacao[] = [
  { id: 'e1', nome: 'Equipe Ana', setorId: 's1' }, { id: 'e2', nome: 'Equipe Beto', setorId: 's1' }, { id: 'e3', nome: 'Equipe Caio', setorId: 's2' },
];

vi.mock('@/components/VotacaoLideres/participantes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/VotacaoLideres/participantes')>()),
  lerParticipantes: () => Promise.resolve({ pessoas: PESSOAS, grupos: GRUPOS, equipes: EQUIPES }),
}));
const banco = vi.hoisted(() => ({ listar: vi.fn(), liberar: vi.fn() }));
vi.mock('@/components/VotacaoLideres/banco', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/VotacaoLideres/banco')>()),
  listarVotacoes: banco.listar,
  liberarVotacao: banco.liberar,
}));

class RO { observe() {} disconnect() {} unobserve() {} }
Object.defineProperty(globalThis, 'ResizeObserver', { value: RO, configurable: true });

const { default: VotacaoLideresConfig } = await import('@/components/admin/VotacaoLideresConfig');

async function abrirGerentes() {
  render(<VotacaoLideresConfig />);
  fireEvent.click(await screen.findByRole('radio', { name: /Gerentes · a operação vota/ }));
}

describe('Votação dos Gerentes (montagem)', () => {
  beforeEach(() => {
    localStorage.clear();
    banco.listar.mockReset().mockResolvedValue([]);
    banco.liberar.mockReset().mockResolvedValue('nova');
  });

  it('gerentes marcados, nenhum setor; liberar travado sem quem vota', async () => {
    await abrirGerentes();
    expect(screen.getByText(/2 na votação/)).toBeTruthy();
    expect(screen.getByText(/3\. Quem vota/).textContent).toContain('0 pessoas');
    expect((screen.getByRole('button', { name: /Liberar para a operação/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('setor traz as equipes; tirar uma equipe tira quem está nela; libera com tudo', async () => {
    await abrirGerentes();
    const setores = screen.getByRole('group', { name: 'Setores de BookPlay · Birigui' });
    fireEvent.click(within(setores).getByRole('button', { name: /Play 1/ }));
    expect(screen.getByText(/3\. Quem vota/).textContent).toContain('2 pessoas');
    fireEvent.click(screen.getByRole('button', { name: /Equipe Beto/ }));
    expect(screen.getByText(/3\. Quem vota/).textContent).toContain('1 pessoa');

    const liberar = screen.getByRole('button', { name: /Liberar para a operação/ }) as HTMLButtonElement;
    await waitFor(() => expect(liberar.disabled).toBe(false));
    fireEvent.click(liberar);
    fireEvent.click(await screen.findByRole('button', { name: /Liberar agora/ }));
    await waitFor(() => expect(banco.liberar).toHaveBeenCalledTimes(1));
    expect(banco.liberar.mock.calls[0][0]).toMatchObject({
      tipo: 'gerentes', produto: 'cobranca', participantes: ['g1', 'g2'], eleitores: ['o1'],
      setorIds: ['s1'], equipeIds: ['e1'], umPorCandidato: false, umTitulo: false,
    });
  });
});
