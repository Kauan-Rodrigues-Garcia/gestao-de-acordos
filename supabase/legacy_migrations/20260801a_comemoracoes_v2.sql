-- ============================================================================
-- 20260801a — Comemorações v2
-- ============================================================================
--
-- Design em `docs/superpowers/specs/2026-08-01-comemoracoes-v2-design.md`.
--
-- Cinco frentes:
--   1. card       — modelo de layout, animação do texto e volume por comemoração
--   2. estados    — agendada → em andamento → finalizada, e finalizada NUNCA
--                   volta a disparar
--   3. alvo       — além de operadores, a comemoração passa a mirar uma EQUIPE
--                   (explode no setor dela) ou um SETOR (explode na empresa)
--   4. biblioteca — tipo `imagem` separado de `gif`, mídia fixada, validade de
--                   3 dias, teto de 30 por empresa
--   5. faxina     — pg_cron apaga o que venceu e fecha o que passou da hora
--
-- ── Sobre o pg_cron ─────────────────────────────────────────────────────────
-- A spec de 31/07 descartou pg_cron para o DISPARO, e isso continua valendo:
-- disparo precisa de granularidade de segundos e não pode depender de peça
-- móvel. Faxina é outro problema — roda uma vez por dia e nada quebra se
-- atrasar.
--
-- O agendamento é CONDICIONAL: onde a extensão não estiver habilitada, a
-- migration aplica tudo e só não agenda. `fn_comemoracao_faxina()` continua
-- chamável à mão, e o contador "18/30" na tela deixa o acúmulo visível.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Card: modelo, animação e volume ──────────────────────────────────────

ALTER TABLE public.comemoracoes
  ADD COLUMN IF NOT EXISTS modelo     TEXT     NOT NULL DEFAULT 'midia_topo',
  ADD COLUMN IF NOT EXISTS anim_texto TEXT     NOT NULL DEFAULT 'subir',
  ADD COLUMN IF NOT EXISTS volume     SMALLINT NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.comemoracoes.modelo IS
  'Arranjo dos elementos: midia_topo | texto_sobre | midia_lado. O layout '
  'em % continua mandando — isto é o ponto de partida e o rótulo na tela.';

COMMENT ON COLUMN public.comemoracoes.volume IS
  'PERCENTUAL do volume padrão de cada som, não ganho absoluto: 100 = como '
  'sempre foi. A música do líder e os sons sintetizados nascem calibrados '
  'diferente de propósito, e um ganho único obrigaria a estragar um dos dois.';

-- `modelo` e `anim_texto` ficam SEM CHECK de propósito: o catálogo vive no
-- front (`modelos.ts`, `catalogo.ts`), que já cai no padrão diante de valor
-- desconhecido. Um CHECK aqui obrigaria uma migration a cada modelo novo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comemoracoes_volume_check'
  ) THEN
    ALTER TABLE public.comemoracoes
      ADD CONSTRAINT comemoracoes_volume_check CHECK (volume BETWEEN 0 AND 100);
  END IF;
END $$;

-- ── 2. Estados ──────────────────────────────────────────────────────────────
--
-- Até aqui "está no ar?" era só aritmética de relógio. O problema: o conjunto
-- de já-exibidas vivia na memória da aba, então um F5 dentro da janela fazia a
-- mesma comemoração explodir de novo.
--
-- `finalizada_em` fecha a comemoração para TODO MUNDO. O "não repetir para
-- mim" é a outra metade e mora no localStorage do navegador — as duas camadas
-- resolvem coisas diferentes.

ALTER TABLE public.comemoracoes
  ADD COLUMN IF NOT EXISTS finalizada_em TIMESTAMPTZ;

COMMENT ON COLUMN public.comemoracoes.finalizada_em IS
  'Preenchida quando a comemoração termina. Finalizada nunca mais dispara.';

