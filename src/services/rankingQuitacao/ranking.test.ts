import { describe, expect, it } from 'vitest';
import {
  atualizarLembranca, categoriasDaDisputa, configParaGravar, escolherDisputa, faltaParaPassar, lerConfig, normalizarRanking,
  posicoesComPremio, premioTexto, resumoDaConfig, setoresQueFicamSemQuitacao, variacao, CONFIG_PADRAO,
} from './ranking';

const pos = (posicao: number, extra: Record<string, unknown> = {}) => ({
  posicao, id: `p${posicao}`, nome: `P${posicao}`, foto: null, quitacoes: 10 - posicao, valor: 1000 - posicao * 10, ...extra,
});

describe('normalizarRanking — o mesmo leitor da aba e da TV', () => {
  it('desligado', () => {
    expect(normalizarRanking({ habilitado: false }).habilitado).toBe(false);
    expect(normalizarRanking(null).habilitado).toBe(false);
  });

  it('pacote antigo (antes de 20261111150500): uma disputa, prêmio pela tabela', () => {
    const r = normalizarRanking({
      habilitado: true, premios: [350, 250, 0], participantes: 12, importado_em: '2026-11-11T10:00:00Z',
      posicoes: [pos(2), pos(1), pos(3), pos(4)],
    });
    expect(r.criterio).toBe('valor');
    expect(r.disputas).toHaveLength(1);
    const d = r.disputas[0];
    expect(d.posicoes.map(p => p.posicao)).toEqual([1, 2, 3, 4]);
    expect(d.posicoes.map(p => p.premio)).toEqual([350, 250, null, null]);
    expect(d.participantes).toBe(12);
    // O 3º com R$ 0 não é posição premiada.
    expect(r.posicoes_premiadas).toBe(2);
  });

  it('sem prêmio: só o ranking, sem R$ 0, sem zona e sem «abaixo do mínimo»', () => {
    for (const premios of [[], [0, 0, 0, 0, 0, 0]]) {
      const r = normalizarRanking({
        habilitado: true, premios, premios_texto: [], minimo_quitacoes: 3, participantes: 4,
        disputas: [{ equipe_id: null, participantes: 4, posicoes: [
          pos(1, { premio: null, abaixo_minimo: false }),
          pos(2, { premio: 0, quitacoes: 1, abaixo_minimo: true }),
        ] }],
      });
      expect(r.posicoes_premiadas).toBe(0);
      const [a, b] = r.disputas[0].posicoes;
      expect([a.premio, b.premio]).toEqual([null, null]);
      expect(b.abaixo_minimo).toBe(false);
      expect(premioTexto(a)).toBe('');
    }
  });

  it('posições premiadas: até o último com valor ou brinde', () => {
    expect(posicoesComPremio([350, 250, 0, 0], [])).toBe(2);
    expect(posicoesComPremio([0, 0, 0], ['', '', 'Troféu'])).toBe(3);
    expect(posicoesComPremio([], [])).toBe(0);
  });

  it('pacote da aba antiga, com operador_id e foto_url', () => {
    const r = normalizarRanking({
      habilitado: true, premios: [], posicoes: [{ posicao: 1, operador_id: 'x', nome: 'X', foto_url: 'f.png', quitacoes: 2, valor: '10.5' }],
    });
    expect(r.disputas[0].posicoes[0]).toMatchObject({ operador_id: 'x', foto_url: 'f.png', valor: 10.5 });
  });

  it('pacote novo: prêmio e brinde da linha, abaixo do mínimo, destaques e eu', () => {
    const r = normalizarRanking({
      habilitado: true, criterio: 'quantidade', disputa: 'equipe', minimo_quitacoes: 3,
      premios: [100, 50], premios_texto: ['Troféu', ''], participantes: 5,
      disputas: [
        { equipe_id: 'e1', nome: 'Rosa', participantes: 3, quitacoes_total: 9, valor_total: 900,
          posicoes: [pos(1, { premio: 100, premio_texto: 'Troféu' }), pos(2, { premio: null, abaixo_minimo: true })] },
        { equipe_id: 'e2', nome: 'Azul', participantes: 2, quitacoes_total: 4, valor_total: 400, posicoes: [pos(1)] },
      ],
      categorias: [
        { id: 'maior_quitacao', premio: 0, premio_texto: 'Pizza', vencedor: { id: 'p1', nome: 'P1', foto: null, quitacoes: 1, valor: 500 } },
        { id: 'desconhecida', vencedor: null },
      ],
      eu: { posicao: 2, quitacoes: 2, valor: 20, equipe_id: 'e2', acima_posicao: 1, acima_valor: 30, acima_quitacoes: 4, acima_nome: 'P1' },
    });
    expect(r.criterio).toBe('quantidade');
    expect(r.disputa).toBe('equipe');
    expect(r.disputas[0].posicoes[0]).toMatchObject({ premio: 100, premio_texto: 'Troféu' });
    expect(r.disputas[0].posicoes[1].abaixo_minimo).toBe(true);
    expect(r.categorias).toHaveLength(1);
    expect(r.categorias[0]).toMatchObject({ titulo: 'Maior quitação', premio: null, premio_texto: 'Pizza' });
    expect(r.eu?.acima).toEqual({ posicao: 1, valor: 30, quitacoes: 4, nome: 'P1' });
    // Sem equipe pedida: a de quem está olhando.
    expect(escolherDisputa(r, null)?.equipe_id).toBe('e2');
    expect(escolherDisputa(r, 'e1')?.nome).toBe('Rosa');
    expect(escolherDisputa(r, 'nenhuma')?.equipe_id).toBe('e2');
  });
});

