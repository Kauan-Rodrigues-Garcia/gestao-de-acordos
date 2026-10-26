// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResultadoImportacao945 } from './modelo';

const empresa = '00000000-0000-4000-8000-000000000001';
const semCofen = '00000000-0000-4000-8000-000000000009';
const setor = '00000000-0000-4000-8000-000000000002';
const usuario = '00000000-0000-4000-8000-000000000003';
const ana = '00000000-0000-4000-8000-0000000000a1';
const bia = '00000000-0000-4000-8000-0000000000b1';
const manual = '00000000-0000-4000-8000-0000000000c1';

const TZ = 'America/Sao_Paulo';
const isoLocal = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const hoje = isoLocal(new Date());
const dia = (delta: number) => {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
/** Agora em São Paulo menos um minuto, no formato que o parser manda. */
const corteAgora = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() - 60_000)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00`;
};
const piso = (() => {
  const [a, m] = hoje.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 10);
})();

interface Linha { id: string; data: string; total: number; op?: string; opId?: string | null }
const linha = ({ id, data, total, op = '', opId = null }: Linha) => ({
  p: { id_baixa: id, data, data_pagamento: data, uf: 'SP', acordo: `A${id}`, parcela: '1', forma: 'Pix', ia: '',
       total, coren: Math.round(total * 0.5864), cofen: Math.round(total * 0.1876), pp: total - Math.round(total * 0.5864) - Math.round(total * 0.1876) },
  d: { operador_usuario: op, operador_id: opId, cliente_codigo: `9${id}`, nome_cliente: 'CLIENTE', acordo_codigo: `A${id}`,
       forma: 'Pix', prox_contato: null, tabulacao: null },
});

let db: PGlite;
const rpc = async <T = unknown>(acao: string, dados: unknown): Promise<T> => {
  const r = await db.query<{ r: T }>('select public.fn_relatorio_945($1, $2) r', [acao, JSON.stringify(dados)]);
  return r.rows[0].r;
};
async function importar(linhas: ReturnType<typeof linha>[], opts: { inicio: string; fim?: string; extra?: object; comDiario?: boolean }) {
  const soma = (k: 'total' | 'coren' | 'cofen' | 'pp') => linhas.reduce((s, l) => s + l.p[k], 0);
  const lote = await rpc<string>('abrir', {
    empresa, origem: 'diario', arquivo: 'teste.xlsx', inicio: opts.inicio, fim: opts.fim ?? hoje, corte: corteAgora(),
    quantidade: linhas.length, totais: { total: soma('total'), coren: soma('coren'), cofen: soma('cofen'), pp: soma('pp') },
    com_diario: opts.comDiario ?? true,
  });
  await rpc('adicionar', { lote, linhas });
  return rpc<ResultadoImportacao945>('concluir', { lote, ...opts.extra });
}
const diario = async () => (await db.query<{ id_baixa: string | null; dia_referencia: string; valor_recebido: string; operador_usuario: string; operador_id: string | null; visto: boolean }>(
  `select id_baixa, dia_referencia::text, valor_recebido::text, operador_usuario, operador_id::text, visto
     from public.diario_recebimentos order by id_baixa nulls first`)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function public.fn_can_access_empresa(id uuid) returns boolean language sql as $$ select true $$;
    create function public.fn_user_tem(k text) returns boolean language sql as $$ select coalesce(current_setting('test.importar',true),'1') = '1' $$;
    create function public.fn_pp_relatorio_acesso(e uuid) returns boolean language sql as $$ select false $$;
    create table public.empresas(id uuid primary key);
    create table public.setores(id uuid, empresa_id uuid, regra text);
    create table public.perfis(id uuid primary key);
    insert into public.empresas values ('${empresa}'), ('${semCofen}');
    insert into public.setores values ('${setor}', '${empresa}', 'cofen');
    insert into public.perfis values ('${usuario}'), ('${ana}'), ('${bia}'), ('${manual}');
    create table public.diario_recebimentos (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, operador_id uuid, operador_usuario text not null,
      nome_cliente text, acordo_codigo text, forma_pagamento text not null default '—', valor_recebido numeric not null default 0,
      data_pagamento date, dia_referencia date not null, prox_contato date, tabulacao text, id_baixa text, chave_unica text not null,
      import_index integer not null default 1, visto boolean not null default false, importado_por_id uuid,
      importado_em timestamptz not null default now(), lote_id uuid not null, instituicao text, setor_id uuid, cliente_codigo text);
    create unique index idx_diario_unicidade on public.diario_recebimentos (empresa_id, dia_referencia, chave_unica);
    create table public.pp_relatorio_pagamentos (
      empresa_id uuid not null, id_baixa text not null, data date not null, data_pagamento date not null, uf text not null,
      acordo text not null, parcela text not null, forma text not null, ia text not null,
      total bigint not null, coren bigint not null, cofen bigint not null, pp bigint not null, primary key (empresa_id, id_baixa));
    create table private.pp_relatorio_lotes (
      id uuid primary key default gen_random_uuid(), empresa_id uuid not null, modalidade text not null,
      inicio date not null, fim date not null, arquivo text not null, quantidade integer not null, totais jsonb not null,
      criado_por uuid not null, criado_em timestamptz not null default now(), concluido_em timestamptz, resultado jsonb);
    create table private.pp_relatorio_dias (empresa_id uuid, modalidade text, data date, importado_em timestamptz not null,
      completo boolean not null, primary key (empresa_id, modalidade, data));
    create table private.pp_relatorio_controle_diario (empresa_id uuid, modalidade text, dia date, primary key (empresa_id, modalidade, dia));
    -- Duplicata histórica: o ERP mudou a data da baixa e o diário guardou as duas.
    insert into public.diario_recebimentos (empresa_id, operador_usuario, dia_referencia, id_baixa, chave_unica, lote_id, valor_recebido, importado_em)
      values ('${empresa}', '', '${dia(-40)}', '777', '777', gen_random_uuid(), 59.93, now() - interval '2 days'),
             ('${empresa}', '', '${dia(-12)}', '777', '777', gen_random_uuid(), 59.92, now() - interval '1 day');
    select set_config('test.uid', '${usuario}', false);
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `);
  const file = readdirSync('supabase/migrations').find(n => n.endsWith('_relatorio_945_importacao_unica.sql'))!;
  await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  await db.exec('set role authenticated');
}, 30000);
afterAll(async () => { await db?.close(); });

