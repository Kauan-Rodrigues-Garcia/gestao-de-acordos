/**
 * A importação conferida do Pix (12/11/2026) — a planilha da liderança como
 * ela é de verdade: cabeçalho na linha 2, data sem título na coluna A, login no
 * lugar do nome, % em fração e a comissão na coluna «valor».
 */
import { describe, expect, it } from 'vitest';
import type { RegistroPixConferencia } from '@/services/pix_automatico.service';
import {
  abaDoMes, conferirPlanilhaPix, escolherAba, matrizDaAba, mesCurto, mesDasLinhas, contarSituacoes, ehVerde, indexarPorNr, lerAbaPix, lerDia, lerNumero,
  lerPct, reconhecerOperador, textoDizPago, type PessoaPix,
} from './pixImportacao';

// 03/11/2026 e 06/11/2026 em serial do Excel.
const D_03_11 = 46329;
const D_06_11 = 46332;

const CAB = ['', 'operador', 'nr', 'Valor de Nota', '%', 'valor', 'Meta batida-Pendente',
  'nome completo', 'código crachá', 'CHAVE PIX', 'LIDER'];
const linha = (dia: unknown, op: string, nr: unknown, valor: unknown, pct = 0.004) =>
  [dia, op, nr, valor, pct, typeof valor === 'number' ? valor * pct : '', '', `${op} completo`, 31438, 'chave', 'MATEUS'];

const planilha = (...linhas: unknown[][]) => [['   '], CAB, ...linhas, ['', '', '', 1354966.07, '', '', 813700]];

const pessoas: PessoaPix[] = [
  { id: 'camilly', nome: 'Camilly Vitoria Silva Carvalho', usuario: 'camilly_carvalho', email: 'c@x.com', setor_id: 'play2' },
  { id: 'poliana', nome: 'Poliana Roberta', usuario: 'poliana_shueter', email: 'p@x.com', setor_id: 'play2' },
  { id: 'thaina',  nome: 'Thaina Couto', usuario: 'thaina_couto', email: 't@x.com', setor_id: 'play2' },
];

const registro = (r: Partial<RegistroPixConferencia>): RegistroPixConferencia => ({
  id: 'r', nr_cliente: '1', operador_id: 'x', operador_nome: 'X', setor_id: 'receptivo',
  valor: 100, status: 'pendente', pago: false, criado_em: '2026-11-04T15:00:00Z', pct_comissao: null, ...r,
});

function conferir(matriz: unknown[][], noPix: RegistroPixConferencia[] = [], cores?: (string | null)[][]) {
  const { linhas } = lerAbaPix(matriz, cores);
  return conferirPlanilhaPix({
    linhas, mes: '2026-11', noPix: indexarPorNr(noPix),
    pessoaDe: l => reconhecerOperador(l, pessoas),
    nomeDoSetor: id => (id === 'receptivo' ? 'Receptivo' : String(id)),
  });
}

describe('lerAbaPix — a planilha da liderança', () => {
  it('acha o cabeçalho na linha 2, a data sem título e pula a linha de total', () => {
    const lida = lerAbaPix(planilha(linha(D_03_11, 'camilly_carvalho', 13018946, 6076)));
    expect(lida.erro).toBeUndefined();
    expect(lida.colunas).toMatchObject({ data: 0, operador: 1, nr: 2, valor: 3, pct: 4, comissao: 5 });
    expect(lida.linhas).toHaveLength(1);
    expect(lida.linhas[0]).toMatchObject({
      linha: 3, nr: '13018946', valor: 6076, operador: 'camilly_carvalho',
      dia: '2026-11-03', pct: 0.4,
    });
    expect(lida.linhas[0].comissao).toBeCloseTo(24.304);
  });

  it('sem «Valor de Nota», «Valor» é o valor do acordo (o arquivo que a tela exporta)', () => {
    const lida = lerAbaPix([['NR', 'Operador', 'Valor', 'Comissao', 'Status', 'Data'],
      ['12999974', 'Thaina Couto', 1500, 6, 'Pendente', '05/11/2026']]);
    expect(lida.linhas[0]).toMatchObject({ nr: '12999974', valor: 1500, comissao: 6, dia: '2026-11-05' });
  });

  it('aba sem NR não é do Pix', () => {
    expect(lerAbaPix([['Rótulos de linha', 'Soma']]).erro).toMatch(/NR/);
  });

  it('NR com sujeira volta só número; com dois números, ilegível', () => {
    const { linhas } = lerAbaPix(planilha(
      linha(D_03_11, 'camilly_carvalho', '12917488_', 100),
      linha(D_03_11, 'camilly_carvalho', '1291 7488', 100),
    ));
    expect(linhas.map(l => l.nr)).toEqual(['12917488', '']);
  });
});

