/**
 * A separação Chips Físicos desenhada com dados simulados — sem banco.
 *
 * O que se confere: os contadores contam e filtram, a liderança vê um bloco por
 * pessoa e quem ainda não cadastrou, o operador vê só a lista dele, e a tabela
 * ausente (migration não aplicada) vira aviso em vez de erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { useChipsFisicos } from '@/hooks/useChipsFisicos';
import type { ChipFisicoRow, PessoaChipRow } from '@/services/chipsFisicos/chipsFisicos.service';

type Retorno = ReturnType<typeof useChipsFisicos>;
let estado: Retorno;

vi.mock('@/hooks/useChipsFisicos', () => ({ useChipsFisicos: () => estado }));
vi.mock('@/services/chipsFisicos/chipsFisicos.service', async (original) => ({
  ...(await original<typeof import('@/services/chipsFisicos/chipsFisicos.service')>()),
  excluirChipFisico: vi.fn(async () => ({ ok: true })),
  alterarStatusChip: vi.fn(async () => ({ ok: true })),
  salvarChipFisico: vi.fn(async () => ({ ok: true, dados: 'novo' })),
}));

const { ChipsFisicos } = await import('./index');

const agora = Date.now();
const em = (min: number) => new Date(agora + min * 60_000).toISOString();

function chip(p: Partial<ChipFisicoRow> & { id: string; operador_id: string; numero: string }): ChipFisicoRow {
  return {
    empresa_id: 'e1', operadora: null, observacao: null, status: 'ativo',
    status_desde: em(-60), prazo_ate: null, status_por: null, status_por_nome: null,
    criado_por: null, criado_em: em(-120), atualizado_em: em(-60), ...p,
  };
}

const pessoa = (id: string, nome: string, ativo = true): PessoaChipRow =>
  ({ id, nome, foto_url: null, setor_id: 's1', ativo });

function base(p: Partial<Retorno>): Retorno {
  return {
    habilitado: true, alcance: 'setor', podeCuidarColegas: true,
    chips: [], pessoas: new Map(), setores: [], meuId: 'lider', meuSetorId: 's1',
    instalado: true, loading: false, erro: null, recarregar: vi.fn(async () => {}),
    ...p,
  };
}

/** Abre o bloco recolhido de uma pessoa, na visão de grupo. */
function abrirPessoa(nome: string) {
  const botao = screen.getAllByTitle('Ver os chips').find(b => b.textContent?.includes(nome));
  if (!botao) throw new Error(`Bloco de ${nome} não encontrado.`);
  fireEvent.click(botao);
}

