-- ═══════════════════════════════════════════════════════════════════════════
-- Uma permissão só para o robô que importa o 59 de hora em hora
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O problema que isto resolve
--
-- `fn_mestre_abrir_lote`, `fn_mestre_inserir_linhas` e `fn_mestre_promover_lote`
-- exigem `fn_user_is_super_admin()`. Um robô rodando num PC de trabalho
-- precisaria, então, de uma senha de super_admin guardada em arquivo — e quem
-- sentasse naquele PC teria poder de apagar o sistema inteiro.
--
-- A chave `mestre_importar_automatico` existe para o robô poder fazer UMA coisa
-- e nada mais. Ver `scripts/robo59/README.md`.
--
-- ## Por que ela é EXPLÍCITA
--
-- Chave explícita não chega por herança de «acesso total» do administrador:
-- alguém precisa ligá-la nominalmente, e a decisão fica registrada. É o mesmo
-- tratamento de `ignorar_fechamento_mes` e `numeros_configurar`, e pelo mesmo
-- motivo — são chaves que, entregues por descuido, mudam dinheiro.
--
-- Aqui o risco específico é este: promover um lote troca o retrato do mês
-- inteiro. Não é coisa que um cargo deva ganhar junto com outras vinte.
--
-- ## A cadeia de catálogo
--
-- `fn_permissoes_catalogo` é uma cadeia de funções `_antes_`, cada uma
-- acrescentando chaves à anterior por UNION ALL. Elas **não** são objetos
-- mortos — o nome com data engana. Acrescentar chave é: congelar a atual num
-- `_antes_` novo e redefinir a de cima unindo o que entrou.
--
-- ## Escrita: nenhuma linha de dado. Nenhum usuário ganha a chave aqui.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

-- 1. Congela o catalogo de hoje.
create or replace function public.fn_permissoes_catalogo_antes_robo_59_20260914()
returns table(chave text, tenants text[], padrao text[], explicita boolean)
language sql
immutable
set search_path to ''
as $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_comissao_por_meta_20260911()
  UNION ALL
  SELECT * FROM (VALUES
    ('metas_comissao_ver',             NULL::TEXT[], ARRAY['lider','elite','gerencia']::TEXT[], false),
    ('metas_comissao_editar',          NULL::TEXT[], ARRAY['gerencia']::TEXT[], false),
    ('metas_comissao_confirmar_setor', NULL::TEXT[], ARRAY['gerencia']::TEXT[], false),
    ('dashboard_comissao',             NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

comment on function public.fn_permissoes_catalogo_antes_robo_59_20260914() is
  'Retrato do catalogo antes da chave mestre_importar_automatico (14/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

-- 2. Acrescenta a chave do robo.
create or replace function public.fn_permissoes_catalogo()
returns table(chave text, tenants text[], padrao text[], explicita boolean)
language sql
immutable
set search_path to ''
as $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_robo_59_20260914()
  UNION ALL
  SELECT * FROM (VALUES
    -- Importar o relatorio 59 sem ser super_admin. `padrao` vazio e
    -- `explicita = true`: ninguem nasce com ela, e nem o acesso total do
    -- administrador a concede — alguem liga nominalmente, para um usuario que
    -- existe so para isso.
    ('mestre_importar_automatico', NULL::TEXT[], ARRAY[]::TEXT[], true)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

-- 3. A primeira das tres RPCs passa a aceitar a chave, alem do super_admin.
--
-- `or` e nao substituicao: quem e super_admin continua importando pela tela,
-- como sempre importou. O que muda e existir um caminho de privilegio minimo
-- para o robo.
--
-- As outras duas sao patchadas em `20260914122912` — elas sao grandes demais
-- para retipar so por causa de uma linha.

create or replace function public.fn_mestre_abrir_lote(
  p_empresa_id uuid, p_mes text, p_arquivo text, p_hash text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id  uuid;
  v_mes date;
begin
  if not (fn_user_is_super_admin() or fn_user_tem('mestre_importar_automatico')) then
    raise exception 'Apenas super_admin pode importar o relatório mestre.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'Mês inválido: %. Esperado aaaa-mm.', p_mes;
  end if;
  v_mes := (p_mes || '-01')::date;

  insert into mestre_lotes (empresa_id, mes, arquivo_nome, arquivo_hash, importado_por_id)
  values (p_empresa_id, v_mes, p_arquivo, p_hash, auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

commit;
