import { describe, expect, it } from 'vitest';
import type { GrupoDaVotacao, Participante } from '@/components/VotacaoLideres/participantes';
import { montarPublico, publicoPadrao, semEquipe } from './publico';
import { VOTACAO_DEZEMBRO, apurar, opcoesDoBanco, opcoesParaGravar, problemasDoConteudo } from './opcoes';

const p = (id: string, setorId: string | null, perfil = 'operador', equipeId: string | null = null, nome = `Pessoa ${id}`): Participante => ({
  id, nome, foto: null, perfil, setor: setorId ?? 'Sem setor', setorId, equipeId, grupo: 'g', produto: 'cobranca', empresa: '',
});
const grupos: GrupoDaVotacao[] = [{ chave: 'g', rotulo: 'BookPlay', produto: 'cobranca', setores: [
  { id: 's1', nome: 'Play 1', grupo: 'g', produto: 'cobranca' }, { id: 's2', nome: 'Play 2', grupo: 'g', produto: 'cobranca' },
  { id: 's3', nome: 'Só líderes', grupo: 'g', produto: 'cobranca' },
] }];
const equipes = [{ id: 'e1', nome: 'Equipe A', setorId: 's1' }, { id: 'e2', nome: 'Equipe B', setorId: 's1' }];
const pessoas = [
  p('a', 's1', 'operador', 'e1'), p('b', 's1', 'operador', 'e2'), p('c', 's1', 'operador', null),
  p('d', 's2'), p('l', 's1', 'lider', 'e1'), p('x', 's3', 'lider'), p('conta', 's1', 'operador', 'e1', 'Suporte Play 1'),
  p('dir', null, 'diretoria'),
];
const dados = { pessoas, grupos, equipes };
const ids = (l: Participante[]) => l.map(x => x.id).sort();

describe('quem vota', () => {
  it('nada marcado: ninguém; setores só com alguém do cargo', () => {
    const m = montarPublico(dados, publicoPadrao());
    expect(m.eleitores).toEqual([]);
    expect(m.grupos[0].setores.map(s => s.id)).toEqual(['s1', 's2']);
    expect(m.cargos[0].cargo).toBe('operador');
  });

  it('setor marcado: os operadores dele, sem a conta; equipe desmarcada sai inteira', () => {
    const r = { ...publicoPadrao(), setores: ['s1'] };
    expect(ids(montarPublico(dados, r).eleitores)).toEqual(['a', 'b', 'c']);
    expect(montarPublico(dados, r).contas.map(c => c.p.id)).toEqual(['conta']);
    expect(ids(montarPublico(dados, { ...r, equipesFora: ['e2', semEquipe('s1')] }).eleitores)).toEqual(['a']);
    expect(montarPublico(dados, r).equipesPorSetor.get('s1')?.map(e => e.nome)).toEqual(['Equipe A', 'Equipe B', 'Sem equipe']);
  });

  it('vários setores, mais cargos, tirar, colocar a conta de volta e incluir à mão', () => {
    const r = { ...publicoPadrao(), setores: ['s1', 's2'], cargos: ['operador', 'lider'], fora: ['b'], voltaram: ['conta'], incluidos: ['dir', 'x'] };
    expect(ids(montarPublico(dados, r).eleitores)).toEqual(['a', 'c', 'conta', 'd', 'dir', 'l', 'x']);
  });

  it('incluído à mão que já estava pelo filtro não repete', () => {
    const r = { ...publicoPadrao(), setores: ['s1'], incluidos: ['a'] };
    expect(ids(montarPublico(dados, r).eleitores)).toEqual(['a', 'b', 'c']);
  });
});

describe('o conteúdo', () => {
  it('a de dezembro está pronta para liberar', () => {
    expect(problemasDoConteudo(VOTACAO_DEZEMBRO)).toEqual([]);
    expect(VOTACAO_DEZEMBRO.opcoes.map(o => o.id)).toEqual(['premios', 'happy_hour']);
  });

  it('sem título, uma opção só ou repetida não libera', () => {
    const [a, b] = VOTACAO_DEZEMBRO.opcoes;
    expect(problemasDoConteudo({ ...VOTACAO_DEZEMBRO, titulo: ' ' })).toHaveLength(1);
    expect(problemasDoConteudo({ ...VOTACAO_DEZEMBRO, opcoes: [a] })).toHaveLength(1);
    expect(problemasDoConteudo({ ...VOTACAO_DEZEMBRO, opcoes: [a, { ...b, id: a.id }] })).toEqual(['Há opções repetidas.']);
    expect(problemasDoConteudo({ ...VOTACAO_DEZEMBRO, opcoes: [a, { ...b, titulo: '' }] })).toEqual(['A opção 2 está sem título.']);
  });

  it('gravar tira linhas vazias; ler do banco tolera campo faltando', () => {
    const [o] = opcoesParaGravar([{ ...VOTACAO_DEZEMBRO.opcoes[0], detalhes: [' um ', '', 'dois'], foto: ' ' }]);
    expect(o.detalhes).toEqual(['um', 'dois']);
    expect(o.foto).toBeNull();
    expect(opcoesDoBanco([{ id: 'x', titulo: 'X' }, { id: '', titulo: 'sem id' }, 3])).toEqual([
      { id: 'x', titulo: 'X', emoji: '', resumo: '', foto: null, detalhes: [], rotuloItens: '', itens: [] },
    ]);
  });

  it('apurar dá o % de cada opção', () => {
    expect(apurar(VOTACAO_DEZEMBRO.opcoes, { premios: 3, happy_hour: 1 }).map(x => [x.votos, x.pct])).toEqual([[3, 75], [1, 25]]);
    expect(apurar(VOTACAO_DEZEMBRO.opcoes, {}).map(x => x.pct)).toEqual([0, 0]);
  });
});
