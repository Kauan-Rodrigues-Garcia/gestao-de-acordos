/**
 * calcularDesafio.test.ts
 *
 * O motor de gincanas, sem banco.
 *
 * Os casos aqui são os do pedido: a conta individual, o ranking por critério, a
 * ultrapassagem, a disputa entre equipes, o desafio que atravessa a virada do
 * mês e — o mais importante — a prova de que trocar de campanha é trocar de
 * CONFIGURAÇÃO, não de código.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularDesafio, diasRestantes, faltaParaMeta, participaDaCampanha,
  progressoDaMeta, situacaoDoPeriodo, somarPorOperador, chaveDeLogin,
} from './calcularDesafio';
import type {
  Desafio, LinhaDesafio, PessoaDesafio, RegraDesafio, VisualDesafio,
} from './types';

/**
 * Sobrescrita parcial do desafio.
 *
 * `regra` e `visual` entram como fragmentos: um teste que só quer trocar o
 * critério nao deveria ter de repetir os outros sete campos da regra.
 */
type OverDesafio = Partial<Omit<Desafio, 'regra' | 'visual'>> & {
  regra?: Partial<RegraDesafio>;
  visual?: Partial<VisualDesafio>;
};

// ── Fixtures ────────────────────────────────────────────────────────────────

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
    ...over,
  };
}

function linha(operadorId: string, total: number, qtd = 1, setorId = 'setorA'): LinhaDesafio {
  return { operador_id: operadorId, setor_id: setorId, total, total_ho: 0, qtd };
}

function desafio(over: OverDesafio = {}): Desafio {
  return {
    id: 'd1',
    empresaId: 'emp1',
    nome: 'Campanha',
    descricao: null,
    premio: null,
    dataInicio: '2026-08-21',
    dataFim: '2026-08-28',
    tipo: 'bater_meta',
    status: 'ativo',
    criadoPor: null,
    criadoPorNome: null,
    criadoEm: '',
    atualizadoEm: '',
    ...over,
    regra: {
      versao: 1,
      metrica: 'valor_recebido',
      modo: ['individual', 'equipe'],
      criterioRanking: 'menor_falta',
      escopoDisputa: 'empresa',
      premiacao: 'melhor_colocado',
      metaIndividual: 20000,
      metasPorOperador: {},
      metaEquipe: 80000,
      metaColetiva: null,
      participantes: { setores: [], equipes: [], operadores: [] },
      ...(over.regra ?? {}),
    },
    visual: {
      tema: 'padrao', icone: 'trophy', mostrarFotos: true,
      animarUltrapassagem: true, comemorarMeta: true,
      ...(over.visual ?? {}),
    },
  };
}

// ── Peças ───────────────────────────────────────────────────────────────────

describe('faltaParaMeta e progressoDaMeta', () => {
  it('falta é MAX(meta - recebido, 0)', () => {
    expect(faltaParaMeta(17_420, 20_000)).toBe(2_580);
    expect(faltaParaMeta(20_184, 20_000)).toBe(0);
  });

  it('sem meta não falta nada e o progresso é zero', () => {
    expect(faltaParaMeta(5_000, null)).toBe(0);
    expect(progressoDaMeta(5_000, null)).toBe(0);
    expect(progressoDaMeta(5_000, 0)).toBe(0);
  });

  it('passar de 100% é resultado, não erro', () => {
    expect(progressoDaMeta(17_420, 20_000)).toBeCloseTo(87.1, 1);
    expect(progressoDaMeta(24_000, 20_000)).toBe(120);
  });
});

describe('somarPorOperador', () => {
  it('junta as linhas do mesmo operador vindas de setores diferentes', () => {
    const somas = somarPorOperador([
      linha('a', 1_000, 2, 'setorA'),
      linha('a', 500, 1, 'setorB'),
      linha('b', 300, 1),
    ]);
    expect(somas.get('a')).toEqual({ total: 1_500, qtd: 3 });
    expect(somas.get('b')).toEqual({ total: 300, qtd: 1 });
  });
});

