/**
 * VinculoTag.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre a árvore de decisão do componente (5 ramos + 1 guarda de mutual
 * exclusão). Esse componente é CRÍTICO porque reproduzir tag duplicada
 * foi exatamente o bug que o usuário reportou em 2026-04-21.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VinculoTag } from './VinculoTag';
import type { Acordo } from '@/lib/supabase';
import type { AcordoComVinculo } from '@/lib/deduplicarVinculados';

function base(p: Partial<Acordo> = {}): Acordo {
  return {
    id: 'a1', nome_cliente: 'X', nr_cliente: '1', data_cadastro: '2026-04-01',
    vencimento: '2026-04-30', valor: 0, tipo: 'boleto', parcelas: 1,
    whatsapp: null, status: 'agendado', operador_id: 'op1', setor_id: null,
    empresa_id: 'e1', observacoes: null, instituicao: null,
    tipo_vinculo: 'direto', vinculo_operador_id: null, vinculo_operador_nome: null,
    criado_em: '', atualizado_em: '', ...p,
  } as Acordo;
}

describe('<VinculoTag />', () => {
  it('não renderiza nada para acordo direto sem vínculo', () => {
    const { container } = render(<VinculoTag acordo={base({ tipo_vinculo: 'direto' })} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza tag azul "Vínculo" quando _vinculoDuplo=true (prioridade 1)', () => {
    const acordo: AcordoComVinculo = {
      ...base({ tipo_vinculo: 'direto' }),
      _vinculoDuplo: true,
      _vinculoExtraOperadorNome: 'Maria',
    };
    render(<VinculoTag acordo={acordo} />);
    const tag = screen.getByText(/vínculo/i);
    expect(tag).toBeInTheDocument();
    expect(tag.closest('span')).toHaveClass('text-sky-700');
    expect(tag.closest('span')).toHaveAttribute('title', expect.stringContaining('Maria'));
  });

  it('renderiza tag azul "Vínculo" quando direto tem vinculo_operador_nome (prioridade 2)', () => {
    render(<VinculoTag acordo={base({ tipo_vinculo: 'direto', vinculo_operador_nome: 'João' })} />);
    const tag = screen.getByText(/vínculo/i);
    expect(tag.closest('span')).toHaveClass('text-sky-700');
    expect(tag.closest('span')).toHaveAttribute('title', expect.stringContaining('João'));
  });

  it('renderiza tag âmbar "Extra" quando tipo_vinculo=extra (prioridade 3)', () => {
    render(<VinculoTag acordo={base({ tipo_vinculo: 'extra', vinculo_operador_nome: 'João' })} />);
    const tag = screen.getByText(/extra/i);
    expect(tag.closest('span')).toHaveClass('text-amber-700');
    expect(tag.closest('span')).toHaveAttribute('title', expect.stringContaining('João'));
  });

  it('GARANTE mutua exclusão: acordo com _vinculoDuplo E tipo=extra renderiza UMA só tag (azul)', () => {
    // Esta é a regressão que o usuário relatou: antes apareciam "Vínculo" + "Direto+Extra"
    // ao mesmo tempo. Agora deve ser APENAS uma tag azul.
    const acordo: AcordoComVinculo = {
      ...base({ tipo_vinculo: 'direto', vinculo_operador_nome: 'Maria' }),
      _vinculoDuplo: true,
      _vinculoExtraOperadorNome: 'Maria',
    };
    const { container } = render(<VinculoTag acordo={acordo} />);
    const spans = container.querySelectorAll('span');
    // Apenas UM <span> de tag na raiz (ignoramos o ícone que também é svg não span)
    const tagSpans = Array.from(spans).filter(
      s => s.textContent?.toLowerCase().includes('vínculo') || s.textContent?.toLowerCase().includes('extra'),
    );
    expect(tagSpans).toHaveLength(1);
    expect(tagSpans[0]).toHaveClass('text-sky-700');
    expect(tagSpans[0].textContent?.toLowerCase()).toContain('vínculo');
    // Não deve haver tag "Direto+Extra" em lugar algum.
    expect(container.textContent?.toLowerCase()).not.toContain('direto+extra');
  });

  it('usa tooltip "Acordo Extra" quando tipo=extra sem vinculo_operador_nome', () => {
    render(<VinculoTag acordo={base({ tipo_vinculo: 'extra', vinculo_operador_nome: null })} />);
    expect(screen.getByText(/extra/i).closest('span')).toHaveAttribute('title', 'Acordo Extra');
  });
});
