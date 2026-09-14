-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 3: que equipe é cada subgrupo do 59 — perguntando às PESSOAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fase 3 do `docs/PLANO-SINCRONIZACAO-59.md`.
--
-- ## O gargalo
--
-- Metade do dinheiro do 59 não chega às equipes porque o `subgrupo_equipe` do
-- ERP não está amarrado a nenhuma equipe do sistema. Em setembro/2026: 77
-- subgrupos, 18 vinculados, R$ 934.860,88 sem equipe.
--
-- ## O plano original estava errado, e foi medido antes de virar código
--
-- O combinado era «o 58 do setor identifica as equipes e vincula». Na prática
-- isso vira casar `subgrupo_equipe` com `equipes.nome` — e não funciona:
--
--   casam por nome exato, dentro do setor .... 3 de 34
--   casam por «contém» ....................... 4 de 34
--
-- Pior: os que casam trazem armadilha. `EQUIPE DANIELE` tem DOIS candidatos,
-- `DIGITAL (DANIELE)` e `MANUAL (DANIELE)`. Escolher um no escuro é pior que
-- não escolher.
--
-- ## O sinal certo são as pessoas
--
-- Quem recebeu naquele subgrupo já tem equipe no sistema. Olhando de quem é o
-- dinheiro, os mesmos 34 viram **18 sugestões fortes** — R$ 745.618,13 de
-- R$ 934.860,88. E o método acerta onde o nome não tinha chance:
--
--   EQUIPE DOUGLAS ........... → HIBRIDO ............. 100%
--   ELLEN 2°TURNO ............ → SEGUNDO TURNO ....... 100%
--   EQUIPE DANIELE ........... → MANUAL (DANIELE) .... 100%  (desfaz o empate)
--   EQUIPE LUAN E GABRIELLY .. → Luan/ Gaby ..........  99,2%
--   DIGITAL DIURNO ........... → DIGITAL (DANIELE) ... 100%
--
-- A equipe de cada pessoa vem de `composicao_mes`, o retrato congelado daquele
-- mês: quem mudou de equipe depois não reescreve a sugestão de um mês fechado.
--
-- ## Sugestão não é vínculo
--
-- Esta função só LÊ. Quem grava é `fn_mestre_vincular_equipe`, que já existia,
-- disparada pela tela depois de alguém confirmar.
--
-- A tela pré-marca apenas o que é seguro: mesmo setor, duas pessoas ou mais e
-- concentração acima de 90%. O resto aparece desmarcado, com o motivo à vista —
-- com uma pessoa só, «100%» significa apenas que existe uma pessoa, e em
-- setembro esses são todos casos de gente emprestada de outro setor, entre
-- R$ 200 e R$ 600.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