describe('leitores de célula', () => {
  it('data: serial, dd/mm/aaaa e vazio', () => {
    expect(lerDia(D_06_11)).toBe('2026-11-06');
    expect(lerDia('6/11/2026')).toBe('2026-11-06');
    expect(lerDia('')).toBeNull();
    expect(lerDia(13018946)).toBeNull();
  });
  it('número: brasileiro e com ponto decimal', () => {
    expect(lerNumero('R$ 6.076,40')).toBe(6076.4);
    expect(lerNumero('6076.4')).toBe(6076.4);
    expect(lerNumero(' ')).toBeNull();
  });
  it('%: a fração da planilha vira o percentual do Pix', () => {
    expect(lerPct(0.004)).toBe(0.4);
    expect(lerPct(0.0045)).toBe(0.45);
    expect(lerPct('0,45%')).toBe(0.45);
    expect(lerPct('%')).toBeNull();
  });
  it('a aba do mês da tela', () => {
    expect(abaDoMes(['Novembro ', 'OUTUBRO', 'SETEMBRO'], '2026-10')).toBe('OUTUBRO');
    expect(abaDoMes(['Novembro ', 'OUTUBRO'], '2026-11')).toBe('Novembro ');
    expect(abaDoMes(['Planilha1'], '2026-11')).toBe('Planilha1');
    // A da Digital: o mês vem no fim ou no começo do nome.
    expect(abaDoMes(['OUTUBRO PIX AUTOMATICO', 'PIX AUTOMATICO NOVEMBRO'], '2026-11')).toBe('PIX AUTOMATICO NOVEMBRO');
    expect(abaDoMes(['Junho PIX automatico', 'JULHO PIX AUTOMATICO'], '2026-07')).toBe('JULHO PIX AUTOMATICO');
  });
});

describe('reconhecerOperador', () => {
  it('pelo login, ignorando caixa, espaço e sublinhado', () => {
    expect(reconhecerOperador({ operador: 'poliana_ Shueter ', nomeCompleto: '' }, pessoas)?.id).toBe('poliana');
    expect(reconhecerOperador({ operador: 'THAINA_COUTO', nomeCompleto: '' }, pessoas)?.id).toBe('thaina');
  });
  it('pelo nome completo, quando o login não bate', () => {
    expect(reconhecerOperador({ operador: 'camilly', nomeCompleto: 'camilly vitória silva carvalho' }, pessoas)?.id)
      .toBe('camilly');
  });
  it('empate: fica quem está ativo; sem desempate, ninguém', () => {
    const duas: PessoaPix[] = [
      { id: 'a', nome: 'Ana', usuario: 'ana', email: null, setor_id: null, ativo: false },
      { id: 'b', nome: 'Ana', usuario: 'ana2', email: null, setor_id: null },
    ];
    expect(reconhecerOperador({ operador: 'Ana', nomeCompleto: '' }, duas)?.id).toBe('b');
    expect(reconhecerOperador({ operador: 'Ana', nomeCompleto: '' }, [duas[1], { ...duas[1], id: 'c' }])).toBeNull();
  });
});