describe('participaDaCampanha', () => {
  const p = pessoa({ id: 'a', nome: 'Ana', setores: ['setorA'], equipes: ['eq1'] });

  it('lista vazia significa SEM recorte, não «ninguém»', () => {
    expect(participaDaCampanha(p, desafio())).toBe(true);
  });

  it('respeita o recorte por setor, equipe e operador', () => {
    expect(participaDaCampanha(p, desafio({
      regra: { participantes: { setores: ['setorB'], equipes: [], operadores: [] } },
    }))).toBe(false);

    expect(participaDaCampanha(p, desafio({
      regra: { participantes: { setores: [], equipes: ['eq1'], operadores: [] } },
    }))).toBe(true);

    expect(participaDaCampanha(p, desafio({
      regra: { participantes: { setores: [], equipes: [], operadores: ['outro'] } },
    }))).toBe(false);
  });

  it('conta o setor em que a pessoa é clone, não só o do cadastro', () => {
    const clonada = pessoa({ id: 'c', nome: 'Cleber', setores: ['setorA', 'digital'] });
    expect(participaDaCampanha(clonada, desafio({
      regra: { participantes: { setores: ['digital'], equipes: [], operadores: [] } },
    }))).toBe(true);
  });
});

// ── O cálculo ───────────────────────────────────────────────────────────────

describe('calcularDesafio — individual', () => {
  const participantes = [
    pessoa({ id: 'a', nome: 'Ana' }),
    pessoa({ id: 'b', nome: 'Bruno' }),
    pessoa({ id: 'k', nome: 'Kauan' }),
  ];

  it('calcula recebido, falta, progresso e posição', () => {
    const r = calcularDesafio({
      desafio: desafio(),
      dados: {
        participantes,
        linhas: [linha('a', 19_000, 5), linha('k', 17_420, 4), linha('b', 12_000, 3)],
      },
    });

    expect(r.individual.map(i => i.pessoa.nome)).toEqual(['Ana', 'Kauan', 'Bruno']);
    const kauan = r.individual[1];
    expect(kauan.posicao).toBe(2);
    expect(kauan.recebido).toBe(17_420);
    expect(kauan.falta).toBe(2_580);
    expect(kauan.progresso).toBeCloseTo(87.1, 1);
    // A distância é em dinheiro, para quem está imediatamente acima.
    expect(kauan.paraUltrapassar).toBe(1_580);
    expect(kauan.nomeAcima).toBe('Ana');
    expect(r.individual[0].paraUltrapassar).toBeNull();
  });

  it('participante sem nenhuma linha entra zerado, não some', () => {
    const r = calcularDesafio({
      desafio: desafio(),
      dados: { participantes, linhas: [linha('a', 1_000)] },
    });
    expect(r.totalParticipantes).toBe(3);
    expect(r.individual.find(i => i.pessoa.id === 'b')?.recebido).toBe(0);
  });

  it('férias e desligamento somem do ranking', () => {
    const r = calcularDesafio({
      desafio: desafio(),
      dados: { participantes, linhas: [linha('a', 1_000)] },
      ocultos: new Set(['b']),
    });
    expect(r.individual.map(i => i.pessoa.id)).not.toContain('b');
    expect(r.totalParticipantes).toBe(2);
  });

  it('bater a meta é marcado, e passar dela não é erro', () => {
    const r = calcularDesafio({
      desafio: desafio(),
      dados: { participantes, linhas: [linha('a', 24_000)] },
    });
    const ana = r.individual.find(i => i.pessoa.id === 'a')!;
    expect(ana.bateuMeta).toBe(true);
    expect(ana.falta).toBe(0);
    expect(ana.progresso).toBe(120);
  });
});

