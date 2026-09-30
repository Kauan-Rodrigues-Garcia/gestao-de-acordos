/**
 * O calendário de reagendar na aba Acordos — o caso que o usuário testou em
 * 29/09/2026: «acordo com parcelamento no boleto, não reagendei quando abriu a
 * caixinha, e na lista de acordos não aparece nenhum botão».
 *
 * A aba Acordos nunca teve o botão: só o Dashboard. Agora é o mesmo ícone da
 * lista da PaguePlay, em azul, na coluna de ações.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Acordo } from '@/lib/supabase';
import { AcordosTableBody } from '../AcordosTableBody';
import { chaveParcela } from '@/services/reagendamento/reagendamento';

// Os editores inline puxam Supabase, auth e metade do app; aqui só a linha importa.
vi.mock('@/components/AcordoNovoInline', () => ({ AcordoNovoInline: () => null }));
vi.mock('@/components/AcordoEditInline', () => ({ AcordoEditInline: () => null }));
vi.mock('@/components/AcordoDetalheInline', () => ({ AcordoDetalheInline: () => null }));

function acordo(over: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a1', nome_cliente: 'Cliente Boleto', nr_cliente: '123', data_cadastro: '2026-09-01',
    vencimento: '2026-09-10', valor: 100, tipo: 'boleto', parcelas: 3, whatsapp: null,
    status: 'pago', operador_id: 'op-1', setor_id: null, empresa_id: 'e1', observacoes: null,
    estado_uf: null, instituicao: null, acordo_grupo_id: 'G1', numero_parcela: 1,
    criado_em: '2026-09-01T10:00:00Z', atualizado_em: '2026-09-01T10:00:00Z',
    ...over,
  } as Acordo;
}

function montar(over: {
  linhas?: Acordo[]; isPP?: boolean; podeAgendar?: boolean; existentes?: string[];
  setReagendar?: (a: Acordo | null) => void; mostrarColunaOperador?: boolean;
} = {}) {
  const linhas = over.linhas ?? [acordo()];
  const setReagendar = over.setReagendar ?? vi.fn();
  render(
    <table>
      <AcordosTableBody
        acordosParaExibir={linhas} acordosCount={linhas.length} isPP={over.isPP ?? false}
        colSpanFull={10} mostrarColunaOperador={over.mostrarColunaOperador ?? false}
        podeEditar podeExcluir novoInlineAberto={false} hoje="2026-09-29"
        highlightedId={null} selecionados={[]} editandoInlineId={null} detalheInlineId={null}
        atualizandoStatus={null} excluindoId={null} operadoresMap={{ 'op-1': 'Usuário 1' }}
        empresaTags={[]} temFiltros={false}
        selecionarTodos={vi.fn()} toggleSelecionado={vi.fn()} alternarDia={vi.fn()} setNovoInlineAberto={vi.fn()}
        addAcordo={vi.fn()} removeAcordo={vi.fn()} patchAcordo={vi.fn()}
        setEditandoInlineId={vi.fn()} setDetalheInlineId={vi.fn()}
        marcarComoPago={vi.fn()}
        podeAgendar={over.podeAgendar ?? true}
        parcelasExistentes={new Set(over.existentes ?? [chaveParcela('G1', 1)])}
        setReagendarAcordo={setReagendar}
        enviarUmWhatsapp={vi.fn()} setConfirmandoExclusao={vi.fn()} limparFiltros={vi.fn()}
      />
    </table>,
  );
  return { setReagendar };
}

describe('aba Acordos — o botão aparece', () => {
  it('boleto parcelado sem a parcela 2: o calendário aparece na linha', () => {
    montar();
    expect(screen.getByRole('button', { name: /^Reagendar parcela 2\/3/ })).toBeTruthy();
  });


  it('PaguePlay também', () => {
    montar({ isPP: true });
    expect(screen.getByRole('button', { name: /^Reagendar parcela 2\/3/ })).toBeTruthy();
  });

  it('o clique abre o reagendamento DAQUELE acordo', () => {
    const { setReagendar } = montar();
    fireEvent.click(screen.getByRole('button', { name: /^Reagendar parcela 2\/3/ }));
    expect(setReagendar).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('na visão ampla, a dica diz em nome de quem a parcela nasce', () => {
    montar({ mostrarColunaOperador: true });
    expect(screen.getByRole('button', { name: /no nome de Usuário 1/ })).toBeTruthy();
  });
});

describe('aba Acordos — o botão NÃO aparece', () => {
  it('10x com a parcela atual ainda em Verificar', () => {
    montar({ linhas: [acordo({ parcelas: 10, status: 'verificar_pendente' })] });
    expect(screen.queryByRole('button', { name: /Reagendar parcela/ })).toBeNull();
  });

  it('parcela atual Não paga', () => {
    montar({ linhas: [acordo({ status: 'nao_pago' })] });
    expect(screen.queryByRole('button', { name: /Reagendar parcela/ })).toBeNull();
  });

  it('quando a parcela 2 já existe', () => {
    montar({ existentes: [chaveParcela('G1', 1), chaveParcela('G1', 2)] });
    expect(screen.queryByRole('button', { name: /Reagendar parcela/ })).toBeNull();
  });

  it('sem a permissão de editar acordos', () => {
    montar({ podeAgendar: false });
    expect(screen.queryByRole('button', { name: /Reagendar parcela/ })).toBeNull();
  });

  it('em PIX Automático', () => {
    montar({ linhas: [acordo({ tipo: 'pix_automatico' as Acordo['tipo'] })] });
    expect(screen.queryByRole('button', { name: /Reagendar parcela/ })).toBeNull();
  });

  it('em acordo de parcela única', () => {
    montar({ linhas: [acordo({ parcelas: 1 })] });
    expect(screen.queryByRole('button', { name: /Reagendar parcela/ })).toBeNull();
  });
});

describe('o botão é o ícone azul, não um rótulo', () => {
  it('só o ícone: sem texto visível, em azul', () => {
    montar();
    const b = screen.getByRole('button', { name: /^Reagendar parcela 2\/3/ });
    expect(b.textContent).toBe('');
    expect(b.className).toContain('text-blue-600');
  });
});

describe('coluna Parcelas da BookPlay', () => {
  it('Pix e Cartão parcelados mostram n/total — antes era «—»', () => {
    montar({ linhas: [acordo({ tipo: 'cartao' as Acordo['tipo'], numero_parcela: 2 })],
             existentes: [chaveParcela('G1', 2)] });
    expect(screen.getByText('2/3')).toBeTruthy();
  });
});