describe('relatório 945: importação única e cobertura', { concurrent: false }, () => {
  it('a migration deixa uma baixa por Id.Baixa no diário, a mais recente', async () => {
    const r = await diario();
    expect(r.filter(x => x.id_baixa === '777')).toEqual([expect.objectContaining({ dia_referencia: dia(-12), valor_recebido: '59.92' })]);
  });

  it('sem histórico, exige 35 dias e recusa arquivo que começa depois', async () => {
    const cob = await rpc<{ inicio_exigido: string; dias: unknown[] }>('cobertura', { empresa });
    expect(cob.inicio_exigido).toBe(dia(-35));
    expect(cob.dias).toHaveLength(21);
    await expect(importar([linha({ id: '1', data: dia(-1), total: 1000 })], { inicio: dia(-1) }))
      .rejects.toThrow(/a partir de .* até hoje/);
  });

  it('grava diretoria e diário juntos; o diário só recebe a janela operacional', async () => {
    const linhas = [
      linha({ id: '10', data: dia(-35), total: 5000, op: 'ANA', opId: ana }),
      linha({ id: '11', data: dia(-1), total: 1000, op: 'ANA', opId: ana }),
      linha({ id: '12', data: hoje, total: 2000, op: '' }),
      linha({ id: '777', data: dia(-12), total: 5992 }),
    ];
    const r = await importar(linhas, { inicio: dia(-35) });
    expect(r).toMatchObject({ inseridos: 4, atualizados: 0, ignorados: 0 });
    const noDiario = dia(-35) >= piso ? 4 : 3;
    expect(r.diario.inseridos + r.diario.atualizados).toBeGreaterThanOrEqual(noDiario - 1);
    const d = await diario();
    expect(d.some(x => x.id_baixa === '10')).toBe(dia(-35) >= piso);
    expect(d.find(x => x.id_baixa === '11')).toMatchObject({ valor_recebido: '10.00', operador_id: ana, dia_referencia: dia(-1) });
    expect(r.diario.novos_por_operador).toEqual(expect.arrayContaining([expect.objectContaining({ operadorId: ana })]));
    const pag = await db.query<{ n: number }>('select count(*)::int n from public.pp_relatorio_pagamentos');
    expect(pag.rows[0].n).toBe(4);
  });

  it('depois de um arquivo hoje, o próximo pode começar em qualquer dia', async () => {
    const cob = await rpc<{ inicio_exigido: string | null; dias: { data: string; estado: string }[] }>('cobertura', { empresa });
    expect(cob.inicio_exigido).toBeNull();
    expect(cob.dias.find(x => x.data === dia(-1))?.estado).toBe('completo');
    expect(cob.dias.find(x => x.data === hoje)?.estado).toBe('parcial');
  });

  it('reimportar reconcilia operador, valor e dia; vínculo manual sobrevive ao mesmo login', async () => {
    await db.query(`update public.diario_recebimentos set operador_id = '${manual}', operador_usuario = 'SEM_CADASTRO', visto = true where id_baixa = '12'`);
    const r = await importar([
      linha({ id: '11', data: dia(-1), total: 1500, op: 'BIA', opId: bia }),       // trocou de dono e de valor
      linha({ id: '12', data: hoje, total: 2000, op: 'SEM_CADASTRO', opId: null }), // mesmo login, sem match: mantém o manual
      linha({ id: '777', data: dia(-11), total: 5992 }),                             // ERP mudou a data
    ], { inicio: dia(-12) });
    expect(r.diario.atualizados).toBe(2);
    const d = await diario();
    expect(d.find(x => x.id_baixa === '11')).toMatchObject({ operador_id: bia, operador_usuario: 'BIA', valor_recebido: '15.00', visto: false });
    expect(d.find(x => x.id_baixa === '12')).toMatchObject({ operador_id: manual });
    expect(d.filter(x => x.id_baixa === '777')).toEqual([expect.objectContaining({ dia_referencia: dia(-11) })]);
    expect(r.diario.novos_por_operador).toEqual([expect.objectContaining({ operadorId: bia, novosPagamentos: 1 })]);
  });

  it('conferir aponta o que o banco tem e o arquivo não trouxe, e o que não tem Id.Baixa', async () => {
    await db.query(`insert into public.diario_recebimentos (empresa_id, operador_usuario, dia_referencia, chave_unica, lote_id, valor_recebido)
                    values ('${empresa}', 'ANA', '${dia(-1)}', 'x||BOLETO|100|', gen_random_uuid(), 100)`);
    const c = await rpc<Record<string, { data: string; quantidade: number }[]>>('conferir', { empresa, inicio: dia(-1), fim: hoje, ids: ['11'] });
    expect(c.ausentes_diretoria).toEqual([expect.objectContaining({ data: hoje, quantidade: 1 })]);
    expect(c.ausentes_diario).toEqual([expect.objectContaining({ data: hoje, quantidade: 1 })]);
    expect(c.sem_id_diario).toEqual([expect.objectContaining({ data: dia(-1), quantidade: 1 })]);
  });

  it('remover_sem_id apaga a linha que não é do 945; remover_ausentes apaga o que sumiu do ERP', async () => {
    const r = await importar([linha({ id: '11', data: dia(-1), total: 1500, op: 'BIA', opId: bia })],
      { inicio: dia(-1), extra: { remover_sem_id: true, remover_ausentes: true } });
    expect(r.diario).toMatchObject({ removidos_sem_id: 1, removidos_ausentes: 1 });
    expect(r.removidos).toBe(1);
    const d = await diario();
    expect(d.some(x => x.id_baixa === null && x.dia_referencia === dia(-1))).toBe(false);
    expect(d.some(x => x.id_baixa === '12')).toBe(false);
  });

  it('invalidar devolve os dias à exigência', async () => {
    await rpc('invalidar', { empresa, inicio: dia(-3), fim: dia(-3) });
    const cob = await rpc<{ inicio_exigido: string }>('cobertura', { empresa });
    expect(cob.inicio_exigido).toBe(dia(-3));
  });

  it('sem coluna Operador o diário não é tocado', async () => {
    const antes = await diario();
    const r = await importar([linha({ id: '50', data: dia(-3), total: 700 })], { inicio: dia(-3), comDiario: false });
    expect(r.diario).toBeNull();
    expect(await diario()).toEqual(antes);
  });

  it('recusa quem não importa e empresa sem setor Cofen', async () => {
    await expect(rpc('cobertura', { empresa: semCofen })).rejects.toThrow(/Sem permissão/);
    await db.exec(`select set_config('test.importar', '0', false)`);
    await expect(rpc('cobertura', { empresa })).rejects.toThrow(/Sem permissão/);
    await db.exec(`select set_config('test.importar', '1', false)`);
  });
});
