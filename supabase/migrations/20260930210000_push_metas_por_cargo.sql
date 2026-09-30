-- ============================================================================
-- Avisos de META por cargo — 30/09/2026
-- ============================================================================
--
-- Pedido do usuário (30/09/2026), com o exemplo aprovado:
--
--   Operação — avisos de pagamento e aviso de quando ELE MESMO alcança uma
--              meta: na 1ª faixa «Parabéns, Maria / Você alcançou a 1ª meta do
--              mês.»; da 2ª em diante só «Você alcançou a 2ª meta!».
--   Elite    — o mesmo da operação e, cada uma ligada à parte na visão Equipe:
--              metas alcançadas pelos operadores da equipe, resumo da equipe a
--              cada hora e «equipe alcançou a meta». Começam desligadas.
--   Líder    — sempre (quando o aparelho e a chave `ver_painel_lider`
--              permitem): resumo da equipe a cada hora, cada operador que
--              alcança uma meta e a equipe que alcança a meta.
--
-- O aviso «equipe alcançou a meta» deixa de ir para a equipe toda (decisão de
-- 30/09/2026 que substitui a 11 da spec da liderança).
--
-- ## Meta do operador: por estado, como a da equipe
--
-- Antes, o aviso da própria meta saía do lote de pagamentos (antes × depois do
-- lote) e só para quem tinha aparelho. O líder precisa saber da meta de TODO
-- operador, com ou sem aparelho — então a meta passa a ser conferida por estado,
-- na mesma marca que a importação já grava (`push_equipes_verificar`):
-- «em que faixa cada operador está agora?». Cada faixa alcançada vira uma linha
-- em `push_marcos_operador` (única por pessoa, mês e faixa); só as novas avisam,
-- e só a MAIOR delas quando o lote pula mais de uma. Reimportar não avisa.
-- Ao ligar, grava as faixas que já estão alcançadas no mês.
--
-- O recebido e os degraus são os de `fn_push_pegar_lote` (o card «Progresso da
-- meta»: H.O. na PaguePlay, ajuste manual incluído) — a mesma régua que o aviso
-- antigo usava.
--
-- ## Quem recebe os avisos da equipe
--
-- `fn_push_destinatarios_equipe(chave)`: quem lidera a equipe (a regra do
-- Painel) e quem trabalha nela e conta no recebimento, com `ver_painel_lider`,
-- ativo e com aparelho. `lider` recebe sempre; os outros só com a chave ligada
-- em `push_preferencias` (`resumo_equipe`, `metas_operadores`, `meta_equipe`).
--
-- A `enviar-push` passa a chamar `fn_push_metas_da_rodada` (equipes e
-- operadores juntos). `fn_push_metas_equipe_batidas` fica respondendo vazio, sem
-- consumir a marca — assim a versão anterior da função, no ar até o deploy,
-- não gasta a verificação.
--
-- Tabela nova, colunas novas, funções novas; redefinidas
-- `fn_push_destinatarios_resumo`, `fn_push_metas_equipe_batidas` e
-- `fn_push_enfileirar`. Nenhuma linha existente muda. Reexecutável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE public.push_config
  ADD COLUMN IF NOT EXISTS avisar_meta_operador BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.push_preferencias
  ADD COLUMN IF NOT EXISTS metas_operadores BOOLEAN,
  ADD COLUMN IF NOT EXISTS meta_equipe      BOOLEAN;

