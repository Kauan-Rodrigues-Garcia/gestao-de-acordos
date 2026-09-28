/**
 * Migration 20260929020000: o card de mudanças só com transferência e remoção,
 * e só para o que estava há mais de 24 horas com a pessoa.
 *
 * «Se eu subo o 58, que está mais atualizado que o 59, e o 59 sobe depois e
 * remove alguns valores, não vai aparecer — até porque vai floodar. Os acordos
 * que já estão há mais de 24 horas, se sumirem, aí beleza.»
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS)
  .find(f => f.endsWith('_analitico_mudancas_so_transferencia_e_remocao_24h.sql'));
const BRUTO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
const LISO = BRUTO.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('24 horas de presença', () => {
  it('a linha precisa ter chegado 24 h antes de sair', () => {
    expect(LISO).toContain(
      "NULLIF(r.conteudo->>'importado_em', '')::TIMESTAMPTZ <= r.removido_em - INTERVAL '24 hours'",
    );
  });

  it('o corte vem ANTES do ranking do retrato mais recente', () => {
    /*
     * Se o 59 mexeu no valor da linha duas horas antes de transferi-la, o
     * retrato dessas duas horas não prova o dia, mas o anterior prova. Cortar
     * depois do ROW_NUMBER jogaria fora justamente o retrato que prova.
     */
    const corte   = LISO.indexOf("INTERVAL '24 hours'");
    const ranking = LISO.indexOf('ROW_NUMBER()');
    expect(corte).toBeGreaterThan(-1);
    expect(ranking).toBeGreaterThan(-1);
    expect(corte).toBeLessThan(ranking);
    // E dentro do CTE `antes`, não num WHERE posterior.
    const antes = LISO.slice(LISO.indexOf('WITH antes AS ('), LISO.indexOf('depois AS ('));
    expect(antes).toContain("INTERVAL '24 hours'");
  });

  it('snapshot sem hora de chegada não passa (não dá para provar o dia)', () => {
    // `NULL <= x` é NULL, e o WHERE descarta: é o comportamento desejado.
    expect(LISO).toContain("NULLIF(r.conteudo->>'importado_em', '')::TIMESTAMPTZ <=");
  });
});

describe('valor alterado saiu', () => {
  it('só sumiu ou trocou de dono', () => {
    expect(LISO).toMatch(/AND \(p\.val_depois IS NULL OR p\.op_depois IS DISTINCT FROM p\.op_antes\)/);
  });

  it('nenhuma comparação de valor no filtro', () => {
    expect(LISO).not.toMatch(/ROUND\(p\.val_depois, 2\) <> ROUND\(p\.val_antes, 2\)/);
  });
});

describe('o que já valia continua', () => {
  it('o 58 é prévia e fica fora', () => {
    expect(LISO).toContain("COALESCE(r.conteudo->>'procedencia', '') <> 'relatorio_58'");
  });

  it('chave NR + data + forma', () => {
    expect(LISO).toContain('GROUP BY ar.codigo, ar.data_pagamento, ar.forma_pagamento');
    expect(LISO).toContain('AND d.forma IS NOT DISTINCT FROM a.forma');
  });

  it('o escopo não mudou: equipes de alcance, setor, só as próprias', () => {
    expect(LISO).toContain('public.fn_equipes_de_alcance(auth.uid())');
    expect(LISO).toContain("public.fn_user_escopo('analitico')");
    expect(LISO).toMatch(/ELSIF v_escopo < 2 THEN v_ops := ARRAY\[auth\.uid\(\)\]/);
    expect(LISO).toContain('SECURITY DEFINER');
  });

  it('anon fora', () => {
    expect(BRUTO).toMatch(/REVOKE ALL ON FUNCTION public\.fn_analitico_mudancas_do_mes[^;]*FROM PUBLIC, anon/);
  });

  it('só leitura, transação, sem DROP', () => {
    expect(LISO).not.toMatch(/\b(insert into|update public|delete from)\b/i);
    expect(BRUTO).toMatch(/^begin;/m);
    expect(BRUTO).toMatch(/^commit;/m);
    expect(BRUTO).not.toMatch(/\bdrop (table|function)\b/i);
  });
});
