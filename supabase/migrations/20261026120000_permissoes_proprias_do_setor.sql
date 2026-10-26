-- ============================================================================
-- Permissões próprias do setor (26/10/2026)
-- ============================================================================
--
-- ## O pedido
--
-- A Manutenção não usa tudo da cobrança. O operador, o líder e a gerência de lá
-- precisam de permissões diferentes das do resto da empresa, configuráveis pelo
-- painel, com a etiqueta «- Manutenção» («Operador - Manutenção»).
--
-- ## Por que não é um cargo novo
--
-- Um `operador_manutencao` seria um cargo de verdade, e ~40 funções SQL (RLS de
-- acordos, tickets, Pix, metas, push) e mais de cem checagens do front
-- reconhecem operador, líder e gerência pelo NOME do cargo. Cada uma esquecida
-- tiraria a Manutenção da meta, do ranking ou da equipe sem aviso.
--
-- Aqui o cargo continua o mesmo. O que muda é o MAPA de permissões: quem está
-- num setor que tem mapa próprio para o seu cargo usa
--
--     mapa do cargo  ||  mapa do cargo no setor
--
-- (a chave do setor manda; a que ele não tem vem do cargo — chave nova do
-- catálogo continua nascendo pelo cargo, sem semear o setor).
--
-- ## O que muda
--
--   1. `cargos_permissoes_setor` (empresa, setor, cargo, permissoes): as mesmas
--      policies, a auditoria e o sinal `permissoes` de `cargos_permissoes`.
--   2. `fn_permissoes_do_cargo(empresa, cargo, setor)`: o mapa efetivo.
--   3. Os leitores do mapa passam a considerar o setor da pessoa
--      (`perfis.setor_id`): fn_user_tem, fn_user_escopos_por_aba,
--      fn_user_escopo_acordos, fn_perfil_tem, fn_cf_tem, fn_cf_pode_liberar,
--      fn_chat_contatos e fn_multiempresa_definir_empresa. Os corpos partem do
--      que estava em produção em 26/10/2026 (pg_get_functiondef).
--   4. A Manutenção da BookPlay nasce com mapa próprio para Operador, Líder e
--      Gerência, cópia do mapa do cargo — nada muda até alguém mexer no painel.
--
-- Sem linha em `cargos_permissoes_setor`, toda resposta é a de antes.
-- `fn_permissoes_semear_empresa` não muda: semeia o cargo, que é a base.
-- Reaplicável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- ── 1. A tabela ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cargos_permissoes_setor (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID        NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  setor_id      UUID        NOT NULL REFERENCES public.setores (id) ON DELETE CASCADE,
  cargo         TEXT        NOT NULL REFERENCES public.cargos (slug),
  permissoes    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cargos_permissoes_setor_um_por_cargo UNIQUE (setor_id, cargo)
);

CREATE INDEX IF NOT EXISTS cargos_permissoes_setor_empresa
  ON public.cargos_permissoes_setor (empresa_id);

COMMENT ON TABLE public.cargos_permissoes_setor IS
  'Permissões próprias de um cargo num setor («Operador - Manutenção»). Quem está '
  'no setor usa o mapa do cargo com este por cima (fn_permissoes_do_cargo). Ver 20261026120000.';

-- O setor é da empresa da linha, e o cargo é de setor e sem acesso total: num
-- cargo de acesso total o mapa nunca é lido, e cúpula não tem setor.
CREATE OR REPLACE FUNCTION public.fn_cargos_permissoes_setor_valida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.setores s WHERE s.id = NEW.setor_id AND s.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'O setor não pertence a esta empresa.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.cargos c
     WHERE c.slug = NEW.cargo AND c.pertence_a_setor AND NOT c.acesso_total
  ) THEN
    RAISE EXCEPTION 'O cargo % não tem permissões por setor: é de acesso total ou não pertence a setor.', NEW.cargo
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cargos_permissoes_setor_valida() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cargos_permissoes_setor_valida ON public.cargos_permissoes_setor;
CREATE TRIGGER trg_cargos_permissoes_setor_valida
  BEFORE INSERT OR UPDATE OF empresa_id, setor_id, cargo ON public.cargos_permissoes_setor
  FOR EACH ROW EXECUTE FUNCTION public.fn_cargos_permissoes_setor_valida();

