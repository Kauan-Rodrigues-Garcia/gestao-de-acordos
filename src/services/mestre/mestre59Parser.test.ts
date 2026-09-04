/**
 * mestre59Parser.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * O parser do relatório mestre 59.
 *
 * Os casos abaixo não são hipóteses: cada um trava um comportamento medido no
 * arquivo real (agosto/2026, 50.934 linhas, R$ 11.868.638,69) em 04/09/2026.
 * As fixtures são pequenas de propósito — o arquivo tem 13 MB e não entra no
 * repositório —, mas cada uma reproduz uma forma que ELE tem.
 */
import { describe, it, expect } from 'vitest';
import {
  parseMestre59, agruparPorGrupoFiltro, normalizarCabecalho, quebrarLinhaCsv,
} from './mestre59Parser';

const CABECALHO = [
  'Setor', 'Cobradora', 'SubgrupoEquipe', 'Cliente', 'Titulo', 'Colchão?', 'Parcela',
  'NrDocumento', 'Empresa', 'TipoVenda', 'TpDoc', 'DtLig', 'PrevPgto', 'Dias', 'DtPgto',
  'DiasAtraso', 'Recebido', 'Tipo', 'OperadorOrig', 'SetorOrig', 'DiasLigacaoBaixa',
  'DDD1', 'Fone1', 'CodGrupo', 'CodGrupoRepresenta', 'CodGrupoFiltro', 'NomeGrupoFiltro', 'CodCli',
].join(';');

/** Uma linha no formato exato do arquivo. Ajustes vêm por `campos`. */
function linha(campos: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    Setor: 'MARILIA - PLAY 5', Cobradora: 'ADRIELY_LIMA', SubgrupoEquipe: 'EQUIPE LAYANE',
    Cliente: '33069260 - VANIA', Titulo: '3849109', 'Colchão?': 'Não', Parcela: '8',
    NrDocumento: '12745667', Empresa: 'BOOKPLAY', TipoVenda: 'TEC', TpDoc: 'PIX',
    DtLig: '2026-08-03', PrevPgto: '2026-08-04', Dias: '-1', DtPgto: '2026-08-03',
    DiasAtraso: '555', Recebido: '100.0', Tipo: 'Integral', OperadorOrig: '', SetorOrig: '',
    DiasLigacaoBaixa: '0', DDD1: '99', Fone1: '981089409', CodGrupo: '3',
    CodGrupoRepresenta: '', CodGrupoFiltro: '3', NomeGrupoFiltro: 'MARILIA - PLAY 5',
    CodCli: '33069260',
  };
  const v = { ...base, ...campos };
  return CABECALHO.split(';').map(c => v[c] ?? '').join(';');
}

/** O arquivo real tem BOM de UTF-8 e quebra CRLF. */
function arquivo(...linhas: string[]): string {
  return '﻿' + [CABECALHO, ...linhas].join('\r\n') + '\r\n';
}

describe('normalizarCabecalho', () => {
  it('resolve `Colchão?`, que é a coluna com acento E pontuação', () => {
    // Sem isto a marcação de colchão não casa com alias nenhum — e ela decide
    // R$ 363 mil que não são recebimento do mês.
    expect(normalizarCabecalho('Colchão?')).toBe('colchao');
  });

  it('achata as demais para a chave usada no mapa de colunas', () => {
    expect(normalizarCabecalho('NomeGrupoFiltro')).toBe('nomegrupofiltro');
    expect(normalizarCabecalho('  DtPgto  ')).toBe('dtpgto');
    expect(normalizarCabecalho('Dias em atraso')).toBe('diasematraso');
  });
});

