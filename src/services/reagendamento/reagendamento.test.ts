/**
 * Os defeitos que o usuário via na tela, virados em teste.
 *
 * Cada `describe` abaixo guarda um caminho que estava errado antes de
 * 28/09/2026 — a ordem é a do cabeçalho de `reagendamento.ts`.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  podeReagendar, chaveParcela, chavesExistentes, tipoParcela, rotuloReagendar,
  ehParcelaDuplicada, avisoParcelaJaAgendada,
  TIPOS_QUE_PARCELAM_BOOKPLAY, TIPOS_QUE_PARCELAM_PAGUEPLAY,
} from './reagendamento';
import { TIPOS_BOOKPLAY, TIPOS_PAGUEPLAY } from '@/components/AcordoNovoInline/constants';

const VAZIO = new Set<string>();

/** Uma parcela de acordo, só com o que a regra lê. */
function parcela(over: Partial<Parameters<typeof podeReagendar>[0]> = {}) {
  return {
    tipo: 'boleto',
    status: 'pago',
    parcelas: 3,
    numero_parcela: 1,
    acordo_grupo_id: 'G1',
    ...over,
  };
}

describe('a lista de formas bate com o formulário', () => {
  /*
   * A regra não pode divergir do que o form oferece: era exatamente assim que
   * 'cartao' da BookPlay ficava de fora e o botão sumia.
   */
  it('BookPlay: parcela tudo que o form marca como parcelado', () => {
    const doForm = TIPOS_BOOKPLAY.filter(t => t.parcelado).map(t => t.value).sort();
    expect([...TIPOS_QUE_PARCELAM_BOOKPLAY].sort()).toEqual(doForm);
  });

  it('BookPlay: nenhuma forma recorrente entra', () => {
    for (const t of TIPOS_BOOKPLAY.filter(t => !t.parcelado)) {
      expect(tipoParcela(t.value, false)).toBe(false);
    }
  });

  it('PaguePlay: o cartão é à vista e não parcela', () => {
    expect(TIPOS_PAGUEPLAY.find(t => t.value === 'cartao')?.parcelado).toBe(false);
    expect(tipoParcela('cartao', true)).toBe(false);
  });

  it('PaguePlay: "Boleto / PIX" é gravado como boleto, e parcela', () => {
    expect(tipoParcela('boleto', true)).toBe(true);
    // 'pix' fica na lista pelo histórico anterior à consolidação do form.
    expect(TIPOS_QUE_PARCELAM_PAGUEPLAY).toContain('pix');
  });
});

describe('defeito 1 — Cartão de Crédito da BookPlay não mostrava o botão', () => {
  /*
   * A tabela do Dashboard é a mesma nos dois tenants, mas filtrava por
   * ['boleto','pix'] — a lista da PaguePlay. Acordo parcelado no cartão da
   * BookPlay não tinha como agendar a 2ª parcela por lugar nenhum.
   */
  it('cartão parcelado da BookPlay reagenda', () => {
    expect(podeReagendar(parcela({ tipo: 'cartao' }), false, VAZIO).pode).toBe(true);
  });

  it('o mesmo cartão na PaguePlay não reagenda — lá é à vista', () => {
    const d = podeReagendar(parcela({ tipo: 'cartao' }), true, VAZIO);
    expect(d.pode).toBe(false);
    expect(d.motivo).toBe('tipo_nao_parcela');
  });
});

