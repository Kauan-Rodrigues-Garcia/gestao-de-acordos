-- ============================================================================
-- Par Direto/Extra: alinha ao LIGAR, Extra marcado à mão vincula, e acordo
-- encerrado de mês anterior não segura mais o NR de outra pessoa
-- ============================================================================
--
-- ## Por que (auditoria de 11/11/2026, pedido do Cleber)
--
-- 1. Quatro pares de novembro com os dois lados diferentes. Todos nasceram
--    assim: `fn_vincular_extra_ao_direto` / `fn_converter_para_extra` copiam
--    só valor, vencimento, nome, forma, WhatsApp e parcelas, e o gatilho
--    liga as metades SEM alinhar («ligar não sincroniza»). Ficavam diferentes
--    situação, data de pagamento, valor total e entrada.
--    Regra do Cleber: ao ligar, vale a tabulação NOVA (a linha criada por
--    último) nos 10 campos do par — mas o «pago» nunca se desfaz: se um lado
--    já está pago, o par fica pago com a data de pagamento dele.
--
-- 2. Três Extras de novembro sem par: o NR estava preso num acordo do dono de
--    MÊS ANTERIOR, já pago e encerrado (set/out). Regra do Cleber: acordo
--    encerrado de mês anterior não segura o NR de outra pessoa — quem tabula
--    agora vira DIRETO. «Encerrado» = pago, vencimento antes do mês corrente
--    (São Paulo) e última parcela do plano (ou parcela única). Plano em
--    andamento continua segurando: senão o dono não conseguiria reagendar a
--    parcela do mês. Não pago já liberava (`fn_sync_nr_registros`). Vale só
--    para OUTRA pessoa: o próprio dono continua no fluxo de adicionar parcela.
--
-- 3. «Extra» marcado à mão antes de salvar, com o NR de um DIRETO de outra
--    pessoa que também tem a lógica Direto/Extra: virava pedido de
--    transferência ao líder em vez de vínculo. A pessoa declarou que é Extra;
--    o dono continua Direto. `fn_vincular_extra_ao_direto` passa a exigir só
--    que QUEM vincula tenha a lógica ligada.
--
-- ## O que muda
--
--   - `fn_acordo_encerrado_mes_anterior(status, vencimento, parcela, parcelas)`.
--   - `fn_nr_dono_conflitante` ignora o titular encerrado de mês anterior.
--   - `fn_nr_registro_vigente(...)` (nova, RPC): o registro do NR que vale
--     agora para quem pergunta — a tela deixa de ler `nr_registros` cru.
--   - `fn_acordos_par_vinculo`: ao ligar, alinha (definição de produção em
--     11/11/2026; só o bloco de ligar muda).
--   - `fn_vincular_extra_ao_direto`: regra de configuração (definição de
--     produção em 11/11/2026; só essa condição muda).
--
-- Não escreve em nenhuma linha. Reaplicável.

BEGIN;

-- ── 1. Encerrado de mês anterior ────────────────────────────────────────────
-- SQL puro, sem SET: embute na consulta de quem chama.
CREATE OR REPLACE FUNCTION public.fn_acordo_encerrado_mes_anterior(
  p_status text, p_vencimento date, p_numero_parcela integer, p_parcelas integer)
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT p_status = 'pago'
     AND p_vencimento < date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date
     AND COALESCE(p_numero_parcela, 1) >= COALESCE(p_parcelas, 1);
$function$;

COMMENT ON FUNCTION public.fn_acordo_encerrado_mes_anterior(text, date, integer, integer) IS
  'Pago, de mês anterior (São Paulo) e última parcela do plano: não segura o NR de outra pessoa. Ver 20261111170000.';

