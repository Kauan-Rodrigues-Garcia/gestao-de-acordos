-- ============================================================================
-- Direto/Extra: o par se sincroniza no banco, e a mudança vira card no chat
-- ============================================================================
--
-- ## Por que
--
-- Auditoria de 30/10/2026, pedido do Cleber. O acordo vinculado é DUAS linhas
-- em `acordos` — o DIRETO de uma pessoa e o EXTRA da outra — e nada no banco
-- as mantinha iguais. Quem sincronizava era a tela, chamando
-- `fn_sync_par_vinculo`, e várias telas não chamavam: a edição do acordo, o
-- «pago» e o «desfazer» da aba Acordos (BookPlay), a troca de status do
-- detalhe, a virada para Não Pago. Medido no banco em 30/10: na BookPlay, 26 de
-- 89 extras diferiam do direto do mesmo mês (25 de outubro em diante); 40 pares
-- com data de pagamento diferente, que a função nem copiava.
--
-- Achar o par também era adivinhação: por NR + número da parcela, e o número
-- não bate em 53 linhas (o direto é a parcela 3, o extra a 1). Quando não
-- batia, a função sobrescrevia OUTRA parcela.
--
-- E o que a tela fazia no acordo do colega — espelhar parcela nova, promover o
-- EXTRA quando o DIRETO é excluído — esbarrava na RLS de operador comum e
-- falhava em silêncio.
--
-- ## O que muda
--
-- 1. `acordos.par_acordo_id` — a outra metade, explícita. Só o banco escreve
--    (gatilho de guarda). Liga sozinho quando as duas linhas se declaram
--    (`vinculo_operador_id` recíproco, mesma chave, mesmo mês).
-- 2. `trg_vinculo_par_upd` — mudou nome, valor, valor total, entrada,
--    vencimento, situação, data de pagamento, parcelas, forma ou WhatsApp de
--    um lado, o outro recebe igual. Venha de qual tela vier.
-- 3. `trg_vinculo_par_del` — excluiu o DIRETO, o EXTRA vira DIRETO (se o NR
--    estiver livre; senão fica sem vínculo). Excluiu o EXTRA, o DIRETO perde o
--    vínculo. Era o `tratarExclusaoVinculo` do navegador.
-- 4. O aviso é um CARD no chat, na conversa direta entre as duas pessoas
--    (`chat_mensagens.sistema = 'acordo_vinculo'`). Só ação de pessoa: a virada
--    automática para Não Pago e as RPCs de sistema não avisam. Quem não tem
--    chat liberado recebe notificação comum, com o acordo dela.
-- 5. `fn_sync_par_vinculo` vira no-op (abas antigas ainda chamam).
-- 6. `fn_acordo_agendar_proxima_parcela` acha o par pelo vínculo explícito.
--    `fn_acordo_par_espelhar_parcela` (nova) espelha a parcela adicionada à mão.
-- 7. `fn_tornar_direto_executar` cuida dos próprios avisos: o card fica mudo
--    dentro dele.
-- 8. Carga: liga os pares existentes e alinha os divergentes de outubro em
--    diante pela ÚLTIMA alteração (decisão do Cleber, 30/10). Mês fechado não
--    é tocado.
--
-- Reaplicável até a seção 8, que só alinha o que ainda diverge.

BEGIN;

-- ── 1. A coluna ─────────────────────────────────────────────────────────────

ALTER TABLE public.acordos ADD COLUMN IF NOT EXISTS par_acordo_id uuid;

COMMENT ON COLUMN public.acordos.par_acordo_id IS
  'A outra metade do par DIRETO/EXTRA (linha a linha). Só o banco escreve. Ver 20261030235500.';

CREATE INDEX IF NOT EXISTS idx_acordos_par_acordo_id
  ON public.acordos (par_acordo_id) WHERE par_acordo_id IS NOT NULL;

-- ── 2. Peças pequenas ───────────────────────────────────────────────────────

-- O valor da chave do acordo, pela mesma regra de `fn_nr_campo_chave`.
CREATE OR REPLACE FUNCTION public.fn_acordo_chave_valor(p_nr_cliente text, p_instituicao text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE public.fn_nr_campo_chave(p_nr_cliente, p_instituicao)
           WHEN 'nr_cliente'  THEN btrim(p_nr_cliente)
           WHEN 'instituicao' THEN btrim(p_instituicao)
         END;
$function$;

-- A metade que falta, para um acordo que declara vínculo e ainda não tem par:
-- a linha da outra pessoa que declara o vínculo de volta, com a mesma chave,
-- no mesmo mês. Mesmo vencimento e mesma parcela desempatam.
CREATE OR REPLACE FUNCTION public.fn_acordo_par_candidato(p_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT c.id
    FROM public.acordos a
    JOIN public.acordos c
      ON c.empresa_id          = a.empresa_id
     AND c.id                 <> a.id
     AND c.operador_id         = a.vinculo_operador_id
     AND c.vinculo_operador_id = a.operador_id
     AND COALESCE(c.tipo_vinculo, 'direto') <> COALESCE(a.tipo_vinculo, 'direto')
     AND c.par_acordo_id IS NULL
     AND public.fn_nr_campo_chave(c.nr_cliente, c.instituicao)
         = public.fn_nr_campo_chave(a.nr_cliente, a.instituicao)
     AND public.fn_acordo_chave_valor(c.nr_cliente, c.instituicao)
         = public.fn_acordo_chave_valor(a.nr_cliente, a.instituicao)
     AND date_trunc('month', c.vencimento) = date_trunc('month', a.vencimento)
   WHERE a.id = p_id
     AND a.vinculo_operador_id IS NOT NULL
   ORDER BY (c.vencimento = a.vencimento) DESC,
            (c.numero_parcela IS NOT DISTINCT FROM a.numero_parcela) DESC,
            abs(c.vencimento - a.vencimento),
            c.criado_em DESC
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_acordo_par_candidato(uuid) FROM PUBLIC, anon, authenticated;

-- O que mudou entre duas versões da linha, nos campos que o par compartilha.
-- WhatsApp vai sem os números: o card só diz que mudou.
CREATE OR REPLACE FUNCTION public.fn_acordo_par_mudancas(o public.acordos, n public.acordos)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('campo', v.campo, 'de', v.de, 'para', v.para)
                            ORDER BY v.ordem), '[]'::jsonb)
    FROM (VALUES
      (1,  'status',         o.status IS DISTINCT FROM n.status,                 to_jsonb(o.status),         to_jsonb(n.status)),
      (2,  'valor',          o.valor IS DISTINCT FROM n.valor,                   to_jsonb(o.valor),          to_jsonb(n.valor)),
      (3,  'vencimento',     o.vencimento IS DISTINCT FROM n.vencimento,         to_jsonb(o.vencimento),     to_jsonb(n.vencimento)),
      (4,  'data_pagamento', o.data_pagamento IS DISTINCT FROM n.data_pagamento, to_jsonb(o.data_pagamento), to_jsonb(n.data_pagamento)),
      (5,  'valor_total',    o.valor_total IS DISTINCT FROM n.valor_total,       to_jsonb(o.valor_total),    to_jsonb(n.valor_total)),
      (6,  'valor_entrada',  o.valor_entrada IS DISTINCT FROM n.valor_entrada,   to_jsonb(o.valor_entrada),  to_jsonb(n.valor_entrada)),
      (7,  'parcelas',       o.parcelas IS DISTINCT FROM n.parcelas,             to_jsonb(o.parcelas),       to_jsonb(n.parcelas)),
      (8,  'tipo',           o.tipo IS DISTINCT FROM n.tipo,                     to_jsonb(o.tipo),           to_jsonb(n.tipo)),
      (9,  'nome_cliente',   o.nome_cliente IS DISTINCT FROM n.nome_cliente,     to_jsonb(o.nome_cliente),   to_jsonb(n.nome_cliente)),
      (10, 'whatsapp',       o.whatsapp IS DISTINCT FROM n.whatsapp,             'null'::jsonb,              'null'::jsonb)
    ) AS v(ordem, campo, mudou, de, para)
   WHERE v.mudou;
