import { describe, expect, it } from 'vitest';
import {
  MIN_PERGUNTAS, PERGUNTAS_PADRAO, PROPORCAO_CARTAO, aplicarDesempates, apurar, cedulaComTodos, empatadas,
  contarCedulas, empatesPendentes, forcarEmpates, situacaoDasDecisoes, jaEscolhidos, maximoDeRespostas, melhorGrade, simularCedulas,
  quadroDeTitulos, simularVotos, somarMeusVotos, type Candidato,
} from './cedula';

const lider = (id: string, nome: string): Candidato => ({ id, nome, foto: null, setor: 'Play 1', perfil: 'lider' });
const lideres = (n: number) => Array.from({ length: n }, (_, i) => lider(`l${i + 1}`, `Líder ${String(i + 1).padStart(2, '0')}`));

describe('perguntas padrão', () => {
  it('tem pelo menos 15, com ids únicos', () => {
    expect(PERGUNTAS_PADRAO.length).toBeGreaterThanOrEqual(MIN_PERGUNTAS);
    expect(new Set(PERGUNTAS_PADRAO.map(p => p.id)).size).toBe(PERGUNTAS_PADRAO.length);
  });
});

describe('cedulaComTodos', () => {
  it('todos os líderes em todas as perguntas, na mesma ordem alfabética', () => {
    const gente = [lider('c', 'Érica'), lider('a', 'bruno'), lider('b', 'Ana')];
    const cedula = cedulaComTodos(PERGUNTAS_PADRAO, gente);
    expect(cedula).toHaveLength(PERGUNTAS_PADRAO.length);
    for (const item of cedula) expect(item.candidatos).toEqual(['b', 'a', 'c']);
  });
});

describe('melhorGrade', () => {
  const cabe = (n: number, W: number, H: number, espaco = 12) => {
    const g = melhorGrade(n, W, H, { espaco });
    const linhas = Math.ceil(n / g.colunas);
    return {
      g,
      larguraUsada: g.colunas * g.largura + espaco * (g.colunas - 1),
      alturaUsada: linhas * g.largura * PROPORCAO_CARTAO + espaco * (linhas - 1),
    };
  };

  it.each([
    [4, 1200, 600], [12, 1200, 600], [25, 1200, 560], [40, 1600, 760], [30, 1280, 520],
  ])('%i líderes em %ix%i: cabe sem rolar', (n, W, H) => {
    const { g, larguraUsada, alturaUsada } = cabe(n, W, H);
    expect(g.rola).toBe(false);
    expect(larguraUsada).toBeLessThanOrEqual(W);
    expect(alturaUsada).toBeLessThanOrEqual(H);
  });

  it('poucos líderes não viram fotos gigantes', () => {
    expect(melhorGrade(3, 1600, 900).largura).toBe(210);
  });

  it('25 líderes numa tela larga e baixa: mais colunas que linhas', () => {
    const g = melhorGrade(25, 1280, 520);
    expect(g.colunas).toBeGreaterThan(Math.ceil(25 / g.colunas));
  });

  it('muitos líderes no celular: usa o tamanho mínimo e rola', () => {
    const g = melhorGrade(40, 360, 520);
    expect(g.rola).toBe(true);
    expect(g.largura).toBeGreaterThanOrEqual(76);
    expect(g.colunas).toBe(4);
  });
});