-- ── 2. Quem segura o NR (o banco, na gravação) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nr_dono_conflitante(
  p_empresa_id uuid, p_nr text, p_campo text, p_operador_id uuid, p_grupo_id uuid DEFAULT NULL::uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.operador_nome
    FROM public.nr_registros r
    JOIN public.acordos a ON a.id = r.acordo_id
   WHERE r.empresa_id  = p_empresa_id
     AND r.nr_value    = p_nr
     AND r.campo       = p_campo
     AND r.operador_id IS DISTINCT FROM p_operador_id
     -- parcela do mesmo grupo não conflita: o pai já é dono do NR
     AND (p_grupo_id IS NULL OR a.acordo_grupo_id IS DISTINCT FROM p_grupo_id)
     -- acordo encerrado de mês anterior não segura o NR (20261111170000)
     AND NOT public.fn_acordo_encerrado_mes_anterior(a.status, a.vencimento, a.numero_parcela, a.parcelas)
   LIMIT 1;
$function$;

-- ── 3. Quem segura o NR (a tela, antes de gravar) ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nr_registro_vigente(
  p_empresa_id uuid, p_nr text, p_campo text, p_excluir_acordo_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, operador_id uuid, operador_nome text, acordo_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT r.id, r.operador_id, r.operador_nome, r.acordo_id
    FROM public.nr_registros r
    LEFT JOIN public.acordos a ON a.id = r.acordo_id
   WHERE public.fn_can_access_empresa(p_empresa_id)
     AND r.empresa_id = p_empresa_id
     AND r.nr_value   = btrim(p_nr)
     AND r.campo      = p_campo
     AND (p_excluir_acordo_id IS NULL OR r.acordo_id IS DISTINCT FROM p_excluir_acordo_id)
     AND NOT (r.operador_id IS DISTINCT FROM auth.uid()
              AND a.id IS NOT NULL
              AND public.fn_acordo_encerrado_mes_anterior(a.status, a.vencimento, a.numero_parcela, a.parcelas))
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.fn_nr_registro_vigente(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_nr_registro_vigente(uuid, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_nr_registro_vigente(uuid, text, text, uuid) IS
  'Registro do NR que vale para quem consulta: ignora titular encerrado de mês anterior de outra pessoa. Ver 20261111170000.';

-- ── 4. Ligar o par alinha ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_acordos_par_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_par_atual uuid := NEW.par_acordo_id;
  v_candidato uuid;
  v_par       public.acordos%ROWTYPE;
  v_a         public.acordos%ROWTYPE;
  v_g         public.acordos%ROWTYPE;   -- ganhador: a tabulação nova
  v_p         public.acordos%ROWTYPE;   -- perdedor
  v_status    text;
  v_dt_pag    date;
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

  -- Declara vínculo e ainda não tem par: procura, liga e ALINHA
  -- (20261111170000). Vale a linha criada por último; o «pago» de qualquer
  -- lado nunca se desfaz.
  IF v_par_atual IS NULL THEN
    IF NEW.vinculo_operador_id IS NOT NULL THEN
      v_candidato := public.fn_acordo_par_candidato(NEW.id);
      IF v_candidato IS NOT NULL THEN
        PERFORM set_config('app.par_vinculo_em_curso', 'on', true);
        UPDATE public.acordos
           SET par_acordo_id = CASE WHEN id = NEW.id THEN v_candidato ELSE NEW.id END
         WHERE id IN (NEW.id, v_candidato);

        SELECT * INTO v_a   FROM public.acordos WHERE id = NEW.id;
        SELECT * INTO v_par FROM public.acordos WHERE id = v_candidato;
        IF v_par.criado_em > v_a.criado_em THEN
          v_g := v_par; v_p := v_a;
        ELSE
          v_g := v_a;   v_p := v_par;
        END IF;

        v_status := v_g.status;
        v_dt_pag := v_g.data_pagamento;
        IF v_g.status IS DISTINCT FROM 'pago' AND v_p.status = 'pago' THEN
          v_status := 'pago';
          v_dt_pag := v_p.data_pagamento;
        END IF;

        BEGIN
          UPDATE public.acordos SET
            nome_cliente   = v_g.nome_cliente,
            valor          = v_g.valor,
            valor_total    = v_g.valor_total,
            valor_entrada  = v_g.valor_entrada,
            vencimento     = v_g.vencimento,
            status         = v_status,
            data_pagamento = v_dt_pag,
            parcelas       = v_g.parcelas,
            tipo           = v_g.tipo,
            whatsapp       = v_g.whatsapp
          WHERE id IN (v_g.id, v_p.id)
            AND (nome_cliente, valor, valor_total, valor_entrada, vencimento, status,
                 data_pagamento, parcelas, tipo, whatsapp)
                IS DISTINCT FROM
                (v_g.nome_cliente, v_g.valor, v_g.valor_total, v_g.valor_entrada, v_g.vencimento, v_status,
                 v_dt_pag, v_g.parcelas, v_g.tipo, v_g.whatsapp);
        EXCEPTION WHEN OTHERS THEN
          -- Ligar não cai por isso: o par fica ligado e a próxima edição sincroniza.
          RAISE WARNING 'fn_acordos_par_vinculo: par % não alinhado ao ligar: %', v_candidato, SQLERRM;
        END;

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

-- ── 5. Extra marcado à mão vincula mesmo com a lógica ligada no dono ────────
CREATE OR REPLACE FUNCTION public.fn_vincular_extra_ao_direto(
  p_direto_id uuid, p_extra_op_id uuid, p_extra_op_nome text, p_valor numeric, p_vencimento date,
  p_nome_cliente text, p_tipo text, p_nr_cliente text, p_instituicao text,
  p_whatsapp text DEFAULT NULL::text, p_parcelas integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              UUID := auth.uid();
  v_empresa_id       UUID;
  v_direto_operador  UUID;
  v_direto_tipo      TEXT;
  v_direto_vinculo   UUID;
  v_direto_nr        TEXT;
  v_direto_inst      TEXT;
  v_empresa_slug     TEXT;
  v_nome_real        TEXT;
  v_perfil_ativo     BOOLEAN;
  v_situacao         TEXT;
  v_arquivado        BOOLEAN;
BEGIN
  IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_extra_op_id THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: o operador do vínculo deve ser o usuário autenticado'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.empresa_id, p.nome, p.ativo, p.situacao, p.arquivado, e.slug
    INTO v_empresa_id, v_nome_real, v_perfil_ativo, v_situacao, v_arquivado,
         v_empresa_slug
    FROM public.perfis p
    JOIN public.empresas e ON e.id = p.empresa_id
   WHERE p.id = v_uid;

  IF NOT FOUND OR NOT COALESCE(v_perfil_ativo, FALSE)
     OR COALESCE(v_arquivado, FALSE) OR v_situacao = 'desligado' THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: perfil inativo ou inexistente'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.operador_id, a.tipo_vinculo, a.vinculo_operador_id,
         TRIM(COALESCE(a.nr_cliente, '')), TRIM(COALESCE(a.instituicao, ''))
    INTO v_direto_operador, v_direto_tipo, v_direto_vinculo,
         v_direto_nr, v_direto_inst
    FROM public.acordos a
   WHERE a.id = p_direto_id
     AND a.empresa_id = v_empresa_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACORDO_NAO_ENCONTRADO: acordo fora da empresa do usuário'
      USING ERRCODE = '42501';
  END IF;

  IF v_direto_operador = v_uid
     OR COALESCE(v_direto_tipo, 'direto') <> 'direto'
     OR v_direto_vinculo IS NOT NULL THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO: o acordo não é um DIRETO livre';
  END IF;

  IF (v_empresa_slug <> 'pagueplay' AND (
       v_direto_nr = ''
       OR v_direto_nr IS DISTINCT FROM TRIM(COALESCE(p_nr_cliente, ''))
     ))
     OR (v_empresa_slug = 'pagueplay' AND (
       v_direto_inst = ''
       OR v_direto_inst IS DISTINCT FROM TRIM(COALESCE(p_instituicao, ''))
     )) THEN
    RAISE EXCEPTION 'CHAVE_DIVERGENTE: NR/código não pertence ao acordo informado'
      USING ERRCODE = '42501';
  END IF;

  -- Só quem vincula precisa da lógica ligada (20261111170000). Antes também
  -- se exigia o dono SEM a lógica, e o Extra marcado à mão virava pedido de
  -- transferência quando os dois tinham.
  IF NOT public.fn_direto_extra_ativo(v_uid, v_empresa_id) THEN
    RAISE EXCEPTION 'REGRA_DIRETO_EXTRA_INVALIDA: configuração dos operadores não permite este vínculo'
      USING ERRCODE = '42501';
  END IF;

  -- The EXTRA is inserted first by the UI.  Requiring that reciprocal row
  -- prevents a caller from using this RPC as an arbitrary agreement updater.
  IF NOT EXISTS (
    SELECT 1
      FROM public.acordos e
     WHERE e.empresa_id = v_empresa_id
       AND e.operador_id = v_uid
       AND e.tipo_vinculo = 'extra'
       AND e.vinculo_operador_id = v_direto_operador
       AND (
         (v_empresa_slug <> 'pagueplay'
          AND TRIM(COALESCE(e.nr_cliente, '')) = v_direto_nr)
         OR (v_empresa_slug = 'pagueplay'
             AND TRIM(COALESCE(e.instituicao, '')) = v_direto_inst)
       )
  ) THEN
    RAISE EXCEPTION 'VINCULO_INVALIDO: acordo EXTRA correspondente não encontrado'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.acordos SET
    vinculo_operador_id   = v_uid,
    vinculo_operador_nome = v_nome_real,
    valor                 = p_valor,
    vencimento            = p_vencimento,
    nome_cliente          = p_nome_cliente,
    tipo                  = p_tipo,
    whatsapp              = p_whatsapp,
    parcelas              = p_parcelas
  WHERE id = p_direto_id;

  -- Kept only for wire compatibility; names are always sourced from perfis.
  PERFORM p_extra_op_nome;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
