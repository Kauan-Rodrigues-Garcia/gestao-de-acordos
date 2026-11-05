-- ============================================================================
-- Natal: a agenda do trenzinho — ligado/desligado, horário e a primeira viagem
-- ============================================================================
--
-- Pedido do Cleber, 04/11/2026. Depende de 20261104120000 (a fila e o sorteio).
--
--   1. Ligado ou desligado. Desligado, o trem fica parado na estação «em
--      manutenção», e não há sorteio.
--   2. O horário (padrão 8h às 17h, em Brasília). Passou do fechamento, a
--      volta que estiver acontecendo termina, e o trem fica fechado na estação
--      com a placa «abre às 08:00». A fila continua aberta.
--   3. A primeira viagem: na primeira vez, o trem espera os CINCO PRIMEIROS da
--      fila; quando o quinto entra, a viagem sai e leva esses cinco, na ordem
--      em que entraram. Daí em diante, o ciclo de todo dia (o sorteio de
--      sempre). A fila é por empresa e por regra do setor (Nosso produto e
--      Cofen são trens diferentes — CLAUDE.md), e a primeira viagem também.
--
-- O horário das voltas sai do relógio, no navegador
-- (`src/components/Natal/trem/horario.ts`): as voltas começam em
-- max(abertura do dia, início) e só começa volta antes do fechamento. O banco
-- guarda a agenda e responde por ela.
--
-- ## Tabelas
--
-- `natal_trem_config` — uma linha só (`id = true`): ativo, abre, fecha.
-- `natal_trem_inicio` — por empresa e regra: quando o quinto entrou na fila.
-- As duas com RLS ligado e sem policy: só as funções abaixo mexem nelas.
--
-- ## Funções
--
-- `fn_natal_trem_estado()`                       — a agenda de quem pergunta
--                                                  (authenticated).
-- `fn_natal_trem_configurar(ativo, abre, fecha)` — só o super_admin, como os
--                                                  outros eventos da aba
--                                                  «Eventos e gincanas» (Corrida,
--                                                  Sirene). O tema de Natal ainda
--                                                  é prévia do super_admin.
-- `fn_natal_trem_inscrever(p_entrar)`            — refeita: o quinto da fila
--                                                  grava o início.
-- `fn_natal_trem_passageiros(p_chave)`           — refeita: sem início, ou
--                                                  desligado, não sorteia; a
--                                                  primeira viagem leva os cinco
--                                                  primeiros por ordem de entrada.
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.natal_trem_config (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  ativo          BOOLEAN NOT NULL DEFAULT true,
  abre           TIME    NOT NULL DEFAULT '08:00',
  fecha          TIME    NOT NULL DEFAULT '17:00',
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  CONSTRAINT natal_trem_config_horario CHECK (abre < fecha)
);
ALTER TABLE public.natal_trem_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.natal_trem_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.natal_trem_inicio (
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  regra      TEXT NOT NULL,
  inicio     TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (empresa_id, regra)
);
ALTER TABLE public.natal_trem_inicio ENABLE ROW LEVEL SECURITY;

-- ── Quantos da fila valem (da empresa e da regra), em um lugar só ───────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_na_fila(p_empresa UUID, p_regra TEXT)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT count(*)::INT
    FROM public.natal_trem_inscricoes i
    JOIN public.perfis p ON p.id = i.perfil_id
    LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE p.empresa_id = p_empresa
     AND COALESCE(s.regra, 'nosso_produto') = p_regra
     AND p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado';
$fn$;

-- ── A agenda de quem pergunta ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_estado()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH eu AS (
    SELECT p.empresa_id, COALESCE(s.regra, 'nosso_produto') AS regra
      FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
     WHERE p.id = auth.uid()
  )
  SELECT jsonb_build_object(
           'ativo', c.ativo,
           'abre', to_char(c.abre, 'HH24:MI'),
           'fecha', to_char(c.fecha, 'HH24:MI'),
           'inicio', (SELECT n.inicio FROM public.natal_trem_inicio n WHERE n.empresa_id = eu.empresa_id AND n.regra = eu.regra),
           'inscritos', public.fn_natal_trem_na_fila(eu.empresa_id, eu.regra))
    FROM public.natal_trem_config c, eu
   WHERE c.id;
$fn$;

-- ── O painel (só o super_admin) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_configurar(p_ativo BOOLEAN, p_abre TIME, p_fecha TIME)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT (SELECT public.fn_user_is_super_admin()) THEN
    RAISE EXCEPTION 'NAO_AUTORIZADO: só o super_admin configura o trenzinho' USING ERRCODE = '42501';
  END IF;
  IF p_ativo IS NULL OR p_abre IS NULL OR p_fecha IS NULL THEN
    RAISE EXCEPTION 'Preencha tudo.' USING ERRCODE = '22023';
  END IF;
  IF p_abre >= p_fecha THEN
    RAISE EXCEPTION 'A estação tem de abrir antes de fechar.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.natal_trem_config
     SET ativo = p_ativo, abre = p_abre, fecha = p_fecha, atualizado_em = now(), atualizado_por = auth.uid()
   WHERE id;
  RETURN public.fn_natal_trem_estado();
END;
$fn$;

