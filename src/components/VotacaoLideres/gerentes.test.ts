/**
 * gerentes.test.ts — quem concorre e quem vota na Votação dos Gerentes, as
 * regras novas da cédula e o acompanhamento com eleitores (12/11/2026).
 */
import { describe, expect, it } from 'vitest';
import {
  PERGUNTAS_PADRAO_GERENTES, apurar, respostasExigidas, simularCedulas, situacaoDasDecisoes, cedulaComTodos,
} from './cedula';
import { montarGerentes, rascunhoGerentesPadrao, semEquipe, type RascunhoGerentes } from './gerentes';
import { montarAcompanhamento } from './acompanhamento';
import type { ApuracaoDaVotacao } from './banco';
import type { EquipeDaVotacao, GrupoDaVotacao, Participante } from './participantes';

const pessoa = (id: string, nome: string, perfil: string, setorId: string | null, equipeId: string | null = null, produto: 'cobranca' | 'comercial' = 'cobranca'): Participante => ({
  id, nome, perfil, foto: null, setor: setorId ? `Setor ${setorId}` : 'Sem setor', setorId, equipeId, grupo: 'marca:bookplay', produto, empresa: 'BookPlay',
});

const pessoas: Participante[] = [
  pessoa('g1', 'Gabi Souza', 'gerencia', 's1'),
  pessoa('g2', 'Gustavo Lima', 'gerencia', null),
  pessoa('g3', 'Gerencia Play', 'gerencia', 's1'), // conta, não pessoa
  pessoa('gv', 'Vera Vendas', 'gerencia', 'sv', null, 'comercial'),
  pessoa('o1', 'Olga', 'operador', 's1', 'e1'),
  pessoa('o2', 'Oto', 'operador', 's1', 'e2'),
  pessoa('o3', 'Otávio', 'operador', 's1', null),
  pessoa('o4', 'Ozias', 'operador', 's2', 'e3'),
  pessoa('l1', 'Lia', 'lider', 's1', null),
  pessoa('d1', 'Dora', 'diretoria', null),
];
const grupos: GrupoDaVotacao[] = [
  { chave: 'marca:bookplay', rotulo: 'BookPlay · Birigui', produto: 'cobranca', setores: [
    { id: 's1', nome: 'Play 1', grupo: 'marca:bookplay', produto: 'cobranca' },
    { id: 's2', nome: 'Play 2', grupo: 'marca:bookplay', produto: 'cobranca' },
    { id: 's3', nome: 'Vazio', grupo: 'marca:bookplay', produto: 'cobranca' },
  ] },
];
const equipes: EquipeDaVotacao[] = [
  { id: 'e1', nome: 'Equipe Ana', setorId: 's1' }, { id: 'e2', nome: 'Equipe Beto', setorId: 's1' }, { id: 'e3', nome: 'Equipe Caio', setorId: 's2' },
];
const dados = { pessoas, grupos, equipes };
const com = (parcial: Partial<RascunhoGerentes>) => ({ ...rascunhoGerentesPadrao(), ...parcial });

