/**
 * alcanceDoRecorte.test.ts
 *
 * O defeito que estes casos travam: a tela de configuração abria com a
 * operação INTEIRA listada como participante — 236 pessoas —, e a aba de
 * metas com 236 campos de meta. A regra estava escrita duas vezes, e a
 * segunda cópia (a das metas) nem recortava.
 */
import { describe, it, expect } from 'vitest';
import {
  alcancadosPeloRecorte, contarNoDesafio, temRecorte,
} from './alcanceDoRecorte';
import type { ParticipantesDesafio, PessoaDesafio } from '@/services/desafios/types';

function pessoa(over: Partial<PessoaDesafio> & { id: string; nome: string }): PessoaDesafio {
  return {
    usuario: over.nome.toLowerCase(),
    fotoUrl: null,
    equipeId: 'eq1',
    equipeNome: 'PLAY 1',
    setorId: 'setorA',
    situacao: 'ativo',
    setores: ['setorA'],
    equipes: ['eq1'],
    perfil: 'operador',
    empresaId: 'emp1',
    convidado: false,
    ...over,
  };
}

function recorte(over: Partial<ParticipantesDesafio> = {}): ParticipantesDesafio {
  return {
    setores: [], equipes: [], operadores: [], cargos: [], excluidos: [],
    convidados: [], ...over,
  };
}

const quadro = [
  pessoa({ id: 'a', nome: 'Ana' }),
  pessoa({ id: 'b', nome: 'Bruno', perfil: 'lider' }),
  pessoa({ id: 'c', nome: 'Carla', setores: ['setorB'], equipes: ['eq2'], equipeId: 'eq2' }),
  pessoa({ id: 'd', nome: 'Davi',  setores: ['setorB'], equipes: ['eq2'], equipeId: 'eq2',
           perfil: 'lider' }),
];

describe('temRecorte', () => {
  it('campanha recem-criada nao tem recorte — vale para todo mundo', () => {
    expect(temRecorte(recorte())).toBe(false);
  });

  it('qualquer uma das quatro dimensoes ja e recorte', () => {
    expect(temRecorte(recorte({ setores:    ['setorA'] }))).toBe(true);
    expect(temRecorte(recorte({ equipes:    ['eq1']    }))).toBe(true);
    expect(temRecorte(recorte({ cargos:     ['lider']  }))).toBe(true);
    expect(temRecorte(recorte({ operadores: ['a']      }))).toBe(true);
  });

  it('excluir alguem NAO e recorte: «todo mundo menos ele» continua todo mundo', () => {
    expect(temRecorte(recorte({ excluidos: ['a'] }))).toBe(false);
  });

  it('quem so configura o proprio setor esta sempre recortado', () => {
    expect(temRecorte(recorte(), 'setorA')).toBe(true);
  });
});

describe('alcancadosPeloRecorte', () => {
  it('sem recorte, alcanca o quadro inteiro', () => {
    expect(alcancadosPeloRecorte(quadro, recorte())).toHaveLength(4);
  });

  it('recorta por setor', () => {
    const r = alcancadosPeloRecorte(quadro, recorte({ setores: ['setorB'] }));
    expect(r.map(p => p.id)).toEqual(['c', 'd']);
  });

  it('as dimensoes sao um E — setor mais cargo pede quem esta nos dois', () => {
    const r = alcancadosPeloRecorte(
      quadro, recorte({ setores: ['setorB'], cargos: ['lider'] }),
    );
    expect(r.map(p => p.id)).toEqual(['d']);
  });

  it('o setor travado vence a lista de setores da tela', () => {
    const r = alcancadosPeloRecorte(quadro, recorte({ setores: ['setorB'] }), 'setorA');
    expect(r.map(p => p.id)).toEqual(['a', 'b']);
  });

  /*
   * As exclusoes NAO saem daqui de proposito: esta lista e a que a tela
   * desenha para escolher quem excluir, e tirar a pessoa dela no clique em que
   * foi excluida a deixaria sem como voltar.
   */
  it('nao aplica as exclusoes — quem foi excluido continua na lista', () => {
    const r = alcancadosPeloRecorte(quadro, recorte({ excluidos: ['a'] }));
    expect(r.map(p => p.id)).toContain('a');
  });

  it('o convidado de teste entra por cima do recorte', () => {
    const admin = pessoa({
      id: 'sa', nome: 'Super', perfil: 'super_admin',
      setores: [], equipes: [], equipeId: null,
    });
    const r = alcancadosPeloRecorte(
      [...quadro, admin],
      recorte({ setores: ['setorA'], convidados: ['sa'] }),
    );
    expect(r.map(p => p.id)).toContain('sa');
  });
});

describe('contarNoDesafio', () => {
  it('e o alcance menos as exclusoes', () => {
    expect(contarNoDesafio(quadro, [])).toBe(4);
    expect(contarNoDesafio(quadro, ['a', 'c'])).toBe(2);
  });

  it('exclusao de quem nao esta no alcance nao subtrai nada', () => {
    expect(contarNoDesafio(quadro, ['fantasma'])).toBe(4);
  });
});
