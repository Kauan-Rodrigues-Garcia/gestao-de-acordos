-- ═══════════════════════════════════════════════════════════════════════════
-- 20260805c — Excluir usuário que tem acordos, e limpar ao trocar de empresa
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEMA (05/08/2026): excluir um usuário que já tabulou falhava com
--   'update or delete on table "perfis" violates foreign key constraint
--    "acordos_operador_id_fkey" on table "acordos"'
-- e a tela mostrava o texto cru do Postgres. Três tabelas seguram o perfil com
-- ON DELETE RESTRICT: `acordos.operador_id`, `historico_acordos.usuario_id` e
-- `logs_whatsapp.usuario_id` (01_schema_completo).
--
-- REGRA DEFINIDA PELO USUÁRIO (05/08/2026): ao excluir um usuário, os acordos
-- dele são apagados — os NRs ficam livres para outros tabularem — e quem
-- excluiu baixa um relatório com todas as tabulações daquele usuário, para
-- poder conferir depois. O mesmo vale ao MUDAR o usuário de empresa: ele chega
-- limpo na empresa nova e os acordos da anterior são apagados, com relatório.
--
-- O QUE ISTO NÃO APAGA — e é o ponto que torna a regra segura:
-- `analitico_recebimentos` e `diario_recebimentos` são tabelas SEPARADAS,
-- alimentadas pela importação do relatório do ERP, e não têm FK para `acordos`.
-- O recebimento que o operador trouxe continua contando nos totais de setor e
-- equipe. O que sai são as tabulações, a posse dos NRs e o histórico delas.
-- Ao apagar o PERFIL, essas linhas de recebimento passam a apontar para NULL
-- (`ON DELETE SET NULL`) e aparecem no balde "Sem operador" do diário, em vez
-- de sumirem.
--
-- Tudo dentro de uma função = uma transação: ou o usuário sai com os acordos
-- juntos, ou nada é apagado. Um laço no cliente poderia morrer no meio e
-- deixar metade dos acordos apagados com o usuário ainda de pé.

-- ── 1. Quanto seria apagado ─────────────────────────────────────────────────
-- Lido ANTES de confirmar, para a tela dizer o número em vez de "tem certeza?".
-- Também é o que decide se o relatório precisa ser gerado.
CREATE OR REPLACE FUNCTION public.fn_admin_resumo_exclusao_usuario(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_empresa UUID;
  v_nome    TEXT;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuários' USING ERRCODE = '42501';
  END IF;

  SELECT empresa_id, nome INTO v_empresa, v_nome
  FROM public.perfis WHERE id = p_user_id;

  IF NOT public.fn_can_access_empresa(v_empresa) THEN
    RAISE EXCEPTION 'Sem permissão para excluir usuário de outra empresa' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'nome',       v_nome,
    'empresa_id', v_empresa,
    'acordos',    (SELECT COUNT(*) FROM public.acordos           WHERE operador_id = p_user_id),
    'historico',  (SELECT COUNT(*) FROM public.historico_acordos WHERE usuario_id  = p_user_id),
    'logs',       (SELECT COUNT(*) FROM public.logs_whatsapp     WHERE usuario_id  = p_user_id)
  );
END;
$$;

