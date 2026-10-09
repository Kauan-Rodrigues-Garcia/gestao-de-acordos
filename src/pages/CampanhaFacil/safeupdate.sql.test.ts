/**
 * safeupdate do Supabase: pela API (PostgREST), DELETE/UPDATE sem WHERE é
 * recusado — mesmo dentro de função e mesmo em tabela temporária. O Postgres
 * local não tem o safeupdate, então o erro só aparece em produção.
 *
 * Quebrou duas vezes: a rodada das metas (20260930200115) e o «Salvar» da
 * campanha desativada (20261009120000, «DELETE requires a WHERE clause»).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();

function liso(f: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
    .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
}

/** Os DELETE/UPDATE do arquivo que não têm WHERE antes do `;`. */
function semWhere(sql: string): string[] {
  const achados: string[] = [];
  for (const m of sql.matchAll(/\bDELETE FROM [^;]*;/gi)) {
    if (!/\bWHERE\b/i.test(m[0])) achados.push(m[0].slice(0, 80));
  }
  // `DO UPDATE SET` (ON CONFLICT) não passa pelo safeupdate.
  for (const m of sql.matchAll(/(?<!\bDO )\bUPDATE [\w.]+(?: (?!SET\b)\w+)? SET\b[^;]*;/gi)) {
    if (!/\bWHERE\b/i.test(m[0])) achados.push(m[0].slice(0, 80));
  }
  return achados;
}

describe('safeupdate: DELETE/UPDATE sem WHERE', () => {
  it('a regra pega o caso que quebrou e deixa passar o que é válido', () => {
    expect(semWhere('BEGIN DELETE FROM pg_temp.cf_atrib; INSERT INTO x VALUES (1);')).toHaveLength(1);
    expect(semWhere('DELETE FROM pg_temp.cf_atrib WHERE TRUE;')).toHaveLength(0);
    expect(semWhere('UPDATE public.t SET a = 1;')).toHaveLength(1);
    expect(semWhere('UPDATE public.t e SET a = 1 WHERE e.id = 2;')).toHaveLength(0);
    expect(semWhere('INSERT INTO t VALUES (1) ON CONFLICT (id) DO UPDATE SET a = 1;')).toHaveLength(0);
  });

  it('a função viva de editar campanha não tem DELETE/UPDATE sem WHERE', () => {
    const ultima = ARQUIVOS.filter(f => /FUNCTION public\.fn_campanha_facil_lote_editar\(/.test(liso(f))).at(-1);
    expect(ultima).toBeDefined();
    expect(semWhere(liso(ultima as string))).toEqual([]);
  });

  it('nenhuma migration nova (de 20261009120000 em diante) deixa DELETE/UPDATE sem WHERE', () => {
    for (const f of ARQUIVOS.filter(a => a.slice(0, 14) >= '20261009120000')) {
      expect(semWhere(liso(f)).map(s => `${f}: ${s}`)).toEqual([]);
    }
  });
});