describe('faltaParaPassar', () => {
  it('por valor: a diferença mais um centavo', () => {
    expect(faltaParaPassar('valor', { valor: 26960.04, quitacoes: 1 }, { valor: 23604, quitacoes: 9 })).toBeCloseTo(3356.05, 2);
    expect(faltaParaPassar('valor', { valor: 1000, quitacoes: 1 }, { valor: 1000, quitacoes: 1 })).toBe(0.01);
  });
  it('por quantidade: as quitações que faltam, nunca menos de 1', () => {
    expect(faltaParaPassar('quantidade', { valor: 0, quitacoes: 9 }, { valor: 0, quitacoes: 6 })).toBe(3);
    expect(faltaParaPassar('quantidade', { valor: 900, quitacoes: 6 }, { valor: 100, quitacoes: 6 })).toBe(1);
  });
});

describe('a configuração', () => {
  it('lê o vazio como o padrão de hoje', () => {
    expect(lerConfig(undefined)).toEqual(CONFIG_PADRAO);
    expect(lerConfig({ criterio: 'x', disputa: 'y' })).toEqual(CONFIG_PADRAO);
  });

  it('grava os brindes do tamanho dos prêmios, sem espaço sobrando', () => {
    const g = configParaGravar({
      ...CONFIG_PADRAO, disputa: 'equipe', equipes_fora: ['a', 'a'], minimo_quitacoes: 2.7,
      premios_texto: ['  Troféu ', '', 'sobra'],
      categorias: [{ id: 'equipe_campea', ativo: true, premio: 0, premio_texto: ' Pizza ' }],
    }, 2);
    expect(g).toMatchObject({
      disputa: 'equipe', equipes_fora: ['a'], minimo_quitacoes: 2, premios_texto: ['Troféu', ''],
      categorias: [{ id: 'equipe_campea', ativo: true, premio: null, premio_texto: 'Pizza' }],
    });
    expect(configParaGravar(CONFIG_PADRAO, 3).premios_texto).toEqual([]);
  });

  it('resumo de uma linha', () => {
    expect(resumoDaConfig(CONFIG_PADRAO, 6)).toBe('Setor inteiro · por valor · 6 posições premiadas');
    expect(resumoDaConfig({ ...CONFIG_PADRAO, disputa: 'equipe', criterio: 'quantidade', minimo_quitacoes: 3,
      categorias: [{ id: 'maior_valor', ativo: true, premio: 10, premio_texto: '' }] }, 1))
      .toBe('Cada equipe disputa · por quantidade · 1 posição premiada · 1 destaque · mínimo 3');
  });
});

describe('o prêmio em texto', () => {
  it('valor, brinde ou os dois', () => {
    expect(premioTexto({ premio: 350, premio_texto: null })).toBe('R$ 350');
    expect(premioTexto({ premio: null, premio_texto: 'Folga' })).toBe('Folga');
    expect(premioTexto({ premio: 100.5, premio_texto: 'Troféu' })).toBe('R$ 100,50 + Troféu');
  });
});

