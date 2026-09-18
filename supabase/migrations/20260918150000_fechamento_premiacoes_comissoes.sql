-- ============================================================================
-- Fechamento › Premiações e Comissões
-- ============================================================================
--
-- ## O pedido (18/09/2026)
--
-- Uma segunda aba dentro de Fechamento com o «Relatório de Premiações e
-- Comissões» que circulava em Excel: Crachá · Nome · Setor · Comissão (R$) ·
-- Premiação (R$) · Obs. Birigui recebe PREMIAÇÃO e Marília COMISSÃO. O lugar
-- certo disto é o RH Gestão, que ainda está em construção — então a aba lê e
-- grava nas MESMAS tabelas do RH, e nada precisa migrar quando ele entrar:
--
--   cidade e tipo ...... rh_config_setores + rh_celulas (setor → cidade + tipo)
--   crachá ............. rh_dados_operadores
--
-- O valor não mora no banco: é a comissão por meta do mês, calculada na tela
-- pelas mesmas peças do RH (`calcularComissao`).
--
-- ## Por que duas RPCs, e não a RLS do RH
--
-- As policies do RH exigem `fn_user_escopo('rh') >= 1`, e o RH está desligado
-- para todo cargo menos super_admin (sql_scripts/desativar_rh_gestao_2026_08_24).
-- Pela RLS, a gerência abriria a aba e não veria crachá nem cidade nenhuma.
--
-- As duas funções são SECURITY DEFINER e cumprem o recorte do FECHAMENTO:
--
--   leitura ... `ver_fechamento` com nível setor/todos; o crachá só de quem
--               `fn_fechamento_alcanca` deixa ver (setor ou empresa)
--   escrita ... `fechamento_editar` + o mesmo alcance — é quem já preenche
--               D.U. e situação do operador naquele fechamento
--
-- O crachá continua fora de `perfis`: a regra do RH (quem não pergunta não
-- recebe) vale igual.
--
-- ## Depende de
--
--   20260823090000_rh_gestao ............... as tabelas do RH
--   20260914170000_fechamento_operadores ... `fn_fechamento_alcanca`
--
-- Sem elas o bloco abaixo aborta com a mensagem do que falta, antes de criar
-- qualquer coisa.
--
-- Escrita de dados: nenhuma.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regclass('public.rh_dados_operadores') IS NULL
     OR to_regclass('public.rh_config_setores') IS NULL
     OR to_regclass('public.rh_celulas') IS NULL THEN
    RAISE EXCEPTION 'Premiações e Comissões: as tabelas do RH Gestão (20260823090000) não existem neste banco.';
  END IF;
  IF to_regprocedure('public.fn_fechamento_alcanca(uuid,uuid,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Premiações e Comissões: aplique antes 20260914170000_fechamento_operadores (fn_fechamento_alcanca).';
  END IF;
END
$pre$;

-- ============================================================================
-- 1. Leitura: cidade/tipo por setor e o crachá de quem a pessoa alcança
-- ============================================================================
--
-- Uma chamada só, em JSONB: a tela precisa das duas listas juntas para
-- desenhar a primeira linha, e duas idas ao banco dobrariam a espera.
--
-- A configuração por setor não é dado de pessoa (é «Receptivo → Birigui,
-- premiação»), então vai inteira para quem abre a aba. O crachá é, e passa
-- pelo alcance linha a linha — no nível empresa a pergunta nem é feita.

CREATE OR REPLACE FUNCTION public.fn_fechamento_premiacoes_dados(
  p_empresa_id UUID, p_ano INTEGER, p_mes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_nivel INTEGER := public.fn_user_escopo('fechamento');
BEGIN
  IF p_empresa_id IS NULL OR NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa não é sua.' USING ERRCODE = '42501';
  END IF;
  IF v_nivel < 2 THEN
    RAISE EXCEPTION 'Seu cargo não enxerga o Fechamento.' USING ERRCODE = '42501';
  END IF;
  IF p_ano IS NULL OR p_mes IS NULL OR p_mes NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'setores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'setor_id', cfg.setor_id,
               'celula', c.nome,
               'tipo_remuneracao', cfg.tipo_remuneracao
             ) ORDER BY c.ordem, c.nome)
        FROM public.rh_config_setores cfg
        JOIN public.rh_celulas c ON c.id = cfg.celula_id
       WHERE cfg.empresa_id = p_empresa_id
         AND cfg.ativo
         AND c.ativo
    ), '[]'::JSONB),
    'crachas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('operador_id', d.operador_id, 'cracha', d.cracha))
        FROM public.rh_dados_operadores d
       WHERE d.empresa_id = p_empresa_id
         AND d.cracha IS NOT NULL
         AND btrim(d.cracha) <> ''
         AND (v_nivel >= 3
              OR public.fn_fechamento_alcanca(p_empresa_id, d.operador_id, p_ano, p_mes))
    ), '[]'::JSONB)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_premiacoes_dados(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_premiacoes_dados(UUID, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.fn_fechamento_premiacoes_dados(UUID, INTEGER, INTEGER) IS
  'Premiações e Comissões (aba Fechamento): cidade/tipo de remuneração por setor '
  '(rh_config_setores) e o crachá (rh_dados_operadores) de quem o usuário alcança '
  'no Fechamento. Exige ver_fechamento com nível setor ou todos_setores.';

-- ============================================================================
-- 2. Escrita: o crachá, pela aba
-- ============================================================================
--
-- Grava em `rh_dados_operadores`, a mesma linha que o RH Gestão lê — o crachá
-- digitado aqui chega pronto lá. Vazio apaga (vira NULL), como em
-- `fn_rh_salvar_cracha`.
--
-- Crachá repetido é erro de digitação que só aparece na hora de pagar. O índice
-- `idx_rh_cracha_unico` já recusa; a checagem antes existe para a mensagem
-- dizer DE QUEM é o número, e não o nome do índice.

CREATE OR REPLACE FUNCTION public.fn_fechamento_salvar_cracha(
  p_empresa_id  UUID,
  p_operador_id UUID,
  p_ano         INTEGER,
  p_mes         INTEGER,
  p_cracha      TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_cracha TEXT := NULLIF(btrim(p_cracha), '');
  v_dono   TEXT;
  v_nome   TEXT;
BEGIN
  IF NOT public.fn_user_tem('fechamento_editar') THEN
    RAISE EXCEPTION 'Seu cargo não pode preencher o fechamento.' USING ERRCODE = '42501';
  END IF;

  IF p_empresa_id IS NULL OR p_operador_id IS NULL OR p_ano IS NULL OR p_mes IS NULL THEN
    RAISE EXCEPTION 'Crachá incompleto: empresa, operador, ano e mês são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF v_cracha IS NOT NULL AND (length(v_cracha) > 20 OR v_cracha !~ '^[0-9A-Za-z./-]+$') THEN
    RAISE EXCEPTION 'Crachá inválido: use só números e letras, até 20 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.perfis p
     WHERE p.id = p_operador_id AND p.empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'O operador não pertence a esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.fn_fechamento_alcanca(p_empresa_id, p_operador_id, p_ano, p_mes) THEN
    RAISE EXCEPTION 'Este operador está fora do seu alcance no Fechamento.' USING ERRCODE = '42501';
  END IF;

  IF v_cracha IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(p.nome), ''), 'outra pessoa') INTO v_dono
      FROM public.rh_dados_operadores d
      JOIN public.perfis p ON p.id = d.operador_id
     WHERE d.empresa_id = p_empresa_id
       AND d.cracha = v_cracha
       AND d.operador_id <> p_operador_id;
    IF v_dono IS NOT NULL THEN
      RAISE EXCEPTION 'O crachá % já é de %.', v_cracha, v_dono USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.nome), ''), 'Alguém') INTO v_nome
    FROM public.perfis p WHERE p.id = auth.uid();

  INSERT INTO public.rh_dados_operadores (
    empresa_id, operador_id, cracha, atualizado_por, atualizado_por_nome
  ) VALUES (
    p_empresa_id, p_operador_id, v_cracha, auth.uid(), v_nome
  )
  ON CONFLICT (empresa_id, operador_id) DO UPDATE
    SET cracha              = EXCLUDED.cracha,
        atualizado_por      = EXCLUDED.atualizado_por,
        atualizado_por_nome = EXCLUDED.atualizado_por_nome,
        atualizado_em       = NOW();

  RETURN v_cracha;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_fechamento_salvar_cracha(UUID, UUID, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_fechamento_salvar_cracha(UUID, UUID, INTEGER, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_fechamento_salvar_cracha(UUID, UUID, INTEGER, INTEGER, TEXT) IS
  'Grava o crachá do operador em rh_dados_operadores pela aba Fechamento. Exige '
  'fechamento_editar e alcance (fn_fechamento_alcanca). Vazio apaga.';

COMMIT;
