-- ============================================================================
-- Comercial, Fase 6: a conta do setor FECHA, e o robo tem lugar proprio
-- ============================================================================
--
-- Depende das Fases 1 a 5. Nao cria permissao nenhuma — de proposito: a cadeia
-- de `fn_permissoes_catalogo` ja quebrou uma vez neste projeto quando duas
-- migrations disputaram o topo, e nao ha chave nova a pedir aqui.
--
-- ## O que esta migration existe para impedir
--
-- No 59 da cobranca a licao custou semanas: enquanto ninguem escreveu a
-- identidade «total − colchao = soma dos setores», o dinheiro sumia em silencio
-- e cada tela dava um numero. `fn_vendas_projetar` tem hoje o mesmo buraco:
--
--     JOIN public.vendas_franquias f ... AND f.estado = 'vinculado'
--
-- E um INNER JOIN. Linha de franquia que ninguem cadastrou nao entra em
-- `vendas` e nao aparece em relatorio nenhum depois — some. A previa
-- (`fn_vendas_projecao_previa`) conta esse descarte ANTES; depois de projetar,
-- ninguem mais pergunta.
--
-- Aqui a projecao passa a devolver o que descartou, e nasce
-- `fn_vendas_fechamento_do_setor`, que responde a pergunta do setor com todas
-- as parcelas na mesma tabela:
--
--     retrato do mes = deste setor
--                    + de outro setor
--                    + franquia vinculada e login sem perfil
--                    + franquia que ninguem cadastrou
--                    + franquia ignorada
--
-- As cinco parcelas sao mutuamente exclusivas e exaustivas. Se a soma nao bate
-- o total, ha linha em estado que este codigo nao previu — e melhor descobrir
-- pela conta que nao fecha do que por um numero errado numa tela.
--
-- ## A equipe do lider vinha vazia, e isso tirava dinheiro da equipe
--
-- `fn_vendas_projetar` lia `perfis.equipe_id` para decidir a equipe da venda.
-- Mas a regra desta casa — escrita em 20260909160000 e vivendo tambem em
-- `services/equipes/equipeDoLider.ts` — e que **lider credita a equipe que
-- LIDERA**, por `equipe_lideres`, e que `perfis.equipe_id` e residuo do modelo
-- antigo. Os 11 lideres do Comercial foram cadastrados nessa regra: todos com
-- `equipe_id` nulo.
--
-- Medido no relatorio do setor ate 14/09: taynara_santos 6 vendas,
-- oton_colecao 6, raquel_souza 9, natalia_venturin 6, mais priscila, gabrieli
-- e bruna. Todas cairiam com `equipe_id` NULL — dentro do setor, fora de
-- equipe nenhuma. A meta por equipe nasceria errada no primeiro mes.
--
-- Como la, lideranca so credita quando e UNICA: quem lidera tres equipes nao
-- tem «a sua equipe», e creditar nas tres contaria o mesmo dinheiro tres vezes.
-- `perfis.equipe_id` fica como reserva para quem nao lidera nada.
--
-- ## O robo: conta no setor, nao disputa com gente
--
-- `pareceLoginDeIa` (src/lib/vendas.ts) sempre foi explicito em ser palpite:
-- «confiar na string faria um humano chamado `ian_pereira` virar robo e sair do
-- placar sem ninguem entender por que». O comentario ja apontava para «a
-- marcacao explicita em `perfis`» — que nao existia. Passa a existir.
--
-- `perfis.robo` nao muda regua nenhuma: a venda do robo e confirmada, assinada
-- e entrou no caixa do setor como qualquer outra, entao ela SOMA no setor.
-- O que a coluna permite e separar o card, e manter o robo fora do placar por
-- cabeca — que e o unico lugar onde ele distorce.
--
-- Escrita de dados: nenhuma. A coluna nasce `false` para todo mundo.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 1. A marcacao explicita de robo
-- ============================================================================

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS robo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.perfis.robo IS
  'Esta conta e automacao, nao pessoa. NAO muda regua: a venda do robo conta '
  'no setor como qualquer outra. Serve para separar o card e para tirar o robo '
  'do placar por cabeca. O palpite pelo prefixo `ia_` vive em '
  '`pareceLoginDeIa` e continua sendo so palpite — quem decide e esta coluna.';

