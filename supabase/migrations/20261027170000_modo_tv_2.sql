-- ============================================================================
-- Modo TV 2 — painel em rodízio, pareado por código (27/10/2026)
-- ============================================================================
--
-- Pedido do Cleber, 27/10/2026: o Modo TV volta do arquivo morto, só que
-- simples. O líder escolhe templates prontos (contagem regressiva da meta,
-- barra, pódio, imagem...), a TV passa de um para o outro sozinha e os números
-- acompanham o relatório que entra. Desenho em
-- docs/superpowers/specs/2026-10-27-modo-tv-2-design.md.
--
-- A mesa antiga (cenas, fontes posicionadas, corte, rotação no banco) NÃO
-- volta. As tabelas dela (`tv_telas`, `tv_cenas`, ...) continuam no banco sem
-- uso, como estavam. Nada aqui as toca.
--
-- ## O que entra
--
--   tv_paineis            o painel: alvo (setor ou equipe), tema, unidade,
--                         segundos por tela e a lista de telas (jsonb).
--   tv_conexoes           cada TV pareada. Guarda só o HASH do token.
--   tv_numeros_cache      os números de cada alvo, recalculados no máximo
--                         uma vez por minuto, por mais TVs que estejam ligadas.
--
--   fn_tv_alvo_no_meu_alcance  quem monta painel de qual setor/equipe
--   fn_tv_alvos                os alvos que a pessoa pode escolher
--   fn_tv_previa               os números do painel, para a prévia da montagem
--   fn_tv_conexao_nova         (sem login) a TV pede um código de 6 dígitos
--   fn_tv_ver                  (sem login, só com o token) o que a TV mostra
--   fn_tv_versao               (idem) «o painel mudou?», a cada 5 s, e o sinal de vida
--   fn_tv_sair                 (idem) a página da TV fechou
--   fn_tv_conectar             o líder digita o código e liga a TV ao painel
--   fn_tv_desconectar          o líder desliga a TV
--
-- ## Por que a TV não usa login
--
-- O PC da TV fica na sala, com qualquer um passando. Login ali é a conta
-- inteira de alguém aberta num computador público. Com o pareamento, a TV
-- carrega só um token de 256 bits que ABRE UMA COISA: os números do painel
-- dela. Desconectar no sistema mata o token na hora.
--
-- A trava de 06/10/2026 (20261006260000) tirou do `anon` as funções da TV
-- antiga porque elas mostravam nome e recebido para quem soubesse o ENDEREÇO.
-- Aqui o endereço é o mesmo para todo mundo (`/tv`) e não abre nada; o que abre
-- é o token, que só existe no navegador que foi pareado por um líder logado.
--
-- ## De onde vêm os números
--
-- Das funções do Painel do Líder, sem conta nova:
--   setor   fn_recebido_por_setor  (clones, alternativo, «só no setor da
--           pessoa», ajuste de recebimento)
--   equipe  fn_recebido_por_equipe (líder no alternativo, fantasma, ajustes)
--   dias    fn_tv_metricas_setor   (seg–sex menos feriados de metas_config_mes)
-- A meta é a de `metas` (tipo setor/equipe), gravada em bruto. Para setor de
-- regra Cofen a tela converte para H.O. com o percentual da empresa — a mesma
-- conta de `lib/unidadeValor.ts`.
--
-- ## NÃO APLICADA
--
-- Escrita em 27/10/2026. Aplicar é decisão do dono do banco.
--
-- Reverter:
--   DROP FUNCTION IF EXISTS public.fn_tv_desconectar(uuid);
--   DROP FUNCTION IF EXISTS public.fn_tv_conectar(text, uuid, text);
--   DROP FUNCTION IF EXISTS public.fn_tv_sair(text);
--   DROP FUNCTION IF EXISTS public.fn_tv_versao(text);
--   DROP FUNCTION IF EXISTS public.fn_tv_ver(text);
--   DROP FUNCTION IF EXISTS public.fn_tv_conexao_nova();
--   DROP FUNCTION IF EXISTS public.fn_tv_previa(uuid);
--   DROP FUNCTION IF EXISTS public.fn_tv_alvos(uuid);
--   DROP FUNCTION IF EXISTS public.fn_tv_numeros(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.fn_tv_numeros_calcular(uuid, uuid);
--   DROP TABLE IF EXISTS public.tv_numeros_cache, public.tv_conexoes, public.tv_paineis;
--   DROP FUNCTION IF EXISTS public.fn_tv_painel_antes_de_gravar();
--   DROP FUNCTION IF EXISTS public.fn_tv_alvo_no_meu_alcance(uuid, uuid);
--   DROP POLICY IF EXISTS tv_paineis_midia_envio ON storage.objects;
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';

-- ── 1. Quem monta painel de quê ──────────────────────────────────────────────
--
-- Pelo CARGO (tabela `cargos`) e pelo lugar da pessoa, sem chave nova no
-- catálogo:
--   super admin                   tudo
--   administrador / diretoria     qualquer setor das empresas que alcança
--   gerência (nível 4+ de setor)  o próprio setor e as equipes dele
--   líder / elite                 o próprio setor e as equipes que lidera
--   resto                         nada
-- O menu e a rota usam a mesma régua por cargo (`CARGOS_MODO_TV`): só líder,
-- elite e acima (Cleber, 27/10/2026).

CREATE OR REPLACE FUNCTION public.fn_tv_alvo_no_meu_alcance(p_setor uuid, p_equipe uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT COALESCE((
    SELECT CASE
      WHEN public.fn_user_is_super_admin() THEN TRUE
      WHEN NOT public.fn_can_access_empresa(s.empresa_id) THEN FALSE
      WHEN c.acesso_total OR NOT c.pertence_a_setor THEN COALESCE(c.nivel, 0) >= 5
      WHEN COALESCE(c.nivel, 0) >= 4 AND c.pertence_a_setor THEN p.setor_id = s.id
      WHEN c.lidera_equipe THEN
           (p_equipe IS NULL AND p.setor_id = s.id)
        OR (p_equipe IS NOT NULL AND p_equipe = ANY (public.fn_user_equipes()))
      ELSE FALSE
    END
      FROM public.perfis p
      JOIN public.cargos c ON c.slug = p.perfil
      JOIN public.setores s ON s.id = p_setor
     WHERE p.id = auth.uid()
       AND p.ativo
  ), FALSE);
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_alvo_no_meu_alcance(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tv_alvo_no_meu_alcance(uuid, uuid) TO authenticated;

-- ── 2. O painel ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tv_paineis (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  setor_id          UUID NOT NULL REFERENCES public.setores(id)  ON DELETE CASCADE,
  -- Nula = o setor inteiro.
  equipe_id         UUID REFERENCES public.equipes(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 60),
  tema              TEXT NOT NULL DEFAULT 'noite'
                      CHECK (tema IN ('noite', 'grafite', 'oceano', 'floresta', 'vinho', 'claro')),
  -- Só pesa em setor Cofen; Nosso produto é sempre bruto.
  unidade           TEXT NOT NULL DEFAULT 'ho' CHECK (unidade IN ('ho', 'bruto')),
  -- Padrão do painel; cada tela pode ter o seu (`telas[].segundos`).
  segundos_por_tela SMALLINT NOT NULL DEFAULT 20 CHECK (segundos_por_tela BETWEEN 5 AND 3600),
  -- Id de uma tela de `telas`: a TV para nela até alguém soltar. Nula = rodízio.
  tela_fixa         TEXT,
  -- [{ "id": "...", "template": "contagem", "opcoes": { ... } }, ...]
  -- O formato é do front (`ModoTV/templates.ts`); o banco só limita o tamanho.
  telas             JSONB NOT NULL DEFAULT '[]'::JSONB
                      CHECK (jsonb_typeof(telas) = 'array'
                             AND jsonb_array_length(telas) <= 12
                             AND pg_column_size(telas) <= 16384),
  criado_por        UUID DEFAULT auth.uid(),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A 1ª versão desta migration (sem tempo por tela e sem tela fixa) chegou a
-- ser aplicada: lá a tabela já existe e o CREATE acima não faz nada. Daqui para
-- baixo o banco fica igual nos dois casos.
ALTER TABLE public.tv_paineis ADD COLUMN IF NOT EXISTS tela_fixa TEXT;
ALTER TABLE public.tv_paineis DROP CONSTRAINT IF EXISTS tv_paineis_segundos_por_tela_check;
ALTER TABLE public.tv_paineis ADD CONSTRAINT tv_paineis_segundos_por_tela_check
  CHECK (segundos_por_tela BETWEEN 5 AND 3600);

CREATE INDEX IF NOT EXISTS idx_tv_paineis_setor ON public.tv_paineis (setor_id);
CREATE INDEX IF NOT EXISTS idx_tv_paineis_empresa ON public.tv_paineis (empresa_id);

COMMENT ON TABLE public.tv_paineis IS
  'Modo TV 2 (20261027170000): painel em rodizio de telas prontas, de um setor ou de uma equipe.';

-- Setor e empresa saem do alvo, nunca do cliente: equipe de outro setor ou
-- setor de outra empresa não tem como entrar.
CREATE OR REPLACE FUNCTION public.fn_tv_painel_antes_de_gravar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF NEW.equipe_id IS NOT NULL THEN
    SELECT e.setor_id INTO NEW.setor_id FROM public.equipes e WHERE e.id = NEW.equipe_id;
    IF NEW.setor_id IS NULL THEN
      RAISE EXCEPTION 'Equipe sem setor.';
    END IF;
  END IF;
  SELECT s.empresa_id INTO NEW.empresa_id FROM public.setores s WHERE s.id = NEW.setor_id;
  IF NEW.empresa_id IS NULL THEN
    RAISE EXCEPTION 'Setor não encontrado.';
  END IF;
  NEW.nome := btrim(NEW.nome);
  -- Tela fixa que saiu da lista volta o rodízio.
  IF NEW.tela_fixa IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(NEW.telas) t WHERE t->>'id' = NEW.tela_fixa) THEN
    NEW.tela_fixa := NULL;
  END IF;
  NEW.atualizado_em := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.criado_por := OLD.criado_por;
    NEW.criado_em  := OLD.criado_em;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_painel_antes_de_gravar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tv_paineis_antes ON public.tv_paineis;
CREATE TRIGGER trg_tv_paineis_antes
  BEFORE INSERT OR UPDATE ON public.tv_paineis
  FOR EACH ROW EXECUTE FUNCTION public.fn_tv_painel_antes_de_gravar();

ALTER TABLE public.tv_paineis ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tv_paineis FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tv_paineis TO authenticated;

-- Por linha, e de propósito: a tabela tem dezenas de linhas, e o alcance
-- depende do alvo de cada uma.
DROP POLICY IF EXISTS tv_paineis_select ON public.tv_paineis;
CREATE POLICY tv_paineis_select ON public.tv_paineis FOR SELECT TO authenticated
  USING (public.fn_tv_alvo_no_meu_alcance(setor_id, equipe_id));

DROP POLICY IF EXISTS tv_paineis_insert ON public.tv_paineis;
CREATE POLICY tv_paineis_insert ON public.tv_paineis FOR INSERT TO authenticated
  WITH CHECK (public.fn_tv_alvo_no_meu_alcance(setor_id, equipe_id));

DROP POLICY IF EXISTS tv_paineis_update ON public.tv_paineis;
CREATE POLICY tv_paineis_update ON public.tv_paineis FOR UPDATE TO authenticated
  USING (public.fn_tv_alvo_no_meu_alcance(setor_id, equipe_id))
  WITH CHECK (public.fn_tv_alvo_no_meu_alcance(setor_id, equipe_id));

DROP POLICY IF EXISTS tv_paineis_delete ON public.tv_paineis;
CREATE POLICY tv_paineis_delete ON public.tv_paineis FOR DELETE TO authenticated
  USING (public.fn_tv_alvo_no_meu_alcance(setor_id, equipe_id));

-- ── 3. As TVs pareadas ───────────────────────────────────────────────────────
--
-- Uma linha nasce quando a TV pede código (painel nulo, código de 6 dígitos
-- valendo 15 min). O líder digita o código: a linha ganha o painel e perde o
-- código. Desconectar APAGA a linha — o token deixa de abrir qualquer coisa e a
-- TV volta sozinha para a tela do código.

CREATE TABLE IF NOT EXISTS public.tv_conexoes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 do token. O token em si só existe no navegador da TV.
  segredo_hash     TEXT NOT NULL UNIQUE,
  codigo           TEXT UNIQUE CHECK (codigo ~ '^[0-9]{6}$'),
  codigo_expira_em TIMESTAMPTZ,
  painel_id        UUID REFERENCES public.tv_paineis(id) ON DELETE CASCADE,
  nome             TEXT CHECK (char_length(nome) <= 40),
  conectada_em     TIMESTAMPTZ,
  conectada_por    UUID,
  ultimo_sinal     TIMESTAMPTZ,
  -- A página da TV foi fechada (aviso no `pagehide`). Sinal depois disto = reaberta.
  saiu_em          TIMESTAMPTZ,
  -- O `atualizado_em` do painel que a TV recebeu por último: a montagem compara
  -- com o salvo para dizer se a TV já está mostrando a versão nova.
  versao_exibida   TIMESTAMPTZ,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idem: na 1ª versão a tabela nasceu sem estas duas.
ALTER TABLE public.tv_conexoes ADD COLUMN IF NOT EXISTS saiu_em TIMESTAMPTZ;
ALTER TABLE public.tv_conexoes ADD COLUMN IF NOT EXISTS versao_exibida TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tv_conexoes_painel ON public.tv_conexoes (painel_id);
CREATE INDEX IF NOT EXISTS idx_tv_conexoes_aguardando ON public.tv_conexoes (criado_em)
  WHERE painel_id IS NULL;

COMMENT ON TABLE public.tv_conexoes IS
  'Modo TV 2: TVs pareadas por codigo. So o hash do token. Escrita so pelas fn_tv_*.';

ALTER TABLE public.tv_conexoes ENABLE ROW LEVEL SECURITY;

-- O hash não sai para ninguém: só as colunas que a montagem mostra.
REVOKE ALL ON public.tv_conexoes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, painel_id, nome, conectada_em, ultimo_sinal, saiu_em, versao_exibida)
  ON public.tv_conexoes TO authenticated;

-- A subconsulta em `tv_paineis` passa pela RLS dela: vê a TV quem vê o painel.
DROP POLICY IF EXISTS tv_conexoes_select ON public.tv_conexoes;
CREATE POLICY tv_conexoes_select ON public.tv_conexoes FOR SELECT TO authenticated
  USING (painel_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.tv_paineis tp WHERE tp.id = tv_conexoes.painel_id));

-- ── 4. Os números, com cache de 1 minuto ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tv_numeros_cache (
  chave        TEXT PRIMARY KEY,
  dados        JSONB NOT NULL,
  calculado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tv_numeros_cache IS
  'Modo TV 2: numeros de cada alvo (setor:equipe), recalculados no maximo 1x/min.';

ALTER TABLE public.tv_numeros_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_numeros_cache FROM PUBLIC, anon, authenticated;

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

  -- O ranking: quem conta no recebimento, dentro do alvo. No setor normal só
  -- as linhas carimbadas nele («só no setor da pessoa»); no alternativo, as
  -- linhas da pessoa, como em fn_recebido_por_setor.
  WITH membros AS (
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
  ),
  pessoas AS (
    SELECT p.id, p.nome, p.foto_url
      FROM public.perfis p
      JOIN membros mb ON mb.id = p.id
      JOIN public.cargos c ON c.slug = p.perfil
     WHERE c.conta_no_recebimento
       AND COALESCE(p.situacao, '') <> 'ferias'
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
    'calculado_em',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros_calcular(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- O cache. Dez TVs no mesmo setor custam um cálculo por minuto, não dez a cada
-- 30 s. Quem chega com o cálculo de outro em andamento leva o último pronto.
CREATE OR REPLACE FUNCTION public.fn_tv_numeros(p_setor uuid, p_equipe uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_chave TEXT := p_setor::TEXT || ':' || COALESCE(p_equipe::TEXT, '');
  v_cache public.tv_numeros_cache%ROWTYPE;
  v_dados JSONB;
BEGIN
  SELECT * INTO v_cache FROM public.tv_numeros_cache WHERE chave = v_chave;
  IF v_cache.chave IS NOT NULL AND v_cache.calculado_em > now() - INTERVAL '60 seconds' THEN
    RETURN v_cache.dados;
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('tv_numeros:' || v_chave)) THEN
    IF v_cache.chave IS NOT NULL THEN
      RETURN v_cache.dados;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('tv_numeros:' || v_chave));
    SELECT * INTO v_cache FROM public.tv_numeros_cache WHERE chave = v_chave;
    IF v_cache.chave IS NOT NULL THEN
      RETURN v_cache.dados;
    END IF;
  END IF;

  v_dados := public.fn_tv_numeros_calcular(p_setor, p_equipe);
  IF v_dados IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.tv_numeros_cache (chave, dados, calculado_em)
  VALUES (v_chave, v_dados, now())
  ON CONFLICT (chave) DO UPDATE SET dados = EXCLUDED.dados, calculado_em = EXCLUDED.calculado_em;

  RETURN v_dados;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_numeros(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. O que a montagem chama ────────────────────────────────────────────────

-- Os alvos que a pessoa pode escolher na empresa aberta.
CREATE OR REPLACE FUNCTION public.fn_tv_alvos(p_empresa_id uuid)
RETURNS TABLE(setor_id uuid, setor_nome text, equipe_id uuid, equipe_nome text, regra text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT s.id, s.nome, NULL::UUID, NULL::TEXT, COALESCE(to_jsonb(s)->>'regra', 'nosso_produto')
    FROM public.setores s
   WHERE s.empresa_id = p_empresa_id
     AND s.ativo
     AND public.fn_tv_alvo_no_meu_alcance(s.id, NULL)
  UNION ALL
  SELECT s.id, s.nome, e.id, e.nome, COALESCE(to_jsonb(s)->>'regra', 'nosso_produto')
    FROM public.equipes e
    JOIN public.setores s ON s.id = e.setor_id
   WHERE s.empresa_id = p_empresa_id
     AND s.ativo
     AND public.fn_tv_alvo_no_meu_alcance(s.id, e.id)
   ORDER BY 2, 4 NULLS FIRST;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_alvos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tv_alvos(uuid) TO authenticated;

-- Os números do painel para a prévia: os MESMOS que a TV recebe.
CREATE OR REPLACE FUNCTION public.fn_tv_previa(p_painel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_p public.tv_paineis%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM public.tv_paineis WHERE id = p_painel_id;
  IF v_p.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_p.setor_id, v_p.equipe_id) THEN
    RETURN NULL;
  END IF;
  RETURN public.fn_tv_numeros(v_p.setor_id, v_p.equipe_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_previa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tv_previa(uuid) TO authenticated;

-- O líder digita o código que a TV mostra.
CREATE OR REPLACE FUNCTION public.fn_tv_conectar(p_codigo text, p_painel_id uuid, p_nome text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_p  public.tv_paineis%ROWTYPE;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Entre no sistema para conectar a TV.';
  END IF;

  -- Dez tentativas por minuto: chutar o código de outra TV não compensa.
  IF NOT COALESCE((SELECT r.permitido FROM public.fn_api_rate_limit_consumir(
         p_janela_segundos => 60, p_limite => 10,
         p_rota => 'tv_conectar', p_usuario_id => auth.uid()) r LIMIT 1), FALSE) THEN
    RAISE EXCEPTION 'Muitas tentativas. Espere um minuto e tente de novo.';
  END IF;

  SELECT * INTO v_p FROM public.tv_paineis WHERE id = p_painel_id;
  IF v_p.id IS NULL OR NOT public.fn_tv_alvo_no_meu_alcance(v_p.setor_id, v_p.equipe_id) THEN
    RAISE EXCEPTION 'Painel não encontrado.';
  END IF;

  UPDATE public.tv_conexoes
     SET painel_id        = v_p.id,
         codigo           = NULL,
         codigo_expira_em = NULL,
         nome             = NULLIF(left(btrim(COALESCE(p_nome, '')), 40), ''),
         conectada_em     = now(),
         conectada_por    = auth.uid(),
         ultimo_sinal     = now()
   WHERE codigo = regexp_replace(COALESCE(p_codigo, ''), '\D', '', 'g')
     AND painel_id IS NULL
     AND codigo_expira_em > now()
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Código não encontrado ou vencido. Confira o número na TV.';
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_conectar(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tv_conectar(text, uuid, text) TO authenticated;

-- Desligar uma TV: a linha some, o token deixa de valer.
CREATE OR REPLACE FUNCTION public.fn_tv_desconectar(p_conexao_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_ok BOOLEAN := FALSE;
BEGIN
  DELETE FROM public.tv_conexoes c
   USING public.tv_paineis p
   WHERE c.id = p_conexao_id
     AND p.id = c.painel_id
     AND public.fn_tv_alvo_no_meu_alcance(p.setor_id, p.equipe_id)
  RETURNING TRUE INTO v_ok;
  RETURN COALESCE(v_ok, FALSE);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_desconectar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tv_desconectar(uuid) TO authenticated;

-- ── 6. O que a TV chama (sem login) ──────────────────────────────────────────

-- A TV sem token pede um. Devolve o token (que fica no navegador dela) e o
-- código de 6 dígitos (que ela mostra na tela).
CREATE OR REPLACE FUNCTION public.fn_tv_conexao_nova()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_token  TEXT;
  v_codigo TEXT;
  v_expira TIMESTAMPTZ := now() + INTERVAL '15 minutes';
  v_tent   INT := 0;
BEGIN
  -- Faxina: código vencido que ninguém usou.
  DELETE FROM public.tv_conexoes WHERE painel_id IS NULL AND codigo_expira_em < now();

  -- Teto de TVs aguardando. Quem passa dele derruba a mais antiga, e ela pede
  -- outro código sozinha: um robô enchendo a fila não trava o pareamento.
  DELETE FROM public.tv_conexoes
   WHERE id IN (SELECT id FROM public.tv_conexoes
                 WHERE painel_id IS NULL
                 ORDER BY criado_em DESC
                OFFSET 499);

  -- 2 × 122 bits aleatórios do gen_random_uuid (v4).
  v_token := replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '');

  LOOP
    v_codigo := lpad(floor(random() * 1000000)::INT::TEXT, 6, '0');
    BEGIN
      INSERT INTO public.tv_conexoes (segredo_hash, codigo, codigo_expira_em)
      VALUES (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_codigo, v_expira);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_tent := v_tent + 1;
      IF v_tent > 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('token', v_token, 'codigo', v_codigo, 'expira_em', v_expira);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_conexao_nova() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_conexao_nova() TO anon, authenticated;

-- Tudo o que a TV mostra, numa chamada só. Sem o token certo, nada.
CREATE OR REPLACE FUNCTION public.fn_tv_ver(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_c public.tv_conexoes%ROWTYPE;
  v_p public.tv_paineis%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;

  SELECT * INTO v_c FROM public.tv_conexoes
   WHERE segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;

  IF v_c.painel_id IS NULL THEN
    IF v_c.codigo_expira_em IS NULL OR v_c.codigo_expira_em < now() THEN
      RETURN jsonb_build_object('estado', 'expirada');
    END IF;
    RETURN jsonb_build_object('estado', 'aguardando',
                              'codigo', v_c.codigo, 'expira_em', v_c.codigo_expira_em);
  END IF;

  SELECT * INTO v_p FROM public.tv_paineis WHERE id = v_c.painel_id;

  -- A TV vai mostrar ESTA versão: a montagem lê daqui se ela já chegou.
  IF v_c.versao_exibida IS DISTINCT FROM v_p.atualizado_em
     OR v_c.ultimo_sinal IS NULL OR v_c.ultimo_sinal < now() - INTERVAL '30 seconds'
     OR v_c.saiu_em >= v_c.ultimo_sinal THEN
    UPDATE public.tv_conexoes
       SET ultimo_sinal = now(), versao_exibida = v_p.atualizado_em
     WHERE id = v_c.id;
  END IF;

  RETURN jsonb_build_object(
    'estado', 'conectada',
    'painel', jsonb_build_object(
      'id', v_p.id, 'nome', v_p.nome, 'tema', v_p.tema, 'unidade', v_p.unidade,
      'segundos_por_tela', v_p.segundos_por_tela, 'telas', v_p.telas,
      'tela_fixa', v_p.tela_fixa, 'atualizado_em', v_p.atualizado_em),
    'numeros', public.fn_tv_numeros(v_p.setor_id, v_p.equipe_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_ver(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_ver(text) TO anon, authenticated;

-- A pergunta curta, a cada 5 s: «o painel mudou?». Uma busca por índice e, no
-- máximo a cada 30 s, o sinal de vida. Quando a versão muda, a TV chama
-- `fn_tv_ver` — é assim que o «Publicar» chega à parede em segundos sem que a
-- TV recalcule nada à toa.
CREATE OR REPLACE FUNCTION public.fn_tv_versao(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  v_c      public.tv_conexoes%ROWTYPE;
  v_versao TIMESTAMPTZ;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;

  SELECT * INTO v_c FROM public.tv_conexoes
   WHERE segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  IF v_c.id IS NULL THEN
    RETURN jsonb_build_object('estado', 'desconhecida');
  END IF;
  IF v_c.painel_id IS NULL THEN
    RETURN jsonb_build_object('estado', 'aguardando');
  END IF;

  IF v_c.ultimo_sinal IS NULL OR v_c.ultimo_sinal < now() - INTERVAL '30 seconds'
     OR v_c.saiu_em >= v_c.ultimo_sinal THEN
    UPDATE public.tv_conexoes SET ultimo_sinal = now() WHERE id = v_c.id;
  END IF;

  SELECT tp.atualizado_em INTO v_versao FROM public.tv_paineis tp WHERE tp.id = v_c.painel_id;
  RETURN jsonb_build_object('estado', 'conectada', 'versao', v_versao);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_versao(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_versao(text) TO anon, authenticated;

-- A página da TV fechou (aviso no `pagehide`). Sem isto a montagem levaria 75 s
-- para perceber que a TV saiu do ar.
CREATE OR REPLACE FUNCTION public.fn_tv_sair(p_token text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  UPDATE public.tv_conexoes
     SET saiu_em = now()
   WHERE p_token ~ '^[0-9a-f]{64}$'
     AND segredo_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     AND painel_id IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_tv_sair(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_tv_sair(text) TO anon, authenticated;

-- ── 7. Mídia do painel ───────────────────────────────────────────────────────
--
-- O balde `tv` (público, da TV antiga) recebe imagem e vídeo em
-- `paineis/<id do painel>/...`. Envia quem alcança o painel: a subconsulta em
-- `tv_paineis` passa pela RLS dele. A leitura pública já existe
-- (`tv_midia_leitura`). Apagar arquivo de balde não é por SQL aqui.

DO $bloco$
BEGIN
  DROP POLICY IF EXISTS tv_paineis_midia_envio ON storage.objects;
  CREATE POLICY tv_paineis_midia_envio ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'tv'
      AND (storage.foldername(name))[1] = 'paineis'
      AND EXISTS (SELECT 1 FROM public.tv_paineis tp
                   WHERE tp.id::TEXT = (storage.foldername(name))[2])
    );
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Policy tv_paineis_midia_envio NAO criada (sem privilegio em storage). '
               'Crie pelo painel do Supabase com a mesma condicao.';
END
$bloco$;

-- ── 8. Conferência ───────────────────────────────────────────────────────────

DO $conf$
BEGIN
  IF to_regclass('public.tv_paineis') IS NULL
     OR to_regclass('public.tv_conexoes') IS NULL
     OR to_regclass('public.tv_numeros_cache') IS NULL THEN
    RAISE EXCEPTION 'Modo TV 2: tabela faltando.';
  END IF;
  IF has_function_privilege('anon', 'public.fn_tv_numeros(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_tv_previa(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_tv_conectar(text, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Modo TV 2: anon alcança função que não devia.';
  END IF;
  IF NOT has_function_privilege('anon', 'public.fn_tv_ver(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.fn_tv_versao(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Modo TV 2: a TV sem login não alcança fn_tv_ver.';
  END IF;
  IF has_table_privilege('anon', 'public.tv_paineis', 'SELECT')
     OR has_column_privilege('authenticated', 'public.tv_conexoes', 'segredo_hash', 'SELECT') THEN
    RAISE EXCEPTION 'Modo TV 2: tabela exposta além do previsto.';
  END IF;
END
$conf$;

COMMIT;