-- Os mesmos gatilhos de `cargos_permissoes`.
DROP TRIGGER IF EXISTS trg_cargos_permissoes_setor_updated_at ON public.cargos_permissoes_setor;
CREATE TRIGGER trg_cargos_permissoes_setor_updated_at
  BEFORE UPDATE ON public.cargos_permissoes_setor
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cargos();

DROP TRIGGER IF EXISTS trg_log_cargos_permissoes_setor ON public.cargos_permissoes_setor;
CREATE TRIGGER trg_log_cargos_permissoes_setor
  AFTER INSERT OR DELETE OR UPDATE ON public.cargos_permissoes_setor
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
    'seguranca', 'cargo_permissoes_setor', 'as permissões do cargo no setor', 'cargo', '', 'empresa_id', 'critico');

-- O sinal que o front escuta (`permissoes:<empresa>`): salvar no painel chega a
-- quem está logado na hora, como no mapa do cargo.
DROP TRIGGER IF EXISTS trg_realtime_sinal_ins ON public.cargos_permissoes_setor;
CREATE TRIGGER trg_realtime_sinal_ins
  AFTER INSERT ON public.cargos_permissoes_setor
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_mudou('permissoes');
DROP TRIGGER IF EXISTS trg_realtime_sinal_upd ON public.cargos_permissoes_setor;
CREATE TRIGGER trg_realtime_sinal_upd
  AFTER UPDATE ON public.cargos_permissoes_setor
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_mudou('permissoes');
DROP TRIGGER IF EXISTS trg_realtime_sinal_del ON public.cargos_permissoes_setor;
CREATE TRIGGER trg_realtime_sinal_del
  AFTER DELETE ON public.cargos_permissoes_setor
  REFERENCING OLD TABLE AS antigas
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_realtime_sinal_mudou('permissoes');

-- As mesmas policies de `cargos_permissoes`.
ALTER TABLE public.cargos_permissoes_setor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cargos_permissoes_setor_super_admin_total ON public.cargos_permissoes_setor;
CREATE POLICY cargos_permissoes_setor_super_admin_total ON public.cargos_permissoes_setor
  FOR ALL TO authenticated
  USING ((SELECT public.fn_user_is_super_admin()))
  WITH CHECK ((SELECT public.fn_user_is_super_admin()));