-- Parcial: os robos sao punhado entre milhares, e so eles sao procurados.
CREATE INDEX IF NOT EXISTS idx_perfis_robo
  ON public.perfis(empresa_id) WHERE robo;

-- ============================================================================
-- 2. A equipe de quem lidera
-- ============================================================================
--
-- Mesma definicao de `lider_unico` em fn_desafio_contexto_equipe. Escrita aqui
-- como funcao para que a projecao, o fechamento e qualquer tela futura leiam a
-- MESMA regra — a duplicacao daquela migration custou uma diferenca de
-- R$ 45.358,27 entre duas telas que liam a mesma tabela.

CREATE OR REPLACE FUNCTION public.fn_vendas_equipe_que_credita(p_perfil_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    -- Lideranca vence, e so quando e unica.
    (SELECT MIN(el.equipe_id::TEXT)::UUID
       FROM public.equipe_lideres el
      WHERE el.lider_id = p_perfil_id
      HAVING COUNT(DISTINCT el.equipe_id) = 1),
    -- Reserva: o cadastro, que e o que vale para quem nao lidera nada.
    (SELECT p.equipe_id FROM public.perfis p WHERE p.id = p_perfil_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_equipe_que_credita(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_equipe_que_credita(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_equipe_que_credita(UUID) IS
  'A equipe que recebe o credito desta pessoa: a que ela LIDERA quando lidera '
  'uma so, senao a do cadastro. Mesma regra de fn_desafio_contexto_equipe e de '
  'equipeDoLider.ts — a terceira copia, e por isso as tres se citam.';

-- ============================================================================
-- 3. A projecao devolve o que descartou
-- ============================================================================

-- DROP e nao CREATE OR REPLACE: a assinatura muda (cinco colunas de saida
-- novas), e o Postgres recusa trocar o tipo de retorno de funcao existente.
-- Depois do DROP os privilegios voltam ao padrao — por isso o REVOKE/GRANT
-- abaixo nao e enfeite: sem ele a funcao fica executavel por PUBLIC.
DROP FUNCTION IF EXISTS public.fn_vendas_projetar(UUID);

CREATE OR REPLACE FUNCTION public.fn_vendas_projetar(p_lote_id UUID)
RETURNS TABLE(
  criadas            INTEGER,
  atualizadas        INTEGER,
  revertidas         INTEGER,
  revertido_valor    NUMERIC,
  preservadas        INTEGER,
  sem_dono           INTEGER,
  divergencia_setor  INTEGER,
  -- Novas. O que NAO entrou em `vendas`, e quanto dinheiro isso e. Antes
  -- sumia: o INNER JOIN descartava sem contar.
  sem_franquia       INTEGER,
  sem_franquia_valor NUMERIC,
  franquia_ignorada  INTEGER,
  ignorada_valor     NUMERIC,
  sem_dono_valor     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lote         public.vendas_lotes%ROWTYPE;
  v_criadas      INTEGER := 0;
  v_atualizadas  INTEGER := 0;
  v_revertidas   INTEGER := 0;
  v_valor        NUMERIC := 0;
  v_preservadas  INTEGER := 0;
  v_sem_dono     INTEGER := 0;
  v_sem_dono_v   NUMERIC := 0;
  v_diverg       INTEGER := 0;
  v_sem_fr       INTEGER := 0;
  v_sem_fr_v     NUMERIC := 0;
  v_ignorada     INTEGER := 0;
  v_ignorada_v   NUMERIC := 0;
  r              RECORD;
  v_antes        public.vendas%ROWTYPE;
  v_equipe       UUID;
  v_setor_pessoa UUID;
  v_id           UUID;
BEGIN
  IF NOT public.fn_user_tem('projetar_vendas') THEN
    RAISE EXCEPTION 'Seu cargo não pode lançar o relatório sobre as vendas.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote FROM public.vendas_lotes WHERE id = p_lote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.fn_can_access_empresa(v_lote.empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  IF v_lote.estado <> 'vigente' THEN
    RAISE EXCEPTION 'Só o lote vigente é projetado (este está %).', v_lote.estado
      USING ERRCODE = '22023';
  END IF;

  IF v_lote.origem <> 'geral' THEN
    RAISE EXCEPTION 'Só o relatório geral vira venda. O do setor é prévia — ele entra na conciliação.'
      USING ERRCODE = '22023';
  END IF;

  -- LEFT JOIN, e nao INNER: o descarte precisa passar por aqui para ser
  -- contado. Quem nao tem franquia vinculada continua nao entrando em
  -- `vendas` — mas agora sai no relatorio da operacao.
  FOR r IN
    SELECT rel.*,
           f.estado   AS franquia_estado,
           f.setor_id AS franquia_setor,
           public.fn_vendas_perfil_do_login(rel.empresa_id, rel.login_vendedor) AS perfil_id
      FROM public.vendas_relatorio rel
      LEFT JOIN public.vendas_franquias f
        ON f.empresa_id = rel.empresa_id
       AND f.codigo     = rel.codigo_franquia
     WHERE rel.lote_id = p_lote_id
  LOOP
    IF r.franquia_estado IS NULL OR r.franquia_estado = 'novo' THEN
      v_sem_fr   := v_sem_fr + 1;
      v_sem_fr_v := v_sem_fr_v + COALESCE(r.valor_total, 0);
      CONTINUE;
    END IF;

    IF r.franquia_estado = 'ignorado' THEN
      v_ignorada   := v_ignorada + 1;
      v_ignorada_v := v_ignorada_v + COALESCE(r.valor_total, 0);
      CONTINUE;
    END IF;

    IF r.perfil_id IS NULL THEN
      v_sem_dono   := v_sem_dono + 1;
      v_sem_dono_v := v_sem_dono_v + COALESCE(r.valor_total, 0);
      CONTINUE;
    END IF;

    -- A equipe que CREDITA, nao a do cadastro. Ver o cabecalho.
    v_equipe := public.fn_vendas_equipe_que_credita(r.perfil_id);

    SELECT p.setor_id INTO v_setor_pessoa FROM public.perfis p WHERE p.id = r.perfil_id;

    IF v_setor_pessoa IS NOT NULL AND v_setor_pessoa IS DISTINCT FROM r.franquia_setor THEN
      v_diverg := v_diverg + 1;
    END IF;

    SELECT * INTO v_antes FROM public.vendas
     WHERE empresa_id = r.empresa_id AND nr_documento = r.nr_documento;

    IF FOUND THEN
      -- Retrato velho nao desfaz retrato novo.
      IF v_antes.lote_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.vendas_lotes lb
         WHERE lb.id = v_antes.lote_id AND lb.importado_em > v_lote.importado_em
      ) THEN
        v_preservadas := v_preservadas + 1;
        CONTINUE;
      END IF;

      UPDATE public.vendas SET
        operador_id       = r.perfil_id,
        setor_id          = r.franquia_setor,
        equipe_id         = v_equipe,
        uf                = COALESCE(r.uf, v_antes.uf),
        valor_total       = r.valor_total,
        valor_entrada     = COALESCE(r.valor_entrada, v_antes.valor_entrada),
        valor_recebido    = r.valor_recebido,
        forma_pagamento   = COALESCE(r.tipo_recebimento, v_antes.forma_pagamento),
        data_venda        = r.data_venda,
        data_confirmacao  = r.data_confirmacao,
        situacao          = r.situacao,
        contrato_assinado = r.contrato_assinado,
        motivo            = r.motivo,
        origem            = 'geral',
        lote_id           = p_lote_id,
        atualizado_em     = NOW()
      WHERE id = v_antes.id;

      v_atualizadas := v_atualizadas + 1;

      IF v_antes.conta_na_meta
         AND NOT (r.situacao = 'confirmada' AND r.contrato_assinado) THEN
        v_revertidas := v_revertidas + 1;
        v_valor := v_valor + COALESCE(v_antes.valor_na_meta, 0);

        INSERT INTO public.vendas_eventos (
          venda_id, empresa_id, tipo, situacao_antes, situacao_depois,
          assinado_antes, assinado_depois, valor_antes, valor_depois,
          origem, motivo, autor_id
        ) VALUES (
          v_antes.id, r.empresa_id, 'revertida', v_antes.situacao, r.situacao,
          v_antes.contrato_assinado, r.contrato_assinado,
          v_antes.valor_na_meta, 0, 'geral', r.motivo, auth.uid()
        );
      END IF;
    ELSE
      INSERT INTO public.vendas (
        empresa_id, operador_id, setor_id, equipe_id, nr_documento, uf,
        valor_total, valor_entrada, valor_recebido, forma_pagamento,
        data_venda, data_confirmacao, situacao, contrato_assinado, motivo,
        origem, lote_id
      ) VALUES (
        r.empresa_id, r.perfil_id, r.franquia_setor, v_equipe, r.nr_documento, r.uf,
        r.valor_total, r.valor_entrada, r.valor_recebido, r.tipo_recebimento,
        r.data_venda, r.data_confirmacao, r.situacao, r.contrato_assinado, r.motivo,
        'geral', p_lote_id
      )
      RETURNING id INTO v_id;

      v_criadas := v_criadas + 1;

      INSERT INTO public.vendas_eventos (
        venda_id, empresa_id, tipo, situacao_antes, situacao_depois,
        assinado_antes, assinado_depois, valor_antes, valor_depois,
        origem, motivo, autor_id
      ) VALUES (
        v_id, r.empresa_id, 'importada', NULL, r.situacao,
        NULL, r.contrato_assinado, 0,
        CASE WHEN r.situacao = 'confirmada' AND r.contrato_assinado
             THEN r.valor_total ELSE 0 END,
        'geral', auth.uid()
      );
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_criadas, v_atualizadas, v_revertidas, v_valor,
    v_preservadas, v_sem_dono, v_diverg,
    v_sem_fr, v_sem_fr_v, v_ignorada, v_ignorada_v, v_sem_dono_v;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_projetar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_projetar(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_projetar(UUID) IS
  'Escreve o lote geral vigente em `vendas`. Devolve tambem o que DESCARTOU e '
  'quanto isso vale: franquia nao cadastrada, franquia ignorada e login sem '
  'perfil. Equipe pela lideranca (fn_vendas_equipe_que_credita), setor pela '
  'franquia.';

-- ============================================================================
-- 4. O fechamento: onde foi parar cada real do retrato
-- ============================================================================
--
-- Um setor, um mes, e a conta inteira em cinco parcelas exclusivas que somam o
-- retrato. Alem delas, dois recortes DENTRO da parcela do setor — por equipe e
-- por natureza (gente/robo) —, cada um somando a parcela do setor.
--
-- `escopo` diz a qual soma a linha pertence:
--
--   'total'       uma linha: tudo que o lote geral vigente do mes traz.
--   'destino'     cinco linhas. Somam 'total'.
--   'equipe'      uma por equipe + «sem equipe». Somam o destino deste setor.
--   'natureza'    duas: 'humano' e 'robo'.  Somam o destino deste setor.
--   'conferencia' o que esta gravado em `vendas` hoje para este setor e mes.
--                 Tem que ser igual ao destino deste setor. Quando difere, a
--                 projecao nao rodou depois da ultima carga — ou rodou com
--                 outro de-para.
--
-- Valor em DUAS reguas na mesma linha, porque as duas perguntas sao feitas:
-- `valor` e tudo que o ERP registrou; `valor_na_regua` e so o confirmado e
-- assinado, que e o que a meta ve.

-- É plpgsql, e não SQL, por causa do portão: esta funcao e SECURITY DEFINER e
-- devolve a conta do SETOR INTEIRO — o que um operador nao pode ver. Funcao SQL
-- nao sabe recusar; devolver zero linhas para quem nao alcanca seria pior, pois
-- «conta vazia» e indistinguivel de «mes sem venda».
CREATE OR REPLACE FUNCTION public.fn_vendas_fechamento_do_setor(
  p_empresa_id UUID, p_setor_id UUID, p_mes DATE
)
RETURNS TABLE(
  escopo          TEXT,
  chave           TEXT,
  rotulo          TEXT,
  linhas          INTEGER,
  valor           NUMERIC,
  linhas_na_regua INTEGER,
  valor_na_regua  NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_escopo INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Esta empresa está fora do seu acesso.' USING ERRCODE = '42501';
  END IF;

  v_escopo := public.fn_user_escopo('vendas');

  -- Escopo individual ou de equipe nao alcanca: a resposta e a conta do setor,
  -- e nao existe versao recortada dela que ainda faca sentido — a graca e que
  -- as parcelas SOMEM o total.
  IF v_escopo < 2 THEN
    RAISE EXCEPTION 'O fechamento mostra a conta do setor inteiro, e seu acesso em Vendas alcança menos que isso.'
      USING ERRCODE = '42501';
  END IF;

  IF v_escopo = 2 AND p_setor_id NOT IN (
    SELECT s FROM public.fn_setores_do_operador((SELECT auth.uid())) AS s
  ) THEN
    RAISE EXCEPTION 'Este setor está fora do seu alcance em Vendas.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH lote AS (
    SELECT l.id
      FROM public.vendas_lotes l
     WHERE l.empresa_id = p_empresa_id
       AND l.mes        = DATE_TRUNC('month', p_mes)::DATE
       AND l.origem     = 'geral'
       AND l.estado     = 'vigente'
     LIMIT 1
  ),
  base AS (
    SELECT r.nr_documento,
           r.valor_total,
           r.conta_na_meta,
           r.valor_na_meta,
           f.estado   AS franquia_estado,
           f.setor_id AS franquia_setor,
           public.fn_vendas_perfil_do_login(r.empresa_id, r.login_vendedor) AS perfil_id
      FROM public.vendas_relatorio r
      LEFT JOIN public.vendas_franquias f
        ON f.empresa_id = r.empresa_id AND f.codigo = r.codigo_franquia
     WHERE r.lote_id = (SELECT id FROM lote)
  ),
  -- As cinco parcelas, na ordem em que a projecao as descarta. A ordem importa:
  -- sao exclusivas porque cada linha para na primeira que a descreve.
  destinada AS (
    SELECT b.*,
           CASE
             WHEN b.franquia_estado IS NULL
               OR b.franquia_estado = 'novo'      THEN 'sem_franquia'
             WHEN b.franquia_estado = 'ignorado'  THEN 'ignorada'
             WHEN b.perfil_id IS NULL             THEN 'sem_operador'
             WHEN b.franquia_setor = p_setor_id   THEN 'deste_setor'
             ELSE 'outro_setor'
           END AS destino
      FROM base b
  ),
  deste AS (
    SELECT d.*,
           public.fn_vendas_equipe_que_credita(d.perfil_id) AS equipe_id,
           COALESCE((SELECT p.robo FROM public.perfis p WHERE p.id = d.perfil_id), FALSE) AS e_robo
      FROM destinada d
     WHERE d.destino = 'deste_setor'
  )
  SELECT 'total', NULL::TEXT, 'Retrato do mês',
         COUNT(*)::INTEGER, COALESCE(SUM(d.valor_total), 0),
         COUNT(*) FILTER (WHERE d.conta_na_meta)::INTEGER,
         COALESCE(SUM(d.valor_na_meta), 0)
    FROM destinada d

  UNION ALL
  SELECT 'destino', d.destino,
         CASE d.destino
           WHEN 'deste_setor'  THEN 'Deste setor'
           WHEN 'outro_setor'  THEN 'De outro setor'
           WHEN 'sem_operador' THEN 'Login sem perfil no sistema'
           WHEN 'sem_franquia' THEN 'Franquia que ninguém vinculou'
           ELSE 'Franquia ignorada'
         END,
         COUNT(*)::INTEGER, COALESCE(SUM(d.valor_total), 0),
         COUNT(*) FILTER (WHERE d.conta_na_meta)::INTEGER,
         COALESCE(SUM(d.valor_na_meta), 0)
    FROM destinada d
   GROUP BY d.destino

  UNION ALL
  SELECT 'equipe',
         COALESCE(e.equipe_id::TEXT, 'sem_equipe'),
         COALESCE((SELECT q.nome FROM public.equipes q WHERE q.id = e.equipe_id), 'Sem equipe'),
         COUNT(*)::INTEGER, COALESCE(SUM(e.valor_total), 0),
         COUNT(*) FILTER (WHERE e.conta_na_meta)::INTEGER,
         COALESCE(SUM(e.valor_na_meta), 0)
    FROM deste e
   GROUP BY e.equipe_id

  UNION ALL
  SELECT 'natureza',
         CASE WHEN e.e_robo THEN 'robo' ELSE 'humano' END,
         CASE WHEN e.e_robo THEN 'Automação' ELSE 'Pessoas' END,
         COUNT(*)::INTEGER, COALESCE(SUM(e.valor_total), 0),
         COUNT(*) FILTER (WHERE e.conta_na_meta)::INTEGER,
         COALESCE(SUM(e.valor_na_meta), 0)
    FROM deste e
   GROUP BY e.e_robo

  UNION ALL
  SELECT 'conferencia', 'em_vendas', 'Gravado em Vendas',
         COUNT(*)::INTEGER, COALESCE(SUM(v.valor_total), 0),
         COUNT(*) FILTER (WHERE v.conta_na_meta)::INTEGER,
         COALESCE(SUM(v.valor_na_meta), 0)
    FROM public.vendas v
   WHERE v.empresa_id = p_empresa_id
     AND v.setor_id   = p_setor_id
     AND v.data_confirmacao >= DATE_TRUNC('month', p_mes)::DATE
     AND v.data_confirmacao <  (DATE_TRUNC('month', p_mes) + INTERVAL '1 month')::DATE;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_fechamento_do_setor(UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_vendas_fechamento_do_setor(UUID, UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.fn_vendas_fechamento_do_setor(UUID, UUID, DATE) IS
  'Onde foi parar cada real do retrato do mes. Cinco destinos exclusivos que '
  'somam o total; equipe e natureza somam a parcela deste setor; conferencia e '
  'o que esta gravado em `vendas`. Se alguma soma nao bate, ha estado que o '
  'codigo nao previu — e o objetivo e que isso apareca.';

-- ============================================================================
-- 5. Verificacao
-- ============================================================================

DO $$
DECLARE
  n   INTEGER;
  def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'perfis' AND column_name = 'robo'
  ) THEN
    RAISE EXCEPTION 'perfis.robo nao foi criada.';
  END IF;

  -- A projecao TEM que ter as colunas novas, senao a tela continua sem saber
  -- o que foi descartado — que e o unico motivo desta migration existir.
  SELECT COUNT(*) INTO n
    FROM information_schema.routines r
    JOIN information_schema.parameters p
      ON p.specific_name = r.specific_name
   WHERE r.routine_schema = 'public'
     AND r.routine_name   = 'fn_vendas_projetar'
     AND p.parameter_name IN ('sem_franquia','sem_franquia_valor',
                              'franquia_ignorada','ignorada_valor','sem_dono_valor');
  IF n <> 5 THEN
    RAISE EXCEPTION 'fn_vendas_projetar ficou com % das 5 colunas de descarte.', n;
  END IF;

  -- O INNER JOIN nao pode ter voltado: ele e o defeito que esta migration corrige.
  def := pg_get_functiondef('public.fn_vendas_projetar'::regproc);
  IF def NOT ILIKE '%LEFT JOIN public.vendas_franquias%' THEN
    RAISE EXCEPTION 'fn_vendas_projetar voltou ao INNER JOIN — o descarte sumiria de novo.';
  END IF;

  -- O DROP zerou os privilegios. Se o REVOKE/GRANT nao rodou, a funcao que
  -- ESCREVE em `vendas` ficou aberta para PUBLIC.
  IF has_function_privilege('public', 'public.fn_vendas_projetar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_vendas_projetar ficou executavel por PUBLIC apos o DROP.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.fn_vendas_projetar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu o EXECUTE de fn_vendas_projetar — a tela pararia.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_vendas_equipe_que_credita') THEN
    RAISE EXCEPTION 'fn_vendas_equipe_que_credita nao foi criada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_vendas_fechamento_do_setor') THEN
    RAISE EXCEPTION 'fn_vendas_fechamento_do_setor nao foi criada.';
  END IF;
END $$;

COMMIT;
