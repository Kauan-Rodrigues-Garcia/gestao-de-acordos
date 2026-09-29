// @vitest-environment node
/**
 * usoAdocaoAbas.sql.test.ts — a migration 20260929170518 num Postgres de
 * verdade (PGlite).
 *
 * Com as abas no identificador (29/09/2026), ninguém mais grava `analitico`
 * puro. A adoção por igualdade responderia «ninguém abriu o Analítico» com
 * todo mundo usando. O que se prova aqui: a tela conta junto com as abas de
 * dentro dela, e só com elas.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260929170518_uso_adocao_inclui_abas.sql'),
  'utf8',
);

const E  = '00000000-0000-4000-8000-00000000e001';
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';
const P3 = '00000000-0000-4000-8000-000000000003';

let db: PGlite;

interface Linha { usuario_id: string; aberturas: string | number; segundos: string | number }

/** Segundos por pessoa na adoção desta tela. */
async function adocao(tela: string): Promise<Record<string, number>> {
  const r = await db.query<Linha>(
    `select usuario_id, aberturas, segundos
       from public.fn_uso_adocao_tela($1, '2026-09-01', '2026-09-30', null, $2)`,
    [E, tela],
  );
  return Object.fromEntries(r.rows.map(l => [l.usuario_id, Number(l.segundos)]));
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.empresas (id uuid primary key, nome text);
    create table public.setores  (id uuid primary key, nome text);
    create table public.equipes  (id uuid primary key, nome text);
    create table public.perfis (
      id uuid primary key, empresa_id uuid, perfil text, nome text, usuario text,
      setor_id uuid, equipe_id uuid, ativo boolean default true, arquivado boolean default false);
    create table public.uso_telas (
      empresa_id uuid, usuario_id uuid, dia date, tela text,
      aberturas integer, segundos integer, ultimo_em timestamptz default now(),
      primary key (empresa_id, usuario_id, dia, tela));

    insert into public.empresas values ('${E}', 'BookPlay');
    insert into public.perfis (id, empresa_id, perfil, nome) values
      ('${P1}', '${E}', 'operador', 'Ana'),
      ('${P2}', '${E}', 'lider',    'Bia'),
      ('${P3}', '${E}', 'operador', 'Caio');

    insert into public.uso_telas (empresa_id, usuario_id, dia, tela, aberturas, segundos) values
      -- Ana: só abas do Analítico, em dois níveis
      ('${E}', '${P1}', '2026-09-10', 'analitico:analitico/mes/ranking', 2, 100),
      ('${E}', '${P1}', '2026-09-11', 'analitico:colchao',               1,  50),
      -- Bia: o Analítico puro (histórico de antes das abas) e uma aba do Líder
      ('${E}', '${P2}', '2026-09-10', 'analitico',                       1,  30),
      ('${E}', '${P2}', '2026-09-10', 'lider:desempenho/equipe',         1,  40),
      -- Caio: telas de NOME parecido, que não são aba do Analítico
      ('${E}', '${P3}', '2026-09-10', 'analiticox',                      1,  70),
      ('${E}', '${P3}', '2026-09-10', 'acordos/novo',                    1,  20),
      ('${E}', '${P3}', '2026-09-10', 'acordos:nao_pagos',               1,  15),
      -- fora do período: não conta
      ('${E}', '${P3}', '2026-08-31', 'analitico:colchao',               1, 999);
  `);
  await db.exec(MIGRATION);
});

afterAll(async () => { await db?.close(); });

describe('a tela conta junto com as abas de dentro', () => {
  it('Analítico soma as abas de todos os níveis e o nome puro antigo', async () => {
    const a = await adocao('analitico');
    expect(a[P1]).toBe(150);
    expect(a[P2]).toBe(30);
  });

  it('tela de nome parecido não é aba', async () => {
    expect((await adocao('analitico'))[P3]).toBe(0);
  });

  it('quem não abriu continua na lista, com zero — é a lista acionável', async () => {
    const a = await adocao('analitico');
    expect(Object.keys(a).sort()).toEqual([P1, P2, P3].sort());
  });

  it('uma aba conta junto com as abas de dentro DELA, e não com as vizinhas', async () => {
    expect((await adocao('lider:desempenho'))[P2]).toBe(40);
    expect((await adocao('lider:des'))[P2]).toBe(0);
    expect((await adocao('lider:quartis'))[P2]).toBe(0);
  });

  it('rota filha não conta como uso da rota mãe', async () => {
    // `acordos/novo` tem rota própria; `acordos:nao_pagos` é aba de Acordos.
    expect((await adocao('acordos'))[P3]).toBe(15);
  });

  /** `_` é curinga no LIKE: `acordos:nao_pagos/%` casaria `acordos:naoXpagos/…`. */
  it('sublinhado no nome é letra, não curinga', async () => {
    await db.exec(`insert into public.uso_telas (empresa_id, usuario_id, dia, tela, aberturas, segundos)
                   values ('${E}', '${P1}', '2026-09-12', 'acordos:naoXpagos/sub', 1, 5)`);
    expect((await adocao('acordos:nao_pagos'))[P1]).toBe(0);
    expect((await adocao('acordos:nao_pagos'))[P3]).toBe(15);
  });

  it('o período continua valendo', async () => {
    expect((await adocao('analitico:colchao'))[P3]).toBe(0);
  });
});
