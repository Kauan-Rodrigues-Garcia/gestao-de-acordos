/**
 * fantasmaTransferencia.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Quem foi transferido no meio do mês continua contando na equipe de origem.
 *
 * ## O defeito que estes testes travam
 *
 * O agrupamento do analítico é lido de `composicao_mes` (retrato congelado) para
 * mês fechado e AO VIVO para o mês corrente. O retrato protege o passado; o mês
 * corrente não tinha proteção nenhuma. Transferir alguém no dia 13 zerava
 * `equipe_id` e, no mesmo instante, os 12 dias de recebimento dela sumiam do
 * card da equipe de origem — sem ninguém ter apagado nada.
 *
 * O caso mais difícil, e o que nenhum mock de banco pega, é a troca de EMPRESA:
 * a pessoa deixa de aparecer na consulta de perfis da origem (que filtra por
 * `empresa_id`), então não há entrada para corrigir — é preciso criar uma.
 */
import { describe, it, expect } from 'vitest';
import { aplicarFantasmas, creditosDeOrigem, type FantasmaTransferencia } from './fantasmaTransferencia';
import type { ComposicaoEquipes } from './analitico.service';

const EQUIPE_A = 'eq-play4-manha';
const EQUIPE_B = 'eq-play5-tarde';
const SETOR_A  = 'setor-play-4';
const SETOR_B  = 'setor-play-5';

const NOMES: Record<string, string> = {
  [EQUIPE_A]: 'Play 4 Manhã',
  [EQUIPE_B]: 'Play 5 Tarde',
};
const nomeDaEquipe = (id: string) => NOMES[id];

/** Composição ao vivo DEPOIS da transferência: é assim que o banco responde. */
function composicaoBase(): ComposicaoEquipes {
  return {
    equipes: [
      { id: EQUIPE_A, nome: 'Play 4 Manhã', setor_id: SETOR_A },
      { id: EQUIPE_B, nome: 'Play 5 Tarde', setor_id: SETOR_B },
    ],
    operadorEquipeMap: {
      'ana':   { equipe_id: EQUIPE_A, equipe_nome: 'Play 4 Manhã', setor_id: SETOR_A },
      // Bruno foi movido do Play 4 para o Play 5: `equipe_id` já saiu.
      'bruno': { equipe_id: null, equipe_nome: 'Sem equipe', setor_id: SETOR_B },
    },
    equipesExtrasPorOperador: {},
    situacaoPorOperador: { ana: 'ativo', bruno: 'ativo' },
    doRetrato: false,
  };
}

const FANTASMA_BRUNO: FantasmaTransferencia = {
  id: 'transf-1',
  perfilId: 'bruno',
  nome: 'Bruno Silva',
  origemEquipeId: EQUIPE_A,
  origemSetorId: SETOR_A,
  tipo: 'setor',
};

describe('aplicarFantasmas — sem fantasma', () => {
  it('não muda a composição', () => {
    const base = composicaoBase();
    const r = aplicarFantasmas(base, [], nomeDaEquipe);

    expect(r.operadorEquipeMap).toEqual(base.operadorEquipeMap);
    expect(r.equipes).toEqual(base.equipes);
    expect(r.transferidos).toEqual({});
  });
});

describe('aplicarFantasmas — troca de setor', () => {
  it('devolve a pessoa à equipe e ao setor de ORIGEM', () => {
    const r = aplicarFantasmas(composicaoBase(), [FANTASMA_BRUNO], nomeDaEquipe);

    expect(r.operadorEquipeMap['bruno']).toEqual({
      equipe_id:   EQUIPE_A,
      equipe_nome: 'Play 4 Manhã',
      setor_id:    SETOR_A,
    });
  });

  it('marca a pessoa como transferida, com o id para o botão do líder', () => {
    const r = aplicarFantasmas(composicaoBase(), [FANTASMA_BRUNO], nomeDaEquipe);

    // `nome` e `equipeId` viajam na marca porque o quadro de membros (aba
    // Equipes) não tem o perfil à mão: numa troca de empresa ele nem aparece
    // na consulta de perfis da origem.
    expect(r.transferidos).toEqual({
      bruno: {
        transferenciaId: 'transf-1',
        tipo: 'setor',
        nome: 'Bruno Silva',
        equipeId: EQUIPE_A,
      },
    });
  });

  it('não mexe em quem não foi transferido', () => {
    const r = aplicarFantasmas(composicaoBase(), [FANTASMA_BRUNO], nomeDaEquipe);

    expect(r.operadorEquipeMap['ana']).toEqual({
      equipe_id: EQUIPE_A, equipe_nome: 'Play 4 Manhã', setor_id: SETOR_A,
    });
    expect(r.transferidos?.['ana']).toBeUndefined();
  });

  it('não altera o objeto recebido', () => {
    // A composição é compartilhada entre telas; mutá-la faria o fantasma
    // aparecer em lugares que não pediram por ele.
    const base = composicaoBase();
    aplicarFantasmas(base, [FANTASMA_BRUNO], nomeDaEquipe);

    expect(base.operadorEquipeMap['bruno'].equipe_id).toBeNull();
    expect(base.transferidos).toBeUndefined();
  });
});