-- ── Quem recebe cada aviso da equipe ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_push_destinatarios_equipe(p_chave TEXT)
RETURNS TABLE(equipe_id UUID, empresa_id UUID, perfil_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  com_aparelho AS (
    SELECT DISTINCT i.perfil_id FROM public.push_inscricoes i
  ),
  empresas AS (
    SELECT ARRAY(SELECT DISTINCT p.empresa_id
                   FROM public.perfis p JOIN com_aparelho c ON c.perfil_id = p.id
                  WHERE p.empresa_id IS NOT NULL) AS ids
  ),
  candidatos AS (
    -- Quem lidera (a regra do Painel + o elite que lidera pelo vínculo).
    SELECT q.equipe_id, q.perfil_id
      FROM empresas
      CROSS JOIN LATERAL public.fn_push_quem_lidera(empresas.ids) q
      JOIN com_aparelho c ON c.perfil_id = q.perfil_id
    UNION
    -- Quem trabalha na equipe e conta no recebimento (a visão Equipe do elite).
    SELECT p.equipe_id, p.id
      FROM public.perfis p
      JOIN com_aparelho c ON c.perfil_id = p.id
     WHERE p.equipe_id IS NOT NULL
       AND p.perfil IN ('operador', 'elite')
    UNION
    SELECT cl.equipe_id, cl.operador_id
      FROM public.equipe_operadores_clones cl
      JOIN com_aparelho c ON c.perfil_id = cl.operador_id
      JOIN public.perfis p ON p.id = cl.operador_id
     WHERE cl.conta_recebimento IS TRUE
       AND p.perfil IN ('operador', 'elite')
  )
  SELECT ca.equipe_id, e.empresa_id, ca.perfil_id
    FROM candidatos ca
    JOIN public.equipes e ON e.id = ca.equipe_id
    JOIN public.perfis  p ON p.id = ca.perfil_id
    LEFT JOIN public.push_preferencias pr ON pr.perfil_id = p.id
   WHERE CASE
           WHEN p.perfil = 'lider'            THEN TRUE
           WHEN p_chave = 'resumo_equipe'     THEN pr.resumo_equipe    IS TRUE
           WHEN p_chave = 'metas_operadores'  THEN pr.metas_operadores IS TRUE
           WHEN p_chave = 'meta_equipe'       THEN pr.meta_equipe      IS TRUE
           ELSE FALSE
         END
     AND public.fn_push_pode_receber(p.id, e.empresa_id)
     AND public.fn_perfil_tem(p.id, 'ver_painel_lider');
$function$;

REVOKE ALL ON FUNCTION public.fn_push_destinatarios_equipe(TEXT) FROM PUBLIC, anon, authenticated;

-- O resumo por hora passa a usar a mesma regra: líder sempre.
CREATE OR REPLACE FUNCTION public.fn_push_destinatarios_resumo()
RETURNS TABLE(equipe_id UUID, empresa_id UUID, perfil_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.equipe_id, d.empresa_id, d.perfil_id
    FROM public.fn_push_destinatarios_equipe('resumo_equipe') d;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_destinatarios_resumo() FROM PUBLIC, anon, authenticated;

-- ── Preferências: as três chaves ────────────────────────────────────────────
-- `fixo`: quem só lidera recebe sempre — a tela mostra «sempre avisa» em vez
-- das chaves.
CREATE OR REPLACE FUNCTION public.fn_push_minhas_preferencias()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'fixo',             COALESCE(p.perfil = 'lider', FALSE),
    'resumo_equipe',    COALESCE(p.perfil = 'lider', FALSE) OR COALESCE(pr.resumo_equipe, FALSE),
    'metas_operadores', COALESCE(p.perfil = 'lider', FALSE) OR COALESCE(pr.metas_operadores, FALSE),
    'meta_equipe',      COALESCE(p.perfil = 'lider', FALSE) OR COALESCE(pr.meta_equipe, FALSE)
  )
    FROM (SELECT (SELECT auth.uid()) AS id) eu
    LEFT JOIN public.perfis p ON p.id = eu.id
    LEFT JOIN public.push_preferencias pr ON pr.perfil_id = eu.id;
$function$;

CREATE OR REPLACE FUNCTION public.fn_push_definir_preferencia(p_chave TEXT, p_ligado BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_eu UUID := (SELECT auth.uid());
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'sem sessão';
  END IF;
  IF p_chave NOT IN ('resumo_equipe', 'metas_operadores', 'meta_equipe') THEN
    RAISE EXCEPTION 'preferência desconhecida: %', p_chave;
  END IF;
  INSERT INTO public.push_preferencias (perfil_id, resumo_equipe, metas_operadores, meta_equipe, atualizado_em)
  VALUES (v_eu,
          CASE WHEN p_chave = 'resumo_equipe'    THEN p_ligado END,
          CASE WHEN p_chave = 'metas_operadores' THEN p_ligado END,
          CASE WHEN p_chave = 'meta_equipe'      THEN p_ligado END,
          now())
  ON CONFLICT (perfil_id) DO UPDATE
     SET resumo_equipe    = CASE WHEN p_chave = 'resumo_equipe'    THEN p_ligado ELSE push_preferencias.resumo_equipe END,
         metas_operadores = CASE WHEN p_chave = 'metas_operadores' THEN p_ligado ELSE push_preferencias.metas_operadores END,
         meta_equipe      = CASE WHEN p_chave = 'meta_equipe'      THEN p_ligado ELSE push_preferencias.meta_equipe END,
         atualizado_em    = now();
  RETURN p_ligado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_minhas_preferencias() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_push_definir_preferencia(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_push_minhas_preferencias() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_definir_preferencia(TEXT, BOOLEAN) TO authenticated;

-- ── Em que faixa cada operador está ─────────────────────────────────────────
-- A régua de `fn_push_pegar_lote` (o card «Progresso da meta»): recebido do mês
-- + ajuste manual, em H.O. na PaguePlay; degraus = meta + metas extras, na
-- mesma unidade. `faixa` = quantos degraus o recebido alcançou (`faixasBatidas`).
CREATE OR REPLACE FUNCTION public.fn_push_operadores_na_faixa(p_empresas UUID[], p_mes TEXT)
RETURNS TABLE(perfil_id UUID, empresa_id UUID, faixa INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  ref AS (SELECT to_date(p_mes || '-01', 'YYYY-MM-DD') AS ini),
  pct AS (SELECT public.fn_pp_ho_percentual() AS v),
  emp AS (
    SELECT em.id, (em.slug = 'pagueplay') AS em_ho
      FROM public.empresas em
     WHERE em.id = ANY (p_empresas)
  ),
  metas_op AS (
    SELECT DISTINCT ON (m.referencia_id, m.empresa_id)
           m.referencia_id AS perfil_id, m.empresa_id, m.meta_valor, m.metas_extras
      FROM public.metas m, ref
     WHERE m.empresa_id = ANY (p_empresas)
       AND m.tipo = 'operador'
       AND m.mes  = EXTRACT(MONTH FROM ref.ini)
       AND m.ano  = EXTRACT(YEAR  FROM ref.ini)
     ORDER BY m.referencia_id, m.empresa_id
  ),
  receb AS (
    SELECT ar.operador_id AS perfil_id, ar.empresa_id,
           SUM(CASE WHEN e.em_ho THEN COALESCE(ar.total_ho, 0) ELSE ar.valor_recebido END) AS v
      FROM public.analitico_recebimentos ar
      JOIN emp e ON e.id = ar.empresa_id, ref
     WHERE ar.operador_id IN (SELECT mo.perfil_id FROM metas_op mo)
       AND ar.data_pagamento >= ref.ini
       AND ar.data_pagamento <  (ref.ini + INTERVAL '1 month')::DATE
     GROUP BY ar.operador_id, ar.empresa_id
  ),
  ajuste AS (
    SELECT a.operador_id AS perfil_id, a.empresa_id,
           SUM(a.valor) * CASE WHEN e.em_ho THEN (SELECT v FROM pct) ELSE 1 END AS v
      FROM public.analitico_ajustes_manuais a
      JOIN emp e ON e.id = a.empresa_id, ref
     WHERE a.operador_id IN (SELECT mo.perfil_id FROM metas_op mo)
       AND a.mes_referencia = ref.ini
       AND a.cancelado IS NOT TRUE
     GROUP BY a.operador_id, a.empresa_id, e.em_ho
  ),
  total AS (
    SELECT mo.perfil_id, mo.empresa_id,
           COALESCE(r.v, 0) + COALESCE(aj.v, 0) AS recebido
      FROM metas_op mo
      LEFT JOIN receb  r  ON r.perfil_id  = mo.perfil_id AND r.empresa_id  = mo.empresa_id
      LEFT JOIN ajuste aj ON aj.perfil_id = mo.perfil_id AND aj.empresa_id = mo.empresa_id
  ),
  degraus AS (
    SELECT mo.perfil_id, mo.empresa_id,
           ROUND(d.v * CASE WHEN e.em_ho THEN (SELECT v FROM pct) ELSE 1 END, 2) AS valor
      FROM metas_op mo
      JOIN emp e ON e.id = mo.empresa_id
      CROSS JOIN LATERAL (
        SELECT mo.meta_valor::NUMERIC AS v
        UNION ALL
        SELECT x::NUMERIC FROM jsonb_array_elements_text(COALESCE(mo.metas_extras, '[]'::JSONB)) x
      ) d
     WHERE d.v > 0
  )
  SELECT t.perfil_id, t.empresa_id, COUNT(*)::INT AS faixa
    FROM total t
    JOIN degraus g ON g.perfil_id = t.perfil_id AND g.empresa_id = t.empresa_id
   WHERE t.recebido >= g.valor
   GROUP BY t.perfil_id, t.empresa_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_operadores_na_faixa(UUID[], TEXT) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_marcos_operador (
  perfil_id   UUID        NOT NULL,
  mes         TEXT        NOT NULL,
  faixa       INT         NOT NULL,
  empresa_id  UUID        NOT NULL,
  batida_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'semente' (já estava alcançada ao ligar) | 'avisado'
  origem      TEXT        NOT NULL DEFAULT 'avisado',
  PRIMARY KEY (perfil_id, mes, faixa)
);

ALTER TABLE public.push_marcos_operador ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_marcos_operador FROM anon, authenticated;

COMMENT ON TABLE public.push_marcos_operador IS
  'Uma linha por faixa de meta alcancada pelo operador no mes: so as novas '
  'avisam (a pessoa e quem lidera). Semente ao ligar (20260930210000).';

/*
 * A rodada das METAS: consome as marcas da importação e devolve, de uma vez,
 *   • equipes que alcançaram a meta agora, com os destinatários;
 *   • operadores que alcançaram faixa nova agora (só a maior), com
 *     `proprio` (a pessoa tem para onde receber) e, por equipe dela, quem
 *     recebe o aviso de meta de operador (sem a própria pessoa).
 */
CREATE OR REPLACE FUNCTION public.fn_push_metas_da_rodada()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes      TEXT := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM');
  v_empresas UUID[];
  v_cfg      public.push_config%ROWTYPE;
  v_equipes  JSONB := '[]'::JSONB;
  v_ops      JSONB := '[]'::JSONB;
BEGIN
  WITH pegas AS (
    DELETE FROM public.push_equipes_verificar RETURNING empresa_id, mes
  )
  SELECT ARRAY(SELECT DISTINCT p.empresa_id FROM pegas p WHERE p.mes = v_mes)
    INTO v_empresas;

  SELECT * INTO v_cfg FROM public.push_config WHERE ativo;
  IF NOT FOUND OR COALESCE(array_length(v_empresas, 1), 0) = 0 THEN
    RETURN jsonb_build_object('equipes', v_equipes, 'operadores', v_ops);
  END IF;

  IF v_cfg.avisar_meta_equipe THEN
    WITH
    novas AS (
      INSERT INTO public.push_marcos_equipe (equipe_id, mes, empresa_id, origem)
      SELECT n.equipe_id, v_mes, n.empresa_id, 'avisado'
        FROM public.fn_push_equipes_na_meta(v_empresas, v_mes) n
      ON CONFLICT (equipe_id, mes) DO NOTHING
      RETURNING equipe_id, empresa_id
    ),
    dest AS (
      SELECT d.equipe_id, d.perfil_id
        FROM public.fn_push_destinatarios_equipe('meta_equipe') d
        JOIN novas n ON n.equipe_id = d.equipe_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'equipe_id',     n.equipe_id,
             'equipe_nome',   e.nome,
             'mes',           v_mes,
             'destinatarios', COALESCE((SELECT jsonb_agg(DISTINCT d.perfil_id) FROM dest d
                                         WHERE d.equipe_id = n.equipe_id), '[]'::JSONB)
           )), '[]'::JSONB)
      INTO v_equipes
      FROM novas n
      JOIN public.equipes e ON e.id = n.equipe_id;
  END IF;

  IF v_cfg.avisar_meta_operador THEN
    WITH
    atual AS (
      SELECT * FROM public.fn_push_operadores_na_faixa(v_empresas, v_mes)
    ),
    novas AS (
      INSERT INTO public.push_marcos_operador (perfil_id, mes, faixa, empresa_id, origem)
      SELECT a.perfil_id, v_mes, f.n, a.empresa_id, 'avisado'
        FROM atual a
        CROSS JOIN LATERAL generate_series(1, a.faixa) AS f(n)
      ON CONFLICT (perfil_id, mes, faixa) DO NOTHING
      RETURNING perfil_id, faixa, empresa_id
    ),
    maior AS (
      SELECT n.perfil_id, n.empresa_id, MAX(n.faixa) AS faixa
        FROM novas n
       GROUP BY n.perfil_id, n.empresa_id
    ),
    equipes_op AS (
      SELECT m.perfil_id, x.equipe_id
        FROM maior m
        CROSS JOIN LATERAL (
          SELECT p.equipe_id FROM public.perfis p
           WHERE p.id = m.perfil_id AND p.equipe_id IS NOT NULL
          UNION
          SELECT cl.equipe_id FROM public.equipe_operadores_clones cl
           WHERE cl.operador_id = m.perfil_id AND cl.conta_recebimento IS TRUE
        ) x
    ),
    dest AS (
      SELECT d.equipe_id, d.perfil_id
        FROM public.fn_push_destinatarios_equipe('metas_operadores') d
       WHERE d.equipe_id IN (SELECT eo.equipe_id FROM equipes_op eo)
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'perfil_id', m.perfil_id,
             'nome',      p.nome,
             'mes',       v_mes,
             'faixa',     m.faixa,
             'proprio',   public.fn_push_pode_receber(m.perfil_id, m.empresa_id),
             'equipes',   COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'equipe_id',     eo.equipe_id,
                        'equipe_nome',   e.nome,
                        'destinatarios', COALESCE((SELECT jsonb_agg(DISTINCT d.perfil_id) FROM dest d
                                                    WHERE d.equipe_id = eo.equipe_id
                                                      AND d.perfil_id <> m.perfil_id), '[]'::JSONB)))
                 FROM equipes_op eo
                 JOIN public.equipes e ON e.id = eo.equipe_id
                WHERE eo.perfil_id = m.perfil_id), '[]'::JSONB)
           )), '[]'::JSONB)
      INTO v_ops
      FROM maior m
      JOIN public.perfis p ON p.id = m.perfil_id;
  END IF;

  RETURN jsonb_build_object('equipes', v_equipes, 'operadores', v_ops);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_metas_da_rodada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_metas_da_rodada() TO service_role;