describe('calcularDesafio — critério do ranking', () => {
  const participantes = [
    pessoa({ id: 'a', nome: 'Ana' }),
    pessoa({ id: 'b', nome: 'Bruno' }),
  ];
  const linhas = [linha('a', 10_000), linha('b', 9_500)];

  it('«maior recebido» ordena pelo valor', () => {
    const r = calcularDesafio({
      desafio: desafio({ regra: { criterioRanking: 'maior_recebido' } }),
      dados: { participantes, linhas },
    });
    expect(r.individual.map(i => i.pessoa.id)).toEqual(['a', 'b']);
  });

  it('«maior percentual» concorda com o valor quando a meta é a mesma', () => {
    const r = calcularDesafio({
      desafio: desafio({ regra: { criterioRanking: 'maior_percentual' } }),
      dados: { participantes, linhas },
    });
    expect(r.individual.map(i => i.pessoa.id)).toEqual(['a', 'b']);
  });

  it('sem meta, «menor falta» não trava tudo em zero — cai no valor', () => {
    const r = calcularDesafio({
      desafio: desafio({
        regra: { criterioRanking: 'menor_falta', metaIndividual: null },
      }),
      dados: { participantes, linhas },
    });
    expect(r.individual.map(i => i.pessoa.id)).toEqual(['a', 'b']);
  });

  it('empate é desfeito pelo nome, para a ordem não oscilar entre leituras', () => {
    const r1 = calcularDesafio({
      desafio: desafio(),
      dados: { participantes, linhas: [linha('a', 5_000), linha('b', 5_000)] },
    });
    const r2 = calcularDesafio({
      desafio: desafio(),
      dados: { participantes: [...participantes].reverse(), linhas: [linha('b', 5_000), linha('a', 5_000)] },
    });
    expect(r1.individual.map(i => i.pessoa.id)).toEqual(r2.individual.map(i => i.pessoa.id));
  });
});

describe('calcularDesafio — a ultrapassagem', () => {
  it('B passa A quando o recebimento de B cresce', () => {
    const participantes = [pessoa({ id: 'a', nome: 'Ana' }), pessoa({ id: 'b', nome: 'Bruno' })];

    const antes = calcularDesafio({
      desafio: desafio(),
      dados: { participantes, linhas: [linha('a', 10_000), linha('b', 9_500)] },
    });
    expect(antes.individual.map(i => i.pessoa.id)).toEqual(['a', 'b']);
    expect(antes.individual[1].paraUltrapassar).toBe(500);

    const depois = calcularDesafio({
      desafio: desafio(),
      dados: { participantes, linhas: [linha('a', 10_000), linha('b', 10_500)] },
    });
    expect(depois.individual.map(i => i.pessoa.id)).toEqual(['b', 'a']);
    expect(depois.individual[0].posicao).toBe(1);
    expect(depois.individual[1].paraUltrapassar).toBe(500);
  });
});

describe('calcularDesafio — equipes', () => {
  const participantes = [
    pessoa({ id: 'a', nome: 'Ana',    equipeId: 'eq1', equipeNome: 'PLAY 1' }),
    pessoa({ id: 'b', nome: 'Bruno',  equipeId: 'eq1', equipeNome: 'PLAY 1' }),
    pessoa({ id: 'c', nome: 'Carla',  equipeId: 'eq2', equipeNome: 'PLAY 2' }),
  ];

  it('consolida por equipe do cadastro e ordena pelo mesmo critério', () => {
    const r = calcularDesafio({
      desafio: desafio(),
      dados: {
        participantes,
        linhas: [linha('a', 40_000), linha('b', 32_450), linha('c', 50_000)],
      },
    });

    expect(r.equipes.map(e => e.equipeNome)).toEqual(['PLAY 1', 'PLAY 2']);
    const play1 = r.equipes[0];
    expect(play1.recebido).toBe(72_450);
    expect(play1.falta).toBe(7_550);
    expect(play1.integrantes.map(i => i.pessoa.id)).toEqual(['a', 'b']);
    expect(r.equipes[1].paraUltrapassar).toBe(22_450);
  });

  it('a mesma pessoa entra numa equipe só, mesmo sendo clone de outra', () => {
    const clonada = pessoa({
      id: 'd', nome: 'Diego', equipeId: 'eq1', equipeNome: 'PLAY 1',
      equipes: ['eq1', 'eq2'],
    });
    const r = calcularDesafio({
      desafio: desafio(),
      dados: { participantes: [clonada], linhas: [linha('d', 1_000)] },
    });
    expect(r.equipes).toHaveLength(1);
    expect(r.totalRecebido).toBe(1_000);
  });

  it('quem não tem equipe cai num card «Sem equipe» em vez de sumir', () => {
    const solto = pessoa({ id: 'e', nome: 'Eva', equipeId: null, equipeNome: 'Sem equipe' });
    const r = calcularDesafio({
      desafio: desafio(),
      dados: { participantes: [solto], linhas: [linha('e', 2_000)] },
    });
    expect(r.equipes[0].equipeNome).toBe('Sem equipe');
  });
});

