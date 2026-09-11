/**
 * PainelComissao.test.tsx — a comissão do próprio operador, no menu lateral.
 *
 * Os dados vêm de `useMinhaComissao`, trocado aqui por um dublê: o que se testa
 * é o painel — o mês que ele pede, a navegação, o fechar e o que diz quando a
 * comissão não existe no banco.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { calcularComissao, type ConfigComissao } from '@/services/comissao/comissao';
import { mesAtual, deslocarMes } from '@/lib/mesReferencia';
import type { MinhaComissao } from '@/services/comissao/useMinhaComissao';

const { useMinhaComissao } = vi.hoisted(() => ({ useMinhaComissao: vi.fn() }));
vi.mock('@/services/comissao/useMinhaComissao', () => ({ useMinhaComissao }));

import { PainelComissao } from './PainelComissao';

function config(): ConfigComissao {
  return {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null, ano: 2026, mes: 9,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: null },
      { ordem: 2, pct: 2.11, pctEspecial: null },
      { ordem: 3, pct: 3.30, pctEspecial: null },
    ],
  };
}

function estado(over: Partial<MinhaComissao> = {}): MinhaComissao {
  const cfg = config();
  return {
    podeVer: true,
    carregando: false,
    dbAtiva: true,
    isPaguePlay: false,
    resultado: calcularComissao({
      metaBruta: 34_000, metasExtrasBrutas: [37_000, 40_000], metaIndiretaBruta: null,
      recebidoDireto: 38_450, recebidoIndiretoBruto: 0, fatorUnidade: 1,
      config: cfg, doSetor: cfg,
    }),
    recarregar: vi.fn(),
    ...over,
  };
}

const texto = () => (document.body.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  useMinhaComissao.mockReset();
  useMinhaComissao.mockReturnValue(estado());
});

describe('PainelComissao', () => {
  it('fechado, não desenha e não pede dados', () => {
    render(<PainelComissao aberto={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useMinhaComissao).toHaveBeenLastCalledWith(expect.objectContaining({ aberto: false }));
  });

  it('aberto, mostra a comissão do mês atual com as faixas', () => {
    render(<PainelComissao aberto onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Minha comissão' })).toBeInTheDocument();
    expect(useMinhaComissao).toHaveBeenLastCalledWith({ aberto: true, mes: mesAtual() });
    expect(screen.getByRole('list', { name: /Faixas de comissão/ })).toBeInTheDocument();
    expect(texto()).toMatch(/Comissão atual\s?R\$\s?811,30/);
  });

  it('volta um mês e não passa do mês atual', () => {
    render(<PainelComissao aberto onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(useMinhaComissao).toHaveBeenLastCalledWith({ aberto: true, mes: deslocarMes(mesAtual(), -1) });
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeEnabled();
  });

  it('mês que já passou fala em «faltou»', () => {
    render(<PainelComissao aberto onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(texto()).toMatch(/Faltou R\$/);
  });

  it('Esc fecha', () => {
    const onClose = vi.fn();
    render(<PainelComissao aberto onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('sem a comissão no banco, diz que ainda não está disponível', () => {
    useMinhaComissao.mockReturnValue(estado({ dbAtiva: false, resultado: null }));
    render(<PainelComissao aberto onClose={vi.fn()} />);
    expect(texto()).toContain('A comissão ainda não está disponível.');
  });

  it('na PaguePlay, avisa que os valores estão em H.O.', () => {
    useMinhaComissao.mockReturnValue(estado({ isPaguePlay: true }));
    render(<PainelComissao aberto onClose={vi.fn()} />);
    expect(texto()).toContain('valores em H.O.');
  });
});
