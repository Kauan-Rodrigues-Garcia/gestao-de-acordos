-- ============================================================================
-- 20261006170000_calendario_do_setor.sql
--
-- Calendário do setor (pedido de 06/10/2026): uma aba com o mês inteiro, os
-- dias úteis, o banco de horas, os feriados, os aniversariantes e os avisos do
-- setor. A liderança monta; o operador consulta.
--
-- ## O que mora aqui e o que NÃO mora
--
-- Mora o que a liderança escreve: os EVENTOS de cada dia (banco de horas,
-- feriado, aniversário, reunião, aviso…) e a CAPA do mês (tema visual, título,
-- frase, expediente).
--
-- NÃO mora o dia útil. Ele continua vindo de onde a meta o lê —
-- `metas_config_mes.feriados` na cobrança, `vendas_calendario_mes` no
-- Comercial —, para que o calendário e a meta diária nunca contem meses
-- diferentes. Um feriado lançado aqui que não está nas Metas é só um rótulo, e
-- a tela avisa quem edita.
--
-- ## Quem vê, quem edita
--
--   ver_calendario            a aba. Nasce para todos os cargos.
--   calendario_editar         montar o calendário dos setores que alcança.
--                             Nasce para líder e gerência.
--   calendario_todos_setores  alcançar qualquer setor da empresa (sem ela, só
--                             os setores da própria pessoa —
--                             fn_setores_do_operador). Nasce para gerência e
--                             diretoria.
--
-- ## O que este arquivo faz
--
--   - acrescenta 3 chaves ao catálogo (e semeia só a chave ausente, via
--     fn_permissoes_semear_empresa);
--   - cria 2 tabelas vazias, sem acesso direto de `authenticated`;
--   - cria 8 funções (alcance, edição, setores, ler o mês, pessoas, salvar evento,
--     excluir evento, salvar a capa).
--
-- Nenhum dado existente é alterado.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 0. Catálogo de permissões
-- ============================================================================
--
-- Renomeia o catálogo em vigor — seja qual for o topo da cadeia neste momento
-- — e põe um novo que o lê e soma as chaves novas. A função renomeada NÃO é
-- objeto morto: o catálogo novo depende dela.

DO $$
BEGIN
  IF to_regprocedure('public.fn_permissoes_catalogo_antes_calendario_20261006()') IS NULL THEN
    ALTER FUNCTION public.fn_permissoes_catalogo() RENAME TO fn_permissoes_catalogo_antes_calendario_20261006;
  END IF;
END $$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_calendario_20261006() IS
  'Retrato do catalogo antes das chaves do Calendario do setor (06/10/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_calendario_20261006()
  UNION ALL
  SELECT * FROM (VALUES
    -- A aba: todo mundo. O calendário existe para quem trabalha no setor.
    ('ver_calendario',           NULL::TEXT[], ARRAY['operador','ouvidoria','lider','elite','gerencia','diretoria']::TEXT[], false),
    -- Montar o calendário: líder e gerência, como pedido.
    ('calendario_editar',        NULL::TEXT[], ARRAY['lider','gerencia']::TEXT[], false),
    -- Qualquer setor da empresa: a cúpula.
    ('calendario_todos_setores', NULL::TEXT[], ARRAY['gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. 20261006170000 soma ver_calendario, calendario_editar e '
  'calendario_todos_setores.';

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ============================================================================
-- 1. As tabelas
-- ============================================================================

-- A capa do mês: tema visual, título, frase e expediente. Sem linha = padrão.
CREATE TABLE IF NOT EXISTS public.calendario_meses (
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id          UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  -- Primeiro dia do mês.
  mes               DATE NOT NULL,
  -- Identificador do tema da tela (`src/pages/Calendario/temas.ts`). Texto
  -- livre e curto: tema novo não pede migration.
  tema              TEXT NOT NULL DEFAULT 'automatico',
  titulo            TEXT,
  frase             TEXT,
  expediente_semana TEXT,
  expediente_sabado TEXT,
  atualizado_por    UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa_id, setor_id, mes),
  CONSTRAINT calendario_meses_mes_inicio CHECK (mes = date_trunc('month', mes)::DATE),
  CONSTRAINT calendario_meses_tema CHECK (tema ~ '^[a-z0-9_]{1,40}$'),
  CONSTRAINT calendario_meses_textos CHECK (
    char_length(COALESCE(titulo, ''))            <= 60
    AND char_length(COALESCE(frase, ''))             <= 140
    AND char_length(COALESCE(expediente_semana, '')) <= 40
    AND char_length(COALESCE(expediente_sabado, '')) <= 40
  )
);

COMMENT ON TABLE public.calendario_meses IS
  'Capa do Calendario do setor em cada mes: tema, titulo, frase e expediente. '
  'Sem linha = padrao. Escrita so por fn_calendario_mes_salvar. Ver 20261006170000.';

-- O que acontece em cada dia.
CREATE TABLE IF NOT EXISTS public.calendario_eventos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id       UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  dia            DATE NOT NULL,
  tipo           TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  -- «01 hora», «08:30 às 12:00», «até às 19:00».
  detalhe        TEXT,
  -- O aniversariante, quando o evento é de uma pessoa: a tela mostra a foto.
  pessoa_id      UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  -- Pinta o dia inteiro com a cor forte do tema.
  destaque       BOOLEAN NOT NULL DEFAULT FALSE,
  criado_por     UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendario_eventos_tipo CHECK (tipo IN (
    'banco_horas', 'feriado', 'aniversario', 'evento', 'aviso', 'folga', 'horario'
  )),
  CONSTRAINT calendario_eventos_titulo CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 80),
  CONSTRAINT calendario_eventos_detalhe CHECK (char_length(COALESCE(detalhe, '')) <= 120)
);

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_setor_dia
  ON public.calendario_eventos (empresa_id, setor_id, dia);

