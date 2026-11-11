/**
 * A votação VALENDO (09/11/2026), com o banco simulado:
 *   - o painel de Configurações: aberta → Encerrar; encerrada → apuração;
 *   - a apuração: empate decidido pelo banco, «Liberar» só depois;
 *   - o card «Abrir a apuração» só para o cargo diretoria;
 *   - liberar: se abrir falha, o rascunho criado é cancelado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApuracaoDaVotacao, VotacaoNaLista } from './banco';

vi.mock('framer-motion', () => {
  const limpar = (p: Record<string, unknown>) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout'].includes(k)) r[k] = v;
    return r;
  };
  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => ({ children, ...p }: { children?: React.ReactNode }) => {
        const Tag = tag as unknown as React.ElementType;
        return <Tag {...limpar(p)}>{children}</Tag>;
      },
    }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const auth = vi.hoisted(() => ({ perfil: { id: 'dir', perfil: 'diretoria' } as { id: string; perfil: string } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: auth.perfil }) }));

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

const banco = vi.hoisted(() => ({
  listar: vi.fn(), apuracao: vi.fn(), encerrar: vi.fn(), cancelar: vi.fn(), desempatar: vi.fn(), liberar: vi.fn(),
  minhas: vi.fn(), resultados: vi.fn(),
}));
vi.mock('./banco', async importOriginal => ({
  ...(await importOriginal<typeof import('./banco')>()),
  listarVotacoes: banco.listar,
  lerApuracao: banco.apuracao,
  encerrarVotacao: banco.encerrar,
  cancelarVotacao: banco.cancelar,
  desempatar: banco.desempatar,
  liberarResultado: banco.liberar,
  lerMinhasVotacoes: banco.minhas,
  lerMeusResultados: banco.resultados,
}));

const item = (estado: VotacaoNaLista['estado'], extra: Partial<VotacaoNaLista> = {}): VotacaoNaLista => ({
  id: `v-${estado}`, titulo: `Votação ${estado}`, produto: 'cobranca', estado, perguntas: 15, participantes: 4, votaram: 2,
  criada_em: '2026-11-09T12:00:00Z', aberta_em: '2026-11-09T12:00:00Z', encerrada_em: null, liberada_em: null, cancelada_em: null,
  ...extra,
});

const PERGUNTAS = [
  { id: 'q1', emoji: '⭐', texto: 'Quem é o mais comunicativo?' },
  { id: 'q2', emoji: '⭐', texto: 'Quem é o mais paciente?' },
];
const PESSOAS = ['Ana', 'Bruno', 'Carla', 'Diego'].map((nome, i) => ({ id: 'abcd'[i], nome, foto: null, perfil: 'lider', setor: 'Play 1' }));
/** q1 empatada entre Ana e Bruno (2 a 2); q2 com vencedora clara (Carla). */
const apuracao = (desempates: Array<{ pergunta_id: string; escolhido_id: string }> = []): ApuracaoDaVotacao => ({
  votacao: { id: 'v-encerrada', titulo: 'Votação encerrada', produto: 'cobranca', estado: 'encerrada', aberta_em: null, liberada_em: null },
  perguntas: PERGUNTAS,
  participantes: PESSOAS,
  contagem: [
    { pergunta_id: 'q1', candidato_id: 'a', votos: 2 }, { pergunta_id: 'q1', candidato_id: 'b', votos: 2 },
    { pergunta_id: 'q2', candidato_id: 'c', votos: 3 }, { pergunta_id: 'q2', candidato_id: 'd', votos: 1 },
  ],
  desempates,
  envios: [{ eleitor_id: 'a', nome: 'Ana', enviado_em: '2026-11-09T12:10:00Z', respondidas: 2 }],
});

const { PainelVotacoes } = await import('./PainelVotacoes');
const { AvisoVotacao } = await import('./AvisoVotacao');
const { liberarParaOsLideres } = await import('./banco');
const { VisaoDiretoria } = await import('./VisaoDiretoria');
const { apurar, cedulaComTodos } = await import('./cedula');

beforeEach(() => {
  localStorage.clear();
  Object.values(banco).forEach(f => f.mockReset());
  rpc.mockReset();
  banco.minhas.mockResolvedValue([]);
  banco.resultados.mockResolvedValue([]);
  auth.perfil = { id: 'dir', perfil: 'diretoria' };
  window.confirm = vi.fn(() => true);
});

