-- ============================================================================
-- 20260810a — Comemorações: alvo por equipe e clone com setor escolhido
-- ============================================================================
--
-- Duas mudanças no ALVO da comemoração. Nenhuma toca no card, no som ou na
-- biblioteca.
--
-- ── 1. Exibir apenas para a equipe ──────────────────────────────────────────
--
-- Até aqui a comemoração de um operador explodia no SETOR inteiro dele. Setor
-- tem várias equipes, e a meta de uma delas não é notícia para as outras — vira
-- ruído em cima de quem está atendendo. Agora quem monta pode estreitar:
--
--   alvo = operadores + somente_equipe → só as equipes dos homenageados
--   alvo = equipe     + somente_equipe → só aquela equipe
--   alvo = setor                       → não se aplica (é a empresa toda)
--
-- `equipes_alvo` é o análogo de `setores_alvo`: vazio significa "não estreita",
-- e é assim que toda comemoração já existente continua se comportando.
--
-- ── 2. Clone: quem escolhe o setor é quem monta ─────────────────────────────
--
-- A 20260731e resolvia o clone sozinha: `fn_setores_do_operador` UNIA o setor
-- do perfil com os das equipes clonadas, e a comemoração explodia nos dois. O
-- efeito colateral é que ninguém conseguia comemorar num setor só — a festa
-- caía sempre na tela dos dois times, quisesse ou não.
--
-- Essa união automática sai. No lugar entra uma escolha explícita, gravada por
-- homenageado em `comemoracao_homenageados.setores_escolhidos`:
--
--   vazio     → o setor do perfil, e só ele (operador sem clone, caso comum)
--   1 setor   → o que a pessoa escolheu na pergunta
--   N setores → ela respondeu "todos", que é o comportamento antigo, agora
--               deliberado em vez de automático
--
-- `fn_setores_do_operador` CONTINUA existindo: ela é a fonte das opções que a
-- pergunta oferece. O que mudou é que ela não decide mais nada sozinha.
--
-- Idempotente.
-- ============================================================================

-- ── 1. Colunas ──────────────────────────────────────────────────────────────

ALTER TABLE public.comemoracoes
  ADD COLUMN IF NOT EXISTS somente_equipe BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipes_alvo   UUID[]  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.comemoracoes.somente_equipe IS
  'Estreita a plateia do setor para a equipe. Não se aplica a alvo_tipo = '
  'setor, que por definição vale para a empresa inteira.';

COMMENT ON COLUMN public.comemoracoes.equipes_alvo IS
  'Equipes que veem a comemoração. Vazio = não estreita, vale setores_alvo.';

ALTER TABLE public.comemoracao_homenageados
  ADD COLUMN IF NOT EXISTS setores_escolhidos UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.comemoracao_homenageados.setores_escolhidos IS
  'Setores em que ESTE homenageado deve ser comemorado. Vazio = o setor do '
  'perfil dele. Preenchido quando o operador é clone e quem montou escolheu.';

-- ── 2. Equipes do operador ──────────────────────────────────────────────────
--
-- Irmã de `fn_setores_do_operador`: a equipe do perfil mais as equipes em que
-- ele foi clonado. Devolve o setor junto porque é por ele que se cruza com
-- `setores_alvo` — o clone só entra na conta se o setor dele foi escolhido.
--
-- `conta_recebimento` é ignorada aqui pela mesma razão da 20260731e: ela decide
-- se o dinheiro soma para a equipe, não quem trabalha com quem.

