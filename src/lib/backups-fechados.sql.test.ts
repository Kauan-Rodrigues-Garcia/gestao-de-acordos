/**
 * backups-fechados.sql.test.ts — tabela de backup não fala com o PostgREST.
 *
 * `composicao_mes_backup_2026_08` e a irmã ficaram de 01/09 a 07/09/2026 com
 * RLS desligada e `anon` segurando SELECT, INSERT, UPDATE, DELETE e TRUNCATE.
 * Eram as duas únicas tabelas do schema nessa situação, e a causa foi o
 * caminho: nasceram de um script avulso com `CREATE TABLE ... AS`, que não
 * carrega o endurecimento que as migrations fazem.
 *
 * Dois arquivos são conferidos aqui — a migration que fechou, e o script que
 * as cria, para que uma nova execução dele não reabra o buraco.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const raiz = (p: string) => path.resolve(__dirname, '../..', p);

const MIGRATION = fs.readFileSync(
  raiz('supabase/migrations/20260907223118_fecha_os_backups_de_composicao.sql'),
  'utf8',
).toLowerCase();

const SCRIPT = fs.readFileSync(
  raiz('supabase/sql_scripts/reconstruir_composicao_2026_08_pelos_logs.sql'),
  'utf8',
).toLowerCase();

const BACKUPS = [
  'composicao_mes_backup_2026_08',
  'composicao_mes_equipe_backup_2026_08',
] as const;

describe('migration que fechou os backups de composição', () => {
  it.each(BACKUPS)('liga RLS em %s', (tabela) => {
    expect(MIGRATION).toContain(`alter table public.${tabela} enable row level security`);
  });

  it.each(BACKUPS)('revoga anon e authenticated em %s', (tabela) => {
    const revoke = new RegExp(
      `revoke all on table public\\.${tabela}\\s+from public, anon, authenticated`,
    );
    expect(MIGRATION).toMatch(revoke);
  });

  it('não cria política: RLS sem política é o que nega tudo', () => {
    // Uma política aqui seria o oposto do pedido — abriria uma porta no
    // backup. Se alguém adicionar, este teste avisa antes de aplicar.
    expect(MIGRATION).not.toContain('create policy');
  });

  it('não toca em dado: só metadado de tabela', () => {
    for (const proibido of ['insert into', 'update public.', 'delete from', 'drop table']) {
      expect(MIGRATION).not.toContain(proibido);
    }
  });

  it('verifica o resultado e falha se a tabela continuar aberta', () => {
    expect(MIGRATION).toContain('raise exception');
    expect(MIGRATION).toContain('not c.relrowsecurity');
  });
});

describe('script que cria os backups', () => {
  it.each(BACKUPS)('fecha %s na mesma passagem em que a cria', (tabela) => {
    const criacao = SCRIPT.indexOf(`create table public.${tabela} as`);
    const rls     = SCRIPT.indexOf(`alter table public.${tabela} enable row level security`);
    const revoke  = SCRIPT.indexOf(`revoke all on table public.${tabela}`);

    expect(criacao).toBeGreaterThan(-1);
    // Depois do CREATE, senão endurece uma tabela que ainda não existe.
    expect(rls).toBeGreaterThan(criacao);
    expect(revoke).toBeGreaterThan(criacao);
  });
});
