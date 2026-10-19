/**
 * O 59 recalcula o resumo mensal ao sincronizar (migration 20261019220000).
 *
 * O card «Total recebido» sem filtro do Analítico lê `analitico_resumo_mensal`,
 * e até 19/10/2026 só a importação do 58 o recalculava: o 59 reescrevia o
 * analítico de hora em hora e o card ficava parado no número da última
 * importação.
 *
 * A função do gatilho é reescrita inteira a cada `CREATE OR REPLACE`; estes
 * testes travam o que não pode sumir numa reescrita a partir de arquivo velho.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_sync_59_atualiza_resumo_mensal.sql'));
const BRUTO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8');
const LISO = BRUTO.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');
const corpo = LISO.slice(LISO.indexOf('FUNCTION public.fn_mestre_sincronizar_analitico()'), LISO.indexOf('$function$;'));

describe('fn_mestre_sincronizar_analitico — resumo mensal', () => {
  it('a migration existe e define a função do gatilho', () => {
    expect(arquivo).toBeTruthy();
    expect(corpo.length).toBeGreaterThan(100);
  });

  it('recalcula o resumo da empresa e do mês do lote', () => {
    expect(corpo).toContain('perform public.fn_analitico_atualizar_resumo(new.empresa_id, v_mes)');
  });

  it('só depois de sincronizar algum setor', () => {
    const sairSemSetor = corpo.indexOf("'setores_sincronizados')::integer, 0) = 0 then return new;");
    const resumo = corpo.indexOf('fn_analitico_atualizar_resumo');
    expect(sairSemSetor).toBeGreaterThan(-1);
    expect(resumo).toBeGreaterThan(sairSemSetor);
  });

  it('um erro no resumo não derruba a promoção do lote', () => {
    const trecho = corpo.slice(corpo.indexOf('fn_analitico_atualizar_resumo'));
    expect(trecho.slice(0, 200)).toMatch(/exception when others then null;/);
  });

  it('continua sincronizando e registrando no log como antes', () => {
    expect(corpo).toContain('fn_mestre_sincronizar_analitico_aplicar(new.empresa_id, new.mes, v_lote)');
    expect(corpo).toContain("insert into logs_sistema");
    expect(corpo).toContain("current_setting('mestre.lote_importacao', true)");
  });

  it('mantém SECURITY DEFINER e o search_path', () => {
    expect(LISO).toMatch(/SECURITY DEFINER SET search_path TO 'public'/);
  });
});
