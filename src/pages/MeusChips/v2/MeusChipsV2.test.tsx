/**
 * Meus Chips 2.0 com dados simulados — sem banco.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChipFisicoRow, PessoaChipRow } from '@/services/chipsFisicos/chipsFisicos.service';
import { agruparGestao, contar, montarAgenda } from '@/services/chipsFisicos/chipsPainel';
import { VisaoGestao } from './VisaoGestao';
import { VisaoOperador } from './VisaoOperador';

beforeAll(() => {
  // recharts mede o contêiner.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const agora = Date.now();
const em = (min: number) => new Date(agora + min * 60_000).toISOString();

function chip(p: Partial<ChipFisicoRow> & { id: string; operador_id: string; numero: string }): ChipFisicoRow {
  return {
    empresa_id: 'e', operadora: null, observacao: null, status: 'ativo', status_desde: em(-60),
    prazo_ate: null, status_por: null, status_por_nome: null, criado_por: null, criado_em: em(-120),
    atualizado_em: em(-60), etiquetas: [], ativo_acumulado_seg: 0, lembrete_texto: null,
    lembrete_ate: null, lembrete_por: null, ...p,
  };
}
const pessoa = (id: string, nome: string, setor: string, equipe: string | null = null): PessoaChipRow =>
  ({ id, nome, foto_url: null, setor_id: setor, equipe_id: equipe, ativo: true });

const acoes = { onStatus: vi.fn(), onCorrigir: vi.fn(), onExcluir: vi.fn(), onEtiquetas: vi.fn(), onLembrete: vi.fn() };

const chips = [
  chip({ id: 'a', operador_id: 'ana', numero: '18911110000', etiquetas: ['movimentando'] }),
  chip({ id: 'b', operador_id: 'ana', numero: '18922220000', status: 'banido' }),
  chip({ id: 'c', operador_id: 'bia', numero: '18933330000', status: 'restricao', prazo_ate: em(30) }),
];
const pessoas = new Map([
  ['ana', pessoa('ana', 'Ana Lima', 's1', 'e1')],
  ['bia', pessoa('bia', 'Bia Reis', 's2', 'e2')],
  ['caio', pessoa('caio', 'Caio Sem Chip', 's1', 'e1')],
]);
const setores = [{ id: 's1', nome: 'Play 1', ativo: true, cidade: 'Birigui' }, { id: 's2', nome: 'Play 5', ativo: true, cidade: 'Marília' }];
const equipes = [{ id: 'e1', nome: 'Águia', setor_id: 's1' }, { id: 'e2', nome: 'Lobo', setor_id: 's2' }];

describe('chipsPainel', () => {
  it('agrupa por setor com a marca da cidade, atenção primeiro', () => {
    const g = agruparGestao(chips, pessoas, setores, equipes, 'setor', false);
    expect(g.map(x => [x.nome, x.detalhe])).toEqual([['Play 1', 'BookPlay'], ['Play 5', 'PaguePlay']]);
    expect(g[0].contagem).toMatchObject({ total: 2, ativo: 1, banido: 1, movimentando: 1 });
  });

  it('agrupa por equipe com setor e marca', () => {
    const g = agruparGestao(chips, pessoas, setores, equipes, 'equipe', true);
    expect(g.find(x => x.nome === 'Lobo')?.detalhe).toBe('Play 5 · PaguePlay');
    expect(g.find(x => x.nome === 'Águia')?.semChip.map(p => p.nome)).toEqual(['Caio Sem Chip']);
  });

  it('agenda põe o tempo correndo', () => {
    expect(montarAgenda(chips, agora).map(i => i.chip.id)).toEqual(['c']);
    expect(contar(chips).total).toBe(3);
  });
});

describe('VisaoGestao', () => {
  const props = {
    alcance: 'todos' as const, chips, pessoas, setores, equipes, meuSetorId: 's1', recursos2: true,
    podeCuidar: () => true, podeAdicionarPara: () => true, onAdicionar: vi.fn(), acoes,
  };

  it('mostra indicadores, grupos e a tabela de pessoas', () => {
    render(<VisaoGestao {...props} />);
    expect(screen.getByRole('button', { name: '1 Banidos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Play 1' })).toBeTruthy();
    expect(screen.getByText('Ana Lima')).toBeTruthy();
    expect(screen.getByRole('img', { name: '2 chips: 1 ativo, 1 banido' })).toBeTruthy();
  });

  it('a linha da pessoa abre os cartões dos chips', () => {
    render(<VisaoGestao {...props} />);
    expect(screen.queryByText('(18) 91111-0000')).toBeNull();
    fireEvent.click(screen.getAllByTitle('Ver os chips')[0]);
    expect(screen.getByText('(18) 91111-0000')).toBeTruthy();
  });

  it('o indicador filtra a lista', () => {
    render(<VisaoGestao {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '1 Restrição' }));
    expect(screen.queryByText('Ana Lima')).toBeNull();
    expect(screen.getAllByText('Bia Reis').length).toBeGreaterThan(0);
  });

  it('troca para «Por equipe»', () => {
    render(<VisaoGestao {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: /Por equipe/ }));
    expect(screen.getByRole('heading', { name: 'Águia' })).toBeTruthy();
  });
});

describe('VisaoOperador', () => {
  it('cartões grandes com status e etiqueta', () => {
    render(<VisaoOperador chips={chips.slice(0, 2)} nome="Ana Lima" recursos2 podeCuidar={() => true} onAdicionar={vi.fn()} acoes={acoes} />);
    expect(screen.getByText('Olá, Ana')).toBeTruthy();
    expect(screen.getByText('1 de 2 chips ativos.')).toBeTruthy();
    expect(screen.getByText('Movimentando')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Status/ })[0]);
    expect(acoes.onStatus).toHaveBeenCalled();
  });

  it('sem chip, convida a cadastrar', () => {
    render(<VisaoOperador chips={[]} nome="Ana" recursos2 podeCuidar={() => true} onAdicionar={vi.fn()} acoes={acoes} />);
    expect(screen.getByText('Você ainda não cadastrou nenhum chip físico.')).toBeTruthy();
  });
});
