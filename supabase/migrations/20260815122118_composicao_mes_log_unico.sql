-- Composição do mês: um log por regeração, não um por linha.
--
-- O PROBLEMA
-- `fn_composicao_mes_snapshot` apaga e reescreve o retrato inteiro da empresa a
-- cada chamada — é o desenho dela, não um defeito. Com a trigger de auditoria
-- `FOR EACH ROW` de 20260812a por cima, cada execução virava ~200 DELETEs +
-- ~200 INSERTs registrados um a um. Medido em produção antes desta migration:
-- 47 execuções geraram 11.297 linhas em `logs_sistema` (média de 240 por
-- execução, pico de 398), o equivalente a 66,7% de toda a trilha de auditoria
-- em 3 dias de Logs 2.0.
--
-- Nenhuma dessas linhas tinha valor forense: `registro_id` nulo, `alvo_rotulo`
-- nulo, e o "antes" era sempre o retrato que a própria função acabara de
-- recalcular. A tabela é derivada — de `perfis`, `equipes` e
-- `equipe_operadores_clones`, essas sim auditadas linha a linha. Quem mudou o
-- que continua registrado na origem.
--
-- A CORREÇÃO
-- Mesmo tratamento que `analitico_recebimentos` e `diario_recebimentos` já
-- recebem desde 20260812a, e pelo mesmo motivo declarado lá: em escrita em
-- massa, o evento útil é o RESUMO. Sai a trigger por linha, entra um log por
-- execução, escrito pela própria função com as contagens.
--
-- Não mexe em dado de produção: `composicao_mes` continua sendo reescrita como
-- antes, e as 11.297 linhas já gravadas permanecem (a trilha é append-only;
-- para removê-las existe `fn_logs_expurgar`, que exige idade mínima).

-- 1. Fora a auditoria por linha.
DROP TRIGGER IF EXISTS trg_log_composicao_mes ON public.composicao_mes;

-- 2. A função passa a registrar o próprio resumo.
CREATE OR REPLACE FUNCTION public.fn_composicao_mes_snapshot(p_empresa_id uuid, p_mes text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linhas          INTEGER;
  v_equipes         INTEGER;
  v_antes_operador  INTEGER;
  v_antes_equipe    INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NOT public.fn_can_access_empresa(p_empresa_id)
    OR NOT (
      public.fn_user_is_super_admin()
      OR public.fn_user_has_any_role(
        ARRAY['lider','elite','gerencia','diretoria','administrador']
      )
    )
  ) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: usuário não pode gerar este retrato'
      USING ERRCODE = '42501';
  END IF;

  -- Calls without a JWT are accepted only for the database owner/pg_cron.
  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: sessão ausente' USING ERRCODE = '42501';
  END IF;

  IF p_mes !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'mes invalido: % (esperado yyyy-MM)', p_mes;
  END IF;

  -- Contagem anterior: é o que permite ler no log se o retrato cresceu,
  -- encolheu ou ficou igual — a única pergunta que as 240 linhas por execução
  -- respondiam, e respondiam mal.
  SELECT count(*) INTO v_antes_operador
    FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  SELECT count(*) INTO v_antes_equipe
    FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  DELETE FROM public.composicao_mes
   WHERE empresa_id = p_empresa_id AND mes = p_mes;
  DELETE FROM public.composicao_mes_equipe
   WHERE empresa_id = p_empresa_id AND mes = p_mes;

  INSERT INTO public.composicao_mes_equipe
    (empresa_id, mes, equipe_id, nome, setor_id)
  SELECT p_empresa_id, p_mes, e.id, e.nome, e.setor_id
    FROM public.equipes e
   WHERE e.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_equipes = ROW_COUNT;

  INSERT INTO public.composicao_mes
    (empresa_id, mes, operador_id, equipe_id, equipe_nome, setor_id,
     situacao, equipes_clone)
  SELECT p_empresa_id, p_mes, p.id, p.equipe_id,
         COALESCE(e.nome, 'Sem equipe'), COALESCE(e.setor_id, p.setor_id),
         COALESCE(p.situacao, 'ativo'),
         COALESCE((
           SELECT array_agg(c.equipe_id)
             FROM public.equipe_operadores_clones c
            WHERE c.empresa_id = p_empresa_id
              AND c.operador_id = p.id
              AND COALESCE(c.conta_recebimento, TRUE)
         ), '{}'::UUID[])
    FROM public.perfis p
    LEFT JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.empresa_id = p_empresa_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  -- Um log por execução. `fn_log_registrar` nunca levanta exceção, então o
  -- retrato não deixa de ser gravado se a auditoria falhar.
  PERFORM public.fn_log_registrar(
    p_acao       => 'composicao_mes_regerado',
    p_categoria  => 'importacao',
    p_severidade => 'info',
    p_descricao  => format(
      'Regerou a composição do mês %s — %s operador(es) e %s equipe(s)',
      p_mes, v_linhas, v_equipes
    ),
    p_empresa_id => p_empresa_id,
    p_tabela     => 'composicao_mes',
    p_alvo_tipo  => 'composicao_mes',
    p_alvo_rotulo=> p_mes,
    p_detalhes   => jsonb_build_object(
      'mes',                p_mes,
      'operadores',         v_linhas,
      'equipes',            v_equipes,
      'operadores_antes',   v_antes_operador,
      'equipes_antes',      v_antes_equipe
    ),
    p_origem     => 'automatico'
  );

  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.fn_composicao_mes_snapshot(uuid, text) IS
  'Regera o retrato mensal de operadores e equipes da empresa. Apaga e reescreve '
  'a composição inteira do mês, e registra UM log de resumo com as contagens. '
  'A auditoria por linha foi removida em 20260815: era 66,7% da trilha e não '
  'dizia nada que perfis/equipes já não registrem na origem.';
