-- ============================================================================
-- Tornar vinculo DIRETO (e voltar a EXTRA) — no servidor, com pedido ao lider
-- ============================================================================
--
-- ## O pedido (30/09/2026)
--
-- Um acordo EXTRA pode virar DIRETO de dois jeitos, e so um deles pede lider:
--
--   • EXTRA MANUAL — marcado como Extra so para acompanhamento, sem ninguem
--     segurando o NR/Codigo. Nao ha de quem tirar nada: o dono confirma e o
--     acordo vira DIRETO na hora.
--
--   • EXTRA VINCULADO — o NR/Codigo e o DIRETO de outra pessoa (o par que a
--     escada de § 7.3 cria). Virar DIRETO e tirar o acordo dela: passa pela
--     gaveta de autorizacoes, com chave PROPRIA no painel
--     (`acordos_autorizar_tornar_direto`). Aprovado, o DIRETO antigo vai para a
--     lixeira (motivo `troca_extra`, com quem autorizou), o EXTRA vira DIRETO,
--     e os dois lados sao notificados — o mesmo desenho da transferencia.
--
-- E o caminho de volta: um DIRETO sem EXTRA vinculado pode ser marcado EXTRA
-- (acompanhamento). Com EXTRA vinculado nao: inverter o par e a operacao acima,
-- feita a partir do EXTRA.
--
-- ## Por que no servidor
--
-- O botao «Acordo direto» do detalhe fazia tudo no navegador: lia o DIRETO do
-- colega, mandava para a lixeira e dava `DELETE`. Com a RLS de quem clica, o
-- DELETE de acordo alheio afeta zero linhas SEM erro (o mesmo defeito que a
-- 20260928111922 documentou no Divergente) e o `update` para DIRETO batia em
-- `NR_JA_REGISTRADO`, porque o titular continuava la. Alem disso ele usava
-- `.maybeSingle()` sobre o NR — com parcelas, varias linhas DIRETO dividem a
-- mesma chave e a busca falhava com «mais de uma linha».
--
-- ## A gaveta nao ganha um segundo caminho
--
-- Os pedidos continuam em `autorizacoes_pedidos` (modo novo `tornar_direto`),
-- e a gaveta continua chamando `fn_autorizacao_decidir`. Ela vira um
-- despachante: `tornar_direto` vai para `fn_tornar_direto_decidir`; o resto,
-- para a funcao de sempre — RENOMEADA, e nao reescrita. Reescrever exigiria
-- copiar o corpo que esta em producao, e o historico de migrations deste banco
-- nao garante que o arquivo e o que roda (CLAUDE.md, § Migrations). Renomear
-- preserva o corpo que existe, seja qual for. Aba antiga (bundle anterior) que
-- aprovar um pedido novo cai no despachante e funciona.
--
-- ## Parcelas
--
-- Vira DIRETO a linha escolhida e as parcelas AINDA NAO PAGAS do mesmo grupo.
-- Parcela ja paga fica como estava: ja contou no mes dela (recebimento
-- indireto), a mesma regra da transferencia — «parcelas antigas do mesmo grupo
-- ficam com quem estavam». Do lado de quem perde, sai o TITULAR do NR (a linha
-- que `nr_registros` aponta), como em `fn_transferir_acordo_nr`.
--
-- ## O que NAO muda
--
-- • `fn_autorizacao_solicitar` e os dois modos antigos: intactos.
-- • A escada de conflito da tabulacao (§ 7.3).
-- • Quem VE o pedido: a policy de `autorizacoes_pedidos` (cargo + setores do
--   solicitante). Quem DECIDE um `tornar_direto` precisa, alem disso, da chave.
--
-- Escrita de dados na aplicacao: so a semeadura da chave nova em
-- `cargos_permissoes` (acrescenta chave ausente, ligada para lideranca).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 0. Catalogo de permissoes
-- ============================================================================
--
-- O topo da cadeia e 20260921160000 (Chips Fisicos); nenhuma migration depois
-- dela redefiniu `fn_permissoes_catalogo`. O congelamento abaixo repete o corpo
-- atual da funcao — e isso que o torna retrato.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_tornar_direto_20260930()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_chips_fisicos_20260921()
  UNION ALL
  SELECT * FROM (VALUES
    ('ver_chips_fisicos',             ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('chips_fisicos_gerenciar_setor', ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false),
    ('chips_fisicos_todos_setores',   ARRAY['bookplay']::TEXT[], ARRAY[]::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_tornar_direto_20260930() IS
  'Retrato do catalogo antes da chave acordos_autorizar_tornar_direto (30/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_tornar_direto_20260930()
  UNION ALL
  SELECT * FROM (VALUES
    -- Nasce com quem ja autoriza tabulacao: a lideranca.
    ('acordos_autorizar_tornar_direto', NULL::TEXT[], ARRAY['lider','elite','gerencia','diretoria']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260930150000 adiciona '
  'acordos_autorizar_tornar_direto (decidir pedido de EXTRA virar DIRETO).';

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ============================================================================
-- 1. O modo novo na tabela de pedidos
-- ============================================================================

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.autorizacoes_pedidos'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%modo%'
  LOOP
    EXECUTE format('ALTER TABLE public.autorizacoes_pedidos DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.autorizacoes_pedidos
  ADD CONSTRAINT autorizacoes_pedidos_modo_check
  CHECK (modo IN ('transferencia_completa', 'troca_extra', 'tornar_direto'));

COMMENT ON COLUMN public.autorizacoes_pedidos.modo IS
  'transferencia_completa = assumir o DIRETO de outro; troca_extra = assumir o EXTRA de outro; '
  'tornar_direto = o proprio EXTRA vira DIRETO e o DIRETO do colega sai (20260930150000). '
  'Em tornar_direto: acordo_editado_id = o EXTRA, acordo_alvo_id = o DIRETO que sai.';

-- ============================================================================
-- 2. Achar o DIRETO que segura o NR/Codigo de um EXTRA
-- ============================================================================
--
-- Interna. O titular em `nr_registros` primeiro (e ele que trava a chave); na
-- falta, o DIRETO ativo mais recente de outra pessoa com a mesma chave. Sem
-- nenhum dos dois, o EXTRA e manual: nao ha de quem tirar nada.

CREATE OR REPLACE FUNCTION public.fn_tornar_direto_alvo(p_extra_id UUID)
RETURNS TABLE (direto_id UUID, dono_id UUID, dono_nome TEXT, campo TEXT, valor TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_extra public.acordos%ROWTYPE;
  v_campo TEXT;
  v_valor TEXT;
BEGIN
  SELECT * INTO v_extra FROM public.acordos WHERE id = p_extra_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_campo := public.fn_nr_campo_chave(v_extra.nr_cliente, v_extra.instituicao);
  v_valor := CASE v_campo
               WHEN 'nr_cliente'  THEN btrim(v_extra.nr_cliente)
               WHEN 'instituicao' THEN btrim(v_extra.instituicao)
             END;

  IF v_campo IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT a.id, a.operador_id, COALESCE(p.nome, 'outro operador'), %2$L::TEXT, $3
      FROM public.acordos a
      LEFT JOIN public.perfis p ON p.id = a.operador_id
      LEFT JOIN public.nr_registros r
             ON r.empresa_id = a.empresa_id
            AND r.campo      = %2$L
            AND r.nr_value   = $3
            AND r.acordo_id  = a.id
     WHERE a.empresa_id  = $1
       AND a.%1$I        = $3
       AND a.operador_id IS DISTINCT FROM $2
       AND COALESCE(a.tipo_vinculo, 'direto') = 'direto'
       AND (r.acordo_id IS NOT NULL OR a.status <> 'nao_pago')
     ORDER BY (r.acordo_id IS NOT NULL) DESC, a.criado_em DESC
     LIMIT 1
  $q$, v_campo, v_campo)
  USING v_extra.empresa_id, v_extra.operador_id, v_valor;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, NULL::TEXT, v_campo, v_valor;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_tornar_direto_alvo(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. A execucao — interna, uma transacao
-- ============================================================================
--
-- Chamada por `fn_tornar_direto` (manual ou quem ja e autorizador) e por
-- `fn_tornar_direto_decidir` (aprovacao na gaveta). Nao confere permissao:
-- quem chama ja conferiu.

CREATE OR REPLACE FUNCTION public.fn_tornar_direto_executar(
  p_extra_id         UUID,
  p_autorizador_id   UUID,
  p_autorizador_nome TEXT,
  p_origem           TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  SELECT * INTO v_extra FROM public.acordos WHERE id = p_extra_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF COALESCE(v_extra.tipo_vinculo, 'direto') <> 'extra' THEN
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

  RETURN jsonb_build_object(
    'ok',               true,
    'acordo_id',        v_extra.id,
    'vinculado',        v_removido IS NOT NULL,
    'direto_removido',  v_removido,
    'dono_anterior',    v_alvo.dono_nome,
    'parcelas_do_grupo', v_linhas);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_tornar_direto_executar(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Quem pode decidir um tornar_direto
-- ============================================================================
--
-- As duas coisas: ver o pedido (cargo + setores, `fn_pode_autorizar_pedido`) E
-- a chave do painel. Sem a segunda, desligar a chave para um cargo nao mudaria
-- nada — e «eu libero na tela e nao acontece nada» e o defeito que o painel
-- existe para nao ter.

CREATE OR REPLACE FUNCTION public.fn_pode_tornar_direto(p_empresa_id UUID, p_setores UUID[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.fn_user_is_super_admin()
      OR (public.fn_pode_autorizar_pedido(p_empresa_id, p_setores)
          AND public.fn_user_tem('acordos_autorizar_tornar_direto'));
$function$;

REVOKE ALL ON FUNCTION public.fn_pode_tornar_direto(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_tornar_direto(UUID, UUID[]) TO authenticated;

-- ============================================================================
-- 5. Previa — o que vai acontecer se a pessoa confirmar (so leitura)
-- ============================================================================
--
-- A tela precisa saber, ANTES de confirmar, se o EXTRA e manual (confirma e
-- pronto) ou vinculado (vai pedir lider, ou executar, se quem olha ja autoriza).
-- A RLS de quem olha nao deixa ver o DIRETO do colega; por isso a pergunta e
-- respondida aqui.

CREATE OR REPLACE FUNCTION public.fn_tornar_direto_previa(p_acordo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     UUID := auth.uid();
  v_extra   public.acordos%ROWTYPE;
  v_alvo    RECORD;
  v_setores UUID[];
  v_pendente UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_extra FROM public.acordos WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF NOT public.fn_can_access_empresa(v_extra.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;
  IF COALESCE(v_extra.tipo_vinculo, 'direto') <> 'extra' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_e_extra');
  END IF;

  v_setores := array(SELECT public.fn_setores_do_operador(v_extra.operador_id));
  SELECT * INTO v_alvo FROM public.fn_tornar_direto_alvo(p_acordo_id);

  SELECT id INTO v_pendente
    FROM public.autorizacoes_pedidos
   WHERE modo = 'tornar_direto' AND acordo_editado_id = p_acordo_id
     AND status = 'pendente' AND expira_em > now()
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok',              true,
    'vinculado',       v_alvo.direto_id IS NOT NULL,
    'dono_id',         v_alvo.dono_id,
    'dono_nome',       v_alvo.dono_nome,
    'nr_label',        CASE WHEN v_alvo.campo = 'instituicao' THEN 'Código' ELSE 'NR' END,
    'nr_valor',        v_alvo.valor,
    'sou_dono',        v_extra.operador_id = v_uid,
    'sou_autorizador', public.fn_pode_tornar_direto(v_extra.empresa_id, v_setores),
    'pedido_pendente', v_pendente);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_tornar_direto_previa(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tornar_direto_previa(UUID) TO authenticated;

-- ============================================================================
-- 6. Tornar DIRETO — executa ou abre o pedido
-- ============================================================================
--
--   manual                          → executa (dono ou autorizador)
--   vinculado + quem clica autoriza → executa, com o nome dele como autorizador
--   vinculado + dono sem a chave    → pedido na gaveta; lideres notificados
--
-- Nao e o dono nem autorizador → recusa.

CREATE OR REPLACE FUNCTION public.fn_tornar_direto(p_acordo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid     UUID := auth.uid();
  v_nome    TEXT;
  v_extra   public.acordos%ROWTYPE;
  v_alvo    RECORD;
  v_setores UUID[];
  v_autoriz BOOLEAN;
  v_dono    BOOLEAN;
  v_id      UUID;
  v_qtd     INTEGER := 0;
  v_res     JSONB;
  v_label   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_extra FROM public.acordos WHERE id = p_acordo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF NOT public.fn_can_access_empresa(v_extra.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;
  IF COALESCE(v_extra.tipo_vinculo, 'direto') <> 'extra' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_e_extra');
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_uid;
  v_setores := array(SELECT public.fn_setores_do_operador(v_extra.operador_id));
  v_dono    := v_extra.operador_id = v_uid;
  v_autoriz := public.fn_pode_tornar_direto(v_extra.empresa_id, v_setores);

  IF NOT v_dono AND NOT v_autoriz THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  SELECT * INTO v_alvo FROM public.fn_tornar_direto_alvo(p_acordo_id);

  -- Manual, ou quem clica ja pode decidir: executa agora.
  IF v_alvo.direto_id IS NULL OR v_autoriz THEN
    v_res := public.fn_tornar_direto_executar(
      p_acordo_id,
      CASE WHEN v_alvo.direto_id IS NULL THEN NULL ELSE v_uid END,
      CASE WHEN v_alvo.direto_id IS NULL THEN NULL ELSE COALESCE(v_nome, 'Autorizador') END,
      CASE WHEN v_alvo.direto_id IS NULL THEN 'manual' ELSE 'autorizador' END);

    -- Quem autorizou pelo acordo de outra pessoa avisa o dono do EXTRA.
    IF COALESCE((v_res->>'ok')::BOOLEAN, false) AND NOT v_dono THEN
      INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, acordo_id, autor_id, autor_nome)
      VALUES (
        v_extra.operador_id, 'Seu acordo EXTRA virou DIRETO',
        format('%s passou o seu acordo %s para DIRETO.', COALESCE(v_nome, 'A liderança'),
               COALESCE(v_alvo.valor, '')),
        v_extra.empresa_id, v_extra.id, v_uid, COALESCE(v_nome, 'Autorizador'));
    END IF;

    RETURN v_res || jsonb_build_object('resultado', 'convertido');
  END IF;

  -- Vinculado, e o dono nao pode decidir sozinho: pedido na gaveta.
  v_label := CASE WHEN v_alvo.campo = 'instituicao' THEN 'Código' ELSE 'NR' END;

  SELECT id INTO v_id
    FROM public.autorizacoes_pedidos
   WHERE modo = 'tornar_direto' AND acordo_editado_id = p_acordo_id
     AND status = 'pendente' AND expira_em > now()
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'resultado', 'pedido', 'id', v_id, 'repetido', true);
  END IF;

  INSERT INTO public.autorizacoes_pedidos (
    empresa_id, solicitante_id, solicitante_nome, setor_id, setores_escopo, modo,
    nr_label, nr_valor, acordo_alvo_id, dono_id, dono_nome,
    payload, acordo_editado_id, resumo
  ) VALUES (
    v_extra.empresa_id, v_uid, COALESCE(v_nome, 'Operador'),
    (SELECT setor_id FROM public.perfis WHERE id = v_uid), v_setores, 'tornar_direto',
    v_label, v_alvo.valor, v_alvo.direto_id, v_alvo.dono_id, v_alvo.dono_nome,
    '{}'::JSONB, p_acordo_id,
    jsonb_build_object(
      'cliente',    v_extra.nome_cliente,
      'valor',      v_extra.valor,
      'vencimento', v_extra.vencimento,
      'parcelas',   v_extra.parcelas,
      'tipo',       v_extra.tipo)
  )
  RETURNING id INTO v_id;

  -- Mesmo recorte de quem ve o pedido (a policy), menos quem nao tem a chave.
  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
  SELECT p.id,
         'Autorização solicitada',
         format('%s pediu para tornar DIRETO o %s %s, hoje DIRETO de %s.',
                COALESCE(v_nome, 'Um operador'), v_label, v_alvo.valor, v_alvo.dono_nome),
         v_extra.empresa_id, v_uid, COALESCE(v_nome, 'Operador')
    FROM public.perfis p
   WHERE p.empresa_id = v_extra.empresa_id
     AND p.ativo = true
     AND COALESCE(p.situacao, 'ativo') = 'ativo'
     AND p.id <> v_uid
     AND (
       p.perfil IN ('diretoria', 'administrador', 'super_admin')
       OR (p.perfil IN ('lider', 'elite', 'gerencia')
           AND p.setor_id IS NOT NULL
           AND p.setor_id = ANY(v_setores))
     );
  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'resultado', 'pedido', 'id', v_id,
                            'repetido', false, 'notificados', v_qtd);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_tornar_direto(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tornar_direto(UUID) TO authenticated;

-- ============================================================================
-- 7. Decidir um tornar_direto (a gaveta chega aqui pelo despachante)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_tornar_direto_decidir(
  p_id      UUID,
  p_aprovar BOOLEAN,
  p_motivo  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid  UUID := auth.uid();
  v_nome TEXT;
  v_ped  public.autorizacoes_pedidos%ROWTYPE;
  v_res  JSONB;
  v_erro TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_ped FROM public.autorizacoes_pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'pedido_inexistente');
  END IF;
  IF v_ped.modo <> 'tornar_direto' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'modo_invalido');
  END IF;
  IF NOT public.fn_pode_tornar_direto(v_ped.empresa_id, v_ped.setores_escopo) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;
  IF v_ped.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_decidido',
                              'status', v_ped.status, 'por', v_ped.decidido_por_nome);
  END IF;
  IF v_ped.expira_em <= now() THEN
    UPDATE public.autorizacoes_pedidos
       SET status = 'cancelado', decidido_em = now(),
           motivo_recusa = 'Pedido expirou sem decisão.'
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'erro', 'expirado');
  END IF;

  SELECT nome INTO v_nome FROM public.perfis WHERE id = v_uid;

  -- ── Recusa ────────────────────────────────────────────────────────────────
  IF NOT COALESCE(p_aprovar, false) THEN
    UPDATE public.autorizacoes_pedidos
       SET status = 'recusado', decidido_por_id = v_uid,
           decidido_por_nome = COALESCE(v_nome, 'Autorizador'),
           decidido_em = now(), motivo_recusa = NULLIF(btrim(p_motivo), '')
     WHERE id = p_id;

    INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, autor_id, autor_nome)
    VALUES (
      v_ped.solicitante_id, 'Autorização recusada',
      format('Seu pedido para tornar DIRETO o %s %s foi recusado por %s.%s',
             v_ped.nr_label, v_ped.nr_valor, COALESCE(v_nome, 'um autorizador'),
             CASE WHEN NULLIF(btrim(p_motivo), '') IS NOT NULL
                  THEN ' Motivo: ' || btrim(p_motivo) ELSE '' END),
      v_ped.empresa_id, v_uid, COALESCE(v_nome, 'Autorizador'));

    INSERT INTO public.logs_sistema
      (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
       empresa_id, alvo_tipo, alvo_rotulo, detalhes)
    VALUES (
      v_uid, 'autorizacao_recusada', 'acordo', 'aviso',
      format('Recusou o pedido de %s para tornar DIRETO o %s %s.',
             v_ped.solicitante_nome, v_ped.nr_label, v_ped.nr_valor),
      'ui', 'autorizacoes_pedidos', p_id, v_ped.empresa_id,
      'acordo', format('%s %s', v_ped.nr_label, v_ped.nr_valor),
      jsonb_build_object('modo', v_ped.modo, 'solicitante_id', v_ped.solicitante_id,
                         'solicitante_nome', v_ped.solicitante_nome,
                         'motivo', NULLIF(btrim(p_motivo), '')));

    RETURN jsonb_build_object('ok', true, 'status', 'recusado');
  END IF;

  -- ── Aprovacao ─────────────────────────────────────────────────────────────
  -- Bloco com EXCEPTION: se o gatilho do NR recusar (alguem tomou a chave no
  -- meio), a execucao desfaz sozinha e o pedido fica registrado como falho, em
  -- vez de a gaveta receber um erro cru e o pedido continuar pendente.
  BEGIN
    v_res := public.fn_tornar_direto_executar(
      v_ped.acordo_editado_id, v_uid, COALESCE(v_nome, 'Autorizador'), 'autorizacao');
  EXCEPTION WHEN OTHERS THEN
    v_res := jsonb_build_object('ok', false, 'erro', 'falha_tornar_direto', 'detalhe', SQLERRM);
  END;

  IF COALESCE((v_res->>'ok')::BOOLEAN, false) IS NOT TRUE THEN
    v_erro := COALESCE(v_res->>'erro', 'falha_tornar_direto');
    UPDATE public.autorizacoes_pedidos
       SET status = 'falhou', decidido_por_id = v_uid,
           decidido_por_nome = COALESCE(v_nome, 'Autorizador'),
           decidido_em = now(),
           erro = v_erro || COALESCE(': ' || (v_res->>'detalhe'), '')
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'erro', v_erro);
  END IF;

  UPDATE public.autorizacoes_pedidos
     SET status = 'aprovado', decidido_por_id = v_uid,
         decidido_por_nome = COALESCE(v_nome, 'Autorizador'),
         decidido_em = now(), acordo_criado_id = v_ped.acordo_editado_id
   WHERE id = p_id;

  INSERT INTO public.notificacoes (usuario_id, titulo, mensagem, empresa_id, acordo_id, autor_id, autor_nome)
  VALUES (
    v_ped.solicitante_id, 'Autorização aprovada',
    format('%s autorizou: o %s %s agora é DIRETO seu.',
           COALESCE(v_nome, 'Um autorizador'), v_ped.nr_label, v_ped.nr_valor),
    v_ped.empresa_id, v_ped.acordo_editado_id, v_uid, COALESCE(v_nome, 'Autorizador'));

  INSERT INTO public.logs_sistema
    (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
     empresa_id, alvo_tipo, alvo_rotulo, detalhes)
  VALUES (
    v_uid, 'autorizacao_aprovada', 'acordo', 'aviso',
    format('Autorizou %s a tornar DIRETO o %s %s (antes DIRETO de %s).',
           v_ped.solicitante_nome, v_ped.nr_label, v_ped.nr_valor, COALESCE(v_ped.dono_nome, '—')),
    'ui', 'autorizacoes_pedidos', p_id, v_ped.empresa_id,
    'acordo', format('%s %s', v_ped.nr_label, v_ped.nr_valor),
    jsonb_build_object('modo', v_ped.modo, 'solicitante_id', v_ped.solicitante_id,
                       'solicitante_nome', v_ped.solicitante_nome,
                       'dono_anterior', v_ped.dono_nome,
                       'acordo', v_ped.acordo_editado_id));

  RETURN jsonb_build_object('ok', true, 'status', 'aprovado', 'acordo_id', v_ped.acordo_editado_id);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_tornar_direto_decidir(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 8. A gaveta continua chamando fn_autorizacao_decidir — agora despachante
-- ============================================================================
--
-- A funcao de sempre e RENOMEADA (uma vez so; rodar de novo nao renomeia a
-- renomeada) e perde o acesso direto: a porta publica e o despachante.

DO $$
BEGIN
  IF to_regprocedure('public.fn_autorizacao_decidir_nr(uuid, boolean, text)') IS NULL THEN
    ALTER FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT)
      RENAME TO fn_autorizacao_decidir_nr;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.fn_autorizacao_decidir_nr(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_autorizacao_decidir_nr(UUID, BOOLEAN, TEXT) IS
  'Decisao dos pedidos transferencia_completa / troca_extra — o corpo que era '
  'fn_autorizacao_decidir ate 20260930150000. So o despachante chama.';

CREATE OR REPLACE FUNCTION public.fn_autorizacao_decidir(
  p_id      UUID,
  p_aprovar BOOLEAN,
  p_motivo  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_modo TEXT;
BEGIN
  SELECT modo INTO v_modo FROM public.autorizacoes_pedidos WHERE id = p_id;
  IF v_modo = 'tornar_direto' THEN
    RETURN public.fn_tornar_direto_decidir(p_id, p_aprovar, p_motivo);
  END IF;
  RETURN public.fn_autorizacao_decidir_nr(p_id, p_aprovar, p_motivo);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_autorizacao_decidir(UUID, BOOLEAN, TEXT) IS
  'Porta da gaveta de autorizacoes. tornar_direto -> fn_tornar_direto_decidir; '
  'o resto -> fn_autorizacao_decidir_nr (20260930150000).';

-- ============================================================================
-- 9. O caminho de volta: DIRETO sem par vira EXTRA (acompanhamento)
-- ============================================================================
--
-- So quando ninguem tem EXTRA desta chave: inverter um par e o tornar_direto,
-- feito a partir do EXTRA. Mesma regra de parcelas: a linha escolhida e as nao
-- pagas do grupo. O gatilho solta o NR (EXTRA nao e titular).

CREATE OR REPLACE FUNCTION public.fn_tornar_extra(p_acordo_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    UUID := auth.uid();
  v_ac     public.acordos%ROWTYPE;
  v_campo  TEXT;
  v_valor  TEXT;
  v_par    TEXT;
  v_linhas INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_ac FROM public.acordos WHERE id = p_acordo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acordo_inexistente');
  END IF;
  IF NOT public.fn_can_access_empresa(v_ac.empresa_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'empresa_negada');
  END IF;
  IF COALESCE(v_ac.tipo_vinculo, 'direto') = 'extra' THEN
    RETURN jsonb_build_object('ok', true, 'resultado', 'ja_era_extra', 'acordo_id', v_ac.id);
  END IF;
  IF v_ac.operador_id <> v_uid
     AND NOT public.fn_pode_tornar_direto(
       v_ac.empresa_id, array(SELECT public.fn_setores_do_operador(v_ac.operador_id))) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_autorizado');
  END IF;

  v_campo := public.fn_nr_campo_chave(v_ac.nr_cliente, v_ac.instituicao);
  v_valor := CASE v_campo
               WHEN 'nr_cliente'  THEN btrim(v_ac.nr_cliente)
               WHEN 'instituicao' THEN btrim(v_ac.instituicao)
             END;

  -- Alguem tem EXTRA desta chave? Entao este DIRETO e metade de um par.
  IF v_campo IS NOT NULL THEN
    EXECUTE format(
      'SELECT COALESCE(p.nome, ''outro operador'')
         FROM public.acordos a LEFT JOIN public.perfis p ON p.id = a.operador_id
        WHERE a.empresa_id = $1 AND a.%I = $2
          AND a.operador_id IS DISTINCT FROM $3
          AND a.tipo_vinculo = ''extra''
        LIMIT 1', v_campo)
    INTO v_par
    USING v_ac.empresa_id, v_valor, v_ac.operador_id;
    IF v_par IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'direto_com_extra', 'extra_nome', v_par);
    END IF;
  END IF;

  IF v_ac.acordo_grupo_id IS NOT NULL THEN
    UPDATE public.acordos
       SET tipo_vinculo = 'extra', vinculo_operador_id = NULL, vinculo_operador_nome = NULL
     WHERE acordo_grupo_id = v_ac.acordo_grupo_id
       AND operador_id     = v_ac.operador_id
       AND id             <> v_ac.id
       AND COALESCE(tipo_vinculo, 'direto') = 'direto'
       AND status         <> 'pago';
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;

  UPDATE public.acordos
     SET tipo_vinculo = 'extra', vinculo_operador_id = NULL, vinculo_operador_nome = NULL
   WHERE id = v_ac.id;

  INSERT INTO public.logs_sistema
    (usuario_id, acao, categoria, severidade, descricao, origem, tabela, registro_id,
     empresa_id, alvo_tipo, alvo_rotulo, detalhes)
  VALUES (
    v_uid, 'acordo_tornado_extra', 'acordo', 'info',
    format('O %s %s passou de DIRETO para EXTRA (acompanhamento, sem vínculo).',
           CASE WHEN v_campo = 'instituicao' THEN 'Código' ELSE 'NR' END, COALESCE(v_valor, '—')),
    'ui', 'acordos', v_ac.id, v_ac.empresa_id,
    'acordo', format('%s %s', CASE WHEN v_campo = 'instituicao' THEN 'Código' ELSE 'NR' END,
                     COALESCE(v_valor, '—')),
    jsonb_build_object('operador_id', v_ac.operador_id, 'parcelas_do_grupo', v_linhas));

  RETURN jsonb_build_object('ok', true, 'resultado', 'convertido',
                            'acordo_id', v_ac.id, 'parcelas_do_grupo', v_linhas);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_tornar_extra(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_tornar_extra(UUID) TO authenticated;

-- ============================================================================
-- 10. Prova
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo()
                  WHERE chave = 'acordos_autorizar_tornar_direto') THEN
    RAISE EXCEPTION 'acordos_autorizar_tornar_direto ausente no catalogo';
  END IF;
  -- A cadeia nao se partiu.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'ver_chips_fisicos') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: ver_chips_fisicos sumiu.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'acordos_autorizar_tabulacao') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: acordos_autorizar_tabulacao sumiu.';
  END IF;

  IF to_regprocedure('public.fn_autorizacao_decidir_nr(uuid, boolean, text)') IS NULL THEN
    RAISE EXCEPTION 'fn_autorizacao_decidir_nr nao existe — o despachante nao tem para onde mandar';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_autorizacao_decidir_nr(uuid, boolean, text)', 'execute') THEN
    RAISE EXCEPTION 'fn_autorizacao_decidir_nr continua aberta para authenticated';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_autorizacao_decidir(uuid, boolean, text)', 'execute') THEN
    RAISE EXCEPTION 'o despachante nao esta aberto para authenticated';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_tornar_direto_executar(uuid, uuid, text, text)', 'execute') THEN
    RAISE EXCEPTION 'fn_tornar_direto_executar esta aberta para authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.fn_tornar_direto(uuid)', 'execute') THEN
    RAISE EXCEPTION 'fn_tornar_direto esta aberta para anon';
  END IF;
END $$;

COMMIT;
