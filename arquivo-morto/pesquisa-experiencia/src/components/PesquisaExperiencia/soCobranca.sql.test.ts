/**
 * Migration 20261013150000: a pesquisa desliga e passa a ser só da cobrança.
 * Conferência do texto — o banco de verdade é produção.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_pesquisa_experiencia_so_cobranca.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('pesquisa de experiência só da cobrança', () => {
  it('desliga a pesquisa e confere', () => {
    expect(LISO).toContain('UPDATE public.pesquisa_experiencia_config SET ligada = FALSE');
    expect(LISO).toContain("RAISE EXCEPTION 'A pesquisa continua ligada.'");
  });

  it('o comercial é a empresa de slug comercial', () => {
    expect(LISO).toContain("e.id = p_empresa_id AND e.slug = 'comercial'");
  });

  it('o comercial sai do público, da leitura, da pergunta e do voto', () => {
    expect(LISO).toMatch(/fn_pesquisa_experiencia_publico\(\)[\s\S]*NOT public\.fn_pesquisa_experiencia_eh_comercial\(p\.empresa_id\)/);
    expect(LISO).toContain('AND NOT public.fn_pesquisa_experiencia_eh_comercial(empresa_id)');
    expect(LISO).toMatch(/fn_pesquisa_experiencia_estado\(\)[\s\S]*AND NOT EXISTS/);
    expect(LISO).toContain("RAISE EXCEPTION 'a pesquisa é só da cobrança'");
  });

  it('não apaga resposta nenhuma', () => {
    expect(LISO).not.toMatch(/DELETE FROM public\.pesquisa_experiencia_respostas/);
  });

  it('registra a si mesma', () => {
    expect(LISO).toContain("('20261013150000', 'pesquisa_experiencia_so_cobranca'");
  });
});
