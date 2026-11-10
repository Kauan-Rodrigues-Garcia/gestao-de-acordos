/**
 * Acompanhamento da votação (10/11/2026): as contas, a leitura do banco
 * (registro do super_admin, apuração da diretoria) e a tela montada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ApuracaoDaVotacao } from './banco';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

const { montarAcompanhamento, passaNoFiltro, textoDeQuemFalta } = await import('./acompanhamento');
const { lerAcompanhamento } = await import('./banco');
const { AcompanhamentoVotacao } = await import('./AcompanhamentoVotacao');

const PERGUNTAS = [
  { id: 'q1', emoji: '⭐', texto: 'Quem é o mais comunicativo?' },
  { id: 'q2', emoji: '🧘', texto: 'Quem é o mais paciente?' },
  { id: 'q3', emoji: '🎯', texto: 'Quem é o mais organizado?' },
];
const PESSOAS = [
  { id: 'a', nome: 'Ana', foto: null, perfil: 'lider', setor: 'Play 1' },
  { id: 'b', nome: 'Bruno', foto: null, perfil: 'lider', setor: 'Play 1' },
  { id: 'c', nome: 'Carla', foto: null, perfil: 'lider', setor: 'Receptivo' },
  { id: 'd', nome: 'Diego', foto: null, perfil: 'lider', setor: 'Receptivo' },
  { id: 'e', nome: 'Érica', foto: null, perfil: 'lider', setor: 'Receptivo' },
];
/** Ana e Carla votaram; q1 empatada (Ana × Bruno), q2 Carla na frente, q3 sem voto. */
const retrato = (comContagem = true): ApuracaoDaVotacao => ({
  votacao: { id: 'v1', titulo: 'Novembro', produto: 'cobranca', estado: 'aberta', aberta_em: null, liberada_em: null },
  perguntas: PERGUNTAS,
  participantes: PESSOAS,
  contagem: comContagem ? [
    { pergunta_id: 'q1', candidato_id: 'a', votos: 1 }, { pergunta_id: 'q1', candidato_id: 'b', votos: 1 },
    { pergunta_id: 'q2', candidato_id: 'c', votos: 2 },
  ] : null,
  desempates: comContagem ? [] : null,
  envios: [
    { eleitor_id: 'a', nome: 'Ana', comecou_em: '2026-11-10T12:00:00Z', enviado_em: '2026-11-10T12:06:00Z', respondidas: 3 },
    { eleitor_id: 'c', nome: 'Carla', comecou_em: '2026-11-10T13:00:00Z', enviado_em: '2026-11-10T13:10:00Z', respondidas: 3 },
  ],
});

beforeEach(() => {
  rpc.mockReset();
});

describe('montarAcompanhamento', () => {
  const a = montarAcompanhamento(retrato());

  it('resumo: quem votou, quem falta, tempo típico (mediana) e último voto', () => {
    expect(a.resumo).toEqual({ participantes: 5, votaram: 2, faltam: 3, pct: 40, tempoTipico: 8, ultimoVoto: '2026-11-10T13:10:00Z' });
    expect(a.pessoas.find(p => p.id === 'a')).toMatchObject({ votou: true, minutos: 6, respondidas: 3 });
    expect(a.pessoas.find(p => p.id === 'b')).toMatchObject({ votou: false, minutos: null, enviadoEm: null });
  });

  it('setores: o mais atrasado primeiro, % cortado', () => {
    expect(a.setores).toEqual([
      { setor: 'Receptivo', total: 3, votaram: 1, pct: 33 },
      { setor: 'Play 1', total: 2, votaram: 1, pct: 50 },
    ]);
  });

  it('parcial e destaques: empate conta como «na frente» para os dois', () => {
    expect(a.parcial?.map(r => [r.pergunta.id, r.vencedores])).toEqual([['q1', ['a', 'b']], ['q2', ['c']], ['q3', []]]);
    expect(a.destaques).toEqual([
      { id: 'c', votos: 2, naFrente: 1 },
      { id: 'a', votos: 1, naFrente: 1 },
      { id: 'b', votos: 1, naFrente: 1 },
    ]);
  });

  it('sem contagem do banco não há parcial', () => {
    const s = montarAcompanhamento(retrato(false));
    expect(s.parcial).toBeNull();
    expect(s.destaques).toEqual([]);
  });

  it('filtro: status, setor e nome sem acento', () => {
    const f = (status: 'todos' | 'votaram' | 'faltam', setor: string | null, busca = '') =>
      a.pessoas.filter(p => passaNoFiltro(p, { status, setor, busca })).map(p => p.id);
    expect(f('faltam', null)).toEqual(['b', 'd', 'e']);
    expect(f('faltam', 'Receptivo')).toEqual(['d', 'e']);
    expect(f('todos', null, 'erica')).toEqual(['e']);
  });

  it('«Copiar quem falta» agrupa por setor', () => {
    expect(textoDeQuemFalta('Novembro', a.pessoas)).toBe(
      'Novembro — faltam votar 3:\n\nPlay 1 (1):\n- Bruno\n\nReceptivo (2):\n- Diego\n- Érica',
    );
  });
});