describe('conferirPlanilhaPix — comparação com todos os setores', () => {
  it('NR que não está em setor nenhum: faltando, marcado', () => {
    const [l] = conferir(planilha(linha(D_03_11, 'camilly_carvalho', 13018946, 6076)));
    expect(l).toMatchObject({ situacao: 'faltando', acao: 'adicionar', marcada: true });
    expect(l.pessoa?.id).toBe('camilly');
  });

  it('operador não reconhecido: faltando, mas só entra depois de escolher quem é', () => {
    const [l] = conferir(planilha(linha(D_03_11, 'fulano_novo', 13018946, 6076)));
    expect(l).toMatchObject({ situacao: 'faltando', acao: null, marcada: false });
  });

  it('NR com outra pessoa de OUTRO setor neste mês: repetido, não entra', () => {
    const [l] = conferir(planilha(linha(D_03_11, 'camilly_carvalho', 13018946, 6076)), [
      registro({ nr_cliente: '13018946', operador_id: 'erika', operador_nome: 'Erika', setor_id: 'receptivo' }),
    ]);
    expect(l).toMatchObject({ situacao: 'repetido', acao: null });
    expect(l.motivo).toMatch(/Erika \(Receptivo, 04\/11\).*transferência/);
    expect(l.noPix).toHaveLength(1);
  });

  it('NR com outra pessoa em outro mês: repetido, pode entrar, mas vem desmarcado', () => {
    const [l] = conferir(planilha(linha(D_03_11, 'camilly_carvalho', 13018946, 6076)), [
      registro({ nr_cliente: '13018946', operador_id: 'erika', criado_em: '2026-08-10T15:00:00Z' }),
    ]);
    expect(l).toMatchObject({ situacao: 'repetido', acao: 'adicionar', marcada: false });
  });

  it('a mesma pessoa em outro mês: o banco não deixa repetir', () => {
    const [l] = conferir(planilha(linha(D_03_11, 'camilly_carvalho', 13018946, 6076)), [
      registro({ nr_cliente: '13018946', operador_id: 'camilly', criado_em: '2026-09-10T15:00:00Z' }),
    ]);
    expect(l).toMatchObject({ situacao: 'repetido', acao: null });
  });

  it('a mesma pessoa neste mês: já lançado, e aponta valor diferente', () => {
    const c = conferir(planilha(
      linha(D_03_11, 'camilly_carvalho', 13018946, 6076),
      linha(D_03_11, 'thaina_couto', 13050106, 6990.86),
    ), [
      registro({ nr_cliente: '13018946', operador_id: 'camilly', valor: 6076 }),
      registro({ id: 'r2', nr_cliente: '13050106_', operador_id: 'thaina', valor: 6000 }),
    ]);
    expect(c[0]).toMatchObject({ situacao: 'lancado', valorDiferente: false });
    // O NR antigo com sujeira («13050106_») também é achado.
    expect(c[1]).toMatchObject({ situacao: 'lancado', valorDiferente: true });
  });

  it('problemas: sem NR, sem valor, data de outro mês, NR repetido na planilha', () => {
    const c = conferir(planilha(
      linha(D_03_11, 'camilly_carvalho', '', 8389.92),
      linha(D_03_11, 'camilly_carvalho', 13000001, ''),
      linha(46263, 'camilly_carvalho', 13000002, 100),     // 29/08/2026
      linha(D_03_11, 'camilly_carvalho', 13000003, 100),
      linha(D_06_11, 'thaina_couto', 13000003, 100),
    ));
    expect(c.map(l => l.situacao)).toEqual(['problema', 'problema', 'problema', 'faltando', 'problema']);
    expect(c[2].motivo).toMatch(/08\/2026/);
    expect(c[4].motivo).toMatch(/linha 6/);
    expect(contarSituacoes(c)).toEqual({ faltando: 1, repetido: 0, acertar: 0, lancado: 0, problema: 4 });
  });

  it('linha sem data entra no mês da tela', () => {
    const [l] = conferir(planilha(linha('', 'camilly_carvalho', 13056823, 6020)));
    expect(l).toMatchObject({ situacao: 'faltando', dia: null, acao: 'adicionar' });
  });
});

// ── O que já foi pago ───────────────────────────────────────────────────────

/** A cor de cada célula de uma linha, do jeito que o diálogo monta. */
const pintar = (matriz: unknown[][], linhas: Record<number, string>) =>
  matriz.map((l, i) => (l ?? []).map(() => linhas[i] ?? null));