describe('defeito 2 — da 3ª parcela em diante o botão sumia para sempre', () => {
  /*
   * O controle era por GRUPO: existindo qualquer parcela com numero > 1, o
   * grupo inteiro era dado como reagendado. Num 3x, assim que a parcela 2
   * nascia, a 3 não tinha mais como ser criada pela tela.
   */
  const existentes = chavesExistentes([
    { acordo_grupo_id: 'G1', numero_parcela: 1 },
    { acordo_grupo_id: 'G1', numero_parcela: 2 },
  ]);

  it('a parcela 1 não reagenda: a 2 já existe', () => {
    const d = podeReagendar(parcela({ numero_parcela: 1 }), false, existentes);
    expect(d.pode).toBe(false);
    expect(d.motivo).toBe('ja_agendada');
  });

  it('a parcela 2 REAGENDA: a 3 ainda não existe', () => {
    const d = podeReagendar(parcela({ numero_parcela: 2 }), false, existentes);
    expect(d.pode).toBe(true);
    expect(d.proximaNumero).toBe(3);
  });

  it('a parcela 3 não reagenda: é a última', () => {
    const d = podeReagendar(parcela({ numero_parcela: 3 }), false, existentes);
    expect(d.motivo).toBe('ultima_parcela');
  });

  it('um 12x caminha parcela a parcela até o fim', () => {
    const chaves = new Set<string>();
    for (let n = 1; n <= 12; n += 1) chaves.add(chaveParcela('G2', n));
    for (let n = 1; n <= 11; n += 1) {
      // Com todas criadas, nenhuma oferece botão.
      expect(podeReagendar(
        parcela({ acordo_grupo_id: 'G2', parcelas: 12, numero_parcela: n }), false, chaves,
      ).pode).toBe(false);
    }
    // Tirando a 7ª, é a 6ª que passa a oferecer — e só ela.
    chaves.delete(chaveParcela('G2', 7));
    const oferecem = [];
    for (let n = 1; n <= 12; n += 1) {
      if (podeReagendar(
        parcela({ acordo_grupo_id: 'G2', parcelas: 12, numero_parcela: n }), false, chaves,
      ).pode) oferecem.push(n);
    }
    expect(oferecem).toEqual([6]);
  });
});

describe('defeito 3 — o aviso de duplicidade dependia do mês e do tenant', () => {
  /*
   * A consulta que sabia da parcela já agendada olhava só o mês seguinte ao do
   * filtro, e só na PaguePlay. A regra aqui não tem data: quem monta o conjunto
   * é `useParcelasExistentes`, que pergunta pelos grupos da tela sem recorte.
   */
  it('a próxima parcela conta mesmo vencendo daqui a seis meses', () => {
    const longe = chavesExistentes([{ acordo_grupo_id: 'G1', numero_parcela: 2 }]);
    expect(podeReagendar(parcela({ numero_parcela: 1 }), false, longe).motivo).toBe('ja_agendada');
  });

  it('a regra é a mesma nos dois tenants', () => {
    const p = parcela({ tipo: 'boleto', numero_parcela: 1 });
    const ja = chavesExistentes([{ acordo_grupo_id: 'G1', numero_parcela: 2 }]);
    expect(podeReagendar(p, true, ja).motivo).toBe('ja_agendada');
    expect(podeReagendar(p, false, ja).motivo).toBe('ja_agendada');
  });
});

describe('o que nunca reagenda', () => {
  it('PIX Automático e Cartão Recorrente, mesmo lançados em 10x', () => {
    for (const tipo of ['pix_automatico', 'cartao_recorrente']) {
      const d = podeReagendar(parcela({ tipo, parcelas: 10, numero_parcela: 1 }), false, VAZIO);
      expect(d.pode, tipo).toBe(false);
      expect(d.motivo, tipo).toBe('recorrente');
    }
  });

  it('acordo de parcela única', () => {
    expect(podeReagendar(parcela({ parcelas: 1 }), false, VAZIO).motivo).toBe('parcela_unica');
  });

  it('linha sem grupo: não há onde pendurar a próxima', () => {
    expect(podeReagendar(parcela({ acordo_grupo_id: null }), false, VAZIO).motivo).toBe('sem_grupo');
  });

  it('tipo vazio', () => {
    expect(podeReagendar(parcela({ tipo: null }), false, VAZIO).motivo).toBe('tipo_nao_parcela');
  });
});

