-- ═══════════════════════════════════════════════════════════════════════════
-- A projeção do desafio atravessa a empresa, como o resto do quadro já fazia
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que estava errado
--
-- `fn_desafio_dados` já é multiempresa: ela resolve `v_empresas` do desafio e
-- lê `analitico_recebimentos` com `empresa_id = ANY (v_empresas)`. O quadro de
-- participantes vem completo, das duas empresas.
--
-- A PROJEÇÃO não vinha. Ela é montada no cliente, por `buscarContextoEquipe`,
-- que consultava `metas` e `metas_config_mes` com a empresa de QUEM OLHA:
--
--     .eq('empresa_id', empresaId)
--
-- E não adiantaria trocar por `.in(...)`: a policy `metas_select` é
-- `fn_can_access_empresa(empresa_id)`, e `metas_config_select` é igual. O
-- cliente não alcança a meta da outra empresa, por mais que peça.
--
-- Resultado no «DESAFIO DOS LÍDERES — RUMO AO PÓDIO», que junta as duas: são
-- 16 líderes participantes (11 BookPlay + 5 PaguePlay). Quem olhava do
-- BookPlay via os 5 da PaguePlay sem meta — logo sem projeção, logo sem nota —
-- e quem olhava da PaguePlay via os 11 do BookPlay do mesmo jeito. Metade do
-- ranking em branco, para os dois lados.
--
-- ## O portão é o MESMO
--
-- Esta função não afrouxa nada em lugar nenhum: ela repete, na mesma ordem, as
-- três checagens de `fn_desafio_dados` —
--
--   1. `fn_desafio_alcanca_empresa(v_empresas)` — ou você é super_admin, ou
--      sua empresa está no desafio, ou você tem acesso multiempresa a uma
--      delas;
--   2. rascunho só para quem configura;
--   3. `fn_desafio_no_meu_alcance(...)` — o recorte de setor e visibilidade.
--
-- Quem não passa nos três recebe NULL, exatamente como no quadro. O que muda é
-- só isto: DENTRO de um desafio que você já pode ver, a meta das equipes das
-- outras empresas DELE deixa de ser invisível. Fora daqui, `metas` continua
-- fechada pela RLS de sempre.
--
-- ## Por que devolve a configuração POR EMPRESA
--
-- Feriado e `contar_dia_atual` são por empresa. Hoje BookPlay e PaguePlay têm
-- a mesma coisa em setembro/2026 (`["2026-09-07"]`, `contar_dia_atual` falso),
-- e seria cômodo devolver um par só de dias úteis.
--
-- Seria cômodo e ficaria errado no dia em que uma das duas mexesse no
-- calendário — sem erro nenhum, só com a projeção da outra empresa medida pela
-- régua errada. O cliente recebe a config de cada uma e calcula os dias úteis
-- por empresa; `equipe_empresa` é o que liga a equipe à régua dela.
--
-- Os dias úteis continuam sendo contados NO CLIENTE, por `diasUteisDoMes` e
-- `diasUteisDecorridos` — as mesmas de Desempenho Equipes. Reimplementá-las em
-- SQL criaria a segunda cópia de uma conta que existe para ter uma só.
--
-- ## Qual mês
--
-- O do `data_fim`, pelo mesmo motivo já escrito em `buscarContextoEquipe`:
-- meta e dias úteis são mensais, a campanha não é, e o fim é o mês em que a
-- disputa se decide.

