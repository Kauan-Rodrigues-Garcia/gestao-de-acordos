/**
 * MenuLateralEditor.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * O bug: o diálogo não abria. Nada de erro de rede, nada de permissão — ele
 * simplesmente não aparecia, e o console mostrava uma exceção do Radix.
 *
 * A causa: a ordem geral é a linha de `cargo = ''` no banco, e esse `''` foi
 * parar direto num `<SelectItem value="">`. Para o Radix, string vazia
 * significa «sem seleção» — é assim que o placeholder existe —, então ele
 * **lança** quando um item usa esse valor. A exceção acontece no render, e
 * derruba o diálogo inteiro antes de qualquer coisa aparecer.
 *
 * Os testes abaixo renderizam o componente de verdade. Um teste de unidade da
 * lógica de ordenação nunca pegaria isto: a lógica estava certa, quem quebrava
 * era o desenho.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MenuLateralEditor } from './MenuLateralEditor';
import { CARGO_GERAL } from '@/services/menuLateral.service';

function montar(over: Partial<Parameters<typeof MenuLateralEditor>[0]> = {}) {
  return render(
    <MenuLateralEditor
      aberto
      onFechar={() => {}}
      empresaId="emp-1"
      perfilId="p-1"
      ordens={{}}
      produto="cobranca"
      isPaguePlay={false}
      isBookplay
      valorDoCargo={() => true}
      ticketsLiberadoParaLideranca
      aoSalvar={() => {}}
      {...over}
    />,
  );
}

describe('<MenuLateralEditor />', () => {
  it('abre sem lançar — nenhum item do seletor usa valor vazio', () => {
    // O teste que existe pelo bug: se algum `SelectItem` voltar a receber
    // `value=""`, o Radix lança aqui e o `render` falha.
    expect(() => montar()).not.toThrow();
    expect(screen.getByText('Menu lateral por cargo')).toBeInTheDocument();
  });

  it('a prévia desenha as abas do cargo, com rótulo e ícone', () => {
    montar();
    // Com `valorDoCargo` respondendo sim para tudo e a visão de super_admin, a
    // prévia da ordem geral mostra o menu inteiro.
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
  });

  it('respeita a ordem salva da empresa', () => {
    montar({ ordens: { [CARGO_GERAL]: ['/admin/configuracoes', '/'] } });
    const rotulos = screen.getAllByText(/Dashboard|Configurações/)
      .map(n => n.textContent);
    expect(rotulos.indexOf('Configurações')).toBeLessThan(rotulos.indexOf('Dashboard'));
  });

  it('com todas as permissões negadas, a ordem geral ainda mostra o Dashboard', () => {
    /*
     * Não é falha da prévia — é a régua respondendo certo.
     *
     * A ordem geral é desenhada do ponto de vista de quem enxerga tudo (é o
     * único que dá onde posicionar cada aba), e o Dashboard não declara
     * `permissaoKey`: quem responde por ele é a lista de cargos, que o
     * super_admin sempre atravessa. Negar permissão não some com ele.
     *
     * O estado «este cargo não enxerga nenhuma aba» existe e está coberto em
     * `lib/menuLateral.test.ts`, no nível em que ele é decidido.
     */
    montar({ valorDoCargo: () => false });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
  });

  it('fechado, não renderiza nada', () => {
    const aoSalvar = vi.fn();
    montar({ aberto: false, aoSalvar });
    expect(screen.queryByText('Menu lateral por cargo')).not.toBeInTheDocument();
    expect(aoSalvar).not.toHaveBeenCalled();
  });
});
