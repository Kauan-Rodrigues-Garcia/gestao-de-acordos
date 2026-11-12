/**
 * O 1017 da Manutenção (12/11/2026): soma no recebimento GERAL do setor e em
 * mais nada. Aqui ficam provadas as quatro peças do front: o parser, quem vê o
 * botão, a origem que vem do banco e a regra do escopo.
 */
import { describe, it, expect } from 'vitest';
import { parseRelatorio1017Rows } from './relatorio1017Parser';
import { identificarRelatorio } from '@/services/relatorio945/identificar';
import { parseRelatorioRows } from '@/services/analitico/analiticoParser';
import { relatorioDaOrigem, setoresQuePodeImportar, origemDoRelatorio } from '@/lib/relatoriosDoSetor';
import { linhaNoEscopo, escopoDeSetor, ESCOPO_EMPRESA } from '@/services/analitico/escopoAnalitico';
import { ajustesComoLinhas, type AjusteDoDia } from '@/services/analitico/ajusteManual.service';

const CABECALHO = [
  'Cód. franquia', 'Franquia', 'Vendedor', 'Usuário', 'Nr. Documento', 'Cód. Cliente', 'Dt. Venda',
  'Dt. Aprovação', 'Dt. Cancel. Recorrência', 'Cód. Receber', 'Cód. Acordo', 'Dt. Acordo',
  'Inclusão Acordo', 'Inclusão Grupo', 'Dt. Cancel Acordo', 'Cancelamento Acordo', 'Cancelamento Grupo',
  'Dt. Vencimento', 'Dt. Pagamento', 'Tipo Recorrência', 'Status', 'Parcela Recorrência', 'Valor',
];

/** Uma linha do 1017 com o que importa; o resto vazio. */
function linha(nr: string | null, pagamento: Date | null, tipo: string, parcela: number | null, valor: number): unknown[] {
  const l: unknown[] = new Array(CABECALHO.length).fill(null);
  l[0] = 6561; l[1] = 'FRANQUIA TESTE'; l[2] = 'VENDEDORA'; l[3] = 'vendedora';
  l[4] = nr; l[5] = '29448090'; l[17] = pagamento; l[18] = pagamento;
  l[19] = tipo; l[20] = 'Confirmado'; l[21] = parcela; l[22] = valor;
  return l;
}

const rodape = (valor: number): unknown[] => { const l = new Array(CABECALHO.length).fill(null); l[22] = valor; return l; };
const d = (dia: number, mes = 11) => new Date(2026, mes - 1, dia);

describe('identificação do 1017 pelo cabeçalho', () => {
  it('reconhece o 1017', () => {
    expect(identificarRelatorio(CABECALHO)).toBe('1017');
  });

  it('o importador do 58 recusa o 1017 com o caminho certo', () => {
    const r = parseRelatorioRows([CABECALHO, linha('1', d(4), 'Pix', 2, 10)]);
    expect(r.linhas).toHaveLength(0);
    expect(r.erros.join(' ')).toMatch(/1017/);
  });
});

describe('parseRelatorio1017Rows', () => {
  it('lê as linhas pagas, descarta o rodapé de total e soma por tipo', () => {
    const r = parseRelatorio1017Rows([
      CABECALHO,
      linha('12943442', d(4), 'Cartão de Crédito', 7, 224.1),
      linha('12987292', d(1), 'Pix', 2, 100.05),
      rodape(324.15),
    ]);
    expect(r.erros).toEqual([]);
    expect(r.mes).toBe('2026-11');
    expect(r.total).toEqual({ linhas: 2, valor: 324.15 });
    expect(r.porTipo['Pix']).toEqual({ linhas: 1, valor: 100.05 });
    expect(r.linhas[0]).toMatchObject({
      nr: '12943442', pagamento: '2026-11-04', vencimento: '2026-11-04', parcela: 7, valor: 224.1,
      tipo: 'Cartão de Crédito', status: 'Confirmado', cod_cliente: '29448090',
    });
  });

  it('NR que o Excel entregou como número vira texto sem casa decimal', () => {
    const r = parseRelatorio1017Rows([CABECALHO, linha(12943442 as unknown as string, d(4), 'Pix', 3, 10)]);
    expect(r.linhas[0].nr).toBe('12943442');
  });

  it('1ª parcela e linha sem pagamento ficam fora, e a prévia diz quanto', () => {
    const r = parseRelatorio1017Rows([
      CABECALHO,
      linha('1', d(4), 'Pix', 1, 50),
      linha('2', null, 'Pix', 3, 30),
      linha('3', d(5), 'Pix', 2, 20),
    ]);
    expect(r.fora.parcelaUm).toEqual({ linhas: 1, valor: 50 });
    expect(r.fora.semPagamento).toEqual({ linhas: 1, valor: 30 });
    expect(r.total).toEqual({ linhas: 1, valor: 20 });
  });

  it('arquivo com dois meses é erro: o mês é trocado inteiro', () => {
    const r = parseRelatorio1017Rows([CABECALHO, linha('1', d(30, 10), 'Pix', 2, 10), linha('2', d(3), 'Pix', 2, 10)]);
    expect(r.mes).toBeNull();
    expect(r.erros.join(' ')).toMatch(/2 meses/);
  });

  it('mesmo NR no mesmo dia e parcela é erro (a chave do banco)', () => {
    const r = parseRelatorio1017Rows([CABECALHO, linha('1', d(3), 'Pix', 2, 10), linha('1', d(3), 'Pix', 2, 10)]);
    expect(r.erros.join(' ')).toMatch(/duas vezes/);
  });

  it('recusa outro relatório com mensagem', () => {
    const r = parseRelatorio1017Rows([['Cobradora', 'TpDoc', 'DtPgto', 'Recebido'], ['x', 'PIX', '01/11/2026', '10']]);
    expect(r.linhas).toHaveLength(0);
    expect(r.erros[0]).toMatch(/não o 1017/);
  });
});

