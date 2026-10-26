-- ============================================================================
-- Crachá pendente: liga/desliga e painel de quem respondeu (26/10/2026)
-- ============================================================================
--
-- O cartão de 20261026160000 pede o crachá a quem ainda não tem. Agora:
--
--   cracha_pedido_config      uma linha: o cartão está ligado ou não, quem
--                             mudou e quando. Nasce LIGADO — é o que já estava
--                             no ar; desligar é escolha do super_admin.
--   cracha_pedido_respostas   uma linha por pessoa que preencheu PELO CARTÃO,
--                             com o retrato de nome, cargo, empresa e setor da
--                             hora. Quem já tinha crachá pelo RH não entra aqui.
--
--   fn_meu_cracha_estado()          agora devolve também { ligado }
--   fn_meu_cracha_salvar(p_cracha)  igual à de 160000, e registra a resposta
--   fn_cracha_pedido_ligar(bool)    só o super_admin
--   fn_cracha_pedido_painel()       Configurações → Geral: super_admin ou quem
--                                   tem `config_sub_geral`. Não devolve o
--                                   número do crachá — esse fica com o RH.
--
-- Ninguém lê nem escreve nas tabelas direto: só pelas funções.
-- Nenhuma linha de dado existente muda: só as duas tabelas novas recebem
-- linhas (a config, e quem já tinha respondido pelo cartão). Reexecutável.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';

-- ── Liga e desliga ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cracha_pedido_config (
  id               SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ligado           BOOLEAN     NOT NULL DEFAULT TRUE,
  mudado_em        TIMESTAMPTZ,
  mudado_por       UUID,
  mudado_por_nome  TEXT
);

COMMENT ON TABLE public.cracha_pedido_config IS
  'Cartão do crachá pendente: uma linha. Nasce ligado. Escrita só por '
  'fn_cracha_pedido_ligar. Ver 20261026180000.';

INSERT INTO public.cracha_pedido_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cracha_pedido_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cracha_pedido_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cracha_pedido_config TO service_role;

