/**
 * O que se perde se isto quebrar: o líder do Play 4 volta a ver o recebimento
 * do Receptivo e de todos os outros setores na aba Recebimento diário — que é
 * exatamente o defeito que este módulo nasceu para consertar (04/08/2026).
 */
import { describe, it, expect } from 'vitest';
import {
  escopoDoDiario, operadoresQueContamNoSetor, linhasVisiveis, contarSetores,
  type VinculosDiario,
} from './escopoDiario';

const PLAY4     = 'setor-play4';
const PLAY5     = 'setor-play5';
const RECEPTIVO = 'setor-receptivo';
const DIGITAL   = 'setor-digital';

const EQ_PLAY4     = 'eq-play4';
const EQ_PLAY5     = 'eq-play5';
const EQ_RECEPTIVO = 'eq-receptivo';
const EQ_DIGITAL   = 'eq-digital';

/**
 * Composição parecida com a real: quatro setores, e um operador do Play 5
 * emprestado (clone) para a equipe do Digital.
 */
const VINCULOS: VinculosDiario = {
  equipes: [
    { id: EQ_PLAY4,     nome: 'Play 4',    setor_id: PLAY4 },
    { id: EQ_PLAY5,     nome: 'Play 5',    setor_id: PLAY5 },
    { id: EQ_RECEPTIVO, nome: 'Receptivo', setor_id: RECEPTIVO },
    { id: EQ_DIGITAL,   nome: 'Digital',   setor_id: DIGITAL },
  ],
  operadorEquipeMap: {
    ana:    { equipe_id: EQ_PLAY4,     equipe_nome: 'Play 4',    setor_id: PLAY4 },
    bruno:  { equipe_id: EQ_PLAY5,     equipe_nome: 'Play 5',    setor_id: PLAY5 },
    carla:  { equipe_id: EQ_RECEPTIVO, equipe_nome: 'Receptivo', setor_id: RECEPTIVO },
    // Sem equipe: o setor vem do próprio perfil.
    diego:  { equipe_id: null,         equipe_nome: 'Sem equipe', setor_id: PLAY4 },
  },
  equipesExtrasPorOperador: {
    bruno: [EQ_DIGITAL],
  },
};

const linha = (operador_id: string | null) => ({ operador_id, valor: 100 });

describe('escopoDoDiario', () => {
  it('quem enxerga todos os setores não é escopado', () => {
    expect(escopoDoDiario({
      veTodosOsSetores: true, setorDoUsuario: PLAY4, totalDeSetores: 4,
    })).toEqual({ tipo: 'tudo' });
  });

  it('empresa de um setor só não tem o que isolar', () => {
    // PaguePlay. Escopar aqui não protegeria nada e zeraria a tela de quem
    // estivesse com o perfil sem setor.
    expect(escopoDoDiario({
      veTodosOsSetores: false, setorDoUsuario: null, totalDeSetores: 1,
    })).toEqual({ tipo: 'tudo' });
  });

  it('líder fica preso ao próprio setor', () => {
    expect(escopoDoDiario({
      veTodosOsSetores: false, setorDoUsuario: PLAY4, totalDeSetores: 4,
    })).toEqual({ tipo: 'setor', setorId: PLAY4 });
  });

  it('líder sem setor não cai no "vê tudo"', () => {
    // Era assim que o vazamento acontecia por omissão.
    expect(escopoDoDiario({
      veTodosOsSetores: false, setorDoUsuario: null, totalDeSetores: 4,
    })).toEqual({ tipo: 'sem-setor' });
  });
});

describe('contarSetores', () => {
  it('conta os setores das equipes e o de quem não tem equipe', () => {
    expect(contarSetores(VINCULOS)).toBe(4);
  });

  it('empresa de um setor só conta um', () => {
    expect(contarSetores({
      equipes: [{ id: 'eq', nome: 'Única', setor_id: 'setor-unico' }],
      operadorEquipeMap: {
        ana: { equipe_id: 'eq', equipe_nome: 'Única', setor_id: 'setor-unico' },
      },
      equipesExtrasPorOperador: {},
    })).toBe(1);
  });

  it('composição sem setor nenhum conta zero — e o escopo abre', () => {
    // Banco sem setores configurados: escopar zeraria a tela sem motivo.
    const vazio: VinculosDiario = {
      equipes: [], operadorEquipeMap: {}, equipesExtrasPorOperador: {},
    };
    expect(contarSetores(vazio)).toBe(0);
    expect(escopoDoDiario({
      veTodosOsSetores: false, setorDoUsuario: null, totalDeSetores: 0,
    })).toEqual({ tipo: 'tudo' });
  });
});

describe('operadoresQueContamNoSetor', () => {
  it('inclui quem está em equipe do setor e quem tem o setor no perfil', () => {
    expect(operadoresQueContamNoSetor(PLAY4, VINCULOS)).toEqual(new Set(['ana', 'diego']));
  });

  it('não inclui operador de outro setor', () => {
    const play4 = operadoresQueContamNoSetor(PLAY4, VINCULOS);
    expect(play4.has('carla')).toBe(false);
    expect(play4.has('bruno')).toBe(false);
  });

  it('clone conta nos DOIS setores, sem sair do de origem', () => {
    expect(operadoresQueContamNoSetor(DIGITAL, VINCULOS).has('bruno')).toBe(true);
    expect(operadoresQueContamNoSetor(PLAY5,   VINCULOS).has('bruno')).toBe(true);
  });

  it('setor sem ninguém devolve conjunto vazio, não a empresa toda', () => {
    expect(operadoresQueContamNoSetor('setor-que-nao-existe', VINCULOS).size).toBe(0);
  });
});

describe('linhasVisiveis', () => {
  const LINHAS = [
    linha('ana'), linha('bruno'), linha('carla'), linha('diego'), linha(null),
  ];

  it('sem escopo devolve tudo, inclusive as órfãs', () => {
    expect(linhasVisiveis(LINHAS, { tipo: 'tudo' }, VINCULOS)).toHaveLength(5);
  });

  it('o líder do Play 4 não vê o Receptivo', () => {
    // O defeito relatado pela operação, em uma linha.
    const vistas = linhasVisiveis(LINHAS, { tipo: 'setor', setorId: PLAY4 }, VINCULOS);
    expect(vistas.map(l => l.operador_id)).toEqual(['ana', 'diego']);
  });

  it('linha sem operador não aparece para quem é escopado', () => {
    // Órfã não tem dono, logo não tem setor — atribuí-la ao setor de quem está
    // olhando seria inventar um dado.
    const vistas = linhasVisiveis(LINHAS, { tipo: 'setor', setorId: PLAY4 }, VINCULOS);
    expect(vistas.some(l => l.operador_id === null)).toBe(false);
  });

  it('o líder do Digital vê o clone emprestado', () => {
    const vistas = linhasVisiveis(LINHAS, { tipo: 'setor', setorId: DIGITAL }, VINCULOS);
    expect(vistas.map(l => l.operador_id)).toEqual(['bruno']);
  });

  it('sem setor definido não vê nada', () => {
    expect(linhasVisiveis(LINHAS, { tipo: 'sem-setor' }, VINCULOS)).toEqual([]);
  });

  it('operador desconhecido na composição não passa', () => {
    // Perfil apagado depois da importação: sem vínculo, sem setor, fora.
    const vistas = linhasVisiveis([linha('fantasma')], { tipo: 'setor', setorId: PLAY4 }, VINCULOS);
    expect(vistas).toEqual([]);
  });
});
