-- ============================================================================
-- Controle de Numeros — situacoes com tempo, e a etiqueta da retirada do banimento
-- ============================================================================
--
-- ## O que muda
--
-- Quatro situacoes novas, pedidas para Meus Chips em 11/09/2026:
--
--   aguardando_12h ....... espera fixa de 12 horas, calculada pelo banco
--   aguardando_24h ....... idem, 24 horas
--   em_restricao ......... restricao temporaria; quem marca informa o tempo
--   movimentando_proxy ... sem prazo; conta ha quanto tempo esta no proxy
--
-- E a etiqueta `retirada_banimento_solicitada`, a segunda que o modulo previa.
--
-- ## Quem marca
--
-- O Nucleo, como sempre: `fn_numeros_alterar_situacao` e `fn_numeros_etiquetar`
-- exigem `fn_numeros_nucleo_administra`. O que muda e ONDE — Meus Chips passa a
-- oferecer os seletores ao Assistente ADM. Nenhuma policy nova.
--
-- ## O tempo mora no banco
--
-- `situacao_desde`, `prazo_ate`, `situacao_por` e `prazo_notificado_em` sao
-- mantidos por GATILHO (`fn_numeros_situacao_prazo`), e nao so pela RPC:
-- relancar e devolver como banido tambem trocam a situacao, e o prazo precisa
-- morrer junto. A tela conta a partir do que esta gravado — duas telas abertas
-- mostram o mesmo cronometro.
--
-- ## O fim do prazo nao troca a situacao
--
-- Decisao do usuario: a situacao fica como foi marcada, e a tela mostra
-- «Pronto» (espera) ou «Dentro do prazo» (restricao). Nas esperas o banco avisa:
-- `fn_numeros_avisar_prazos`, a cada minuto pelo pg_cron, grava a notificacao
-- para quem marcou e para quem esta no setor do Nucleo — uma vez por prazo.
--
-- ## Reaplicavel
--
-- Colunas com IF NOT EXISTS; constraints e gatilho com DROP antes; funcoes com
-- CREATE OR REPLACE; o agendamento e desfeito antes de ser refeito.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ============================================================================
-- 1. As colunas do tempo
-- ============================================================================

ALTER TABLE public.numeros_whatsapp
  ADD COLUMN IF NOT EXISTS situacao_desde      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prazo_ate           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prazo_notificado_em TIMESTAMPTZ,
  -- Sem foreign key, como os autores da trilha: desligar a pessoa nao pode
  -- apagar nem invalidar quem marcou.
  ADD COLUMN IF NOT EXISTS situacao_por        UUID;

COMMENT ON COLUMN public.numeros_whatsapp.situacao_desde IS
  'Desde quando a situacao atual vale. Gravado por fn_numeros_situacao_prazo. '
  'NULL nos numeros que nao trocaram de situacao depois de 20260911170000.';
COMMENT ON COLUMN public.numeros_whatsapp.prazo_ate IS
  'Fim do prazo das situacoes com prazo (aguardando_12h, aguardando_24h, '
  'em_restricao). NULL em todas as outras — o CHECK numeros_whatsapp_prazo_coerente garante.';
COMMENT ON COLUMN public.numeros_whatsapp.prazo_notificado_em IS
  'Quando fn_numeros_avisar_prazos avisou que o prazo acabou. NULL enquanto nao avisou.';
COMMENT ON COLUMN public.numeros_whatsapp.situacao_por IS
  'Quem marcou a situacao atual. Recebe o aviso de «Pronto».';

-- ============================================================================
-- 2. As situacoes
-- ============================================================================

