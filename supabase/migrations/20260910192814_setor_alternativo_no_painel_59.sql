-- ─────────────────────────────────────────────────────────────────────────────
-- O setor alternativo entra no painel do 59 — por fora do total
--
-- ── O que é um setor alternativo ─────────────────────────────────────────────
-- Um setor que não cobra: ele CLONA o recebimento de gente que já pertence a
-- outros setores. `Marília Digital`, `Treinamento` e `Treinamento Marília` são
-- os três da BookPlay. Por isso:
--
--   • não têm carteira no 59, e portanto não têm `CodGrupoFiltro` — some da aba
--     Códigos, que passa a listar só quem pode ter código;
--   • o valor deles NÃO soma no total. Somar contaria o mesmo dinheiro duas
--     vezes: uma no setor que o cobrou, outra no alternativo que o espelha.
--
-- ── Como o valor é montado ───────────────────────────────────────────────────
-- Pelas PESSOAS, não pelo carimbo do relatório — é a mesma régua que o
-- analítico já usa (`setorSomaPorUsuarios`, em `escopoAnalitico.ts`): quem é do
-- setor, mais quem está clonado nele.
--
-- `conta_recebimento` é respeitado: clone com a caixinha desligada aparece na
-- equipe e não entra no dinheiro. Ausente vale `true`, como no resto do
-- sistema. Hoje nenhum dos três tem clone desligado — a regra está aqui porque
-- é a certa, não porque muda algum número agora.
--
-- Medido em setembro/2026:
--
--     Marília Digital ....... 15 pessoas · 613 linhas · R$ 89.289,98
--     Treinamento ...........  5 pessoas ·  88 linhas · R$ 16.256,13
--     Treinamento Marília ...  8 pessoas ·  64 linhas · R$ 13.970,44
--
-- ── Por que uma função separada, e não um campo a mais nas existentes ────────
-- Porque a separação é a própria garantia. `fn_mestre_diretoria_setores` calcula
-- `total_setores` como `sum(valor) from cards`; bastaria o alternativo entrar
-- naquele CTE para o total inchar em silêncio, e ninguém notaria até a
-- porcentagem passar de 100%.
--
-- Com uma função à parte, o total não tem como ser contaminado — não é
-- disciplina de quem escreve, é impossibilidade.
--
-- ── O que o alternativo NÃO tem ──────────────────────────────────────────────
-- Carteira, `integral_recebido` e `movido_para_ca`: os três dependem do vínculo
-- carteira↔setor, que ele não tem. Vêm zerados de propósito, para o card poder
-- reusar o mesmo componente sem inventar número.
--
-- Meta e foto NÃO vêm daqui: a tela já lê as duas por `setor_id`, para todos os
-- setores da empresa, e o alternativo entra nessa leitura sem código novo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_mestre_diretoria_alternativos(
  p_empresa_id uuid,
  p_mes        text,
  p_dia_corte  integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '20s'
AS $function$
declare
  v_mes     date;
  v_mes_ant date;
  v_ult_dia integer;
  v_corte   integer;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_res     jsonb;
begin
  if not (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id)) then
    raise exception 'Sem acesso a esta empresa.';
  end if;
  if p_mes !~ '^\d{4}-\d{2}$' then
    raise exception 'mes invalido: % (esperado yyyy-MM)', p_mes;
  end if;

  v_mes     := (p_mes || '-01')::date;
  v_mes_ant := (v_mes - interval '1 month')::date;
  v_ult_dia := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_corte   := coalesce(
    p_dia_corte,
    case when date_trunc('month', v_hoje) = v_mes
         then extract(day from v_hoje)::integer else v_ult_dia end);
  v_corte   := greatest(1, least(v_corte, v_ult_dia));

  with
  alt as (
    select s.id, s.nome, s.foto_url
      from setores s
     where s.empresa_id = p_empresa_id
       and s.alternativo
       and s.ativo is not false
  ),
  -- Quem é do setor, mais quem está clonado nele. Mesma regra do analítico.
  gente as (
    select a.id as setor_id, p.id as operador_id
      from alt a
      join perfis p on p.setor_id = a.id
    union
    select a.id, c.operador_id
      from alt a
      join equipes q on q.setor_id = a.id
      join equipe_operadores_clones c on c.equipe_id = q.id
     -- Clone com a caixinha desligada trabalha aqui e o dinheiro é de outro.
     where coalesce(c.conta_recebimento, true)
  ),
  linhas as (
    select r.operador_id, r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes
       and r.operador_id is not null
       and (p_dia_corte is null or extract(day from r.dt_pgto) <= v_corte)
  ),
  linhas_ant as (
    select r.operador_id, r.recebido
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
     where r.empresa_id = p_empresa_id
       and r.mes = v_mes_ant
       and r.operador_id is not null
       and extract(day from r.dt_pgto) <= v_corte
  ),
  soma as (
    select g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas,
           count(distinct l.operador_id)::bigint       operadores
      from gente g
      left join linhas l on l.operador_id = g.operador_id
     group by g.setor_id
  ),
  soma_ant as (
    select g.setor_id,
           coalesce(sum(l.recebido), 0)::numeric(14,2) valor,
           count(l.recebido)::bigint                   linhas
      from gente g
      left join linhas_ant l on l.operador_id = g.operador_id
     group by g.setor_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'setor_id',          a.id,
           'setor_nome',        a.nome,
           'foto_url',          a.foto_url,
           'valor',             coalesce(s.valor, 0),
           'linhas',            coalesce(s.linhas, 0),
           'operadores',        coalesce(s.operadores, 0),
           -- Quantas pessoas o setor tem, tenham elas recebido ou não. Sem isto
           -- um setor de treinamento sem recebimento no mês pareceria vazio.
           'pessoas',           (select count(*) from gente g where g.setor_id = a.id),
           'valor_anterior',    coalesce(sa.valor, 0),
           'tem_anterior',      coalesce(sa.linhas, 0) > 0,
           -- Zerados de propósito: dependem do vínculo carteira↔setor, que o
           -- alternativo não tem. Existem para o card reusar o componente.
           'carteiras',         0,
           'tem_grupo',         false,
           'integral_recebido', 0,
           'movido_para_ca',    0
         ) order by coalesce(s.valor, 0) desc), '[]'::jsonb)
    into v_res
    from alt a
    left join soma     s  on s.setor_id  = a.id
    left join soma_ant sa on sa.setor_id = a.id;

  return v_res;
