// @vitest-environment node
/**
 * pix_correcao_valor.sql.test.ts — «Corrigir valor» do Pix automático
 * (migration 20261117140000) num Postgres de verdade (PGlite, LOCAL — não é o
 * banco de produção).
 *
 * Reproduz o defeito (cargo fora da lista + permissão do painel: a correção
 * sumia em silêncio e o saldo ficava preso) e prova o conserto: a correção
 * fica no NR, o reparo solta o saldo preso, e retirar solta a reserva órfã.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const EMPRESA = '00000000-0000-4000-8000-0000000000e0';
const LIDER = '00000000-0000-4000-8000-0000000000a1';     // cargo da lista antiga
const ADM = '00000000-0000-4000-8000-0000000000a2';       // assistente_adm com o painel
const OPERADOR = '00000000-0000-4000-8000-0000000000c1';
const NR1 = '00000000-0000-4000-8000-000000000101';
const NR2 = '00000000-0000-4000-8000-000000000102';

const MIGRATION = readFileSync(resolve(__dirname, '../../supabase/migrations/20261117140000_pix_correcao_valor_divergente.sql'), 'utf8');

// O gatilho como estava (20260823080000): só a lista de cargos.
const GATILHO_ANTIGO = `
CREATE OR REPLACE FUNCTION public.fn_pix_congela_campos_do_operador() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF public.fn_user_has_any_role(ARRAY['lider','elite','gerencia','administrador','super_admin']) THEN RETURN NEW; END IF;
  NEW.status := OLD.status; NEW.pago := OLD.pago;
  NEW.ajuste_valor := OLD.ajuste_valor; NEW.ajuste_motivo := OLD.ajuste_motivo; NEW.ajuste_em := OLD.ajuste_em;
  NEW.ajuste_por := OLD.ajuste_por; NEW.ajuste_por_nome := OLD.ajuste_por_nome;
  RETURN NEW;
END $f$;`;

// O RPC de aplicar como estava (sem conferir o que gravou).
const APLICAR_ANTIGO = `
CREATE OR REPLACE FUNCTION public.fn_pix_saldo_aplicar(p_acordo_id UUID) RETURNS public.pix_automatico_acordos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_acordo public.pix_automatico_acordos; v_saldo public.pix_automatico_saldos;
BEGIN
  SELECT * INTO v_acordo FROM public.pix_automatico_acordos WHERE id = p_acordo_id FOR UPDATE;
  SELECT * INTO v_saldo FROM public.pix_automatico_saldos WHERE operador_id = v_acordo.operador_id FOR UPDATE;
  UPDATE public.pix_automatico_acordos SET ajuste_valor = v_saldo.valor WHERE id = p_acordo_id RETURNING * INTO v_acordo;
  UPDATE public.pix_automatico_saldos SET acordo_id = p_acordo_id, reservado_em = NOW() WHERE id = v_saldo.id;
  RETURN v_acordo;
END $f$;`;

let db: PGlite;

async function como<T>(uid: string, sql: string, params: unknown[] = []): Promise<T> {
  await db.query("select set_config('teste.uid', $1, false)", [uid]);
  const r = await db.query<{ v: T }>(sql, params);
  return r.rows[0]?.v as T;
}
const aplicar = (uid: string, id: string) => como<{ ajuste_valor: string | null }>(uid, 'select row_to_json(public.fn_pix_saldo_aplicar($1)) v', [id]);
const retirar = (uid: string, id: string) => como(uid, 'select row_to_json(public.fn_pix_saldo_retirar($1)) v', [id]);
const ajusteDo = async (id: string) => (await db.query<{ v: string | null }>('select ajuste_valor::text v from public.pix_automatico_acordos where id = $1', [id])).rows[0].v;
const saldo = async () => (await db.query<{ valor: string; acordo_id: string | null }>('select valor::text, acordo_id from public.pix_automatico_saldos')).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
    create table public.perfis (id uuid primary key, nome text, perfil text, empresa_id uuid, setor_id uuid);
    insert into public.perfis values ('${LIDER}', 'Lider', 'lider', '${EMPRESA}', null), ('${ADM}', 'Assistente', 'assistente_adm', '${EMPRESA}', null), ('${OPERADOR}', 'Ana', 'operador', '${EMPRESA}', null);
    create function public.fn_user_has_any_role(roles text[]) returns boolean language sql stable
      as $$ select exists (select 1 from public.perfis where id = auth.uid() and perfil = any(roles)) $$;
    -- Pelo painel: líder e a assistente veem além dos próprios registros; o operador não.
    create function public.fn_user_escopo(m text) returns int language sql stable
      as $$ select case when auth.uid() in ('${LIDER}', '${ADM}') then 3 else 1 end $$;
    create function public.fn_can_access_empresa(e uuid) returns boolean language sql stable as $$ select true $$;
    create function public.fn_pix_pode_ajustar_saldo() returns boolean language sql stable
      as $$ select public.fn_user_escopo('pix') >= 2 $$;
    create function public.fn_pix_valor_br(v numeric) returns text language sql immutable as $$ select v::text $$;
    create table public.pix_log (acao text, descricao text);
    create function public.fn_pix_log(e uuid, a uuid, nr text, acao text, d text, v numeric, op uuid, opn text, antes jsonb, depois jsonb)
      returns void language sql as $$ insert into public.pix_log values (acao, d) $$;
    create table public.pix_automatico_acordos (
      id uuid primary key, empresa_id uuid, operador_id uuid, operador_nome text, setor_id uuid, nr_cliente text,
      status text, valor numeric(12,2) default 0, pct_comissao numeric, bonus_pct numeric, comissao_fixa numeric, avaliado_por uuid, avaliado_por_nome text, avaliado_em timestamptz,
      pago boolean default false, pago_em timestamptz, pago_por uuid, pago_por_nome text, criado_em timestamptz default now(),
      ajuste_valor numeric(12,2), ajuste_motivo text, ajuste_em timestamptz, ajuste_por uuid, ajuste_por_nome text);
    create table public.pix_automatico_saldos (
      id uuid primary key default gen_random_uuid(), empresa_id uuid, operador_id uuid, operador_nome text, setor_id uuid,
      valor numeric(12,2), motivo text, acordo_id uuid, reservado_em timestamptz, atualizado_em timestamptz default now(),
      criado_por uuid, criado_por_nome text, criado_em timestamptz default now(), unique (empresa_id, operador_id));
    create table public.pix_automatico_config (empresa_id uuid, setor_id uuid, pct numeric(6,4));
    create function public.fn_pix_saldo_retirar(p_acordo_id uuid) returns public.pix_automatico_acordos language sql as $$ select null::public.pix_automatico_acordos $$;
  `);
  await db.exec(GATILHO_ANTIGO);
  await db.exec('CREATE TRIGGER trg_pix_auto_congela_operador BEFORE UPDATE ON public.pix_automatico_acordos FOR EACH ROW EXECUTE FUNCTION public.fn_pix_congela_campos_do_operador();');
});
afterAll(async () => { await db.close(); });

const NR3 = '00000000-0000-4000-8000-000000000103';

/**
 * Comissão de 0,25%: o 111 (o mais antigo) é de R$ 1.600 → R$ 4,00; o 222 é de
 * R$ 10.000 → R$ 25,00; o 333 (pendente) é de R$ 2.000 → R$ 5,00.
 */