describe('quem importa', () => {
  const configurados = [{ setorId: 'manutencao', relatorio: '1017' as const }];

  it('o super admin importa em qualquer setor que usa o relatório', () => {
    expect(setoresQuePodeImportar({ perfil: 'super_admin', setorId: null }, configurados)).toEqual(configurados);
  });

  it('o líder importa só no próprio setor', () => {
    expect(setoresQuePodeImportar({ perfil: 'lider', setorId: 'manutencao' }, configurados)).toEqual(configurados);
    expect(setoresQuePodeImportar({ perfil: 'lider', setorId: 'play1' }, configurados)).toEqual([]);
  });

  it('nenhum outro cargo importa, nem do próprio setor', () => {
    for (const perfil of ['operador', 'elite', 'gerencia', 'diretoria', 'administrador']) {
      expect(setoresQuePodeImportar({ perfil, setorId: 'manutencao' }, configurados)).toEqual([]);
    }
  });
});

describe('a origem que o banco devolve', () => {
  it('relatorio_1017 é o 1017; ajuste e origem ausente não são relatório', () => {
    expect(relatorioDaOrigem(origemDoRelatorio('1017'))).toBe('1017');
    expect(relatorioDaOrigem('ajuste')).toBeNull();
    expect(relatorioDaOrigem(undefined)).toBeNull();
    expect(relatorioDaOrigem('relatorio_9999')).toBeNull();
  });
});

describe('o 1017 soma no setor e em mais nada', () => {
  const ajuste1017: AjusteDoDia = {
    alvo: 'setor', operadorId: null, equipeId: null, setorId: 'manutencao',
    dia: '2026-11-04', valor: 1000, valorHo: 0, relatorio: '1017',
  };
  const ajusteDeSetor: AjusteDoDia = { ...ajuste1017, relatorio: null };
  const [linha1017] = ajustesComoLinhas([ajuste1017]);
  const [linhaAjuste] = ajustesComoLinhas([ajusteDeSetor]);

  const setor = escopoDeSetor({ setorId: 'manutencao', alternativo: false, operadores: new Set(), temCarimbo: true });

  it('conta no setor dele', () => {
    expect(linhaNoEscopo(linha1017, setor)).toBe(true);
  });

  it('não conta em outro setor, na equipe nem no operador', () => {
    const outro = escopoDeSetor({ setorId: 'play1', alternativo: false, operadores: new Set(), temCarimbo: true });
    expect(linhaNoEscopo(linha1017, outro)).toBe(false);
    expect(linhaNoEscopo(linha1017, { tipo: 'equipe', operadores: new Set(['op1']), equipeId: 'eq1' })).toBe(false);
    expect(linhaNoEscopo(linha1017, { tipo: 'operador', operadorId: 'op1' })).toBe(false);
  });

  it('não conta na empresa — o ajuste de setor continua contando', () => {
    expect(linhaNoEscopo(linha1017, ESCOPO_EMPRESA)).toBe(false);
    expect(linhaNoEscopo(linhaAjuste, ESCOPO_EMPRESA)).toBe(true);
  });

  it('é dinheiro, não pagamento, e aparece com o nome do relatório', () => {
    expect(linha1017.qtd).toBe(0);
    expect(linha1017.forma_detalhe).toMatch(/1017/);
    expect(linha1017.relatorio_do_setor).toBe('1017');
    expect(linhaAjuste.relatorio_do_setor).toBeNull();
  });
});
