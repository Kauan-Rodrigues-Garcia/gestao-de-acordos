/**
 * As divergências entre o 59 e o 58.
 *
 * ## O que se trava aqui
 *
 * **A classificação é o produto.** A lista crua de setembro/2026 tinha 1.213
 * NRs; depois de classificar, 6 pediam olho humano. Se `pedeAtencao` passar a
 * valer para mais de uma classe, a aba volta a afogar quem olha — que é
 * exatamente o defeito que ela nasceu para não ter.
 *
 * **Os números vêm como texto.** PostgREST devolve `numeric` como string, e um
 * `valor58` que chega `"0.00"` é verdadeiro em JavaScript. Somar string com
 * número concatena em silêncio.
 *
 * **A ordem das classes é a mesma nos dois lados.** O banco ordena e a tela
 * reordena depois de filtrar; se as ordens discordarem, a lista embaralha
 * quando alguém troca o filtro.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  porRpc: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  args: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      mock.args[nome] = args;
      const r = mock.porRpc[nome] ?? { data: null, error: null };
      return { then: (ok: (v: unknown) => unknown) => ok(r) };
    },
  },
}));

import {
  buscarDivergencias,
  buscarResumoDivergencias,
  esperaIntegracao,
  ORDEM_CLASSE,
  pedeAtencao,
  pedeImportacao,
  ROTULO_CLASSE,
  totalPorClasse,
  ultimoDiaPorSetor,
  type ClasseDivergencia,
  type ResumoDivergencia,
} from './divergencias.service';

/*
 * Uma das seis divergências reais de setembro/2026: a Andressa recebeu R$ 230
 * no dia 10, o 59 tem, o 58 do Play 3 (que já cobria o dia 11) não tem.
 */
const ANDRESSA = {
  setor_id: 'setor-play3',
  setor_nome: 'Play 3',
  cobradora: 'ANDRESSA_AIRES',
  operador_id: 'op-andressa',
  operador_nome: 'Andressa Aires',
  nr_documento: '12898434',
  dia: '2026-09-10',
  valor_59: '230.00',
  valor_58: '0.00',
  delta: '230.00',
  situacao: 'so_no_59' as const,
  classe: 'divergencia' as const,
  ultimo_dia_58: '2026-09-11',
};

const resumo = (over: Partial<ResumoDivergencia> = {}): ResumoDivergencia => ({
  setorId: 's1', setorNome: 'S1', ultimoDia58: '2026-09-11',
  classe: 'divergencia', nrs: 1, valor: 100,
  ...over,
});

beforeEach(() => { mock.porRpc = {}; mock.args = {}; });

describe('buscarDivergencias', () => {
  it('converte os números e preserva a identidade da linha', async () => {
    mock.porRpc = { fn_mestre_divergencias: { data: [ANDRESSA], error: null } };

    const [d] = await buscarDivergencias('emp-1', '2026-09');

    expect(d.nr).toBe('12898434');
    expect(d.operadorNome).toBe('Andressa Aires');
    expect(typeof d.valor59).toBe('number');
    expect(d.valor59).toBeCloseTo(230, 2);
    expect(d.valor58).toBe(0);
    expect(d.delta).toBeCloseTo(230, 2);
    expect(d.classe).toBe('divergencia');
    expect(d.ultimoDia58).toBe('2026-09-11');
  });

  /*
   * «0.00» é uma string, e string não vazia é verdadeira. Sem a conversão, um
   * lado zerado passa por preenchido e a soma dos cartões concatena.
   */
  it('zero que chega como texto vira zero de verdade', async () => {
    mock.porRpc = {
      fn_mestre_divergencias: {
        data: [{ ...ANDRESSA, valor_58: '0.00', valor_59: '0.00', delta: '0.00' }],
        error: null,
      },
    };
    const [d] = await buscarDivergencias('emp-1', '2026-09');
    expect(d.valor58 + d.valor59 + d.delta).toBe(0);
  });

  it('repassa os filtros para o banco, e null quando não há filtro', async () => {
    mock.porRpc = { fn_mestre_divergencias: { data: [], error: null } };

    await buscarDivergencias('emp-1', '2026-09');
    expect(mock.args.fn_mestre_divergencias).toMatchObject({
      p_setor_id: null, p_cobradora: null, p_classe: null, p_limite: 300,
    });

    await buscarDivergencias('emp-1', '2026-09', {
      setorId: 'setor-play3', cobradora: 'ANDRESSA_AIRES', classe: 'divergencia', limite: 50,
    });
    expect(mock.args.fn_mestre_divergencias).toMatchObject({
      p_setor_id: 'setor-play3', p_cobradora: 'ANDRESSA_AIRES',
      p_classe: 'divergencia', p_limite: 50,
    });
  });

  it('lista vazia não vira erro — é o estado de «nada divergindo»', async () => {
    mock.porRpc = { fn_mestre_divergencias: { data: null, error: null } };
    await expect(buscarDivergencias('emp-1', '2026-09')).resolves.toEqual([]);
  });

  it('erro do banco vira exceção com a mensagem do banco', async () => {
    mock.porRpc = {
      fn_mestre_divergencias: { data: null, error: { message: 'Sem acesso a esta empresa.' } },
    };
    await expect(buscarDivergencias('emp-1', '2026-09'))
      .rejects.toThrow('Sem acesso a esta empresa.');
  });
});

