-- ============================================================================
-- Rótulos da trilha + detalhe do monitoramento de uso
-- ============================================================================
--
-- Duas coisas sem relação entre si, na mesma migration porque as duas nasceram
-- da mesma sessão de revisão da aba Logs.
--
-- ## Parte 1 — "NR NR" e "acordo id"
--
-- A trilha vinha gravando frases assim:
--
--   Alterou a titularidade de NR NR 12983305 — Sirlei Stephanie: acordo id
--   Excluiu a titularidade de NR NR 6953334 — Aline Pupim
--
-- Duas falhas somadas:
--
--   • `trg_log_nr_registros` passa `'a titularidade de NR'` como nome do alvo, e
--     a coluna de rótulo `nr_value` JÁ recebe o prefixo `NR ` dentro de
--     `fn_log_auditoria`. O "NR" saía duas vezes;
--   • `fn_log_rotulo_campo` não conhecia `acordo_id`, então caía no
--     `replace(campo,'_',' ')` e imprimia o nome da coluna do banco.
--
-- O efeito era pior que feio: linhas de tabelas diferentes ficavam parecidas o
-- bastante para o leitor achar que a trilha estava duplicando eventos.
--
-- Isto corrige daqui para frente. As ~872 linhas já gravadas continuam com o
-- texto antigo — `descricao` é derivada, mas a trilha é somente-acréscimo e não
-- se reescreve por causa de rótulo. Quem normaliza o histórico na leitura é o
-- front (`normalizarDescricao` em `src/lib/logs-catalogo.ts`).
--
-- ## Parte 2 — detalhe por pessoa no monitoramento de uso
--
-- `fn_uso_por_pessoa` exigia uma empresa. A lista de pessoas precisa mostrar as
-- DUAS operações de uma vez para o super_admin, e precisa dizer de qual empresa
-- é cada pessoa. `p_empresa_id` passa a aceitar NULL = todas as que a RLS
-- permitir — quem decide continua sendo a policy de `uso_telas`, não o parâmetro.
-- ============================================================================

-- ── 1. Nome do alvo sem o "NR" repetido ────────────────────────────────────

drop trigger if exists trg_log_nr_registros on public.nr_registros;

-- `'a titularidade do'` em vez de `'a titularidade de NR'`: o `NR ` vem do
-- rótulo, montado a partir de `nr_value`. Resultado:
--   "Alterou a titularidade do NR 12983305 — Sirlei Stephanie: acordo"
create trigger trg_log_nr_registros
  after delete or update on public.nr_registros
  for each row execute function public.fn_log_auditoria(
    'acordo', 'nr_titularidade', 'a titularidade do',
    'nr_value,operador_nome', '', 'empresa_id', 'aviso'
  );

-- ── 2. Campos que faltavam no dicionário ───────────────────────────────────
--
-- Só acrescenta entradas; nenhuma linha existente muda de significado. O `ELSE`
-- continua sendo a rede para campo novo — imprime o nome da coluna, que é feio
-- mas nunca vazio.

