/**
 * A sub-aba «Histórico» do Plantão Elite: só lê quando aberta, e desenha o
 * resumo, o mês a mês e a grade dia a dia com a dupla de cada dia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { RespostaHistoricoElite } from '@/services/plantaoElite/historicoElite';
import type { RespostaPlantaoElite } from '@/services/plantaoElite/plantaoElite';

const { buscarHistoricoElite, buscarPlantaoElite } = vi.hoisted(() => ({
  buscarHistoricoElite: vi.fn(),
  buscarPlantaoElite: vi.fn(),
}));

vi.mock('@/services/plantaoElite/historicoElite', async (original) => ({
  ...(await original<typeof import('@/services/plantaoElite/historicoElite')>()),
  buscarHistoricoElite,
}));
vi.mock('@/services/plantaoElite/plantaoElite', async (original) => ({
  ...(await original<typeof import('@/services/plantaoElite/plantaoElite')>()),
  buscarPlantaoElite,
}));
vi.mock('@/lib/copiarImagem', () => ({ copiarImagemDoElemento: vi.fn() }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: () => () => undefined }));
vi.mock('@/lib/index', async (original) => ({
  ...(await original<typeof import('@/lib/index')>()),
  getTodayISO: () => '2026-11-02',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlantaoElite } from './PlantaoElite';
import { PainelHistoricoElite } from './HistoricoPlantaoElite';
import { montarHistoricoElite } from '@/services/plantaoElite/historicoElite';

const pessoas = [
  { id: 't', nome: 'Tiago Almada', usuario: null },
  { id: 'a', nome: 'Agatha Rocha', usuario: null },
  { id: 'm', nome: 'Matheus Souza', usuario: null },
  { id: 'g', nome: 'Gabriel Oliveira', usuario: null },
];

const historico: RespostaHistoricoElite = {
  inicio: '2026-10-01', de: '2026-10-01', ate: '2026-11-02', hoje: '2026-11-02', sou_da_dupla: false,
  setor: { id: 'rec', nome: 'Receptivo' },
  pessoas,
  dias: [
    { data: '2026-10-01', plantao: 'impar', membros: [{ id: 't', valor: 1000, qtd: 3 }, { id: 'a', valor: 500, qtd: 2 }], setor_total: 10000, setor_qtd: 50 },
    { data: '2026-10-02', plantao: 'par', membros: [{ id: 'm', valor: 300, qtd: 1 }, { id: 'g', valor: 200, qtd: 1 }], setor_total: 8000, setor_qtd: 40 },
    { data: '2026-11-01', plantao: 'impar', membros: [{ id: 't', valor: 700, qtd: 1 }, { id: 'a', valor: 100, qtd: 1 }], setor_total: 5000, setor_qtd: 20 },
    { data: '2026-11-02', plantao: 'par', membros: [{ id: 'm', valor: 900, qtd: 2 }, { id: 'g', valor: 0, qtd: 0 }], setor_total: 6000, setor_qtd: 30 },
  ],
};

const quadro: RespostaPlantaoElite = {
  data: '2026-11-02', plantao: 'par', sou_da_dupla: false,
  membros: [pessoas[2], pessoas[3]], chegadas: [], setor: null, ultima_chegada: null,
};

describe('Plantão Elite › Histórico', () => {
  beforeEach(() => {
    buscarHistoricoElite.mockReset().mockResolvedValue(historico);
    buscarPlantaoElite.mockReset().mockResolvedValue(quadro);
  });

  it('abre no quadro do dia e só lê o histórico quando a sub-aba é aberta', async () => {
    render(<PlantaoElite empresaId="emp" />);
    await waitFor(() => expect(buscarPlantaoElite).toHaveBeenCalled());
    expect(buscarHistoricoElite).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    await waitFor(() => expect(buscarHistoricoElite).toHaveBeenCalledWith('emp'));
    expect(await screen.findByText('As duplas no mês')).toBeInTheDocument();
  });

  it('o destaque abre no mês mais recente, com a frase do ritmo e o duelo das duplas', async () => {
    render(<PlantaoElite empresaId="emp" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    await screen.findByText('As duplas no mês');

    // Novembro: 800 + 900.
    expect(screen.getByText('R$ 1.700,00')).toBeInTheDocument();
    // Até o dia 2: novembro 1.700 contra outubro 2.000 → 15% atrás.
    expect(screen.getByText(/15% atrás de outubro no mesmo ponto do mês \(até o dia 2\)/)).toBeInTheDocument();
    // Duelo: Matheus & Gabriel (900) na frente de Tiago & Agatha (800).
    const duelo = screen.getByText('As duplas no mês').closest('section')!;
    expect(within(duelo).getByText('na frente').closest('div')!.textContent).toContain('Matheus & Gabriel');
    // Quem mais recebeu em novembro: Matheus primeiro.
    const pessoas = screen.getByText('Quem mais recebeu em novembro').closest('section')!;
    expect(within(pessoas).getAllByRole('listitem')[0].textContent).toContain('Matheus Souza');
  });

  it('trocar de mês muda o destaque; os números de cada dia ficam recolhidos', async () => {
    render(<PlantaoElite empresaId="emp" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Histórico' }));
    await screen.findByText('As duplas no mês');

    fireEvent.click(screen.getByRole('tab', { name: /Outubro de 2026/ }));
    expect(screen.getByText('R$ 2.000,00')).toBeInTheDocument();
    expect(screen.getByText('Dia a dia de outubro')).toBeInTheDocument();

    // A folha do quadro do dia também tem tabela (escondida): procura só no bloco.
    const botao = screen.getByRole('button', { name: /Ver os números de cada dia de outubro/ });
    const bloco = botao.closest('section')!;
    expect(within(bloco).queryByRole('table')).toBeNull();
    fireEvent.click(botao);
    const linhas = within(within(bloco).getByRole('table')).getAllByRole('row');
    expect(linhas).toHaveLength(3); // cabeçalho + 01/10 + 02/10
    expect(linhas[1].textContent).toContain('Tiago & Agatha');
    expect(linhas[1].textContent).toMatch(/R\$\s1\.500,00/);
  });
});

describe('Plantão Elite › Histórico › metas individuais e fotos (20261111170500)', () => {
  const comMetas: RespostaHistoricoElite = {
    ...historico,
    pessoas: pessoas.map(p => ({ ...p, foto: p.id === 't' ? 'https://x/tiago.jpg' : null })),
    metas: [
      { mes: '2026-10', id: 't', meta: 1000, extras: [1500], fechado: 1200 },
      { mes: '2026-10', id: 'a', meta: 2000, extras: [], fechado: 500 },
      { mes: '2026-10', id: 'm', meta: null, extras: [], fechado: 300 },
      { mes: '2026-10', id: 'g', meta: 100, extras: [], fechado: 200 },
    ],
  };

  const desenhar = (r: RespostaHistoricoElite) => render(
    <PainelHistoricoElite
      historico={montarHistoricoElite(r)} resposta={r} carregando={false} erro={null} onAtualizar={() => undefined}
    />,
  );

  it('mostra cada um com o fechado, as metas batidas e quanto faltou', () => {
    desenhar(comMetas);
    fireEvent.click(screen.getByRole('tab', { name: /Outubro de 2026/ }));
    const bloco = screen.getByText('Metas individuais de outubro').closest('section')!;
    expect(within(bloco).getByText('2 de 3 bateram a 1ª meta')).toBeInTheDocument();

    const tiago = within(bloco).getByLabelText('Meta de Tiago Almada');
    expect(tiago.textContent).toContain('Bateu a 1ª meta');
    expect(tiago.textContent).toMatch(/R\$\s1\.200,00/);
    expect(tiago.textContent).toMatch(/faltou R\$\s300/);
    expect(within(bloco).getByLabelText('Meta de Agatha Rocha').textContent).toContain('Não bateu');
    expect(within(bloco).getByLabelText('Meta de Gabriel Oliveira').textContent).toContain('Bateu a meta');
    expect(within(bloco).getByLabelText('Meta de Matheus Souza').textContent).toContain('Sem meta no mês');
  });

  it('«Quem mais recebeu» mostra o mesmo valor do «Fechou no mês» de cada um', () => {
    desenhar(comMetas);
    fireEvent.click(screen.getByRole('tab', { name: /Outubro de 2026/ }));
    const ranking = screen.getByText('Quem mais recebeu em outubro').closest('section')!;
    expect(within(ranking).getByText('No mês inteiro, o mesmo valor das metas individuais')).toBeInTheDocument();
    const linhas = within(ranking).getAllByRole('listitem').map(li => li.textContent ?? '');
    // Tiago fechou 1.200 (no plantão 1.000); Agatha 500; Matheus 300; Gabriel 200.
    expect(linhas[0]).toContain('Tiago Almada');
    expect(linhas[0]).toMatch(/R\$\s1\.200/);
    expect(linhas[0]).toMatch(/No plantão: R\$\s1\.000 em 1 plantão/);
    expect(linhas.map(l => l.match(/^\dº/)?.[0])).toEqual(['1º', '2º', '3º', '4º']);
    expect(linhas[3]).toContain('Gabriel Oliveira');
    expect(linhas[3]).toMatch(/R\$\s200/);
  });

  it('sem `metas` no banco o painel não aparece', () => {
    desenhar(historico);
    expect(screen.queryByText(/Metas individuais de/)).toBeNull();
  });
});