describe('PainelVotacoes', () => {
  it('aberta: mostra quem votou e quem falta, e encerra com confirmação', async () => {
    banco.listar.mockResolvedValue([item('aberta')]);
    banco.apuracao.mockResolvedValue({ ...apuracao(), contagem: null, desempates: null });
    banco.encerrar.mockResolvedValue(undefined);
    render(<PainelVotacoes versao={0} />);
    expect(await screen.findByText('Votação aberta')).toBeTruthy();
    expect(screen.getByText('2 de 4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Quem já votou/ }));
    expect(await screen.findByText('Faltam (3)')).toBeTruthy();
    expect(screen.getByText('Bruno, Carla, Diego')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Encerrar votação/ }));
    await waitFor(() => expect(banco.encerrar).toHaveBeenCalledWith('v-aberta'));
    expect(banco.listar).toHaveBeenCalledTimes(2);
  });

  it('encerrada: a apuração grava o desempate e só então libera', async () => {
    banco.listar.mockResolvedValue([item('encerrada')]);
    banco.apuracao.mockResolvedValue(apuracao());
    banco.desempatar.mockResolvedValue(undefined);
    banco.liberar.mockResolvedValue(undefined);
    render(<PainelVotacoes versao={0} />);
    fireEvent.click(await screen.findByRole('button', { name: /Apurar e liberar o resultado/ }));

    const tela = await screen.findByRole('dialog', { name: /Apuração/ });
    // A apuração chega do banco depois que a tela abre: espera o botão aparecer.
    const liberar = await within(tela).findByRole('button', { name: /Liberar o resultado/ }) as HTMLButtonElement;
    expect(liberar.disabled).toBe(true);
    expect(within(tela).getByText(/Falta decidir 1 categoria/)).toBeTruthy();

    fireEvent.click(within(within(tela).getByRole('radiogroup', { name: /Decisão/ })).getByRole('radio', { name: /Bruno/ }));
    await waitFor(() => expect(banco.desempatar).toHaveBeenCalledWith('v-encerrada', 'q1', 'b'));
    await waitFor(() => expect(liberar.disabled).toBe(false));

    fireEvent.click(liberar);
    await waitFor(() => expect(banco.liberar).toHaveBeenCalledWith('v-encerrada'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Apuração/ })).toBeNull());
  });
});

describe('AvisoVotacao: diretoria', () => {
  it('diretoria com votação encerrada vê «Abrir a apuração»', async () => {
    banco.listar.mockResolvedValue([item('encerrada'), item('aberta')]);
    banco.apuracao.mockResolvedValue(apuracao());
    render(<AvisoVotacao recuoEsquerda={16} />);
    expect(await screen.findByText('Falta liberar o resultado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir a apuração/ }));
    expect(await screen.findByRole('dialog', { name: /Apuração/ })).toBeTruthy();
  });

  it('líder não pergunta a lista da diretoria', async () => {
    auth.perfil = { id: 'a', perfil: 'lider' };
    render(<AvisoVotacao recuoEsquerda={16} />);
    await waitFor(() => expect(banco.minhas).toHaveBeenCalled());
    expect(banco.listar).not.toHaveBeenCalled();
    expect(screen.queryByText('Falta liberar o resultado')).toBeNull();
  });
});

describe('liberarParaOsLideres', () => {
  const nova = { titulo: 'Nov', produto: 'cobranca', setorIds: ['s1'], cargos: ['lider'], perguntas: PERGUNTAS, participantes: ['a', 'b', 'c'] };

  it('grava e abre', async () => {
    rpc.mockResolvedValueOnce({ data: 'v1', error: null }).mockResolvedValueOnce({ data: null, error: null });
    await expect(liberarParaOsLideres(nova)).resolves.toBe('v1');
    expect(rpc.mock.calls.map(c => [c[0], c[1].p_acao])).toEqual([
      ['fn_votacao_lideranca_salvar', undefined], ['fn_votacao_lideranca_mudar', 'abrir'],
    ]);
  });

  it('abrir recusado (já há outra aberta): cancela o rascunho criado e avisa', async () => {
    rpc.mockResolvedValueOnce({ data: 'v1', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Já existe uma votação aberta nesta operação.', code: '22023' } })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(liberarParaOsLideres(nova)).rejects.toThrow(/Já existe uma votação aberta/);
    expect(rpc.mock.calls[2]).toEqual(['fn_votacao_lideranca_mudar', { p_id: 'v1', p_acao: 'cancelar' }]);
  });
});

describe('VisaoDiretoria: o mesmo líder em 1º em duas categorias (10/11/2026)', () => {
  const gente = PESSOAS.map(p => ({ ...p, setor: 'Play 1' }));
  const cedula = cedulaComTodos(PERGUNTAS, gente);
  // Ana em 1º nas duas: q1 (3 × 2 do Bruno) e q2 (2 × 1 da Carla).
  const resultados = apurar(cedula, { q1: { a: 3, b: 2 }, q2: { a: 2, c: 1 } });
  const pessoas = new Map(gente.map(p => [p.id, p]));

  it('as duas categorias pedem decisão, com os mais votados e o «já leva»', () => {
    const onDesempatar = vi.fn();
    render(<VisaoDiretoria resultados={resultados} pessoas={pessoas} desempates={{}} onDesempatar={onDesempatar} onLiberar={() => {}} />);
    expect(screen.getByText(/Falta decidir 2 categorias/)).toBeTruthy();
    expect(screen.getAllByText(/Em 1º em mais de uma/)).toHaveLength(2);
    const q1 = screen.getByRole('radiogroup', { name: /Decisão: Quem é o mais comunicativo/ });
    expect(within(q1).getAllByRole('radio').map(b => b.textContent)).toEqual([
      expect.stringMatching(/Ana3 votos.*já leva/), expect.stringMatching(/Bruno2 votos/),
    ]);
    fireEvent.click(within(q1).getByRole('radio', { name: /Bruno/ }));
    expect(onDesempatar).toHaveBeenCalledWith('q1', 'b');
  });

  it('com q1 para o Bruno, nada falta e o liberar destrava', () => {
    render(<VisaoDiretoria resultados={resultados} pessoas={pessoas} desempates={{ q1: 'b' }} onDesempatar={() => {}} onLiberar={() => {}} />);
    expect(screen.getByText(/Tudo decidido/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Liberar o resultado/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
