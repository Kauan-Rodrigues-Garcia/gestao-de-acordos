/**
 * Guarda das otimizações de 09/10/2026 (quedas por falta de memória).
 *
 * 1. As tabelas que saíram do Postgres Changes (20261009201000) não podem
 *    voltar a ser assinadas como tabela — a publicação não as tem mais, e a
 *    assinatura ficaria muda.
 * 2. Os nomes de sinal do app e os da policy `sinal_mudou_receber` andam
 *    juntos: um nome só no app vira canal recusado.
 * 3. Nenhuma policy nova volta a chamar função sem `(SELECT …)`
 *    (20261009200000) — a verificação está na própria migration.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { REGRAS_SINAL } from '@/lib/sinais';

const RAIZ = path.resolve(__dirname, '../../..');
const SRC = path.join(RAIZ, 'src');
const MIGRATIONS = path.join(RAIZ, 'supabase/migrations');

function arquivosTs(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) saida.push(...arquivosTs(p));
    else if (/\.tsx?$/.test(nome.name) && !/\.test\.tsx?$/.test(nome.name) && !nome.name.endsWith('.d.ts')) saida.push(p);
  }
  return saida;
}

const liso = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

const SAIRAM = [
  'comemoracoes', 'desafios', 'desafios_setores', 'direto_extra_config', 'perfis',
  'comissao_config', 'comissao_faixas', 'comissao_config_usuarios', 'comissao_bonus', 'comissao_bonus_usuarios',
  // 20261009220000: aviso com os ids, relidos com a RLS de quem ouve.
  'acordos',
];

describe('tempo real das configurações vai pelo sinal', () => {
  it('nenhum código assina como tabela o que saiu da publicação', () => {
    const achados: string[] = [];
    for (const f of arquivosTs(SRC)) {
      const texto = fs.readFileSync(f, 'utf8');
      for (const t of SAIRAM) {
        // Só dentro de `escutas: [...]` (assinarTabela) ou de `.on('postgres_changes', {...})` —
        // `registrarLog({ tabela: 'desafios' })` é log, não assinatura.
        if (new RegExp(`escutas:\\s*\\[[^\\]]*tabela:\\s*['"]${t}['"]`).test(texto)
          || new RegExp(`postgres_changes['"],\\s*\\{[^}]*table:\\s*['"]${t}['"]`).test(texto)) {
          achados.push(`${path.relative(RAIZ, f)} → ${t}`);
        }
      }
    }
    expect(achados).toEqual([]);
  });

  it('a migration tira as dez tabelas da publicação e cria os 27 gatilhos', () => {
    const sql = liso('20261009201000_sinais_das_configuracoes.sql');
    for (const t of SAIRAM.filter(x => x !== 'acordos')) expect(sql).toContain(`'${t}'`);
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I');
    expect(sql).toContain('<> 27 THEN');
  });

  it('todo nome de sinal do app está na policy que deixa ouvir', () => {
    const sql = liso('20261009201000_sinais_das_configuracoes.sql');
    const lista = sql.match(/ALTER POLICY sinal_mudou_receber[^;]*;/)?.[0] ?? '';
    for (const nome of Object.keys(REGRAS_SINAL)) expect(lista).toContain(`'${nome}'::text`);
  });

  it('desafios avisam também as empresas da campanha multiempresa', () => {
    const sql = liso('20261009201000_sinais_das_configuracoes.sql');
    expect(sql).toContain('SELECT unnest(n.empresas) FROM novas n');
    expect(sql).toContain("'public.fn_realtime_sinal_comissao_filhas(''config_id'')'");
    expect(sql).toContain("'public.fn_realtime_sinal_comissao_filhas(''bonus_id'')'");
  });
});

describe('acordos: o aviso não leva conteúdo', () => {
  const sql = liso('20261009220000_acordos_pelo_sinal.sql');
  it('o payload é só operação e ids (ou recarregar)', () => {
    expect(sql).toContain("jsonb_build_object('operacao', tg_op, 'ids', r.ids)");
    expect(sql).toContain("jsonb_build_object('operacao', tg_op, 'recarregar', true)");
    // Nenhum campo do acordo além de id/empresa/operador entra na montagem.
    expect(sql).not.toMatch(/nome_cliente|nr_cliente|valor|whatsapp/);
  });
  it('o tópico da empresa exige escopo além de «os meus»', () => {
    expect(sql).toContain('(SELECT public.fn_user_escopo_acordos()) >= 1');
    expect(sql).toContain("= 'acordos-op'::text) AND (SELECT public.fn_realtime_posso_ouvir_usuario(");
  });
  it('acordos sai da publicação', () => {
    expect(sql).toContain('ALTER PUBLICATION supabase_realtime DROP TABLE public.acordos');
  });
});

describe('RLS: função de permissão uma vez por consulta', () => {
  it('a migration recusa aplicar se sobrar função nua numa policy', () => {
    const sql = liso('20261009200000_rls_funcao_uma_vez_por_consulta.sql');
    expect(sql).toContain('Ainda há função avaliada por linha em');
    expect(sql).toContain('ALTER POLICY nr_select_authenticated ON public.nr_registros USING (((SELECT public.fn_user_acesso_multiempresa())');
  });
  it('nenhuma expressão de policy da migration chama função sem (SELECT …)', () => {
    const sql = liso('20261009200000_rls_funcao_uma_vez_por_consulta.sql');
    const policies = sql.match(/ALTER POLICY[^;]*;/g) ?? [];
    expect(policies.length).toBe(21);
    for (const p of policies) {
      expect(p.replace(/\(SELECT public\.fn_[a-z_]+\([^)]*\)\)/g, '').replace(/\(SELECT auth\.uid\(\)\)/g, ''))
        .not.toMatch(/public\.fn_(?!ticket_visivel)[a-z_]+\(\)|auth\.uid\(\)/);
    }
  });
});
