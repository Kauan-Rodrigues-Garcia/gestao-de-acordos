-- ============================================================================
-- Diretoria enxerga os acordos das duas operacoes, como administrador
-- ============================================================================
--
-- ## O que faltava
--
-- Depois de `20260818360000` a diretoria passou a ver os acordos da BookPlay.
-- Na PaguePlay continuou zerado — e nao era acesso multiempresa: era o ramo
-- da PaguePlay da propria policy.
--
--     ... OR ((empresa_id = bookplay)      AND role in (administrador, diretoria) ...)
--     ... OR ((NOT (empresa_id = bookplay)) AND role in (lider, administrador))
--                                                        ^^^^ sem diretoria
--
-- `diretoria` aparecia so no ramo da BookPlay. Na PaguePlay, uma diretoria que
-- nao fosse dona do acordo caia fora — inclusive no Dashboard, que le `acordos`
-- direto. Por isso o relato foi "nao aparece nenhum acordo": nao e a tela de
-- Acordos (que na PaguePlay esta desativada de proposito), e todo numero de
-- acordo que a PaguePlay mostra.
--
-- Isto vem de antes do acesso multiempresa e nunca foi notado porque a tela de
-- Acordos e modulo so da BookPlay — ninguem foi olhar o outro lado.
--
-- ## A correcao
--
-- `administrador` e `diretoria` sao cargos de EMPRESA, nao de setor: os dois
-- enxergam a operacao inteira. Entao a condicao sobe um nivel e sai dos dois
-- ramos, em vez de ser repetida com listas diferentes em cada um:
--
--     OR fn_user_has_any_role(ARRAY['administrador','diretoria'])
--
-- Os ramos por operacao ficam so com o que de fato depende da operacao:
--
--     BookPlay   -> lider/elite/gerencia, recortados por SETOR
--     PaguePlay  -> lider
--
-- Para `administrador` nada muda: ele ja passava nos dois ramos. Para
-- `lider`, `elite`, `gerencia` e `operador` nada muda. Quem ganha e a diretoria
-- na PaguePlay — que era o pedido.
--
-- `ouvidoria` tambem nao muda: `fn_user_has_any_role` traduz `ouvidoria` para
-- `lider`, e `lider` continua no ramo da PaguePlay.
--
-- ## Escopo: LEITURA
--
-- So `acordos_select`. `acordos_insert`, `acordos_update` e
-- `acordos_delete_admin` seguem como estao — la a diretoria tem escrita na
-- BookPlay e nao tem na PaguePlay. Abrir escrita e outra decisao, e o pedido
-- foi sobre enxergar.
--
-- O gate de empresa que vem ANTES desta clausula nao e tocado: quem nao tem
-- acesso multiempresa continua preso a propria empresa. O que muda e o que a
-- pessoa ve DENTRO da empresa que ja podia ver.
-- ============================================================================

do $pol$
declare
  v_qual_antes text;
begin
  select pg_get_expr(p.polqual, p.polrelid) into v_qual_antes
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'acordos' and p.polname = 'acordos_select';

  if v_qual_antes is null then
    raise exception 'Policy acordos_select nao existe';
  end if;

  -- Pre-condicao: a migration anterior tem que ter rodado. Sem ela a policy
  -- ainda decide pela empresa do cracha, e esta aqui reescreveria por cima.
  if v_qual_antes not like '%fn_empresa_id_bookplay%' then
    raise exception
      'acordos_select ainda usa a empresa do cracha — aplique 20260818360000 antes desta';
  end if;

  if v_qual_antes like '%fn_user_acesso_multiempresa%' is false then
    raise exception
      'acordos_select nao conhece o acesso multiempresa — aplique 20260818300000 antes desta';
  end if;
end;
$pol$;

alter policy acordos_select on public.acordos
using (
  -- ── Gate de empresa (inalterado) ──────────────────────────────────────
  (
    ( SELECT public.fn_user_is_super_admin()      AS fn_user_is_super_admin)
    OR
    ( ( SELECT public.fn_user_acesso_multiempresa() AS fn_user_acesso_multiempresa)
      OR (empresa_id = ( SELECT public.fn_user_empresa_id() AS fn_user_empresa_id)) )
  )
  AND
  -- ── Quem enxerga o que, dentro da empresa ─────────────────────────────
  (
    -- O proprio acordo, sempre.
    (operador_id = ( SELECT auth.uid() AS uid))

    OR ( SELECT public.fn_user_is_super_admin() AS fn_user_is_super_admin)

    -- Cargo de EMPRESA: enxerga a operacao inteira, nas duas. Estava repetido
    -- dentro dos ramos, com lista diferente em cada um — e foi assim que a
    -- diretoria ficou de fora da PaguePlay.
    OR ( SELECT public.fn_user_has_any_role(ARRAY['administrador'::text, 'diretoria'::text])
                AS fn_user_has_any_role)

    -- BookPlay: quem lidera enxerga o proprio setor, inclusive os clones.
    OR (
      (empresa_id = ( SELECT public.fn_empresa_id_bookplay() AS fn_empresa_id_bookplay))
      AND ( SELECT public.fn_user_has_any_role(ARRAY['lider'::text, 'elite'::text, 'gerencia'::text])
                   AS fn_user_has_any_role)
      AND (
        (setor_id = ( SELECT public.fn_user_setor_id() AS fn_user_setor_id))
        OR ((setor_id IS NULL)
            AND (public.fn_operador_setor_id(operador_id)
                 = ( SELECT public.fn_user_setor_id() AS fn_user_setor_id)))
        OR public.fn_operador_clonado_no_setor(
             operador_id, ( SELECT public.fn_user_setor_id() AS fn_user_setor_id))
      )
    )

    -- PaguePlay: sem recorte por setor. `ouvidoria` entra aqui —
    -- `fn_user_has_any_role` traduz `ouvidoria` para `lider`.
    OR (
      (NOT (empresa_id = ( SELECT public.fn_empresa_id_bookplay() AS fn_empresa_id_bookplay)))
      AND ( SELECT public.fn_user_has_any_role(ARRAY['lider'::text]) AS fn_user_has_any_role)
    )
  )
);

-- ── Verificacao ───────────────────────────────────────────────────────────

do $ver$
declare
  v_qual text;
begin
  select pg_get_expr(p.polqual, p.polrelid) into v_qual
    from pg_policy p
    join pg_class     c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'acordos' and p.polname = 'acordos_select';

  -- O gate de empresa continua inteiro: as tres pecas.
  if v_qual not like '%fn_user_is_super_admin%'
  or v_qual not like '%fn_user_acesso_multiempresa%'
  or v_qual not like '%fn_user_empresa_id%' then
    raise exception 'O gate de empresa foi perdido na reescrita: %', v_qual;
  end if;

  -- A regra continua decidindo pela empresa DA LINHA.
  if v_qual not like '%fn_empresa_id_bookplay%' then
    raise exception 'A policy voltou a decidir pela empresa do cracha';
  end if;

  -- E o recorte por setor da BookPlay nao pode ter sumido junto.
  if v_qual not like '%fn_operador_clonado_no_setor%'
  or v_qual not like '%fn_user_setor_id%' then
    raise exception 'O recorte por setor da BookPlay sumiu da policy';
  end if;

  raise notice 'acordos_select: administrador e diretoria enxergam as duas operacoes.';
end;
$ver$;