create or replace function public.fn_log_rotulo_campo(p_campo text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  SELECT CASE p_campo
    WHEN 'nome_cliente'       THEN 'cliente'
    WHEN 'nr_cliente'         THEN 'NR'
    WHEN 'valor'              THEN 'valor'
    WHEN 'valor_total'        THEN 'valor total'
    WHEN 'vencimento'         THEN 'vencimento'
    WHEN 'status'             THEN 'status'
    WHEN 'tipo'               THEN 'tipo'
    WHEN 'tipo_vinculo'       THEN 'Direto/Extra'
    WHEN 'parcelas'           THEN 'parcelas'
    WHEN 'numero_parcela'     THEN 'número da parcela'
    WHEN 'observacoes'        THEN 'observações'
    WHEN 'operador_id'        THEN 'operador'
    WHEN 'setor_id'           THEN 'setor'
    WHEN 'equipe_id'          THEN 'equipe'
    WHEN 'lider_id'           THEN 'líder'
    WHEN 'instituicao'        THEN 'instituição'
    WHEN 'estado_uf'          THEN 'estado'
    WHEN 'data_pagamento'     THEN 'data de pagamento'
    WHEN 'pago_em'            THEN 'pago em'
    WHEN 'usou_quarenta_pct'  THEN 'usou 40%'
    WHEN 'tag_ids'            THEN 'tags'
    WHEN 'perfil'             THEN 'cargo'
    WHEN 'ativo'              THEN 'ativo'
    WHEN 'situacao'           THEN 'situação'
    WHEN 'arquivado'          THEN 'arquivado'
    WHEN 'desligado_em'       THEN 'desligamento'
    WHEN 'permissoes'         THEN 'permissões'
    WHEN 'meta_valor'         THEN 'meta de valor'
    WHEN 'meta_acordos'       THEN 'meta de acordos'
    WHEN 'pct'                THEN 'percentual'
    WHEN 'pct_comissao'       THEN 'percentual de comissão'
    WHEN 'pago'               THEN 'pagamento'
    WHEN 'nivel'              THEN 'nível de acesso'
    WHEN 'conteudo'           THEN 'conteúdo'
    WHEN 'nome'               THEN 'nome'
    WHEN 'email'              THEN 'e-mail'
    WHEN 'usuario'            THEN 'usuário'
    WHEN 'cor'                THEN 'cor'
    WHEN 'escopo'             THEN 'escopo'
    WHEN 'referencia_id'      THEN 'referência'
    WHEN 'responsavel_id'     THEN 'responsável'
    WHEN 'categoria'          THEN 'categoria'
    WHEN 'mensagem'           THEN 'mensagem'
    -- Novos: `acordo_id` era o que imprimia "acordo id" na titularidade de NR.
    WHEN 'acordo_id'          THEN 'acordo'
    WHEN 'acordo_grupo_id'    THEN 'grupo de parcelas'
    WHEN 'nr_value'           THEN 'NR'
    WHEN 'operador_nome'      THEN 'operador'
    WHEN 'vinculo_operador_id' THEN 'operador do vínculo'
    WHEN 'empresa_id'         THEN 'empresa'
    WHEN 'usuario_id'         THEN 'usuário'
    WHEN 'treinamento_inicio' THEN 'início do treinamento'
    WHEN 'foto_url'           THEN 'foto'
    WHEN 'foto_receptivo_url' THEN 'foto do Receptivo'
    WHEN 'alternativo'        THEN 'setor alternativo'
    WHEN 'data_cadastro'      THEN 'data de cadastro'
    WHEN 'whatsapp'           THEN 'WhatsApp'
    ELSE replace(p_campo, '_', ' ')
  END;
$function$;

-- ── 3. Uso por pessoa: as duas empresas de uma vez ─────────────────────────
--
-- DROP antes do CREATE: o retorno ganha `empresa_id`/`empresa_nome`, e
-- `create or replace` não muda a assinatura de retorno de uma função que devolve
-- TABLE — o PostgreSQL recusa com 42P13.

drop function if exists public.fn_uso_por_pessoa(uuid, date, date, text);

create or replace function public.fn_uso_por_pessoa(
  p_empresa_id uuid,          -- NULL = todas as empresas que a RLS permitir
  p_desde      date,
  p_ate        date,
  p_cargo      text default null
)
returns table (
  usuario_id    uuid,
  nome          text,
  cargo         text,
  empresa_id    uuid,
  empresa_nome  text,
  aberturas     bigint,
  segundos      bigint,
  dias_ativos   bigint,
  telas_usadas  bigint,
  ultimo_em     timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  -- SECURITY INVOKER: a policy de `uso_telas` decide o que aparece. Com NULL em
  -- `p_empresa_id`, o administrador continua vendo só a própria empresa porque a
  -- policy o restringe — o parâmetro amplia o pedido, nunca o direito.
  select u.usuario_id,
         coalesce(p.nome, '(removido)') as nome,
         -- Cargo da LINHA, não do perfil: promover alguém não pode reescrever o
         -- histórico dele como se sempre tivesse sido líder.
         mode() within group (order by u.cargo) as cargo,
         u.empresa_id,
         coalesce(e.nome, '—')          as empresa_nome,
         sum(u.aberturas)::bigint       as aberturas,
         sum(u.segundos)::bigint        as segundos,
         count(distinct u.dia)::bigint  as dias_ativos,
         count(distinct u.tela)::bigint as telas_usadas,
         max(u.ultimo_em)               as ultimo_em
    from public.uso_telas u
    left join public.perfis   p on p.id = u.usuario_id
    left join public.empresas e on e.id = u.empresa_id
   where (p_empresa_id is null or u.empresa_id = p_empresa_id)
     and u.dia between p_desde and p_ate
     and (p_cargo is null or u.cargo = p_cargo)
   -- Agrupa por (usuário, empresa): a mesma pessoa não existe em duas empresas
   -- (perfis tem PK no id de auth.users), mas agrupar pela empresa mantém a
   -- coluna honesta em vez de escolher uma arbitrariamente.
   group by u.usuario_id, p.nome, u.empresa_id, e.nome
   order by sum(u.segundos) desc, sum(u.aberturas) desc;
$function$;

revoke all on function public.fn_uso_por_pessoa(uuid, date, date, text) from public;
grant execute on function public.fn_uso_por_pessoa(uuid, date, date, text) to authenticated;

-- ── 4. Detalhe de UMA pessoa ───────────────────────────────────────────────
--
-- Alimenta a janela que abre ao clicar no nome: em quais telas a pessoa esteve,
-- quantas vezes entrou em cada e quanto tempo ficou.

create or replace function public.fn_uso_detalhe_pessoa(
  p_usuario_id uuid,
  p_desde      date,
  p_ate        date
)
returns table (
  tela        text,
  aberturas   bigint,
  segundos    bigint,
  dias        bigint,
  primeiro_em timestamptz,
  ultimo_em   timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select u.tela,
         sum(u.aberturas)::bigint      as aberturas,
         sum(u.segundos)::bigint       as segundos,
         count(distinct u.dia)::bigint as dias,
         min(u.primeiro_em)            as primeiro_em,
         max(u.ultimo_em)              as ultimo_em
    from public.uso_telas u
   where u.usuario_id = p_usuario_id
     and u.dia between p_desde and p_ate
   group by u.tela
   order by sum(u.segundos) desc;
$function$;

/** Série diária de UMA pessoa, para o gráfico da janela de detalhe. */
create or replace function public.fn_uso_detalhe_pessoa_dias(
  p_usuario_id uuid,
  p_desde      date,
  p_ate        date
)
returns table (
  dia       date,
  aberturas bigint,
  segundos  bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $function$
  select u.dia,
         sum(u.aberturas)::bigint as aberturas,
         sum(u.segundos)::bigint  as segundos
    from public.uso_telas u
   where u.usuario_id = p_usuario_id
     and u.dia between p_desde and p_ate
   group by u.dia
   order by u.dia;
$function$;

revoke all on function public.fn_uso_detalhe_pessoa(uuid, date, date)      from public;
revoke all on function public.fn_uso_detalhe_pessoa_dias(uuid, date, date) from public;
grant execute on function public.fn_uso_detalhe_pessoa(uuid, date, date)      to authenticated;
grant execute on function public.fn_uso_detalhe_pessoa_dias(uuid, date, date) to authenticated;

-- ── 5. Verificação ─────────────────────────────────────────────────────────

do $$
declare
  v_def    text;
  v_rot    text;
  v_qtd    integer;
  v_aviso  text;
begin
  -- O gatilho não pode mais passar o "NR" no nome do alvo.
  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.nr_registros'::regclass
     and t.tgname = 'trg_log_nr_registros';
  if not found then
    raise exception 'gatilho trg_log_nr_registros ausente';
  end if;
  if v_def like '%a titularidade de NR%' then
    raise exception 'o gatilho ainda passa "de NR" — a frase sairia com NR duplicado';
  end if;
  if v_def not like '%a titularidade do%' then
    raise exception 'o gatilho nao recebeu o nome de alvo novo';
  end if;

  -- `acordo_id` tem rótulo próprio.
  select public.fn_log_rotulo_campo('acordo_id') into v_rot;
  if v_rot <> 'acordo' then
    raise exception 'fn_log_rotulo_campo(acordo_id) devolveu "%" em vez de "acordo"', v_rot;
  end if;
  -- E o ELSE continua funcionando para campo desconhecido.
  select public.fn_log_rotulo_campo('campo_que_nao_existe') into v_rot;
  if v_rot <> 'campo que nao existe' then
    raise exception 'a rede do ELSE quebrou: devolveu "%"', v_rot;
  end if;

  -- As funções de uso continuam INVOKER: DEFINER seria contorno da policy.
  select count(*) into v_qtd
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_uso_por_pessoa', 'fn_uso_detalhe_pessoa', 'fn_uso_detalhe_pessoa_dias')
     and p.prosecdef;
  if v_qtd > 0 then
    raise exception '% funcao(oes) de uso estao como SECURITY DEFINER', v_qtd;
  end if;

  -- As três existem com a assinatura esperada.
  select count(*) into v_qtd
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('fn_uso_por_pessoa', 'fn_uso_detalhe_pessoa', 'fn_uso_detalhe_pessoa_dias');
  if v_qtd <> 3 then
    raise exception 'esperava 3 funcoes de uso, encontrei %', v_qtd;
  end if;

  v_aviso := 'Rotulos corrigidos (NR duplicado e acordo_id) para linhas NOVAS; '
             'o historico e normalizado na leitura pelo front. '
             'fn_uso_por_pessoa agora aceita empresa NULL = todas que a RLS permitir.';
  raise notice '%', v_aviso;
end;
$$;