describe('pago na planilha', () => {
  it('verde: o 34A853 e o 6AA84F do Play 2 e o «Bom» do Excel; amarelo, laranja, rosa e azul não', () => {
    expect(['34A853', 'FF6AA84F', 'C6EFCE'].map(ehVerde)).toEqual([true, true, true]);
    expect(['FFFF00', 'FFC000', 'FF9900', 'C27BA0', 'DAE3F3', 'FFFFFF', '111827', null].map(ehVerde))
      .toEqual([false, false, false, false, false, false, false, false]);
  });

  it('texto da SIT: «pagos», «pg», «ok pago», «já enviado» sim; «pendente», «receptivo», «ok» não', () => {
    expect(['PAGOS', 'pg', 'ok pago ', 'Pago', 'já enviado'].map(textoDizPago)).toEqual([true, true, true, true, true]);
    expect(['pendente', 'receptivo', 'ok', 'não pago', ''].map(textoDizPago)).toEqual([false, false, false, false, false]);
  });

  it('Play 2: a linha verde é paga', () => {
    const m = planilha(
      linha(D_03_11, 'camilly_carvalho', 13018946, 6076),
      linha(D_03_11, 'thaina_couto', 13050106, 6990.86),
    );
    const { linhas } = lerAbaPix(m, pintar(m, { 2: '34A853' }));
    expect(linhas.map(l => [l.pago, l.marcaPago])).toEqual([[true, 'verde'], [false, null]]);
  });

  it('Digital: cabeçalho próprio, SIT com título e sem título', () => {
    const comSit = lerAbaPix([
      [' ', '', '', 'Valor \n(Pix Automático e Cartão Recorrente)'],
      ['codigo', 'Data ', 'Operador', 'nr ', 'Valor de Nota', '%', 'valor ', 'Meta batida-Pendente ', 'PIX', 'SIT'],
      [399102, D_03_11, 'maria_moreirasantos', 12678067, 4581.6, 0.005, 22.908, 22.908, '', 'pg'],
      [31083, D_06_11, 'luana_barrios', 12955035, 6073.32, 0.005, 30.37, 30.37, '', ''],
    ]);
    expect(comSit.colunas).toMatchObject({ data: 1, operador: 2, nr: 3, valor: 4, pct: 5, comissao: 6, situacao: 9 });
    expect(comSit.linhas.map(l => [l.nr, l.dia, l.pct, l.pago, l.marcaPago]))
      .toEqual([['12678067', '2026-11-03', 0.5, true, '«pg»'], ['12955035', '2026-11-06', 0.5, false, null]]);

    // Junho/Julho/Agosto: a SIT não tem título, e a coluna «pix» (a chave) fica de fora.
    const semTitulo = lerAbaPix([
      ['codigo', 'Data ', 'Login', 'nr ', 'Valor de Nota', '%', 'valor ', 'Meta batida-Pendente ', 'pix ', ''],
      ['', D_03_11, 'bruno_uemura', 12754328, 7267.5, 0.005, 36.34, 36.34, '', 'pendente'],
      ['', D_03_11, 'erika_eduarda', 12661438, 2040, 0.005, 10.2, 10.2, '55954868808', 'ok pago'],
      ['', D_03_11, 'erika_eduarda', 12661439, 2040, 0.005, 10.2, 10.2, '', ''],
    ]);
    expect(semTitulo.colunas.situacao).toBe(9);
    expect(semTitulo.linhas.map(l => l.pago)).toEqual([false, true, false]);
  });
});

describe('pagamento a acertar', () => {
  const verde = (m: unknown[][]) => pintar(m, { 2: '34A853' });
  const m = planilha(linha(D_03_11, 'camilly_carvalho', 13018946, 6076));

  it('pago na planilha e não está no Pix: entra aprovado e pago', () => {
    const [l] = conferir(m, [], verde(m));
    expect(l).toMatchObject({ situacao: 'faltando', acao: 'adicionar', marcada: true, pago: true });
    expect(l.motivo).toMatch(/aprovado e pago/);
  });

  it('pago na planilha, pendente no Pix: acertar, marcado', () => {
    const [l] = conferir(m, [registro({ id: 'r9', nr_cliente: '13018946', operador_id: 'camilly', valor: 6076 })], verde(m));
    expect(l).toMatchObject({ situacao: 'acertar', acao: 'acertar', marcada: true });
    expect(l.registro?.id).toBe('r9');
    expect(l.motivo).toMatch(/aprovar e pagar/);
  });

  it('pago na planilha, aprovado sem pagamento: acertar, só pagar', () => {
    const [l] = conferir(m, [registro({ nr_cliente: '13018946', operador_id: 'camilly', status: 'aprovado' })], verde(m));
    expect(l).toMatchObject({ situacao: 'acertar', acao: 'acertar' });
    expect(l.motivo).toMatch(/marque para pagar/);
  });

  it('pago na planilha, desaprovado no Pix: acertar, sem ação', () => {
    const [l] = conferir(m, [registro({ nr_cliente: '13018946', operador_id: 'camilly', status: 'desaprovado' })], verde(m));
    expect(l).toMatchObject({ situacao: 'acertar', acao: null });
  });

  it('pago no Pix e não na planilha: acertar, só aviso', () => {
    const [l] = conferir(m, [registro({ nr_cliente: '13018946', operador_id: 'camilly', status: 'aprovado', pago: true })]);
    expect(l).toMatchObject({ situacao: 'acertar', acao: null });
    expect(l.motivo).toMatch(/não marca como pago/);
  });

  it('pago nos dois: já lançado', () => {
    const [l] = conferir(m, [registro({ nr_cliente: '13018946', operador_id: 'camilly', status: 'aprovado', pago: true, valor: 6076 })], verde(m));
    expect(l).toMatchObject({ situacao: 'lancado', acao: null });
  });

  it('sem permissão de aprovar: o pendente pago fica sem ação', () => {
    const { linhas } = lerAbaPix(m, verde(m));
    const [l] = conferirPlanilhaPix({
      linhas, mes: '2026-11', podeAprovar: false,
      noPix: indexarPorNr([registro({ nr_cliente: '13018946', operador_id: 'camilly' })]),
      pessoaDe: x => reconhecerOperador(x, pessoas), nomeDoSetor: String,
    });
    expect(l).toMatchObject({ situacao: 'acertar', acao: null });
  });
});