describe('quebrarLinhaCsv', () => {
  it('quebra a linha simples — a forma que o arquivo real tem', () => {
    expect(quebrarLinhaCsv('a;b;c')).toEqual(['a', 'b', 'c']);
  });

  it('preserva campo vazio, inclusive no fim', () => {
    // `SetorOrig` vem vazio em 78% das linhas, e é o último campo de vários
    // registros. Perder o vazio final desalinharia a contagem de colunas.
    expect(quebrarLinhaCsv('a;;c;')).toEqual(['a', '', 'c', '']);
  });

  it('não deixa um `;` dentro de aspas partir o campo', () => {
    // O arquivo de agosto não tem nenhuma aspa. O dia em que um nome de cliente
    // vier com `;`, um split ingênuo jogaria as colunas uma casa para o lado e
    // o `Recebido` viraria outra coisa, sem erro nenhum.
    expect(quebrarLinhaCsv('a;"b;c";d')).toEqual(['a', 'b;c', 'd']);
  });

  it('entende a aspa dupla escapada', () => {
    expect(quebrarLinhaCsv('a;"diz ""oi""";b')).toEqual(['a', 'diz "oi"', 'b']);
  });
});

describe('parseMestre59 — o caminho feliz', () => {
  it('lê BOM, CRLF e separador `;` como o arquivo vem', () => {
    const r = parseMestre59(arquivo(linha(), linha({ Recebido: '50.5' })));
    expect(r.colunasFaltando).toEqual([]);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(r.mes).toBe('2026-08');
    expect(r.totalRecebido).toBe(150.5);
  });

  it('tipa cada coluna, e a data ISO não vira serial de Excel', () => {
    const [l] = parseMestre59(arquivo(linha())).linhas;
    expect(l.dt_pgto).toBe('2026-08-03');
    expect(l.recebido).toBe(100);
    expect(l.colchao).toBe(false);
    expect(l.dias).toBe(-1);              // negativo é normal: pagou antes da previsão
    expect(l.parcela).toBe('8');          // texto: o COFEN usa `201601`
    expect(l.cod_grupo_filtro).toBe('3');
    expect(l.setor_orig).toBeNull();      // vazio vira null, não string vazia
    expect(l.linha_num).toBe(2);          // 1 é o cabeçalho
  });

  it('`Colchão? = Sim` vira true', () => {
    const [l] = parseMestre59(arquivo(linha({ 'Colchão?': 'Sim' }))).linhas;
    expect(l.colchao).toBe(true);
  });

  it('ignora a linha em branco do fim do arquivo', () => {
    const r = parseMestre59('﻿' + [CABECALHO, linha(), ''].join('\r\n'));
    expect(r.linhas).toHaveLength(1);
    expect(r.descartadas).toBe(0);
  });

  it('não guarda telefone do cliente', () => {
    // `DDD1`/`Fone1` existem no arquivo e ficam de fora de propósito: nada no
    // sistema usa, e contato pessoal não entra em tabela nova sem decisão.
    const [l] = parseMestre59(arquivo(linha())).linhas;
    expect(Object.keys(l)).not.toContain('ddd1');
    expect(Object.keys(l)).not.toContain('fone1');
  });
});

describe('parseMestre59 — recusa o que não dá para importar', () => {
  it('recusa arquivo sem as colunas do 59', () => {
    const r = parseMestre59('Nome;Valor\r\nJoão;10');
    expect(r.colunasFaltando).toContain('codgrupofiltro');
    expect(r.linhas).toHaveLength(0);
  });

  it('recusa arquivo vazio', () => {
    expect(parseMestre59('').erros[0]).toMatch(/vazio/i);
  });

  it('descarta a linha sem DtPgto — é dela que sai o mês', () => {
    const r = parseMestre59(arquivo(linha(), linha({ DtPgto: '' })));
    expect(r.linhas).toHaveLength(1);
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toMatch(/Linha 3.*DtPgto/);
  });

  it('descarta a linha com Recebido não numérico', () => {
    const r = parseMestre59(arquivo(linha({ Recebido: 'R$ 100,00' })));
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toMatch(/Recebido/);
  });

  it('descarta a linha sem CodGrupoFiltro', () => {
    // Sem o código não há como vincular a setor nenhum. Deixá-la entrar criaria
    // dinheiro que não aparece em lugar algum.
    const r = parseMestre59(arquivo(linha({ CodGrupoFiltro: '' })));
    expect(r.descartadas).toBe(1);
    expect(r.erros[0]).toMatch(/CodGrupoFiltro/);
  });

  it('recusa arquivo com dois meses', () => {
    // Um lote é o retrato de UM mês, e promovê-lo apaga o retrato anterior
    // daquele mês. Com dois meses, promover apagaria metade do que não foi
    // substituído.
    const r = parseMestre59(arquivo(linha(), linha({ DtPgto: '2026-09-01' })));
    expect(r.mes).toBeNull();
    expect(r.erros[0]).toMatch(/2 meses/);
  });
});