DROP POLICY IF EXISTS cargos_permissoes_setor_select_empresa ON public.cargos_permissoes_setor;
CREATE POLICY cargos_permissoes_setor_select_empresa ON public.cargos_permissoes_setor
  FOR SELECT TO authenticated
  USING (
    (SELECT public.fn_user_acesso_multiempresa())
    OR empresa_id IN (SELECT p.empresa_id FROM public.perfis p WHERE p.id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS cargos_permissoes_setor_admin_write ON public.cargos_permissoes_setor;
CREATE POLICY cargos_permissoes_setor_admin_write ON public.cargos_permissoes_setor
  FOR ALL TO authenticated
  USING (
    empresa_id IN (
      SELECT p.empresa_id FROM public.perfis p
       WHERE p.id = (SELECT auth.uid()) AND p.perfil = ANY (ARRAY['administrador', 'super_admin'])
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargos_permissoes_setor TO authenticated;
GRANT ALL ON public.cargos_permissoes_setor TO service_role;

-- ── 2. O mapa efetivo ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_permissoes_do_cargo(p_empresa UUID, p_cargo TEXT, p_setor UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE((SELECT cp.permissoes FROM public.cargos_permissoes cp
                    WHERE cp.empresa_id = p_empresa AND cp.cargo = p_cargo), '{}'::jsonb)
      || COALESCE((SELECT cs.permissoes FROM public.cargos_permissoes_setor cs
                    WHERE cs.empresa_id = p_empresa AND cs.setor_id = p_setor AND cs.cargo = p_cargo), '{}'::jsonb);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_do_cargo(UUID, TEXT, UUID) IS
  'O mapa de permissões de um cargo para quem está no setor: o do cargo, com o do setor por cima. Ver 20261026120000.';

REVOKE ALL ON FUNCTION public.fn_permissoes_do_cargo(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_permissoes_do_cargo(UUID, TEXT, UUID) TO authenticated, service_role;

-- ── 3. Os leitores ──────────────────────────────────────────────────────────
--
-- Nos que rodam dentro de policy (fn_user_tem, escopos) o setor entra como um
-- LEFT JOIN a mais, sem chamar a função acima: ela é SECURITY DEFINER e não
-- seria embutida na consulta.

CREATE OR REPLACE FUNCTION public.fn_user_tem(p_chave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT p.perfil AS cargo, p.empresa_id, p.id AS usuario_id, p.setor_id
      FROM public.perfis p
     WHERE p.id = (SELECT auth.uid())
  ),
  explicita AS (
    SELECT EXISTS (
      SELECT 1 FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = p_chave AND c.explicita
    ) AS sim
  ),
  excecao AS (
    SELECT pp.permissoes->>p_chave AS valor
      FROM public.perfis_permissoes pp
      JOIN ctx ON pp.usuario_id = ctx.usuario_id
     WHERE pp.permissoes ? p_chave
  ),
  -- O mapa do cargo, com o do setor da pessoa por cima (20261026120000).
  do_cargo AS (
    SELECT COALESCE(cs.permissoes->>p_chave, cp.permissoes->>p_chave) AS valor
      FROM ctx
      LEFT JOIN public.cargos_permissoes cp
             ON cp.empresa_id = ctx.empresa_id AND cp.cargo = ctx.cargo
      LEFT JOIN public.cargos_permissoes_setor cs
             ON cs.empresa_id = ctx.empresa_id AND cs.setor_id = ctx.setor_id AND cs.cargo = ctx.cargo
     WHERE cp.permissoes ? p_chave OR cs.permissoes ? p_chave
  )
  SELECT CASE
    -- 1. Acesso total (cargos.acesso_total), menos o que exige concessao nominal.
    WHEN EXISTS (
           SELECT 1 FROM ctx JOIN public.cargos c ON c.slug = ctx.cargo
            WHERE c.acesso_total
         )
         AND NOT (SELECT sim FROM explicita)
      THEN TRUE
    -- 2. A excecao por pessoa manda sobre o cargo.
    WHEN EXISTS (SELECT 1 FROM excecao)
      THEN COALESCE((SELECT valor FROM excecao)::BOOLEAN, FALSE)
    -- 3. O mapa do cargo (e do setor).
    WHEN EXISTS (SELECT 1 FROM do_cargo)
      THEN COALESCE((SELECT valor FROM do_cargo)::BOOLEAN, FALSE)
    -- 4. Ausente vale negado.
    ELSE FALSE
  END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_user_escopos_por_aba()
 RETURNS TABLE(aba text, escopo integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ctx as (
    select p.perfil as cargo, p.empresa_id, p.id as usuario_id, p.setor_id
      from public.perfis p
     where p.id = (select auth.uid())
  ),
  -- Só é lido se algum `when` do cargo de acesso total chegar a perguntar.
  explicitas as materialized (
    select c.chave from public.fn_permissoes_catalogo() c where c.explicita
  ),
  excecao as materialized (
    select pp.permissoes
      from public.perfis_permissoes pp
      join ctx on pp.usuario_id = ctx.usuario_id
  ),
  -- O mapa do cargo, com o do setor da pessoa por cima (20261026120000).
  do_cargo as materialized (
    select coalesce(cp.permissoes, '{}'::jsonb) || coalesce(cs.permissoes, '{}'::jsonb) as permissoes
      from ctx
      left join public.cargos_permissoes cp
             on cp.empresa_id = ctx.empresa_id and cp.cargo = ctx.cargo
      left join public.cargos_permissoes_setor cs
             on cs.empresa_id = ctx.empresa_id and cs.setor_id = ctx.setor_id and cs.cargo = ctx.cargo
  ),
  niveis(nome, peso) as (
    values ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  ),
  abas as (
    select a.aba, a.chave_aba from public.fn_abas_escopo() a
  ),
  -- A chave da aba (peso nulo) e as quatro chaves de nível de cada aba.
  chaves as (
    select a.aba, a.chave_aba as chave, null::integer as peso
      from abas a where a.chave_aba is not null
    union all
    select a.aba, a.aba || '_escopo_' || n.nome, n.peso
      from abas a cross join niveis n
  ),
  -- Os mesmos quatro passos de `fn_user_tem`, na mesma ordem.
  avaliadas as (
    select k.aba, k.peso,
           case
             when (select c.cargo from ctx c) in ('administrador', 'super_admin')
                  and not exists (select 1 from explicitas e where e.chave = k.chave)
               then true
             when exists (select 1 from excecao x where x.permissoes ? k.chave)
               then coalesce((select x.permissoes ->> k.chave from excecao x
                               where x.permissoes ? k.chave)::boolean, false)
             when exists (select 1 from do_cargo d where d.permissoes ? k.chave)
               then coalesce((select d.permissoes ->> k.chave from do_cargo d
                               where d.permissoes ? k.chave)::boolean, false)
             else false
           end as sim
      from chaves k
  )
  select a.aba,
         case
           -- Aba desligada para este cargo.
           when a.chave_aba is not null
                and not coalesce(bool_or(v.sim) filter (where v.peso is null), false)
             then -1
           else coalesce(max(v.peso) filter (where v.peso is not null and v.sim), -1)
         end
    from abas a
    join avaliadas v on v.aba = a.aba
   group by a.aba, a.chave_aba;
$function$;

CREATE OR REPLACE FUNCTION public.fn_user_escopo_acordos()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT public.fn_user_perfil()     AS cargo,
           public.fn_user_empresa_id() AS empresa_id,
           public.fn_user_setor_id()   AS setor_id
  ),
  -- O mapa do cargo, com o do setor da pessoa por cima (20261026120000).
  mapa AS (
    SELECT COALESCE(cp.permissoes, '{}'::jsonb) || COALESCE(cs.permissoes, '{}'::jsonb) AS permissoes
      FROM ctx
      LEFT JOIN public.cargos_permissoes cp
             ON cp.empresa_id = ctx.empresa_id AND cp.cargo = ctx.cargo
      LEFT JOIN public.cargos_permissoes_setor cs
             ON cs.empresa_id = ctx.empresa_id AND cs.setor_id = ctx.setor_id AND cs.cargo = ctx.cargo
  ),
  -- As abas que leem `acordos`. Analitico e Usuarios ficam de fora: leem outras
  -- tabelas, com RLS propria.
  abas(aba, chave) AS (VALUES
    ('dashboard',        NULL::TEXT),
    ('acordos',          'ver_acordos'),
    ('lixeira',          'ver_lixeira'),
    ('pix',              'ver_pix_automatico'),
    ('painel_lider',     'ver_painel_lider'),
    ('painel_diretoria', 'ver_painel_diretoria')
  ),
  niveis(nome, peso) AS (VALUES
    ('individual', 0), ('equipe', 1), ('setor', 2), ('todos_setores', 3)
  )
  SELECT COALESCE(MAX(CASE
    WHEN (a.chave IS NULL
          OR COALESCE((m.permissoes->>a.chave)::BOOLEAN, FALSE))
     AND COALESCE((m.permissoes->>(a.aba || '_escopo_' || n.nome))::BOOLEAN, FALSE)
    THEN n.peso
  END), 0)
  FROM mapa m CROSS JOIN abas a CROSS JOIN niveis n;
$function$;

CREATE OR REPLACE FUNCTION public.fn_perfil_tem(p_perfil uuid, p_chave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH ctx AS (
    SELECT p.perfil AS cargo, p.empresa_id, p.id AS usuario_id, p.setor_id
      FROM public.perfis p WHERE p.id = p_perfil
  ),
  explicita AS (
    SELECT EXISTS (
      SELECT 1 FROM public.fn_permissoes_catalogo() c
       WHERE c.chave = p_chave AND c.explicita
    ) AS sim
  ),
  excecao AS (
    SELECT pp.permissoes->>p_chave AS valor
      FROM public.perfis_permissoes pp
      JOIN ctx ON pp.usuario_id = ctx.usuario_id
     WHERE pp.permissoes ? p_chave
  ),
  -- O mapa do cargo, com o do setor da pessoa por cima (20261026120000).
  do_cargo AS (
    SELECT m.mapa->>p_chave AS valor
      FROM ctx
      CROSS JOIN LATERAL (SELECT public.fn_permissoes_do_cargo(ctx.empresa_id, ctx.cargo, ctx.setor_id) AS mapa) m
     WHERE m.mapa ? p_chave
  )
  SELECT CASE
    WHEN (SELECT cargo FROM ctx) IN ('administrador', 'super_admin')
         AND NOT (SELECT sim FROM explicita)
      THEN TRUE
    WHEN EXISTS (SELECT 1 FROM excecao)
      THEN COALESCE((SELECT valor FROM excecao)::BOOLEAN, FALSE)
    WHEN EXISTS (SELECT 1 FROM do_cargo)
      THEN COALESCE((SELECT valor FROM do_cargo)::BOOLEAN, FALSE)
    ELSE FALSE
  END;
$function$;

-- O mapa do cargo da pessoa na empresa PEDIDA (acesso multiempresa). O setor só
-- casa quando é dessa empresa — o de outra não tem linha lá.
CREATE OR REPLACE FUNCTION public.fn_cf_tem(p_empresa uuid, p_chave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.fn_user_tem(p_chave)
      OR EXISTS (
        SELECT 1
          FROM public.perfis p
         WHERE p.id = (SELECT auth.uid())
           AND COALESCE((public.fn_permissoes_do_cargo(p_empresa, p.perfil, p.setor_id) ->> p_chave)::BOOLEAN, FALSE)
      );
$function$;

CREATE OR REPLACE FUNCTION public.fn_cf_pode_liberar(p_empresa uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (
        p_empresa = ANY (public.fn_empresas_acessiveis())
        AND (
          public.fn_user_tem('ver_campanha_facil')
          OR EXISTS (
            SELECT 1
              FROM public.perfis p
             WHERE p.id = (SELECT auth.uid())
               AND COALESCE((public.fn_permissoes_do_cargo(p_empresa, p.perfil, p.setor_id) ->> 'ver_campanha_facil')::BOOLEAN, FALSE)
          )
        )
      );
$function$;

CREATE OR REPLACE FUNCTION public.fn_chat_contatos()
 RETURNS TABLE(perfil_id uuid, nome text, usuario text, foto_url text, cargo text, setor_id uuid, setor_nome text, equipe_id uuid, equipe_nome text, empresa_slug text, multiempresa boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
DECLARE
  v_eu              UUID := (SELECT auth.uid());
  v_super           BOOLEAN;
  v_todos           BOOLEAN;
  v_setor           BOOLEAN := FALSE;
  v_equipe          BOOLEAN := FALSE;
  v_cargos_todos    TEXT[];
  v_cargos          TEXT[];
  v_empresas        UUID[];
  v_meus_setores    UUID[] := '{}';
  v_minhas_equipes  UUID[] := '{}';
  v_ver_chat_explicita BOOLEAN;
BEGIN
  -- Mesmo portao de fn_chat_alcanca: quem nao usa o chat nao alcanca ninguem.
  IF v_eu IS NULL OR NOT public.fn_chat_pode_usar() THEN
    RETURN;
  END IF;

  v_super := COALESCE(public.fn_user_is_super_admin(), FALSE);
  v_todos := v_super OR public.fn_user_tem('chat_escopo_todos_setores');
  IF NOT v_todos THEN
    v_setor  := public.fn_user_tem('chat_escopo_setor');
    v_equipe := public.fn_user_tem('chat_escopo_equipe');
    IF NOT (v_setor OR v_equipe) THEN
      RETURN;
    END IF;
  END IF;

  -- Cargos alcancados: uma pergunta por cargo existente, nao por pessoa. Em
  -- duas etapas de proposito — um WHERE sobre `SELECT DISTINCT` seria empurrado
  -- para dentro dele e voltaria a rodar uma vez por perfil.
  IF NOT v_super THEN
    SELECT array_agg(DISTINCT p.perfil::TEXT) INTO v_cargos_todos FROM public.perfis p;
    SELECT COALESCE(array_agg(c.cargo), '{}') INTO v_cargos
      FROM unnest(COALESCE(v_cargos_todos, '{}')) AS c(cargo)
     WHERE public.fn_user_tem('chat_cargo_' || c.cargo);

    SELECT COALESCE(array_agg(emp.id), '{}') INTO v_empresas
      FROM public.empresas emp
     WHERE public.fn_can_access_empresa(emp.id);
  END IF;

  IF v_setor THEN
    SELECT COALESCE(array_agg(s.setor_id), '{}') INTO v_meus_setores
      FROM public.fn_chat_setores_do_perfil(v_eu) s;
  END IF;
  IF v_equipe THEN
    SELECT COALESCE(array_agg(q.equipe_id), '{}') INTO v_minhas_equipes
      FROM public.fn_chat_equipes_do_perfil(v_eu) q;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fn_permissoes_catalogo() cat
     WHERE cat.chave = 'ver_chat' AND cat.explicita
  ) INTO v_ver_chat_explicita;

  RETURN QUERY
  WITH candidatos AS MATERIALIZED (
    SELECT p.id, p.nome, p.usuario, p.foto_url, p.perfil::TEXT AS cargo,
           p.setor_id AS setor_do_perfil, p.empresa_id,
           (p.perfil = 'super_admin' OR COALESCE(p.acesso_multiempresa, FALSE)) AS multiempresa
      FROM public.perfis p
      LEFT JOIN public.chat_config cc ON cc.empresa_id = p.empresa_id
      LEFT JOIN public.perfis_permissoes pp
             ON pp.usuario_id = p.id AND pp.permissoes ? 'ver_chat'
      LEFT JOIN public.cargos_permissoes cp
             ON cp.empresa_id = p.empresa_id AND cp.cargo = p.perfil
            AND cp.permissoes ? 'ver_chat'
      -- O mapa do setor da pessoa manda sobre o do cargo (20261026120000).
      LEFT JOIN public.cargos_permissoes_setor cs
             ON cs.empresa_id = p.empresa_id AND cs.setor_id = p.setor_id AND cs.cargo = p.perfil
            AND cs.permissoes ? 'ver_chat'
     WHERE p.id <> v_eu
       AND COALESCE(p.ativo, TRUE)
       AND NOT COALESCE(p.arquivado, FALSE)
       -- fn_can_access_empresa + chat_cargo_<cargo>, respondidos acima.
       AND (v_super OR p.empresa_id = ANY (v_empresas))
       AND (v_super OR p.perfil::TEXT = ANY (v_cargos))
       -- recebe: fn_chat_pode_usar(p.id) em lote. Mesma regra, mesma ordem
       -- de fn_perfil_tem — ver o cabecalho antes de mexer.
       AND NOT p.chat_bloqueado
       AND (
         p.perfil = 'super_admin'
         OR (
           COALESCE(cc.liberado, FALSE)
           AND CASE
                 WHEN p.perfil IN ('administrador', 'super_admin') AND NOT v_ver_chat_explicita
                   THEN TRUE
                 WHEN pp.usuario_id IS NOT NULL
                   THEN COALESCE((pp.permissoes->>'ver_chat')::BOOLEAN, FALSE)
                 WHEN cs.setor_id IS NOT NULL
                   THEN COALESCE((cs.permissoes->>'ver_chat')::BOOLEAN, FALSE)
                 WHEN cp.empresa_id IS NOT NULL
                   THEN COALESCE((cp.permissoes->>'ver_chat')::BOOLEAN, FALSE)
                 ELSE FALSE
               END
         )
       )
  ),
  vinculos AS MATERIALIZED (
    SELECT c.id AS dono, q.equipe_id AS equipe
      FROM candidatos c
      CROSS JOIN LATERAL public.fn_chat_equipes_do_perfil(c.id) q
  ),
  alcancados AS (
    SELECT c.*
      FROM candidatos c
     WHERE v_todos
        OR (v_equipe AND EXISTS (
              SELECT 1 FROM vinculos v
               WHERE v.dono = c.id AND v.equipe = ANY (v_minhas_equipes)))
        OR (v_setor AND EXISTS (
              SELECT 1 FROM public.fn_chat_setores_do_perfil(c.id) s
               WHERE s.setor_id = ANY (v_meus_setores)))
  )
  SELECT lista.*
    FROM (
      SELECT DISTINCT
             a.id,
             a.nome::TEXT,
             a.usuario::TEXT,
             a.foto_url::TEXT,
             a.cargo,
             s.id,
             s.nome::TEXT,
             e.id,
             e.nome::TEXT,
             emp.slug::TEXT,
             a.multiempresa
        FROM alcancados a
        -- Mesmo recorte do LEFT JOIN antigo: todas as equipes da pessoa, e o
        -- setor do perfil so quando ela nao tem equipe nenhuma.
        LEFT JOIN LATERAL (
          SELECT eq.id, eq.nome, eq.setor_id
            FROM public.equipes eq
           WHERE eq.id IN (SELECT v.equipe FROM vinculos v WHERE v.dono = a.id)
        ) e ON TRUE
        LEFT JOIN public.setores  s   ON s.id = COALESCE(e.setor_id, a.setor_do_perfil)
        LEFT JOIN public.empresas emp ON emp.id = a.empresa_id
    ) AS lista (perfil_id, nome, usuario, foto_url, cargo, setor_id, setor_nome,
                equipe_id, equipe_nome, empresa_slug, multiempresa)
   ORDER BY lista.multiempresa, lista.setor_nome, lista.equipe_nome,
            (lista.cargo = 'lider') DESC, lista.nome;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_multiempresa_definir_empresa(p_usuario_id uuid, p_empresa_id uuid, p_liberado boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_perfil       TEXT;
  v_nome         TEXT;
  v_empresa_dele UUID;
  v_setor_dele   UUID;
  v_empresa_nome TEXT;
  v_permitido    BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  IF NOT public.fn_user_is_super_admin() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao');
  END IF;

  SELECT p.perfil, p.nome, p.empresa_id, p.setor_id
    INTO v_perfil, v_nome, v_empresa_dele, v_setor_dele
    FROM public.perfis p WHERE p.id = p_usuario_id;

  IF v_perfil IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'usuario_nao_encontrado');
  END IF;

  IF v_perfil = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'super_admin_ja_tem');
  END IF;

  SELECT e.nome INTO v_empresa_nome FROM public.empresas e WHERE e.id = p_empresa_id;
  IF v_empresa_nome IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_nao_encontrada');
  END IF;

  -- A propria empresa nao e concessao. Grava-la criaria um segundo lugar de
  -- onde revogar o acesso de alguem a si mesmo.
  IF p_empresa_id = v_empresa_dele THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_propria');
  END IF;

  IF p_liberado THEN
    -- O cargo precisa poder receber. Le a chave do painel do cargo ALVO (no
    -- setor dele, 20261026120000), e nao a de quem esta concedendo.
    v_permitido := COALESCE(
      (public.fn_permissoes_do_cargo(v_empresa_dele, v_perfil, v_setor_dele) ->> 'acesso_multiempresa_permitido')::BOOLEAN,
      false);

    IF v_perfil IN ('administrador', 'super_admin') THEN
      v_permitido := true;  -- acesso total por construcao do resolvedor
    END IF;

    IF NOT COALESCE(v_permitido, false) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'cargo_nao_elegivel', 'perfil', v_perfil);
    END IF;

    INSERT INTO public.perfis_empresas_acesso (perfil_id, empresa_id, concedido_por)
    VALUES (p_usuario_id, p_empresa_id, auth.uid())
    ON CONFLICT (perfil_id, empresa_id) DO NOTHING;
  ELSE
    DELETE FROM public.perfis_empresas_acesso
     WHERE perfil_id = p_usuario_id AND empresa_id = p_empresa_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'liberado', p_liberado,
    'nome', v_nome, 'empresa', v_empresa_nome
  );
END;
$function$;

-- ── 4. A Manutenção da BookPlay ─────────────────────────────────────────────
--
-- Operador, Líder e Gerência começam com a cópia do mapa do cargo na BookPlay:
-- ninguém ganha nem perde nada até o painel ser mexido. Sem o setor (outro
-- banco, teste), passa sem fazer nada.

DO $manutencao$
DECLARE
  v_setor   CONSTANT UUID := '2b9ad301-cc59-4d9c-9694-24320a865976';
  v_empresa UUID;
BEGIN
  SELECT s.empresa_id INTO v_empresa
    FROM public.setores s
   WHERE s.id = v_setor AND s.nome ILIKE 'manuten%';

  IF v_empresa IS NULL THEN
    RAISE NOTICE 'Setor Manutenção (%) não encontrado: nenhum mapa criado.', v_setor;
    RETURN;
  END IF;

  INSERT INTO public.cargos_permissoes_setor (empresa_id, setor_id, cargo, permissoes)
  SELECT cp.empresa_id, v_setor, cp.cargo, cp.permissoes
    FROM public.cargos_permissoes cp
   WHERE cp.empresa_id = v_empresa
     AND cp.cargo IN ('operador', 'lider', 'gerencia')
  ON CONFLICT (setor_id, cargo) DO NOTHING;
END
$manutencao$;

COMMIT;

-- ============================================================================
-- Rollback (manual):
--   Recriar as oito funções pelos corpos de antes (20261002190000,
--   20260917140000, 20260823010000, 20260825210000, 20261016210000,
--   20261007190000, 20260919150000, 20260825200000) e então:
--   DROP FUNCTION IF EXISTS public.fn_permissoes_do_cargo(UUID, TEXT, UUID);
--   DROP TABLE IF EXISTS public.cargos_permissoes_setor;
--   DROP FUNCTION IF EXISTS public.fn_cargos_permissoes_setor_valida();
-- ============================================================================
