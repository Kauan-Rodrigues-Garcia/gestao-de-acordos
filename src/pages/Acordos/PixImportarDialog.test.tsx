/**
 * O diálogo de importação, de ponta a ponta sem banco: arquivo → conferência →
 * «Aplicar» chama inserir, aprovar e pagar com os ids certos (12/11/2026).
 *
 * A planilha é a da Digital (pago = «pg» na SIT): o SheetJS da comunidade não
 * grava cor, então o verde do Play 2 fica nos testes de `pixImportacao`.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { utils, write } from '@e965/xlsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistroPixConferencia } from '@/services/pix_automatico.service';
import type { PixTela } from './usePixAutomatico';

const servico = vi.hoisted(() => ({
  registros: [] as RegistroPixConferencia[],
  inserir: vi.fn(),
  aprovar: vi.fn(),
  pagar: vi.fn(),
}));

vi.mock('@/services/pix_automatico.service', async (original) => ({
  ...(await original<typeof import('@/services/pix_automatico.service')>()),
  fetchRegistrosPixConferencia: vi.fn(async () => ({ ok: true, registros: servico.registros })),
  inserirPixImportados: servico.inserir,
  aprovarPixEmLote: servico.aprovar,
  marcarComissaoPagaEmLote: servico.pagar,
}));

// Pessoas e setores: o `select` encadeado do supabase, resolvido no fim.
vi.mock('@/lib/supabase', () => {
  const tabela = (dados: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order']) q[m] = () => q;
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok);
    return q;
  };
  return {
    supabase: {
      from: (t: string) => tabela(t === 'perfis'
        ? [
            { id: 'ana', nome: 'Ana Silva', usuario: 'ana_silva', email: 'ana@x.com', setor_id: 'dig', ativo: true, arquivado: false },
            { id: 'bia', nome: 'Bia Souza', usuario: 'bia_souza', email: 'bia@x.com', setor_id: 'rec', ativo: true, arquivado: false },
          ]
        : [{ id: 'dig', nome: 'Digital' }, { id: 'rec', nome: 'Receptivo' }]),
    },
  };
});

import { PixImportarDialog } from './PixImportarDialog';

// 01/10, 02/10, 03/10 e 06/10/2026 em serial do Excel.
const OUT = [46296, 46297, 46298, 46301];

function planilhaDigital(): File {
  const ws = utils.aoa_to_sheet([
    ['codigo', 'Data ', 'Operador', 'nr ', 'Valor de Nota', '%', 'valor ', 'Meta batida-Pendente ', 'PIX', 'SIT'],
    [1, OUT[0], 'ana_silva', 111, 1000, 0.005, 5, 5, '', 'pg'],      // falta no Pix, pago
    [1, OUT[1], 'ana_silva', 222, 2000, 0.005, 10, 10, '', ''],      // falta no Pix
    [1, OUT[2], 'ana_silva', 333, 3000, 0.005, 15, 15, '', 'PG'],    // pendente no Pix, pago
    [1, OUT[3], 'ana_silva', 444, 4000, 0.005, 20, 20, '', 'pg'],    // com a Bia neste mês
  ]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet([['Rótulos', 'Soma']]), 'Tabela dinâmica 1');
  utils.book_append_sheet(wb, ws, 'OUTUBRO PIX AUTOMATICO');
  utils.book_append_sheet(wb, utils.aoa_to_sheet([
    ['codigo', 'Data ', 'Operador', 'nr ', 'Valor de Nota', '%', 'valor ', 'Meta batida-Pendente ', 'PIX'],
    [1, 46332, 'ana_silva', 555, 500, 0.005, 2.5, 2.5, ''],
  ]), 'PIX AUTOMATICO NOVEMBRO');
  const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const arquivo = new File([buf], 'Pix automaticos EQUIPE DIGITAL.xlsx');
  // jsdom antigo não tem `File.arrayBuffer`.
  Object.defineProperty(arquivo, 'arrayBuffer', { value: async () => buf });
  return arquivo;
}

const registro = (r: Partial<RegistroPixConferencia>): RegistroPixConferencia => ({
  id: 'r', nr_cliente: '', operador_id: 'ana', operador_nome: 'Ana Silva', setor_id: 'dig',
  valor: 0, status: 'pendente', pago: false, criado_em: '2026-10-03T15:00:00Z', pct_comissao: null, ...r,
});

function pix(extra: Partial<PixTela> = {}): PixTela {
  return {
    empresa: { id: 'emp' }, perfil: { id: 'lider', nome: 'Líder', email: 'l@x.com' },
    mes: '2026-10', noMesAtual: false, diaNovo: '2026-10-31',
    fechamento: { impedir: () => false }, setorEscopo: null, setorFoco: null, clonesRef: { current: {} },
    carregar: vi.fn(async () => {}), pctPorSetor: { dig: 0.5, rec: 0.25 }, podeAprovar: true, setMes: vi.fn(),
    ...extra,
  } as unknown as PixTela;
}

async function abrirComPlanilha(p = pix()) {
  const user = userEvent.setup();
  render(<PixImportarDialog pix={p} aberto onAbertoChange={() => {}} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, planilhaDigital());
  await screen.findByText(/registros no Pix da empresa/);
  return user;
}

describe('PixImportarDialog', () => {
  beforeEach(() => {
    servico.registros = [
      registro({ id: 'r3', nr_cliente: '333', valor: 3000 }),
      registro({ id: 'r4', nr_cliente: '444', operador_id: 'bia', operador_nome: 'Bia Souza', setor_id: 'rec', valor: 4000, status: 'aprovado', pago: true }),
    ];
    servico.inserir.mockReset().mockImplementation(async (_e: string, linhas: { ref: string }[]) => ({
      importados: linhas.map(l => ({ ref: l.ref, id: `novo-${l.ref}` })), falhas: [],
    }));
    servico.aprovar.mockReset().mockResolvedValue({ ok: true, count: 2 });
    servico.pagar.mockReset().mockResolvedValue({ ok: true, count: 2 });
  });

  it('abre a aba do mês, pula a que não é do Pix e separa as situações', async () => {
    await abrirComPlanilha();
    const aba = screen.getByRole('combobox') as HTMLSelectElement;
    expect(aba.value).toBe('OUTUBRO PIX AUTOMATICO');
    // «Tabela dinâmica» fica fora; cada aba diz o mês, as linhas e as pagas.
    expect(within(aba).getAllByRole('option').map(o => o.textContent)).toEqual([
      'OUTUBRO PIX AUTOMATICO · out/2026 · 4 linhas, 3 pagas',
      'PIX AUTOMATICO NOVEMBRO · nov/2026 · 1 linha, 0 pagas',
    ]);

    const situacoes = screen.getByRole('group', { name: 'Situação das linhas' });
    const contagem = (rotulo: RegExp) =>
      within(situacoes).getByRole('button', { name: rotulo }).textContent?.match(/^\d+/)?.[0];
    expect(contagem(/Faltando no Pix/)).toBe('2');
    expect(contagem(/Repetidos/)).toBe('1');
    expect(contagem(/Pagamento a acertar/)).toBe('1');
    expect(screen.getByText('Não está no Pix · pago na planilha («pg»): entra aprovado e pago')).toBeInTheDocument();
  });

  it('«Aplicar»: lança o que falta com a data da linha, aprova e paga o que a planilha pagou', async () => {
    const p = pix();
    const user = await abrirComPlanilha(p);
    await user.click(screen.getByRole('button', { name: /Aplicar 3/ }));

    await waitFor(() => expect(servico.pagar).toHaveBeenCalled());
    // Só as duas que faltam; a do NR com a Bia não entra.
    expect(servico.inserir).toHaveBeenCalledTimes(1);
    const [, linhas] = servico.inserir.mock.calls[0];
    expect(linhas).toEqual([
      expect.objectContaining({ ref: '2', nrCliente: '111', valor: 1000, operadorId: 'ana', setorId: 'dig', dia: '2026-10-01' }),
      expect.objectContaining({ ref: '3', nrCliente: '222', valor: 2000, operadorId: 'ana', setorId: 'dig', dia: '2026-10-02' }),
    ]);
    // Aprova a nova paga e a pendente do Pix, com o % do setor; paga as duas.
    expect(servico.aprovar).toHaveBeenCalledWith(expect.objectContaining({
      ids: ['novo-2', 'r3'], pctAtual: 0.5, avaliadorId: 'lider',
    }));
    expect(servico.pagar).toHaveBeenCalledWith(expect.objectContaining({ ids: ['novo-2', 'r3'], responsavelId: 'lider' }));
    expect(p.carregar).toHaveBeenCalled();
  });

  it('sem permissão de aprovar: a paga entra pendente e nada é aprovado nem pago', async () => {
    const user = await abrirComPlanilha(pix({ podeAprovar: false }));
    // O acerto do pendente fica sem ação: só as duas que faltam.
    await user.click(screen.getByRole('button', { name: /Aplicar 2/ }));
    await waitFor(() => expect(servico.inserir).toHaveBeenCalled());
    expect(servico.aprovar).not.toHaveBeenCalled();
    expect(servico.pagar).not.toHaveBeenCalled();
  });

  it('mês fechado: não grava nada', async () => {
    const user = await abrirComPlanilha(pix({ fechamento: { impedir: () => true } } as Partial<PixTela>));
    await user.click(screen.getByRole('button', { name: /Aplicar 3/ }));
    expect(servico.inserir).not.toHaveBeenCalled();
  });

  it('aba de outro mês: oferece trocar o mês da tela', async () => {
    const p = pix({ mes: '2026-11' });
    const user = await abrirComPlanilha(p);
    // Com novembro na tela, abre a de novembro; escolher a de outubro avisa.
    const aba = screen.getByRole('combobox') as HTMLSelectElement;
    expect(aba.value).toBe('PIX AUTOMATICO NOVEMBRO');
    await user.selectOptions(aba, 'OUTUBRO PIX AUTOMATICO');
    expect(screen.getByText(/é de outubro 2026, e a tela está em novembro 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ver outubro/i }));
    expect(p.setMes).toHaveBeenCalledWith('2026-10');
  });
});