-- ── Entrar ou sair da fila: o quinto grava o início ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_inscrever(p_entrar BOOLEAN)
RETURNS TABLE(inscrito BOOLEAN, total INT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_empresa UUID;
  v_regra   TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_entrar THEN
    INSERT INTO public.natal_trem_inscricoes (perfil_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
    SELECT p.empresa_id, COALESCE(s.regra, 'nosso_produto')
      INTO v_empresa, v_regra
      FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
     WHERE p.id = auth.uid();
    -- A primeira viagem sai quando a fila chega a cinco (uma vez só por empresa e regra).
    IF v_empresa IS NOT NULL AND public.fn_natal_trem_na_fila(v_empresa, v_regra) >= 5 THEN
      INSERT INTO public.natal_trem_inicio (empresa_id, regra, inicio)
      VALUES (v_empresa, v_regra, now())
      ON CONFLICT DO NOTHING;
    END IF;
  ELSE
    DELETE FROM public.natal_trem_inscricoes WHERE perfil_id = auth.uid();
  END IF;
  RETURN QUERY SELECT * FROM public.fn_natal_trem_inscricao();
END;
$fn$;

-- ── Os passageiros: sem início ou desligado, nada; a primeira leva os cinco primeiros ──

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
  v_empresa  UUID;
  v_regra    TEXT;
  v_dia      DATE;
  v_minuto   BIGINT := floor(extract(epoch FROM now()) / 60)::BIGINT;
  v_lista    UUID[];
  v_primeira BOOLEAN;
BEGIN
  IF v_eu IS NULL OR p_chave IS NULL OR p_chave NOT BETWEEN v_minuto - 30 AND v_minuto + 30 THEN RETURN; END IF;

  SELECT p.empresa_id, COALESCE(s.regra, 'nosso_produto')
    INTO v_empresa, v_regra
    FROM public.perfis p LEFT JOIN public.setores s ON s.id = p.setor_id
   WHERE p.id = v_eu;
  IF v_empresa IS NULL THEN RETURN; END IF;

  SELECT v.passageiros INTO v_lista
    FROM public.natal_trem_viagens v
   WHERE v.empresa_id = v_empresa AND v.regra = v_regra AND v.chave = p_chave;

  IF v_lista IS NULL THEN
    -- Trem desligado, ou a fila ainda sem os cinco primeiros: não há viagem para sortear.
    IF NOT EXISTS (SELECT 1 FROM public.natal_trem_config c WHERE c.id AND c.ativo)
       OR NOT EXISTS (SELECT 1 FROM public.natal_trem_inicio n WHERE n.empresa_id = v_empresa AND n.regra = v_regra) THEN
      RETURN;
    END IF;
    v_primeira := NOT EXISTS (SELECT 1 FROM public.natal_trem_viagens v WHERE v.empresa_id = v_empresa AND v.regra = v_regra);
    v_dia := (to_timestamp(p_chave * 60) AT TIME ZONE 'America/Sao_Paulo')::DATE;
    SELECT COALESCE(array_agg(x.id ORDER BY x.n), '{}') INTO v_lista
      FROM (
        SELECT p.id, row_number() OVER (
                 -- A primeira viagem: os cinco primeiros a entrar na fila, nessa ordem.
                 ORDER BY CASE WHEN v_primeira THEN i.inscrito_em END,
                          -- Depois: primeiro quem ainda não viajou hoje; acabando, quem viajou menos vezes.
                          (SELECT count(*) FROM public.natal_trem_viagens v
                            WHERE v.empresa_id = v_empresa AND v.regra = v_regra AND v.dia = v_dia
                              AND p.id = ANY (v.passageiros)),
                          random()) AS n
          FROM public.natal_trem_inscricoes i
          JOIN public.perfis p ON p.id = i.perfil_id
          LEFT JOIN public.setores s ON s.id = p.setor_id
         WHERE p.empresa_id = v_empresa
           AND COALESCE(s.regra, 'nosso_produto') = v_regra
           AND p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
      ) x
     WHERE x.n <= 5;
    INSERT INTO public.natal_trem_viagens (empresa_id, regra, chave, dia, passageiros)
    VALUES (v_empresa, v_regra, p_chave, v_dia, v_lista)
    ON CONFLICT DO NOTHING;
    -- Se outra pergunta sorteou ao mesmo tempo, vale a dela.
    SELECT v.passageiros INTO v_lista
      FROM public.natal_trem_viagens v
     WHERE v.empresa_id = v_empresa AND v.regra = v_regra AND v.chave = p_chave;
  END IF;

  RETURN QUERY
  SELECT l.ordem::INT, p.id, p.nome::TEXT, p.foto_url::TEXT, s.nome::TEXT
    FROM unnest(v_lista) WITH ORDINALITY AS l(id, ordem)
    JOIN public.perfis p ON p.id = l.id
    LEFT JOIN public.setores s ON s.id = p.setor_id
   ORDER BY l.ordem;
END;
$fn$;

-- Quem já tinha cinco na fila antes desta migration começa agora.
INSERT INTO public.natal_trem_inicio (empresa_id, regra, inicio)
SELECT g.empresa_id, g.regra, now()
  FROM (
    SELECT p.empresa_id, COALESCE(s.regra, 'nosso_produto') AS regra
      FROM public.natal_trem_inscricoes i
      JOIN public.perfis p ON p.id = i.perfil_id
      LEFT JOIN public.setores s ON s.id = p.setor_id
     WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
     GROUP BY 1, 2
    HAVING count(*) >= 5
  ) g
ON CONFLICT DO NOTHING;

REVOKE ALL ON FUNCTION public.fn_natal_trem_na_fila(UUID, TEXT)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_natal_trem_estado()                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_configurar(BOOLEAN, TIME, TIME)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_passageiros(BIGINT)              FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_estado()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_configurar(BOOLEAN, TIME, TIME) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_passageiros(BIGINT)             TO authenticated;

COMMENT ON TABLE public.natal_trem_config IS 'Natal 2026: o trenzinho ligado ou não e o horário da estação (uma linha). Ver a migration 20261104200000.';
COMMENT ON TABLE public.natal_trem_inicio IS 'Natal 2026: quando a fila do trenzinho chegou a cinco, por empresa e regra (a primeira viagem). Ver a migration 20261104200000.';

COMMIT;
