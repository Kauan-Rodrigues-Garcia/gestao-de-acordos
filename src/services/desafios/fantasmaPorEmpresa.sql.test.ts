/**
 * Migration 20261021150000: o fantasma da transferência só alcança as linhas
 * da empresa de ORIGEM.
 *
 * O desafio dos líderes cruza BookPlay e PaguePlay e chama
 * `fn_recebido_por_equipe` com as duas. O fantasma casava só por pessoa, e o
 * Luan Pinto — transferido para o Conecta Play em 05/10/2026 — levava os R$
 * 15.893,76 que recebeu lá para a equipe da Camila Hitomi: 120,9% no desafio
 * contra 82% no Painel. Conferido no banco (leitura, 21/10/2026): com o corpo
 * novo só essas duas equipes mudam, e a da Camila fecha com o Painel.
 *
 * Este teste trava o que faz a correção: tudo o que liga pessoa a equipe é
 * por (operador, empresa).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_fantasma_vale_so_na_empresa_de_origem.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('fn_recebido_por_equipe: fantasma por empresa', () => {
  it('um fantasma por pessoa e empresa', () => {
    expect(LISO).toContain('SELECT DISTINCT ON (t.perfil_id, t.empresa_id)');
    expect(LISO).toContain('ORDER BY t.perfil_id, t.empresa_id, t.id');
  });

  it('o fantasma só casa com a soma da mesma empresa', () => {
    expect(LISO).toContain('LEFT JOIN fantasma f ON f.perfil_id = s.operador_id AND f.empresa_id = s.empresa_id');
    expect(LISO).toContain('JOIN linhas l ON l.operador_id = f.perfil_id AND l.empresa_id = f.empresa_id AND l.fora');
  });

  it('soma e vínculo são por operador e empresa, e a conta final os casa', () => {
    expect(LISO).toContain('GROUP BY x.operador_id, x.empresa_id');
    expect(LISO).toContain('GROUP BY a.operador_id, a.empresa_id, em.slug');
    expect(LISO).toContain('JOIN soma s ON s.operador_id = v.operador_id AND s.empresa_id = v.empresa_id');
  });

  it('a assinatura e a trava de acesso continuam as mesmas', () => {
    expect(LISO).toContain('RETURNS TABLE(equipe_id UUID, total NUMERIC, total_ho NUMERIC, qtd BIGINT)');
    expect(LISO).toContain('FROM PUBLIC, anon, authenticated;');
  });
});