describe('calcularDesafio — filtro de setor da tela', () => {
  it('recorta os participantes pelo setor escolhido', () => {
    const r = calcularDesafio({
      desafio: desafio(),
      dados: {
        participantes: [
          pessoa({ id: 'a', nome: 'Ana',   setores: ['setorA'] }),
          pessoa({ id: 'z', nome: 'Zeca',  setores: ['setorB'] }),
        ],
        linhas: [linha('a', 1_000), linha('z', 9_000)],
      },
      filtroSetorId: 'setorA',
    });
    expect(r.individual.map(i => i.pessoa.id)).toEqual(['a']);
    expect(r.totalRecebido).toBe(1_000);
  });
});

describe('calcularDesafio — meta coletiva', () => {
  it('soma a operação inteira contra a meta única', () => {
    const r = calcularDesafio({
      desafio: desafio({
        tipo: 'meta_coletiva',
        regra: {
          criterioRanking: 'maior_recebido', metaIndividual: null,
          metaEquipe: null, metaColetiva: 100_000,
        },
      }),
      dados: {
        participantes: [pessoa({ id: 'a', nome: 'Ana' }), pessoa({ id: 'b', nome: 'Bruno' })],
        linhas: [linha('a', 40_000), linha('b', 35_000)],
      },
    });
    expect(r.totalRecebido).toBe(75_000);
    expect(r.faltaColetiva).toBe(25_000);
    expect(r.progressoColetivo).toBe(75);
  });
});

describe('calcularDesafio — trocar de campanha é trocar de configuração', () => {
  /*
   * O teste que o pedido §45 descreve: outra campanha, com outro nome, outras
   * datas, outra meta, outro critério e outro tema — e NENHUMA linha de código
   * diferente para calculá-la.
   */
  it('a mesma função atende uma campanha completamente diferente', () => {
    const corrida = desafio({
      id: 'd2',
      nome: 'Corrida dos 30K',
      dataInicio: '2026-09-01',
      dataFim: '2026-09-30',
      tipo: 'corrida',
      visual: { tema: 'corrida' },
      regra: {
        criterioRanking: 'maior_recebido',
        metaIndividual: 30_000,
        metaEquipe: null,
        modo: ['individual'],
      },
    });

    const r = calcularDesafio({
      desafio: corrida,
      dados: {
        participantes: [pessoa({ id: 'a', nome: 'Ana' }), pessoa({ id: 'b', nome: 'Bruno' })],
        linhas: [linha('a', 12_000), linha('b', 31_000)],
      },
    });

    expect(r.individual[0].pessoa.id).toBe('b');
    expect(r.individual[0].bateuMeta).toBe(true);
    expect(r.individual[1].falta).toBe(18_000);
  });
});

// ── Período ─────────────────────────────────────────────────────────────────

