/**
 * A armadilha de cabeçalho.
 *
 * O que se trava aqui é o SILÊNCIO: os parsers resolvem coluna por alias, então
 * uma coluna renomeada não quebra nada — ela para de ser lida e o número encolhe
 * sem aviso. Este módulo é o único ponto que percebe, e ele só serve se avisar
 * quando mudou E ficar calado quando não mudou.
 *
 * Avisar à toa é pior que não avisar: a pessoa aprende a fechar o aviso sem ler,
 * e no dia em que a mudança for real ela fecha também.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizarColuna,
  assinaturaDe,
  compararAssinatura,
  descreverMudanca,
} from './assinaturaColunas';

// O cabeçalho real do 58 da BookPlay, como veio em 13/09/2026.
const CABECALHO_58 = [
  'Cobradora', 'Equipe/SubGrupo', 'Cliente', 'Email', 'Título', 'Colchão?',
  'Parcela', 'NrDocumento', 'Empresa', 'Tipo Venda', 'TpDoc', 'DtLig', 'DtPgto',
  'Dias em atraso', 'Recebido', 'Dias entre ligação e baixa', 'Tipo comissão',
  'Negociação original',
];

describe('normalizarColuna', () => {
  it('usa a MESMA regra dos parsers: sem acento, minúsculo, só alfanumérico', () => {
    expect(normalizarColuna('Colchão?')).toBe('colchao');
    expect(normalizarColuna('Equipe/SubGrupo')).toBe('equipesubgrupo');
    expect(normalizarColuna('Dias entre ligação e baixa')).toBe('diasentreligacaoebaixa');
    expect(normalizarColuna('  DtPgto  ')).toBe('dtpgto');
  });

  it('trata vazio e nulo sem estourar', () => {
    expect(normalizarColuna(null)).toBe('');
    expect(normalizarColuna(undefined)).toBe('');
    expect(normalizarColuna('')).toBe('');
  });
});

describe('assinaturaDe', () => {
  it('derruba coluna vazia — célula em branco no cabeçalho não é coluna', () => {
    expect(assinaturaDe(['Cobradora', '', null, 'DtPgto'])).toEqual(['cobradora', 'dtpgto']);
  });

  it('preserva a ordem', () => {
    expect(assinaturaDe(['B', 'A', 'C'])).toEqual(['b', 'a', 'c']);
  });
});

describe('compararAssinatura', () => {
  const conhecido = assinaturaDe(CABECALHO_58);

  it('fica CALADA quando o cabeçalho é o mesmo', () => {
    expect(compararAssinatura(conhecido, assinaturaDe(CABECALHO_58))).toBeNull();
  });

  it('fica calada na primeira importação — não há com o que comparar', () => {
    expect(compararAssinatura(null, conhecido)).toBeNull();
    expect(compararAssinatura([], conhecido)).toBeNull();
  });

  it('acusa coluna que sumiu', () => {
    const semColchao = assinaturaDe(CABECALHO_58.filter(c => c !== 'Colchão?'));
    const m = compararAssinatura(conhecido, semColchao);
    expect(m).not.toBeNull();
    expect(m!.sumidas).toEqual(['colchao']);
    expect(m!.novas).toEqual([]);
  });

  it('acusa coluna nova', () => {
    const m = compararAssinatura(conhecido, [...conhecido, 'situacaodoacordo']);
    expect(m!.novas).toEqual(['situacaodoacordo']);
    expect(m!.sumidas).toEqual([]);
  });

  /*
   * O caso que motivou tudo: renomear. Para o parser é uma coluna que sumiu e
   * outra que apareceu — ele segue lendo, e o valor daquela coluna some.
   */
  it('acusa renomeação como uma que sumiu e uma que entrou', () => {
    const renomeado = conhecido.map(c => (c === 'recebido' ? 'valorrecebido' : c));
    const m = compararAssinatura(conhecido, renomeado)!;
    expect(m.sumidas).toEqual(['recebido']);
    expect(m.novas).toEqual(['valorrecebido']);
  });

  /*
   * Mesmas colunas, outra ordem. Hoje os parsers resolvem por alias e sobrevivem
   * — mas já houve resolução por índice neste projeto, e um cabeçalho
   * reordenado leria tudo trocado sem reclamar.
   */
  it('acusa ordem trocada mesmo com as mesmas colunas', () => {
    const trocado = [...conhecido];
    [trocado[0], trocado[1]] = [trocado[1], trocado[0]];
    const m = compararAssinatura(conhecido, trocado)!;
    expect(m.ordemMudou).toBe(true);
    expect(m.novas).toEqual([]);
    expect(m.sumidas).toEqual([]);
  });

  it('não aponta ordem quando já há coluna entrando ou saindo', () => {
    // Com uma coluna a menos a ordem muda por consequência; apontar seria ruído.
    const m = compararAssinatura(conhecido, conhecido.slice(1))!;
    expect(m.sumidas).toEqual(['cobradora']);
    expect(m.ordemMudou).toBe(false);
  });

  it('carrega o antes e o depois, para a tela poder mostrar os dois', () => {
    const m = compararAssinatura(conhecido, [...conhecido, 'nova'], 42)!;
    expect(m.conhecido).toEqual(conhecido);
    expect(m.atual).toEqual([...conhecido, 'nova']);
    expect(m.importacoesDoConhecido).toBe(42);
  });
});

describe('descreverMudanca', () => {
  const conhecido = assinaturaDe(CABECALHO_58);

  it('conta no singular e no plural', () => {
    expect(descreverMudanca(compararAssinatura(conhecido, [...conhecido, 'x'])!))
      .toBe('1 coluna nova');
    expect(descreverMudanca(compararAssinatura(conhecido, [...conhecido, 'x', 'y'])!))
      .toBe('2 colunas novas');
    expect(descreverMudanca(compararAssinatura(conhecido, conhecido.slice(2))!))
      .toBe('2 colunas sumiram');
  });

  it('junta as partes quando há mais de uma', () => {
    const outro = [...conhecido.slice(1), 'situacao'];
    expect(descreverMudanca(compararAssinatura(conhecido, outro)!))
      .toBe('1 coluna nova, 1 coluna sumiu');
  });

  it('descreve a ordem', () => {
    const trocado = [...conhecido];
    [trocado[0], trocado[1]] = [trocado[1], trocado[0]];
    expect(descreverMudanca(compararAssinatura(conhecido, trocado)!))
      .toBe('a ordem das colunas mudou');
  });
});