describe('agruparPorGrupoFiltro', () => {
  it('agrupa pelo CÓDIGO, não pelo nome', () => {
    // O código sobrevive à troca de liderança; o nome não. Se o ERP renomear
    // `COB PLAY 1 - PAOLA` no meio do mês, as duas formas continuam sendo o
    // mesmo grupo — e o vínculo com o setor não se perde.
    const r = parseMestre59(arquivo(
      linha({ CodGrupoFiltro: '25', NomeGrupoFiltro: 'COB PLAY 1 - PAOLA', Recebido: '100.0' }),
      linha({ CodGrupoFiltro: '25', NomeGrupoFiltro: 'COB PLAY 1 - PAOLA', Recebido: '50.0' }),
      linha({ CodGrupoFiltro: '25', NomeGrupoFiltro: 'COB PLAY 1 - FULANO', Recebido: '25.0' }),
    ));
    const g = agruparPorGrupoFiltro(r.linhas);
    expect(g).toHaveLength(1);
    expect(g[0].cod_grupo_filtro).toBe('25');
    expect(g[0].linhas).toBe(3);
    expect(g[0].recebido).toBe(175);
    // Empate desfeito pela frequência, não pela última linha lida — senão o
    // rótulo da tela mudaria conforme a ordem do arquivo.
    expect(g[0].nome_grupo_filtro).toBe('COB PLAY 1 - PAOLA');
  });

  it('ordena do maior recebimento para o menor', () => {
    const r = parseMestre59(arquivo(
      linha({ CodGrupoFiltro: '1', Recebido: '10.0' }),
      linha({ CodGrupoFiltro: '2', Recebido: '900.0' }),
    ));
    expect(agruparPorGrupoFiltro(r.linhas).map(g => g.cod_grupo_filtro)).toEqual(['2', '1']);
  });

  it('lista as equipes distintas do grupo, sem contar o vazio', () => {
    // `COB MANUTENÇÃO` chega com `SubgrupoEquipe` vazio em todas as linhas.
    // Contá-lo como equipe daria um card com nome em branco na tela.
    const r = parseMestre59(arquivo(
      linha({ SubgrupoEquipe: 'EQUIPE A' }),
      linha({ SubgrupoEquipe: 'EQUIPE B' }),
      linha({ SubgrupoEquipe: 'EQUIPE A' }),
      linha({ SubgrupoEquipe: '' }),
    ));
    expect(agruparPorGrupoFiltro(r.linhas)[0].equipes).toEqual(['EQUIPE A', 'EQUIPE B']);
  });

  it('a soma dos grupos é o total do arquivo', () => {
    // É a propriedade que o arquivo real tem: os 16 rótulos de
    // `NomeGrupoFiltro` somam exatamente R$ 11.868.638,69, sem linha órfã.
    const r = parseMestre59(arquivo(
      linha({ CodGrupoFiltro: '3',  Recebido: '361.85' }),
      linha({ CodGrupoFiltro: '63', Recebido: '283.40' }),
      linha({ CodGrupoFiltro: '72', Recebido: '236.49' }),
    ));
    const soma = agruparPorGrupoFiltro(r.linhas).reduce((s, g) => s + g.recebido, 0);
    expect(Math.round(soma * 100)).toBe(Math.round(r.totalRecebido * 100));
  });
});
