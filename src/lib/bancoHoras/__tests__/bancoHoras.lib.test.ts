import { describe, it, expect } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { decodificar, lerArquivos, lerHora, lerRelatorio } from '../leitor';
import { assinatura, montarLote } from '../importacao';
import { grupoDe, mesesParaVencer, montarVisao, passaSituacao, porSetor, somaDoMes, vencendoNoMes } from '../calculos';
import { abasDoBancoDeHoras, montarXlsx } from '../excel';
import { horas, mesCurto, titulo } from '../formato';
import type { PosicaoBH } from '../tipos';

/** Um HRBH102 no formato do sistema do DP (`;`, colunas fixas). */
function csv(o: { saldoEm?: string; gerado?: string; setor?: string; pessoas?: string[] } = {}) {
  const pessoas = o.pessoas ?? [
    ';30355;FULANA DE TAL;;;;;Saldo BH:;12:30;em;16/11/2026',
    ';;;;Vencendo em:;25/11/2026;;;02:00',
    ';;;;Vencendo em:;25/11/2027;;;10:30',
    ';30356;CICLANO SOUZA;;;;;Saldo BH:;03:00-;em;16/11/2026',
    ';;;;Vencendo em:;25/10/2027;;;03:00-',
  ];
  return [
    `Vencimentos de:;01/01/2026;;Saldo Banco em:;${o.saldoEm ?? '16/11/2026'}`,
    `HRBH102 - Vencimento de Lançamentos não Compensados ${o.gerado ?? '16/11/2026 - 14:05'} Usuário: TALIA`,
    '3;BOOK PLAY LTDA;;;;;;;;;',
    `${o.setor ?? 'HOME RECEPTIVO'};;;;;;;;;;`,
    '1.2.3, BOOK PLAY, COBRANCA, RECEPTIVO;;;;;;;;;;',
    ...pessoas,
  ].join('\r\n');
}

const arquivo = (name: string, conteudo: string | Uint8Array) => ({
  name,
  arrayBuffer: async () => {
    const u8 = typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo;
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  },
});

describe('leitura do HRBH102', () => {
  it('lê a data, quem gerou, o setor, o departamento e as pessoas', () => {
    const r = lerRelatorio(csv(), 'HOME RECEPTIVO.csv');
    expect(r.ok).toBe(true);
    if (!('grupos' in r)) return;
    expect(r).toMatchObject({ data: '2026-11-16', gerado: '2026-11-16 14:05', usuario: 'TALIA' });
    expect(r.grupos).toHaveLength(1);
    const g = r.grupos[0];
    expect(g).toMatchObject({ setor: 'HOME RECEPTIVO', empresaCode: '3', empresa: 'BOOK PLAY LTDA', depto: 'COBRANCA' });
    expect(g.people).toEqual([
      { mat: '30355', nome: 'FULANA DE TAL', saldo: 750, em: '2026-11-16', venc: [['2026-11-25', 120], ['2027-11-25', 630]] },
      { mat: '30356', nome: 'CICLANO SOUZA', saldo: -180, em: '2026-11-16', venc: [['2027-10-25', -180]] },
    ]);
  });

  it('hora com «-» no fim é negativa', () => {
    expect(lerHora('03:00-')).toBe(-180);
    expect(lerHora(' 176:20 ')).toBe(10580);
    expect(lerHora('x')).toBeNull();
  });

  it('arquivo que não é o relatório diz por quê', () => {
    expect(lerRelatorio('a;b;c', 'x.csv')).toMatchObject({ ok: false, motivo: expect.stringContaining('Saldo Banco em') });
  });

  it('cp1252 (o que o DP grava) é lido sem estragar acento', () => {
    const latin1 = Uint8Array.from('Usuário: JOSÉ', ch => ch.charCodeAt(0));
    expect(decodificar(latin1)).toBe('Usuário: JOSÉ');
  });

  it('o .zip do e-mail (mesmo com nome .tmp) é aberto, e o backup antigo é reconhecido', async () => {
    const zip = zipSync({ 'anexos/HOME RECEPTIVO.csv': strToU8(csv()), 'anexos/PLAY 2.csv': strToU8(csv({ setor: 'PLAY 2' })) });
    const backup = JSON.stringify({ app: 'banco-de-horas', posicoes: [{ date: '2026-10-20', setores: {} }] });
    const r = await lerArquivos([arquivo('Anexos.tmp', zip), arquivo('backup.json', backup), arquivo('foto.png', 'nada')]);
    expect(r.lidos.map(x => x.grupos[0].setor).sort()).toEqual(['HOME RECEPTIVO', 'PLAY 2']);
    expect(r.backup?.posicoes).toHaveLength(1);
    expect(r.erros.map(e => e.arquivo)).toEqual(['foto.png']);
  });
});