async function semear(comSaldo = true) {
  await db.exec(`
    delete from public.pix_automatico_acordos; delete from public.pix_automatico_saldos; delete from public.pix_log;
    insert into public.pix_automatico_acordos (id, empresa_id, operador_id, operador_nome, nr_cliente, status, valor, pct_comissao, criado_em) values
      ('${NR1}', '${EMPRESA}', '${OPERADOR}', 'Ana', '111', 'aprovado', 1600, 0.25, now() - interval '3 days'),
      ('${NR2}', '${EMPRESA}', '${OPERADOR}', 'Ana', '222', 'aprovado', 10000, 0.25, now() - interval '2 days'),
      ('${NR3}', '${EMPRESA}', '${OPERADOR}', 'Ana', '333', 'pendente', 2000, 0.25, now() - interval '1 day');
  `);
  if (comSaldo) {
    await db.exec(`insert into public.pix_automatico_saldos (empresa_id, operador_id, operador_nome, valor, motivo)
      values ('${EMPRESA}', '${OPERADOR}', 'Ana', -10, 'Pix saiu a mais')`);
  }
}
const definir = (uid: string, valor: number, somar = false) =>
  como(uid, 'select row_to_json(public.fn_pix_saldo_definir($1, $2, $3, $4, $5)) v', [EMPRESA, OPERADOR, valor, 'teste', somar]);
const status = (uid: string, id: string, s: string) =>
  como(uid, 'update public.pix_automatico_acordos set status = $1 where id = $2 returning 1 v', [s, id]);