CREATE OR REPLACE FUNCTION public.fn_equipes_do_operador(p_operador UUID)
RETURNS TABLE (equipe_id UUID, setor_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.setor_id
    FROM public.perfis p
    JOIN public.equipes e ON e.id = p.equipe_id
   WHERE p.id = p_operador
  UNION
  SELECT e.id, e.setor_id
    FROM public.equipe_operadores_clones c
    JOIN public.equipes e ON e.id = c.equipe_id
   WHERE c.operador_id = p_operador;
$$;

COMMENT ON FUNCTION public.fn_equipes_do_operador(UUID) IS
  'Equipes em que o operador aparece — a do perfil mais as clonadas — com o '
  'setor de cada uma.';

-- ── 3. Alvo direto: equipe e setor ──────────────────────────────────────────
--
-- Continua sendo BEFORE pela razão de sempre (escrever em NEW em vez de dar
-- UPDATE na tabela que disparou o trigger). Ganhou `equipes_alvo`.
--
-- Meta de setor zera `somente_equipe` em vez de recusar: a tela nem oferece a
-- opção, e uma comemoração que some da tela de todo mundo por causa de um
-- campo esquecido é pior que uma que ignora o campo.

CREATE OR REPLACE FUNCTION public.fn_comemoracao_alvo_direto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.alvo_tipo = 'equipe' THEN
    NEW.setores_alvo := COALESCE((
      SELECT ARRAY[e.setor_id] FROM public.equipes e
       WHERE e.id = NEW.equipe_id AND e.setor_id IS NOT NULL
    ), '{}');
    NEW.empresa_inteira := false;
    NEW.equipes_alvo    := CASE WHEN NEW.somente_equipe
                                THEN ARRAY[NEW.equipe_id] ELSE '{}'::UUID[] END;

  ELSIF NEW.alvo_tipo = 'setor' THEN
    -- `setores_alvo` fica preenchido por consistência, mas quem manda aqui é
    -- `empresa_inteira`: meta de setor aparece para a empresa toda.
    NEW.setores_alvo    := ARRAY[NEW.setor_id];
    NEW.empresa_inteira := true;
    NEW.somente_equipe  := false;
    NEW.equipes_alvo    := '{}';

  ELSE
    -- Por operadores: quem preenche é o trigger dos homenageados, que só roda
    -- depois do INSERT da comemoração.
    NEW.empresa_inteira := false;
    NEW.equipes_alvo    := '{}';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comemoracao_alvo_direto ON public.comemoracoes;

-- `somente_equipe` entra na lista de colunas vigiadas: sem isso, ligar a opção
-- num UPDATE não recalcularia `equipes_alvo`.
CREATE TRIGGER trg_comemoracao_alvo_direto
  BEFORE INSERT OR UPDATE OF alvo_tipo, equipe_id, setor_id, somente_equipe
  ON public.comemoracoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_comemoracao_alvo_direto();

-- ── 4. Alvo por operadores: setor escolhido, e equipe se estreitou ──────────
--
-- Duas escritas em sequência, e a ordem importa: `equipes_alvo` é recortado
-- pelos `setores_alvo` que a primeira acabou de gravar. Clone cujo setor não
-- foi escolhido não arrasta a equipe dele junto.
--
-- O trigger continua sendo a única porta de escrita destas duas colunas no
-- alvo por operadores — o cliente escolhe o SETOR, não a plateia.

CREATE OR REPLACE FUNCTION public.fn_comemoracao_setores_alvo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comemoracao UUID := COALESCE(NEW.comemoracao_id, OLD.comemoracao_id);
BEGIN
  UPDATE public.comemoracoes c
     SET setores_alvo = COALESCE((
           SELECT ARRAY(
             SELECT DISTINCT x.setor
               FROM public.comemoracao_homenageados h
               CROSS JOIN LATERAL (
                 -- Escolha explícita de quem montou…
                 SELECT UNNEST(h.setores_escolhidos) AS setor
                 UNION
                 -- …ou, sem escolha, o setor do perfil e SÓ ele. É aqui que a
                 -- união automática dos clones deixou de acontecer.
                 SELECT p.setor_id
                   FROM public.perfis p
                  WHERE p.id = h.operador_id
                    AND COALESCE(ARRAY_LENGTH(h.setores_escolhidos, 1), 0) = 0
               ) x
              WHERE h.comemoracao_id = v_comemoracao
                AND x.setor IS NOT NULL
           )
         ), '{}')
   WHERE c.id = v_comemoracao
     AND c.alvo_tipo = 'operadores';

  UPDATE public.comemoracoes c
     SET equipes_alvo = COALESCE((
           SELECT ARRAY(
             SELECT DISTINCT eq.equipe_id
               FROM public.comemoracao_homenageados h
               CROSS JOIN LATERAL public.fn_equipes_do_operador(h.operador_id) eq
              WHERE h.comemoracao_id = v_comemoracao
                AND eq.setor_id IS NOT NULL
                AND eq.setor_id = ANY (c.setores_alvo)
           )
         ), '{}')
   WHERE c.id = v_comemoracao
     AND c.alvo_tipo = 'operadores'
     AND c.somente_equipe;

  RETURN NULL;
END;
$$;

-- ── 5. Leitura ──────────────────────────────────────────────────────────────
--
-- A policy NÃO ganhou o recorte por equipe, de propósito: `equipes_alvo` é
-- filtro de EXIBIÇÃO (ver `src/pages/Comemoracoes/escopo.ts`), como sempre foi
-- o de setor para quem é líder. Quem está no setor mas em outra equipe segue
-- podendo LER a linha e não vê o card. Estreitar a policy também só mudaria o
-- que aparece no DevTools de quem procurar.
--
-- Nada a fazer aqui — o bloco existe para a decisão ficar registrada onde
-- alguém vai procurar por ela.
