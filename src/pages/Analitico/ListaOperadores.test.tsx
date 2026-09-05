// src/pages/Analitico/ListaOperadores.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListaOperadores } from './ListaOperadores';
import type { LinhaOperadorPainel } from './linhaOperador';

const ana: LinhaOperadorPainel = {
  operador_id: 'a', usuario: 'ana.silva', nome: 'Ana Silva',
  equipeId: 'eq-1', equipeNome: 'Play 1',
  valor: 750, ho: 200, pagamentos: 4, novos: 0,
  porForma: [{ rotulo: 'Pix', valor: 750 }],
};
const bruno: LinhaOperadorPainel = {
  operador_id: 'b', usuario: 'bruno.lima', nome: 'Bruno Lima',
  equipeId: 'eq-1', equipeNome: 'Play 1',
  valor: 250, ho: 50, pagamentos: 2, novos: 3,
  porForma: [{ rotulo: 'Cartão', valor: 250 }],
};
const grupos = [{ equipeId: 'eq-1', equipeNome: 'Play 1', itens: [ana, bruno] }];

describe('ListaOperadores', () => {
  it('desenha o nome da equipe e os operadores', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={vi.fn()} renderExpandido={() => null} />,
    );
    expect(screen.getByText('Play 1')).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('a barra mede a fatia dentro da equipe, não da empresa', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={vi.fn()} renderExpandido={() => null} />,
    );
    expect(screen.getByTestId('barra-a')).toHaveStyle({ width: '75%' });
    expect(screen.getByTestId('barra-b')).toHaveStyle({ width: '25%' });
  });

  it('a contagem de novos só aparece quando existe', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={vi.fn()} renderExpandido={() => null} />,
    );
    expect(screen.getByText('+3 novos')).toBeInTheDocument();
    expect(screen.queryByText('+0 novos')).not.toBeInTheDocument();
  });

  it('clicar na linha avisa quem abre', () => {
    const onToggle = vi.fn();
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={onToggle} renderExpandido={() => null} />,
    );
    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('só o expandido renderiza o conteúdo de dentro', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set(['a'])} onToggle={vi.fn()}
        renderExpandido={l => <div>detalhe de {l.usuario}</div>} />,
    );
    expect(screen.getByText('detalhe de ana.silva')).toBeInTheDocument();
    expect(screen.queryByText('detalhe de bruno.lima')).not.toBeInTheDocument();
  });
});