-- Fecha a comemoração. Idempotente: quem chegar depois não muda o horário.
--
-- Qualquer um que enxergue a linha pode chamar, porque é o cliente que exibiu
-- o card que fecha. A trava contra encerrar a festa dos outros é o horário:
-- fora da janela qualquer um fecha, DENTRO dela só quem criou.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_finalizar(p_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.comemoracoes c
     SET finalizada_em = NOW()
   WHERE c.id = p_id
     AND c.finalizada_em IS NULL
     AND ((SELECT public.fn_user_is_super_admin())
          OR c.empresa_id = (SELECT public.fn_user_empresa_id()))
     AND (
       NOW() >= c.inicia_em + (c.duracao_s || ' seconds')::INTERVAL
       OR c.criado_por = (SELECT auth.uid())
     );
$$;

COMMENT ON FUNCTION public.fn_comemoracao_finalizar(UUID) IS
  'Marca a comemoração como finalizada. Dentro da janela, só quem criou.';

-- ── 3. Alvo: operadores, equipe ou setor ────────────────────────────────────

ALTER TABLE public.comemoracoes
  ADD COLUMN IF NOT EXISTS alvo_tipo       TEXT    NOT NULL DEFAULT 'operadores',
  ADD COLUMN IF NOT EXISTS equipe_id       UUID REFERENCES public.equipes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS setor_id        UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS empresa_inteira BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.comemoracoes.alvo_tipo IS
  'operadores (lista de homenageados) | equipe (explode no setor da equipe) | '
  'setor (explode na empresa inteira).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comemoracoes_alvo_check'
  ) THEN
    ALTER TABLE public.comemoracoes
      ADD CONSTRAINT comemoracoes_alvo_check CHECK (
        (alvo_tipo = 'operadores' AND equipe_id IS NULL     AND setor_id IS NULL)
        OR (alvo_tipo = 'equipe'  AND equipe_id IS NOT NULL AND setor_id IS NULL)
        OR (alvo_tipo = 'setor'   AND equipe_id IS NULL     AND setor_id IS NOT NULL)
      );
  END IF;
END $$;

-- Alvo direto (equipe/setor): resolvido ANTES de gravar, na própria linha.
--
-- BEFORE, e não AFTER: um AFTER teria que dar UPDATE na mesma tabela que
-- disparou o trigger. Aqui basta escrever em NEW.
--
-- Congela o setor no momento da criação, mesma razão do alvo por operadores:
-- equipe que muda de setor entre o agendamento e a hora não pode trocar a
-- plateia no meio do caminho.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_alvo_direto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.alvo_tipo = 'equipe' THEN
    NEW.setores_alvo := COALESCE((
      SELECT ARRAY[e.setor_id] FROM public.equipes e
       WHERE e.id = NEW.equipe_id AND e.setor_id IS NOT NULL
    ), '{}');
    NEW.empresa_inteira := false;

  ELSIF NEW.alvo_tipo = 'setor' THEN
    -- `setores_alvo` fica preenchido por consistência, mas quem manda aqui é
    -- `empresa_inteira`: meta de setor aparece para a empresa toda.
    NEW.setores_alvo    := ARRAY[NEW.setor_id];
    NEW.empresa_inteira := true;

  ELSE
    -- Por operadores: quem preenche é o trigger dos homenageados, que só roda
    -- depois do INSERT da comemoração.
    NEW.empresa_inteira := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comemoracao_alvo_direto ON public.comemoracoes;

CREATE TRIGGER trg_comemoracao_alvo_direto
  BEFORE INSERT OR UPDATE OF alvo_tipo, equipe_id, setor_id ON public.comemoracoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_comemoracao_alvo_direto();

-- O trigger dos homenageados passa a respeitar o alvo: com equipe ou setor
-- escolhidos, `setores_alvo` já foi decidido acima e não pode ser sobrescrito
-- por uma lista de homenageados que nem deveria existir.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_setores_alvo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comemoracao UUID := COALESCE(NEW.comemoracao_id, OLD.comemoracao_id);
BEGIN
  UPDATE public.comemoracoes c
     SET setores_alvo = COALESCE((
           SELECT ARRAY(
             SELECT DISTINCT s
               FROM public.comemoracao_homenageados h
               CROSS JOIN LATERAL public.fn_setores_do_operador(h.operador_id) AS s
              WHERE h.comemoracao_id = v_comemoracao
           )
         ), '{}')
   WHERE c.id = v_comemoracao
     AND c.alvo_tipo = 'operadores';

  RETURN NULL;
END;
$$;