-- A versão anterior da `enviar-push` (no ar até o deploy) chama esta: responde
-- vazio e NÃO consome a marca — a nova função pega a verificação inteira.
CREATE OR REPLACE FUNCTION public.fn_push_metas_equipe_batidas()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT '[]'::JSONB;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_metas_equipe_batidas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_metas_equipe_batidas() TO service_role;

-- ── O gatilho marca a verificação para as duas metas ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_push_enfileirar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_janela INTEGER;
  v_meta   BOOLEAN;
  v_hoje   DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
BEGIN
  SELECT c.janela_dias, (c.avisar_meta_equipe OR c.avisar_meta_operador) INTO v_janela, v_meta
    FROM public.push_config c
   WHERE c.ativo;
  IF v_janela IS NULL THEN
    RETURN NULL;   -- desligado (ou sem configuração)
  END IF;

  IF v_meta THEN
    INSERT INTO public.push_equipes_verificar (empresa_id, mes)
    SELECT DISTINCT n.empresa_id, to_char(v_hoje, 'YYYY-MM')
      FROM novas n
     WHERE n.data_pagamento >= date_trunc('month', v_hoje)::DATE
       AND n.data_pagamento <  (date_trunc('month', v_hoje) + INTERVAL '1 month')::DATE
    ON CONFLICT (empresa_id, mes) DO NOTHING;
  END IF;

  INSERT INTO public.push_fila (
    empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario,
    perfil_id, valor, valor_ho, forma_detalhe, nome_cliente
  )
  SELECT n.empresa_id, n.codigo, n.data_pagamento, n.forma_pagamento, n.operador_usuario,
         n.operador_id, COALESCE(n.valor_recebido, 0), COALESCE(n.total_ho, 0),
         n.forma_detalhe, n.nome_cliente
    FROM novas n
   WHERE n.operador_id IS NOT NULL
     AND n.data_pagamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::DATE - v_janela
     AND EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = n.operador_id)
  ON CONFLICT ON CONSTRAINT push_fila_chave_natural DO NOTHING;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- O aviso nunca derruba a importação.
  RAISE WARNING '[push] fila nao gravada: %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_push_enfileirar() FROM PUBLIC, anon, authenticated;

