-- ============================================================================
-- Comercial: venda lancada tem 1 dia para o relatorio confirmar o NR, e venda
-- na meta nao sai pela mao de operador nem de lider
-- ============================================================================
--
-- ✅ APLICADA em 21/09/2026 (SQL Editor) e registrada em schema_migrations.
-- Depende das Fases 1-4 (20260915100000..130000). Conferencia antes: 2 vendas
-- manuais na primeira passada (NR 232 e 2323, R$ 355.555,00, lancamentos de
-- teste de 21/09).
--
-- ## O pedido (21/09/2026)
--
-- «Caso a pessoa adicione a venda e, depois que jogar o 59, ela nao for
-- confirmada pelo relatorio, ela ficara 1 dia e apos isso sera excluida,
-- aparecendo aviso. Tambem permitir a pessoa excluir, e vendas que estao na
-- meta nao permitir que seja excluido por operador e nem lider.»
--
-- O «59» do Comercial e o relatorio GERAL (ver PLANO-COMERCIAL-VENDAS.md: o
-- geral espelha o 59, a previa do setor espelha o 58).
--
-- ## O que salva a venda: o NR existir no ERP
--
-- O geral recorta pela data de CONFIRMACAO — venda ainda aberta no ERP nunca
-- aparece nele, por construcao. Exigir o geral apagaria venda verdadeira que
-- so demorou a confirmar. Decidido com o usuario: salva o NR que aparecer no
-- geral OU na previa do setor (que traz as abertas). O que sai e o NR que o
-- ERP nao conhece — digitado errado, ou inventado.
--
-- «Aparecer» = estar em `vendas_relatorio` de um lote VIGENTE, de qualquer mes
-- e de qualquer das duas origens. Lote substituido ja teve as linhas apagadas
-- (fn_vendas_lote_promover), entao nao ha retrato velho mentindo aqui.
--
-- ## Quem entra na regra
--
--   origem = 'manual' .... nunca casou com o geral (quando casa, a projecao
--                          troca a origem para 'geral');
--   NOT conta_na_meta .... venda na meta e dinheiro do placar; o sistema nao a
--                          tira sozinho, pela mesma razao que operador e lider
--                          nao podem tira-la (abaixo).
--
-- ## O relogio: `vendas.sem_relatorio_desde`
--
-- Comeca quando um relatorio GERAL e promovido DEPOIS do lancamento (e o
-- «depois que jogar o 59») e o NR nao esta em retrato vigente nenhum. So conta
-- geral cujo mes alcanca a venda — reimportar agosto nao marca venda de
-- setembro. Volta a nulo sozinho se o NR aparecer, se a venda entrar na meta
-- ou se deixar de ser manual.
--
-- Um dia depois, a venda vai para `lixeira_vendas` (7 dias para restaurar),
-- com o motivo escrito e `excluido_por_nome = 'Sistema — prazo do relatorio'`.
--
-- Quem marca e quem exclui:
--   - gatilho em `vendas_lotes`: quando um lote vira vigente, marca e desmarca
--     na hora — o aviso aparece logo depois da importacao, sem esperar;
--   - pg_cron a cada 10 minutos: marca (rede de seguranca do gatilho) e exclui
--     o que venceu.
--
-- O gatilho engole o proprio erro. A importacao NUNCA pode cair por causa do
-- aviso; se a marcacao falhar ali, o agendamento refaz em ate 10 minutos.
--
-- ## O aviso
--
-- Notificacao (sino) para quem vendeu e para quem lancou, nas duas pontas:
-- quando a venda e marcada («sai em DD/MM as HH:MM») e quando e excluida. Na
-- aba Vendas, a linha mostra o prazo e a tela abre com uma faixa contando
-- quantas estao para sair.
--
-- ## Excluir: quem pode o que (fn_venda_excluir)
--
--   venda NA META ........ so quem tem a chave NOVA `excluir_vendas_na_meta`.
--                          Nasce ligada em elite e gerencia (administrador e
--                          super_admin tem tudo); operador e lider, nao —
--                          decidido com o usuario;
--   venda fora da meta ... quem tem `excluir_vendas`, como antes, OU quem a
--                          LANCOU (criado_por), enquanto ela for manual. O
--                          operador nao tem `excluir_vendas` por padrao — e
--                          nao ganha: a regra nova e «apague o que VOCE
--                          lancou», nao «apague venda».
--
-- Chave, e nao cargo escrito na funcao: o painel de permissoes e a autoridade
-- unica (`painel-manda.test.ts`, divida zero desde 24/08/2026). Se um dia a
-- operacao quiser um lider de confianca excluindo venda na meta, e um clique
-- no painel, nao um deploy.
--
-- A chave entra num elo novo da cadeia de fn_permissoes_catalogo(), a partir
-- do topo atual — `fn_permissoes_catalogo_antes_elite_20260919` + a chave
-- `painel_lider_sub_elite` (20260919100000). O retrato abaixo repete o corpo
-- atual chave por chave (COMERCIAL-ESTADO-E-PENDENCIAS.md §2.5).
--
-- fn_venda_excluir foi copiada de 20260915100000 e mudou SO o bloco de
-- permissao (o `IF NOT fn_user_tem` do topo desceu para depois do SELECT,
-- porque a regra agora depende da linha). O resto e byte a byte o de antes —
-- ver §2.4 do mesmo documento.
--
-- ## Primeira execucao
--
-- As vendas manuais que JA existem e cujo NR nao esta em relatorio nenhum
-- serao marcadas na primeira passada do agendamento (ate 10 min depois de
-- aplicar) e excluidas 24 h depois, com aviso. E a regra valendo para tras;
-- conferir quantas sao ANTES de aplicar (SELECT no fim deste cabecalho).
--
-- Escrita de dados na aplicacao: so a semeadura da chave nova em
-- `cargos_permissoes` (fn_permissoes_semear_empresa, que so acrescenta chave
-- ausente). Cria uma coluna, um indice parcial, seis funcoes, um gatilho e dois
-- agendamentos; redefine fn_venda_excluir e fn_permissoes_catalogo.
--
-- Conferencia antes de aplicar (quantas cairiam na primeira passada):
--
--   SELECT count(*) AS vendas, sum(v.valor_total) AS valor
--     FROM public.vendas v
--    WHERE v.origem = 'manual' AND NOT v.conta_na_meta
--      AND EXISTS (SELECT 1 FROM public.vendas_lotes l
--                   WHERE l.empresa_id = v.empresa_id AND l.origem = 'geral'
--                     AND l.estado IN ('vigente','substituido')
--                     AND l.promovido_em > v.criado_em
--                     AND l.mes >= date_trunc('month', v.data_venda)::DATE)
--      AND NOT EXISTS (SELECT 1 FROM public.vendas_relatorio r
--                        JOIN public.vendas_lotes l ON l.id = r.lote_id
--                       WHERE r.empresa_id = v.empresa_id
--                         AND r.nr_documento = v.nr_documento
--                         AND l.estado = 'vigente');
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- ============================================================================
-- 0. Catalogo de permissoes: `excluir_vendas_na_meta`
-- ============================================================================
--
-- O topo da cadeia e 20260919100000 (Plantao Elite); nenhuma migration depois
-- dela redefiniu `fn_permissoes_catalogo`. O congelamento abaixo repete o
-- corpo atual da funcao — e isso que o torna retrato.

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo_antes_venda_na_meta_20260921()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_elite_20260919()
  UNION ALL
  SELECT * FROM (VALUES
    ('painel_lider_sub_elite', ARRAY['bookplay']::TEXT[], ARRAY['elite']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo_antes_venda_na_meta_20260921() IS
  'Retrato do catalogo antes da chave excluir_vendas_na_meta (21/09/2026). '
  'NAO e objeto morto: fn_permissoes_catalogo depende dela.';

CREATE OR REPLACE FUNCTION public.fn_permissoes_catalogo()
RETURNS TABLE(chave TEXT, tenants TEXT[], padrao TEXT[], explicita BOOLEAN)
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT * FROM public.fn_permissoes_catalogo_antes_venda_na_meta_20260921()
  UNION ALL
  SELECT * FROM (VALUES
    -- Venda na meta e dinheiro do placar: operador e lider nao a excluem.
    -- So Comercial; nasce em elite e gerencia.
    ('excluir_vendas_na_meta', ARRAY['comercial']::TEXT[], ARRAY['elite','gerencia']::TEXT[], false)
  ) AS novas(chave, tenants, padrao, explicita);
$function$;

COMMENT ON FUNCTION public.fn_permissoes_catalogo() IS
  'Catalogo completo. A extensao 20260921150000 adiciona excluir_vendas_na_meta '
  '(Comercial).';

DO $$
DECLARE e RECORD;
BEGIN
  FOR e IN SELECT id FROM public.empresas LOOP
    PERFORM public.fn_permissoes_semear_empresa(e.id);
  END LOOP;
END $$;

-- ============================================================================
-- 1. O relogio
-- ============================================================================

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS sem_relatorio_desde TIMESTAMPTZ;

COMMENT ON COLUMN public.vendas.sem_relatorio_desde IS
  'Desde quando esta venda manual espera o relatorio confirmar o NR. Marcada '
  'quando um geral e promovido depois do lancamento sem trazer o NR (nem a '
  'previa o traz). Um dia depois a venda vai para a lixeira. Volta a nulo se '
  'o NR aparecer, se entrar na meta ou se deixar de ser manual. Ver '
  '20260921150000.';

-- Parcial: quase toda venda tem nulo aqui, e so as marcadas sao procuradas.
CREATE INDEX IF NOT EXISTS idx_vendas_sem_relatorio
  ON public.vendas(empresa_id, sem_relatorio_desde)
  WHERE sem_relatorio_desde IS NOT NULL;

-- ============================================================================
-- 2. O ERP conhece este NR?
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_nr_no_relatorio(
  p_empresa_id UUID, p_nr TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.vendas_relatorio r
      JOIN public.vendas_lotes l ON l.id = r.lote_id
     WHERE r.empresa_id   = p_empresa_id
       AND r.nr_documento = p_nr
       AND l.estado       = 'vigente'
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_nr_no_relatorio(UUID, TEXT) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vendas_nr_no_relatorio(UUID, TEXT) IS
  'O NR esta em algum retrato vigente — geral OU previa do setor, de qualquer '
  'mes? E o que salva a venda manual do prazo de 1 dia.';

-- ============================================================================
-- 3. Marcar e desmarcar
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_marcar(p_empresa_id UUID DEFAULT NULL)
RETURNS TABLE(marcadas INTEGER, desmarcadas INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marcadas    INTEGER := 0;
  v_desmarcadas INTEGER := 0;
BEGIN
  -- Desmarca primeiro: o NR apareceu, a venda entrou na meta, ou a projecao a
  -- levou para 'geral'.
  UPDATE public.vendas v
     SET sem_relatorio_desde = NULL
   WHERE v.sem_relatorio_desde IS NOT NULL
     AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id)
     AND (v.origem <> 'manual'
          OR v.conta_na_meta
          OR public.fn_vendas_nr_no_relatorio(v.empresa_id, v.nr_documento));
  GET DIAGNOSTICS v_desmarcadas = ROW_COUNT;

  -- Marca: manual, fora da meta, com um GERAL promovido depois do lancamento
  -- cujo mes alcanca a venda, e o NR em retrato vigente nenhum.
  --
  -- O aviso sai no mesmo comando (CTE que escreve roda sempre, lida ou nao):
  -- para quem vendeu e para quem lancou, uma vez so quando sao a mesma pessoa.
  --
  -- A CTE nao se chama `marcadas`: e o nome da coluna de saida, e em plpgsql
  -- ela e variavel.
  WITH recem_marcadas AS (
    UPDATE public.vendas v
       SET sem_relatorio_desde = NOW()
     WHERE v.sem_relatorio_desde IS NULL
       AND v.origem = 'manual'
       AND NOT v.conta_na_meta
       AND (p_empresa_id IS NULL OR v.empresa_id = p_empresa_id)
       AND EXISTS (
         SELECT 1 FROM public.vendas_lotes l
          WHERE l.empresa_id   = v.empresa_id
            AND l.origem       = 'geral'
            AND l.estado       IN ('vigente', 'substituido')
            AND l.promovido_em > v.criado_em
            AND l.mes          >= date_trunc('month', v.data_venda)::DATE
       )
       AND NOT public.fn_vendas_nr_no_relatorio(v.empresa_id, v.nr_documento)
    RETURNING v.empresa_id, v.operador_id, v.criado_por, v.nr_documento, v.sem_relatorio_desde
  ),
  avisos AS (
    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT d.usuario_id, m.empresa_id,
           'Venda ' || m.nr_documento || ' não veio no relatório',
           format(
             'O NR %s não apareceu no relatório importado. Se não aparecer até %s, '
             'a venda vai para a lixeira. Confira o NR na aba Vendas.',
             m.nr_documento,
             to_char((m.sem_relatorio_desde + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo',
                     'DD/MM "às" HH24:MI')),
           FALSE, '/vendas'
      FROM recem_marcadas m
      CROSS JOIN unnest(ARRAY[m.operador_id, m.criado_por]) AS d(usuario_id)
     WHERE d.usuario_id IS NOT NULL
  )
  SELECT count(*)::INTEGER INTO v_marcadas FROM recem_marcadas;

  RETURN QUERY SELECT v_marcadas, v_desmarcadas;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_marcar(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vendas_prazo_marcar(UUID) IS
  'Liga e desliga o relogio de 1 dia das vendas manuais que o relatorio nao '
  'trouxe, e avisa quem vendeu e quem lancou. NULL = todas as empresas. So o '
  'gatilho de vendas_lotes e o agendamento chamam.';

-- ============================================================================
-- 4. Excluir o que venceu
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_excluir()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v        public.vendas%ROWTYPE;
  v_nome   TEXT;
  v_total  INTEGER := 0;
  c_motivo CONSTANT TEXT :=
    'Não apareceu no relatório geral nem na prévia do setor em 1 dia.';
BEGIN
  -- As mesmas tres condicoes da marcacao, conferidas de novo na hora: entre a
  -- marca e o prazo o NR pode ter aparecido, ou o lider pode ter confirmado.
  FOR v IN
    SELECT *
      FROM public.vendas
     WHERE sem_relatorio_desde IS NOT NULL
       AND sem_relatorio_desde <= NOW() - INTERVAL '1 day'
       AND origem = 'manual'
       AND NOT conta_na_meta
       AND NOT public.fn_vendas_nr_no_relatorio(empresa_id, nr_documento)
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT nome INTO v_nome FROM public.perfis WHERE id = v.operador_id;

    INSERT INTO public.lixeira_vendas (
      venda_id, empresa_id, operador_id, operador_nome, nr_documento, cliente,
      valor_total, data_venda, situacao, contrato_assinado, dados_completos,
      motivo, excluido_por_id, excluido_por_nome
    ) VALUES (
      v.id, v.empresa_id, v.operador_id, v_nome,
      v.nr_documento, v.cliente, v.valor_total, v.data_venda,
      v.situacao, v.contrato_assinado, to_jsonb(v),
      c_motivo, NULL, 'Sistema — prazo do relatório'
    );

    INSERT INTO public.vendas_eventos (
      venda_id, empresa_id, tipo, situacao_antes, assinado_antes,
      valor_antes, origem, motivo, autor_id
    ) VALUES (
      v.id, v.empresa_id, 'excluida', v.situacao, v.contrato_assinado,
      v.valor_na_meta, v.origem, c_motivo, NULL
    );

    DELETE FROM public.vendas WHERE id = v.id;

    INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
    SELECT DISTINCT d.usuario_id, v.empresa_id,
           'Venda ' || v.nr_documento || ' excluída',
           format(
             'O NR %s não apareceu no relatório em 1 dia e a venda foi para a lixeira. '
             'Se o NR estiver certo, peça ao líder para restaurá-la — são 7 dias.',
             v.nr_documento),
           FALSE, '/vendas'
      FROM unnest(ARRAY[v.operador_id, v.criado_por]) AS d(usuario_id)
     WHERE d.usuario_id IS NOT NULL;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_excluir() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_vendas_prazo_excluir() IS
  'Leva para a lixeira a venda manual cujo relogio de 1 dia venceu sem o NR '
  'aparecer no geral nem na previa. So o agendamento chama.';

-- O que o agendamento roda: marca (e desmarca), depois exclui.
CREATE OR REPLACE FUNCTION public.fn_vendas_prazo_rodar()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marca   RECORD;
  v_exclui  INTEGER;
BEGIN
  SELECT * INTO v_marca FROM public.fn_vendas_prazo_marcar(NULL);
  v_exclui := public.fn_vendas_prazo_excluir();
  RETURN jsonb_build_object(
    'marcadas',    v_marca.marcadas,
    'desmarcadas', v_marca.desmarcadas,
    'excluidas',   v_exclui);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_prazo_rodar() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. O gatilho: o aviso sai logo depois da importacao
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_vendas_lote_vigente_prazo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.fn_vendas_prazo_marcar(NEW.empresa_id);
  EXCEPTION WHEN OTHERS THEN
    -- A importacao nunca cai por causa do aviso. O agendamento refaz.
    RAISE WARNING 'prazo do relatorio: marcacao falhou no lote % (%). O agendamento refaz em ate 10 min.',
      NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_vendas_lote_vigente_prazo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vendas_lote_vigente_prazo ON public.vendas_lotes;
CREATE TRIGGER trg_vendas_lote_vigente_prazo
  AFTER UPDATE OF estado ON public.vendas_lotes
  FOR EACH ROW
  WHEN (NEW.estado = 'vigente' AND OLD.estado IS DISTINCT FROM 'vigente')
  EXECUTE FUNCTION public.fn_vendas_lote_vigente_prazo();

-- ============================================================================
-- 6. Excluir pela tela: na meta, so com a chave; fora dela, tambem quem lancou
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_venda_excluir(p_id UUID, p_motivo TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes public.vendas%ROWTYPE;
  v_nome  TEXT;
  v_autor TEXT;
  v_lix   UUID;
BEGIN
  SELECT * INTO v_antes FROM public.vendas WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venda não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  -- Na meta e dinheiro do placar: chave propria, que operador e lider nao
  -- tem — pedido de 21/09/2026. Ver o cabecalho de 20260921150000.
  IF v_antes.conta_na_meta THEN
    IF NOT public.fn_user_tem('excluir_vendas_na_meta') THEN
      RAISE EXCEPTION 'Venda na meta não pode ser excluída por operador nem por líder. Peça à gerência.'
        USING ERRCODE = '42501';
    END IF;
  -- Fora da meta: a chave, como antes, ou ter lancado a venda a mao.
  ELSIF NOT public.fn_user_tem('excluir_vendas')
        AND NOT (v_antes.origem = 'manual' AND v_antes.criado_por = auth.uid()) THEN
    RAISE EXCEPTION 'Você só pode excluir a venda que você mesmo lançou e que ainda não veio no relatório.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_vendas_alcanca(
       v_antes.empresa_id, v_antes.operador_id, v_antes.setor_id, v_antes.equipe_id
     ) THEN
    RAISE EXCEPTION 'Esta venda está fora do seu alcance.' USING ERRCODE = '42501';
  END IF;

  SELECT nome INTO v_nome  FROM public.perfis WHERE id = v_antes.operador_id;
  SELECT nome INTO v_autor FROM public.perfis WHERE id = auth.uid();

  INSERT INTO public.lixeira_vendas (
    venda_id, empresa_id, operador_id, operador_nome, nr_documento, cliente,
    valor_total, data_venda, situacao, contrato_assinado, dados_completos,
    motivo, excluido_por_id, excluido_por_nome
  ) VALUES (
    v_antes.id, v_antes.empresa_id, v_antes.operador_id, v_nome,
    v_antes.nr_documento, v_antes.cliente, v_antes.valor_total, v_antes.data_venda,
    v_antes.situacao, v_antes.contrato_assinado, to_jsonb(v_antes),
    NULLIF(BTRIM(p_motivo), ''), auth.uid(), v_autor
  )
  RETURNING id INTO v_lix;

  -- O evento e gravado ANTES do DELETE: `vendas_eventos.venda_id` cascateia, e
  -- o rastro da exclusao morreria junto com a linha. Quem quer o historico de
  -- uma venda excluida procura na lixeira, onde `dados_completos` o guarda.
  INSERT INTO public.vendas_eventos (
    venda_id, empresa_id, tipo, situacao_antes, assinado_antes,
    valor_antes, origem, motivo, autor_id
  ) VALUES (
    p_id, v_antes.empresa_id, 'excluida', v_antes.situacao, v_antes.contrato_assinado,
    v_antes.valor_na_meta, v_antes.origem, NULLIF(BTRIM(p_motivo), ''), auth.uid()
  );

  DELETE FROM public.vendas WHERE id = p_id;
  RETURN v_lix;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_venda_excluir(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_venda_excluir(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.fn_venda_excluir(UUID, TEXT) IS
  'Move a venda para lixeira_vendas com retrato completo e apaga a linha. '
  'Sete dias para restaurar. Na meta: so com excluir_vendas_na_meta. Fora da '
  'meta: excluir_vendas, ou quem a lancou a mao (20260921150000).';

-- ============================================================================
-- 7. O agendamento
-- ============================================================================
--
-- A cada 10 minutos: e o atraso maximo entre o prazo vencer e a venda sair.
-- A tela ja mostra o prazo pelo relogio de quem olha. A faxina guarda so dois
-- dias do historico DESTE trabalho.

DO $agenda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'Sem pg_cron: o prazo do relatorio so marca pelo gatilho, e nada e excluido ate a extensao existir.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendas-prazo-do-relatorio') THEN
    PERFORM cron.unschedule('vendas-prazo-do-relatorio');
  END IF;
  PERFORM cron.schedule(
    'vendas-prazo-do-relatorio', '*/10 * * * *', 'SELECT public.fn_vendas_prazo_rodar();');

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendas-prazo-do-relatorio-faxina') THEN
    PERFORM cron.unschedule('vendas-prazo-do-relatorio-faxina');
  END IF;
  PERFORM cron.schedule(
    'vendas-prazo-do-relatorio-faxina', '37 4 * * *',
    'DELETE FROM cron.job_run_details d USING cron.job j '
    || 'WHERE d.jobid = j.jobid AND j.jobname = ''vendas-prazo-do-relatorio'' '
    || 'AND d.end_time < NOW() - INTERVAL ''2 days'';');
END
$agenda$;

-- ============================================================================
-- 8. Prova
-- ============================================================================

DO $prova$
DECLARE
  def        TEXT;
  v_faltando TEXT;
  n          INTEGER;
BEGIN
  -- O catalogo: a chave nova, semeada em todo cargo, e a cadeia inteira.
  SELECT string_agg(DISTINCT format('%s/%s/%s', emp.slug, cp.cargo, cat.chave), ', ')
    INTO v_faltando
    FROM public.empresas emp
    JOIN public.cargos_permissoes cp ON cp.empresa_id = emp.id
    CROSS JOIN public.fn_permissoes_catalogo() cat
   WHERE (cat.tenants IS NULL OR emp.slug = ANY(cat.tenants))
     AND cp.cargo <> 'rh'
     AND NOT (cp.permissoes ? cat.chave);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Chaves ausentes após semear: %', v_faltando;
  END IF;

  -- Testemunhas da cadeia: uma de cada elo que ja se partiu ou veio antes.
  IF NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'tickets_excluir')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_ausencias')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'painel_lider_sub_elite')
     OR NOT EXISTS (SELECT 1 FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_vendas') THEN
    RAISE EXCEPTION 'A cadeia do catalogo se partiu: uma chave de elo anterior sumiu.';
  END IF;

  SELECT count(*) INTO n FROM public.fn_permissoes_catalogo() WHERE chave = 'excluir_vendas_na_meta';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Esperava 1 excluir_vendas_na_meta no catalogo, achei %', n;
  END IF;

  -- O pedido: operador e lider nascem SEM a chave.
  SELECT count(*) INTO n
    FROM public.cargos_permissoes cp
    JOIN public.empresas emp ON emp.id = cp.empresa_id
   WHERE emp.slug = 'comercial'
     AND cp.cargo IN ('operador', 'lider')
     AND (cp.permissoes ->> 'excluir_vendas_na_meta')::BOOLEAN;
  IF n <> 0 THEN
    RAISE EXCEPTION 'excluir_vendas_na_meta nasceu ligada em % cargo(s) de operador/lider', n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vendas'
       AND column_name = 'sem_relatorio_desde'
  ) THEN
    RAISE EXCEPTION 'vendas.sem_relatorio_desde nao foi criada.';
  END IF;

  IF to_regprocedure('public.fn_vendas_nr_no_relatorio(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_vendas_prazo_marcar(uuid)') IS NULL
     OR to_regprocedure('public.fn_vendas_prazo_excluir()') IS NULL
     OR to_regprocedure('public.fn_vendas_prazo_rodar()') IS NULL THEN
    RAISE EXCEPTION 'uma das funcoes do prazo nao foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_vendas_lote_vigente_prazo'
       AND tgrelid = 'public.vendas_lotes'::regclass
  ) THEN
    RAISE EXCEPTION 'o gatilho de vendas_lotes nao foi criado.';
  END IF;

  -- As funcoes do prazo escrevem e excluem: ninguem as chama pela API.
  IF has_function_privilege('authenticated', 'public.fn_vendas_prazo_rodar()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_vendas_prazo_excluir()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_vendas_prazo_marcar(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'uma funcao do prazo ficou aberta para authenticated.';
  END IF;

  def := pg_get_functiondef('public.fn_venda_excluir(uuid,text)'::regprocedure);

  IF def NOT ILIKE '%v_antes.conta_na_meta%' OR def NOT ILIKE '%excluir_vendas_na_meta%' THEN
    RAISE EXCEPTION 'fn_venda_excluir nao pede a chave para excluir venda na meta.';
  END IF;

  IF def NOT ILIKE '%v_antes.criado_por = auth.uid()%' THEN
    RAISE EXCEPTION 'fn_venda_excluir nao deixa quem lancou excluir a propria venda.';
  END IF;

  IF def NOT ILIKE '%fn_vendas_alcanca%' THEN
    RAISE EXCEPTION 'fn_venda_excluir perdeu a conferencia de alcance.';
  END IF;

  IF has_function_privilege('public', 'public.fn_venda_excluir(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_venda_excluir(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'os GRANTs de fn_venda_excluir mudaram.';
  END IF;

  -- Aninhado, e nao com AND: o plpgsql planeja a expressao inteira, e sem a
  -- extensao `cron.job` nem existe.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendas-prazo-do-relatorio') THEN
      RAISE EXCEPTION 'o agendamento vendas-prazo-do-relatorio nao foi criado.';
    END IF;
  END IF;
END
$prova$;

COMMIT;