COMMENT ON TABLE public.calendario_eventos IS
  'Eventos do Calendario do setor, um por linha e por dia. Leitura e escrita so '
  'pelas funcoes fn_calendario_*. Ver 20261006170000.';

-- Sem policy: ninguém lê nem escreve direto. Tudo passa pelas funções abaixo,
-- que conferem a chave e o setor.
ALTER TABLE public.calendario_meses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendario_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendario_meses   FROM authenticated, anon;
REVOKE ALL ON public.calendario_eventos FROM authenticated, anon;

-- ============================================================================
-- 2. O alcance: a pessoa logada enxerga o calendário deste setor?
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calendario_alcanca(p_empresa_id UUID, p_setor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_can_access_empresa(p_empresa_id)
     AND EXISTS (SELECT 1 FROM public.setores s WHERE s.id = p_setor_id AND s.empresa_id = p_empresa_id)
     AND (
       public.fn_user_is_super_admin()
       OR (
         public.fn_user_tem('ver_calendario')
         AND (
           public.fn_user_tem('calendario_todos_setores')
           OR p_setor_id IN (SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s)
         )
       )
     );
$function$;

COMMENT ON FUNCTION public.fn_calendario_alcanca(UUID, UUID) IS
  'A pessoa logada enxerga o Calendario deste setor? ver_calendario e, sem '
  'calendario_todos_setores, so os setores dela (fn_setores_do_operador). 20261006170000.';

-- Editar = alcançar + a chave de editar.
CREATE OR REPLACE FUNCTION public.fn_calendario_edita(p_empresa_id UUID, p_setor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_calendario_alcanca(p_empresa_id, p_setor_id)
     AND (public.fn_user_is_super_admin() OR public.fn_user_tem('calendario_editar'));
$function$;

COMMENT ON FUNCTION public.fn_calendario_edita(UUID, UUID) IS
  'A pessoa logada pode montar o Calendario deste setor? 20261006170000.';

-- ============================================================================
-- 3. Os setores que a pessoa alcança
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calendario_setores(p_empresa_id UUID)
RETURNS TABLE(id UUID, nome TEXT, pode_editar BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT s.id, s.nome, public.fn_calendario_edita(p_empresa_id, s.id)
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND COALESCE(s.ativo, TRUE)
     AND public.fn_calendario_alcanca(p_empresa_id, s.id)
   ORDER BY s.nome;
$function$;

COMMENT ON FUNCTION public.fn_calendario_setores(UUID) IS
  'Setores ativos cujo Calendario a pessoa enxerga, e se pode editar cada um. 20261006170000.';

-- ============================================================================
-- 4. Ler o mês
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calendario_mes(p_empresa_id UUID, p_setor_id UUID, p_mes DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
BEGIN
  IF NOT public.fn_calendario_alcanca(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para ver o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'capa', (
      SELECT jsonb_build_object(
               'tema', m.tema, 'titulo', m.titulo, 'frase', m.frase,
               'expediente_semana', m.expediente_semana, 'expediente_sabado', m.expediente_sabado,
               'atualizado_em', m.atualizado_em)
        FROM public.calendario_meses m
       WHERE m.empresa_id = p_empresa_id AND m.setor_id = p_setor_id AND m.mes = v_mes
    ),
    'eventos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', e.id, 'dia', e.dia, 'tipo', e.tipo, 'titulo', e.titulo,
               'detalhe', e.detalhe, 'destaque', e.destaque,
               'pessoa_id', e.pessoa_id, 'pessoa_nome', p.nome, 'pessoa_foto', p.foto_url)
             ORDER BY e.dia, e.criado_em)
        FROM public.calendario_eventos e
        LEFT JOIN public.perfis p ON p.id = e.pessoa_id
       WHERE e.empresa_id = p_empresa_id
         AND e.setor_id = p_setor_id
         AND e.dia >= v_mes
         AND e.dia < (v_mes + INTERVAL '1 month')::DATE
    ), '[]'::JSONB)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_mes(UUID, UUID, DATE) IS
  'A capa e os eventos do Calendario do setor no mes. 20261006170000.';

-- ============================================================================
-- 5. As pessoas do setor (para marcar o aniversariante)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calendario_pessoas(p_empresa_id UUID, p_setor_id UUID)
RETURNS TABLE(id UUID, nome TEXT, foto_url TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_calendario_edita(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para montar o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome, p.foto_url
    FROM public.perfis p
   WHERE p.empresa_id = p_empresa_id
     AND NOT COALESCE(p.arquivado, FALSE)
     AND p.situacao <> 'desligado'
     AND p_setor_id IN (SELECT s FROM public.fn_setores_do_operador(p.id) AS s)
   ORDER BY p.nome;
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_pessoas(UUID, UUID) IS
  'Pessoas ativas do setor, para marcar aniversariante no Calendario. So quem edita. 20261006170000.';

-- ============================================================================
-- 6. Salvar evento (um ou vários dias de uma vez)
-- ============================================================================
--
-- `p_id` nulo: cria um evento igual em cada dia de `p_dias` (o «aplicar em
-- vários dias» da tela). `p_id` preenchido: corrige aquele evento, e `p_dias`
-- traz exatamente o dia dele.

CREATE OR REPLACE FUNCTION public.fn_calendario_evento_salvar(
  p_empresa_id UUID,
  p_setor_id   UUID,
  p_id         UUID,
  p_dias       DATE[],
  p_tipo       TEXT,
  p_titulo     TEXT,
  p_detalhe    TEXT    DEFAULT NULL,
  p_pessoa_id  UUID    DEFAULT NULL,
  p_destaque   BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dias    DATE[];
  v_detalhe TEXT := NULLIF(btrim(COALESCE(p_detalhe, '')), '');
  v_n       INTEGER;
BEGIN
  IF NOT public.fn_calendario_edita(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para montar o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT d ORDER BY d), '{}'::DATE[]) INTO v_dias
    FROM unnest(COALESCE(p_dias, '{}'::DATE[])) AS d
   WHERE d IS NOT NULL;

  IF cardinality(v_dias) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos um dia.' USING ERRCODE = '22023';
  END IF;
  -- Teto: dois meses cheios. Mais que isso é engano de tela, não pedido.
  IF cardinality(v_dias) > 62 THEN
    RAISE EXCEPTION 'Dias demais de uma vez (maximo 62).' USING ERRCODE = '22023';
  END IF;
  IF p_pessoa_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = p_pessoa_id AND p.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'Pessoa fora desta empresa.' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NOT NULL THEN
    IF cardinality(v_dias) <> 1 THEN
      RAISE EXCEPTION 'Corrigir um evento leva exatamente um dia.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.calendario_eventos e
       SET dia = v_dias[1], tipo = p_tipo, titulo = btrim(p_titulo), detalhe = v_detalhe,
           pessoa_id = p_pessoa_id, destaque = COALESCE(p_destaque, FALSE),
           atualizado_por = (SELECT auth.uid()), atualizado_em = NOW()
     WHERE e.id = p_id AND e.empresa_id = p_empresa_id AND e.setor_id = p_setor_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Evento nao encontrado neste setor.' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_n;
  END IF;

  INSERT INTO public.calendario_eventos
         (empresa_id, setor_id, dia, tipo, titulo, detalhe, pessoa_id, destaque, criado_por, atualizado_por)
  SELECT p_empresa_id, p_setor_id, d, p_tipo, btrim(p_titulo), v_detalhe, p_pessoa_id,
         COALESCE(p_destaque, FALSE), (SELECT auth.uid()), (SELECT auth.uid())
    FROM unnest(v_dias) AS d;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_evento_salvar(UUID, UUID, UUID, DATE[], TEXT, TEXT, TEXT, UUID, BOOLEAN) IS
  'Cria o evento em cada dia de p_dias (p_id nulo) ou corrige um evento (p_id). '
  'Devolve quantas linhas gravou. 20261006170000.';

-- ============================================================================
-- 7. Excluir evento
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calendario_evento_excluir(p_empresa_id UUID, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_setor UUID;
BEGIN
  SELECT e.setor_id INTO v_setor
    FROM public.calendario_eventos e
   WHERE e.id = p_id AND e.empresa_id = p_empresa_id;
  IF NOT FOUND THEN
    RETURN;  -- Já não existe: excluir de novo não é erro.
  END IF;
  IF NOT public.fn_calendario_edita(p_empresa_id, v_setor) THEN
    RAISE EXCEPTION 'Sem permissao para montar o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.calendario_eventos WHERE id = p_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_evento_excluir(UUID, UUID) IS
  'Exclui um evento do Calendario, se a pessoa edita o setor dele. 20261006170000.';

-- ============================================================================
-- 8. Salvar a capa do mês
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_calendario_mes_salvar(
  p_empresa_id        UUID,
  p_setor_id          UUID,
  p_mes               DATE,
  p_tema              TEXT,
  p_titulo            TEXT,
  p_frase             TEXT,
  p_expediente_semana TEXT,
  p_expediente_sabado TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
BEGIN
  IF NOT public.fn_calendario_edita(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para montar o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.calendario_meses AS m
         (empresa_id, setor_id, mes, tema, titulo, frase, expediente_semana, expediente_sabado, atualizado_por, atualizado_em)
  VALUES (p_empresa_id, p_setor_id, v_mes,
          COALESCE(NULLIF(btrim(COALESCE(p_tema, '')), ''), 'automatico'),
          NULLIF(btrim(COALESCE(p_titulo, '')), ''),
          NULLIF(btrim(COALESCE(p_frase, '')), ''),
          NULLIF(btrim(COALESCE(p_expediente_semana, '')), ''),
          NULLIF(btrim(COALESCE(p_expediente_sabado, '')), ''),
          (SELECT auth.uid()), NOW())
  ON CONFLICT (empresa_id, setor_id, mes) DO UPDATE
     SET tema              = EXCLUDED.tema,
         titulo            = EXCLUDED.titulo,
         frase             = EXCLUDED.frase,
         expediente_semana = EXCLUDED.expediente_semana,
         expediente_sabado = EXCLUDED.expediente_sabado,
         atualizado_por    = EXCLUDED.atualizado_por,
         atualizado_em     = NOW();
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_mes_salvar(UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Grava a capa do Calendario do setor no mes (tema, titulo, frase, expediente). 20261006170000.';

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.fn_calendario_alcanca(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_edita(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_setores(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_mes(UUID, UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_pessoas(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_evento_salvar(UUID, UUID, UUID, DATE[], TEXT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_evento_excluir(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_calendario_mes_salvar(UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_calendario_alcanca(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_edita(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_setores(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_mes(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_pessoas(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_evento_salvar(UUID, UUID, UUID, DATE[], TEXT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_evento_excluir(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calendario_mes_salvar(UUID, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── Prova ───────────────────────────────────────────────────────────────────

DO $prova$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() c WHERE c.chave = 'ver_painel_diretoria') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: chaves antigas sumiram.';
  END IF;
  SELECT COUNT(*) INTO n FROM public.fn_permissoes_catalogo() c
   WHERE c.chave IN ('ver_calendario', 'calendario_editar', 'calendario_todos_setores');
  IF n <> 3 THEN
    RAISE EXCEPTION 'As chaves do Calendario nao entraram no catalogo (% de 3).', n;
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.calendario_meses'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.calendario_eventos'::regclass) THEN
    RAISE EXCEPTION 'Uma tabela do Calendario ficou sem RLS.';
  END IF;
  IF has_table_privilege('authenticated', 'public.calendario_eventos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.calendario_meses', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ainda acessa direto as tabelas do Calendario.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_calendario_evento_salvar(uuid,uuid,uuid,date[],text,text,text,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_calendario_evento_salvar ficou aberta para anon.';
  END IF;
END
$prova$;

COMMIT;