-- ── Semente: faixas já alcançadas no mês corrente não avisam de novo ────────
INSERT INTO public.push_marcos_operador (perfil_id, mes, faixa, empresa_id, origem)
SELECT a.perfil_id, to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM'),
       f.n, a.empresa_id, 'semente'
  FROM public.fn_push_operadores_na_faixa(
         ARRAY(SELECT em.id FROM public.empresas em),
         to_char((now() AT TIME ZONE 'America/Sao_Paulo')::DATE, 'YYYY-MM')) a
  CROSS JOIN LATERAL generate_series(1, a.faixa) AS f(n)
ON CONFLICT (perfil_id, mes, faixa) DO NOTHING;

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_push_metas_da_rodada()') IS NULL
     OR to_regprocedure('public.fn_push_destinatarios_equipe(text)') IS NULL
     OR to_regprocedure('public.fn_push_operadores_na_faixa(uuid[], text)') IS NULL THEN
    RAISE EXCEPTION 'funcoes das metas por cargo nao foram criadas';
  END IF;
  IF to_regclass('public.push_marcos_operador') IS NULL THEN
    RAISE EXCEPTION 'push_marcos_operador nao foi criada';
  END IF;
  IF has_table_privilege('authenticated', 'public.push_marcos_operador', 'SELECT')
     OR has_function_privilege('authenticated', 'public.fn_push_metas_da_rodada()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_push_definir_preferencia(text, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'avisos de meta alcancaveis pela API';
  END IF;
END
$guarda$;

COMMIT;
