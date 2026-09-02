-- ============================================================================
-- Excluir usuário volta a funcionar — e passa a dizer o que travou
--
-- `fn_admin_delete_user` apaga `auth.users` e conta com a cascata
-- `perfis.id -> auth.users(id)` para levar o perfil junto. Só que SEIS chaves
-- estrangeiras apontam para `public.perfis` sem cascata, e a função só cuidava
-- de três (acordos, historico_acordos, nr_registros, via
-- `fn_admin_apagar_acordos_do_usuario`). As outras nasceram depois dela:
--
--   autorizacoes_pedidos.dono_id            NO ACTION  (nullable)
--   autorizacoes_pedidos.decidido_por_id    NO ACTION  (nullable)
--   autorizacoes_pedidos.extra_atual_op_id  NO ACTION  (nullable)
--   perfis_permissoes.atualizado_por        NO ACTION  (nullable)
--   rh_lancamentos.operador_id              RESTRICT   (NOT NULL)
--
-- Qualquer uma delas derrubava a exclusão com um 23503, que a tela traduzia
-- como "ainda está referenciado em outro lugar do sistema" — uma frase que não
-- diz onde, não diz o quê, e manda recarregar a página, o que nunca resolve.
-- É o "quebra do sono" clássico: uma tabela nova chega, ninguém lembra desta
-- função, e a exclusão para de funcionar sem aviso.
--
-- O que muda:
--
--   1. As referências que são só RASTRO viram NULL — a pessoa some, o registro
--      de outra pessoa sobrevive. Quem decidiu um pedido alheio, quem estava
--      pareado como extra, quem salvou uma exceção de permissão: o pedido e a
--      exceção continuam de pé, sem apontar para um perfil que não existe mais.
--
--   2. O que é DA pessoa vai junto com ela — os pedidos de autorização de que
--      ela era dona, do mesmo jeito que as tabulações dela já iam. Não faz
--      sentido manter pedido órfão de gente excluída na fila de aprovação.
--
--   3. `rh_lancamentos` NÃO é apagado. É dinheiro lançado, com valor e data, e
--      a exclusão só gera relatório dos acordos — apagar lançamento aqui seria
--      perder registro financeiro sem ninguém ver. A exclusão para, mas agora
--      com uma frase que diz quantos lançamentos existem e o que fazer.
--
--   4. Rede de segurança: se AINDA assim um 23503 escapar — porque amanhã
--      alguém cria mais uma tabela apontando para perfis — a função captura o
--      erro e devolve o NOME DA TABELA e da constraint. A próxima vez que isso
--      quebrar, a tela diz onde, em vez de mandar recarregar a página.
--
-- Não altera dados: só a definição da função.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.fn_admin_delete_user(
  p_user_id uuid,
  p_apagar_acordos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_target_empresa UUID;
  v_apagados       INT := 0;
  v_rh             INT := 0;
  v_constraint     TEXT;
  v_tabela         TEXT;
  v_detalhe        TEXT;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo';
  END IF;

  SELECT empresa_id INTO v_target_empresa
  FROM public.perfis WHERE id = p_user_id;

  IF NOT public.fn_can_access_empresa(v_target_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuário de outra empresa' USING ERRCODE = '42501';
  END IF;

  -- Dinheiro lançado não sai por tabela de exclusão de usuário. Barra ANTES de
  -- apagar qualquer coisa, para não deixar meio serviço feito.
  SELECT count(*) INTO v_rh
  FROM public.rh_lancamentos WHERE operador_id = p_user_id;

  IF v_rh > 0 THEN
    RAISE EXCEPTION
      'Este usuário tem % lançamento(s) de RH no nome dele. Lançamento é registro financeiro e não sai junto com a exclusão: remova ou transfira os lançamentos na aba RH e exclua o usuário depois.',
      v_rh
      USING ERRCODE = '23503';
  END IF;

  IF p_apagar_acordos THEN
    v_apagados := public.fn_admin_apagar_acordos_do_usuario(p_user_id, NULL);
  END IF;

  -- Rastro em registro de terceiro: a referência sai, o registro fica.
  UPDATE public.autorizacoes_pedidos
     SET decidido_por_id = NULL
   WHERE decidido_por_id = p_user_id;

  UPDATE public.autorizacoes_pedidos
     SET extra_atual_op_id = NULL
   WHERE extra_atual_op_id = p_user_id;

  UPDATE public.perfis_permissoes
     SET atualizado_por = NULL
   WHERE atualizado_por = p_user_id;

  -- O que era da pessoa vai com ela, como já acontece com as tabulações.
  DELETE FROM public.autorizacoes_pedidos WHERE dono_id = p_user_id;

  -- Cascata de perfis.id -> auth.users(id) remove o perfil junto.
  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS
      v_constraint = CONSTRAINT_NAME,
      v_tabela     = TABLE_NAME,
      v_detalhe    = PG_EXCEPTION_DETAIL;
    RAISE EXCEPTION
      'A exclusão parou numa tabela que ainda aponta para este usuário: % (chave %). Detalhe do banco: %. Avise o suporte com esta frase — falta ensinar fn_admin_delete_user a soltar essa referência.',
      coalesce(nullif(v_tabela, ''),     'tabela não identificada'),
      coalesce(nullif(v_constraint, ''), 'não identificada'),
      coalesce(nullif(v_detalhe, ''),    'sem detalhe')
      USING ERRCODE = '23503';
  END;

  RETURN jsonb_build_object('ok', TRUE, 'acordos_apagados', v_apagados);
END;
$function$;

COMMENT ON FUNCTION public.fn_admin_delete_user(uuid, boolean) IS
  'Exclui o usuário. Com p_apagar_acordos, apaga antes as tabulações dele (libera os NRs) — a tela baixa o relatório ANTES de chamar. Solta as referências de rastro (autorizacoes_pedidos, perfis_permissoes) e apaga os pedidos de que ele era dono. Barra se houver rh_lancamentos. Não toca em analitico_recebimentos nem diario_recebimentos.';

COMMIT;
