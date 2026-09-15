/**
 * insertsBatem.sql.test.ts — todo INSERT tem tantos valores quanto colunas.
 *
 * ## Por que isto precisa de um teste
 *
 * `CREATE OR REPLACE FUNCTION ... LANGUAGE plpgsql` **aceita** um corpo com erro
 * de aridade. O Postgres não planeja o corpo na criação, só na execução — então
 * a migration aplica com sucesso, o objeto existe, a verificação passa, e o
 * defeito só aparece quando alguém clica no botão.
 *
 * Foi o que aconteceu em 15/09/2026: `fn_vendas_projetar` foi redigitada
 * inteira para mudar duas linhas, e saiu com
 *
 *     INSERT INTO public.vendas_eventos (12 colunas) VALUES (11 valores)
 *
 * mais um `tipo = 'importada'` que o CHECK da tabela não aceita. A tela mostrou
 * «INSERT has more target columns than expressions» depois de a pessoa mandar
 * lançar 140 linhas. Nada foi gravado — a RPC é uma transação —, mas o clique
 * se perdeu, e nenhum teste anterior podia tê-lo evitado.
 *
 * Este aqui poderia. Ele lê as migrations, acha cada `INSERT ... VALUES`, e
 * conta vírgulas no nível zero de parênteses dos dois lados.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

/** As migrations do Comercial. O resto do banco não é escopo deste arquivo. */
const ARQUIVOS = fs.readdirSync(MIGRATIONS)
  .filter(f => /vendas|venda_manual|projetar_o_insert/i.test(f))
  .sort();

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Divide uma lista em itens de topo, respeitando parênteses e literais.
 *
 * `COALESCE(a, b)` é UM valor, e `CASE WHEN x THEN y ELSE z END` também — o
 * primeiro tem parênteses, o segundo não tem nenhum. Contar vírgula crua
 * acusaria erro nos dois.
 */
function itensDeTopo(lista: string): string[] {
  const itens: string[] = [];
  let atual = '';
  let profundidade = 0;
  let emTexto = false;

  for (let i = 0; i < lista.length; i++) {
    const c = lista[i];
    if (emTexto) {
      atual += c;
      // '' dentro de literal é aspa escapada, não fim do literal.
      if (c === "'" && lista[i + 1] === "'") { atual += lista[++i]; continue; }
      if (c === "'") emTexto = false;
      continue;
    }
    if (c === "'") { emTexto = true; atual += c; continue; }
    if (c === '(') profundidade++;
    if (c === ')') profundidade--;
    if (c === ',' && profundidade === 0) { itens.push(atual.trim()); atual = ''; continue; }
    atual += c;
  }
  if (atual.trim() !== '') itens.push(atual.trim());
  return itens;
}

/** O conteúdo do parêntese que começa em `abre`, e onde ele fecha. */
function bloco(sql: string, abre: number): { corpo: string; fim: number } | null {
  if (sql[abre] !== '(') return null;
  let profundidade = 0;
  let emTexto = false;
  for (let i = abre; i < sql.length; i++) {
    const c = sql[i];
    if (emTexto) {
      if (c === "'" && sql[i + 1] === "'") { i++; continue; }
      if (c === "'") emTexto = false;
      continue;
    }
    if (c === "'") { emTexto = true; continue; }
    if (c === '(') profundidade++;
    if (c === ')') {
      profundidade--;
      if (profundidade === 0) return { corpo: sql.slice(abre + 1, i), fim: i };
    }
  }
  return null;
}

interface Achado {
  arquivo: string;
  tabela: string;
  colunas: string[];
  valores: string[];
}

function insertsDe(arquivo: string): Achado[] {
  const sql = semComentarios(fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8'));
  const achados: Achado[] = [];
  const re = /INSERT\s+INTO\s+([a-z_.]+)\s*\(/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sql)) !== null) {
    const listaColunas = bloco(sql, m.index + m[0].length - 1);
    if (!listaColunas) continue;

    // Só `VALUES` literal entra. `INSERT ... SELECT` tem outra forma e é
    // validado pelo planejador na hora, não aqui.
    const depois = sql.slice(listaColunas.fim + 1, listaColunas.fim + 40);
    const posValues = depois.search(/^\s*VALUES\s*\(/i);
    if (posValues !== 0) continue;

    const abreValores = sql.indexOf('(', listaColunas.fim + 1);
    const listaValores = bloco(sql, abreValores);
    if (!listaValores) continue;

    achados.push({
      arquivo,
      tabela: m[1],
      colunas: itensDeTopo(listaColunas.corpo),
      valores: itensDeTopo(listaValores.corpo),
    });
    re.lastIndex = listaValores.fim;
  }
  return achados;
}

const TODOS = ARQUIVOS.flatMap(insertsDe);

describe('todo INSERT das migrations de vendas tem aridade certa', () => {
  it('encontra os INSERTs — senão o teste passa vazio e não prova nada', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(5);
    expect(TODOS.length).toBeGreaterThan(8);
    expect(TODOS.map(a => a.tabela)).toContain('public.vendas_eventos');
  });

  it('colunas e valores batem em todos', () => {
    const errados = TODOS
      .filter(a => a.colunas.length !== a.valores.length)
      .map(a =>
        `${a.arquivo} → ${a.tabela}: ${a.colunas.length} colunas, ${a.valores.length} valores`
        + ` (colunas: ${a.colunas.join(', ')})`,
      );

    expect(
      errados,
      'INSERT com aridade errada. O Postgres NÃO acusa isto ao criar a função — '
      + 'plpgsql só valida o corpo na execução, então a migration aplica e o erro '
      + 'aparece no clique de quem usa:\n' + errados.join('\n'),
    ).toEqual([]);
  });

  it('nenhum valor ficou vazio — vírgula sobrando é aridade certa e valor errado', () => {
    const vazios = TODOS
      .filter(a => a.valores.some(v => v === ''))
      .map(a => `${a.arquivo} → ${a.tabela}`);
    expect(vazios).toEqual([]);
  });
});

describe('o tipo do evento existe no CHECK da tabela', () => {
  /** O CHECK vive em 20260915100000. Repetido aqui para o teste ser legível. */
  const TIPOS_VALIDOS = [
    'criada', 'editada', 'confirmada', 'assinada',
    'revertida', 'excluida', 'restaurada',
  ];

  it('`importada` não é tipo válido, e nenhuma migration usa', () => {
    const usos: string[] = [];
    for (const a of TODOS) {
      if (a.tabela !== 'public.vendas_eventos') continue;
      const iTipo = a.colunas.indexOf('tipo');
      if (iTipo < 0) continue;
      const valor = a.valores[iTipo] ?? '';
      const literal = /^'([^']*)'$/.exec(valor)?.[1];
      // Só literais são conferíveis; `CASE WHEN ... END` fica para o banco.
      if (literal && !TIPOS_VALIDOS.includes(literal)) {
        usos.push(`${a.arquivo}: tipo «${literal}»`);
      }
    }
    expect(
      usos,
      'Tipo de evento que o CHECK de vendas_eventos recusa: ' + usos.join(', '),
    ).toEqual([]);
  });
});