describe('aplicarFantasmas — troca de EMPRESA', () => {
  /** Cross-empresa: a pessoa sumiu da consulta de perfis da origem. */
  function semBruno(): ComposicaoEquipes {
    const c = composicaoBase();
    delete c.operadorEquipeMap['bruno'];
    delete c.situacaoPorOperador['bruno'];
    return c;
  }

  const FANTASMA_EMPRESA: FantasmaTransferencia = {
    ...FANTASMA_BRUNO, id: 'transf-2', tipo: 'empresa',
  };

  it('CRIA a entrada de quem não existe mais na empresa de origem', () => {
    const r = aplicarFantasmas(semBruno(), [FANTASMA_EMPRESA], nomeDaEquipe);

    expect(r.operadorEquipeMap['bruno']).toEqual({
      equipe_id:   EQUIPE_A,
      equipe_nome: 'Play 4 Manhã',
      setor_id:    SETOR_A,
    });
    expect(r.transferidos?.['bruno']?.tipo).toBe('empresa');
  });

  it('dá situação "ativo" a quem sumiu — ele trabalhou o mês', () => {
    // Sem situação explícita ele cairia fora de todo filtro que exige 'ativo',
    // e o fantasma não apareceria justamente no caso que mais precisa dele.
    const r = aplicarFantasmas(semBruno(), [FANTASMA_EMPRESA], nomeDaEquipe);
    expect(r.situacaoPorOperador['bruno']).toBe('ativo');
  });

  it('não sobrescreve a situação de quem ainda está na empresa', () => {
    const c = composicaoBase();
    c.situacaoPorOperador['bruno'] = 'ferias';
    const r = aplicarFantasmas(c, [FANTASMA_BRUNO], nomeDaEquipe);
    expect(r.situacaoPorOperador['bruno']).toBe('ferias');
  });
});

describe('aplicarFantasmas — equipe que ficou vazia', () => {
  it('traz de volta à lista a equipe cujo único integrante saiu', () => {
    // Uma equipe sem membro ativo é filtrada da composição ao vivo (`comGente`).
    // Mas ela ainda tem o recebimento do mês para mostrar — some da tela e o
    // líder não acha o dinheiro em lugar nenhum.
    const c = composicaoBase();
    c.equipes = c.equipes.filter(e => e.id !== EQUIPE_A);
    delete c.operadorEquipeMap['ana'];

    const r = aplicarFantasmas(c, [FANTASMA_BRUNO], nomeDaEquipe);

    expect(r.equipes.map(e => e.id)).toContain(EQUIPE_A);
    expect(r.equipes.find(e => e.id === EQUIPE_A)).toEqual({
      id: EQUIPE_A, nome: 'Play 4 Manhã', setor_id: SETOR_A,
    });
  });

  it('não duplica equipe que já estava na lista', () => {
    const r = aplicarFantasmas(composicaoBase(), [FANTASMA_BRUNO], nomeDaEquipe);
    expect(r.equipes.filter(e => e.id === EQUIPE_A)).toHaveLength(1);
  });

  it('mantém a lista de equipes ordenada por nome', () => {
    const c = composicaoBase();
    c.equipes = c.equipes.filter(e => e.id !== EQUIPE_A);

    const r = aplicarFantasmas(c, [FANTASMA_BRUNO], nomeDaEquipe);
    const nomes = r.equipes.map(e => e.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)));
  });
});