describe('situacaoDoPeriodo e diasRestantes', () => {
  it('compara ISO como texto — sem fuso para andar um dia', () => {
    const d = { dataInicio: '2026-08-21', dataFim: '2026-08-28' };
    expect(situacaoDoPeriodo(d, '2026-08-20')).toBe('antes');
    expect(situacaoDoPeriodo(d, '2026-08-21')).toBe('durante');
    expect(situacaoDoPeriodo(d, '2026-08-28')).toBe('durante');
    expect(situacaoDoPeriodo(d, '2026-08-29')).toBe('depois');
  });

  it('funciona igual numa campanha que atravessa a virada do mês', () => {
    const d = { dataInicio: '2026-08-27', dataFim: '2026-09-05' };
    expect(situacaoDoPeriodo(d, '2026-08-31')).toBe('durante');
    expect(situacaoDoPeriodo(d, '2026-09-01')).toBe('durante');
    expect(situacaoDoPeriodo(d, '2026-09-06')).toBe('depois');
    expect(diasRestantes('2026-09-05', '2026-08-31')).toBe(5);
  });

  it('o último dia mostra zero, não um número negativo', () => {
    expect(diasRestantes('2026-08-28', '2026-08-28')).toBe(0);
    expect(diasRestantes('2026-08-28', '2026-09-10')).toBe(0);
  });
});

// ── Meta por operador, disputa por setor e regra do prêmio ──────────────────

describe('calcularDesafio — meta por operador', () => {
  const participantes = [
    pessoa({ id: 'k', nome: 'Kauan',  usuario: 'kauan_teixeira' }),
    pessoa({ id: 't', nome: 'Thiago', usuario: 'THIAGO_ALVES' }),
  ];

  const comMetas = desafio({
    regra: {
      criterioRanking: 'maior_percentual',
      premiacao: 'todos_que_batem',
      metaIndividual: null,
      metaEquipe: null,
      metasPorOperador: { kauan_teixeira: 40857.14, thiago_alves: 15714.29 },
    },
  });

  it('usa a meta da pessoa, achando pelo login como a planilha manda', () => {
    const r = calcularDesafio({
      desafio: comMetas,
      dados: { participantes, linhas: [linha('k', 20_000), linha('t', 15_714.29)] },
    });
    expect(r.individual.find(i => i.pessoa.id === 'k')?.meta).toBeCloseTo(40857.14, 2);
    expect(r.individual.find(i => i.pessoa.id === 't')?.meta).toBeCloseTo(15714.29, 2);
  });

  it('login com caixa alta e sujeira ainda casa com a meta', () => {
    const sujo = pessoa({ id: 'd', nome: 'Debora', usuario: 'debora_portela  |' });
    const r = calcularDesafio({
      desafio: desafio({
        regra: { metaIndividual: null, metasPorOperador: { debora_portela: 9428.57 } },
      }),
      dados: { participantes: [sujo], linhas: [linha('d', 1_000)] },
    });
    expect(r.individual[0].meta).toBeCloseTo(9428.57, 2);
  });

  it('a chave por id do perfil tem prioridade sobre o login', () => {
    const r = calcularDesafio({
      desafio: desafio({
        regra: { metaIndividual: null, metasPorOperador: { k: 1_000, kauan_teixeira: 40_857 } },
      }),
      dados: { participantes, linhas: [] },
    });
    expect(r.individual.find(i => i.pessoa.id === 'k')?.meta).toBe(1_000);
  });

  it('mapa preenchido É a convocação: quem não está nele fica fora', () => {
    const forasteiro = pessoa({ id: 'x', nome: 'Xavier', usuario: 'xavier' });
    const r = calcularDesafio({
      desafio: comMetas,
      dados: {
        participantes: [...participantes, forasteiro],
        linhas: [linha('x', 90_000)],
      },
    });
    expect(r.individual.map(i => i.pessoa.id)).not.toContain('x');
    expect(r.totalParticipantes).toBe(2);
    // E o recebimento de quem não disputa não infla o total da campanha.
    expect(r.totalRecebido).toBe(0);
  });

  it('quem tem meta menor pode liderar recebendo menos — é o percentual que ordena', () => {
    const r = calcularDesafio({
      desafio: comMetas,
      // Thiago bate a dele; Kauan recebe mais em dinheiro e fica em 49%.
      dados: { participantes, linhas: [linha('k', 20_000), linha('t', 15_800)] },
    });
    expect(r.individual[0].pessoa.id).toBe('t');
    expect(r.individual[0].bateuMeta).toBe(true);
    expect(r.individual[1].pessoa.id).toBe('k');
    expect(r.individual[1].bateuMeta).toBe(false);
  });

  it('a distância para ultrapassar é o dinheiro que ESTE participante precisa', () => {
    const r = calcularDesafio({
      desafio: comMetas,
      dados: { participantes, linhas: [linha('k', 20_000), linha('t', 15_800)] },
    });
    // Thiago está em 100,54%; Kauan precisa de 100,54% da meta DELE.
    const kauan = r.individual[1];
    const alvo = (r.individual[0].progresso / 100) * 40857.14;
    expect(kauan.paraUltrapassar).toBeCloseTo(alvo - 20_000, 2);
  });

  it('meta de equipe não fixada vira a soma das metas dos integrantes', () => {
    const r = calcularDesafio({
      desafio: comMetas,
      dados: { participantes, linhas: [linha('k', 10_000), linha('t', 5_000)] },
    });
    expect(r.equipes).toHaveLength(1);
    expect(r.equipes[0].meta).toBeCloseTo(40857.14 + 15714.29, 2);
    expect(r.equipes[0].falta).toBeCloseTo(40857.14 + 15714.29 - 15_000, 2);
  });

  it('meta de equipe fixada continua mandando', () => {
    const r = calcularDesafio({
      desafio: desafio({
        regra: {
          metaIndividual: null, metaEquipe: 80_000,
          metasPorOperador: { kauan_teixeira: 40857.14, thiago_alves: 15714.29 },
        },
      }),
      dados: { participantes, linhas: [linha('k', 10_000)] },
    });
    expect(r.equipes[0].meta).toBe(80_000);
  });
});

