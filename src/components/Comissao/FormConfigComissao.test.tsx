/**
 * FormConfigComissao.test.tsx — o prêmio em reais (26/10/2026).
 *
 * A conta tem teste próprio (`premio.test.ts`). Aqui: a faixa com meta comum
 * mostra o prêmio e grava o percentual dele; a faixa com metas diferentes
 * continua no percentual; e «Preencher por» escolhe entre valor e porcentagem.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { __resetCacheParaTestes } from '@/lib/cacheInstantaneo';
import type { ConfigComissao } from '@/services/comissao/comissao';
import { FormConfigComissao } from './FormConfigComissao';

const { salvarConfig } = vi.hoisted(() => ({
  salvarConfig: vi.fn(async (_payload: unknown) => ({ ok: true, dados: 'cfg' })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/services/comissao/comissao.service', () => ({ salvarConfig }));

const config: ConfigComissao = {
  id: 'matheus', empresaId: 'e', setorId: 's', equipeId: null, subgrupoId: null, pessoasDoSubgrupo: [],
  grupoUsuarios: true, usuarioIds: ['m'], ano: 2026, mes: 10, modoIndireta: 'junto',
  pctIndireta: null, pctIndiretaEspecial: null, regraSetor: 'nenhuma', multiplicador: null,
  setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
  faixas: [
    { ordem: 1, pct: 0.333333, pctEspecial: 0.366667 },
    { ordem: 2, pct: 0.4, pctEspecial: 0.448 },
  ],
};

function renderizar(metasReferencia?: (number | null)[]) {
  return render(
    <FormConfigComissao
      config={config}
      alvo={{ id: 'matheus', empresaId: 'e', setorId: 's', equipeId: null, grupoUsuarios: true, ano: 2026, mes: 10 }}
      ehPadrao={false}
      isPaguePlay={false}
      regraDoSetor="percentual_especial"
      desabilitado={false}
      metasReferencia={metasReferencia}
    />,
  );
}

beforeEach(() => {
  salvarConfig.mockClear();
  // A escolha «Preencher por» é lembrada; cada teste começa do padrão.
  __resetCacheParaTestes();
});

describe('FormConfigComissao — prêmio em reais', () => {
  it('mostra o prêmio na meta no lugar das seis casas', () => {
    renderizar([90_000, 100_000]);
    expect(screen.getByLabelText('Prêmio da 1ª Meta')).toHaveValue('300,00');
    expect(screen.getByLabelText('Prêmio da 2ª Meta quando o setor bate a meta')).toHaveValue('448,00');
    expect(screen.getByText('R$ 90.000,00')).toBeInTheDocument();
  });

  it('digitar o prêmio grava o percentual que o paga', async () => {
    renderizar([90_000, 100_000]);
    const campo = screen.getByLabelText('Prêmio da 1ª Meta');
    fireEvent.change(campo, { target: { value: '45000' } });
    expect(campo).toHaveValue('450,00');
    fireEvent.blur(campo);
    await waitFor(() => expect(salvarConfig).toHaveBeenCalledTimes(1));
    const payload = salvarConfig.mock.calls[0][0] as { faixas: { ordem: number; pct: number }[] };
    expect(payload.faixas[0]).toMatchObject({ ordem: 1, pct: 0.5 });
    expect(payload.faixas[1]).toMatchObject({ ordem: 2, pct: 0.4 });
  });

  it('faixa com metas diferentes continua no percentual', () => {
    renderizar([90_000, null]);
    expect(screen.getByLabelText('Prêmio da 1ª Meta')).toBeInTheDocument();
    expect(screen.getByLabelText('% normal da 2ª Meta')).toHaveValue('0,4');
    expect(screen.getByText('metas diferentes')).toBeInTheDocument();
  });

  it('«Preencher por» troca entre valor e porcentagem, nos dois sentidos', () => {
    renderizar([90_000, 100_000]);
    expect(screen.getByRole('button', { name: 'Valor (R$)' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Porcentagem (%)' }));
    expect(screen.getByLabelText('% normal da 1ª Meta')).toHaveValue('0,333333');
    expect(screen.queryByLabelText('Prêmio da 1ª Meta')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Valor (R$)' }));
    expect(screen.getByLabelText('Prêmio da 1ª Meta')).toHaveValue('300,00');
  });

  it('a escolha é lembrada na próxima vez que o formulário abre', () => {
    const { unmount } = renderizar([90_000, 100_000]);
    fireEvent.click(screen.getByRole('button', { name: 'Porcentagem (%)' }));
    unmount();
    renderizar([90_000, 100_000]);
    expect(screen.getByRole('button', { name: 'Porcentagem (%)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('% normal da 1ª Meta')).toBeInTheDocument();
  });

  it('sem meta comum, o valor fica desligado e vale a porcentagem', () => {
    renderizar(undefined);
    expect(screen.getByRole('button', { name: 'Valor (R$)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Porcentagem (%)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('% normal da 1ª Meta')).toBeInTheDocument();
  });
});