CREATE OR REPLACE FUNCTION public.fn_desafio_contexto_equipe(p_desafio_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desafio   public.desafios%ROWTYPE;
  v_empresas  UUID[];
  v_ano       INT;
  v_mes       INT;
  v_metas     JSONB;
  v_equipe_emp JSONB;
  v_config    JSONB;
BEGIN
  SELECT * INTO v_desafio FROM public.desafios WHERE id = p_desafio_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_empresas := public.fn_desafio_empresas(v_desafio.empresa_id, v_desafio.empresas);

  -- ── Os mesmos três portões de fn_desafio_dados ────────────────────────────
  IF NOT public.fn_desafio_alcanca_empresa(v_empresas) THEN
    RETURN NULL;
  END IF;

  IF v_desafio.status = 'rascunho'
     AND NOT public.fn_user_tem('desafios_configurar')
     AND NOT public.fn_user_tem('desafios_configurar_setor') THEN
    RETURN NULL;
  END IF;

  IF NOT public.fn_desafio_no_meu_alcance(
           v_desafio.setor_id, v_desafio.regra, v_desafio.visibilidade) THEN
    RETURN NULL;
  END IF;

  v_ano := EXTRACT(YEAR  FROM v_desafio.data_fim)::INT;
  v_mes := EXTRACT(MONTH FROM v_desafio.data_fim)::INT;

  -- Meta mensal por equipe. `meta_valor > 0` porque equipe com meta zero é
  -- equipe sem meta — é assim que o cliente já lia.
  SELECT COALESCE(jsonb_object_agg(m.referencia_id, m.meta_valor), '{}'::JSONB)
    INTO v_metas
    FROM public.metas m
   WHERE m.empresa_id = ANY (v_empresas)
     AND m.tipo       = 'equipe'
     AND m.mes        = v_mes
     AND m.ano        = v_ano
     AND m.meta_valor > 0;

  -- De qual empresa é cada equipe — é o que liga a equipe à régua de dias
  -- úteis dela. Só as equipes que têm meta interessam.
  SELECT COALESCE(jsonb_object_agg(e.id, e.empresa_id), '{}'::JSONB)
    INTO v_equipe_emp
    FROM public.equipes e
   WHERE e.empresa_id = ANY (v_empresas)
     AND v_metas ? e.id::TEXT;

  -- Feriados e `contar_dia_atual` de cada empresa do desafio. Empresa sem
  -- linha de config não aparece; o cliente trata a ausência como «sem feriado
  -- e sem contar o dia atual», que é o padrão de `getMetasConfig`.
  SELECT COALESCE(jsonb_object_agg(c.empresa_id, jsonb_build_object(
           'feriados',         COALESCE(c.feriados, '[]'::JSONB),
           'contar_dia_atual', COALESCE(c.contar_dia_atual, FALSE)
         )), '{}'::JSONB)
    INTO v_config
    FROM public.metas_config_mes c
   WHERE c.empresa_id = ANY (v_empresas)
     AND c.mes = v_mes
     AND c.ano = v_ano;

  RETURN jsonb_build_object(
    'mes',            v_mes,
    'ano',            v_ano,
    'empresas',       to_jsonb(v_empresas),
    'metas',          v_metas,
    'equipe_empresa', v_equipe_emp,
    'config',         v_config
  );
END;
$function$;

-- `anon` não tem o que fazer aqui: desafio é tela de gente logada, e a função
-- é SECURITY DEFINER — deixá-la aberta ao anônimo seria abrir a meta de todas
-- as empresas para quem tem só a chave pública.
REVOKE ALL ON FUNCTION public.fn_desafio_contexto_equipe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_desafio_contexto_equipe(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_desafio_contexto_equipe(UUID) IS
  'Metas de equipe e config de dias uteis das empresas DO DESAFIO, para a '
  'projecao do ranking. Repete os tres portoes de fn_desafio_dados: quem nao '
  've o quadro nao ve o contexto. Existe porque metas_select e '
  'metas_config_select sao fn_can_access_empresa, e num desafio entre duas '
  'empresas o cliente nao alcancaria a meta da outra.';

-- ── Verificação ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.fn_desafio_contexto_equipe(uuid)') IS NULL THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe nao foi criada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema = 'public'
       AND routine_name   = 'fn_desafio_contexto_equipe'
       AND grantee        = 'anon'
  ) THEN
    RAISE EXCEPTION 'fn_desafio_contexto_equipe continua alcancavel pelo anon';
  END IF;
END;
$$;
