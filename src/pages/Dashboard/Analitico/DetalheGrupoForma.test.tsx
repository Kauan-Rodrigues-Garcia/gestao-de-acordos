import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetalheGrupoForma } from './DetalheGrupoForma';
import { CHAVE_SEM_OPERADOR, fatiasDoGrupo, type GrupoFormas } from './agregacaoFormas';

const FORMAS = ['Pix', 'Boleto', 'Cartão'];

function grupo(chave: string, rotulo: string, porForma: Record<string, number>): GrupoFormas {
  const bruto = Object.values(porForma).reduce((s, v) => s + v, 0);
  return { chave, rotulo, detalhe: '', bruto, ho: 0, qtd: 1, porForma };
}

const ANA = grupo('ana', 'Ana', { Pix: 750, Boleto: 250 });
const ORFA = grupo(CHAVE_SEM_OPERADOR, 'Sem operador', { Cartao: 0, Boleto: 100 });

describe('fatiasDoGrupo', () => {
  it('ordena da maior para a menor, sem as zeradas, com a fatia em %', () => {
    expect(fatiasDoGrupo(ANA, FORMAS)).toEqual([
      { rotulo: 'Pix', valor: 750, share: 75 },
      { rotulo: 'Boleto', valor: 250, share: 25 },
    ]);
  });

  it('só considera as formas visíveis (os cards escolhidos)', () => {
    expect(fatiasDoGrupo(ANA, ['Boleto'])).toEqual([{ rotulo: 'Boleto', valor: 250, share: 100 }]);
  });

  it('linha sem valor nas formas visíveis não tem fatia', () => {
    expect(fatiasDoGrupo(ANA, ['Cartão'])).toEqual([]);
  });
});

describe('DetalheGrupoForma', () => {
  function renderLista() {
    return render(
      <DetalheGrupoForma
        grupos={[ANA, ORFA]} visiveis={20} formas={FORMAS}
        selecao={null} total={1100} unidade="operador"
      />,
    );
  }

  it('mostra total e forma principal na linha, e o rodapé soma o recorte', () => {
    renderLista();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('Pix 75%')).toBeTruthy();
    expect(screen.getByText('2 operadores')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Pix 75%, Boleto 25%' })).toBeTruthy();
  });

  it('a linha abre e mostra o valor de cada forma', () => {
    renderLista();
    const linha = screen.getByRole('button', { name: /Ana/ });
    expect(linha.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(linha);
    expect(linha.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('25%')).toBeTruthy();
  });
});