describe('montar o lote', () => {
  it('setor repetido com o mesmo conteúdo conta uma vez; versão diferente fica a mais nova', async () => {
    const lidos = await lerArquivos([
      arquivo('a.csv', csv()), arquivo('a (1).csv', csv()),
      arquivo('b.csv', csv({ setor: 'PLAY 2', gerado: '16/11/2026 - 09:00' })),
      arquivo('b novo.csv', csv({ setor: 'PLAY 2', gerado: '16/11/2026 - 15:00', pessoas: [';1;ANA;;;;;Saldo BH:;01:00;em;16/11/2026'] })),
    ]);
    const lote = montarLote(lidos, new Set());
    expect(lote.gravar.map(s => s.setor).sort()).toEqual(['HOME RECEPTIVO', 'PLAY 2']);
    expect(lote.repetidos).toEqual([{ arquivo: 'a (1).csv', igual: 'a.csv' }]);
    expect(lote.conflitos[0]).toMatchObject({ setor: 'PLAY 2', ficou: 'b novo.csv', saiu: 'b.csv' });
    expect(lote.gravar.find(s => s.setor === 'PLAY 2')?.people[0].nome).toBe('ANA');
    expect(lote.datas.get('2026-11-16')).toEqual({ novo: true, backup: false });
  });

  it('arquivo de data minoritária fica de fora (o HOME RECEPTIVO antigo de 16/11)', async () => {
    const lidos = await lerArquivos([
      ...['A', 'B', 'C', 'D', 'E'].map(s => arquivo(`${s}.csv`, csv({ setor: s }))),
      arquivo('velho.csv', csv({ setor: 'F', saldoEm: '20/09/2026' })),
    ]);
    const lote = montarLote(lidos, new Set());
    expect(lote.gravar.every(s => s.date === '2026-11-16')).toBe(true);
    expect(lote.erros).toEqual([expect.objectContaining({ arquivo: 'velho.csv', motivo: expect.stringContaining('outra data') })]);
  });

  it('a assinatura não depende da ordem das pessoas', () => {
    const a = { people: [{ mat: '1', nome: 'A', saldo: 1, em: null, venc: [] }, { mat: '2', nome: 'B', saldo: 2, em: null, venc: [] }] };
    expect(assinatura(a)).toBe(assinatura({ people: [...a.people].reverse() }));
  });
});

