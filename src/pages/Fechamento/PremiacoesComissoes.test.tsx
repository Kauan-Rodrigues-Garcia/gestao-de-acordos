/**
 * PremiacoesComissoes.test.tsx — as correções de 18/09/2026 na tela.
 *
 * Recorte de Birigui mostra só Premiação (coluna e card), o de todos os setores
 * mostra as duas, e o valor de quem bateu sai em destaque com a meta escrita.
 * 19/09/2026: o destaque é o selo verde, em tamanho médio.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LinhaPremiacao } from '@/services/premiacoes/calculoPremiacoes';
import { resumirPremiacoes } from '@/services/premiacoes/calculoPremiacoes';
import { PremiacoesComissoes } from './PremiacoesComissoes';

const linhasRef: { current: LinhaPremiacao[] } = { current: [] };

vi.mock('@/hooks/usePremiacoesComissoes', () => ({
  usePremiacoesComissoes: () => ({
    linhas: linhasRef.current,
    resumo: resumirPremiacoes(linhasRef.current),
    carregando: false,
    atualizando: false,
    erro: null,
    disponivel: true,
    comissaoAtiva: true,
    salvandoId: null,
    salvarCracha: vi.fn(),
    recarregar: vi.fn(),
  }),
}));

function linha(p: Partial<LinhaPremiacao>): LinhaPremiacao {
  return {
    operadorId: 'op1', nome: 'Ana Rocha', equipeNome: null, setorId: 's1', setorNome: 'Receptivo',
    celula: 'Birigui', tipo: 'premiacao', cracha: '1001',
    comissao: null, premiacao: 811.3, estado: 'bateu', faixa: 2, obs: '2ª meta',
    ...p,
  };
}

function montar(linhas: LinhaPremiacao[]) {
  linhasRef.current = linhas;
  render(
    <PremiacoesComissoes
      empresaId="e1" empresaNome="BookPlay" mes="2026-08" setorId="s1" setorNome="Receptivo"
      nomesDosSetores={new Map()} podeEditar={false}
    />,
  );
}

describe('<PremiacoesComissoes />', () => {
  it('Birigui: só a coluna e o card de Premiação, sem Comissão', () => {
    montar([linha({}), linha({ operadorId: 'op2', nome: 'Bia Souza', premiacao: 0, estado: 'nao_bateu', faixa: null })]);
    expect(screen.getByText('Premiação (R$)')).toBeTruthy();
    expect(screen.queryByText('Comissão (R$)')).toBeNull();
    expect(screen.getByText('Premiação · Birigui')).toBeTruthy();
    expect(screen.queryByText(/^Comissão ·/)).toBeNull();
    // No lugar do «Total a pagar», quantos bateram.
    expect(screen.getByText('Bateram a meta')).toBeTruthy();
    expect(screen.queryByText('Total a pagar')).toBeNull();
  });

  it('quem bateu: valor em verde, tamanho médio, e a meta no selo de resultado', () => {
    montar([linha({ obs: '2ª meta · benefício do setor' })]);
    const valor = screen.getAllByText(/811,30/).find(e => e.className.includes('text-success'));
    expect(valor).toBeTruthy();
    expect(valor!.className).toContain('text-[13px]');
    expect(valor!.className).toContain('font-semibold');
    // 15/10/2026: a meta fica só no selo; a Observação não a repete.
    expect(screen.getAllByText('2ª meta').filter(e => e.className.includes('rounded-full'))).toHaveLength(1);
    expect(screen.getByText('benefício do setor')).toBeTruthy();
  });

  it('vários setores: resumo por setor e subtotal no detalhamento', () => {
    montar([
      linha({}),
      linha({ operadorId: 'op2', nome: 'Bia', setorId: 's2', setorNome: 'Play 2', premiacao: 0, estado: 'nao_bateu', faixa: null, obs: 'Não bateu a 1ª meta' }),
    ]);
    expect(screen.getByText('Resultado por setor')).toBeTruthy();
    expect(screen.getByText('Por meta atingida')).toBeTruthy();
    expect(screen.getAllByText('1 de 1 bateram').length).toBeGreaterThan(0);
    expect(screen.getByText('Não bateu')).toBeTruthy();
  });

  it('todos os setores com as duas cidades: as duas colunas e o total a pagar', () => {
    montar([
      linha({}),
      linha({ operadorId: 'op3', nome: 'Bruno', setorId: 's4', setorNome: 'Play 4', celula: 'Marília', tipo: 'comissao', comissao: 500, premiacao: null }),
    ]);
    expect(screen.getByText('Premiação (R$)')).toBeTruthy();
    expect(screen.getByText('Comissão (R$)')).toBeTruthy();
    expect(screen.getByText('Total a pagar')).toBeTruthy();
  });
});
