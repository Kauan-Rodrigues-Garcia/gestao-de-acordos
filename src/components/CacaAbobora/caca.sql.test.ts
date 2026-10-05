/**
 * caca.sql.test.ts — as garantias da Caça à Abóbora que moram na migration.
 *
 * O que decide quem achou primeiro é o banco, e o que o impede de virar
 * bagunça são quatro coisas que um ajuste distraído apagaria sem quebrar
 * build nenhum: a trava da linha no clique, a única abóbora na tela, as peças
 * internas fechadas ao app e o tópico próprio do Broadcast.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SQL = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20261005120000_caca_abobora.sql'),
  'utf8',
).toLowerCase().replace(/\s+/g, ' ');

function corpo(funcao: string): string {
  const inicio = SQL.indexOf(`create or replace function public.${funcao}(`);
  expect(inicio, funcao).toBeGreaterThan(-1);
  return SQL.slice(inicio, SQL.indexOf('$function$;', inicio));
}

describe('migration da Caça à Abóbora', () => {
  it('o clique trava a linha: o segundo espera e encontra a abóbora já achada', () => {
    const pegar = corpo('fn_abobora_pegar');
    expect(pegar).toContain('for update');
    expect(pegar).toContain("situacao <> 'solta'");
    // O tempo é do banco, tomado na chegada do pedido.
    expect(pegar).toContain('v_agora timestamptz := clock_timestamp()');
  });

  it('nunca duas abóboras na tela', () => {
    expect(SQL).toMatch(/create unique index if not exists abobora_rodadas_uma_solta .* where situacao = 'solta'/);
  });

  it('ligar e soltar na mão são do super_admin', () => {
    expect(corpo('fn_abobora_ligar')).toContain('fn_user_is_super_admin()');
    expect(corpo('fn_abobora_soltar_agora')).toContain('fn_user_is_super_admin()');
  });

  it('o intervalo é de 30 min a 1h10, e não passa do dia', () => {
    const sortear = corpo('fn_abobora_sortear');
    expect(sortear).toContain('1800 + floor(random() * 2401)');
    expect(sortear).toContain('<> p_dia');
  });

  it('as peças internas não ficam abertas ao app', () => {
    for (const f of ['fn_abobora_tick()', 'fn_abobora_soltar(text)', 'fn_abobora_sortear(timestamptz, date)']) {
      expect(SQL).toContain(`revoke all on function public.${f} from public, anon, authenticated`);
    }
  });

  it('o aviso vai pelo tópico próprio, não pelo de permissões', () => {
    expect(corpo('fn_abobora_avisar')).toContain("'abobora:' || v_empresa::text");
    expect(SQL).toContain("split_part((select realtime.topic()), ':', 1) = 'abobora'");
  });
});