-- ── 2. Apagar as tabulações de um usuário ───────────────────────────────────
-- Usada pelos dois caminhos (exclusão e troca de empresa). `p_empresa_id` NULL
-- = todas as empresas; preenchido = só as daquela, que é o caso da troca.
--
-- A ordem importa: `historico_acordos` e `logs_whatsapp` referenciam `acordos`
-- com CASCADE, então apagar os acordos já leva as linhas DELES. O que sobra são
-- as linhas que este usuário escreveu em acordos de OUTRAS pessoas — essas
-- seguram o perfil pelo RESTRICT e precisam sair à parte.
--
-- O gatilho `trg_sync_nr_registros` roda no DELETE de cada acordo e libera o NR
-- em `nr_registros`. É o que faz o NR ficar disponível para outro tabular.
CREATE OR REPLACE FUNCTION public.fn_admin_apagar_acordos_do_usuario(
  p_user_id    UUID,
  p_empresa_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apagados INT;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'Sem permissão para apagar acordos de usuário' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.acordos
  WHERE operador_id = p_user_id
    AND (p_empresa_id IS NULL OR empresa_id = p_empresa_id);
  GET DIAGNOSTICS v_apagados = ROW_COUNT;

  -- Rastro deixado por ele em acordos de terceiros.
  DELETE FROM public.historico_acordos WHERE usuario_id = p_user_id;
  DELETE FROM public.logs_whatsapp     WHERE usuario_id = p_user_id;

  -- Sobra defensiva: NR que tenha ficado apontando para ele sem acordo vivo.
  -- `nr_registros` não tem FK (é uma tabela de índice), então nada a limpa
  -- sozinha se alguma linha escapou do gatilho.
  DELETE FROM public.nr_registros nr
  WHERE nr.operador_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.acordos a WHERE a.id = nr.acordo_id);

  RETURN v_apagados;
END;
$$;

-- ── 3. Exclusão do usuário ──────────────────────────────────────────────────
-- `p_apagar_acordos` tem DEFAULT FALSE de propósito: a chamada antiga de um
-- argumento continua valendo e continua sendo recusada pela FK quando há
-- acordos. Apagar tabulação é decisão explícita de quem clica, nunca efeito
-- colateral de uma chamada que não pediu.
CREATE OR REPLACE FUNCTION public.fn_admin_delete_user(
  p_user_id        UUID,
  p_apagar_acordos BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_target_empresa UUID;
  v_apagados       INT := 0;
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

  IF p_apagar_acordos THEN
    v_apagados := public.fn_admin_apagar_acordos_do_usuario(p_user_id, NULL);
  END IF;

  -- Cascata de perfis.id -> auth.users(id) remove o perfil junto.
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', TRUE, 'acordos_apagados', v_apagados);
END;
$$;

COMMENT ON FUNCTION public.fn_admin_delete_user(UUID, BOOLEAN) IS
  'Exclui o usuário. Com p_apagar_acordos, apaga antes as tabulações dele (libera os NRs) — a tela baixa o relatório ANTES de chamar. Não toca em analitico_recebimentos nem diario_recebimentos.';

-- A versão de 1 argumento (20260706b) sai de cena: com o DEFAULT acima, a mesma
-- chamada resolve para a nova função. Mantê-la deixaria duas funções de mesmo
-- nome e o PostgREST não saberia qual chamar ("function is not unique").
DROP FUNCTION IF EXISTS public.fn_admin_delete_user(UUID);

GRANT EXECUTE ON FUNCTION public.fn_admin_resumo_exclusao_usuario(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_delete_user(UUID, BOOLEAN)            TO authenticated;

-- ── Diagnóstico ─────────────────────────────────────────────────────────────
-- Usuários que hoje NÃO poderiam ser excluídos sem apagar tabulação, e quanto
-- cada um segura. Confere o cenário antes de a tela começar a oferecer a opção.
SELECT
  p.nome,
  e.nome AS empresa,
  (SELECT COUNT(*) FROM public.acordos           a WHERE a.operador_id = p.id) AS acordos,
  (SELECT COUNT(*) FROM public.historico_acordos h WHERE h.usuario_id  = p.id) AS historico,
  (SELECT COUNT(*) FROM public.logs_whatsapp     l WHERE l.usuario_id  = p.id) AS logs
FROM public.perfis p
LEFT JOIN public.empresas e ON e.id = p.empresa_id
WHERE EXISTS (SELECT 1 FROM public.acordos a WHERE a.operador_id = p.id)
ORDER BY acordos DESC
LIMIT 30;
