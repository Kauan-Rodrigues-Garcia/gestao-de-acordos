-- ============================================================================
-- Afastamentos e pontos de atenção de uso — 28/10/2026
-- ============================================================================
--
-- Pedido do Cleber (27/10): na aba Usuários, avisar o líder de quem está ativo
-- e não abre o Gestão há dias, para ele classificar — atestado, férias,
-- desligado, ou ignorar. Para isso a pessoa ganha «afastado», com motivo,
-- texto livre e volta com data ou por tempo indeterminado.
-- Desenho: docs/superpowers/specs/2026-10-27-afastamentos-e-pontos-de-atencao-design.md
--
-- ## Onde mora o afastamento
--
-- Em `ausencias`, a tabela que o Comercial já usa (20260915220000): tipo,
-- período, observação, quem lançou. O histórico por pessoa sai de graça.
--
-- O que ele faz com `perfis.situacao` enquanto está em curso:
--
--   • férias                         → `ferias`, pelo espelho que já existe;
--   • outro tipo, fora_das_contas    → `afastado` (tratado como férias: sai de
--                                      ranking, quartis, desafios, TV);
--   • outro tipo, conta normal       → continua `ativo`; só sai dos pontos de
--                                      atenção e os dias não contam contra.
--
-- ## «Tempo indeterminado» é fim = 9999-12-31, e não NULL
--
-- As funções do Comercial conferem sobreposição com `a.fim >= p_inicio` e
-- recortam o mês com `LEAST(au.fim, j.fim)`. Com NULL a sobreposição deixaria
-- de enxergar o afastamento indeterminado — o Comercial lançaria um atestado
-- por cima. Com a data-sentinela, tudo o que já existe continua certo sem ser
-- reescrito; a tela mostra «sem data de volta» (`lib/ausencias.ts`).
--
-- ## Pontos de atenção: o algoritmo, contra falso positivo
--
-- Ver `fn_uso_pontos_de_atencao`. Em uma linha: quatro fontes de uso
-- independentes, só dias úteis já terminados, e dia em que a telemetria caiu
-- para a empresa inteira não acusa ninguém.
--
-- Reverter (na ordem):
--   SELECT cron.unschedule('usuarios-afastamentos-diario');
--   DROP FUNCTION IF EXISTS public.fn_uso_pontos_de_atencao(uuid);
--   DROP FUNCTION IF EXISTS public.fn_uso_atencao_ignorar(uuid, uuid, text);
--   DROP TABLE IF EXISTS public.uso_atencao_ignorados;
--   DROP FUNCTION IF EXISTS public.fn_usuarios_afastamentos(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.fn_usuarios_encerrar_afastamento(uuid);
--   DROP FUNCTION IF EXISTS public.fn_usuarios_afastar(uuid, uuid, text, date, date, boolean, text);
--   DROP FUNCTION IF EXISTS public.fn_usuarios_afastamentos_diario();
--   DROP FUNCTION IF EXISTS public.fn_usuarios_ajustar_situacao(uuid, text, date, date);
--   DROP FUNCTION IF EXISTS public.fn_usuarios_pode_situacao();
--   DROP FUNCTION IF EXISTS public.fn_usuarios_alcancados();
--   UPDATE public.perfis SET situacao = 'ativo' WHERE situacao = 'afastado';
--   e reaplicar perfis_situacao_check sem 'afastado',
--   fn_analitico_ranking_pessoas de 20261023120000 e
--   fn_tv_numeros_calcular de 20261027200000.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. A situação nova ─────────────────────────────────────────────────────

ALTER TABLE public.perfis DROP CONSTRAINT IF EXISTS perfis_situacao_check;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_situacao_check
  CHECK (situacao = ANY (ARRAY['ativo', 'ferias', 'afastado', 'desligado']));

-- ── 2. Os tipos e a coluna «tirar das contas» ──────────────────────────────

INSERT INTO public.ausencias_tipos (tipo, rotulo, abate_meta, ordem) VALUES
  ('licenca_maternidade', 'Licença-maternidade', true, 11),
  ('licenca_paternidade', 'Licença-paternidade', true, 12)
ON CONFLICT (tipo) DO NOTHING;

ALTER TABLE public.ausencias
  ADD COLUMN IF NOT EXISTS fora_das_contas BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ausencias.fora_das_contas IS
  'Enquanto em curso, a pessoa fica `afastado` (sai de ranking, quartis, '
  'desafios e TV, como férias). Férias é sempre true. Ver 20261028100000.';

-- Férias sempre tiraram das contas: a coluna passa a dizer isso.
UPDATE public.ausencias SET fora_das_contas = true
 WHERE tipo = 'ferias' AND NOT fora_das_contas;

-- ── 3. Quem eu alcanço na aba Usuários ─────────────────────────────────────
--
-- O MESMO recorte de `perfis_select` (20261013171000), só que pelo escopo da
-- aba Usuários e não pelo maior entre as abas: escrever situação é coisa de
-- Usuários, e uma aba não fala pela outra.

CREATE OR REPLACE FUNCTION public.fn_usuarios_alcancados()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH nivel AS (SELECT public.fn_user_escopo('usuarios') AS n)
  SELECT (SELECT auth.uid()) WHERE (SELECT auth.uid()) IS NOT NULL
  UNION
  SELECT p.id FROM public.perfis p
   WHERE (SELECT public.fn_user_is_super_admin())
  UNION
  SELECT p.id FROM public.perfis p
   WHERE (SELECT n FROM nivel) >= 3
     AND p.empresa_id IN (SELECT public.fn_minhas_empresas())
  UNION
  SELECT x.id FROM public.fn_perfis_dos_meus_setores() x(id)
   WHERE (SELECT n FROM nivel) = 2
  UNION
  SELECT x.id FROM public.fn_perfis_das_minhas_equipes() x(id)
   WHERE (SELECT n FROM nivel) = 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_alcancados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_alcancados() TO authenticated;

COMMENT ON FUNCTION public.fn_usuarios_alcancados() IS
  'Perfis que o escopo da aba Usuários alcança (mesmos ramos de perfis_select). '
  'Porta de escrita de afastamento e de leitura dos pontos de atenção. 20261028100000.';

-- A mesma porta do seletor de situação de hoje (`podeGerenciarSituacao`).
CREATE OR REPLACE FUNCTION public.fn_usuarios_pode_situacao()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR public.fn_user_tem('usuarios_administrar')
      OR public.fn_user_tem('usuarios_editar_do_setor');
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_pode_situacao() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_pode_situacao() TO authenticated;

-- ── 4. A situação acompanha o afastamento ──────────────────────────────────
--
-- Chamada DEPOIS de gravar, com o que a linha era antes (nulos quando é
-- criação). Férias continuam com o espelho de 20260915220000, que sabe o que
-- fazer com o rastro em `ferias_ate`. `afastado` é só desta função: entra
-- quando um afastamento «fora das contas» cobre hoje e sai quando nenhum
-- cobre. Só mexe em quem está `ativo` ou `afastado` — férias e desligado são
-- de outro dono.

CREATE OR REPLACE FUNCTION public.fn_usuarios_ajustar_situacao(
  p_operador_id  uuid,
  p_antes_tipo   text,
  p_antes_inicio date,
  p_antes_fim    date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM public.fn_ausencias_espelhar_ferias(p_operador_id, p_antes_tipo, p_antes_inicio, p_antes_fim);

  IF EXISTS (
    SELECT 1 FROM public.ausencias a
     WHERE a.operador_id = p_operador_id
       AND a.tipo <> 'ferias'
       AND a.fora_das_contas
       AND a.inicio <= v_hoje AND a.fim >= v_hoje
  ) THEN
    UPDATE public.perfis
       SET situacao = 'afastado', atualizado_em = now()
     WHERE id = p_operador_id AND situacao = 'ativo';
  ELSE
    UPDATE public.perfis
       SET situacao = 'ativo', atualizado_em = now()
     WHERE id = p_operador_id AND situacao = 'afastado';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_ajustar_situacao(uuid, text, date, date)
  FROM PUBLIC, anon, authenticated;

-- ── 5. Afastar ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_usuarios_afastar(
  p_empresa_id      uuid,
  p_operador_id     uuid,
  p_tipo            text,
  p_inicio          date,
  p_fim             date,     -- NULL = tempo indeterminado
  p_fora_das_contas boolean,
  p_observacao      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_sem_volta   CONSTANT date := DATE '9999-12-31';
  v_hoje        date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_obs         text := NULLIF(BTRIM(COALESCE(p_observacao, '')), '');
  v_fim         date := COALESCE(p_fim, c_sem_volta);
  v_fora        boolean := (p_tipo = 'ferias') OR COALESCE(p_fora_das_contas, false);
  v_pessoa      public.perfis%ROWTYPE;
  v_choque_tipo text;
  v_choque_ini  date;
  v_choque_fim  date;
  v_id          uuid;
BEGIN
  IF NOT public.fn_usuarios_pode_situacao() THEN
    RAISE EXCEPTION 'Seu cargo não pode mudar a situação de usuários.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  -- Trava a pessoa: duas gravações para ela esperam uma pela outra, e a
  -- segunda já vê a primeira ao conferir sobreposição.
  SELECT * INTO v_pessoa FROM public.perfis p
   WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A pessoa não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_usuarios_alcancados() a(id) WHERE a.id = p_operador_id) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;
  IF v_pessoa.situacao = 'desligado' THEN
    RAISE EXCEPTION 'Esta pessoa está desligada. Reative antes de lançar um afastamento.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ausencias_tipos t WHERE t.tipo = p_tipo) THEN
    RAISE EXCEPTION 'Motivo desconhecido: %.', COALESCE(p_tipo, '(vazio)') USING ERRCODE = '22023';
  END IF;
  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'Informe o primeiro dia do afastamento.' USING ERRCODE = '22023';
  END IF;
  -- Regra de 01/09/2026: férias sem data de retorno viram um estado sem fim.
  IF p_tipo = 'ferias' AND p_fim IS NULL THEN
    RAISE EXCEPTION 'Férias precisam de data de volta.' USING ERRCODE = '22023';
  END IF;
  IF v_fim < p_inicio THEN
    RAISE EXCEPTION 'O último dia (%) é anterior ao primeiro (%).',
      to_char(v_fim, 'DD/MM/YYYY'), to_char(p_inicio, 'DD/MM/YYYY') USING ERRCODE = '22023';
  END IF;
  IF v_fim < v_hoje THEN
    RAISE EXCEPTION 'Este período já terminou. Afastamento é para hoje ou para a frente.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'outros' AND v_obs IS NULL THEN
    RAISE EXCEPTION 'Em «Outros», escreva o motivo.' USING ERRCODE = '22023';
  END IF;
  IF v_obs IS NOT NULL AND char_length(v_obs) > 500 THEN
    RAISE EXCEPTION 'O motivo passou de 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  -- Férias marcadas pela tela antiga não têm linha em `ausencias`: a
  -- sobreposição abaixo não as veria.
  IF v_pessoa.situacao = 'ferias' AND p_tipo <> 'ferias'
     AND v_pessoa.ferias_ate IS NOT NULL AND v_pessoa.ferias_ate >= p_inicio
     AND NOT EXISTS (
       SELECT 1 FROM public.ausencias a
        WHERE a.operador_id = p_operador_id AND a.tipo = 'ferias'
          AND a.inicio <= v_hoje AND a.fim >= v_hoje)
  THEN
    RAISE EXCEPTION 'Esta pessoa está de férias até %. Volte ela para ativo antes.',
      to_char(v_pessoa.ferias_ate, 'DD/MM/YYYY') USING ERRCODE = '23P01';
  END IF;

  SELECT t.rotulo, a.inicio, a.fim
    INTO v_choque_tipo, v_choque_ini, v_choque_fim
    FROM public.ausencias a
    JOIN public.ausencias_tipos t ON t.tipo = a.tipo
   WHERE a.operador_id = p_operador_id
     AND a.inicio <= v_fim
     AND a.fim    >= p_inicio
   ORDER BY a.inicio
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Já existe % de % %. Encerre aquele antes de lançar outro.',
      v_choque_tipo, to_char(v_choque_ini, 'DD/MM/YYYY'),
      CASE WHEN v_choque_fim = c_sem_volta THEN 'sem data de volta'
           ELSE 'a ' || to_char(v_choque_fim, 'DD/MM/YYYY') END
      USING ERRCODE = '23P01';
  END IF;

  INSERT INTO public.ausencias (
    empresa_id, operador_id, tipo, inicio, fim, meio_periodo, observacao,
    fora_das_contas, criado_por, atualizado_por
  ) VALUES (
    p_empresa_id, p_operador_id, p_tipo, p_inicio, v_fim, false, v_obs,
    v_fora, auth.uid(), auth.uid()
  )
  RETURNING id INTO v_id;

  PERFORM public.fn_usuarios_ajustar_situacao(p_operador_id, NULL, NULL, NULL);
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_afastar(uuid, uuid, text, date, date, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_afastar(uuid, uuid, text, date, date, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.fn_usuarios_afastar(uuid, uuid, text, date, date, boolean, text) IS
  'Lança afastamento pela aba Usuários (p_fim NULL = indeterminado, gravado 9999-12-31). '
  'Recusa sobreposição e ajusta a situação. Porta: fn_usuarios_pode_situacao + alcance. 20261028100000.';

-- ── 6. Encerrar ────────────────────────────────────────────────────────────
--
-- «A pessoa voltou»: o último dia vira ONTEM. O que ainda não começou (ou
-- começou hoje) nunca aconteceu, e sai.

CREATE OR REPLACE FUNCTION public.fn_usuarios_encerrar_afastamento(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ontem date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;
  v_linha public.ausencias%ROWTYPE;
BEGIN
  IF NOT public.fn_usuarios_pode_situacao() THEN
    RAISE EXCEPTION 'Seu cargo não pode mudar a situação de usuários.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_linha FROM public.ausencias WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Afastamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_can_access_empresa(v_linha.empresa_id) THEN
    RAISE EXCEPTION 'Este afastamento é de outra empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_usuarios_alcancados() a(id) WHERE a.id = v_linha.operador_id) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.perfis p WHERE p.id = v_linha.operador_id FOR UPDATE;

  IF v_linha.inicio > v_ontem THEN
    DELETE FROM public.ausencias WHERE id = p_id;
  ELSIF v_linha.fim > v_ontem THEN
    UPDATE public.ausencias
       SET fim = v_ontem, atualizado_por = auth.uid(), atualizado_em = now()
     WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Este afastamento já terminou.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.fn_usuarios_ajustar_situacao(v_linha.operador_id, v_linha.tipo, v_linha.inicio, v_linha.fim);
  RETURN p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_encerrar_afastamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_encerrar_afastamento(uuid) TO authenticated;

-- ── 7. Ler os afastamentos ─────────────────────────────────────────────────
--
-- DEFINER porque a policy de `ausencias` é pelo alcance do Acompanhamento
-- (Comercial); aqui vale o da aba Usuários. `p_operador_id` nulo: só o que
-- está em curso ou vem pela frente, da empresa (etiquetas da lista).
-- Preenchido: o histórico daquela pessoa (ficha).

CREATE OR REPLACE FUNCTION public.fn_usuarios_afastamentos(p_empresa_id uuid, p_operador_id uuid DEFAULT NULL)
RETURNS TABLE (
  id              uuid,
  operador_id     uuid,
  tipo            text,
  rotulo          text,
  inicio          date,
  fim             date,      -- NULL = sem data de volta
  fora_das_contas boolean,
  observacao      text,
  criado_por_nome text,
  criado_em       timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT a.id, a.operador_id, a.tipo, t.rotulo, a.inicio,
         NULLIF(a.fim, DATE '9999-12-31'),
         a.fora_das_contas, a.observacao, cp.nome, a.criado_em
    FROM public.ausencias a
    JOIN public.ausencias_tipos t ON t.tipo = a.tipo
    LEFT JOIN public.perfis cp ON cp.id = a.criado_por
   WHERE a.empresa_id = p_empresa_id
     AND public.fn_can_access_empresa(p_empresa_id)
     AND (SELECT public.fn_user_tem('ver_usuarios') OR public.fn_user_is_super_admin())
     AND a.operador_id IN (SELECT public.fn_usuarios_alcancados())
     AND CASE WHEN p_operador_id IS NULL
              THEN a.fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
              ELSE a.operador_id = p_operador_id END
   ORDER BY a.inicio DESC
   LIMIT 2000;
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_afastamentos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_afastamentos(uuid, uuid) TO authenticated;

-- ── 8. Começa e termina sozinho ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_usuarios_afastamentos_diario()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_a    integer;
  v_b    integer;
BEGIN
  UPDATE public.perfis p
     SET situacao = 'afastado', atualizado_em = now()
   WHERE p.situacao = 'ativo'
     AND EXISTS (
       SELECT 1 FROM public.ausencias a
        WHERE a.operador_id = p.id AND a.tipo <> 'ferias' AND a.fora_das_contas
          AND a.inicio <= v_hoje AND a.fim >= v_hoje);
  GET DIAGNOSTICS v_a = ROW_COUNT;

  UPDATE public.perfis p
     SET situacao = 'ativo', atualizado_em = now()
   WHERE p.situacao = 'afastado'
     AND NOT EXISTS (
       SELECT 1 FROM public.ausencias a
        WHERE a.operador_id = p.id AND a.tipo <> 'ferias' AND a.fora_das_contas
          AND a.inicio <= v_hoje AND a.fim >= v_hoje);
  GET DIAGNOSTICS v_b = ROW_COUNT;

  RETURN v_a + v_b;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_usuarios_afastamentos_diario() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_usuarios_afastamentos_diario() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('usuarios-afastamentos-diario')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'usuarios-afastamentos-diario');
    -- 00:25 de São Paulo: depois do fim (03:15 UTC) e do início (03:20) das férias.
    PERFORM cron.schedule('usuarios-afastamentos-diario', '25 3 * * *',
      'SELECT public.fn_usuarios_afastamentos_diario();');
  END IF;
END;
$$;

-- ── 9. Ignorar ─────────────────────────────────────────────────────────────
--
-- Decisão do Cleber: ignorar só zera a contagem. Se a pessoa ficar mais 4
-- dias úteis sem entrar a partir dali, o aviso volta.

CREATE TABLE IF NOT EXISTS public.uso_atencao_ignorados (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid        NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  operador_id  uuid        NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,
  ignorado_por uuid        REFERENCES public.perfis(id) ON DELETE SET NULL,
  ignorado_em  timestamptz NOT NULL DEFAULT now(),
  comentario   text        NOT NULL CHECK (BTRIM(comentario) <> '' AND char_length(comentario) <= 500)
);

COMMENT ON TABLE public.uso_atencao_ignorados IS
  'Cada «ignorar» dos pontos de atenção de uso: a contagem de dias sem entrar '
  'recomeça daqui. Escrita só por fn_uso_atencao_ignorar. 20261028100000.';

CREATE INDEX IF NOT EXISTS idx_uso_atencao_ignorados_operador
  ON public.uso_atencao_ignorados (operador_id, ignorado_em DESC);
CREATE INDEX IF NOT EXISTS idx_uso_atencao_ignorados_por
  ON public.uso_atencao_ignorados (ignorado_por);
CREATE INDEX IF NOT EXISTS idx_uso_atencao_ignorados_empresa
  ON public.uso_atencao_ignorados (empresa_id);

ALTER TABLE public.uso_atencao_ignorados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.uso_atencao_ignorados FROM anon;

DROP POLICY IF EXISTS uso_atencao_ignorados_select ON public.uso_atencao_ignorados;
CREATE POLICY uso_atencao_ignorados_select ON public.uso_atencao_ignorados
  FOR SELECT TO authenticated
  USING (operador_id IN (SELECT public.fn_usuarios_alcancados()));

CREATE OR REPLACE FUNCTION public.fn_uso_atencao_ignorar(p_empresa_id uuid, p_operador_id uuid, p_comentario text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_txt text := NULLIF(BTRIM(COALESCE(p_comentario, '')), '');
  v_id  uuid;
BEGIN
  IF NOT public.fn_usuarios_pode_situacao() THEN
    RAISE EXCEPTION 'Seu cargo não pode mudar a situação de usuários.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'A pessoa não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_usuarios_alcancados() a(id) WHERE a.id = p_operador_id) THEN
    RAISE EXCEPTION 'Esta pessoa está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;
  IF v_txt IS NULL THEN
    RAISE EXCEPTION 'Escreva um comentário curto (ex.: «conversei, vai voltar a usar»).' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_txt) > 500 THEN
    RAISE EXCEPTION 'O comentário passou de 500 caracteres.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.uso_atencao_ignorados (empresa_id, operador_id, ignorado_por, comentario)
  VALUES (p_empresa_id, p_operador_id, auth.uid(), v_txt)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_uso_atencao_ignorar(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_uso_atencao_ignorar(uuid, uuid, text) TO authenticated;

-- ── 10. Os pontos de atenção ───────────────────────────────────────────────
--
-- Para cada pessoa do alcance:
--
--   1. Quem entra: cargo que conta no recebimento (operador, elite), ativo,
--      situação `ativo`, não robô, não arquivado, nome sem «superv» (regra do
--      Cleber, 27/10: conta de supervisão não é pessoa).
--   2. Último sinal de uso: o MAIOR entre `uso_sessoes` (abriu o sistema),
--      `uso_telas` (navegou), `presenca_online` (batida de 60 s) e o último
--      login. Quatro fontes independentes: uma falhar não acusa ninguém.
--   3. Ponto de partida: o MAIOR entre o último sinal, a criação da conta, o
--      último «ignorar» e o fim do último afastamento.
--   4. Dias que contam: úteis, DEPOIS da partida e ANTES de hoje (hoje ainda
--      não acabou), menos feriados da empresa, menos dias cobertos por
--      qualquer ausência da pessoa, menos DIAS SEM TELEMETRIA — dia em que
--      menos de 20% dos operadores da empresa tem linha em `uso_sessoes`. Se
--      o registro caiu para todo mundo, o dia não acusa ninguém.
--   5. Avisa com 4 dias (aprendiz: 5, porque folga terça ou quarta e o
--      cadastro não diz qual).
--
-- A janela olha no máximo 90 dias para trás.

CREATE OR REPLACE FUNCTION public.fn_uso_pontos_de_atencao(p_empresa_id uuid)
RETURNS TABLE (
  operador_id         uuid,
  nome                text,
  foto_url            text,
  setor_nome          text,
  equipe_nome         text,
  menor_aprendiz      boolean,
  ultimo_uso          date,      -- NULL = nunca usou
  dias_sem_uso        integer,
  limite              integer,
  ignorado_em         timestamptz,
  ignorado_comentario text,
  ignorado_por_nome   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH hoje AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  janela AS (
    SELECT g::date AS dia
      FROM generate_series((SELECT d FROM hoje) - 90, (SELECT d FROM hoje) - 1, interval '1 day') g
  ),
  feriados AS (
    SELECT DISTINCT left(f, 10) AS dia
      FROM public.metas_config_mes m,
           -- O CASE vem antes de abrir a lista: valor que não é array não quebra a consulta.
           LATERAL jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(m.feriados::jsonb) = 'array' THEN m.feriados::jsonb
                  ELSE '[]'::jsonb END) f
     WHERE m.empresa_id = p_empresa_id
       AND make_date(m.ano, m.mes, 1) >= date_trunc('month', (SELECT d FROM hoje) - 90)::date
  ),
  operadores_empresa AS (
    SELECT count(*) AS n
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.empresa_id = p_empresa_id
       AND c.conta_no_recebimento AND p.ativo
       AND COALESCE(p.situacao, 'ativo') = 'ativo'
       AND NOT COALESCE(p.robo, false)
  ),
  telemetria AS (
    SELECT s.dia, count(DISTINCT s.usuario_id) AS n
      FROM public.uso_sessoes s
     WHERE s.empresa_id = p_empresa_id
       AND s.dia >= (SELECT d FROM hoje) - 90
     GROUP BY s.dia
  ),
  dias_validos AS (
    SELECT j.dia
      FROM janela j
      JOIN telemetria t ON t.dia = j.dia
     WHERE extract(isodow FROM j.dia) < 6
       AND to_char(j.dia, 'YYYY-MM-DD') NOT IN (SELECT dia FROM feriados)
       AND t.n >= GREATEST(1, 0.2 * (SELECT n FROM operadores_empresa))
  ),
  alvo AS (
    SELECT p.id, p.nome, p.foto_url, p.setor_id, p.equipe_id,
           COALESCE(p.menor_aprendiz, false) AS aprendiz,
           (p.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS criado
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.empresa_id = p_empresa_id
       AND public.fn_can_access_empresa(p_empresa_id)
       AND (SELECT public.fn_user_tem('ver_usuarios') OR public.fn_user_is_super_admin())
       AND p.id IN (SELECT public.fn_usuarios_alcancados())
       AND c.conta_no_recebimento
       AND p.ativo
       AND COALESCE(p.situacao, 'ativo') = 'ativo'
       AND NOT COALESCE(p.robo, false)
       AND NOT COALESCE(p.arquivado, false)
       AND p.nome !~* 'superv'
  ),
  base AS (
    SELECT a.*,
           GREATEST(
             (SELECT max(s.dia) FROM public.uso_sessoes s WHERE s.usuario_id = a.id),
             (SELECT max(t.dia) FROM public.uso_telas t WHERE t.usuario_id = a.id),
             (SELECT (o.visto_em AT TIME ZONE 'America/Sao_Paulo')::date
                FROM public.presenca_online o WHERE o.user_id = a.id),
             (SELECT (u.last_sign_in_at AT TIME ZONE 'America/Sao_Paulo')::date
                FROM auth.users u WHERE u.id = a.id)
           ) AS ultimo_uso,
           (SELECT i.id FROM public.uso_atencao_ignorados i
             WHERE i.operador_id = a.id ORDER BY i.ignorado_em DESC LIMIT 1) AS ignorado_id,
           (SELECT max(au.fim) FROM public.ausencias au
             WHERE au.operador_id = a.id AND au.fim < (SELECT d FROM hoje)) AS ausencia_fim
      FROM alvo a
  ),
  partida AS (
    SELECT b.*, i.ignorado_em, i.comentario, ip.nome AS ignorado_por_nome,
           GREATEST(b.ultimo_uso, b.criado,
                    (i.ignorado_em AT TIME ZONE 'America/Sao_Paulo')::date,
                    b.ausencia_fim) AS desde
      FROM base b
      LEFT JOIN public.uso_atencao_ignorados i ON i.id = b.ignorado_id
      LEFT JOIN public.perfis ip ON ip.id = i.ignorado_por
  ),
  contagem AS (
    SELECT pa.id, count(dv.dia)::int AS dias
      FROM partida pa
      JOIN dias_validos dv ON dv.dia > pa.desde
     WHERE NOT EXISTS (
       SELECT 1 FROM public.ausencias au
        WHERE au.operador_id = pa.id AND dv.dia BETWEEN au.inicio AND au.fim)
     GROUP BY pa.id
  )
  SELECT pa.id, pa.nome, pa.foto_url, s.nome, e.nome, pa.aprendiz,
         pa.ultimo_uso, ct.dias,
         CASE WHEN pa.aprendiz THEN 5 ELSE 4 END,
         pa.ignorado_em, pa.comentario, pa.ignorado_por_nome
    FROM partida pa
    JOIN contagem ct ON ct.id = pa.id
    LEFT JOIN public.setores s ON s.id = pa.setor_id
    LEFT JOIN public.equipes e ON e.id = pa.equipe_id
   WHERE ct.dias >= CASE WHEN pa.aprendiz THEN 5 ELSE 4 END
   ORDER BY ct.dias DESC, pa.nome;
$function$;

REVOKE ALL ON FUNCTION public.fn_uso_pontos_de_atencao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_uso_pontos_de_atencao(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_uso_pontos_de_atencao(uuid) IS
  'Quem está ativo e há 4+ dias úteis (aprendiz 5+) sem abrir o Gestão, no alcance '
  'da aba Usuários. Quatro fontes de uso; dia sem telemetria não conta. 20261028100000.';

-- ── 11. Afastado sai das contas como férias ────────────────────────────────

-- Ranking do Analítico (corpo de 20261023120000; só muda a situação).
CREATE OR REPLACE FUNCTION public.fn_analitico_ranking_pessoas(
  p_empresa_id UUID,
  p_ids        UUID[]
)
RETURNS TABLE (
  id              UUID,
  foto_url        TEXT,
  fora_do_ranking BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_tem('ver_analitico')
     OR NOT public.fn_user_tem('analitico_sub_analitico')
     OR NOT public.fn_user_tem('analitico_sub_ranking') THEN
    RETURN;
  END IF;

  -- O ranking de uma empresa não passa de algumas centenas de pessoas.
  IF coalesce(cardinality(p_ids), 0) = 0 OR cardinality(p_ids) > 1000 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         p.foto_url,
         -- A mesma regra de `buscarForaDoRanking`: férias ou afastado, ou cargo
         -- que não conta no recebimento (cargo desconhecido também fica fora).
         (coalesce(p.situacao IN ('ferias', 'afastado'), false)
          OR (p.perfil IS NOT NULL AND NOT coalesce(c.conta_no_recebimento, false)))
    FROM public.perfis p
    LEFT JOIN public.cargos c ON c.slug = p.perfil
   WHERE p.id = ANY (p_ids)
     AND p.empresa_id = p_empresa_id;
END;
$function$;

-- Modo TV (corpo de 20261027200000; só muda a situação no ranking).
CREATE OR REPLACE FUNCTION public.fn_tv_numeros_calcular(p_setor uuid, p_equipe uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_setor       public.setores%ROWTYPE;
  v_emp         UUID;
  v_hoje        DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_mes         DATE;
  v_fim         DATE;
  v_mes_txt     TEXT;
  v_total       NUMERIC := 0;
  v_total_ho    NUMERIC := 0;
  v_qtd         BIGINT  := 0;
  v_hoje_total  NUMERIC := 0;
  v_hoje_ho     NUMERIC := 0;
  v_meta        NUMERIC := 0;
  v_dias        JSONB;
  v_ranking     JSONB;
  v_serie       JSONB;
  v_membros     UUID[];
  v_alvo_nome   TEXT;
  v_alternativo BOOLEAN;
BEGIN
  v_mes     := date_trunc('month', v_hoje)::DATE;
  v_fim     := (v_mes + INTERVAL '1 month - 1 day')::DATE;
  v_mes_txt := to_char(v_hoje, 'YYYY-MM');

  SELECT * INTO v_setor FROM public.setores WHERE id = p_setor;
  IF v_setor.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_emp := v_setor.empresa_id;
  v_alternativo := COALESCE(v_setor.alternativo, FALSE);

  IF p_equipe IS NULL THEN
    v_alvo_nome := v_setor.nome;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
      INTO v_total, v_total_ho, v_qtd
      FROM public.fn_recebido_por_setor(ARRAY[v_emp], v_mes_txt, v_mes, v_fim) r
     WHERE r.setor_id = p_setor;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0)
      INTO v_hoje_total, v_hoje_ho
      FROM public.fn_recebido_por_setor(ARRAY[v_emp], v_mes_txt, v_hoje, v_hoje) r
     WHERE r.setor_id = p_setor;

    SELECT COALESCE(MAX(m.meta_valor), 0) INTO v_meta
      FROM public.metas m
     WHERE m.empresa_id = v_emp AND m.tipo = 'setor' AND m.referencia_id = p_setor
       AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT;
  ELSE
    SELECT e.nome INTO v_alvo_nome FROM public.equipes e WHERE e.id = p_equipe;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0), COALESCE(r.qtd, 0)
      INTO v_total, v_total_ho, v_qtd
      FROM public.fn_recebido_por_equipe(ARRAY[v_emp], v_mes_txt, v_mes, v_fim, TRUE, NULL, NULL) r
     WHERE r.equipe_id = p_equipe;

    SELECT COALESCE(r.total, 0), COALESCE(r.total_ho, 0)
      INTO v_hoje_total, v_hoje_ho
      FROM public.fn_recebido_por_equipe(ARRAY[v_emp], v_mes_txt, v_hoje, v_hoje, TRUE, NULL, NULL) r
     WHERE r.equipe_id = p_equipe;

    SELECT COALESCE(MAX(m.meta_valor), 0) INTO v_meta
      FROM public.metas m
     WHERE m.empresa_id = v_emp AND m.tipo = 'equipe' AND m.referencia_id = p_equipe
       AND m.mes = EXTRACT(MONTH FROM v_mes)::INT AND m.ano = EXTRACT(YEAR FROM v_mes)::INT;
  END IF;

  -- A régua de dia útil do sistema (a mesma de lib/diasUteis.ts).
  v_dias := public.fn_tv_metricas_setor(v_emp, p_setor, v_mes);

  -- Quem é do alvo: membro, líder e clone que conta no recebimento. Uma vez,
  -- para o ranking e para a série.
  v_membros := ARRAY(
    SELECT p.id FROM public.perfis p
     WHERE p.empresa_id = v_emp
       AND ((p_equipe IS NULL AND p.setor_id = p_setor) OR p.equipe_id = p_equipe)
    UNION
    SELECT el.lider_id FROM public.equipe_lideres el
      JOIN public.equipes e ON e.id = el.equipe_id
     WHERE (p_equipe IS NULL AND e.setor_id = p_setor) OR el.equipe_id = p_equipe
    UNION
    SELECT cl.operador_id FROM public.equipe_operadores_clones cl
      JOIN public.equipes e ON e.id = cl.equipe_id
     WHERE cl.conta_recebimento IS TRUE
       AND ((p_equipe IS NULL AND e.setor_id = p_setor) OR cl.equipe_id = p_equipe)
  );

  -- O ranking: quem conta no recebimento, dentro do alvo. No setor normal só
  -- as linhas carimbadas nele («só no setor da pessoa»); no alternativo, as
  -- linhas da pessoa, como em fn_recebido_por_setor.
  WITH pessoas AS (
    SELECT p.id, p.nome, p.foto_url
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE p.id = ANY (v_membros)
       AND c.conta_no_recebimento
       AND COALESCE(p.situacao, '') NOT IN ('ferias', 'afastado')
       AND NOT COALESCE(p.robo, FALSE)
  ),
  movimento AS (
    SELECT ar.operador_id, ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
      FROM public.analitico_recebimentos ar
     WHERE ar.empresa_id = v_emp
       AND ar.data_pagamento >= v_mes AND ar.data_pagamento <= v_fim
       AND ar.operador_id IN (SELECT id FROM pessoas)
       AND (v_alternativo OR p_equipe IS NOT NULL OR ar.setor_id = p_setor OR ar.setor_id IS NULL)
    UNION ALL
    SELECT x.operador_id, x.valor, x.valor_ho
      FROM public.fn_ajustes_recebimento(ARRAY[v_emp], v_mes, v_fim) x
     WHERE x.alvo = 'operador'
       AND x.operador_id IN (SELECT id FROM pessoas)
  ),
  somado AS (
    SELECT ps.id, ps.nome, ps.foto_url,
           SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS valor_ho
      FROM pessoas ps
      JOIN movimento mv ON mv.operador_id = ps.id
     GROUP BY ps.id, ps.nome, ps.foto_url
    HAVING SUM(mv.valor) > 0
     ORDER BY SUM(mv.valor) DESC
     LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'nome', s.nome, 'foto', s.foto_url,
           'valor', ROUND(s.valor, 2), 'valor_ho', ROUND(s.valor_ho, 2))
         ORDER BY s.valor DESC), '[]'::JSONB)
    INTO v_ranking
    FROM somado s;

  -- A série por dia (só dias com movimento). É o FORMATO do mês: a tela a
  -- escala para fechar no total oficial — ver o cabeçalho de 20261027200000.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'dia', d.dia, 'valor', ROUND(d.valor, 2), 'valor_ho', ROUND(d.ho, 2))
         ORDER BY d.dia), '[]'::JSONB)
    INTO v_serie
    FROM (
      SELECT mv.dia, SUM(mv.valor)::NUMERIC AS valor, SUM(mv.ho)::NUMERIC AS ho
        FROM (
          SELECT ar.data_pagamento AS dia, ar.valor_recebido AS valor, COALESCE(ar.total_ho, 0) AS ho
            FROM public.analitico_recebimentos ar
           WHERE ar.empresa_id = v_emp
             AND ar.data_pagamento >= v_mes AND ar.data_pagamento <= v_fim
             AND CASE WHEN p_equipe IS NULL AND NOT v_alternativo
                      THEN ar.setor_id = p_setor
                      ELSE ar.operador_id = ANY (v_membros) END
          UNION ALL
          SELECT x.dia, x.valor, x.valor_ho
            FROM public.fn_ajustes_recebimento(ARRAY[v_emp], v_mes, v_fim) x
           WHERE (p_equipe IS NULL AND x.setor_id = p_setor)
              OR (p_equipe IS NOT NULL AND (x.equipe_id = p_equipe OR x.operador_id = ANY (v_membros)))
        ) mv
       GROUP BY mv.dia
    ) d;

  RETURN jsonb_build_object(
    'alvo_nome',       v_alvo_nome,
    'alvo_tipo',       CASE WHEN p_equipe IS NULL THEN 'setor' ELSE 'equipe' END,
    'regra',           COALESCE(to_jsonb(v_setor)->>'regra', 'nosso_produto'),
    'ho_percentual',   (SELECT em.config->'ho_percentual' FROM public.empresas em WHERE em.id = v_emp),
    'mes',             v_mes_txt,
    'hoje',            v_hoje,
    'meta',            ROUND(v_meta, 2),
    'recebido',        ROUND(v_total, 2),
    'recebido_ho',     ROUND(v_total_ho, 2),
    'recebido_hoje',   ROUND(v_hoje_total, 2),
    'recebido_hoje_ho', ROUND(v_hoje_ho, 2),
    'pagamentos',      v_qtd,
    'dias_uteis',      COALESCE((v_dias->>'dias_uteis')::INT, 0),
    'dias_decorridos', COALESCE((v_dias->>'dias_decorridos')::INT, 0),
    'ranking',         v_ranking,
    'serie',           v_serie,
    'calculado_em',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 12. Conferência ────────────────────────────────────────────────────────

DO $conf$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ausencias_tipos WHERE tipo = 'licenca_maternidade') THEN
    RAISE EXCEPTION 'licenca_maternidade não entrou em ausencias_tipos.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_uso_pontos_de_atencao(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_uso_pontos_de_atencao não pode ser do anon.';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_usuarios_ajustar_situacao(uuid,text,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_usuarios_ajustar_situacao é interna.';
  END IF;
  IF pg_get_functiondef('public.fn_tv_numeros_calcular(uuid,uuid)'::regprocedure) !~ '''serie''' THEN
    RAISE EXCEPTION 'fn_tv_numeros_calcular perdeu a série.';
  END IF;
END
$conf$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261028100000', 'afastamentos_e_atencao_de_uso', ARRAY[]::TEXT[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
