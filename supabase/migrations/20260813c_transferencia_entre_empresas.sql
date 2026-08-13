-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813c — Abrir a troca de empresa para a transferência (e só para ela)
-- ═══════════════════════════════════════════════════════════════════════════
-- ## O problema
--
-- `perfis` tem o trigger `block_empresa_id_update`, que roda
-- `prevent_empresa_id_update()`:
--
--     IF NEW.empresa_id <> OLD.empresa_id THEN
--       RAISE EXCEPTION 'Não é permitido alterar o empresa_id';
--     END IF;
--
-- Incondicional. Ninguém, por nenhum caminho, muda alguém de empresa — o que
-- significa que a troca de empresa NUNCA funcionou neste projeto. O campo
-- "Empresa" do modal de editar usuário e o `limparAcordosDaEmpresaAnterior`
-- que vinha atrás dele existiam desde 05/08/2026 e sempre morriam nesta linha.
-- Só apareceu agora porque a transferência passou a mostrar o erro com o nome
-- de quem falhou em vez de engoli-lo.
--
-- E o mesmo trigger derrubaria `fn_transferencia_desfazer` (20260813b), que
-- reescreve `empresa_id` para trazer a pessoa de volta.
--
-- ## Por que não apagar o trigger
--
-- Ele está certo no que protege: `empresa_id` é a fronteira entre os dois
-- CNPJs, e um UPDATE solto vindo da tela poderia empurrar gente de um tenant
-- para o outro. O que faltava era uma porta autorizada — não a ausência de
-- porta.
--
-- ## A porta
--
-- `fn_transferencia_mover_empresa` liga uma chave de transação
-- (`app.transferencia_em_curso`) e faz o UPDATE. O trigger passa a recusar
-- tudo, MENOS quando essa chave está ligada. Como ela é `is_local = true`, ela
-- morre no fim da transação: não há como deixá-la ligada por engano para o
-- próximo comando.
--
-- Só `super_admin`. Não é rigor decorativo: `setores_select` usa
-- `fn_can_access_empresa`, que só abre a outra empresa para ele. Um
-- `administrador` de uma empresa não enxerga os setores da outra, então não
-- teria como escolher um destino válido — e empurrar alguém para um tenant que
-- não é o seu é decisão de quem administra os dois.
--
-- Idempotente.

