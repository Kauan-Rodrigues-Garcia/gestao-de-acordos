-- ============================================================================
-- Natal: a fila do trenzinho e os cinco passageiros de cada viagem
-- ============================================================================
--
-- Pedido do Cleber, 04/11/2026. O trenzinho de Natal sai da estação do
-- Dashboard a cada viagem levando cinco pessoas sorteadas, uma de cada vez,
-- de surpresa. Quem quer viajar se inscreve UMA vez, clicando na estação; daí
-- em diante entra em todos os sorteios. Ninguém repete no mesmo dia — a não
-- ser que todo mundo da fila já tenha viajado (aí volta quem viajou menos).
--
-- ## Um trem só, para o sistema inteiro
--
-- Decisão do Cleber, 05/11/2026: «tem que ser o mesmo tempo e o mesmo sorteio
-- para todos» — todas as empresas e as duas regras (Nosso produto e Cofen)
-- juntas. Uma fila, um sorteio por viagem, os mesmos cinco na tela de todo
-- mundo. Nome, foto e nome do setor dos sorteados aparecem para qualquer
-- pessoa do sistema, de qualquer empresa (o Cleber escolheu isso sabendo).
-- As abas também são as mesmas para as duas regras: Dashboard, Acordos e
-- Analítico (`src/components/Natal/trem/rota.ts`; o Pix saiu em 05/11/2026).
--
-- ## Por que no banco
--
-- O sorteio tem de sair igual para todo mundo, e lembrar quem já viajou no
-- dia — então ele é GRAVADO: a primeira pessoa que pergunta pela viagem sorteia, e
-- as outras leem o que ficou gravado. Corrida entre duas perguntas ao mesmo
-- tempo: `ON CONFLICT DO NOTHING` e a releitura deixam valer a primeira.
-- No navegador também não daria: `perfis_select` mostra a cada um só o
-- próprio alcance.
--
-- ## Tabelas
--
-- `natal_trem_inscricoes` — quem está na fila (a pessoa e quando entrou).
-- `natal_trem_viagens`    — o sorteio de cada viagem: a chave (o minuto da
--                           partida, `chaveDoSorteio` em
--                           `src/components/Natal/trem/horario.ts`), o dia
--                           (Brasília) e os cinco, em ordem de embarque.
-- As duas com RLS ligado e sem policy: só as funções abaixo mexem nelas.
--
-- ## Funções (todas para `authenticated`)
--
-- `fn_natal_trem_inscricao()`            — estou na fila? e quantos estão.
-- `fn_natal_trem_inscrever(p_entrar)`    — entra (true) ou sai (false).
-- `fn_natal_trem_passageiros(p_chave)`   — os passageiros da viagem; sorteia
--                                          na primeira pergunta.
--
-- Quem viaja: os inscritos ativos, não arquivados e não desligados, de
-- qualquer empresa e regra. Primeiro quem ainda não viajou no dia; acabando
-- esses, completa com quem viajou menos vezes (pedido do Cleber, 04/11/2026).
--
-- Limite: só viagens a até 30 minutos de agora (a volta do trem tem ~5 min).
--
-- Antes de aplicar: esta migration nunca foi aplicada até 05/11/2026, e a
-- versão de antes separava por empresa e regra. Se `natal_trem_viagens` já
-- existir com as colunas `empresa_id`/`regra`, ela NÃO serve — conferir com
-- `to_regclass('public.natal_trem_viagens')` antes.
--
-- Reaplicável.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- A versão desta migration que nunca foi aplicada tinha outra assinatura.
DROP FUNCTION IF EXISTS public.fn_natal_trem_passageiros(BIGINT[]);

CREATE TABLE IF NOT EXISTS public.natal_trem_inscricoes (
  perfil_id   UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
  inscrito_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.natal_trem_inscricoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.natal_trem_viagens (
  chave       BIGINT PRIMARY KEY,
  dia         DATE   NOT NULL,
  passageiros UUID[] NOT NULL,
  sorteado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS natal_trem_viagens_do_dia ON public.natal_trem_viagens (dia);
ALTER TABLE public.natal_trem_viagens ENABLE ROW LEVEL SECURITY;

-- ── Estou na fila? ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_inscricao()
RETURNS TABLE(inscrito BOOLEAN, total INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.natal_trem_inscricoes i WHERE i.perfil_id = auth.uid()),
         (SELECT count(*)::INT
            FROM public.natal_trem_inscricoes i
            JOIN public.perfis p ON p.id = i.perfil_id
           WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado')
   WHERE auth.uid() IS NOT NULL;
$fn$;

-- ── Entrar ou sair da fila ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_inscrever(p_entrar BOOLEAN)
RETURNS TABLE(inscrito BOOLEAN, total INT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_entrar THEN
    INSERT INTO public.natal_trem_inscricoes (perfil_id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.natal_trem_inscricoes WHERE perfil_id = auth.uid();
  END IF;
  RETURN QUERY SELECT * FROM public.fn_natal_trem_inscricao();
END;
$fn$;

-- ── Os passageiros de uma viagem (sorteia na primeira pergunta) ─────────────

CREATE OR REPLACE FUNCTION public.fn_natal_trem_passageiros(p_chave BIGINT)
RETURNS TABLE(ordem INT, perfil_id UUID, nome TEXT, foto_url TEXT, setor_nome TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_eu     UUID := auth.uid();
  v_dia    DATE;
  v_minuto BIGINT := floor(extract(epoch FROM now()) / 60)::BIGINT;
  v_lista  UUID[];
BEGIN
  IF v_eu IS NULL OR p_chave IS NULL OR p_chave NOT BETWEEN v_minuto - 30 AND v_minuto + 30 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.perfis p WHERE p.id = v_eu) THEN RETURN; END IF;

  SELECT v.passageiros INTO v_lista FROM public.natal_trem_viagens v WHERE v.chave = p_chave;

  IF v_lista IS NULL THEN
    v_dia := (to_timestamp(p_chave * 60) AT TIME ZONE 'America/Sao_Paulo')::DATE;
    SELECT COALESCE(array_agg(x.id), '{}') INTO v_lista
      FROM (
        SELECT p.id
          FROM public.natal_trem_inscricoes i
          JOIN public.perfis p ON p.id = i.perfil_id
         WHERE p.ativo AND NOT p.arquivado AND p.situacao <> 'desligado'
         -- Primeiro quem ainda não viajou hoje; acabando, quem viajou menos vezes.
         ORDER BY (SELECT count(*) FROM public.natal_trem_viagens v
                    WHERE v.dia = v_dia AND p.id = ANY (v.passageiros)),
                  random()
         LIMIT 5
      ) x;
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

REVOKE ALL ON FUNCTION public.fn_natal_trem_inscricao()            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_natal_trem_passageiros(BIGINT)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscricao()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_inscrever(BOOLEAN)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_natal_trem_passageiros(BIGINT) TO authenticated;

COMMENT ON TABLE public.natal_trem_inscricoes IS 'Natal 2026: quem entrou na fila do trenzinho (uma fila só, todas as empresas). Ver a migration 20261104120100.';
COMMENT ON TABLE public.natal_trem_viagens IS 'Natal 2026: o sorteio gravado de cada viagem do trenzinho, um só para o sistema inteiro (ninguém repete no dia). Ver a migration 20261104120100.';

COMMIT;
