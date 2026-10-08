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

const SQL_ZUMBIS = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/20261007200000_caca_zumbis.sql'),
  'utf8',
).toLowerCase().replace(/\s+/g, ' ');

function corpoZumbis(funcao: string): string {
  const inicio = SQL_ZUMBIS.indexOf(`create or replace function public.${funcao}(`);
  expect(inicio, funcao).toBeGreaterThan(-1);
  return SQL_ZUMBIS.slice(inicio, SQL_ZUMBIS.indexOf('$function$;', inicio));
}

describe('migration da Caça aos Zumbis', () => {
  it('o tiro continua travando a linha e medindo o tempo no banco', () => {
    const pegar = corpoZumbis('fn_abobora_pegar');
    expect(pegar).toContain('for update');
    expect(pegar).toContain("situacao <> 'solta'");
    expect(pegar).toContain('v_agora timestamptz := clock_timestamp()');
  });

  it('a assinatura antiga sai antes da nova entrar (o PostgREST não pode ter duas)', () => {
    const drop = SQL_ZUMBIS.indexOf('drop function if exists public.fn_abobora_pegar(bigint);');
    const cria = SQL_ZUMBIS.indexOf('create or replace function public.fn_abobora_pegar(p_rodada bigint, p_headshot boolean default false)');
    expect(drop).toBeGreaterThan(-1);
    expect(cria).toBeGreaterThan(drop);
  });

  it('o headshot mais rápido só compara com outros headshots do dia', () => {
    const pegar = corpoZumbis('fn_abobora_pegar');
    expect(pegar).toContain("r.situacao = 'achada' and r.headshot and r.id <> v_rodada.id and r.ms <= v_ms");
    expect(pegar).toMatch(/v_hs := v_headshot and exists/);
  });

  it('o zumbi é sorteado entre os que ainda não saíram no dia', () => {
    const soltar = corpoZumbis('fn_abobora_soltar');
    expect(soltar).toContain('r.dia = v_hoje and r.zumbi is not null');
  });

  it('o tiro é de quem está logado; soltar continua fechado ao app', () => {
    expect(SQL_ZUMBIS).toContain('revoke all on function public.fn_abobora_pegar(bigint, boolean) from public, anon');
    expect(SQL_ZUMBIS).toContain('grant execute on function public.fn_abobora_pegar(bigint, boolean) to authenticated');
    expect(SQL_ZUMBIS).toContain('revoke all on function public.fn_abobora_soltar(text) from public, anon, authenticated');
  });
});