describe('qual aba abrir', () => {
  const abas = [
    { nome: 'Junho PIX automatico', mes: '2026-06' },
    { nome: 'OUTUBRO PIX AUTOMATICO', mes: '2026-10' },
    { nome: 'PIX AUTOMATICO NOVEMBRO', mes: '2026-11' },
  ];
  it('pelo nome, quando o nome diz o mês', () => {
    expect(escolherAba(abas, '2026-10')).toBe('OUTUBRO PIX AUTOMATICO');
  });
  it('pelas datas, quando o nome não diz («Planilha1», «Pix»)', () => {
    expect(escolherAba([{ nome: 'Pix', mes: '2026-09' }, { nome: 'Planilha1', mes: '2026-11' }], '2026-11'))
      .toBe('Planilha1');
  });
  it('sem nome nem data do mês: a primeira (a tela avisa e oferece trocar o mês)', () => {
    expect(escolherAba(abas, '2026-12')).toBe('Junho PIX automatico');
  });
  it('o mês das linhas é o da maioria; sem data, nenhum', () => {
    expect(mesDasLinhas([{ dia: '2026-08-29' }, { dia: '2026-09-01' }, { dia: '2026-09-02' }, { dia: null }]))
      .toBe('2026-09');
    expect(mesDasLinhas([{ dia: null }])).toBeNull();
    expect(mesCurto('2026-10')).toBe('out/2026');
  });
});

describe('reconhecerOperador — palavras do login no nome', () => {
  const equipe: PessoaPix[] = [
    { id: 'igor', nome: 'Igor Rocha', usuario: null, email: null, setor_id: null },
    { id: 'leo', nome: 'Leonardo Nunes Keppler', usuario: null, email: null, setor_id: null },
    { id: 'm1', nome: 'Maria Silva', usuario: null, email: null, setor_id: null },
    { id: 'm2', nome: 'Maria Souza', usuario: null, email: null, setor_id: null },
  ];
  it('«igor_s_rocha» é Igor Rocha; «leonardo_nunes» é Leonardo Nunes Keppler', () => {
    expect(reconhecerOperador({ operador: 'igor_s_rocha', nomeCompleto: '' }, equipe)?.id).toBe('igor');
    expect(reconhecerOperador({ operador: 'leonardo_nunes', nomeCompleto: '' }, equipe)?.id).toBe('leo');
  });
  it('uma palavra só não basta, e duas pessoas possíveis é ninguém', () => {
    expect(reconhecerOperador({ operador: 'maria', nomeCompleto: '' }, equipe)).toBeNull();
    expect(reconhecerOperador({ operador: 'maria_s', nomeCompleto: '' }, equipe)).toBeNull();
  });
});

describe('matrizDaAba', () => {
  it('linha da matriz = linha do Excel, com a cor; o tamanho vem das células com valor', async () => {
    const xlsx = await import('@e965/xlsx');
    const ws: Record<string, unknown> = {
      // Formatação na coluna inteira: o `!ref` diz 1 milhão de linhas.
      '!ref': 'A1:K1048576',
      B2: { v: 'nr' }, C2: { v: 'Valor de Nota' },
      B4: { v: 123, s: { patternType: 'solid', fgColor: { rgb: '34A853' } } },
      C4: { v: 10, s: { patternType: 'solid', fgColor: { rgb: '34A853' } } },
      Z900000: { s: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } } },   // só cor, sem valor
    };
    const { valores, cores } = matrizDaAba(xlsx.utils, ws);
    expect(valores).toHaveLength(4);
    expect(valores[1][1]).toBe('nr');
    expect(valores[2]).toEqual(['', '', '']);
    expect(valores[3][1]).toBe(123);
    expect(cores[3][1]).toBe('34A853');
    expect(lerAbaPix(valores, cores).linhas[0]).toMatchObject({ linha: 4, nr: '123', pago: true });
  });
});