describe('subiu / desceu desde o último relatório visto', () => {
  const linha = (id: string, posicao: number) => ({
    posicao, operador_id: id, nome: id, foto_url: null, equipe_id: null, equipe_nome: null,
    quitacoes: 1, valor: 1, premio: null, premio_texto: null, abaixo_minimo: false,
  });

  it('só troca a lembrança quando chega relatório novo', () => {
    let l = atualizarLembranca({ atual: null, anterior: null }, 'r1', [linha('a', 1), linha('b', 2)]);
    expect(variacao(l, linha('a', 1))).toBeNull();
    // Recarregou a página com o mesmo relatório: nada muda.
    l = atualizarLembranca(l, 'r1', [linha('a', 1), linha('b', 2)]);
    expect(l.anterior).toBeNull();
    l = atualizarLembranca(l, 'r2', [linha('b', 1), linha('a', 2), linha('c', 3)]);
    expect(variacao(l, linha('b', 1))).toBe(1);
    expect(variacao(l, linha('a', 2))).toBe(-1);
    expect(variacao(l, linha('c', 3))).toBe('novo');
    // E a seta continua depois de recarregar.
    l = atualizarLembranca(l, 'r2', [linha('b', 1), linha('a', 2), linha('c', 3)]);
    expect(variacao(l, linha('b', 1))).toBe(1);
  });
});

describe('categoriasDaDisputa — destaques por equipe (20261112200000)', () => {
  const venc = (id: string) => ({ id, nome: id.toUpperCase(), foto: null, quitacoes: 3, valor: 300 });
  const bruto = (disputa: 'setor' | 'equipe', comDaEquipe = true) => ({
    habilitado: true, disputa, premios: [], participantes: 4,
    disputas: [
      { equipe_id: 'e1', nome: 'Rosa', participantes: 2, quitacoes_total: 5, valor_total: 500, posicoes: [pos(1)],
        ...(comDaEquipe ? { categorias: [{ id: 'mais_quitacoes', vencedor: venc('rosa1') }, { id: 'maior_valor', vencedor: venc('rosa2') }] } : {}) },
      { equipe_id: 'e2', nome: 'Azul', participantes: 2, quitacoes_total: 3, valor_total: 300, posicoes: [pos(1)],
        ...(comDaEquipe ? { categorias: [{ id: 'mais_quitacoes', vencedor: venc('azul1') }, { id: 'maior_valor', vencedor: null }] } : {}) },
    ],
    categorias: [
      { id: 'maior_valor', vencedor: venc('setor2') },
      { id: 'equipe_campea', vencedor: { id: 'e1', nome: 'Rosa', quitacoes: 5, valor: 500, equipe: true } },
      { id: 'mais_quitacoes', vencedor: venc('setor1') },
    ],
  });

  it('por equipe: os da equipe na tela, a Equipe campeã do setor, na ordem da configuração', () => {
    const r = normalizarRanking(bruto('equipe'));
    const azul = categoriasDaDisputa(r, escolherDisputa(r, 'e2'));
    expect(azul.map(c => c.id)).toEqual(['maior_valor', 'equipe_campea', 'mais_quitacoes']);
    expect(azul.map(c => c.vencedor?.id ?? null)).toEqual([null, 'e1', 'azul1']);
    const rosa = categoriasDaDisputa(r, escolherDisputa(r, 'e1'));
    expect(rosa.map(c => c.vencedor?.id)).toEqual(['rosa2', 'e1', 'rosa1']);
  });

  it('pacote de antes (sem destaques por disputa) e disputa do setor: os do setor', () => {
    const antigo = normalizarRanking(bruto('equipe', false));
    expect(categoriasDaDisputa(antigo, escolherDisputa(antigo, 'e2')).map(c => c.vencedor?.id)).toEqual(['setor2', 'e1', 'setor1']);
    const setor = normalizarRanking(bruto('setor'));
    expect(categoriasDaDisputa(setor, escolherDisputa(setor, null))).toBe(setor.categorias);
  });
});

describe('setoresQueFicamSemQuitacao — o aviso da importação (12/11/2026)', () => {
  it('só o setor que tinha quitação e fica sem nenhuma', () => {
    const setores = [
      { setor_nome: 'Play 2', no_banco: 110, no_arquivo: 110 },
      { setor_nome: 'Play 3', no_banco: 80, no_arquivo: 0 },
      { setor_nome: 'Play 5', no_banco: 0, no_arquivo: 12 },
      { setor_nome: 'Play Mix', no_banco: 30, no_arquivo: 25 },
    ];
    expect(setoresQueFicamSemQuitacao(setores).map(s => s.setor_nome)).toEqual(['Play 3']);
  });
});
