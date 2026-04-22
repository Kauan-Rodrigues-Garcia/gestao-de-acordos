/**
 * OperadorCell.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre os 3 ramos da célula: normal, par deduplicado, direto com vínculo.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperadorCell } from './OperadorCell';
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';

function base(p: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a1', nome_cliente: 'X', nr_cliente: '1', data_cadastro: '',
    vencimento: '', valor: 0, tipo: 'boleto', parcelas: 1,
    whatsapp: null, status: 'agendado', operador_id: 'op1', setor_id: null,
    empresa_id: 'e1', observacoes: null, instituicao: null,
    tipo_vinculo: 'direto', vinculo_operador_id: null, vinculo_operador_nome: null,
    criado_em: '', atualizado_em: '', ...p,
  } as Acordo;
}

const MAP = { 'op1': 'João', 'op2': 'Maria', 'op3': 'Carlos' };

describe('<OperadorCell />', () => {
  it('mostra apenas o nome do operador direto quando não há vínculo', () => {
    const { container } = render(<OperadorCell acordo={base()} operadoresMap={MAP} />);
    expect(container.textContent).toBe('João');
  });

  it('mostra "—" quando operador_id é ausente', () => {
    const { container } = render(
      <OperadorCell acordo={base({ operador_id: undefined as unknown as string })} operadoresMap={MAP} />,
    );
    expect(container.textContent).toBe('—');
  });

  it('mostra "..." quando o operador_id não está no map', () => {
    const { container } = render(
      <OperadorCell acordo={base({ operador_id: 'op-desconhecido' })} operadoresMap={MAP} />,
    );
    expect(container.textContent).toBe('...');
  });

  it('mostra AMBOS os operadores quando par é deduplicado', () => {
    const acordo: AcordoComVinculo = {
      ...base({ operador_id: 'op1' }),
      _vinculoDuplo: true,
      _vinculoExtraOperadorId: 'op2',
      _vinculoExtraOperadorNome: 'Maria (fallback)',
    };
    render(<OperadorCell acordo={acordo} operadoresMap={MAP} />);
    expect(screen.getByText('João')).toBeInTheDocument();
    expect(screen.getByText('+ Maria')).toBeInTheDocument(); // preferiu o map sobre o fallback
  });

  it('usa _vinculoExtraOperadorNome como fallback quando id não está no map', () => {
    const acordo: AcordoComVinculo = {
      ...base({ operador_id: 'op1' }),
      _vinculoDuplo: true,
      _vinculoExtraOperadorId: 'op-desconhecido',
      _vinculoExtraOperadorNome: 'Maria (fallback)',
    };
    render(<OperadorCell acordo={acordo} operadoresMap={MAP} />);
    expect(screen.getByText('+ Maria (fallback)')).toBeInTheDocument();
  });

  it('mostra ambos operadores quando direto tem vinculo_operador_* mas NÃO foi deduplicado', () => {
    const acordo = base({
      operador_id: 'op1',
      tipo_vinculo: 'direto',
      vinculo_operador_id: 'op2',
      vinculo_operador_nome: 'Maria',
    });
    render(<OperadorCell acordo={acordo} operadoresMap={MAP} />);
    expect(screen.getByText('João')).toBeInTheDocument();
    expect(screen.getByText('+ Maria')).toBeInTheDocument();
  });

  it('não duplica quando vinculo_operador_id é igual ao operador_id (guarda defensiva)', () => {
    const acordo = base({
      operador_id: 'op1',
      vinculo_operador_id: 'op1',
      vinculo_operador_nome: 'Eu mesmo',
    });
    const { container } = render(<OperadorCell acordo={acordo} operadoresMap={MAP} />);
    expect(container.textContent).toBe('João'); // apenas 1 linha
  });
});