describe('montarGerentes', () => {
  it('concorrem os gerentes da operação, sem contas, com tirados e incluídos', () => {
    const m = montarGerentes(dados, com({}));
    expect(m.candidatos.map(p => p.id)).toEqual(['g1', 'g2']);
    expect(m.contasGerentes.map(c => c.p.id)).toEqual(['g3']);
    const m2 = montarGerentes(dados, com({ gerentesFora: ['g2'], gerentesVoltaram: ['g3'], gerentesIncluidos: ['d1'] }));
    expect(m2.candidatos.map(p => p.id).sort()).toEqual(['d1', 'g1', 'g3']);
  });

  it('votam os do cargo nos setores marcados, por equipe', () => {
    expect(montarGerentes(dados, com({})).eleitores).toEqual([]);
    const m = montarGerentes(dados, com({ setores: ['s1'] }));
    expect(m.eleitores.map(p => p.id).sort()).toEqual(['o1', 'o2', 'o3']);
    expect(m.equipesPorSetor.get('s1')?.map(e => [e.nome, e.total])).toEqual([['Equipe Ana', 1], ['Equipe Beto', 1], ['Sem equipe', 1]]);
    // Setor sem ninguém do cargo nem aparece.
    expect(m.grupos[0].setores.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('equipe desmarcada sai inteira; «sem equipe» também se desmarca', () => {
    const m = montarGerentes(dados, com({ setores: ['s1', 's2'], equipesFora: ['e2', semEquipe('s1')] }));
    expect(m.eleitores.map(p => p.id).sort()).toEqual(['o1', 'o4']);
  });

  it('cargos, tirar e incluir à mão', () => {
    const m = montarGerentes(dados, com({ setores: ['s1'], cargosEleitores: ['operador', 'lider'], eleitoresFora: ['o1'], eleitoresIncluidos: ['d1'] }));
    expect(m.eleitores.map(p => p.id).sort()).toEqual(['d1', 'l1', 'o2', 'o3']);
  });

  it('trocar de operação muda os gerentes', () => {
    expect(montarGerentes(dados, com({ produto: 'comercial' })).candidatos.map(p => p.id)).toEqual(['gv']);
  });
});

describe('cada setor vota no seu gerente', () => {
  it('pelo cadastro: cada um vê só o gerente do próprio setor', () => {
    const m = montarGerentes(dados, com({ setores: ['s1', 's2'] }));
    expect(m.cedulaPorEleitor.get('o1')).toEqual(['g1']);
    // O Play 2 não tem gerente no cadastro: quem é de lá fica sem cédula.
    expect(m.semGerente.map(p => p.id)).toEqual(['o4']);
    expect(m.setoresComUm).toEqual(['s1']);
    expect(m.gerentesSemEleitor.map(g => g.id)).toEqual(['g2']);
  });

  it('à mão: um gerente vale para outro setor, e um setor pode ter dois', () => {
    const m = montarGerentes(dados, com({ setores: ['s1', 's2'], ligacoes: { s2: ['g1'], s1: ['g1', 'g2'] } }));
    expect(m.cedulaPorEleitor.get('o4')).toEqual(['g1']);
    expect(m.cedulaPorEleitor.get('o1')?.sort()).toEqual(['g1', 'g2']);
    expect(m.semGerente).toEqual([]);
    expect(m.setoresComUm).toEqual(['s2']);
    expect(m.ligadoAMao('s1')).toBe(true);
    expect(m.ligadoAMao('s3')).toBe(false);
  });

  it('gerente tirado da votação some da ligação', () => {
    const m = montarGerentes(dados, com({ setores: ['s1'], ligacoes: { s1: ['g1', 'g2'] }, gerentesFora: ['g2'] }));
    expect(m.cedulaPorEleitor.get('o1')).toEqual(['g1']);
  });
});

describe('regras da cédula', () => {
  it('respostas exigidas iguais às do banco', () => {
    expect(respostasExigidas({ candidatos: 25, perguntas: 25, eleitorConcorre: true, umPorCandidato: true })).toBe(24);
    expect(respostasExigidas({ candidatos: 4, perguntas: 15, eleitorConcorre: false, umPorCandidato: true })).toBe(4);
    expect(respostasExigidas({ candidatos: 4, perguntas: 15, eleitorConcorre: false, umPorCandidato: false })).toBe(15);
    expect(respostasExigidas({ candidatos: 1, perguntas: 5, eleitorConcorre: true, umPorCandidato: false })).toBe(0);
  });

  it('perguntas-base dos gerentes falam de gerente', () => {
    expect(PERGUNTAS_PADRAO_GERENTES[0].texto).toBe('Quem é o gerente mais comunicativo?');
    expect(PERGUNTAS_PADRAO_GERENTES.every(p => !p.texto.includes('líder'))).toBe(true);
  });

  it('sem «um título», repetir não fica pendente; empate continua', () => {
    const ps = PERGUNTAS_PADRAO_GERENTES.slice(0, 3);
    const cedula = cedulaComTodos(ps, [{ id: 'a', nome: 'A', foto: null, setor: '', perfil: 'gerencia' }, { id: 'b', nome: 'B', foto: null, setor: '', perfil: 'gerencia' }]);
    const r = apurar(cedula, { [ps[0].id]: { a: 2 }, [ps[1].id]: { a: 3 }, [ps[2].id]: { a: 1, b: 1 } });
    expect(situacaoDasDecisoes(r, {}).pendentes).toBe(3);
    expect(situacaoDasDecisoes(r, {}, { umTitulo: false }).pendentes).toBe(1);
  });

  it('simulação sem «um por candidato» repete o mesmo nome', () => {
    const ps = PERGUNTAS_PADRAO_GERENTES.slice(0, 6);
    const cedula = cedulaComTodos(ps, [{ id: 'a', nome: 'A', foto: null, setor: '', perfil: 'gerencia' }, { id: 'b', nome: 'B', foto: null, setor: '', perfil: 'gerencia' }]);
    const c = simularCedulas(cedula, ['x', 'y'], 7, false);
    expect(Object.keys(c.x)).toHaveLength(6);
    expect(Object.keys(simularCedulas(cedula, ['x'], 7, true).x)).toHaveLength(2);
  });
});

describe('acompanhamento dos gerentes', () => {
  it('quem falta sai dos eleitores, por setor e equipe', () => {
    const r: ApuracaoDaVotacao = {
      votacao: { id: 'v', titulo: 'G', produto: 'cobranca', estado: 'aberta', aberta_em: null, liberada_em: null, tipo: 'gerentes' },
      perguntas: PERGUNTAS_PADRAO_GERENTES.slice(0, 3),
      participantes: [{ id: 'g1', nome: 'Gabi', foto: null, perfil: 'gerencia', setor: null }, { id: 'g2', nome: 'Gu', foto: null, perfil: 'gerencia', setor: null }],
      eleitores: [
        { id: 'o1', nome: 'Olga', foto: null, perfil: 'operador', setor: 'Play 1', equipe: 'Equipe Ana' },
        { id: 'o2', nome: 'Oto', foto: null, perfil: 'operador', setor: 'Play 1', equipe: null },
      ],
      contagem: null, desempates: null,
      envios: [{ eleitor_id: 'o1', nome: 'Olga', enviado_em: '2026-11-12T12:00:00Z', respondidas: 3 }],
    };
    const a = montarAcompanhamento(r);
    expect(a.resumo).toMatchObject({ participantes: 2, votaram: 1, faltam: 1 });
    expect(a.setores.map(s => s.setor).sort()).toEqual(['Play 1', 'Play 1 · Equipe Ana']);
    expect(a.pessoasPorId.has('g1')).toBe(true);
  });
});
