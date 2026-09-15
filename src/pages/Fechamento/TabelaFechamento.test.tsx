/**
 * TabelaFechamento.test.tsx — as duas colunas que a gerência preenche.
 *
 * O D.U. grava ao sair do campo, e só quando mudou. Esc desiste. Valor fora de
 * 0 a 31 não grava e avisa. Sem permissão, nada vira campo.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabelaFechamento } from './TabelaFechamento';
import type { LinhaFechamento } from '@/services/fechamentoOperadores/calculoFechamento';

function linha(p: Partial<LinhaFechamento> = {}): LinhaFechamento {
  return {
    operadorId: 'op1', nome: 'João', equipeNome: 'Play 1',
    fechamento: 201_000, meta: 130_000, metasExtras: [150_000, 170_000, 200_000],
    duTrabalhado: null, situacao: null,
    metaAtingida: 4, alcance: 201_000 / 130_000, quartil: 1, projecao: 155, mediaPorDu: null,
    ...p,
  };
}

function montar(p: Partial<LinhaFechamento> = {}, podeEditar = true) {
  const onSalvar = vi.fn();
  const onInvalido = vi.fn();
  render(
    <TabelaFechamento
      linhas={[linha(p)]} podeEditar={podeEditar} salvandoId={null}
      onSalvar={onSalvar} onInvalido={onInvalido}
    />,
  );
  return { onSalvar, onInvalido };
}

describe('<TabelaFechamento />', () => {
  it('mostra os automáticos como a planilha: alcance, meta atingida e quartil', () => {
    montar();
    expect(screen.getByText('154,62%')).toBeTruthy();
    expect(screen.getByText('4ª META')).toBeTruthy();
    expect(screen.getByText('1º quartil')).toBeTruthy();
  });

  it('D.U. grava ao sair do campo, com a situação que já estava na linha', () => {
    const { onSalvar } = montar({ situacao: 'assiduo' });
    const campo = screen.getByLabelText('D.U. trabalhado de João');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '16' } });
    fireEvent.blur(campo);
    expect(onSalvar).toHaveBeenCalledWith('op1', { duTrabalhado: 16, situacao: 'assiduo' });
  });

  it('sair sem mudar não grava', () => {
    const { onSalvar } = montar({ duTrabalhado: 16 });
    const campo = screen.getByLabelText('D.U. trabalhado de João');
    fireEvent.focus(campo);
    fireEvent.blur(campo);
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('Esc desiste do que foi digitado', () => {
    const { onSalvar } = montar({ duTrabalhado: 16 });
    const campo = screen.getByLabelText('D.U. trabalhado de João') as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '9' } });
    fireEvent.keyDown(campo, { key: 'Escape' });
    fireEvent.blur(campo);
    expect(onSalvar).not.toHaveBeenCalled();
    expect(campo.value).toBe('16');
  });

  it('apagar o D.U. grava vazio', () => {
    const { onSalvar } = montar({ duTrabalhado: 16 });
    const campo = screen.getByLabelText('D.U. trabalhado de João');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.blur(campo);
    expect(onSalvar).toHaveBeenCalledWith('op1', { duTrabalhado: null, situacao: null });
  });

  it('acima de 31 não grava e avisa', () => {
    const { onSalvar, onInvalido } = montar();
    const campo = screen.getByLabelText('D.U. trabalhado de João');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '45' } });
    fireEvent.blur(campo);
    expect(onSalvar).not.toHaveBeenCalled();
    expect(onInvalido).toHaveBeenCalled();
  });

  it('sem permissão, D.U. e situação são só leitura', () => {
    montar({ duTrabalhado: 12, situacao: 'ferias' }, false);
    expect(screen.queryByLabelText('D.U. trabalhado de João')).toBeNull();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('FÉRIAS')).toBeTruthy();
  });
});