describe('as contas', () => {
  const pos: PosicaoBH = {
    date: '2026-11-16', importadoEm: null, gerado: null, usuario: null,
    setores: {
      '3|HOME RECEPTIVO': {
        setor: 'HOME RECEPTIVO', depto: 'COBRANCA', hierarquia: null, empresa: 'BOOK PLAY LTDA', empresaCode: '3',
        arquivo: null, gerado: null, usuario: null,
        people: [
          { mat: '1', nome: 'FULANA DE TAL', saldo: 750, em: '2026-11-16', venc: [['2027-11-25', 630], ['2026-11-25', 120]] },
          { mat: '2', nome: 'CICLANO', saldo: -180, em: '2026-11-16', venc: [['2027-10-25', -180]] },
          { mat: '3', nome: 'BELTRANA', saldo: 3000, em: '2026-11-10', venc: [['2027-09-25', 3000]] },
        ],
      },
      '3|PLAY 2': {
        setor: 'PLAY 2', depto: 'COBRANCA', hierarquia: null, empresa: 'BOOK PLAY LTDA', empresaCode: '3',
        arquivo: null, gerado: null, usuario: null,
        // a mesma Beltrana, com saldo mais novo: é este que vale
        people: [{ mat: '3', nome: 'BELTRANA', saldo: 2400, em: '2026-11-16', venc: [['2027-09-25', 2400]] }],
      },
    },
  };
  const v = montarVisao(pos);

  it('a mesma matrícula em dois setores conta uma vez, pelo saldo mais recente', () => {
    expect(v.pessoas).toHaveLength(3);
    const b = v.pessoas.find(p => p.mat === '3');
    expect(b).toMatchObject({ saldo: 2400, setor: 'Play 2' });
    expect(v.dups).toHaveLength(1);
  });

  it('o próximo vencimento, o que vence nele, e o mês em que a hora foi feita (vencimento − 12)', () => {
    expect(v.prox).toBe('2026-11-25');
    const f = v.pessoas.find(p => p.mat === '1');
    expect(f).toMatchObject({ vprox: 120, soma: 750 });
    expect(f?.mes).toEqual({ '2025-11': 120, '2026-11': 630 });
    expect(v.ult3).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('os grupos: devendo, vence, acima do limite, em dia', () => {
    const [f, c, b] = ['1', '2', '3'].map(m => v.pessoas.find(p => p.mat === m)!);
    expect(grupoDe(c, 'todas', 40)).toBe('dev');
    expect(grupoDe(f, 'todas', 40)).toBe('vence');
    expect(grupoDe(f, 'pos', 40)).toBe('ok');
    expect(grupoDe(b, 'todas', 40)).toBe('alto');
    expect(grupoDe(c, 'neg', 40)).toBe('f1');
  });

  it('«Só positivas» não deixa passar ninguém negativo, e vice-versa', () => {
    expect(v.pessoas.filter(p => passaSituacao(p, 'pos')).every(p => p.saldo > 0)).toBe(true);
    expect(v.pessoas.filter(p => passaSituacao(p, 'neg')).every(p => p.saldo < 0)).toBe(true);
  });

  it('soma do mês e resumo por setor', () => {
    expect(somaDoMes(v.pessoas, '2026-10')).toEqual({ pos: 0, neg: -180, nPos: 0, nNeg: 1 });
    const s = porSetor(v.pessoas, v.ult3, 'todas', 40).find(x => x.setor === 'Home Receptivo');
    expect(s).toMatchObject({ n: 2, bPos: 750, bNeg: -180, saldo: 570, vprox: 120 });
  });

  it('o Excel sai com as horas como tempo do Excel e uma aba por assunto', () => {
    const abas = abasDoBancoDeHoras(new Set(['resumo', 'pessoas', 'negativas']), v, v.pessoas, 'todas', 40, '');
    expect(abas.map(a => a.nome)).toEqual(['Resumo', 'Pessoas', 'Negativas']);
    const z = unzipSync(montarXlsx(abas));
    expect(Object.keys(z)).toEqual(expect.arrayContaining(['xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet3.xml']));
    // 180 min devendo = 0,125 dia, sem sinal
    expect(strFromU8(z['xl/worksheets/sheet3.xml'])).toContain('<v>0.1250000000</v>');
    expect(strFromU8(z['xl/workbook.xml'])).toContain('name="Negativas"');
  });
});

describe('formatos', () => {
  it('hora sem sinal, mês curto, título com sigla', () => {
    expect(horas(-754)).toBe('12h34');
    expect(mesCurto('2026-11')).toBe('nov/26');
    expect(titulo('SAC DE COBRANCA')).toBe('SAC de Cobranca');
  });
});

describe('«Só o mês» nos Vencimentos (18/11/2026)', () => {
  const pos: PosicaoBH = {
    date: '2026-11-16', importadoEm: null, gerado: null, usuario: null,
    setores: {
      '3|PLAY 2': {
        setor: 'PLAY 2', depto: null, hierarquia: null, empresa: 'BOOK PLAY LTDA', empresaCode: '3',
        arquivo: null, gerado: null, usuario: null,
        people: [
          // já venceu (out), vence nov, dez e jan; e uma negativa em dez
          { mat: '1', nome: 'ANA', saldo: 600, em: '2026-11-16',
            venc: [['2026-10-25', 60], ['2026-11-25', 120], ['2026-12-25', 180], ['2027-01-25', 300], ['2026-12-25', -60]] },
          { mat: '2', nome: 'JOAO', saldo: 90, em: '2026-11-16', venc: [['2026-12-25', 90]] },
        ],
      },
    },
  };
  const v = montarVisao(pos);
  const ana = v.pessoas.find(p => p.mat === '1')!;
  const joao = v.pessoas.find(p => p.mat === '2')!;

  it('soma só aquele mês, sem os de antes, e só as positivas', () => {
    expect(vencendoNoMes(ana, '2026-12', v.data)).toBe(180);
    expect(vencendoNoMes(ana, '2027-01', v.data)).toBe(300);
    expect(ana.v90).toBe(600); // o «90 dias» acumula nov + dez + jan
    expect(vencendoNoMes(joao, '2026-11', v.data)).toBe(0);
  });

  it('o que já venceu não entra', () => {
    expect(vencendoNoMes(ana, '2026-10', v.data)).toBe(0);
  });

  it('os meses vêm de quem está na lista, do mais perto ao mais longe', () => {
    expect(mesesParaVencer(v.pessoas, v.data)).toEqual([
      { mes: '2026-11', dia: '2026-11-25', horas: 120, pessoas: 1 },
      { mes: '2026-12', dia: '2026-12-25', horas: 270, pessoas: 2 },
      { mes: '2027-01', dia: '2027-01-25', horas: 300, pessoas: 1 },
    ]);
    expect(mesesParaVencer([joao], v.data).map(m => m.mes)).toEqual(['2026-12']);
  });
});