describe('lerAcompanhamento', () => {
  it('super_admin: lê o registro e descarta em quem cada um votou', async () => {
    rpc.mockResolvedValueOnce({ data: { ...retrato(), votos: [{ eleitor_id: 'a', candidato_id: 'b' }], eventos: [] }, error: null });
    const r = await lerAcompanhamento('v1');
    expect(rpc).toHaveBeenCalledWith('fn_votacao_lideranca_registro', { p_id: 'v1' });
    expect(r.comParcial).toBe(true);
    expect('votos' in r.retrato).toBe(false);
    expect('eventos' in r.retrato).toBe(false);
  });

  it('recusado (diretoria): cai na apuração, sem parcial com a votação aberta', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'NAO_AUTORIZADO: só o super_admin', code: '42501' } })
      .mockResolvedValueOnce({ data: retrato(false), error: null });
    const r = await lerAcompanhamento('v1');
    expect(rpc.mock.calls.map(c => c[0])).toEqual(['fn_votacao_lideranca_registro', 'fn_votacao_lideranca_apuracao']);
    expect(r.comParcial).toBe(false);
  });

  it('outro erro não é engolido', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Votação não encontrada.', code: '22023' } });
    await expect(lerAcompanhamento('v1')).rejects.toThrow(/não encontrada/);
  });
});

describe('AcompanhamentoVotacao (tela)', () => {
  it('participação filtra pelos cartões e pelo setor; a parcial só aparece no clique', async () => {
    rpc.mockResolvedValue({ data: { ...retrato(), votos: [], eventos: [] }, error: null });
    render(<AcompanhamentoVotacao votacaoId="v1" titulo="Novembro" estado="aberta" onFechar={() => {}} />);
    const tela = await screen.findByRole('dialog', { name: /Acompanhamento/ });
    const pessoas = () => within(within(tela).getByRole('region', { name: 'Pessoas' })).queryAllByRole('listitem').length;
    await waitFor(() => expect(pessoas()).toBe(5));

    fireEvent.click(within(tela).getByRole('button', { name: /Faltam/ }));
    expect(pessoas()).toBe(3);
    fireEvent.click(within(within(tela).getByRole('region', { name: 'Por setor' })).getByRole('button', { name: /Receptivo/ }));
    expect(pessoas()).toBe(2);

    fireEvent.click(within(tela).getByRole('tab', { name: /Parcial/ }));
    expect(within(tela).queryByText('Quem é o mais paciente?')).toBeNull();
    fireEvent.click(within(tela).getByRole('button', { name: /Mostrar a parcial/ }));
    expect(within(tela).getByText('Quem é o mais paciente?')).toBeTruthy();
    expect(within(tela).getByText(/Empate no 1º: Ana, Bruno/)).toBeTruthy();
  });
});