$function$;

-- Foi uma pessoa? Sem sessão é rotina do banco. Por RPC, só a aprovação de
-- edição do líder conta — as outras RPCs (vincular, converter, tornar direto,
-- sincronizar cartões) têm aviso próprio ou são automáticas. A virada para
-- Não Pago por atraso (`atrasados.service`, pela tela de quem está logado)
-- chega como edição direta e é reconhecida pelo formato.
CREATE OR REPLACE FUNCTION public.fn_acordo_par_aviso_de_pessoa(p_so_atraso boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caminho text := COALESCE(current_setting('request.path', true), '');
BEGIN
  IF auth.uid() IS NULL OR p_so_atraso THEN RETURN false; END IF;
  IF COALESCE(current_setting('app.par_vinculo_sem_aviso', true), '') = 'on' THEN RETURN false; END IF;
  IF v_caminho LIKE '/rpc/%' AND v_caminho <> '/rpc/fn_autorizacao_decidir' THEN RETURN false; END IF;
  RETURN true;
END;
$function$;

-- ── 3. O card no chat ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_acordo_par_avisar(
  p_evento    text,      -- 'alterado' | 'excluido'
  p_empresa   uuid,
  p_lado_a    uuid,      -- operador da linha mexida
  p_acordo_a  uuid,      -- a linha mexida (NULL quando foi excluída)
  p_lado_b    uuid,      -- operador do par
  p_acordo_b  uuid,
  p_dados     jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_autor     uuid := auth.uid();
  v_nome      text;
  v_dados     jsonb;
  v_campos    text;
  v_texto     text;
  v_menor     uuid;
  v_maior     uuid;
  v_conversa  uuid;
  v_ult_id    uuid;
  v_ult_tipo  text;
  v_ult_dados jsonb;
  v_ult_em    timestamptz;
  v_mudancas  jsonb;
BEGIN
  IF v_autor IS NULL OR p_lado_a IS NULL OR p_lado_b IS NULL OR p_lado_a = p_lado_b THEN
    RETURN;
  END IF;

  SELECT COALESCE(nome, 'Alguém') INTO v_nome FROM public.perfis WHERE id = v_autor;

  v_dados := COALESCE(p_dados, '{}'::jsonb) || jsonb_build_object(
    'evento',         p_evento,
    'feito_por',      v_autor,
    'feito_por_nome', v_nome,
    'acordos',        jsonb_strip_nulls(jsonb_build_object(p_lado_a::text, p_acordo_a,
                                                           p_lado_b::text, p_acordo_b)));

  -- A prévia (aviso flutuante, lista de conversas, push). Sem NR nem cliente:
  -- número de 11 dígitos no texto acionaria o expurgo de CPF.
  SELECT string_agg(CASE m->>'campo'
           WHEN 'status'         THEN 'situação'
           WHEN 'valor'          THEN 'valor'
           WHEN 'vencimento'     THEN 'vencimento'
           WHEN 'data_pagamento' THEN 'data de pagamento'
           WHEN 'valor_total'    THEN 'valor total'
           WHEN 'valor_entrada'  THEN 'entrada'
           WHEN 'parcelas'       THEN 'parcelas'
           WHEN 'tipo'           THEN 'forma de pagamento'
           WHEN 'nome_cliente'   THEN 'nome do cliente'
           WHEN 'whatsapp'       THEN 'WhatsApp'
         END, ', ')
    INTO v_campos
    FROM jsonb_array_elements(COALESCE(v_dados->'mudancas', '[]'::jsonb)) m;

  v_texto := CASE p_evento
    WHEN 'excluido' THEN format('%s excluiu um acordo vinculado a você.', v_nome)
    ELSE format('%s alterou um acordo vinculado: %s.', v_nome, COALESCE(v_campos, 'detalhes'))
  END;

  -- Sem chat para um dos dois: notificação comum, com o acordo de quem recebe.
  IF NOT (public.fn_chat_pode_usar(p_lado_a) AND public.fn_chat_pode_usar(p_lado_b)) THEN
    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, acordo_id, autor_id, autor_nome)
    SELECT d.quem, 'Acordo vinculado alterado', v_texto, p_empresa, d.acordo, v_autor, v_nome
      FROM (VALUES (p_lado_a, p_acordo_a), (p_lado_b, p_acordo_b)) AS d(quem, acordo)
     WHERE d.quem <> v_autor;
    RETURN;
  END IF;

  -- A conversa direta dos dois (a mesma que `fn_chat_abrir` abriria).
  v_menor := LEAST(p_lado_a, p_lado_b);
  v_maior := GREATEST(p_lado_a, p_lado_b);
  SELECT c.id INTO v_conversa
    FROM public.chat_conversas c
   WHERE c.tipo = 'direta' AND c.par_menor = v_menor AND c.par_maior = v_maior;

  IF v_conversa IS NULL THEN
    INSERT INTO public.chat_conversas (empresa_id, par_menor, par_maior)
    VALUES (p_empresa, v_menor, v_maior)
    ON CONFLICT (par_menor, par_maior) WHERE tipo = 'direta' DO NOTHING
    RETURNING id INTO v_conversa;
    IF v_conversa IS NULL THEN
      SELECT c.id INTO v_conversa FROM public.chat_conversas c
       WHERE c.tipo = 'direta' AND c.par_menor = v_menor AND c.par_maior = v_maior;
    END IF;
  END IF;

  INSERT INTO public.chat_participantes (conversa_id, perfil_id)
  VALUES (v_conversa, v_menor), (v_conversa, v_maior)
  ON CONFLICT DO NOTHING;

  -- Mesma pessoa, mesmo acordo, há menos de 2 minutos e nada escrito no meio:
  -- soma no card que já está lá. A edição grava a linha e depois o grupo de
  -- parcelas, em duas idas ao banco; seriam dois cards para um salvar.
  SELECT m.id, m.sistema, m.sistema_dados, m.criado_em
    INTO v_ult_id, v_ult_tipo, v_ult_dados, v_ult_em
    FROM public.chat_mensagens m
   WHERE m.conversa_id = v_conversa
   ORDER BY m.criado_em DESC
   LIMIT 1;

  IF v_ult_id IS NOT NULL
     AND v_ult_tipo = 'acordo_vinculo'
     AND p_evento = 'alterado'
     AND v_ult_dados->>'evento' = 'alterado'
     AND v_ult_dados->>'feito_por' = v_autor::text
     AND v_ult_dados->>'chave' IS NOT DISTINCT FROM v_dados->>'chave'
     AND v_ult_em > now() - interval '2 minutes' THEN

    -- Por campo: o «de» mais antigo e o «para» mais novo.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'campo', k,
             'de',    CASE WHEN e.v IS NOT NULL THEN e.v->'de' ELSE n.v->'de' END,
             'para',  CASE WHEN n.v IS NOT NULL THEN n.v->'para' ELSE e.v->'para' END)
             ORDER BY k), '[]'::jsonb)
      INTO v_mudancas
      FROM (SELECT x->>'campo' AS k, x AS v
              FROM jsonb_array_elements(COALESCE(v_ult_dados->'mudancas', '[]'::jsonb)) x) e
      FULL JOIN (SELECT x->>'campo' AS k, x AS v
                   FROM jsonb_array_elements(COALESCE(v_dados->'mudancas', '[]'::jsonb)) x) n
      USING (k);

    -- A prévia é refeita com os campos somados.
    SELECT string_agg(CASE m->>'campo'
             WHEN 'status'         THEN 'situação'
             WHEN 'valor'          THEN 'valor'
             WHEN 'vencimento'     THEN 'vencimento'
             WHEN 'data_pagamento' THEN 'data de pagamento'
             WHEN 'valor_total'    THEN 'valor total'
             WHEN 'valor_entrada'  THEN 'entrada'
             WHEN 'parcelas'       THEN 'parcelas'
             WHEN 'tipo'           THEN 'forma de pagamento'
             WHEN 'nome_cliente'   THEN 'nome do cliente'
             WHEN 'whatsapp'       THEN 'WhatsApp'
           END, ', ')
      INTO v_campos
      FROM jsonb_array_elements(v_mudancas) m;

    UPDATE public.chat_mensagens
       SET sistema_dados = v_ult_dados
                           || jsonb_build_object(
                                'mudancas', v_mudancas,
                                'acordos',  COALESCE(v_ult_dados->'acordos', '{}'::jsonb)
                                            || COALESCE(v_dados->'acordos', '{}'::jsonb),
                                'parcela',  CASE WHEN v_ult_dados->'parcela' = v_dados->'parcela'
                                                 THEN v_dados->'parcela' ELSE 'null'::jsonb END,
                                'parcelas', v_dados->'parcelas',
                                'sincronizado', COALESCE((v_ult_dados->>'sincronizado')::boolean, true)
                                                AND COALESCE((v_dados->>'sincronizado')::boolean, true)),
           texto = format('%s alterou um acordo vinculado: %s.', v_nome, COALESCE(v_campos, 'detalhes'))
     WHERE id = v_ult_id;
    RETURN;
  END IF;

  -- Quem fez fora do par (líder, diretoria) não vira autor da conversa dos dois.
  INSERT INTO public.chat_mensagens (conversa_id, empresa_id, autor_id, texto, sistema, sistema_dados)
  VALUES (v_conversa, p_empresa,
          CASE WHEN v_autor IN (p_lado_a, p_lado_b) THEN v_autor END,
          v_texto, 'acordo_vinculo', v_dados);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_acordo_par_avisar(text, uuid, uuid, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ── 4. Os gatilhos ──────────────────────────────────────────────────────────
--
-- `app.par_vinculo_em_curso = on` marca as escritas que ESTES gatilhos fazem:
-- sem ela, sincronizar o par dispararia o gatilho no par, que sincronizaria de
-- volta. Liga e desliga em volta de cada escrita — `set_config(..., true)` dura
-- até o fim da transação, e a próxima instrução da mesma transação (o UPDATE
-- do grupo de parcelas, por exemplo) precisa ser sincronizada.

-- 4a. Guarda: o par só se escreve por aqui.
CREATE OR REPLACE FUNCTION public.fn_acordos_par_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(current_setting('app.par_vinculo_em_curso', true), '') <> 'on' THEN
    NEW.par_acordo_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.par_acordo_id END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vinculo_par_guarda_ins ON public.acordos;
CREATE TRIGGER trg_vinculo_par_guarda_ins
  BEFORE INSERT ON public.acordos
  FOR EACH ROW WHEN (NEW.par_acordo_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_acordos_par_guarda();

DROP TRIGGER IF EXISTS trg_vinculo_par_guarda_upd ON public.acordos;
CREATE TRIGGER trg_vinculo_par_guarda_upd
  BEFORE UPDATE OF par_acordo_id ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acordos_par_guarda();

-- 4b. Ligar, soltar e sincronizar.
CREATE OR REPLACE FUNCTION public.fn_acordos_par_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_par_atual uuid := NEW.par_acordo_id;
  v_candidato uuid;
  v_par       public.acordos%ROWTYPE;
  v_mudancas  jsonb;
  v_ok        boolean := true;
  v_erro      text;
  v_campo     text;
BEGIN
  IF COALESCE(current_setting('app.par_vinculo_em_curso', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  -- O vínculo deixou de ser o mesmo (virou outro tipo, outro dono, outra
  -- chave, saiu da empresa): as duas metades se soltam.
  IF TG_OP = 'UPDATE' AND OLD.par_acordo_id IS NOT NULL AND (
       NEW.vinculo_operador_id IS DISTINCT FROM OLD.vinculo_operador_id
    OR COALESCE(NEW.tipo_vinculo, 'direto') <> COALESCE(OLD.tipo_vinculo, 'direto')
    OR NEW.operador_id IS DISTINCT FROM OLD.operador_id
    OR NEW.empresa_id  IS DISTINCT FROM OLD.empresa_id
    OR public.fn_acordo_chave_valor(NEW.nr_cliente, NEW.instituicao)
       IS DISTINCT FROM public.fn_acordo_chave_valor(OLD.nr_cliente, OLD.instituicao)
  ) THEN
    PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
    UPDATE public.acordos SET par_acordo_id = NULL
     WHERE id IN (NEW.id, OLD.par_acordo_id) AND par_acordo_id IS NOT NULL;
    PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
    v_par_atual := NULL;
  END IF;

  -- Declara vínculo e ainda não tem par: procura. Ligar não sincroniza — quem
  -- cria o vínculo (`fn_vincular_extra_ao_direto`, `fn_converter_para_extra`)
  -- já grava os dois iguais.
  IF v_par_atual IS NULL THEN
    IF NEW.vinculo_operador_id IS NOT NULL THEN
      v_candidato := public.fn_acordo_par_candidato(NEW.id);
      IF v_candidato IS NOT NULL THEN
        PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
        UPDATE public.acordos
           SET par_acordo_id = CASE WHEN id = NEW.id THEN v_candidato ELSE NEW.id END
         WHERE id IN (NEW.id, v_candidato);
        PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP <> 'UPDATE' THEN RETURN NULL; END IF;

  v_mudancas := public.fn_acordo_par_mudancas(OLD, NEW);
  IF jsonb_array_length(v_mudancas) = 0 THEN RETURN NULL; END IF;

  SELECT * INTO v_par FROM public.acordos WHERE id = v_par_atual FOR UPDATE;
  -- O par tem que declarar o vínculo de volta. Sem isso, não se escreve nele.
  IF NOT FOUND
     OR v_par.par_acordo_id IS DISTINCT FROM NEW.id
     OR v_par.operador_id IS DISTINCT FROM NEW.vinculo_operador_id
     OR v_par.vinculo_operador_id IS DISTINCT FROM NEW.operador_id THEN
    RETURN NULL;
  END IF;

  -- O par pode recusar (NR que voltou a valer e já é de outro, por exemplo).
  -- A edição de quem salvou não cai por isso: o card diz que o outro lado
  -- não acompanhou.
  BEGIN
    PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
    UPDATE public.acordos SET
      nome_cliente   = NEW.nome_cliente,
      valor          = NEW.valor,
      valor_total    = NEW.valor_total,
      valor_entrada  = NEW.valor_entrada,
      vencimento     = NEW.vencimento,
      status         = NEW.status,
      data_pagamento = NEW.data_pagamento,
      parcelas       = NEW.parcelas,
      tipo           = NEW.tipo,
      whatsapp       = NEW.whatsapp
    WHERE id = v_par.id;
    PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    v_ok   := false;
    v_erro := SQLERRM;
    PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
    RAISE WARNING 'fn_acordos_par_vinculo: par % não sincronizado: %', v_par.id, SQLERRM;
  END;

  IF public.fn_acordo_par_aviso_de_pessoa(
       OLD.status = 'verificar_pendente' AND NEW.status = 'nao_pago'
       AND jsonb_array_length(v_mudancas) = 1) THEN
    v_campo := public.fn_nr_campo_chave(NEW.nr_cliente, NEW.instituicao);
    PERFORM public.fn_acordo_par_avisar(
      'alterado', NEW.empresa_id, NEW.operador_id, NEW.id, v_par.operador_id, v_par.id,
      jsonb_build_object(
        'rotulo',       CASE WHEN v_campo = 'instituicao' THEN 'Código' ELSE 'NR' END,
        'chave',        public.fn_acordo_chave_valor(NEW.nr_cliente, NEW.instituicao),
        'cliente',      NEW.nome_cliente,
        'parcela',      NEW.numero_parcela,
        'parcelas',     NEW.parcelas,
        'mudancas',     v_mudancas,
        'sincronizado', v_ok,
        'erro',         v_erro));
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vinculo_par_ins ON public.acordos;
CREATE TRIGGER trg_vinculo_par_ins
  AFTER INSERT ON public.acordos
  FOR EACH ROW WHEN (NEW.vinculo_operador_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_acordos_par_vinculo();

DROP TRIGGER IF EXISTS trg_vinculo_par_upd ON public.acordos;
CREATE TRIGGER trg_vinculo_par_upd
  AFTER UPDATE ON public.acordos
  FOR EACH ROW WHEN (OLD.par_acordo_id IS NOT NULL OR NEW.vinculo_operador_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_acordos_par_vinculo();

-- 4c. Exclusão. Roda depois de `trg_sync_nr_registros` (ordem alfabética dos
-- gatilhos AFTER), que é quem solta o NR da linha apagada.
CREATE OR REPLACE FUNCTION public.fn_acordos_par_vinculo_exclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_par       public.acordos%ROWTYPE;
  v_resultado text;
  v_campo     text;
BEGIN
  IF COALESCE(current_setting('app.par_vinculo_em_curso', true), '') = 'on' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_par FROM public.acordos WHERE id = OLD.par_acordo_id FOR UPDATE;
  IF NOT FOUND OR v_par.par_acordo_id IS DISTINCT FROM OLD.id THEN RETURN NULL; END IF;

  PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
  IF COALESCE(OLD.tipo_vinculo, 'direto') = 'direto' THEN
    -- Saiu o DIRETO: o EXTRA assume. Se o NR ainda for de outra linha (outra
    -- parcela do mesmo dono), `fn_nr_exigir_livre` recusa e o EXTRA só perde
    -- o vínculo.
    BEGIN
      UPDATE public.acordos
         SET tipo_vinculo = 'direto', vinculo_operador_id = NULL,
             vinculo_operador_nome = NULL, par_acordo_id = NULL
       WHERE id = v_par.id;
      v_resultado := 'virou_direto';
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.acordos
         SET vinculo_operador_id = NULL, vinculo_operador_nome = NULL, par_acordo_id = NULL
       WHERE id = v_par.id;
      v_resultado := 'sem_vinculo';
    END;
  ELSE
    UPDATE public.acordos
       SET vinculo_operador_id = NULL, vinculo_operador_nome = NULL, par_acordo_id = NULL
     WHERE id = v_par.id;
    v_resultado := 'sem_vinculo';
  END IF;
  PERFORM set_config('app.par_vinculo_em_curso', 'off', true);

  IF public.fn_acordo_par_aviso_de_pessoa(false) THEN
    v_campo := public.fn_nr_campo_chave(OLD.nr_cliente, OLD.instituicao);
    PERFORM public.fn_acordo_par_avisar(
      'excluido', OLD.empresa_id, OLD.operador_id, NULL, v_par.operador_id, v_par.id,
      jsonb_build_object(
        'rotulo',         CASE WHEN v_campo = 'instituicao' THEN 'Código' ELSE 'NR' END,
        'chave',          public.fn_acordo_chave_valor(OLD.nr_cliente, OLD.instituicao),
        'cliente',        OLD.nome_cliente,
        'parcela',        OLD.numero_parcela,
        'parcelas',       OLD.parcelas,
        'tipo_excluido',  COALESCE(OLD.tipo_vinculo, 'direto'),
        'resultado',      v_resultado));
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_vinculo_par_del ON public.acordos;
CREATE TRIGGER trg_vinculo_par_del
  AFTER DELETE ON public.acordos
  FOR EACH ROW WHEN (OLD.par_acordo_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_acordos_par_vinculo_exclusao();

-- ── 5. A sincronização da tela aposentada ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sync_par_vinculo(
  p_acordo_id uuid, p_valor numeric, p_vencimento date, p_nome_cliente text, p_tipo text,
  p_whatsapp text DEFAULT NULL::text, p_parcelas integer DEFAULT 1, p_status text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Desde 20261030235500 o par se sincroniza no banco (`trg_vinculo_par_upd`).
  -- Fica de pé só para as abas abertas com a versão antiga, que ainda chamam:
  -- regravar aqui duplicaria o card e podia escolher a parcela errada.
  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.fn_sync_par_vinculo(uuid, numeric, date, text, text, text, integer, text) IS
  'Aposentada em 20261030235500: o par se sincroniza pelo gatilho trg_vinculo_par_upd. Não faz nada.';

-- ── 6. Parcelas novas chegam ao par ─────────────────────────────────────────

-- 6a. Reagendar (cópia da definição em produção em 30/10/2026; muda a busca
-- do par, que passa pelo vínculo explícito, e a ligação das duas parcelas).
CREATE OR REPLACE FUNCTION public.fn_acordo_agendar_proxima_parcela(
  p_acordo_id uuid, p_vencimento date, p_valor numeric, p_valor_par numeric DEFAULT NULL::numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b          public.acordos%ROWTYPE;
  par        public.acordos%ROWTYPE;
  v_escopo   INTEGER;
  v_proxima  INTEGER;
  v_prox_par INTEGER;
  v_grupo_par UUID;
  v_hoje     DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_id       UUID;
  v_par_id   UUID;
  v_existia  BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_vencimento IS NULL OR p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS: informe data e valor da próxima parcela'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO b FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACORDO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;

  v_escopo := public.fn_user_escopo_acordos();

  IF NOT (
    (public.fn_user_is_super_admin()
     OR public.fn_user_acesso_multiempresa()
     OR b.empresa_id = public.fn_user_empresa_id())
    AND (
      b.operador_id = auth.uid()
      OR public.fn_user_is_super_admin()
      OR v_escopo >= 3
      OR (v_escopo >= 2 AND (
            b.setor_id = public.fn_user_setor_id()
            OR (b.setor_id IS NULL
                AND public.fn_operador_setor_id(b.operador_id) = public.fn_user_setor_id())
            OR public.fn_operador_clonado_no_setor(b.operador_id, public.fn_user_setor_id())))
      OR (v_escopo = 1 AND public.fn_operador_no_meu_alcance_de_equipe(b.operador_id))
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: este acordo não está no seu alcance'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_user_tem('editar_acordos') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: seu cargo não pode editar acordos'
      USING ERRCODE = '42501';
  END IF;

  IF b.acordo_grupo_id IS NULL THEN
    RAISE EXCEPTION 'SEM_GRUPO: o acordo não tem grupo de parcelas' USING ERRCODE = '22023';
  END IF;
  IF b.tipo IN ('pix_automatico', 'cartao_recorrente') THEN
    RAISE EXCEPTION 'FORMA_RECORRENTE: PIX Automático e Cartão Recorrente não reagendam'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(b.parcelas, 1) <= 1 THEN
    RAISE EXCEPTION 'PARCELA_UNICA: o acordo não é parcelado' USING ERRCODE = '22023';
  END IF;
  v_proxima := COALESCE(b.numero_parcela, 1) + 1;
  IF v_proxima > COALESCE(b.parcelas, 1) THEN
    RAISE EXCEPTION 'ULTIMA_PARCELA: esta já é a última parcela' USING ERRCODE = '22023';
  END IF;

  SELECT a.id INTO v_id
    FROM public.acordos a
   WHERE a.acordo_grupo_id = b.acordo_grupo_id AND a.numero_parcela = v_proxima;

  IF v_id IS NOT NULL THEN
    v_existia := TRUE;
  ELSE
    -- As duas parcelas novas nascem sem o gatilho de ligação: ele acharia
    -- primeiro uma linha antiga solta do mesmo mês. A ligação é feita abaixo,
    -- uma com a outra.
    PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
    BEGIN
      INSERT INTO public.acordos (
        nome_cliente, nr_cliente, instituicao, whatsapp, observacoes, estado_uf,
        tipo, parcelas, operador_id, empresa_id, setor_id, data_cadastro,
        acordo_grupo_id, numero_parcela, tipo_vinculo, vinculo_operador_id,
        vinculo_operador_nome, valor_total, usou_quarenta_pct, valor_entrada,
        status, valor, vencimento)
      VALUES (
        b.nome_cliente, b.nr_cliente, b.instituicao, b.whatsapp, b.observacoes, b.estado_uf,
        b.tipo, b.parcelas, b.operador_id, b.empresa_id, b.setor_id, v_hoje,
        b.acordo_grupo_id, v_proxima, b.tipo_vinculo, b.vinculo_operador_id,
        b.vinculo_operador_nome, b.valor_total, COALESCE(b.usou_quarenta_pct, FALSE), b.valor_entrada,
        'verificar_pendente', round(p_valor, 2), p_vencimento)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT a.id INTO v_id
        FROM public.acordos a
       WHERE a.acordo_grupo_id = b.acordo_grupo_id AND a.numero_parcela = v_proxima;
      v_existia := TRUE;
    END;
    PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
  END IF;

  IF NOT v_existia AND b.vinculo_operador_id IS NOT NULL THEN
    -- O par desta parcela, pelo vínculo explícito. Sem ele (linha de antes de
    -- 20261030235500 que a carga não ligou), a busca antiga.
    SELECT a.* INTO par FROM public.acordos a
     WHERE a.id = b.par_acordo_id
       AND a.operador_id = b.vinculo_operador_id
       AND a.vinculo_operador_id = b.operador_id
     FOR UPDATE;

    IF NOT FOUND THEN
      SELECT a.* INTO par
        FROM public.acordos a
       WHERE a.empresa_id = b.empresa_id
         AND a.id <> b.id
         AND a.operador_id = b.vinculo_operador_id
         AND a.vinculo_operador_id = b.operador_id
         AND a.tipo_vinculo = CASE WHEN b.tipo_vinculo = 'extra' THEN 'direto' ELSE 'extra' END
         AND a.numero_parcela IS NOT DISTINCT FROM b.numero_parcela
         AND a.acordo_grupo_id IS NOT NULL
         AND (
           (TRIM(COALESCE(b.nr_cliente, '')) <> ''
            AND TRIM(COALESCE(a.nr_cliente, '')) = TRIM(b.nr_cliente))
           OR (TRIM(COALESCE(b.nr_cliente, '')) = '' AND TRIM(COALESCE(b.instituicao, '')) <> ''
               AND TRIM(COALESCE(a.instituicao, '')) = TRIM(b.instituicao))
         )
       ORDER BY a.criado_em
       LIMIT 1
       FOR UPDATE;
    END IF;

    IF FOUND THEN
      PERFORM set_config('app.par_vinculo_em_curso', 'on', true);

      -- O par pode ser uma parcela única ainda sem grupo.
      v_grupo_par := par.acordo_grupo_id;
      IF v_grupo_par IS NULL THEN
        v_grupo_par := gen_random_uuid();
        UPDATE public.acordos
           SET acordo_grupo_id = v_grupo_par, numero_parcela = COALESCE(numero_parcela, 1)
         WHERE id = par.id;
        par.numero_parcela := COALESCE(par.numero_parcela, 1);
      END IF;
      -- A numeração do par segue a dele: o direto pode ser a parcela 3 e o
      -- extra a 1 do mesmo mês.
      v_prox_par := COALESCE(par.numero_parcela, 1) + 1;

      IF NOT EXISTS (
        SELECT 1 FROM public.acordos x
         WHERE x.acordo_grupo_id = v_grupo_par AND x.numero_parcela = v_prox_par
      ) THEN
        BEGIN
          INSERT INTO public.acordos (
            nome_cliente, nr_cliente, instituicao, whatsapp, observacoes, estado_uf,
            tipo, parcelas, operador_id, empresa_id, setor_id, data_cadastro,
            acordo_grupo_id, numero_parcela, tipo_vinculo, vinculo_operador_id,
            vinculo_operador_nome, valor_total, usou_quarenta_pct, valor_entrada,
            status, valor, vencimento)
          VALUES (
            par.nome_cliente, par.nr_cliente, par.instituicao, par.whatsapp, par.observacoes, par.estado_uf,
            par.tipo, b.parcelas, par.operador_id, par.empresa_id, par.setor_id, v_hoje,
            v_grupo_par, v_prox_par, par.tipo_vinculo, par.vinculo_operador_id,
            par.vinculo_operador_nome, par.valor_total, COALESCE(par.usou_quarenta_pct, FALSE), par.valor_entrada,
            'verificar_pendente', round(COALESCE(p_valor_par, p_valor), 2), p_vencimento)
          RETURNING id INTO v_par_id;
        EXCEPTION WHEN unique_violation THEN
          v_par_id := NULL;
        END;
      END IF;

      IF v_par_id IS NOT NULL THEN
        UPDATE public.acordos
           SET par_acordo_id = CASE WHEN id = v_id THEN v_par_id ELSE v_id END
         WHERE id IN (v_id, v_par_id);
      END IF;

      PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id',             v_id,
    'numero_parcela', v_proxima,
    'parcelas',       b.parcelas,
    'ja_existia',     v_existia,
    'par_id',         v_par_id,
    'operador_id',    b.operador_id
  );
END;
$function$;

-- 6b. Parcela adicionada à mão (`parcelas.service`). Era um INSERT no acordo
-- do colega feito pelo navegador, que a RLS recusava para operador comum.
CREATE OR REPLACE FUNCTION public.fn_acordo_par_espelhar_parcela(p_nova_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  n        public.acordos%ROWTYPE;
  irma     public.acordos%ROWTYPE;
  par      public.acordos%ROWTYPE;
  v_grupo  uuid;
  v_num    integer;
  v_id     uuid;
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO n FROM public.acordos WHERE id = p_nova_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF NOT public.fn_can_access_empresa(n.empresa_id)
     OR NOT public.fn_pode_gerir_acordo(n.setor_id, n.operador_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;
  IF n.vinculo_operador_id IS NULL OR n.par_acordo_id IS NOT NULL OR n.acordo_grupo_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'resultado', 'nada_a_espelhar');
  END IF;

  -- O grupo do par sai de uma irmã já ligada.
  SELECT * INTO irma FROM public.acordos
   WHERE acordo_grupo_id = n.acordo_grupo_id AND id <> n.id AND par_acordo_id IS NOT NULL
   ORDER BY numero_parcela DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'resultado', 'sem_par');
  END IF;
  SELECT * INTO par FROM public.acordos WHERE id = irma.par_acordo_id FOR UPDATE;
  IF NOT FOUND
     OR par.operador_id IS DISTINCT FROM n.vinculo_operador_id
     OR par.vinculo_operador_id IS DISTINCT FROM n.operador_id THEN
    RETURN jsonb_build_object('ok', true, 'resultado', 'sem_par');
  END IF;

  PERFORM set_config('app.par_vinculo_em_curso', 'on', true);

  v_grupo := par.acordo_grupo_id;
  IF v_grupo IS NULL THEN
    v_grupo := gen_random_uuid();
    UPDATE public.acordos
       SET acordo_grupo_id = v_grupo, numero_parcela = COALESCE(numero_parcela, 1)
     WHERE id = par.id;
  END IF;

  SELECT COALESCE(max(numero_parcela), 1) + 1 INTO v_num
    FROM public.acordos WHERE acordo_grupo_id = v_grupo;

  INSERT INTO public.acordos (
    nome_cliente, nr_cliente, instituicao, whatsapp, observacoes, estado_uf,
    tipo, parcelas, operador_id, empresa_id, setor_id, data_cadastro,
    acordo_grupo_id, numero_parcela, tipo_vinculo, vinculo_operador_id,
    vinculo_operador_nome, valor_total, usou_quarenta_pct, valor_entrada,
    status, data_pagamento, valor, vencimento)
  VALUES (
    n.nome_cliente, par.nr_cliente, par.instituicao, n.whatsapp, par.observacoes, par.estado_uf,
    n.tipo, n.parcelas, par.operador_id, par.empresa_id, par.setor_id, v_hoje,
    v_grupo, v_num, par.tipo_vinculo, par.vinculo_operador_id,
    par.vinculo_operador_nome, n.valor_total, COALESCE(n.usou_quarenta_pct, FALSE), n.valor_entrada,
    n.status, n.data_pagamento, n.valor, n.vencimento)
  RETURNING id INTO v_id;

  UPDATE public.acordos
     SET par_acordo_id = CASE WHEN id = n.id THEN v_id ELSE n.id END
   WHERE id IN (n.id, v_id);

  -- O «de N» do grupo do par acompanha.
  UPDATE public.acordos SET parcelas = n.parcelas
   WHERE acordo_grupo_id = v_grupo AND parcelas IS DISTINCT FROM n.parcelas;

  PERFORM set_config('app.par_vinculo_em_curso', 'off', true);

  RETURN jsonb_build_object('ok', true, 'resultado', 'espelhada', 'par_id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_acordo_par_espelhar_parcela(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_acordo_par_espelhar_parcela(uuid) TO authenticated;

-- ── 7. Tornar DIRETO avisa do jeito dele ────────────────────────────────────
-- Cópia da definição em produção em 30/10/2026, com o card desligado durante a
-- execução: a função apaga o DIRETO do colega e já manda a notificação certa
-- («seu acordo foi para a lixeira»). O card de «excluído» diria outra coisa.

CREATE OR REPLACE FUNCTION public.fn_tornar_direto_executar(p_extra_id uuid, p_autorizador_id uuid, p_autorizador_nome text, p_origem text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_extra    public.acordos%ROWTYPE;
  v_direto   public.acordos%ROWTYPE;
  v_alvo     RECORD;
  v_nome_ext TEXT;
  v_label    TEXT;
  v_linhas   INTEGER := 0;
  v_removido UUID;
BEGIN
  PERFORM set_config('app.par_vinculo_sem_aviso', 'on', true);

  SELECT * INTO v_extra FROM public.acordos WHERE id = p_extra_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM set_config('app.par_vinculo_sem_aviso', 'off', true);
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF COALESCE(v_extra.tipo_vinculo, 'direto') <> 'extra' THEN
    PERFORM set_config('app.par_vinculo_sem_aviso', 'off', true);
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_e_extra');
  END IF;

  SELECT nome INTO v_nome_ext FROM public.perfis WHERE id = v_extra.operador_id;
  SELECT * INTO v_alvo FROM public.fn_tornar_direto_alvo(p_extra_id);
  v_label := CASE WHEN v_alvo.campo = 'instituicao' THEN 'Código' ELSE 'NR' END;

  -- ── O DIRETO do colega sai (so no caso vinculado) ──────────────────────────
  IF v_alvo.direto_id IS NOT NULL THEN
    SELECT * INTO v_direto FROM public.acordos WHERE id = v_alvo.direto_id FOR UPDATE;

    INSERT INTO public.lixeira_acordos (
      acordo_id, empresa_id, operador_id, operador_nome,
      nome_cliente, nr_cliente, valor, vencimento, tipo, status,
      observacoes, instituicao, dados_completos, motivo,
      autorizado_por_id, autorizado_por_nome,
      transferido_para_id, transferido_para_nome
    ) VALUES (
      v_direto.id, v_direto.empresa_id, v_direto.operador_id, v_alvo.dono_nome,
      v_direto.nome_cliente, v_direto.nr_cliente, v_direto.valor, v_direto.vencimento,
      v_direto.tipo, v_direto.status, v_direto.observacoes, v_direto.instituicao,
      to_jsonb(v_direto), 'troca_extra',
      p_autorizador_id, p_autorizador_nome,
      v_extra.operador_id, COALESCE(v_nome_ext, 'Operador')
    );

    -- `trg_sync_nr_registros` solta o NR neste DELETE.
    DELETE FROM public.acordos WHERE id = v_direto.id;
    v_removido := v_direto.id;

    -- O que sobrou do colega com essa chave (parcelas pagas) deixa de apontar
    -- para um EXTRA que nao existe mais.
    EXECUTE format(
      'UPDATE public.acordos
          SET vinculo_operador_id = NULL, vinculo_operador_nome = NULL
        WHERE empresa_id = $1 AND operador_id = $2 AND vinculo_operador_id = $3
          AND %I = $4', v_alvo.campo)
    USING v_extra.empresa_id, v_direto.operador_id, v_extra.operador_id, v_alvo.valor;

    -- Linhas do Analitico que apontavam para o acordo apagado voltam a ser
    -- conferidas pela tela (a FK ja zera o acordo_id; o status e daqui).
    UPDATE public.analitico_recebimentos
       SET status_tabulacao = 'nao_tabulado', acordo_id = NULL
     WHERE acordo_id = v_direto.id
       AND operador_id IS DISTINCT FROM v_extra.operador_id;

    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
    VALUES (
      v_direto.operador_id,
      format('Seu %s "%s" passou a ser DIRETO de outra pessoa', v_label, v_alvo.valor),
      format('%s tinha o %s "%s" como EXTRA e ele passou a ser DIRETO dela%s. '
             'Seu acordo foi para a lixeira. Detalhes: Valor R$ %s | Vencimento %s | Status: %s.',
             COALESCE(v_nome_ext, 'Um operador'), v_label, v_alvo.valor,
             CASE WHEN p_autorizador_nome IS NOT NULL
                  THEN ', com autorização de ' || p_autorizador_nome ELSE '' END,
             COALESCE(to_char(v_direto.valor, 'FM999G999G990D00'), '—'),
             COALESCE(to_char(v_direto.vencimento, 'DD/MM/YYYY'), '—'),
             COALESCE(v_direto.status, '—')),
      v_extra.empresa_id, p_autorizador_id, COALESCE(p_autorizador_nome, v_nome_ext)
    );
  END IF;

  -- ── O EXTRA vira DIRETO ─────────────────────────────────────────────────────
  -- Primeiro as parcelas nao pagas do grupo, por ultimo a linha escolhida: o
  -- gatilho registra o NR a cada uma, e a ultima gravada fica como titular.
  IF v_extra.acordo_grupo_id IS NOT NULL THEN
    UPDATE public.acordos
       SET tipo_vinculo = 'direto', vinculo_operador_id = NULL, vinculo_operador_nome = NULL
     WHERE acordo_grupo_id = v_extra.acordo_grupo_id
       AND operador_id     = v_extra.operador_id
       AND id             <> v_extra.id
       AND tipo_vinculo    = 'extra'
       AND status         <> 'pago';
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;

  UPDATE public.acordos
     SET tipo_vinculo = 'direto', vinculo_operador_id = NULL, vinculo_operador_nome = NULL
   WHERE id = v_extra.id;

  INSERT INTO public.logs_sistema
    (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
     empresa_id, alvo_tipo, alvo_rotulo, detalhes)
  VALUES (
    COALESCE(p_autorizador_id, auth.uid()), 'acordo_tornado_direto', 'acordo', 'aviso',
    CASE WHEN v_removido IS NULL
         THEN format('O %s %s de %s deixou de ser EXTRA e passou a DIRETO (sem vínculo com outra pessoa).',
                     v_label, COALESCE(v_alvo.valor, '—'), COALESCE(v_nome_ext, 'operador'))
         ELSE format('O %s %s passou a ser DIRETO de %s; o acordo de %s foi para a lixeira.%s',
                     v_label, v_alvo.valor, COALESCE(v_nome_ext, 'operador'), v_alvo.dono_nome,
                     CASE WHEN p_autorizador_nome IS NOT NULL
                          THEN ' Autorizado por ' || p_autorizador_nome || '.' ELSE '' END)
    END,
    'ui', 'acordos', v_extra.id, v_extra.empresa_id,
    'acordo', format('%s %s', v_label, COALESCE(v_alvo.valor, '—')),
    jsonb_build_object(
      'origem',            p_origem,
      'extra_id',          v_extra.id,
      'operador_id',       v_extra.operador_id,
      'operador_nome',     v_nome_ext,
      'direto_removido',   v_removido,
      'dono_anterior_id',  v_alvo.dono_id,
      'dono_anterior',     v_alvo.dono_nome,
      'parcelas_do_grupo', v_linhas,
      'autorizado_por',    p_autorizador_nome)
  );

  PERFORM set_config('app.par_vinculo_sem_aviso', 'off', true);

  RETURN jsonb_build_object(
    'ok',               true,
    'acordo_id',        v_extra.id,
    'vinculado',        v_removido IS NOT NULL,
    'direto_removido',  v_removido,
    'dono_anterior',    v_alvo.dono_nome,
    'parcelas_do_grupo', v_linhas);
END
$function$;

-- ── 8. Carga: ligar os pares que existem e alinhar os de outubro ────────────
--
-- A ligação mexe em `atualizado_em` (gatilho de timestamp), e é por ele que se
-- sabe qual lado foi alterado por último. Por isso a foto vem antes.

CREATE TEMP TABLE _par_antes ON COMMIT DROP AS
  SELECT id, atualizado_em FROM public.acordos WHERE vinculo_operador_id IS NOT NULL;

DO $carga$
DECLARE
  r          record;
  v_par      uuid;
  v_ligados  integer := 0;
  v_alinhados integer := 0;
  v_falhas   integer := 0;
BEGIN
  PERFORM set_config('app.par_vinculo_em_curso', 'on', true);

  -- 8a. Ligar. EXTRA por EXTRA, do mais antigo ao mais novo.
  FOR r IN
    SELECT a.id FROM public.acordos a
     WHERE a.vinculo_operador_id IS NOT NULL
       AND a.tipo_vinculo = 'extra'
       AND a.par_acordo_id IS NULL
     ORDER BY a.vencimento, a.criado_em
  LOOP
    v_par := public.fn_acordo_par_candidato(r.id);
    IF v_par IS NOT NULL THEN
      UPDATE public.acordos
         SET par_acordo_id = CASE WHEN id = r.id THEN v_par ELSE r.id END
       WHERE id IN (r.id, v_par);
      v_ligados := v_ligados + 1;
    END IF;
  END LOOP;

  -- 8b. Alinhar, só de outubro/2026 em diante (mês fechado não muda). Vence o
  -- lado alterado por último.
  FOR r IN
    SELECT CASE WHEN ae.atualizado_em >= ad.atualizado_em THEN e.id ELSE d.id END AS ganhador,
           CASE WHEN ae.atualizado_em >= ad.atualizado_em THEN d.id ELSE e.id END AS perdedor
      FROM public.acordos e
      JOIN public.acordos d ON d.id = e.par_acordo_id AND d.par_acordo_id = e.id
      JOIN _par_antes ae ON ae.id = e.id
      JOIN _par_antes ad ON ad.id = d.id
     WHERE e.tipo_vinculo = 'extra'
       AND e.vencimento >= date '2026-10-01'
       AND d.vencimento >= date '2026-10-01'
       AND (e.nome_cliente, e.valor, e.valor_total, e.valor_entrada, e.vencimento, e.status,
            e.data_pagamento, e.parcelas, e.tipo, e.whatsapp)
           IS DISTINCT FROM
           (d.nome_cliente, d.valor, d.valor_total, d.valor_entrada, d.vencimento, d.status,
            d.data_pagamento, d.parcelas, d.tipo, d.whatsapp)
  LOOP
    BEGIN
      UPDATE public.acordos l SET
        nome_cliente   = w.nome_cliente,
        valor          = w.valor,
        valor_total    = w.valor_total,
        valor_entrada  = w.valor_entrada,
        vencimento     = w.vencimento,
        status         = w.status,
        data_pagamento = w.data_pagamento,
        parcelas       = w.parcelas,
        tipo           = w.tipo,
        whatsapp       = w.whatsapp
      FROM public.acordos w
      WHERE w.id = r.ganhador AND l.id = r.perdedor;
      v_alinhados := v_alinhados + 1;
    EXCEPTION WHEN OTHERS THEN
      v_falhas := v_falhas + 1;
      RAISE NOTICE 'par % não alinhado: %', r.perdedor, SQLERRM;
    END;
  END LOOP;

  PERFORM set_config('app.par_vinculo_em_curso', 'off', true);
  RAISE NOTICE 'pares ligados: %, alinhados: %, falhas: %', v_ligados, v_alinhados, v_falhas;
END
$carga$;

COMMIT;