describe('aplicarFantasmas — bordas', () => {
  it('transferido que não tinha equipe fica sem equipe, mas marcado', () => {
    const r = aplicarFantasmas(
      composicaoBase(),
      [{ ...FANTASMA_BRUNO, origemEquipeId: null }],
      nomeDaEquipe,
    );

    expect(r.operadorEquipeMap['bruno'].equipe_id).toBeNull();
    expect(r.operadorEquipeMap['bruno'].setor_id).toBe(SETOR_A);
    // A marca continua: o setor de origem é o que o card dele soma.
    expect(r.transferidos?.['bruno']).toBeDefined();
  });

  it('equipe apagada depois da transferência não quebra a lista', () => {
    // `origem_equipe_id` é ON DELETE SET NULL, mas a linha pode ser lida entre a
    // exclusão e o próximo refresh. Nome desconhecido vira rótulo genérico.
    const r = aplicarFantasmas(composicaoBase(), [FANTASMA_BRUNO], () => undefined);

    expect(r.operadorEquipeMap['bruno'].equipe_nome).toBe('Sem equipe');
  });

  it('dois fantasmas da mesma equipe entram os dois', () => {
    const c = composicaoBase();
    c.operadorEquipeMap['carla'] =
      { equipe_id: null, equipe_nome: 'Sem equipe', setor_id: SETOR_B };

    const r = aplicarFantasmas(c, [
      FANTASMA_BRUNO,
      { ...FANTASMA_BRUNO, id: 'transf-3', perfilId: 'carla' },
    ], nomeDaEquipe);

    expect(r.operadorEquipeMap['bruno'].equipe_id).toBe(EQUIPE_A);
    expect(r.operadorEquipeMap['carla'].equipe_id).toBe(EQUIPE_A);
    expect(Object.keys(r.transferidos ?? {})).toEqual(['bruno', 'carla']);
  });
});

/*
 * BookPlay, 29/09/2026 — o fantasma de SETOR não leva a pessoa inteira de volta.
 *
 * Stella e Camilly vieram do Play 1 para o Play 2 (equipe Luan/ Gaby) em 15/09,
 * com fantasma de pé. O fantasma as recolocava INTEIRAS no Play 1, e o card do
 * Luan perdia R$ 15.339,12 recebidos no Play 2. Agora a pessoa fica onde está
 * (o resumo já só traz as linhas do setor dela) e a equipe de origem recebe só
 * as linhas do setor de origem.
 */
describe('aplicarFantasmas — setorFicaNoLugar (BookPlay)', () => {
  it('fantasma de setor não reescreve a pessoa; a equipe de origem continua listada', () => {
    const base = composicaoBase();
    // A origem ficou vazia: sem o fantasma, ela sumiria da lista.
    base.equipes = base.equipes.filter(e => e.id !== EQUIPE_A);
    const r = aplicarFantasmas(base, [FANTASMA_BRUNO], nomeDaEquipe, { setorFicaNoLugar: true });
    expect(r.operadorEquipeMap.bruno).toEqual(base.operadorEquipeMap.bruno);
    expect(r.transferidos).toEqual({});
    expect(r.equipes.map(e => e.id)).toContain(EQUIPE_A);
  });

  it('fantasma de empresa segue recolocando na origem', () => {
    const r = aplicarFantasmas(composicaoBase(), [{ ...FANTASMA_BRUNO, tipo: 'empresa' }], nomeDaEquipe,
      { setorFicaNoLugar: true });
    expect(r.operadorEquipeMap.bruno.equipe_id).toBe(EQUIPE_A);
    expect(r.transferidos.bruno).toBeDefined();
  });
});

describe('creditosDeOrigem — só as linhas do setor de origem', () => {
  const fora = [
    { operador_id: 'bruno', setor_id: SETOR_A, total_recebido: 4447.74, total_ho: 0 },
    // Linha de um terceiro setor: não é origem de fantasma nenhum.
    { operador_id: 'bruno', setor_id: 'setor-manutencao', total_recebido: 999, total_ho: 0 },
    { operador_id: 'ana',   setor_id: SETOR_B, total_recebido: 100, total_ho: 0 },
  ];

  it('credita a equipe de origem com o recebido carimbado no setor de origem', () => {
    expect(creditosDeOrigem([FANTASMA_BRUNO], fora)).toEqual([{
      perfilId: 'bruno', nome: 'Bruno Silva', equipeId: EQUIPE_A, setorId: SETOR_A, bruto: 4447.74, ho: 0,
    }]);
  });

  it('sem equipe de origem, ou fantasma de empresa, não há crédito de equipe', () => {
    expect(creditosDeOrigem([{ ...FANTASMA_BRUNO, origemEquipeId: null }], fora)).toEqual([]);
    expect(creditosDeOrigem([{ ...FANTASMA_BRUNO, tipo: 'empresa' }], fora)).toEqual([]);
  });
});