-- Leitura: quem é da empresa enxerga o que vale para a empresa inteira. Sem
-- isto o operador não veria a comemoração de setor nem para ela explodir.
DROP POLICY IF EXISTS "comemoracoes_select" ON public.comemoracoes;
CREATE POLICY "comemoracoes_select" ON public.comemoracoes
  FOR SELECT USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (
      empresa_inteira
      OR criado_por = (SELECT auth.uid())
      OR (SELECT public.fn_comemoracao_pode_criar())
      OR (SELECT p.setor_id FROM public.perfis p WHERE p.id = (SELECT auth.uid())) = ANY (setores_alvo)
    )
  );

-- ── 4. Biblioteca: imagem, fixada e validade ────────────────────────────────

ALTER TABLE public.comemoracao_midias
  ADD COLUMN IF NOT EXISTS fixada    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '3 days');

COMMENT ON COLUMN public.comemoracao_midias.expira_em IS
  'Quando a faxina apaga. NULL = fixada, não expira.';

-- `imagem` entra ao lado de `gif`: são slots diferentes na tela, e o líder
-- escolhe um OU outro. PNG e WEBP já subiam antes desta migration, rotulados
-- como gif — ficam como estão, que é o que eles são na prática.
ALTER TABLE public.comemoracao_midias
  DROP CONSTRAINT IF EXISTS comemoracao_midias_tipo_check;

ALTER TABLE public.comemoracao_midias
  ADD CONSTRAINT comemoracao_midias_tipo_check
  CHECK (tipo IN ('gif', 'imagem', 'som'));

-- Linhas anteriores à migration ganham 3 dias A PARTIR DE AGORA, não da data de
-- envio: a alternativa apagaria na primeira faxina mídia que alguém está
-- usando hoje, sem aviso.
--
-- Antes do CHECK abaixo de propósito — com uma linha órfã de `expira_em` a
-- restrição não entraria.
UPDATE public.comemoracao_midias
   SET expira_em = NOW() + INTERVAL '3 days'
 WHERE expira_em IS NULL AND NOT fixada;