describe('votos e apuração', () => {
  it('cada líder: no máximo um voto por pergunta, nunca em si, e cada colega uma vez só', () => {
    const gente = lideres(10);
    const ids = gente.map(l => l.id);
    const cedula = cedulaComTodos(PERGUNTAS_PADRAO, gente);
    const cedulas = simularCedulas(cedula, ids, 3);
    for (const eleitor of ids) {
      const escolhas = Object.values(cedulas[eleitor]);
      expect(escolhas).not.toContain(eleitor);
      expect(new Set(escolhas).size).toBe(escolhas.length); // ninguém repetido
      // 10 líderes: 9 colegas, então 9 das 24 perguntas — o máximo possível.
      expect(escolhas).toHaveLength(maximoDeRespostas(ids.length, PERGUNTAS_PADRAO.length));
    }
    const votos = contarCedulas(cedula, cedulas);
    const total = Object.values(votos).flatMap(c => Object.values(c)).reduce((x, y) => x + y, 0);
    expect(total).toBe(ids.length * 9);
    expect(simularVotos(cedula, ids, 3)).toEqual(votos);
  });

  it('com mais colegas que perguntas, todo mundo responde todas', () => {
    const gente = lideres(30);
    const cedulas = simularCedulas(cedulaComTodos(PERGUNTAS_PADRAO, gente), gente.map(l => l.id), 5);
    for (const c of Object.values(cedulas)) expect(Object.keys(c)).toHaveLength(PERGUNTAS_PADRAO.length);
  });

  it('jaEscolhidos: trava quem já foi escolhido em outra pergunta, não na atual', () => {
    const meus = { comunicativo: 'bianca', organizado: 'carlos' };
    expect(jaEscolhidos(meus).get('bianca')).toBe('comunicativo');
    expect(jaEscolhidos(meus, 'comunicativo').has('bianca')).toBe(false); // ali dá para trocar
    expect(jaEscolhidos(meus, 'comunicativo').get('carlos')).toBe('organizado');
  });

  it('maximoDeRespostas: um colega por pergunta', () => {
    expect(maximoDeRespostas(22, 24)).toBe(21);
    expect(maximoDeRespostas(40, 24)).toBe(24);
    expect(maximoDeRespostas(1, 24)).toBe(0);
  });

  it('soma o meu voto, ordena, corta a porcentagem e acha o empate', () => {
    const cedula = [{ pergunta: PERGUNTAS_PADRAO[0], candidatos: ['a', 'b', 'c'] }];
    const votos = somarMeusVotos({ [PERGUNTAS_PADRAO[0].id]: { a: 1, b: 2, c: 0 } }, { [PERGUNTAS_PADRAO[0].id]: 'a' });
    const [r] = apurar(cedula, votos);
    expect(r.total).toBe(4);
    expect(r.vencedores.sort()).toEqual(['a', 'b']);
    expect(r.linhas.map(l => l.pct)).toEqual([50, 50, 0]);
    expect(quadroDeTitulos([r]).map(q => q.id).sort()).toEqual(['a', 'b']);
  });

  it('2 de 3 dá 66,6% (corta, não arredonda)', () => {
    const cedula = [{ pergunta: PERGUNTAS_PADRAO[0], candidatos: ['a', 'b', 'c'] }];
    const [r] = apurar(cedula, { [PERGUNTAS_PADRAO[0].id]: { a: 2, b: 1 } });
    expect(r.linhas[0].pct).toBe(66.6);
    expect(r.vencedores).toEqual(['a']);
  });
});

