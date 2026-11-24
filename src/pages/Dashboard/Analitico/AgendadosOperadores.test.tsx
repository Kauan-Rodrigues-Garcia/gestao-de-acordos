/**
 * AgendadosOperadores.test.tsx — a aba «Agendados» do Painel Líder.
 *
 * As contas têm teste próprio (`services/agendados/agendados.test.ts`). Aqui
 * fica o que é da tela: o que ela pede ao banco, a carteira separada por regra,
 * o recorte por dia e a lista que abre sob demanda.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { LinhaAgenda, FontesAgenda } from '@/services/agendados/agendados';

const { buscarAgenda, buscarAgendaDaPessoa, regras } = vi.hoisted(() => ({
  buscarAgenda: vi.fn(),
  buscarAgendaDaPessoa: vi.fn(),
  regras: { valor: [] as { id: string; regra: string }[] },
}));

vi.mock('@/services/agendados/agendados.service', () => ({ buscarAgenda, buscarAgendaDaPessoa }));
vi.mock('@/lib/supabaseSemTipo', () => ({
  tabelaSemTipo: () => ({
    select: () => ({ eq: () => Promise.resolve({ data: regras.valor, error: null }) }),
  }),
}));
vi.mock('@/lib/index', async (original) => ({
  ...(await original<typeof import('@/lib/index')>()),
  getTodayISO: () => '2026-11-23',
}));
vi.mock('@/lib/mesReferencia', async (original) => ({
  ...(await original<typeof import('@/lib/mesReferencia')>()),
  ehMesAtual: (m: string) => m === '2026-11',
}));

import { AgendadosOperadores } from './AgendadosOperadores';

const fontes: FontesAgenda = {
  operadorEquipeMap: {
    ana:   { equipe_id: 'eqA', equipe_nome: 'Equipe Sol', setor_id: 'play2' },
    bruno: { equipe_id: 'eqA', equipe_nome: 'Equipe Sol', setor_id: 'play2' },
    cris:  { equipe_id: 'eqC', equipe_nome: 'Equipe Cofen', setor_id: 'conecta' },
  },
  equipesExtrasPorOperador: {},
  setorDaEquipe: new Map([['eqA', 'play2'], ['eqC', 'conecta']]),
};
const operadores = [
  { id: 'ana', nome: 'Ana Lima' },
  { id: 'bruno', nome: 'Bruno Reis' },
  { id: 'cris', nome: 'Cris Souza' },
];
const setores = [{ id: 'play2', nome: 'Play 2' }, { id: 'conecta', nome: 'Conecta Play' }];

let n = 0;
const l = (p: Partial<LinhaAgenda> & { operador_id: string; vencimento: string }): LinhaAgenda => ({
  id: `a${++n}`, setor_id: null, valor: 100, status: 'verificar_pendente', tipo_vinculo: 'direto',
  par_acordo_id: null, ...p,
});

function montar(over: Partial<Parameters<typeof AgendadosOperadores>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AgendadosOperadores empresaId="emp" mes="2026-11" operadores={operadores} fontes={fontes}
        setorIds={[]} equipeIds={[]} setores={setores} isPP={false} recarregarKey={0} {...over} />
    </MemoryRouter>,
  );
}

describe('AgendadosOperadores', () => {
  beforeEach(() => {
    n = 0;
    buscarAgenda.mockReset();
    buscarAgendaDaPessoa.mockReset();
    regras.valor = [];
  });

  it('pede ao banco as pessoas do recorte, com o mês esticado até hoje + 7', async () => {
    buscarAgenda.mockResolvedValue([]);
    montar({ setorIds: ['play2'] });
    await waitFor(() => expect(buscarAgenda).toHaveBeenCalled());
    const pedido = buscarAgenda.mock.calls[0][0];
    expect([...pedido.operadores].sort()).toEqual(['ana', 'bruno']);
    expect(pedido.de).toBe('2026-11-01');
    expect(pedido.ate).toBe('2026-11-30');
  });

  it('mostra o que vence hoje e acusa a agenda vazia', async () => {
    buscarAgenda.mockResolvedValue([
      l({ operador_id: 'ana', vencimento: '2026-11-23', valor: 500 }),
      l({ operador_id: 'ana', vencimento: '2026-11-10', status: 'pago', valor: 200 }),
      l({ operador_id: 'bruno', vencimento: '2026-11-05', status: 'nao_pago', valor: 80 }),
    ]);
    montar({ setorIds: ['play2'] });

    const linhaAna = (await screen.findByText('Ana Lima')).closest('tr')!;
    expect(within(linhaAna).getByText('R$ 500')).toBeTruthy();
    const linhaBruno = screen.getByText('Bruno Reis').closest('tr')!;
    expect(within(linhaBruno).getByText(/agenda vazia/)).toBeTruthy();
    // Conversão da carteira: 1 pago ÷ (1 pago + 1 não pago).
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('regra Cofen e Nosso produto não se somam: a tela pede a carteira', async () => {
    regras.valor = [{ id: 'play2', regra: 'nosso_produto' }, { id: 'conecta', regra: 'cofen' }];
    buscarAgenda.mockResolvedValue([
      l({ operador_id: 'ana', vencimento: '2026-11-10', valor: 1000 }),
      l({ operador_id: 'cris', vencimento: '2026-11-10', valor: 7 }),
    ]);
    montar();

    expect(await screen.findByRole('button', { name: 'Cofen' })).toBeTruthy();
    await screen.findByText('Ana Lima');
    expect(screen.queryByText('Cris Souza')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cofen' }));
    expect(await screen.findByText('Cris Souza')).toBeTruthy();
    expect(screen.queryByText('Ana Lima')).toBeNull();
    // Na Cofen, «a verificar» se chama «Pendente».
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);
  });

  it('clicar num dia do calendário recorta a aba naquele dia', async () => {
    buscarAgenda.mockResolvedValue([
      l({ operador_id: 'ana', vencimento: '2026-11-10', valor: 300 }),
      l({ operador_id: 'ana', vencimento: '2026-11-12', valor: 40 }),
    ]);
    montar({ setorIds: ['play2'] });
    await screen.findByText('Ana Lima');

    fireEvent.click(screen.getByRole('button', { name: /ter 10\/11/ }));
    expect(await screen.findByRole('button', { name: /Ver o mês inteiro/ })).toBeTruthy();
    expect(screen.getByText('No dia')).toBeTruthy();
    const linhaAna = screen.getByText('Ana Lima').closest('tr')!;
    expect(within(linhaAna).getAllByText('R$ 300').length).toBeGreaterThan(0);
    expect(within(linhaAna).queryByText('R$ 340')).toBeNull();
  });

  it('a lista da pessoa só é lida quando a linha abre', async () => {
    buscarAgenda.mockResolvedValue([l({ id: 'x1', operador_id: 'ana', vencimento: '2026-11-24', valor: 90 })]);
    buscarAgendaDaPessoa.mockResolvedValue([{
      id: 'x1', operador_id: 'ana', setor_id: null, vencimento: '2026-11-24', valor: 90,
      status: 'verificar_pendente', tipo_vinculo: 'direto', nome_cliente: 'Maria Cliente',
      nr_cliente: '123456', instituicao: null, tipo: 'boleto', numero_parcela: 1, parcelas: 3,
      vinculo_operador_nome: null,
    }]);
    montar({ setorIds: ['play2'] });
    await screen.findByText('Ana Lima');
    expect(buscarAgendaDaPessoa).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Ana Lima'));
    expect(await screen.findByText('Maria Cliente')).toBeTruthy();
    expect(buscarAgendaDaPessoa).toHaveBeenCalledWith(expect.objectContaining({ operadorId: 'ana' }));
    expect(screen.getByText('parcela 1 de 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir o acordo' }).getAttribute('href')).toBe('/acordos/x1');
  });
});