end;
$function$;

COMMENT ON FUNCTION public.fn_mestre_diretoria_alternativos(uuid, text, integer) IS
  'Os setores alternativos do 59, somados PELAS PESSOAS (membros + clones que '
  'contam). Funcao separada de proposito: o valor deles nao pode entrar em '
  'total_setores nem em total_empresa, porque espelha dinheiro que outro setor '
  'ja cobrou.';

REVOKE ALL ON FUNCTION public.fn_mestre_diretoria_alternativos(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mestre_diretoria_alternativos(uuid, text, integer) TO authenticated;

-- ═══ A aba Códigos deixa de listar alternativo ══════════════════════════════
--
-- Setor alternativo não tem carteira no 59, então não tem `CodGrupoFiltro` para
-- reivindicar. Deixá-lo na lista convidaria alguém a preencher um código que
-- pertence a outro setor — e o índice único recusaria, mas depois de a pessoa
-- ter procurado o número.

CREATE OR REPLACE FUNCTION public.fn_setores_codigos_erp(p_empresa_id uuid)
RETURNS TABLE (
  setor_id     uuid,
  setor_nome   text,
  ativo        boolean,
  codigo_erp   text,
  carteira     text,
  carteira_ok  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.nome, s.ativo, s.codigo_erp,
         g.nome_grupo_filtro,
         (s.codigo_erp IS NOT NULL AND g.cod_grupo_filtro IS NOT NULL)
    FROM public.setores s
    LEFT JOIN public.mestre_grupos g
           ON g.empresa_id = s.empresa_id
          AND g.cod_grupo_filtro = s.codigo_erp
   WHERE s.empresa_id = p_empresa_id
     AND s.alternativo IS NOT TRUE
     AND public.fn_can_access_empresa(s.empresa_id)
   ORDER BY s.ativo DESC, s.nome;
$function$;

COMMENT ON FUNCTION public.fn_setores_codigos_erp(uuid) IS
  'Os setores da empresa que PODEM ter codigo do 59, com o codigo e a carteira '
  'que ele encontra. Alternativo fica de fora: ele clona recebimento de gente '
  'de outros setores e nao tem carteira propria.';