-- O CHECK de situacao nasceu sem nome, dentro do CREATE TABLE. Ele e achado pela
-- definicao, e nao por um nome adivinhado.
DO $check$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.numeros_whatsapp'::REGCLASS
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%situacao%'
       AND pg_get_constraintdef(oid) LIKE '%em_aquecimento%'
  LOOP
    EXECUTE format('ALTER TABLE public.numeros_whatsapp DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$check$;

ALTER TABLE public.numeros_whatsapp
  ADD CONSTRAINT numeros_whatsapp_situacao_check CHECK (situacao IN (
    'em_aquecimento', 'ativo', 'banido',
    'aguardando_12h', 'aguardando_24h', 'movimentando_proxy', 'em_restricao'));

-- Prazo existe exatamente nas situacoes com prazo. Sem isto, um numero ativo com
-- `prazo_ate` esquecido ganharia um «Pronto» que nao significa nada.
ALTER TABLE public.numeros_whatsapp
  DROP CONSTRAINT IF EXISTS numeros_whatsapp_prazo_coerente;
ALTER TABLE public.numeros_whatsapp
  ADD CONSTRAINT numeros_whatsapp_prazo_coerente CHECK (
    (situacao IN ('aguardando_12h', 'aguardando_24h', 'em_restricao'))
    = (prazo_ate IS NOT NULL));

-- O aviso procura so o que venceu e nao foi avisado: uma fracao pequena da tabela.
CREATE INDEX IF NOT EXISTS idx_numeros_wpp_prazo_pendente
  ON public.numeros_whatsapp (prazo_ate)
  WHERE prazo_ate IS NOT NULL AND prazo_notificado_em IS NULL;

CREATE OR REPLACE FUNCTION public.fn_numeros_rotulo_situacao(p_situacao TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE p_situacao
    WHEN 'em_aquecimento'     THEN 'Em aquecimento'
    WHEN 'ativo'              THEN 'Ativo'
    WHEN 'banido'             THEN 'Banido'
    WHEN 'aguardando_12h'     THEN 'Aguardando 12 horas'
    WHEN 'aguardando_24h'     THEN 'Aguardando 24 horas'
    WHEN 'movimentando_proxy' THEN 'Movimentando no Proxy'
    WHEN 'em_restricao'       THEN 'Em restricao'
    ELSE COALESCE(p_situacao, '—')
  END;
$function$;

-- ============================================================================
-- 3. A etiqueta da retirada do banimento
-- ============================================================================
--
-- Os tres lugares que a migration 20260910210000 disse que toda etiqueta nova
-- toca: o CHECK (expressao pura, por causa do pg_dump), a validacao da RPC e o
-- rotulo congelado na trilha. O quarto e `numerosRegras.ts`.

ALTER TABLE public.numeros_whatsapp
  DROP CONSTRAINT IF EXISTS numeros_whatsapp_etiquetas_conhecidas;
ALTER TABLE public.numeros_whatsapp
  ADD CONSTRAINT numeros_whatsapp_etiquetas_conhecidas
  CHECK (etiquetas <@ ARRAY['nao_chegou_sms', 'retirada_banimento_solicitada']::TEXT[]);

CREATE OR REPLACE FUNCTION public.fn_numeros_etiquetas_validas(p_etiquetas TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT p_etiquetas IS NULL
      OR (p_etiquetas <@ ARRAY['nao_chegou_sms', 'retirada_banimento_solicitada']::TEXT[]
          AND COALESCE(array_length(p_etiquetas, 1), 0)
              = (SELECT COUNT(DISTINCT e) FROM unnest(p_etiquetas) AS e));
$function$;

CREATE OR REPLACE FUNCTION public.fn_numeros_rotulo_etiqueta(p_etiqueta TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE p_etiqueta
    WHEN 'nao_chegou_sms'                THEN 'Não chegou SMS'
    WHEN 'retirada_banimento_solicitada' THEN 'Retirada do banimento solicitada'
    ELSE COALESCE(p_etiqueta, '—')
  END;
$function$;

-- ============================================================================
-- 4. O gatilho que guarda o tempo
-- ============================================================================
--
-- Gatilho proprio, e nao um bloco dentro de `fn_numeros_whatsapp_valida`: os dois
-- mexem em colunas diferentes e nenhum depende do outro, entao a ordem
-- alfabetica entre eles nao muda o resultado.

CREATE OR REPLACE FUNCTION public.fn_numeros_situacao_prazo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Cadastro novo, ou restauracao da lixeira. O que ja veio preenchido — a
    -- copia de um numero restaurado — e mantido: o prazo dele nao recomeca.
    NEW.situacao_desde := COALESCE(NEW.situacao_desde, NOW());
    NEW.situacao_por   := COALESCE(NEW.situacao_por, (SELECT auth.uid()));
    IF NEW.situacao = 'aguardando_12h' THEN
      NEW.prazo_ate := COALESCE(NEW.prazo_ate, NOW() + INTERVAL '12 hours');
    ELSIF NEW.situacao = 'aguardando_24h' THEN
      NEW.prazo_ate := COALESCE(NEW.prazo_ate, NOW() + INTERVAL '24 hours');
    ELSIF NEW.situacao <> 'em_restricao' THEN
      NEW.prazo_ate := NULL;
    END IF;

  ELSIF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    NEW.situacao_desde      := NOW();
    NEW.situacao_por        := (SELECT auth.uid());
    NEW.prazo_notificado_em := NULL;
    NEW.prazo_ate := CASE NEW.situacao
      WHEN 'aguardando_12h' THEN NOW() + INTERVAL '12 hours'
      WHEN 'aguardando_24h' THEN NOW() + INTERVAL '24 hours'
      -- A restricao traz o prazo no mesmo UPDATE (`fn_numeros_alterar_situacao`).
      WHEN 'em_restricao'   THEN NEW.prazo_ate
      ELSE NULL
    END;

  ELSIF NEW.prazo_ate IS DISTINCT FROM OLD.prazo_ate THEN
    -- Mesma situacao, prazo novo: a restricao corrigida. O aviso vale para o
    -- prazo novo, e nao para o que ja passou.
    NEW.prazo_notificado_em := NULL;
  END IF;

  IF NEW.situacao = 'em_restricao' AND NEW.prazo_ate IS NULL THEN
    RAISE EXCEPTION 'Informe o tempo de restrição.' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

-- Funcao de gatilho nao e chamavel pela API — a regra de 20260816150000.
REVOKE ALL ON FUNCTION public.fn_numeros_situacao_prazo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_numeros_situacao_prazo ON public.numeros_whatsapp;
CREATE TRIGGER trg_numeros_situacao_prazo
  BEFORE INSERT OR UPDATE OF situacao, prazo_ate ON public.numeros_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.fn_numeros_situacao_prazo();

-- ============================================================================
-- 5. Alterar a situacao, agora com o tempo da restricao
-- ============================================================================
--
-- A assinatura de dois parametros SAI. `CREATE OR REPLACE` com um parametro a
-- mais criaria uma sobrecarga, e a chamada `(p_numero_id, p_situacao)` ficaria
-- ambigua entre as duas. Com o terceiro em DEFAULT, a chamada de sempre continua
-- valendo.

DROP FUNCTION IF EXISTS public.fn_numeros_alterar_situacao(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.fn_numeros_alterar_situacao(
  p_numero_id UUID, p_situacao TEXT, p_prazo_minutos INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  n       public.numeros_whatsapp%ROWTYPE;
  v_prazo TIMESTAMPTZ;
BEGIN
  SELECT * INTO n FROM public.numeros_whatsapp WHERE id = p_numero_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Numero nao encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_numeros_nucleo_administra(n.empresa_id) THEN
    RAISE EXCEPTION 'Somente o Nucleo altera a situacao de um numero.'
      USING ERRCODE = '42501';
  END IF;

  IF p_situacao IS NULL OR p_situacao NOT IN (
       'em_aquecimento', 'ativo', 'banido',
       'aguardando_12h', 'aguardando_24h', 'movimentando_proxy', 'em_restricao') THEN
    RAISE EXCEPTION 'Situacao invalida.' USING ERRCODE = '22023';
  END IF;

  IF p_situacao = 'em_restricao' THEN
    IF p_prazo_minutos IS NULL OR p_prazo_minutos < 1 OR p_prazo_minutos > 129600 THEN
      RAISE EXCEPTION 'Informe o tempo de restrição, de 1 minuto a 90 dias.'
        USING ERRCODE = '22023';
    END IF;
    v_prazo := NOW() + make_interval(mins => p_prazo_minutos);
  ELSIF n.situacao = p_situacao THEN
    -- Trocar por igual nao e movimentacao. A restricao e a excecao: marcar de
    -- novo e corrigir o tempo.
    RETURN;
  END IF;

  -- `prazo_ate` vai no SET mesmo quando e NULL: o gatilho calcula as esperas e
  -- limpa as outras. So a restricao traz o valor daqui.
  UPDATE public.numeros_whatsapp
     SET situacao = p_situacao,
         prazo_ate = v_prazo,
         atualizado_em = NOW()
   WHERE id = p_numero_id;

  PERFORM public.fn_numeros_movimentacao(
    p_numero_id         => p_numero_id,
    p_tipo              => 'situacao_alterada',
    p_situacao_anterior => n.situacao,
    p_situacao_nova     => p_situacao,
    p_observacao        => CASE WHEN p_situacao = 'em_restricao'
      THEN 'Restricao ate ' || to_char(v_prazo AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
      ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_numeros_alterar_situacao(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_numeros_alterar_situacao(UUID, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 6. O aviso de «Pronto»
-- ============================================================================
--
-- So as ESPERAS avisam. O fim da restricao aparece na tela («Dentro do prazo»),
-- sem notificacao — foi o pedido.
--
-- Quem recebe: quem marcou a situacao, e quem esta no setor apontado como Nucleo
-- (que, pela trava de 20260911121000, e Assistente ADM). `UNION` tira a repeticao
-- de quem e as duas coisas.
--
-- `prazo_notificado_em` e gravado inclusive na restricao: e o que tira o numero
-- da fila, para a proxima volta nao olhar para ele de novo.

CREATE OR REPLACE FUNCTION public.fn_numeros_avisar_prazos()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r       RECORD;
  v_total INTEGER := 0;
BEGIN
  FOR r IN
    SELECT n.id, n.empresa_id, n.numero, n.situacao, n.situacao_por,
           c.identificacao AS celular, s.nome AS setor_nome, cfg.setor_nucleo_id
      FROM public.numeros_whatsapp n
      JOIN public.numeros_celulares c ON c.id = n.celular_id
      LEFT JOIN public.setores s        ON s.id = n.setor_id
      LEFT JOIN public.numeros_config cfg ON cfg.empresa_id = n.empresa_id
     WHERE n.prazo_ate IS NOT NULL
       AND n.prazo_ate <= NOW()
       AND n.prazo_notificado_em IS NULL
     ORDER BY n.prazo_ate
     LIMIT 500
       FOR UPDATE OF n SKIP LOCKED
  LOOP
    IF r.situacao IN ('aguardando_12h', 'aguardando_24h') THEN
      INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
      SELECT d.usuario_id, r.empresa_id,
             'Número pronto — (' || left(r.numero, 2) || ') '
               || substr(r.numero, 3, length(r.numero) - 6) || '-' || right(r.numero, 4),
             format('O prazo de %s terminou. %s · %s.',
                    public.fn_numeros_rotulo_situacao(r.situacao),
                    r.celular, COALESCE(r.setor_nome, 'setor removido')),
             false, '/meus-chips'
        FROM (
          SELECT r.situacao_por AS usuario_id
          UNION
          SELECT p.id
            FROM public.perfis p
           WHERE r.setor_nucleo_id IS NOT NULL
             AND p.empresa_id = r.empresa_id
             AND p.setor_id = r.setor_nucleo_id
             AND p.ativo IS TRUE
        ) d
       WHERE d.usuario_id IS NOT NULL;
    END IF;

    UPDATE public.numeros_whatsapp SET prazo_notificado_em = NOW() WHERE id = r.id;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

-- So o agendamento chama. Ninguem dispara aviso pela API.
REVOKE ALL ON FUNCTION public.fn_numeros_avisar_prazos() FROM PUBLIC, anon, authenticated;

-- A cada minuto: e o atraso maximo entre o fim do prazo e a notificacao. A tela
-- vira «Pronto» no segundo exato, pelo relogio de quem olha. A faxina guarda so
-- dois dias do historico DESTE trabalho — 1.440 linhas por dia de prova de vida
-- sao ruido, e os outros trabalhos ficam com o historico deles intacto.
DO $agenda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Sem pg_cron: o aviso de «Pronto» fica sem agendamento ate a extensao existir.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'numeros-avisar-prazos') THEN
    PERFORM cron.unschedule('numeros-avisar-prazos');
  END IF;
  PERFORM cron.schedule(
    'numeros-avisar-prazos', '* * * * *', 'SELECT public.fn_numeros_avisar_prazos();');

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'numeros-avisar-prazos-faxina') THEN
    PERFORM cron.unschedule('numeros-avisar-prazos-faxina');
  END IF;
  PERFORM cron.schedule(
    'numeros-avisar-prazos-faxina', '23 4 * * *',
    'DELETE FROM cron.job_run_details d USING cron.job j '
    || 'WHERE d.jobid = j.jobid AND j.jobname = ''numeros-avisar-prazos'' '
    || 'AND d.end_time < NOW() - INTERVAL ''2 days'';');
END
$agenda$;

-- ============================================================================
-- 7. Prova
-- ============================================================================

DO $prova$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.numeros_whatsapp'::REGCLASS
       AND conname = 'numeros_whatsapp_situacao_check'
       AND pg_get_constraintdef(oid) LIKE '%em_restricao%'
  ) THEN
    RAISE EXCEPTION 'As situacoes novas nao entraram no CHECK.';
  END IF;

  IF (SELECT COUNT(*) FROM pg_constraint
       WHERE conrelid = 'public.numeros_whatsapp'::REGCLASS
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%em_aquecimento%') <> 1 THEN
    RAISE EXCEPTION 'Sobrou um CHECK antigo de situacao ao lado do novo.';
  END IF;

  IF to_regprocedure('public.fn_numeros_alterar_situacao(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'A assinatura antiga de fn_numeros_alterar_situacao continua de pe.';
  END IF;

  IF to_regprocedure('public.fn_numeros_alterar_situacao(uuid, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_numeros_alterar_situacao com o tempo da restricao nao foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.numeros_whatsapp'::REGCLASS
       AND tgname = 'trg_numeros_situacao_prazo'
  ) THEN
    RAISE EXCEPTION 'O gatilho do tempo das situacoes nao foi criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.numeros_whatsapp'::REGCLASS
       AND conname = 'numeros_whatsapp_etiquetas_conhecidas'
       AND pg_get_constraintdef(oid) LIKE '%retirada_banimento_solicitada%'
  ) THEN
    RAISE EXCEPTION 'A etiqueta da retirada do banimento nao entrou no CHECK.';
  END IF;
END
$prova$;

COMMIT;