describe('Chips Físicos — liderança', () => {
  beforeEach(() => {
    estado = base({
      chips: [
        chip({ id: 'a', operador_id: 'ana', numero: '18911110000' }),
        chip({ id: 'b', operador_id: 'ana', numero: '18922220000', status: 'banido', prazo_ate: em(-1) }),
        chip({ id: 'c', operador_id: 'bruno', numero: '18933330000', status: 'recuperar', prazo_ate: em(90) }),
      ],
      pessoas: new Map([
        ['ana', pessoa('ana', 'Ana Lima')],
        ['bruno', pessoa('bruno', 'Bruno Reis')],
        ['caio', pessoa('caio', 'Caio Sem Chip')],
        ['lider', pessoa('lider', 'Lia Líder')],
      ]),
    });
  });

  it('conta por status e mostra um bloco por pessoa', () => {
    render(<ChipsFisicos />);
    const contadores = screen.getByRole('group', { name: 'Filtrar por status' });
    expect(within(contadores).getByRole('button', { name: /3\s*Todos/ })).toBeTruthy();
    expect(within(contadores).getByRole('button', { name: /1\s*Banidos/ })).toBeTruthy();
    expect(within(contadores).getByRole('button', { name: /1\s*Tempo encerrado/ })).toBeTruthy();
    expect(screen.getByText('Ana Lima')).toBeTruthy();
    expect(screen.getByText('Bruno Reis')).toBeTruthy();
    // Recolhido, o bloco já avisa o tempo encerrado.
    expect(screen.getByText('1 tempo encerrado')).toBeTruthy();
    abrirPessoa('Ana Lima');
    // O selo do chip cujo tempo acabou — o status continua Banido.
    expect(screen.getByTitle(/O tempo terminou em/)).toBeTruthy();
    expect(screen.getByText('Banido')).toBeTruthy();
  });

  it('«Adicionar chip» vem antes da busca, no começo da linha', () => {
    render(<ChipsFisicos />);
    const botao = screen.getByRole('button', { name: 'Adicionar chip' });
    const busca = screen.getByRole('searchbox', { name: 'Buscar chip' });
    expect(botao.compareDocumentPosition(busca) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cada pessoa nasce recolhida e abre no clique', () => {
    render(<ChipsFisicos />);
    expect(screen.queryByText('(18) 91111-0000')).toBeNull();
    expect(screen.queryByRole('button', { name: /Status/ })).toBeNull();
    abrirPessoa('Ana Lima');
    expect(screen.getByText('(18) 91111-0000')).toBeTruthy();
    // Só a Ana abriu; o Bruno continua fechado.
    expect(screen.queryByText('(18) 93333-0000')).toBeNull();
    fireEvent.click(screen.getByTitle('Recolher'));
    expect(screen.queryByText('(18) 91111-0000')).toBeNull();
  });

  it('«Expandir todos» abre todo mundo, e «Recolher todos» fecha', () => {
    render(<ChipsFisicos />);
    fireEvent.click(screen.getByRole('button', { name: /Expandir todos/ }));
    expect(screen.getByText('(18) 91111-0000')).toBeTruthy();
    expect(screen.getByText('(18) 93333-0000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Recolher todos/ }));
    expect(screen.queryByText('(18) 91111-0000')).toBeNull();
  });

  it('com busca, os blocos já vêm abertos', () => {
    render(<ChipsFisicos />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar chip' }), { target: { value: 'Bruno' } });
    expect(screen.getByText('(18) 93333-0000')).toBeTruthy();
  });

  it('Restrição aceita tempo de até 24 horas', () => {
    render(<ChipsFisicos />);
    abrirPessoa('Ana Lima');
    fireEvent.click(screen.getAllByRole('button', { name: /Status/ })[0]);
    const janela = screen.getByRole('dialog');
    fireEvent.click(within(janela).getByRole('radio', { name: /Restrição/ }));
    expect(within(janela).getByText(/até 24 horas/)).toBeTruthy();
    expect(within(janela).getByRole('button', { name: '24 h' })).toBeTruthy();
  });

  it('a observação aparece em negrito', () => {
    estado = base({
      chips: [chip({ id: 'a', operador_id: 'ana', numero: '18911110000', observacao: 'Chip reserva' })],
      pessoas: new Map([['ana', pessoa('ana', 'Ana Lima')]]),
    });
    render(<ChipsFisicos />);
    abrirPessoa('Ana Lima');
    expect(screen.getByText('Chip reserva').className).toMatch(/font-bold/);
  });

  it('lista quem ainda não cadastrou chip', () => {
    render(<ChipsFisicos />);
    expect(screen.getByText(/Sem chip cadastrado \(2\)/)).toBeTruthy();
    expect(screen.getByText('Caio Sem Chip')).toBeTruthy();
  });

  it('o contador filtra a lista', () => {
    render(<ChipsFisicos />);
    fireEvent.click(screen.getByRole('button', { name: /1\s*Recuperar/ }));
    expect(screen.queryByText('Ana Lima')).toBeNull();
    expect(screen.getByText('Bruno Reis')).toBeTruthy();
  });

  it('abre a janela de status com os quatro status', () => {
    render(<ChipsFisicos />);
    abrirPessoa('Ana Lima');
    fireEvent.click(screen.getAllByRole('button', { name: /Status/ })[0]);
    const janela = screen.getByRole('dialog');
    expect(within(janela).getByRole('radio', { name: /Ativo/ })).toBeTruthy();
    expect(within(janela).getByRole('radio', { name: /Restrição/ })).toBeTruthy();
    expect(within(janela).getByRole('radio', { name: /Banido/ })).toBeTruthy();
    expect(within(janela).getByRole('radio', { name: /Recuperar/ })).toBeTruthy();
  });
});

describe('Chips Físicos — operador', () => {
  it('vê só a própria lista, sem blocos por pessoa', () => {
    estado = base({
      alcance: 'proprios', podeCuidarColegas: false, meuId: 'ana',
      chips: [chip({ id: 'a', operador_id: 'ana', numero: '18911110000' })],
      pessoas: new Map([['ana', pessoa('ana', 'Ana Lima')]]),
    });
    render(<ChipsFisicos />);
    expect(screen.getByText(/Seus chips/)).toBeTruthy();
    expect(screen.getByText('(18) 91111-0000')).toBeTruthy();
    expect(screen.queryByText(/Sem chip cadastrado/)).toBeNull();
  });

  it('sem chip nenhum, convida a cadastrar', () => {
    estado = base({ alcance: 'proprios', podeCuidarColegas: false, meuId: 'ana' });
    render(<ChipsFisicos />);
    expect(screen.getByText('Você ainda não cadastrou nenhum chip físico.')).toBeTruthy();
  });
});

describe('Chips Físicos — antes da migration', () => {
  it('avisa que falta instalar, em vez de quebrar', () => {
    estado = base({ instalado: false });
    render(<ChipsFisicos />);
    expect(screen.getByText('Chips Físicos ainda não está no banco.')).toBeTruthy();
  });

  it('não desenha nada para quem não tem a chave', () => {
    estado = base({ habilitado: false });
    const { container } = render(<ChipsFisicos />);
    expect(container.innerHTML).toBe('');
  });
});
