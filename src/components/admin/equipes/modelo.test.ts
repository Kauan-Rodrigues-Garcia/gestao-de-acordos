import { describe, it, expect } from 'vitest';
import {
  agruparPorDestino, aplicarMudancas, casaBusca, desfazer, destinosDoSetor, fraseDoMovimento,
  iniciais, planejarMovimento, repartirPorSubgrupo, resumoDoSetor,
  type EquipeEq, type PessoaEq, type SubgrupoEq,
} from './modelo';

const pessoa = (id: string, equipe_id: string | null, subgrupo_id: string | null = null): PessoaEq => ({
  id, nome: `Pessoa ${id}`, email: '', perfil: 'operador', setor_id: 's1', equipe_id, empresa_id: 'e', subgrupo_id,
});
const equipe = (id: string, nome: string): EquipeEq => ({ id, nome, setor_id: 's1', empresa_id: 'e' });

describe('texto', () => {
  it('busca ignora acento e caixa', () => {
    expect(casaBusca('Marília Souza', 'marilia')).toBe(true);
    expect(casaBusca('João', '')).toBe(true);
    expect(casaBusca('João', 'ana')).toBe(false);
  });
  it('iniciais do primeiro e do último nome', () => {
    expect(iniciais('Ana Paula de Souza')).toBe('AS');
    expect(iniciais('bruno')).toBe('B');
    expect(iniciais('  ')).toBe('?');
  });
});

describe('repartirPorSubgrupo', () => {
  it('subgrupo apagado cai em soltos em vez de sumir', () => {
    const grupos: SubgrupoEq[] = [{ id: 'g1', equipe_id: 'a', nome: 'Manhã' }];
    const { porGrupo, soltos } = repartirPorSubgrupo(
      [pessoa('1', 'a', 'g1'), pessoa('2', 'a', 'apagado'), pessoa('3', 'a')], grupos);
    expect(porGrupo.get('g1')!.map(p => p.id)).toEqual(['1']);
    expect(soltos.map(p => p.id)).toEqual(['2', '3']);
  });
});

describe('resumoDoSetor', () => {
  it('conta alocados e o percentual', () => {
    const r = resumoDoSetor([pessoa('1', 'a'), pessoa('2', null), pessoa('3', 'a'), pessoa('4', null)], [equipe('a', 'A')]);
    expect(r).toEqual({ pessoas: 4, emEquipe: 2, semEquipe: 2, equipes: 1, alocados: 50 });
  });
  it('setor vazio não divide por zero', () => {
    expect(resumoDoSetor([], []).alocados).toBe(0);
  });
});

describe('destinosDoSetor', () => {
  it('sem equipe primeiro, e cada equipe seguida dos subgrupos dela', () => {
    const d = destinosDoSetor(
      [equipe('a', 'Alfa'), equipe('b', 'Beta')],
      [{ id: 'g2', equipe_id: 'a', nome: 'Tarde' }, { id: 'g1', equipe_id: 'a', nome: 'Manhã' }],
      [pessoa('1', 'a', 'g1'), pessoa('2', null)],
    );
    expect(d.map(x => x.rotulo)).toEqual(['Sem equipe', 'Alfa', 'Manhã', 'Tarde', 'Beta']);
    expect(d[0].qtd).toBe(1);
    expect(d[1].qtd).toBe(1);
    expect(d[2]).toMatchObject({ equipeId: 'a', subgrupoId: 'g1', equipeNome: 'Alfa', qtd: 1 });
  });
});

describe('planejarMovimento', () => {
  const pessoas = [pessoa('1', 'a'), pessoa('2', 'b', 'g'), pessoa('3', null)];

  it('pula quem já está no destino e ids desconhecidos (transferidos)', () => {
    const m = planejarMovimento(pessoas, ['1', '2', '3', 'fantasma', '2'], { equipeId: 'a', subgrupoId: null });
    expect(m.map(x => x.id)).toEqual(['2', '3']);
    expect(m[0].de).toEqual({ equipeId: 'b', subgrupoId: 'g' });
  });

  it('trocar só o subgrupo dentro da mesma equipe é movimento', () => {
    const m = planejarMovimento(pessoas, ['1'], { equipeId: 'a', subgrupoId: 'x' });
    expect(m).toHaveLength(1);
    expect(m[0].para).toEqual({ equipeId: 'a', subgrupoId: 'x' });
  });

  it('sem equipe não guarda subgrupo', () => {
    const m = planejarMovimento(pessoas, ['2'], { equipeId: null, subgrupoId: 'g' });
    expect(m[0].para).toEqual({ equipeId: null, subgrupoId: null });
  });

  it('desfazer devolve cada um para onde estava', () => {
    const m = planejarMovimento(pessoas, ['1', '2'], { equipeId: 'c', subgrupoId: null });
    const depois = aplicarMudancas(pessoas, m);
    expect(depois.map(p => p.equipe_id)).toEqual(['c', 'c', null]);
    const volta = aplicarMudancas(depois, desfazer(m));
    expect(volta.map(p => [p.equipe_id, p.subgrupo_id ?? null])).toEqual([['a', null], ['b', 'g'], [null, null]]);
  });

  it('agrupa por destino: uma escrita por grupo', () => {
    const m = planejarMovimento(pessoas, ['1', '2'], { equipeId: 'c', subgrupoId: null });
    expect(agruparPorDestino(m)).toEqual([{ destino: { equipeId: 'c', subgrupoId: null }, ids: ['1', '2'] }]);
    expect(agruparPorDestino(desfazer(m))).toHaveLength(2);
  });
});

describe('fraseDoMovimento', () => {
  it('nomeia uma pessoa, conta várias', () => {
    const m = planejarMovimento([pessoa('1', null), pessoa('2', null)], ['1'], { equipeId: 'a', subgrupoId: null });
    expect(fraseDoMovimento(m, 'Alfa')).toBe('Pessoa 1 → Alfa');
    const v = planejarMovimento([pessoa('1', 'a'), pessoa('2', 'a')], ['1', '2'], { equipeId: null, subgrupoId: null });
    expect(fraseDoMovimento(v, null)).toBe('2 pessoas saíram da equipe');
  });
});