-- ── Quem respondeu pelo cartão ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cracha_pedido_respostas (
  usuario_id     UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  -- O retrato de quem respondeu, como era na hora.
  nome           TEXT,
  cargo          TEXT,
  empresa_id     UUID,
  empresa_nome   TEXT,
  setor_id       UUID,
  setor_nome     TEXT,
  respondida_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cracha_pedido_respostas IS
  'Quem informou o próprio crachá pelo cartão. Escrita só por '
  'fn_meu_cracha_salvar. Ver 20261026180000.';

ALTER TABLE public.cracha_pedido_respostas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cracha_pedido_respostas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cracha_pedido_respostas TO service_role;

-- Quem já respondeu pelo cartão antes desta migration: a linha do RH gravada
-- pela própria pessoa (`atualizado_por = operador_id`) — só o cartão grava
-- assim. O retrato é o de agora, e a hora é a da gravação.
INSERT INTO public.cracha_pedido_respostas
       (usuario_id, nome, cargo, empresa_id, empresa_nome, setor_id, setor_nome, respondida_em)
SELECT p.id, p.nome, COALESCE(cg.nome, p.perfil::text), p.empresa_id, e.nome, p.setor_id, s.nome,
       COALESCE(d.atualizado_em, now())
  FROM public.rh_dados_operadores d
  JOIN public.perfis p ON p.id = d.operador_id AND p.empresa_id = d.empresa_id
  LEFT JOIN public.cargos   cg ON cg.slug = p.perfil::text
  LEFT JOIN public.empresas e  ON e.id = p.empresa_id
  LEFT JOIN public.setores  s  ON s.id = p.setor_id
 WHERE d.atualizado_por = d.operador_id
   AND d.cracha IS NOT NULL AND btrim(d.cracha) <> ''
ON CONFLICT (usuario_id) DO NOTHING;

-- ── O que a tela de todo mundo chama ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_meu_cracha_estado()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'ligado', COALESCE((SELECT c.ligado FROM public.cracha_pedido_config c WHERE c.id = 1), TRUE),
    'tem_cracha', EXISTS (
      SELECT 1
        FROM public.perfis p
        JOIN public.rh_dados_operadores d
          ON d.operador_id = p.id AND d.empresa_id = p.empresa_id
       WHERE p.id = auth.uid()
         AND d.cracha IS NOT NULL
         AND btrim(d.cracha) <> ''
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_meu_cracha_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_meu_cracha_estado() TO authenticated;

COMMENT ON FUNCTION public.fn_meu_cracha_estado() IS
  'Se o cartão está ligado e se quem está logado já tem crachá em '
  'rh_dados_operadores. Não devolve o número. Ver 20261026160000 e 180000.';

-- Igual à de 20261026160000; a única novidade é registrar a resposta no fim.
CREATE OR REPLACE FUNCTION public.fn_meu_cracha_salvar(p_cracha TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_eu     UUID := auth.uid();
  v_cracha TEXT := btrim(COALESCE(p_cracha, ''));
  v_emp    UUID;
  v_nome   TEXT;
  v_atual  TEXT;
  v_qtd    INTEGER;
  v_fech   UUID;
BEGIN
  IF v_eu IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada: entre de novo.' USING ERRCODE = '42501';
  END IF;

  IF v_cracha !~ '^[0-9]{1,8}$' THEN
    RAISE EXCEPTION 'O crachá tem até 8 números.' USING ERRCODE = '22023';
  END IF;

  SELECT p.empresa_id, COALESCE(NULLIF(btrim(p.nome), ''), 'Alguém')
    INTO v_emp, v_nome
    FROM public.perfis p
   WHERE p.id = v_eu AND p.ativo;

  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT d.cracha INTO v_atual
    FROM public.rh_dados_operadores d
   WHERE d.empresa_id = v_emp AND d.operador_id = v_eu
   FOR UPDATE;

  IF v_atual IS NOT NULL AND btrim(v_atual) <> '' THEN
    IF v_atual = v_cracha THEN
      RETURN v_cracha;
    END IF;
    RAISE EXCEPTION 'Você já tem um crachá cadastrado. Para trocar, fale com o RH.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rh_dados_operadores d
     WHERE d.empresa_id = v_emp
       AND d.cracha = v_cracha
       AND d.operador_id <> v_eu
  ) THEN
    RAISE EXCEPTION 'Esse número já está cadastrado para outra pessoa. Confira o seu crachá; se estiver certo, fale com o RH.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.rh_dados_operadores (
    empresa_id, operador_id, cracha, atualizado_por, atualizado_por_nome
  ) VALUES (
    v_emp, v_eu, v_cracha, v_eu, v_nome
  )
  ON CONFLICT (empresa_id, operador_id) DO UPDATE
    SET cracha              = EXCLUDED.cracha,
        atualizado_por      = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
        atualizado_em       = NOW();

  UPDATE public.rh_lancamentos l
     SET cracha_snapshot = v_cracha,
         atualizado_em = NOW()
    FROM public.rh_fechamentos f
   WHERE f.id = l.fechamento_id
     AND f.status = 'aberto'
     AND l.empresa_id = v_emp
     AND l.operador_id = v_eu
     AND l.cracha_snapshot IS DISTINCT FROM v_cracha;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  IF v_qtd > 0 THEN
    SELECT l.fechamento_id INTO v_fech
      FROM public.rh_lancamentos l
      JOIN public.rh_fechamentos f ON f.id = l.fechamento_id
     WHERE l.operador_id = v_eu
       AND l.empresa_id = v_emp
       AND f.status = 'aberto'
     ORDER BY f.competencia DESC
     LIMIT 1;

    IF v_fech IS NOT NULL THEN
      PERFORM public.fn_rh_evento(
        v_fech, NULL, 'operador', 'cracha_definido',
        v_nome || ' informou o próprio crachá como ' || v_cracha);
    END IF;
  END IF;

  INSERT INTO public.cracha_pedido_respostas
         (usuario_id, nome, cargo, empresa_id, empresa_nome, setor_id, setor_nome)
  SELECT p.id, p.nome, COALESCE(cg.nome, p.perfil::text), p.empresa_id, e.nome, p.setor_id, s.nome
    FROM public.perfis p
    LEFT JOIN public.cargos   cg ON cg.slug = p.perfil::text
    LEFT JOIN public.empresas e  ON e.id = p.empresa_id
    LEFT JOIN public.setores  s  ON s.id = p.setor_id
   WHERE p.id = v_eu
  ON CONFLICT (usuario_id) DO NOTHING;

  RETURN v_cracha;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_meu_cracha_salvar(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_meu_cracha_salvar(TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_meu_cracha_salvar(TEXT) IS
  'A própria pessoa informa o crachá (até 8 dígitos) quando ainda não tem um. Não '
  'troca crachá existente — isso é com o RH. Ver 20261026160000 e 180000.';

-- ── O que o card de Configurações chama ─────────────────────────────────────

-- Liga ou desliga o cartão. Só o super_admin.
CREATE OR REPLACE FUNCTION public.fn_cracha_pedido_ligar(p_ligado BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid  UUID := auth.uid();
  v_nome TEXT;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'Só o super admin liga e desliga o pedido de crachá.' USING ERRCODE = '42501';
  END IF;
  IF p_ligado IS NULL THEN
    RAISE EXCEPTION 'Diga se liga ou desliga.' USING ERRCODE = '22023';
  END IF;
  SELECT p.nome INTO v_nome FROM public.perfis p WHERE p.id = v_uid;

  UPDATE public.cracha_pedido_config
     SET ligado = p_ligado, mudado_em = now(), mudado_por = v_uid, mudado_por_nome = v_nome
   WHERE id = 1;
END;
$function$;

-- Todo mundo que o cartão alcança (ativos, sem o super_admin), com a situação:
--   respondeu   preencheu pelo cartão (retrato da hora)
--   ja_tinha    já tinha crachá cadastrado pelo RH, o cartão nem aparece
--   pendente    ainda sem crachá
CREATE OR REPLACE FUNCTION public.fn_cracha_pedido_painel()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT (public.fn_user_is_super_admin() OR public.fn_user_tem('config_sub_geral')) THEN
    RAISE EXCEPTION 'sem acesso' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'config', (
      SELECT jsonb_build_object(
        'ligado', c.ligado, 'mudado_em', c.mudado_em, 'mudado_por_nome', c.mudado_por_nome)
        FROM public.cracha_pedido_config c WHERE c.id = 1
    ),
    'pessoas', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.nome)
        FROM (
          SELECT p.id                                         AS usuario_id,
                 COALESCE(r.nome, p.nome)                     AS nome,
                 COALESCE(r.cargo, cg.nome, p.perfil::text)   AS cargo,
                 COALESCE(r.empresa_nome, e.nome)             AS empresa_nome,
                 COALESCE(r.setor_nome, s.nome)               AS setor_nome,
                 CASE
                   WHEN r.usuario_id IS NOT NULL THEN 'respondeu'
                   WHEN d.cracha IS NOT NULL AND btrim(d.cracha) <> '' THEN 'ja_tinha'
                   ELSE 'pendente'
                 END                                          AS situacao,
                 r.respondida_em
            FROM public.perfis p
            LEFT JOIN public.cracha_pedido_respostas r ON r.usuario_id = p.id
            LEFT JOIN public.rh_dados_operadores d
                   ON d.operador_id = p.id AND d.empresa_id = p.empresa_id
            LEFT JOIN public.cargos   cg ON cg.slug = p.perfil::text
            LEFT JOIN public.empresas e  ON e.id = p.empresa_id
            LEFT JOIN public.setores  s  ON s.id = p.setor_id
           WHERE p.ativo
             AND p.perfil::text <> 'super_admin'
        ) x
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_cracha_pedido_ligar(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_cracha_pedido_painel()       FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cracha_pedido_ligar(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cracha_pedido_painel()       TO authenticated;

COMMIT;
