/**
 * O 994 dono da Retenção, conferido no SQL da migration 20261028150000.
 *
 * A sincronização do 59 e a RPC do dashboard são reescritas inteiras a cada
 * `CREATE OR REPLACE`. Uma reescrita a partir da versão anterior devolveria o
 * 59 para cima da Retenção (o R$ 160 dobrado e os R$ 16 mil contra R$ 30 mil de
 * out/2026) ou o extra para o total da empresa duas vezes, sem erro nenhum.
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

const LISO = migration('_analitico_994_dono_da_retencao.sql')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

function corpoDe(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  const fim = LISO.indexOf('$function$;', i);
  return LISO.slice(i, fim === -1 ? undefined : fim);
}

const DONO = 'not exists ( select 1 from _sync_dono994 d where d.setor_id = ';

describe('fn_mestre_sincronizar_analitico_aplicar — o 59 não mexe no dono do 994', () => {
  const corpo = corpoDe('fn_mestre_sincronizar_analitico_aplicar');

  it('o dono é quem tem linha do 994 no setor/mês', () => {
    expect(corpo).toContain('create temp table _sync_dono994');
    expect(corpo).toMatch(/_sync_dono994 on commit drop as select distinct a\.setor_id, lower\(a\.operador_usuario\)[^;]*a\.procedencia = 'relatorio_994'/);
  });

  it('a projeção, o apagar e as duas atualizações pulam o dono', () => {
    // projeção do 59, passo 1 (delete), passo 2 (mudou), passo 4 (contribuição que mudou)
    expect(corpo.split(DONO).length - 1).toBe(4);
  });

  it('o upsert do 59 e o da contribuição não tomam linha do 994', () => {
    expect(corpo.split("where analitico_recebimentos.procedencia <> 'relatorio_994'").length - 1).toBe(2);
  });

  it('recalcula o espelho ao fim', () => {
    expect(corpo).toContain('perform public.fn_analitico_994_marcar_espelhos(p_empresa_id, p_mes)');
  });
});

describe('fn_analitico_994_substituir — o mês da pessoa vira o arquivo', () => {
  const corpo = corpoDe('fn_analitico_994_substituir');

  it('exige a permissão do botão (ou super admin)', () => {
    expect(corpo).toContain("public.fn_user_tem('importar_analitico_retencao')");
    expect(corpo).toContain('public.fn_user_is_super_admin()');
  });

  it('nunca toca correção manual', () => {
    expect(corpo.split("a.procedencia is distinct from 'manual'").length - 1).toBe(3);
  });

  it('o que sai e o que muda ficam guardados em analitico_removidos', () => {
    expect(corpo.split('insert into analitico_removidos').length - 1).toBe(2);
  });

  it('arquivo vazio não apaga ninguém', () => {
    expect(corpo).toContain('if cardinality(v_ops) = 0 then return');
  });

  it('marca o espelho depois de gravar', () => {
    expect(corpo).toContain('v_espelhos := public.fn_analitico_994_marcar_espelhos(p_empresa_id, v_mes)');
  });
});

describe('fn_analitico_994_marcar_espelhos — o par do extra', () => {
  const corpo = corpoDe('fn_analitico_994_marcar_espelhos');

  it('é o mesmo NR e dia, pelo 59, em outro setor e com outra pessoa', () => {
    expect(corpo).toContain("r.procedencia = 'relatorio_994' and exists");
    expect(corpo).toContain('o.codigo = r.codigo and o.data_pagamento = r.data_pagamento');
    expect(corpo).toContain("o.procedencia = 'relatorio_59'");
    expect(corpo).toContain('o.setor_id is distinct from r.setor_id');
    expect(corpo).toContain('lower(o.operador_usuario) <> lower(r.operador_usuario)');
  });

  it('também desmarca o que deixou de ser espelho', () => {
    expect(corpo).toContain("(r.procedencia = 'relatorio_994' or r.espelho_extra)");
  });
});

describe('fn_analitico_dashboard_mes_json — o espelho chega à tela', () => {
  const corpo = corpoDe('fn_analitico_dashboard_mes_json');

  it('vem no select e no group by', () => {
    expect(corpo).toContain('ar.contribuicao_de_setor_id, ar.espelho_extra, sum(ar.valor_recebido)');
    expect(corpo).toContain("(ar.procedencia = 'contribuicao_59'), ar.contribuicao_de_setor_id, ar.espelho_extra ) t");
  });
});
