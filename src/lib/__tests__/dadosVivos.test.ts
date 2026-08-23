/**
 * A promessa deste módulo é uma só e é fácil de perder numa refatoração:
 * **item que não mudou volta com a MESMA referência, e lista que não mudou
 * volta inteira por referência**. É disso que depende o `React.memo` das linhas
 * e o `setState` que não renderiza.
 *
 * Um teste que só compare valores passaria com um `structuredClone` no meio, e
 * a tela voltaria a piscar sem ninguém notar. Por isso quase todo `expect`
 * abaixo é de identidade (`toBe`), não de igualdade.
 */
import { describe, it, expect } from 'vitest';
import {
  reconciliarLista, reconciliarComDiff, reconciliarItem, reconciliarMapa,
  iguaisRaso,
} from '../dadosVivos';

interface Linha { id: string; valor: number; nome?: string }

const chave = (l: Linha) => l.id;

describe('iguaisRaso', () => {
  it('compara campo a campo', () => {
    expect(iguaisRaso({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(iguaisRaso({ a: 1, b: 'x' }, { a: 2, b: 'x' })).toBe(false);
  });

  it('quantidade de campos diferente é diferente', () => {
    expect(iguaisRaso({ a: 1 } as Record<string, unknown>, { a: 1, b: 2 })).toBe(false);
  });

  it('null só é igual a null', () => {
    expect(iguaisRaso(null, null)).toBe(true);
    expect(iguaisRaso(null, { a: 1 } as unknown)).toBe(false);
  });

  it('objeto aninhado por referência: caso que exige `iguais` próprio', () => {
    // Documentado no cabeçalho do módulo — a comparação rasa não desce.
    expect(iguaisRaso({ p: { x: 1 } }, { p: { x: 1 } })).toBe(false);
  });
});

describe('reconciliarLista', () => {
  it('devolve o array ANTERIOR por referência quando nada mudou', () => {
    const atual: Linha[] = [{ id: 'a', valor: 1 }, { id: 'b', valor: 2 }];
    const nova: Linha[]  = [{ id: 'a', valor: 1 }, { id: 'b', valor: 2 }];
    expect(reconciliarLista(atual, nova, { chave })).toBe(atual);
  });

  it('preserva a referência dos itens que não mudaram', () => {
    const a: Linha = { id: 'a', valor: 1 };
    const b: Linha = { id: 'b', valor: 2 };
    const r = reconciliarLista([a, b], [{ id: 'a', valor: 1 }, { id: 'b', valor: 99 }], { chave });

    expect(r[0]).toBe(a);          // intacto: mesma referência
    expect(r[1]).not.toBe(b);      // mudou: objeto novo
    expect(r[1].valor).toBe(99);
  });

  it('a ordem é a da lista nova', () => {
    const a: Linha = { id: 'a', valor: 1 };
    const b: Linha = { id: 'b', valor: 2 };
    const r = reconciliarLista([a, b], [{ id: 'b', valor: 2 }, { id: 'a', valor: 1 }], { chave });

    expect(r.map(x => x.id)).toEqual(['b', 'a']);
    // Reordenar não recria: os objetos continuam sendo os mesmos.
    expect(r[0]).toBe(b);
    expect(r[1]).toBe(a);
  });

  it('remoção some da lista', () => {
    const r = reconciliarLista(
      [{ id: 'a', valor: 1 }, { id: 'b', valor: 2 }],
      [{ id: 'a', valor: 1 }],
      { chave },
    );
    expect(r.map(x => x.id)).toEqual(['a']);
  });

  it('lista vazia para lista vazia não cria array novo', () => {
    const vazio: Linha[] = [];
    expect(reconciliarLista(vazio, [], { chave })).toBe(vazio);
  });

  it('`iguais` próprio decide o que conta como mudança', () => {
    const a: Linha = { id: 'a', valor: 1, nome: 'antigo' };
    // Comparando SÓ o valor, mudar o nome não conta.
    const r = reconciliarLista([a], [{ id: 'a', valor: 1, nome: 'novo' }], {
      chave, iguais: (x, y) => x.valor === y.valor,
    });
    expect(r[0]).toBe(a);
    expect(r[0].nome).toBe('antigo');
  });
});

describe('reconciliarComDiff', () => {
  it('separa entradas, saídas e alterações', () => {
    const d = reconciliarComDiff(
      [{ id: 'a', valor: 1 }, { id: 'b', valor: 2 }, { id: 'c', valor: 3 }],
      [{ id: 'a', valor: 1 }, { id: 'b', valor: 20 }, { id: 'd', valor: 4 }],
      { chave },
    );
    expect(d.entraram).toEqual(['d']);
    expect(d.sairam).toEqual(['c']);
    expect(d.mudaram).toEqual(['b']);
  });

  it('sem novidade, os três vêm vazios', () => {
    const atual: Linha[] = [{ id: 'a', valor: 1 }];
    const d = reconciliarComDiff(atual, [{ id: 'a', valor: 1 }], { chave });
    expect(d.entraram).toEqual([]);
    expect(d.sairam).toEqual([]);
    expect(d.mudaram).toEqual([]);
    expect(d.lista).toBe(atual);
  });

  it('só reordenar não é entrada nem saída, mas troca o array', () => {
    const atual: Linha[] = [{ id: 'a', valor: 1 }, { id: 'b', valor: 2 }];
    const d = reconciliarComDiff(atual, [atual[1], atual[0]], { chave });
    expect(d.entraram).toEqual([]);
    expect(d.sairam).toEqual([]);
    expect(d.mudaram).toEqual([]);
    // A lista mudou de ordem: precisa ser um array novo, senão a tela não
    // reordena.
    expect(d.lista).not.toBe(atual);
  });
});

describe('reconciliarItem', () => {
  it('mantém a referência quando o conteúdo é igual', () => {
    const a = { id: 'x', valor: 1 };
    expect(reconciliarItem(a, { id: 'x', valor: 1 })).toBe(a);
  });

  it('troca quando muda', () => {
    const a = { id: 'x', valor: 1 };
    const b = { id: 'x', valor: 2 };
    expect(reconciliarItem(a, b)).toBe(b);
  });

  it('null passa direto — não existe "igual a nada"', () => {
    expect(reconciliarItem<Linha>({ id: 'x', valor: 1 }, null)).toBeNull();
    const novo = { id: 'x', valor: 1 };
    expect(reconciliarItem<Linha>(null, novo)).toBe(novo);
  });
});

describe('reconciliarMapa', () => {
  it('devolve o mapa anterior quando nada mudou', () => {
    const atual = { a: { id: 'a', valor: 1 } };
    expect(reconciliarMapa(atual, { a: { id: 'a', valor: 1 } })).toBe(atual);
  });

  it('preserva os valores iguais e troca só o que mudou', () => {
    const va = { id: 'a', valor: 1 };
    const vb = { id: 'b', valor: 2 };
    const r = reconciliarMapa({ a: va, b: vb }, { a: { id: 'a', valor: 1 }, b: { id: 'b', valor: 9 } });
    expect(r.a).toBe(va);
    expect(r.b).not.toBe(vb);
  });

  it('chave que sumiu não sobrevive', () => {
    const r = reconciliarMapa({ a: { id: 'a', valor: 1 }, b: { id: 'b', valor: 2 } },
                              { a: { id: 'a', valor: 1 } });
    expect(Object.keys(r)).toEqual(['a']);
  });
});