describe('só depois de pago (29/09/2026)', () => {
  /*
   * «Se tenho um acordo em 10x, com a primeira agendada para hoje, em
   * verificar ou pendente, não é para aparecer o botão. Só aparece ao marcar
   * como pago, e se a próxima parcela for agendada, o botão some.»
   */
  it('10x com a 1ª ainda em Verificar: sem botão', () => {
    const d = podeReagendar(parcela({ parcelas: 10, status: 'verificar_pendente' }), false, VAZIO);
    expect(d.pode).toBe(false);
    expect(d.motivo).toBe('nao_paga');
  });

  it('Não pago também não', () => {
    expect(podeReagendar(parcela({ status: 'nao_pago' }), false, VAZIO).motivo).toBe('nao_paga');
  });

  it('marcou pago: aparece', () => {
    expect(podeReagendar(parcela({ parcelas: 10, status: 'pago' }), false, VAZIO).pode).toBe(true);
  });

  it('pago e a próxima já agendada: some', () => {
    const ja = chavesExistentes([{ acordo_grupo_id: 'G1', numero_parcela: 2 }]);
    expect(podeReagendar(parcela({ parcelas: 10, status: 'pago' }), false, ja).motivo).toBe('ja_agendada');
  });

  it('vale nos dois tenants', () => {
    expect(podeReagendar(parcela({ status: 'verificar_pendente' }), true, VAZIO).motivo).toBe('nao_paga');
  });
});

describe('detalhes de apresentação', () => {
  it('o rótulo diz qual parcela vai nascer', () => {
    const d = podeReagendar(parcela({ numero_parcela: 2, parcelas: 5 }), false, VAZIO);
    expect(rotuloReagendar(d)).toBe('Reagendar parcela 3/5');
  });

  it('numero_parcela nulo conta como 1', () => {
    const d = podeReagendar(parcela({ numero_parcela: null }), false, VAZIO);
    expect(d.proximaNumero).toBe(2);
  });

  it('chavesExistentes ignora linha sem grupo', () => {
    expect(chavesExistentes([{ acordo_grupo_id: null, numero_parcela: 2 }]).size).toBe(0);
  });
});

describe('a corrida com a trava do banco', () => {
  /*
   * Migration 20260928230000 (uq_acordos_grupo_parcela). Entre o `select` que
   * confere e o `insert`, outra aba pode ter criado a parcela — as três telas
   * precisam tratar isso como «já foi», não como erro.
   */
  it('reconhece o unique_violation pelo código', () => {
    expect(ehParcelaDuplicada({ code: '23505', message: 'duplicate key' })).toBe(true);
  });

  it('reconhece pelo nome do índice, quando o código não vem', () => {
    expect(ehParcelaDuplicada({
      message: 'duplicate key value violates unique constraint "uq_acordos_grupo_parcela"',
    })).toBe(true);
  });

  it('não confunde com outro erro', () => {
    expect(ehParcelaDuplicada({ code: '42703', message: 'column does not exist' })).toBe(false);
    expect(ehParcelaDuplicada(null)).toBe(false);
    expect(ehParcelaDuplicada(undefined)).toBe(false);
  });

  it('a frase é a mesma nas três telas', () => {
    expect(avisoParcelaJaAgendada(3, 5)).toBe('Parcela 3/5 já foi reagendada.');
  });
});

describe('o modal que abre ao marcar pago continua abrindo', () => {
  /*
   * Os três «marcar como pago» consultam a regra com o objeto de ANTES do
   * update. Com a exigência de parcela paga, passar o objeto cru faria o modal
   * nunca mais abrir — silenciosamente. Cada um tem de entregar a parcela já
   * como paga.
   */
  const raiz = path.resolve(__dirname, '../../');
  const ler = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8');

  it('Dashboard', () => {
    expect(ler('pages/Dashboard/index.tsx'))
      .toContain("podeReagendar({ ...acordo, status: 'pago' }, isPP, parcelasExistentes)");
  });
  it('aba Acordos', () => {
    expect(ler('pages/Acordos/index.tsx'))
      .toContain("podeReagendar({ ...a, status: 'pago' }, isPP, parcelasExistentes)");
  });
  it('detalhe do acordo', () => {
    expect(ler('components/AcordoDetalheInline/index.tsx'))
      .toContain('podeReagendar(parcelaAtualizada, isPaguePlay, chavesExistentes(registrosReais))');
  });
});
