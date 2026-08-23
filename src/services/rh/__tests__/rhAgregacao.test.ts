/**
 * A hierarquia cidade → setor → equipe → operador.
 *
 * O que estes testes protegem: a ORDEM (configurada, não alfabética por acaso),
 * o balde de quem está sem equipe (que não pode sumir da conta) e o estado de
 * cada nível — que é sempre lido dos filhos, nunca guardado.
 */
import { describe, it, expect } from 'vitest';
import { montarArvore, equipesDoResultado, SEM_EQUIPE, type LinhaAgregavel } from '../rhAgregacao';
import type { StatusLancamento } from '../rhEstados';

let seq = 0;
function linha(over: Partial<LinhaAgregavel & { nome_snapshot: string }> = {}) {
  seq += 1;
  return {
    id: `l-${seq}`,
    status: 'preenchido' as StatusLancamento,
    valor: 100,
    celula_snapshot: 'Birigui',
    setor_id_snapshot: 'setor-play1',
    setor_nome_snapshot: 'Play 1',
    equipe_id_snapshot: 'eq-1',
    equipe_nome_snapshot: 'Bryan',
    tipo_remuneracao_snapshot: 'premiacao',
    nome_snapshot: `Pessoa ${seq}`,
    ...over,
  };
}

describe('montarArvore', () => {
  it('agrupa por cidade, setor e equipe', () => {
    const a = montarArvore([
      linha(),
      linha({ equipe_id_snapshot: 'eq-2', equipe_nome_snapshot: 'Luciana' }),
      linha({
        celula_snapshot: 'Marília', setor_id_snapshot: 'setor-play4',
        setor_nome_snapshot: 'Play 4', tipo_remuneracao_snapshot: 'comissao',
        equipe_id_snapshot: 'eq-9', equipe_nome_snapshot: 'Digital',
      }),
    ]);

    expect(a.celulas.map(c => c.celula).sort()).toEqual(['Birigui', 'Marília']);
    const birigui = a.celulas.find(c => c.celula === 'Birigui')!;
    expect(birigui.setores).toHaveLength(1);
    expect(birigui.setores[0].equipes.map(e => e.equipeNome)).toEqual(['Bryan', 'Luciana']);
  });

  it('respeita a ordem configurada das cidades', () => {
    // Marília antes de Birigui no alfabeto? Não: a ordem é a que o RH definiu
    // em `rh_celulas.ordem`, e é ela que a tela deve seguir.
    const a = montarArvore(
      [linha({ celula_snapshot: 'Marília' }), linha({ celula_snapshot: 'Birigui' })],
      ['Birigui', 'Marília'],
    );
    expect(a.celulas.map(c => c.celula)).toEqual(['Birigui', 'Marília']);
  });

  it('cidade fora da configuração vai para o fim, e NÃO some', () => {
    // Sumir seria perder gente do fechamento por um cadastro incompleto.
    const a = montarArvore(
      [linha({ celula_snapshot: 'Zzz' }), linha({ celula_snapshot: 'Birigui' })],
      ['Birigui'],
    );
    expect(a.celulas.map(c => c.celula)).toEqual(['Birigui', 'Zzz']);
  });

  it('quem está sem equipe vira um balde próprio', () => {
    const a = montarArvore([
      linha(),
      linha({ equipe_id_snapshot: null, equipe_nome_snapshot: null }),
    ]);
    const equipes = a.celulas[0].setores[0].equipes;
    expect(equipes).toHaveLength(2);
    const semEquipe = equipes.find(e => e.equipeId === null)!;
    expect(semEquipe.equipeNome).toBe('Sem equipe');
    expect(semEquipe.linhas).toHaveLength(1);
    // O balde entra na conta do setor — é gente que vai receber.
    expect(a.celulas[0].setores[0].resumo.total).toBe(2);
  });

  it('a constante do balde não colide com um id de equipe real', () => {
    expect(SEM_EQUIPE.startsWith('__')).toBe(true);
  });

  it('o estado de cada nível vem dos filhos', () => {
    const a = montarArvore([
      linha({ status: 'aprovado_rh' }),
      linha({ status: 'devolvido_rh', equipe_id_snapshot: 'eq-2', equipe_nome_snapshot: 'Luciana' }),
    ]);
    const setor = a.celulas[0].setores[0];
    expect(setor.equipes.find(e => e.equipeId === 'eq-1')!.resumo.estado).toBe('aprovado');
    expect(setor.equipes.find(e => e.equipeId === 'eq-2')!.resumo.estado).toBe('com_devolucao');
    // O setor herda a pendência de uma equipe só, sem reprovar a outra.
    expect(setor.resumo.estado).toBe('com_devolucao');
    expect(setor.resumo.aprovados).toBe(1);
  });

  it('separa o total por tipo de remuneração', () => {
    const a = montarArvore([
      linha({ valor: 450 }),
      linha({ valor: 300, tipo_remuneracao_snapshot: 'comissao', celula_snapshot: 'Marília' }),
    ]);
    expect(a.totalPorTipo.premiacao).toBe(450);
    expect(a.totalPorTipo.comissao).toBe(300);
    expect(a.resumo.valorTotal).toBe(750);
  });

  it('o tipo da cidade segue o peso em PESSOAS, não em setores', () => {
    // Cinco setores de premiação com uma pessoa cada e um de comissão com dez:
    // a cidade é, na prática, de comissão.
    const linhas = [
      ...Array.from({ length: 5 }, (_, i) => linha({
        setor_id_snapshot: `p-${i}`, setor_nome_snapshot: `Play ${i}`,
        tipo_remuneracao_snapshot: 'premiacao',
      })),
      ...Array.from({ length: 10 }, () => linha({
        setor_id_snapshot: 'grande', setor_nome_snapshot: 'Grande',
        tipo_remuneracao_snapshot: 'comissao',
      })),
    ];
    expect(montarArvore(linhas).celulas[0].tipoRemuneracao).toBe('comissao');
  });

  it('lista vazia devolve árvore vazia, sem estourar', () => {
    const a = montarArvore([]);
    expect(a.celulas).toEqual([]);
    expect(a.resumo.estado).toBe('vazio');
  });
});

describe('equipesDoResultado', () => {
  it('achata a árvore em equipes ordenadas por nome', () => {
    const eqs = equipesDoResultado([
      linha({ equipe_id_snapshot: 'eq-2', equipe_nome_snapshot: 'Luciana' }),
      linha({ equipe_id_snapshot: 'eq-1', equipe_nome_snapshot: 'Bryan' }),
    ]);
    expect(eqs.map(e => e.equipeNome)).toEqual(['Bryan', 'Luciana']);
  });

  it('um líder com DUAS equipes recebe as duas', () => {
    // Requisito 4: não assumir que um líder tem uma equipe só. A RLS entrega as
    // linhas das duas; a agregação não pode escolher uma.
    const eqs = equipesDoResultado([
      linha({ equipe_id_snapshot: 'eq-1', equipe_nome_snapshot: 'Bryan' }),
      linha({ equipe_id_snapshot: 'eq-2', equipe_nome_snapshot: 'Matheus' }),
    ]);
    expect(eqs).toHaveLength(2);
  });

  it('um líder com UMA equipe recebe só aquela', () => {
    const eqs = equipesDoResultado([linha(), linha()]);
    expect(eqs).toHaveLength(1);
    expect(eqs[0].linhas).toHaveLength(2);
  });
});