-- ─── 1. O trigger passa a ter exceção ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_empresa_id_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    -- `true` no segundo argumento = não estoura quando a chave nunca foi
    -- definida nesta sessão; devolve NULL, que não casa com 'on'.
    IF COALESCE(current_setting('app.transferencia_em_curso', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Não é permitido alterar o empresa_id'
        USING HINT = 'Use a transferência na aba Setores (fn_transferencia_mover_empresa).';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ─── 2. A porta autorizada ──────────────────────────────────────────────────
--
-- SECURITY DEFINER porque precisa escrever numa linha cuja empresa de destino a
-- sessão não enxerga: `perfis_admin_all` exige `empresa_id = fn_user_empresa_id()`
-- no WITH CHECK, então o UPDATE com a empresa NOVA seria recusado pela RLS
-- mesmo com o trigger liberado. `search_path` fixo fecha o sequestro de nome.
CREATE OR REPLACE FUNCTION public.fn_transferencia_mover_empresa(
  p_perfil_id  UUID,
  p_empresa_id UUID,
  p_setor_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_antes   public.perfis%ROWTYPE;
  v_usuario TEXT;
  v_colide  BOOLEAN;
BEGIN
  IF NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'sem permissão: mover alguém de empresa é de super_admin';
  END IF;

  -- Setor de destino é obrigatório: sem ele a pessoa fica fora de todo painel
  -- escopado por setor. Mesma regra do serviço, repetida aqui porque este é o
  -- caminho de escrita e ele não pode depender de a tela ter conferido.
  IF p_setor_id IS NULL THEN
    RAISE EXCEPTION 'escolha o setor de destino';
  END IF;

  SELECT * INTO v_antes FROM public.perfis WHERE id = p_perfil_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'perfil % não encontrado', p_perfil_id;
  END IF;

  -- O setor tem que ser DA empresa de destino. Sem esta checagem dá para gravar
  -- um perfil da empresa A apontando para um setor da empresa B, e aí ele some
  -- de todos os painéis dos dois lados.
  IF NOT EXISTS (
    SELECT 1 FROM public.setores
     WHERE id = p_setor_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'o setor escolhido não pertence à empresa de destino';
  END IF;

  -- `idx_perfis_usuario_empresa` é UNIQUE (usuario, empresa_id). O caso é real:
  -- o login `robson_cofen` existe nas duas empresas. Sem esta checagem o erro
  -- sairia cru do Postgres depois de a tela dizer que ia dar certo.
  v_usuario := v_antes.usuario;
  IF v_usuario IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.perfis
       WHERE usuario = v_usuario AND empresa_id = p_empresa_id AND id <> p_perfil_id
    ) INTO v_colide;
    IF v_colide THEN
      RAISE EXCEPTION
        'o login "%" já está em uso na empresa de destino; renomeie um dos dois antes',
        v_usuario;
    END IF;
  END IF;

  -- A chave que abre o trigger. `true` = local à transação: acaba junto com ela,
  -- então não sobra ligada para o próximo comando da mesma conexão.
  PERFORM set_config('app.transferencia_em_curso', 'on', true);

  UPDATE public.perfis
     SET empresa_id = p_empresa_id,
         setor_id   = p_setor_id,
         -- A equipe é do setor de origem, noutra empresa. Quem devolve a pessoa
         -- ao card daquela equipe no mês corrente é o fantasma (20260813b).
         equipe_id  = NULL
   WHERE id = p_perfil_id;

  PERFORM set_config('app.transferencia_em_curso', 'off', true);

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'origem_empresa',  v_antes.empresa_id,
    'origem_setor',    v_antes.setor_id,
    'origem_equipe',   v_antes.equipe_id
  );
END $$;

REVOKE ALL ON FUNCTION public.fn_transferencia_mover_empresa(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_mover_empresa(UUID, UUID, UUID) TO authenticated;

-- ─── 3. O desfazer também precisa da chave ──────────────────────────────────
--
-- `fn_transferencia_desfazer` (20260813b) reescreve `empresa_id` para trazer a
-- pessoa de volta. Sem a chave, desfazer uma transferência de empresa morre no
-- mesmo trigger — e o desfazer é justamente o que se procura quando a
-- transferência foi um erro.
CREATE OR REPLACE FUNCTION public.fn_transferencia_desfazer(
  p_transferencia_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_t            public.perfis_transferencias%ROWTYPE;
  v_clone        JSONB;
  v_clones_volta INT := 0;
  v_usuario      TEXT;
  v_colide       BOOLEAN;
BEGIN
  IF NOT public.fn_user_has_any_role(ARRAY['administrador','super_admin']) THEN
    RAISE EXCEPTION 'sem permissão: desfazer transferência é de administrador';
  END IF;

  SELECT * INTO v_t FROM public.perfis_transferencias WHERE id = p_transferencia_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transferência % não encontrada', p_transferencia_id;
  END IF;
  IF v_t.desfeita_em IS NOT NULL THEN
    RAISE EXCEPTION 'esta transferência já foi desfeita em %', v_t.desfeita_em;
  END IF;

  -- Desfazer uma transferência de EMPRESA é atravessar a fronteira de volta:
  -- exige o mesmo cargo que a ida.
  IF v_t.tipo = 'empresa' AND NOT public.fn_user_is_super_admin() THEN
    RAISE EXCEPTION 'sem permissão: desfazer transferência de empresa é de super_admin';
  END IF;

  IF v_t.tipo = 'empresa' THEN
    SELECT usuario INTO v_usuario FROM public.perfis WHERE id = v_t.perfil_id;
    IF v_usuario IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.perfis
         WHERE usuario = v_usuario AND empresa_id = v_t.empresa_id
           AND id <> v_t.perfil_id
      ) INTO v_colide;
      IF v_colide THEN
        RAISE EXCEPTION
          'não dá para desfazer: o login "%" já está em uso na empresa de origem. '
          'Renomeie um dos dois antes.', v_usuario;
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.transferencia_em_curso', 'on', true);

  UPDATE public.perfis
     SET empresa_id = v_t.empresa_id,
         setor_id   = v_t.origem_setor_id,
         equipe_id  = v_t.origem_equipe_id
   WHERE id = v_t.perfil_id;

  PERFORM set_config('app.transferencia_em_curso', 'off', true);

  FOR v_clone IN SELECT * FROM jsonb_array_elements(v_t.clones_removidos)
  LOOP
    INSERT INTO public.equipe_operadores_clones
      (empresa_id, equipe_id, operador_id, conta_recebimento, criado_por)
    VALUES (
      v_t.empresa_id,
      (v_clone->>'equipe_id')::UUID,
      v_t.perfil_id,
      COALESCE((v_clone->>'conta_recebimento')::BOOLEAN, TRUE),
      auth.uid()
    )
    ON CONFLICT DO NOTHING;
    v_clones_volta := v_clones_volta + 1;
  END LOOP;

  UPDATE public.perfis_transferencias
     SET desfeita_em = NOW(), desfeita_por = auth.uid()
   WHERE id = p_transferencia_id;

  RETURN jsonb_build_object(
    'ok',                  TRUE,
    'perfil_id',           v_t.perfil_id,
    'voltou_para_setor',   v_t.origem_setor_id,
    'voltou_para_empresa', v_t.empresa_id,
    'clones_restaurados',  v_clones_volta,
    'acordos_nao_restaurados', v_t.acordos_apagados,
    'relatorio',           v_t.relatorio_arquivo
  );
END $$;

REVOKE ALL ON FUNCTION public.fn_transferencia_desfazer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_desfazer(UUID) TO authenticated;

-- ─── Conferência ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn INT;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_transferencia_mover_empresa';
  IF v_fn = 0 THEN
    RAISE EXCEPTION 'fn_transferencia_mover_empresa não foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.perfis'::regclass AND tgname = 'block_empresa_id_update'
  ) THEN
    RAISE EXCEPTION
      'block_empresa_id_update sumiu de perfis — a fronteira entre as empresas '
      'ficaria aberta. Recrie o trigger antes de seguir.';
  END IF;

  RAISE NOTICE
    'Troca de empresa liberada apenas via fn_transferencia_mover_empresa '
    '(super_admin). O trigger continua barrando todo o resto.';
END $$;