const pagar = (id: string, pago = true) =>
  como(LIDER, 'update public.pix_automatico_acordos set pago = $1 where id = $2 returning 1 v', [pago, id]);
const comissaoDo222 = async () =>
  (await db.query<{ v: string }>(`select public.fn_pix_comissao_da_linha(a)::text v from public.pix_automatico_acordos a where id = '${NR2}'`)).rows[0].v;
const antigos = async () => { await db.exec(GATILHO_ANTIGO); await db.exec(APLICAR_ANTIGO); };

describe('Corrigir valor do Pix (migration 20261117140000)', () => {
  describe('antes: o defeito', () => {
    beforeEach(async () => { await antigos(); await semear(); });

    it('cargo fora da lista: «aplicada», mas o NR fica sem correção e o saldo preso', async () => {
      const r = await aplicar(ADM, NR1);
      expect(r.ajuste_valor).toBeNull();          // não somou nem tirou
      expect(await ajusteDo(NR1)).toBeNull();
      expect((await saldo()).acordo_id).toBe(NR1); // e o saldo ficou reservado ali
    });
  });

  describe('depois: a migration', () => {
    beforeEach(async () => { await antigos(); });

    it('o saldo livre de hoje entra sozinho, até a comissão do NR', async () => {
      await semear();
      await db.exec(MIGRATION);
      expect(await ajusteDo(NR1)).toBe('-4.00');   // comissão de R$ 4,00: paga R$ 0,00
      expect((await saldo()).acordo_id).toBe(NR1);
      expect((await saldo()).valor).toBe('-10.00'); // o saldo inteiro continua até pagar
    });

    it('o saldo preso (defeito antigo) é solto e entra de verdade', async () => {
      await semear();
      await aplicar(ADM, NR2);                    // preso no 222 sem correção
      await db.exec(MIGRATION);
      expect(await ajusteDo(NR2)).toBeNull();
      expect(await ajusteDo(NR1)).toBe('-4.00');
      const log = await db.query<{ descricao: string }>("select descricao from public.pix_log where descricao like 'Reparo%'");
      expect(log.rows).toHaveLength(1);
    });

    it('roda duas vezes sem aplicar duas vezes', async () => {
      await semear();
      await db.exec(MIGRATION);
      await db.exec(MIGRATION);
      expect(await ajusteDo(NR1)).toBe('-4.00');
      expect(await ajusteDo(NR2)).toBeNull();
    });
  });

  describe('depois: o dia a dia', () => {
    beforeEach(async () => { await antigos(); await semear(false); await db.exec(MIGRATION); });

    it('a comissão do NR é a mesma conta do app (fixo, % travado e bônus)', async () => {
      expect(await comissaoDo222()).toBe('25.00');
      await db.exec(`update public.pix_automatico_acordos set bonus_pct = 0.1 where id = '${NR2}'`);
      expect(await comissaoDo222()).toBe('35.00');
      await db.exec(`update public.pix_automatico_acordos set comissao_fixa = 7 where id = '${NR2}'`);
      expect(await comissaoDo222()).toBe('7.00');
    });

    it('anotar o saldo já põe a correção no próximo pagamento (até a comissão)', async () => {
      await definir(ADM, -10);
      expect(await ajusteDo(NR1)).toBe('-4.00');
      expect((await saldo()).acordo_id).toBe(NR1);
    });

    it('desconto em partes: paga o 1º NR, o resto vai sozinho para o próximo, e pagar quita', async () => {
      await definir(ADM, -10);
      await pagar(NR1);                            // quitou R$ 4,00
      expect((await saldo()).valor).toBe('-6.00');
      expect(await ajusteDo(NR2)).toBe('-6.00');   // o resto entrou no 222
      expect((await saldo()).acordo_id).toBe(NR2);
      await pagar(NR2);                            // quitou o resto
      expect(await saldo()).toBeUndefined();
    });

    it('desfazer o pagamento devolve a parte e tira o resto do outro NR', async () => {
      await definir(ADM, -10);
      await pagar(NR1);
      await pagar(NR1, false);
      expect((await saldo()).valor).toBe('-10.00');
      expect((await saldo()).acordo_id).toBe(NR1);
      expect(await ajusteDo(NR1)).toBe('-4.00');
      expect(await ajusteDo(NR2)).toBeNull();
    });

    it('o que a empresa deve entra inteiro, sem limite', async () => {
      await definir(ADM, 50);
      expect(await ajusteDo(NR1)).toBe('50.00');
    });

    it('NR sem comissão é pulado no desconto', async () => {
      await db.exec(`update public.pix_automatico_acordos set comissao_fixa = 0 where id = '${NR1}'`);
      await definir(ADM, -10);
      expect(await ajusteDo(NR1)).toBeNull();
      expect(await ajusteDo(NR2)).toBe('-10.00');
    });

    it('«Corrigir valor» manual num NR sem comissão recusa', async () => {
      await db.exec(`update public.pix_automatico_acordos set comissao_fixa = 0 where id = '${NR1}'`);
      await db.exec(`insert into public.pix_automatico_saldos (empresa_id, operador_id, operador_nome, valor) values ('${EMPRESA}', '${OPERADOR}', 'Ana', -10)`);
      await expect(aplicar(ADM, NR1)).rejects.toThrow(/PIX_SALDO_SEM_COMISSAO/);
    });

    it('sem NR aprovado, espera; o próximo aprovado recebe sozinho', async () => {
      await db.exec(`update public.pix_automatico_acordos set status = 'pendente'`);
      await definir(ADM, 15);
      expect((await saldo()).acordo_id).toBeNull();
      await status(LIDER, NR3, 'aprovado');
      expect(await ajusteDo(NR3)).toBe('15.00');
      expect((await saldo()).acordo_id).toBe(NR3);
    });

    it('somar com o saldo já aplicado: tira do NR, soma e aplica de novo', async () => {
      await definir(ADM, -10);
      await definir(ADM, -5, true);
      expect((await saldo()).valor).toBe('-15.00');
      expect(await ajusteDo(NR1)).toBe('-4.00');
      expect(await ajusteDo(NR2)).toBeNull();
    });

    it('zerar com o saldo aplicado: a correção sai do NR', async () => {
      await definir(ADM, -10);
      await definir(ADM, 0);
      expect(await saldo()).toBeUndefined();
      expect(await ajusteDo(NR1)).toBeNull();
    });

    it('o NR com correção volta a pendente: a correção vai para o outro aprovado', async () => {
      await definir(ADM, -10);
      await status(LIDER, NR1, 'pendente');
      expect(await ajusteDo(NR1)).toBeNull();
      expect(await ajusteDo(NR2)).toBe('-10.00');
      expect((await saldo()).acordo_id).toBe(NR2);
    });

    it('com o painel, «Corrigir valor» manual grava a parte que cabe; retirar devolve', async () => {
      await db.exec(`insert into public.pix_automatico_saldos (empresa_id, operador_id, operador_nome, valor) values ('${EMPRESA}', '${OPERADOR}', 'Ana', -10)`);
      expect(Number((await aplicar(ADM, NR1)).ajuste_valor)).toBe(-4);
      await retirar(ADM, NR1);
      expect(Number((await aplicar(ADM, NR2)).ajuste_valor)).toBe(-10);
      await retirar(ADM, NR2);
      expect(await ajusteDo(NR2)).toBeNull();
      expect((await saldo()).acordo_id).toBeNull();
    });

    it('o líder da lista antiga continua podendo', async () => {
      await db.exec(`insert into public.pix_automatico_saldos (empresa_id, operador_id, operador_nome, valor) values ('${EMPRESA}', '${OPERADOR}', 'Ana', -10)`);
      await aplicar(LIDER, NR2);
      expect(await ajusteDo(NR2)).toBe('-10.00');
    });

    it('ninguém grava correção por UPDATE solto, nem a liderança', async () => {
      await como(LIDER, `update public.pix_automatico_acordos set ajuste_valor = 999 where id = '${NR1}' returning 1 v`);
      expect(await ajusteDo(NR1)).toBeNull();
    });

    it('operador sem o painel não anota nem aplica', async () => {
      await expect(definir(OPERADOR, -10)).rejects.toThrow(/PIX_SALDO_SEM_PERMISSAO/);
      await expect(aplicar(OPERADOR, NR1)).rejects.toThrow(/PIX_SALDO_SEM_PERMISSAO/);
    });

    it('retirar num NR sem correção solta a reserva órfã', async () => {
      await db.exec(`insert into public.pix_automatico_saldos (empresa_id, operador_id, operador_nome, valor, acordo_id) values ('${EMPRESA}', '${OPERADOR}', 'Ana', -10, '${NR2}')`);
      await retirar(ADM, NR2);
      expect((await saldo()).acordo_id).toBeNull();
      await expect(retirar(ADM, NR2)).rejects.toThrow(/PIX_SALDO_SEM_CORRECAO/);
    });
  });
});
