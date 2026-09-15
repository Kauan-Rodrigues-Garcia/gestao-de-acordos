/**
 * permissoes-catalogo.sql.test.ts
 *
 * O catálogo existe duas vezes: em TypeScript (`permissoes-catalogo.ts`, que o
 * app consulta) e em SQL (`fn_permissoes_catalogo()`, que semeia empresa nova).
 * Duas listas para a mesma verdade é precisamente o arranjo que produziu o
 * defeito de 2026-08-15, quando a tela mostrava 26 chaves, o banco tinha 29 e o
 * código consultava 24.
 *
 * A duplicata é inevitável — o banco não importa TypeScript, e a semeadura roda
 * numa trigger de `empresas`. O que dá para evitar é a divergência passar
 * despercebida: este teste lê o SQL da migration e compara chave a chave.
 *
 * Se um dia uma migration nova redefinir `fn_permissoes_catalogo()`, o teste
 * passa a ler essa, porque procura a definição mais recente.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PERMISSOES, CARGOS_CONFIGURAVEIS, exigeConcessaoExplicita } from './permissoes-catalogo';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

/** A definição mais recente da função, pelo nome ordenável do arquivo. */
function arquivosDoCatalogo(): string[] {
  return fs.readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.fn_permissoes_catalogo/i
      .test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')));
}

/** Os atalhos declarados no CTE `atalhos` da função. */
const ATALHOS: Record<string, string[]> = {
  lideranca: ['lider', 'elite', 'gerencia', 'diretoria'],
  todos: ['operador', 'ouvidoria', 'lider', 'elite', 'gerencia', 'diretoria'],
  cupula: ['gerencia', 'diretoria'],
  ninguem: [],
};