describe('buscarResumoDivergencias', () => {
  it('converte contagem e valor, que também vêm como texto', async () => {
    mock.porRpc = {
      fn_mestre_divergencias_resumo: {
        data: [{
          setor_id: 'setor-play1', setor_nome: 'Play 1', ultimo_dia_58: '2026-09-11',
          classe: 'aguardando_58', nrs: '142', valor: '46697.06',
        }],
        error: null,
      },
    };
    const [r] = await buscarResumoDivergencias('emp-1', '2026-09');
    expect(r.nrs).toBe(142);
    expect(r.valor).toBeCloseTo(46697.06, 2);
    expect(r.ultimoDia58).toBe('2026-09-11');
  });
});

describe('pedeAtencao / pedeImportacao', () => {
  /*
   * O ponto inteiro da aba. Antes de classificar, setembro dava 1.090 NRs de
   * «divergência»; a quase totalidade era 58 que não tinha sido importado. Se
   * mais alguma classe passar a pedir atenção, o ruído volta.
   */
  it('só `divergencia` pede olho humano', () => {
    const pedem = ORDEM_CLASSE.filter(pedeAtencao);
    expect(pedem).toEqual(['divergencia']);
  });

  it('58 atrasado pede importação, não conferência', () => {
    expect(pedeImportacao('aguardando_58')).toBe(true);
    expect(pedeImportacao('divergencia')).toBe(false);
  });

  /*
   * `sem_58` parece «falta importar» e não é. Jornada Play e Manutenção ainda
   * não foram integrados ao sistema de gestão: não existe 58 deles. Chamar isso
   * de importação pendente manda alguém procurar um arquivo que não existe, e
   * sugere que os R$ 197.401,20 estão errados quando estão certos — o 59 é a
   * única fonte daquele dinheiro até a integração acontecer.
   */
  it('setor não integrado não pede importação — não há o que importar', () => {
    expect(pedeImportacao('sem_58')).toBe(false);
    expect(esperaIntegracao('sem_58')).toBe(true);
    expect(esperaIntegracao('aguardando_58')).toBe(false);
    expect(ROTULO_CLASSE.sem_58.porque).toContain('integrado');
  });

  /*
   * `dia_aberto` é a classe que resolveu o grosso do ruído: o último dia
   * importado de cada setor é parcial. Ela não pede nada de ninguém — o dia
   * ainda vai fechar sozinho.
   */
  it('dia aberto e estrutural não pedem nada', () => {
    for (const c of ['dia_aberto', 'estrutural'] as ClasseDivergencia[]) {
      expect(pedeAtencao(c)).toBe(false);
      expect(pedeImportacao(c)).toBe(false);
    }
  });

  it('toda classe tem rótulo e explicação', () => {
    for (const c of ORDEM_CLASSE) {
      expect(ROTULO_CLASSE[c].curto.length).toBeGreaterThan(0);
      expect(ROTULO_CLASSE[c].porque.length).toBeGreaterThan(20);
    }
  });

  it('a divergência vem antes de tudo na ordem', () => {
    expect(ORDEM_CLASSE[0]).toBe('divergencia');
    expect(ORDEM_CLASSE).toHaveLength(5);
  });
});

describe('totalPorClasse', () => {
  it('soma os setores dentro de cada classe e respeita a ordem', () => {
    const t = totalPorClasse([
      resumo({ setorId: 's1', classe: 'sem_58', nrs: 256, valor: 122371.19 }),
      resumo({ setorId: 's2', classe: 'sem_58', nrs: 371, valor: 74622.86 }),
      resumo({ setorId: 's3', classe: 'divergencia', nrs: 6, valor: 1174.08 }),
    ]);

    expect(t.map(x => x.classe)).toEqual(['divergencia', 'sem_58']);
    expect(t[0].nrs).toBe(6);
    expect(t[1].nrs).toBe(627);
    expect(t[1].valor).toBeCloseTo(196994.05, 2);
  });

  it('classe ausente não aparece com zero', () => {
    const t = totalPorClasse([resumo({ classe: 'divergencia' })]);
    expect(t).toHaveLength(1);
  });
});

describe('ultimoDiaPorSetor', () => {
  it('devolve um dia por setor, mesmo com várias classes', () => {
    const mapa = ultimoDiaPorSetor([
      resumo({ setorId: 'p1', classe: 'divergencia', ultimoDia58: '2026-09-11' }),
      resumo({ setorId: 'p1', classe: 'dia_aberto', ultimoDia58: '2026-09-11' }),
      resumo({ setorId: 'rec', classe: 'dia_aberto', ultimoDia58: '2026-09-14' }),
    ]);
    expect(mapa.get('p1')).toBe('2026-09-11');
    expect(mapa.get('rec')).toBe('2026-09-14');
    expect(mapa.size).toBe(2);
  });

  /* Setor que não importou o 58 tem `null` — e `null` é a informação, não a
     ausência dela: é o que faz a tela dizer «não importou» em vez de «—». */
  it('setor sem 58 fica com null, e não some do mapa', () => {
    const mapa = ultimoDiaPorSetor([
      resumo({ setorId: 'jornada', classe: 'sem_58', ultimoDia58: null }),
    ]);
    expect(mapa.has('jornada')).toBe(true);
    expect(mapa.get('jornada')).toBeNull();
  });
});
