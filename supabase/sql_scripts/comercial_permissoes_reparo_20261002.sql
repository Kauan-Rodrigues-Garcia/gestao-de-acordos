-- ============================================================================
-- Comercial — devolver aos cargos as permissões que o «Salvar» apagou
-- 02/10/2026
-- ============================================================================
--
-- O defeito: a tela de Permissões gravava o mapa do cargo SÓ com as chaves que
-- ela mostrava. No Comercial ela não mostrava Painel Líder, filtro de setor do
-- Painel Líder, Quartis, Desafios, Tickets, Chat e o alcance do Dashboard — e
-- cada «Salvar» num cargo tirava essas chaves do mapa. Chave ausente = negada:
-- o líder perdeu o Painel Líder (e com ele o filtro de equipes e os Desafios)
-- sem ninguém ter desligado nada.
--
-- O conserto da tela vai no deploy (ela passa a mostrar essas chaves e a
-- preservar o que não mostra). Este script devolve o que JÁ foi apagado:
-- roda `fn_permissoes_semear_empresa` na empresa COMERCIAL, a mesma função
-- que toda migration de permissão roda. Ela:
--   - mantém o valor de toda chave que está gravada (nada que você ligou ou
--     desligou muda);
--   - acrescenta a chave que FALTA, com o padrão do catálogo do cargo
--     (ex.: `ver_painel_lider` ligada para líder, elite, gerência, diretoria).
--
-- Rodar INTEIRO no SQL Editor. A tabela final mostra, por cargo, quais chaves
-- estavam faltando, e as chaves do líder que o pedido citou, depois do reparo.
-- Rodar de novo não muda nada.
--
-- Nascem DESLIGADAS para o líder (padrão do catálogo), e continuam assim:
-- `editar_metas_vendas` (definir a meta) e `excluir_indicacoes`. Ligar pela
-- tela de Permissões depois do deploy — agora elas aparecem lá.
-- ============================================================================

drop table if exists pg_temp._antes;
create temp table _antes as
select cp.cargo,
       count(*)                                    as faltavam,
       string_agg(c.chave, ', ' order by c.chave)  as chaves
  from public.cargos_permissoes cp
  join public.empresas e on e.id = cp.empresa_id
 cross join public.fn_permissoes_catalogo() c
 where cp.empresa_id = '9efd4fee-2a26-4049-b146-921a6046e54a'
   and (c.tenants is null or e.slug = any (c.tenants))
   and not (cp.permissoes ? c.chave)
 group by cp.cargo;

select public.fn_permissoes_semear_empresa('9efd4fee-2a26-4049-b146-921a6046e54a');

-- Resultado (o SQL Editor mostra só a última consulta, então vai tudo nela):
--   «faltava»  — por cargo, quantas e quais chaves voltaram com o padrão;
--   «líder»    — as chaves do pedido, no cargo líder, depois do reparo.
select 'faltava' as tipo, a.cargo as quem, a.faltavam::text as valor, a.chaves as detalhe
  from _antes a
union all
select 'líder', k.chave,
       coalesce((cp.permissoes ->> k.chave)::boolean, false)::text, null
  from public.cargos_permissoes cp
 cross join (values
   ('ver_painel_lider'), ('painel_lider_escopo_setor'), ('painel_lider_sub_quartis'),
   ('analitico_sub_desafios'), ('desafios_escopo_setor'), ('desafios_configurar_setor'),
   ('ver_indicacoes'), ('editar_indicacoes'),
   ('ver_metas_vendas'), ('editar_metas_vendas'),
   ('ver_tickets')
 ) as k(chave)
 where cp.empresa_id = '9efd4fee-2a26-4049-b146-921a6046e54a'
   and cp.cargo = 'lider'
 order by 1 desc, 2;
