/**
 * Migration 20261013120000: o líder vê quem votou na campanha dele.
 * Conferência do texto — o banco de verdade é produção.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_campanha_votos_visiveis_ao_lider.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('votos visíveis ao líder', () => {
  it('só quem lançou a campanha lê os votos dela', () => {
    expect(LISO).toContain('CREATE POLICY cf_avaliacoes_select_autor ON public.campanha_facil_avaliacoes FOR SELECT TO authenticated');
    expect(LISO).toContain('l.id = campanha_facil_avaliacoes.lote_id AND l.criado_por = (SELECT auth.uid())');
  });

  it('não mexe na policy do próprio voto nem abre escrita', () => {
    expect(LISO).not.toMatch(/DROP POLICY IF EXISTS cf_avaliacoes_select ON/);
    expect(LISO).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/);
    expect(LISO).toContain("RAISE EXCEPTION 'campanha_facil_avaliacoes aceita escrita direta.'");
  });

  it('registra a si mesma', () => {
    expect(LISO).toContain("('20261013120000', 'campanha_votos_visiveis_ao_lider'");
  });
});