-- Fixada e expiração são mutuamente exclusivas — o banco não deixa divergir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comemoracao_midias_fixada_check'
  ) THEN
    ALTER TABLE public.comemoracao_midias
      ADD CONSTRAINT comemoracao_midias_fixada_check CHECK (
        (fixada AND expira_em IS NULL) OR (NOT fixada AND expira_em IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comemoracao_midias_expira
  ON public.comemoracao_midias (expira_em)
  WHERE expira_em IS NOT NULL;

-- Teto de 30 por empresa, contando fixadas e temporárias. No banco, não na
-- tela: validação só no navegador é contornável pela API.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_midias_teto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.comemoracao_midias m
   WHERE m.empresa_id = NEW.empresa_id;

  IF v_total >= 30 THEN
    RAISE EXCEPTION 'Biblioteca cheia (30). Exclua uma mídia ou espere expirar.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comemoracao_midias_teto ON public.comemoracao_midias;

CREATE TRIGGER trg_comemoracao_midias_teto
  BEFORE INSERT ON public.comemoracao_midias
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_comemoracao_midias_teto();

-- Fixar / desafixar. Máximo de 4 por tipo, por empresa.
--
-- Cota da EMPRESA e não da pessoa: a mídia já é compartilhada por todos, e 4
-- por líder com 10 líderes daria 120 itens fixos contra um teto de 30.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_midia_fixar(p_id UUID, p_fixar BOOLEAN)
RETURNS public.comemoracao_midias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_midia public.comemoracao_midias;
  v_fixas INT;
BEGIN
  SELECT * INTO v_midia FROM public.comemoracao_midias WHERE id = p_id;

  IF v_midia.id IS NULL THEN
    RAISE EXCEPTION 'Mídia não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT ((SELECT public.fn_user_is_super_admin())
          OR v_midia.empresa_id = (SELECT public.fn_user_empresa_id()))
     OR NOT (SELECT public.fn_comemoracao_pode_criar()) THEN
    RAISE EXCEPTION 'Sem permissão para fixar mídia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_fixar THEN
    SELECT COUNT(*) INTO v_fixas
      FROM public.comemoracao_midias m
     WHERE m.empresa_id = v_midia.empresa_id
       AND m.tipo = v_midia.tipo
       AND m.fixada
       AND m.id <> p_id;

    IF v_fixas >= 4 THEN
      RAISE EXCEPTION 'Já são 4 % fixados. Desafixe um antes.', v_midia.tipo
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.comemoracao_midias
     SET fixada    = p_fixar,
         expira_em = CASE WHEN p_fixar THEN NULL ELSE NOW() + INTERVAL '3 days' END
   WHERE id = p_id
  RETURNING * INTO v_midia;

  RETURN v_midia;
END;
$$;

-- A RLS não tem policy de UPDATE em `comemoracao_midias` (a 20260731f decidiu
-- que mídia não se edita, se troca). Fixar passa por esta RPC justamente por
-- isso: é a única escrita permitida, e ela valida a cota.

-- ── 5. Faxina ───────────────────────────────────────────────────────────────
--
-- Apaga a mídia vencida (linha + arquivo) e fecha a comemoração que passou da
-- janela sem ninguém logado para fechar — o caso do agendamento para o fim do
-- expediente.
--
-- Devolve o que fez, para dar o que olhar quando for chamada à mão.
CREATE OR REPLACE FUNCTION public.fn_comemoracao_faxina()
RETURNS TABLE(midias_apagadas INT, comemoracoes_finalizadas INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caminhos TEXT[];
  v_midias   INT := 0;
  v_comem    INT := 0;
BEGIN
  WITH vencidas AS (
    DELETE FROM public.comemoracao_midias m
     WHERE m.expira_em IS NOT NULL AND m.expira_em <= NOW()
    RETURNING m.caminho
  )
  SELECT ARRAY_AGG(caminho), COUNT(*) INTO v_caminhos, v_midias FROM vencidas;

  -- O arquivo vai junto; sem isto o bucket engorda para sempre, que é
  -- exatamente o que o limite de validade existe para evitar.
  IF v_caminhos IS NOT NULL THEN
    DELETE FROM storage.objects
     WHERE bucket_id = 'comemoracoes' AND name = ANY (v_caminhos);
  END IF;

  WITH fechadas AS (
    UPDATE public.comemoracoes c
       SET finalizada_em = NOW()
     WHERE c.finalizada_em IS NULL
       AND NOW() >= c.inicia_em + (c.duracao_s || ' seconds')::INTERVAL
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_comem FROM fechadas;

  RETURN QUERY SELECT COALESCE(v_midias, 0), COALESCE(v_comem, 0);
END;
$$;

COMMENT ON FUNCTION public.fn_comemoracao_faxina() IS
  'Apaga mídia vencida (linha + arquivo) e finaliza comemoração que passou da '
  'janela. Agendada no pg_cron; chamável à mão se a extensão não existir.';

-- Agendamento — CONDICIONAL. Onde `pg_cron` não estiver habilitado, a migration
-- aplica tudo e apenas não agenda: a faxina segue chamável à mão.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Reagendar exige tirar o anterior: `cron.schedule` com nome repetido
    -- atualiza em versões novas e falha em versões antigas.
    PERFORM cron.unschedule('comemoracao-faxina')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'comemoracao-faxina');

    PERFORM cron.schedule(
      'comemoracao-faxina',
      '17 4 * * *',                       -- 04:17, longe da virada da hora
      'SELECT public.fn_comemoracao_faxina();'
    );
  ELSE
    RAISE NOTICE
      'pg_cron ausente: faxina das comemorações NÃO foi agendada. '
      'Habilite a extensão e reaplique, ou chame fn_comemoracao_faxina() à mão.';
  END IF;
END $$;

-- ── 6. Bucket: 10 MB e JPEG ─────────────────────────────────────────────────
--
-- O teto já estava em 10 MB desde a 20260731g; repetido aqui para a migration
-- ser autossuficiente num banco novo.
--
-- JPEG entra agora: com `imagem` virando tipo de primeira classe, é o formato
-- que as pessoas mais têm à mão (foto da equipe, print). Sem ele o envio falha
-- no bucket com erro que não explica nada.

UPDATE storage.buckets
   SET file_size_limit    = 10485760,
       allowed_mime_types = ARRAY[
         'image/gif','image/png','image/webp','image/jpeg',
         'audio/mpeg','audio/mp3','audio/wav','audio/ogg'
       ]
 WHERE id = 'comemoracoes';