create or replace function public.fn_mestre_equipes_sugeridas(
  p_empresa_id uuid,
  p_mes        text,
  p_minimo     numeric default 0.8
)
returns table(
  cod_grupo_filtro  text,
  nome_subgrupo     text,
  carteira          text,
  setor_id          uuid,
  setor_nome        text,
  valor             numeric,
  linhas            bigint,
  pessoas           bigint,
  equipe_id         uuid,
  equipe_nome       text,
  equipe_setor_id   uuid,
  equipe_setor_nome text,
  concentracao      numeric,
  pessoas_na_equipe bigint,
  mesmo_setor       boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ref as (select ((p_mes || '-01')::date) as d),
  -- So o que ainda NAO tem vinculo. Subgrupo ja vinculado nao vira sugestao —
  -- a tela existe para o que falta, nao para reconfirmar o que esta feito.
  linhas as (
    select r.cod_grupo_filtro as cod, r.subgrupo_equipe, r.nome_grupo_filtro,
           r.operador_id, r.recebido,
           g.setor_id as setor_da_carteira
      from mestre_recebimentos r
      join mestre_lotes l on l.id = r.lote_id and l.estado = 'vigente'
      join mestre_grupos g
        on g.empresa_id = r.empresa_id
       and g.cod_grupo_filtro = r.cod_grupo_filtro
       and g.estado = 'vinculado'
       and g.setor_id is not null
      left join mestre_equipes me
        on me.empresa_id = r.empresa_id
       and me.cod_grupo_filtro = r.cod_grupo_filtro
       and me.nome_subgrupo = r.subgrupo_equipe
     where r.empresa_id = p_empresa_id
       and r.mes = (select d from ref)
       and fn_mestre_conta_na_meta(r.colchao, r.dt_pgto)
       and me.equipe_id is null
       and btrim(r.subgrupo_equipe) <> ''
       and fn_mestre_e_equipe(r.subgrupo_equipe)
  ),
  -- `setor_da_carteira` entra no group by, e nao num max(): ele e constante por
  -- carteira, e `uuid` nao tem max() no Postgres.
  totais as (
    select cod, subgrupo_equipe, setor_da_carteira as setor_id,
           max(nome_grupo_filtro) as carteira,
           sum(recebido) as valor,
           count(*)::bigint as linhas,
           count(distinct operador_id)::bigint as pessoas
      from linhas group by 1, 2, 3
  ),
  /*
   * O sinal e a GENTE, nao o nome.
   *
   * Casar `subgrupo_equipe` com `equipes.nome` nao funciona: de 34 subgrupos sem
   * vinculo em setembro/2026, so 3 casavam por nome. «EQUIPE DOUGLAS» e a equipe
   * «HIBRIDO»; «ELLEN 2°TURNO» e «SEGUNDO TURNO»; e «EQUIPE DANIELE» tinha DOIS
   * candidatos por nome.
   *
   * Olhando de quem sao os recebimentos, 18 dos 34 ganham sugestao forte —
   * R$ 745.618,13 de R$ 934.860,88. A equipe vem de `composicao_mes`, que e o
   * retrato congelado daquele mes: quem mudou de equipe depois nao reescreve a
   * sugestao de um mes fechado.
   */
  por_equipe as (
    select l.cod, l.subgrupo_equipe, cm.equipe_id,
           sum(l.recebido) as valor,
           count(distinct l.operador_id)::bigint as pessoas
      from linhas l
      join composicao_mes cm
        on cm.empresa_id = p_empresa_id and cm.mes = p_mes
       and cm.operador_id = l.operador_id
     where cm.equipe_id is not null
     group by 1, 2, 3
  ),
  melhor as (
    select distinct on (cod, subgrupo_equipe)
           cod, subgrupo_equipe, equipe_id, valor as valor_da_equipe, pessoas
      from por_equipe
     order by cod, subgrupo_equipe, valor desc
  )
  select
    t.cod, t.subgrupo_equipe, t.carteira, t.setor_id,
    coalesce(cms.nome, s.nome),
    round(t.valor, 2), t.linhas, t.pessoas,
    m.equipe_id,
    coalesce(cme.nome, e.nome),
    e.setor_id,
    coalesce(cmse.nome, se.nome),
    round(m.valor_da_equipe / nullif(t.valor, 0), 4),
    m.pessoas,
    (e.setor_id is not distinct from t.setor_id)
  from totais t
  join melhor m on m.cod = t.cod and m.subgrupo_equipe = t.subgrupo_equipe
  join equipes e on e.id = m.equipe_id
  left join composicao_mes_equipe cme
    on cme.empresa_id = p_empresa_id and cme.mes = p_mes and cme.equipe_id = m.equipe_id
  left join composicao_mes_setor cms
    on cms.empresa_id = p_empresa_id and cms.mes = p_mes and cms.setor_id = t.setor_id
  left join setores s on s.id = t.setor_id
  left join composicao_mes_setor cmse
    on cmse.empresa_id = p_empresa_id and cmse.mes = p_mes and cmse.setor_id = e.setor_id
  left join setores se on se.id = e.setor_id
  where (fn_user_is_super_admin() or fn_can_access_empresa(p_empresa_id))
    and m.valor_da_equipe / nullif(t.valor, 0) >= coalesce(p_minimo, 0.8)
  order by t.valor desc;
$function$;

comment on function public.fn_mestre_equipes_sugeridas(uuid, text, numeric) is
  'Subgrupos do 59 ainda sem equipe, com a equipe SUGERIDA pelas pessoas que '
  'receberam neles — nao pelo nome. Casar por nome cobria 3 de 34 em setembro; '
  'pelas pessoas, 18. A equipe vem de composicao_mes (congelada no mes). So '
  'leitura: quem vincula e fn_mestre_vincular_equipe, com confirmacao.';

grant execute on function public.fn_mestre_equipes_sugeridas(uuid, text, numeric) to authenticated;

commit;