describe('calcularDesafio — escopo da disputa', () => {
  const participantes = [
    pessoa({ id: 'a', nome: 'Ana',  setores: ['setorA'] }),
    pessoa({ id: 'z', nome: 'Zeca', setores: ['setorB'] }),
  ];
  const linhas = [linha('a', 1_000), linha('z', 9_000)];

  it('«empresa» junta todo mundo num placar só', () => {
    const r = calcularDesafio({
      desafio: desafio({ regra: { escopoDisputa: 'empresa' } }),
      dados: { participantes, linhas },
      setorDoUsuario: 'setorA',
    });
    expect(r.individual).toHaveLength(2);
  });

  it('«setor» recorta pelo setor de quem está olhando', () => {
    const r = calcularDesafio({
      desafio: desafio({ regra: { escopoDisputa: 'setor' } }),
      dados: { participantes, linhas },
      setorDoUsuario: 'setorA',
    });
    expect(r.individual.map(i => i.pessoa.id)).toEqual(['a']);
    expect(r.totalRecebido).toBe(1_000);
  });

  it('o filtro de setor da tela manda sobre o setor de quem olha', () => {
    const r = calcularDesafio({
      desafio: desafio({ regra: { escopoDisputa: 'setor' } }),
      dados: { participantes, linhas },
      setorDoUsuario: 'setorA',
      filtroSetorId: 'setorB',
    });
    expect(r.individual.map(i => i.pessoa.id)).toEqual(['z']);
  });

  it('sem setor conhecido, mostra o placar inteiro em vez de uma tela vazia', () => {
    const r = calcularDesafio({
      desafio: desafio({ regra: { escopoDisputa: 'setor' } }),
      dados: { participantes, linhas },
    });
    expect(r.individual).toHaveLength(2);
  });

  it('conta o setor em que a pessoa é clone', () => {
    const clonada = pessoa({ id: 'c', nome: 'Cleber', setores: ['setorB', 'setorA'] });
    const r = calcularDesafio({
      desafio: desafio({ regra: { escopoDisputa: 'setor' } }),
      dados: { participantes: [clonada], linhas: [linha('c', 500)] },
      setorDoUsuario: 'setorA',
    });
    expect(r.individual).toHaveLength(1);
  });
});

describe('chaveDeLogin', () => {
  it('normaliza o que vem da planilha', () => {
    expect(chaveDeLogin('NAYARA_CRUZ')).toBe('nayara_cruz');
    expect(chaveDeLogin('debora_portela  |')).toBe('debora_portela');
    expect(chaveDeLogin(null)).toBe('');
  });
});
