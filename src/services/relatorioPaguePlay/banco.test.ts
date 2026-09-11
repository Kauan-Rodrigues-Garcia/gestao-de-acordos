// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const empresa='00000000-0000-4000-8000-000000000001';
const outra='00000000-0000-4000-8000-000000000002';
const usuario='00000000-0000-4000-8000-000000000003';
let db: PGlite; let hoje: string; let ontem: string;
const valores={total:29044,pp:6564,coren:17031,cofen:5449};
const linha=(id: string,data: string)=>({id_baixa:id,data,data_pagamento:data,uf:'PE',acordo:'100',parcela:'1',forma:'Pix',ia:'',...valores});

async function op<T=unknown>(acao: string,dados: Record<string,unknown>): Promise<T> {
  const r=await db.query<{ r:T }>('select public.fn_pp_relatorio($1,$2::jsonb) r',[acao,JSON.stringify(dados)]);
  return r.rows[0].r;
}
const resumo=(modalidade='pagamento')=>op<{quantidade:number;grupos:typeof valores[];primeiraImportacaoPendente:boolean;dias:{data:string;completo:boolean}[]}>('resumo',{empresa,modalidade});
async function abrir(modalidade='pagamento',inicio=ontem,fim=hoje,quantidade=1,totais=valores) {
  return op<string>('abrir',{empresa,modalidade,inicio,fim,quantidade,totais,arquivo:'teste.xlsx'});
}
async function importar(id: string,modalidade='pagamento',data=hoje,inicio=ontem,fim=hoje) {
  const lote=await abrir(modalidade,inicio,fim);
  await op('adicionar',{lote,linhas:[linha(id,data)]});
  return op<{inseridos:number;ignorados:number}>('concluir',{lote});
}

beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table public.empresas(id uuid primary key,slug text);
    insert into public.empresas values ('${empresa}','pagueplay'),('${outra}','bookplay');
    create function public.fn_can_access_empresa(id uuid) returns boolean language sql as $$ select id='${empresa}'::uuid $$;
    create function public.fn_user_tem(k text) returns boolean language sql as $$ select coalesce(current_setting('test.permitido',true),'sim')='sim' $$;
    grant usage on schema public,auth to authenticated;
    grant select on public.empresas to authenticated;
    select set_config('test.uid','${usuario}',false);
  `);
  await db.exec(readFileSync('supabase/migrations/20260911222903_relatorio_pagueplay_diretoria.sql','utf8'));
  await db.exec('set role authenticated');
  const d=await db.query<{hoje:string;ontem:string}>("select ((now() at time zone 'America/Sao_Paulo')::date)::text hoje, ((now() at time zone 'America/Sao_Paulo')::date-1)::text ontem");
  hoje=d.rows[0].hoje;ontem=d.rows[0].ontem;
},30000);
afterAll(async()=>{await db?.close();});

describe.sequential('migração executada em Postgres isolado (sem rede)',()=>{
  it('nega usuário sem autenticação, outra empresa e permissão revogada',async()=>{
    await expect(op('resumo',{empresa:outra,modalidade:'pagamento'})).rejects.toThrow('Sem acesso');
    await db.query("select set_config('test.uid','',false)");
    await expect(resumo()).rejects.toThrow('Autenticação');
    await db.query("select set_config('test.uid',$1,false)",[usuario]);
    await db.query("select set_config('test.permitido','nao',false)");
    await expect(resumo()).rejects.toThrow('Sem acesso');
    await db.query("select set_config('test.permitido','sim',false)");
  });
  it('não permite contornar a RPC escrevendo direto na tabela',async()=>{
    await expect(db.exec('delete from public.pp_relatorio_pagamentos')).rejects.toThrow('permission denied');
  });
  it('impede só hoje na primeira importação de cada modalidade',async()=>{
    await expect(abrir('pagamento',hoje,hoje)).rejects.toThrow('ontem e hoje');
    await expect(abrir('conciliacao',hoje,hoje)).rejects.toThrow('ontem e hoje');
  });
  it('lote parcial não aparece no relatório nem libera o dia',async()=>{
    const lote=await abrir();
    await op('adicionar',{lote,linhas:[linha('1',hoje)]});
    const r=await resumo();expect(r.quantidade).toBe(0);expect(r.primeiraImportacaoPendente).toBe(true);
    await op('cancelar',{lote});
  });
  it('confere quantidade e centavos antes de promover; erro não grava nada',async()=>{
    const lote=await abrir('pagamento',ontem,hoje,2);
    await op('adicionar',{lote,linhas:[linha('1',hoje)]});
    await expect(op('concluir',{lote})).rejects.toThrow('não conferem');
    expect((await resumo()).quantidade).toBe(0);await op('cancelar',{lote});
  });
  it('grava uma vez, ignora reimportação idêntica e separa conciliação',async()=>{
    expect(await importar('1')).toEqual({inseridos:1,ignorados:0});
    expect(await importar('1')).toEqual({inseridos:0,ignorados:1});
    expect((await resumo()).grupos[0]).toMatchObject(valores);
    expect((await resumo()).primeiraImportacaoPendente).toBe(false);
    expect((await resumo('conciliacao')).quantidade).toBe(0);
    expect((await resumo('conciliacao')).primeiraImportacaoPendente).toBe(true);
  });
  it('permite só hoje após primeira conclusão e não exclui pagamentos anteriores',async()=>{
    expect(await importar('2','pagamento',hoje,hoje,hoje)).toEqual({inseridos:1,ignorados:0});
    expect((await resumo()).quantidade).toBe(2);
  });
  it('rejeita dados divergentes para Id.Baixa existente, inclusive só um centavo',async()=>{
    const alterados={...valores,total:valores.total+1};
    const lote=await abrir('pagamento',hoje,hoje,1,alterados);
    await op('adicionar',{lote,linhas:[{...linha('1',hoje),...alterados}]});
    await expect(op('concluir',{lote})).rejects.toThrow('já salvo com dados diferentes');
    expect((await resumo()).quantidade).toBe(2);await op('cancelar',{lote});
  });
  it('um bloco repetido e uma confirmação repetida são idempotentes',async()=>{
    const lote=await abrir('conciliacao');const linhas=[linha('1',hoje)];
    await op('adicionar',{lote,linhas});await op('adicionar',{lote,linhas});
    const a=await op('concluir',{lote});expect(await op('concluir',{lote})).toEqual(a);
    expect((await resumo('conciliacao')).quantidade).toBe(1);
  });
  it('marca ontem sem recebimentos como coberto e hoje como em andamento',async()=>{
    const r=await resumo();
    expect(r.dias.find(d=>d.data===ontem)?.completo).toBe(true);
    expect(r.dias.find(d=>d.data===hoje)?.completo).toBe(false);
  });
  it('recuperação histórica não libera primeira atualização de hoje',async()=>{
    await op('excluir',{empresa,modalidade:'pagamento',mes:null});
    await importar('99','pagamento','2026-01-10','2026-01-01','2026-01-31');
    expect((await resumo()).primeiraImportacaoPendente).toBe(true);
    expect((await resumo()).quantidade).toBe(1);
  });
  it('exclusão por mês remove somente a competência e preserva outra modalidade',async()=>{
    await importar('3');
    expect(await op('excluir',{empresa,modalidade:'pagamento',mes:'2026-01'})).toBe(1);
    expect((await resumo()).quantidade).toBe(1);
    expect((await resumo('conciliacao')).quantidade).toBe(1);
  });
  it('exclusão geral invalida lote aberto e reinicia o controle diário',async()=>{
    const lote=await abrir();await op('adicionar',{lote,linhas:[linha('4',hoje)]});
    await op('excluir',{empresa,modalidade:'pagamento',mes:null});
    await expect(op('concluir',{lote})).rejects.toThrow('Lote indisponível');
    const r=await resumo();expect(r.quantidade).toBe(0);expect(r.dias).toEqual([]);expect(r.primeiraImportacaoPendente).toBe(true);
    expect((await resumo('conciliacao')).quantidade).toBe(1);
  });
});