describe('desempate da diretoria', () => {
  const P = PERGUNTAS_PADRAO[0];
  const cedula = [{ pergunta: P, candidatos: ['a', 'b', 'c'] }];
  const [empate] = apurar(cedula, { [P.id]: { a: 3, b: 3, c: 1 } });

  it('acha o empate e conta o que falta decidir', () => {
    expect(empatadas([empate])).toHaveLength(1);
    expect(empatesPendentes([empate], {})).toBe(1);
    expect(empatesPendentes([empate], { [P.id]: 'd' })).toBe(1); // d não tem voto: não vale
    expect(empatesPendentes([empate], { [P.id]: 'b' })).toBe(0);
    expect(empatesPendentes([empate], { [P.id]: 'c' })).toBe(0); // desde 10/11: quem tem voto pode levar
  });

  it('o escolhido vira o único vencedor e sobe para o 1º; votos iguais', () => {
    const [r] = aplicarDesempates([empate], { [P.id]: 'b' });
    expect(r.vencedores).toEqual(['b']);
    expect(r.desempatado).toBe(true);
    expect(r.linhas.map(l => l.id)).toEqual(['b', 'a', 'c']);
    expect(r.linhas.map(l => l.votos)).toEqual([3, 3, 1]);
    expect(quadroDeTitulos([r]).map(q => q.id)).toEqual(['b']);
  });

  it('manter o único 1º, ou escolher quem não tem voto, não muda nada', () => {
    const [claro] = apurar(cedula, { [P.id]: { a: 4, b: 2 } });
    expect(aplicarDesempates([claro], { [P.id]: 'a' })[0]).toBe(claro);
    expect(aplicarDesempates([claro], { [P.id]: 'c' })[0]).toBe(claro);
  });

  it('a escolha da diretoria pode ser o 2º mais votado: ele vai para o 1º lugar', () => {
    const [claro] = apurar(cedula, { [P.id]: { a: 4, b: 2 } });
    const [r] = aplicarDesempates([claro], { [P.id]: 'b' });
    expect(r.vencedores).toEqual(['b']);
    expect(r.linhas.map(l => [l.id, l.votos])).toEqual([['b', 2], ['a', 4], ['c', 0]]);
  });

  it('a demonstração força empates sem criar voto', () => {
    const gente = lideres(20);
    const ced = cedulaComTodos(PERGUNTAS_PADRAO, gente);
    const votos = simularVotos(ced, gente.map(l => l.id), 11);
    const forcados = forcarEmpates(votos, ced, 3, 11);
    const soma = (v: typeof votos) => Object.values(v).flatMap(c => Object.values(c)).reduce((x, y) => x + y, 0);
    expect(soma(forcados)).toBe(soma(votos));
    expect(empatadas(apurar(ced, forcados)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('o mesmo líder em 1º em mais de uma categoria (10/11/2026)', () => {
  const [P1, P2, P3] = PERGUNTAS_PADRAO;
  const cedula = [P1, P2, P3].map(pergunta => ({ pergunta, candidatos: ['a', 'b', 'c', 'd'] }));
  // A Ana em 1º em P1 (3×2 Bruno) e em P2 (sozinha); Carla em 1º em P3, Bruno com 1 voto em P3.
  const res = apurar(cedula, { [P1.id]: { a: 3, b: 2 }, [P2.id]: { a: 2 }, [P3.id]: { c: 2, b: 1 } });

  it('as duas da Ana pedem decisão; a P3 não', () => {
    const d = situacaoDasDecisoes(res, {});
    expect(d.pendentes).toBe(2);
    expect(d.porPergunta.get(P1.id)).toMatchObject({ pendente: true, empate: false });
    expect(d.porPergunta.get(P1.id)!.repetidos).toEqual([{ id: 'a', outras: [P2] }]);
    expect(d.porPergunta.get(P3.id)).toMatchObject({ pendente: false, decidida: false });
  });

  it('dar P1 ao Bruno resolve as duas', () => {
    const d = situacaoDasDecisoes(res, { [P1.id]: 'b' });
    expect(d.pendentes).toBe(0);
    expect(d.titulos.get('a')).toEqual([P2]);
    expect(d.titulos.get('b')).toEqual([P1]);
  });

  it('manter a Ana numa não dispensa a outra; nas duas, libera', () => {
    expect(situacaoDasDecisoes(res, { [P1.id]: 'a' }).pendentes).toBe(1);
    expect(situacaoDasDecisoes(res, { [P1.id]: 'a', [P2.id]: 'a' }).pendentes).toBe(0);
  });

  it('dar a categoria a quem já leva outra deixa a outra pendente', () => {
    // P1 vai para o Bruno; e se o Bruno também fosse o 1º de P3? Só com a Carla tirada de P3.
    const res2 = apurar(cedula, { [P1.id]: { a: 3, b: 2 }, [P2.id]: { a: 2 }, [P3.id]: { b: 2, c: 1 } });
    const d = situacaoDasDecisoes(res2, { [P1.id]: 'b' });
    expect(d.porPergunta.get(P3.id)).toMatchObject({ pendente: true });
    expect(d.porPergunta.get(P2.id)).toMatchObject({ pendente: false });
  });
});
