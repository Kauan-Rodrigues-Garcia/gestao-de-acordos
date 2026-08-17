/**
 * migrations-armadilhas-plpgsql.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * As migrations deste projeto são aplicadas à MÃO no SQL Editor — o MCP do
 * Supabase é somente leitura e não executa DDL. Isso significa que erro de
 * sintaxe não aparece aqui: aparece na tela de quem está aplicando, depois de a
 * transação inteira reverter.
 *
 * Aconteceu duas vezes em 17/08/2026:
 *
 *   ERROR: 42601: syntax error at or near "||"
 *   ERROR: P0001: ainda existe funcao referenciando logs_whatsapp
 *
 * A segunda era lógica (uma verificação que confundia comentário com
 * referência) e está trancada em `logs-contexto-de-rede.test.ts`. A primeira era
 * de SINTAXE, e é a que este arquivo pega: o formato de `RAISE` tem de ser um
 * literal, e `RAISE NOTICE 'a' || 'b', x` é erro de parse — derruba o script
 * antes de a primeira linha rodar.
 *
 * Nenhum destes testes substitui aplicar a migration. Eles cobrem as
 * armadilhas que dão erro de parse e que uma varredura de texto consegue ver —
 * as duas mais baratas de cometer e as mais caras de descobrir.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();

/**
 * O SQL sem comentários e com os literais esvaziados.
 *
 * Esvaziar os literais é o que permite olhar a ESTRUTURA: sem isso, uma vírgula
 * ou um `||` dentro de uma mensagem de texto contaria como sintaxe. É a mesma
 * lição do guarda de `console.log` — separar código de dado antes de julgar.
 */
function esqueleto(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // comentário de bloco
    .replace(/--[^\n]*/g, ' ')              // comentário de linha
    .replace(/'(?:[^']|'')*'/g, "''");      // literais, com '' escapado
}

describe('o formato de RAISE é sempre um literal', () => {
  /**
   * `RAISE NOTICE 'a' || 'b', x` não compila. Quem quer mensagem em várias
   * linhas tem duas saídas legítimas, e as duas passam neste teste:
   *
   *   • literais adjacentes separados por quebra de linha, que o próprio SQL
   *     concatena no parse: `RAISE NOTICE 'a '\n'b', x`;
   *   • montar em variável com `format()` e usar `RAISE NOTICE '%', v_msg`.
   */
  it.each(ARQUIVOS)('%s', (arquivo) => {
    const skel = esqueleto(fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8'));
    const ofensores: string[] = [];

    // Cada RAISE até o `;` que o encerra.
    for (const m of skel.matchAll(/\braise\s+(notice|exception|warning|info|log|debug)\b([^;]*)/gi)) {
      const corpo = m[2];

      // O formato vai do início até a PRIMEIRA vírgula de nível superior. Depois
      // dela vêm os argumentos, onde `||` é perfeitamente legal.
      const virgula = corpo.indexOf(',');
      const formato = virgula === -1 ? corpo : corpo.slice(0, virgula);

      if (formato.includes('||')) {
        const linha = skel.slice(0, m.index).split('\n').length;
        ofensores.push(`linha ~${linha}: raise ${m[1]} com formato concatenado`);
      }
    }

    expect(
      ofensores,
      `O formato de RAISE tem de ser um literal — '||' ali é erro de parse (42601) `
      + `e derruba a migration inteira.\nUse literais adjacentes em linhas separadas, `
      + `ou monte com format() numa variável e faça RAISE ... '%', v_msg.\n`
      + ofensores.join('\n'),
    ).toEqual([]);
  });
});

describe('as marcas de dollar-quoting fecham', () => {
  /**
   * Um `$$` sobrando ou faltando também é erro de parse, e é fácil de produzir
   * editando o meio de uma função longa. Contar é barato.
   *
   * Marcas nomeadas (`$function$`, `$body$`) contam separadamente das anônimas.
   */
  it.each(ARQUIVOS)('%s', (arquivo) => {
    // Comentários saem: o texto explicativo cita `$$` ao falar de plpgsql.
    const sql = fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ');

    const contagem = new Map<string, number>();
    for (const m of sql.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)?\$/g)) {
      const marca = m[0];
      contagem.set(marca, (contagem.get(marca) ?? 0) + 1);
    }

    const impares = [...contagem.entries()]
      .filter(([, n]) => n % 2 !== 0)
      .map(([marca, n]) => `${marca} aparece ${n}x`);

    expect(
      impares,
      `Marca de dollar-quoting sem par — erro de parse.\n${impares.join('\n')}`,
    ).toEqual([]);
  });
});

describe('toda variável usada num bloco DO está declarada', () => {
  /**
   * `v_aviso := ...` sem `v_aviso text;` no `declare` é erro de compilação do
   * plpgsql, e foi exatamente o remendo que acompanhou a correção do RAISE —
   * trocar a concatenação por uma variável exige declarar a variável.
   *
   * A checagem é deliberadamente conservadora: só olha atribuições `:=` a nomes
   * no padrão `v_*` dentro de blocos `DO`, que é a convenção usada em todas as
   * migrations deste projeto. Nome fora do padrão passa batido, e isso é
   * preferível a acusar `NEW.campo := ...` num gatilho.
   */
  it.each(ARQUIVOS)('%s', (arquivo) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/--[^\n]*/g, ' ');

    const faltando: string[] = [];

    for (const bloco of sql.matchAll(/\bdo\s+\$\$([\s\S]*?)\$\$\s*;/gi)) {
      const corpo = bloco[1];
      const declare = /\bdeclare\b([\s\S]*?)\bbegin\b/i.exec(corpo);
      const declaradas = new Set(
        [...(declare?.[1] ?? '').matchAll(/\b(v_[a-z0-9_]+)\b/gi)].map(m => m[1].toLowerCase()),
      );

      const depoisDoBegin = corpo.slice(corpo.toLowerCase().indexOf('begin'));
      for (const uso of depoisDoBegin.matchAll(/\b(v_[a-z0-9_]+)\s*:=/gi)) {
        const nome = uso[1].toLowerCase();
        if (!declaradas.has(nome)) faltando.push(nome);
      }
      // `select ... into v_x` também exige declaração.
      for (const uso of depoisDoBegin.matchAll(/\binto\s+((?:v_[a-z0-9_]+\s*,?\s*)+)/gi)) {
        for (const m of uso[1].matchAll(/\b(v_[a-z0-9_]+)\b/gi)) {
          const nome = m[1].toLowerCase();
          if (!declaradas.has(nome)) faltando.push(nome);
        }
      }
    }

    expect(
      [...new Set(faltando)],
      `Variável usada e não declarada no bloco DO: ${[...new Set(faltando)].join(', ')}`,
    ).toEqual([]);
  });
});
