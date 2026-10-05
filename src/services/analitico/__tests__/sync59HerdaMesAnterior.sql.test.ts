/**
 * A virada do mês, conferida no SQL da migration.
 *
 * ## O incidente (01–02/10/2026)
 *
 * O robô subiu o 59 de outubro de hora em hora e nada dele chegou ao
 * analítico: `fn_mestre_sincronizar_analitico_aplicar` só sincroniza o setor
 * que JÁ tem linha `relatorio_59` no mês, e no dia 1º nenhum tem. O Painel
 * Diretoria (lê o 59) mostrava R$ 825 mil; o Painel Líder, o Analítico e o
 * mobile (leem o analítico) mostravam só o 58 que os líderes subiram — Play 1
 * zerado.
 *
 * A migration 20261002180000 faz o setor herdar a fonte do mês anterior.
 * Estes testes existem porque a função é reescrita inteira a cada
 * `CREATE OR REPLACE`, e a herança e a guarda do 58 recente moram no meio
 * dela: uma reescrita a partir de um arquivo velho apaga as duas sem erro.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

function migration(sufixo: string): string {
  const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith(sufixo));
  expect(arquivo, `migration *${sufixo} não encontrada`).toBeTruthy();
  return fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
}

const BRUTO = migration('_sync_59_herda_setor_do_mes_anterior.sql');
const LISO = BRUTO.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

function corpoDe(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  const fim = LISO.indexOf('$function$;', i);
  return LISO.slice(i, fim === -1 ? undefined : fim);
}

describe('fn_mestre_sincronizar_analitico_aplicar — herança do mês anterior', () => {
  const corpo = corpoDe('fn_mestre_sincronizar_analitico_aplicar');
  const alvo = corpo.slice(corpo.indexOf('create temp table _sync_alvo'),
                           corpo.indexOf('drop table if exists _sync_59'));

  it('o alvo inclui o setor que foi do 59 no mês anterior', () => {
    expect(alvo).toContain("a.mes_referencia = (p_mes - interval '1 month')::date");
    expect(alvo).toContain('union');
  });

  it('continua incluindo o setor que já é do 59 neste mês', () => {
    expect(alvo).toContain('a.mes_referencia = p_mes');
  });

  /*
   * Devolver ao 58 marca `restaurado_em`. Sem esta trava, o robô retomaria o
   * setor na hora seguinte e o desfazer viraria efêmero.
   */
  it('não retoma setor devolvido ao 58 no mês corrente', () => {
    expect(alvo).toContain('r.restaurado_em is not null');
    expect(alvo).toContain('r.mes_referencia = p_mes');
  });

  it('mantém a guarda do 58 de hoje e de ontem (20260928200000)', () => {
    expect(corpo).toContain('a.data_pagamento >= v_hoje - 1');
  });
});

describe('fn_analitico_fonte_do_setor — mesma regra', () => {
  const corpo = corpoDe('fn_analitico_fonte_do_setor');

  it('olha o mês anterior e respeita a devolução', () => {
    expect(corpo).toContain("- interval '1 month'");
    expect(corpo).toContain('restaurado_em is not null');
  });

  it('não lê sem trava de acesso', () => {
    expect(corpo).toContain('fn_can_access_empresa');
  });
});
