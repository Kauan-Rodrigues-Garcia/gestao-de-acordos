-- ============================================================================
-- Natal: o trenzinho só para quem tem foto de perfil
-- ============================================================================
--
-- Pedido do Cleber, 05/11/2026. Depende de 20261104120100 e 20261104200100.
--
--   1. Sem foto de perfil, a pessoa não insere o ticket (não entra na fila):
--      `fn_natal_trem_inscrever(true)` recusa com `SEM_FOTO`.
--   2. O sorteio só leva quem tem foto. Quem já estava na fila e tirou a foto
--      fica na fila, mas não é sorteado enquanto estiver sem ela.
--   3. Os cinco primeiros (a primeira viagem) e o «quantos na fila» contam só
--      quem tem foto.
--
-- Um trem só, para o sistema inteiro (Cleber, 05/11/2026): a fila, o sorteio
-- e a primeira viagem são de todas as empresas e das duas regras juntas
-- (ver 20261104120100).
--
-- A foto é lida na hora, de `perfis.foto_url` — não há nada guardado à parte.
-- Quem põe a foto hoje já pode inserir o ticket e já concorre na próxima
-- viagem que for sorteada.
--
-- `fn_natal_trem_inscricao()` e `fn_natal_trem_inscrever()` ganham a coluna
-- `tem_foto` (o tipo de retorno muda: DROP e CREATE).
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── Quantos da fila valem: agora só com foto ────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_na_fila()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT count(*)::INT
    FROM public.natal_trem_inscricoes i
    JOIN public.perfis p ON p.id = i.perfil_id
   WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
     AND NULLIF(btrim(p.foto_url), '') IS NOT NULL;
$fn$;

-- ── Estou na fila? quantos estão? e eu tenho foto? ──────────────────────────

DROP FUNCTION IF EXISTS public.fn_natal_trem_inscrever(BOOLEAN);
DROP FUNCTION IF EXISTS public.fn_natal_trem_inscricao();

CREATE FUNCTION public.fn_natal_trem_inscricao()
RETURNS TABLE(inscrito BOOLEAN, total INT, tem_foto BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.natal_trem_inscricoes i WHERE i.perfil_id = p.id),
         public.fn_natal_trem_na_fila(),
         NULLIF(btrim(p.foto_url), '') IS NOT NULL
    FROM public.perfis p
   WHERE p.id = auth.uid();
$fn$;

-- ── Entrar (só com foto) ou sair da fila; o quinto grava o início ───────────

CREATE FUNCTION public.fn_natal_trem_inscrever(p_entrar BOOLEAN)
RETURNS TABLE(inscrito BOOLEAN, total INT, tem_foto BOOLEAN)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_foto BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_entrar THEN
    SELECT NULLIF(btrim(p.foto_url), '') IS NOT NULL INTO v_foto FROM public.perfis p WHERE p.id = auth.uid();
    IF NOT COALESCE(v_foto, false) THEN
      RAISE EXCEPTION 'SEM_FOTO: só quem tem foto de perfil entra na fila do trenzinho' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.natal_trem_inscricoes (perfil_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
    -- A primeira viagem sai quando a fila chega a cinco (uma vez só, para o sistema inteiro).
    IF public.fn_natal_trem_na_fila() >= 5 THEN
      INSERT INTO public.natal_trem_inicio (id, inicio) VALUES (true, now()) ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    DELETE FROM public.natal_trem_inscricoes WHERE perfil_id = auth.uid();
  END IF;
  RETURN QUERY SELECT * FROM public.fn_natal_trem_inscricao();
END;
$fn$;

-- ── Os passageiros: o mesmo de 20261104200100, só com quem tem foto ─────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_passageiros(p_chave BIGINT)
RETURNS TABLE(ordem INT, perfil_id UUID, nome TEXT, foto_url TEXT, setor_nome TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_eu       UUID := auth.uid();
  v_dia      DATE;
  v_minuto   BIGINT := floor(extract(epoch FROM now()) / 60)::BIGINT;
  v_lista    UUID[];
  v_primeira BOOLEAN;
BEGIN
  IF v_eu IS NULL OR p_chave IS NULL OR p_chave NOT BETWEEN v_minuto - 30 AND v_minuto + 30 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = v_eu) THEN RETURN; END IF;

  SELECT v.passageiros INTO v_lista FROM public.natal_trem_viagens v WHERE v.chave = p_chave;

  IF v_lista IS NULL THEN
    -- Trem desligado, ou a fila ainda sem os cinco primeiros: não há viagem para sortear.
    IF NOT EXISTS (SELECT 1 FROM public.natal_trem_config c WHERE c.id AND c.ativo)
       OR NOT EXISTS (SELECT 1 FROM public.natal_trem_inicio n WHERE n.id) THEN
      RETURN;
    END IF;
    v_primeira := NOT EXISTS (SELECT 1 FROM public.natal_trem_viagens);
    v_dia := (to_timestamp(p_chave * 60) AT TIME ZONE 'America/Sao_Paulo')::DATE;
    SELECT COALESCE(array_agg(x.id ORDER BY x.n), '{}') INTO v_lista
      FROM (
        SELECT p.id, row_number() OVER (
                 -- A primeira viagem: os cinco primeiros a entrar na fila, nessa ordem.
                 ORDER BY CASE WHEN v_primeira THEN i.inscrito_em END,
                          -- Depois: primeiro quem ainda não viajou hoje; acabando, quem viajou menos vezes.
                          (SELECT count(*) FROM public.natal_trem_viagens v
                            WHERE v.dia = v_dia AND p.id = ANY (v.passageiros)),
                          random()) AS n
          FROM public.natal_trem_inscricoes i
          JOIN public.perfis p ON p.id = i.perfil_id
         WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
           -- Só quem tem foto de perfil (lida agora: quem pôs a foto hoje já concorre).
           AND NULLIF(btrim(p.foto_url), '') IS NOT NULL
      ) x
     WHERE x.n <= 5;
    INSERT INTO public.natal_trem_viagens (chave, dia, passageiros)
    VALUES (p_chave, v_dia, v_lista)
    ON CONFLICT DO NOTHING;
    -- Se outra pergunta sorteou ao mesmo tempo, vale a dela.
    SELECT v.passageiros INTO v_lista FROM public.natal_trem_viagens v WHERE v.chave = p_chave;
  END IF;

  RETURN QUERY
  SELECT l.ordem::INT, p.id, p.nome::TEXT, p.foto_url::TEXT, s.nome::TEXT
    FROM unnest(v_lista) WITH ORDINALITY AS l(id, ordem)
    JOIN public.perfis p ON p.id = l.id
    LEFT JOIN public.setores s ON s.id = p.setor_id
   ORDER BY l.ordem;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_natal_trem_na_fila()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_natal_trem_inscricao()         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_passageiros(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscricao()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_passageiros(BIGINT) TO authenticated;

COMMIT;