function listaDeArray(texto: string): string[] {
  if (texto in ATALHOS) return ATALHOS[texto];
  if (/^NULL/i.test(texto)) return [];
  return [...texto.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
}

interface LinhaSql { chave: string; tenants: string[] | null; padrao: string[]; explicita: boolean }

function catalogoSql(): LinhaSql[] {
  const arquivos = arquivosDoCatalogo();
  const definicoes = arquivos.map(arquivo => ({
    arquivo,
    sql: fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8'),
  }));
  const baseIndex = definicoes.findLastIndex(d => d.sql.includes('LATERAL (VALUES'));
  if (baseIndex < 0) throw new Error('Nenhuma migration traz o catálogo base completo.');

  const base = definicoes[baseIndex].sql;
  const corpos = [base.slice(base.indexOf('LATERAL (VALUES'), base.indexOf('AS t(chave'))];
  /**
   * Chaves aposentadas.
   *
   * O catálogo SQL é construído por ACUMULAÇÃO: cada migration soma um `VALUES`
   * ao resultado da anterior. Sem uma forma declarada de remover, aposentar uma
   * permissão deixaria este teste acusando divergência para sempre — e a saída
   * fácil seria manter a chave morta dos dois lados.
   *
   * A convenção é um comentário `-- REMOVE_PERMISSOES: chave, outra` na
   * migration que faz a remoção de verdade no banco.
   */
  const removidas = new Set<string>();
  for (const { sql } of definicoes.slice(baseIndex + 1)) {
    /*
     * TODOS os blocos do arquivo, e não só o primeiro.
     *
     * Acrescentar uma chave à cadeia é congelar o catálogo atual numa função
     * `_antes_` e redefinir a de cima unindo o que entrou — então a migration
     * tem DOIS `VALUES`: o retrato do que já existia e a chave nova, nessa
     * ordem.
     *
     * Ler só o primeiro fazia o teste enxergar o retrato e perder exatamente o
     * que a migration acrescentou. Foi assim que `mestre_importar_automatico`
     * apareceu como «no TypeScript e não no SQL» estando nos dois.
     */
    for (const m of sql.matchAll(/SELECT \* FROM \(VALUES[\s\S]*?AS novas\(chave/g)) {
      corpos.push(m[0]);
    }

    for (const m of sql.matchAll(/--\s*REMOVE_PERMISSOES:\s*(.+)/g)) {
      for (const chave of m[1].split(',')) removidas.add(chave.trim());
    }
  }

  const linha = /\(\s*'([a-z_]+)',\s*(NULL::TEXT\[\]|ARRAY\[[^\]]*\](?:\s*::TEXT\[\])?),\s*(lideranca|todos|cupula|ninguem|ARRAY\[[^\]]*\](?:\s*::TEXT\[\])?),\s*(true|false)\s*\)/g;

  const linhas = [...corpos.join('\n').matchAll(linha)]
    .map(m => ({
      chave: m[1],
      tenants: /^NULL/i.test(m[2]) ? null : listaDeArray(m[2]),
      padrao: listaDeArray(m[3]),
      explicita: m[4] === 'true',
    }));

  /**
   * A ÚLTIMA definição de cada chave vence.
   *
   * Uma migration pode REDEFINIR uma chave que continua existindo — mudar o
   * padrão sem aposentá-la. Foi o que 20260911120000 fez com as chaves do Núcleo
   * e do chat, para o cargo `assistente_adm`: o SQL tira a versão velha com
   * `NOT IN` e soma a nova. Os corpos já estão em ordem de migration, então a
   * última ocorrência é a que o banco devolve.
   */
  const porChave = new Map<string, LinhaSql>();
  for (const l of linhas) porChave.set(l.chave, l);

  return [...porChave.values()].filter(l => !removidas.has(l.chave));
}

const SQL = catalogoSql();

describe('contrato: catálogo TypeScript ↔ catálogo SQL', () => {
  it('a migration foi lida — o parser não devolveu lista vazia', () => {
    // Um regex que deixou de casar transformaria todos os testes abaixo em
    // «nenhuma divergência encontrada», que é a pior forma de passar.
    expect(SQL.length).toBeGreaterThan(30);
  });

  it('as duas listas têm exatamente as mesmas chaves', () => {
    const noTs = new Set(PERMISSOES.map(p => p.key));
    const noSql = new Set(SQL.map(l => l.chave));

    expect([...noTs].filter(k => !noSql.has(k)), 'no TypeScript e não no SQL').toEqual([]);
    expect([...noSql].filter(k => !noTs.has(k)), 'no SQL e não no TypeScript').toEqual([]);
  });

  /**
   * O SQL tem UM eixo de recorte; o TypeScript tem dois.
   *
   * No banco existe só `tenants`, comparado com `empresas.slug` na semeadura
   * (`emp.slug = ANY(cat.tenants)`). No app existem dois: `tenants` separa
   * BookPlay de PaguePlay — as duas empresas DA cobrança — e `produtos`, acima
   * dele, separa cobrança de Comercial e de RH.
   *
   * Enquanto `produtos` só AMPLIAVA (a lista `TODA_OPERACAO`, para as chaves
   * genéricas), os dois lados coincidiam campo a campo e bastava compará-los.
   * A aba Vendas (15/09/2026) trouxe o primeiro `produtos` que ESTREITA para
   * fora da cobrança, e aí a tradução passou a importar: no TypeScript a chave
   * diz `produtos: ['comercial']`, e a única forma de o SQL dizer a mesma coisa
   * é `tenants = {comercial}` — porque, para um produto que tem uma empresa só,
   * o slug e o produto são a mesma palavra.
   *
   * O que continua NÃO sendo comparado aqui é a chave de cobrança comum, que no
   * SQL é `NULL` (semeada em toda empresa) e no app aparece só nas duas de
   * cobrança. Essa diferença é deliberada e antiga: semear a mais é barato, e
   * `produtos` é o filtro de TELA. Estreitar o SQL também seria possível, mas é
   * outra decisão — e mudá-la por dentro deste teste a esconderia.
   */
  it('o recorte por operação é o mesmo dos dois lados', () => {
    /** Produtos com empresa própria: o slug é a própria palavra do produto. */
    const SLUG_DO_PRODUTO: Record<string, string> = { comercial: 'comercial', rh: 'rh' };

    let traduzidas = 0;
    for (const l of SQL) {
      const ts = PERMISSOES.find(p => p.key === l.chave)!;
      const foraDaCobranca = ts.produtos && !ts.produtos.includes('cobranca');

      const esperado = foraDaCobranca
        ? ts.produtos!.map(p => SLUG_DO_PRODUTO[p]).filter(Boolean).sort()
        : [...(ts.tenants ?? [])].sort();

      if (foraDaCobranca) traduzidas += 1;

      expect([...(l.tenants ?? [])].sort(), `tenants divergem em ${l.chave}`)
        .toEqual(esperado);
    }

    // A tradução só vale se estiver exercitada: sem nenhuma chave fora da
    // cobrança, o ramo acima nunca roda e o teste volta a ser o antigo sem
    // ninguém perceber.
    expect(traduzidas, 'nenhuma chave fora da cobrança — a tradução não foi exercitada')
      .toBeGreaterThan(0);
  });

  /**
   * O que este teste protege: uma empresa nova nasce com os padrões do SQL, e o
   * app julga o que ela pode com os padrões do TypeScript. Divergindo, o
   * primeiro administrador da empresa nova encontraria toggles ligados que não
   * funcionam — o defeito original, de novo, só que em empresa nova.
   */
  it('os padrões por cargo são os mesmos dos dois lados', () => {
    const divergentes: string[] = [];

    for (const l of SQL) {
      const ts = PERMISSOES.find(p => p.key === l.chave)!;
      for (const cargo of CARGOS_CONFIGURAVEIS) {
        const noSql = l.padrao.includes(cargo);
        const noTs = ts.padrao[cargo] === true;
        if (noSql !== noTs) {
          divergentes.push(`${l.chave}/${cargo}: SQL=${noSql} TS=${noTs}`);
        }
      }
    }

    expect(divergentes, 'Padrões divergentes:\n  ' + divergentes.join('\n  ')).toEqual([]);
  });

  it('as chaves de concessão explícita são as mesmas dos dois lados', () => {
    for (const l of SQL) {
      expect(l.explicita, `${l.chave}: marcação de explícita divergente`)
        .toBe(exigeConcessaoExplicita(l.chave));
    }
  });

  it('o SQL não cita cargo que não é configurável', () => {
    for (const l of SQL) {
      for (const cargo of l.padrao) {
        expect(CARGOS_CONFIGURAVEIS as readonly string[], `${l.chave} cita ${cargo}`)
          .toContain(cargo);
      }
    }
  });
});
