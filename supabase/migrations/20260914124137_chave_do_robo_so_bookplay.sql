-- ═══════════════════════════════════════════════════════════════════════════
-- A chave do robô é só da BookPlay
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O contrato «catálogo TypeScript ↔ catálogo SQL» acusou: eu declarei a mesma
-- permissão de dois jeitos. No TypeScript ela nasceu com `tenants: ['bookplay']`
-- e no SQL com `NULL` — que significa TODOS os tenants.
--
-- O certo é BookPlay: o relatório 59 é o ERP dela. Oferecer a chave na
-- PaguePlay seria pintar no painel um interruptor que não aciona nada lá — o
-- defeito que os testes de contrato existem para impedir.
--
-- Escrita: nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

create or replace function public.fn_permissoes_catalogo()
returns table(chave text, tenants text[], padrao text[], explicita boolean)
language sql
immutable
set search_path to ''
as $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_robo_59_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    -- Importar o relatorio 59 sem ser super_admin. So BookPlay: o 59 e o ERP
    -- dela. `padrao` vazio e `explicita = true` — ninguem nasce com a chave, e
    -- nem o acesso total do administrador a concede.
    ('mestre_importar_automatico', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], true)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

commit;
