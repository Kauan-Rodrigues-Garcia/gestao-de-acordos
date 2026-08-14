-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813a — Transferência de pessoas: registro, fantasma e desfazer
-- ═══════════════════════════════════════════════════════════════════════════
-- ## O que existia
--
-- Nada. "Transferir" era mudar o campo Setor ou Empresa no modal de editar
-- usuário, e cada um fazia uma coisa diferente sem dizer:
--
--   • trocar de SETOR   → zerava `equipe_id` e mais nada. Os acordos ficavam,
--                         carimbados no setor antigo (`acordos.setor_id`), e
--                         seguiam contando lá para sempre;
--   • trocar de EMPRESA → apagava SEMPRE os acordos da anterior, sem escolha.
--
-- Nenhum dos dois deixava rastro, então não havia como desfazer nem como
-- explicar, um mês depois, por que o número de uma equipe encolheu.
--
-- ## As três coisas que esta tabela resolve
--
-- **1. O fantasma.** O recebimento de quem sai não pode evaporar da equipe de
-- origem no meio do mês. Meses fechados já estão protegidos por `composicao_mes`
-- (20260803c), o retrato mensal — mover alguém hoje não reescreve julho. Mas o
-- mês CORRENTE é lido ao vivo, então a transferência o reescrevia na hora: a
-- pessoa somia da equipe e o card perdia o valor dela.
--
-- Daí `mes` + `fantasma_ativo`: no mês em que a transferência aconteceu, a
-- composição ao vivo recoloca a pessoa na equipe de ORIGEM. Ela aparece marcada
-- como transferida, e a liderança decide se tira. Do mês seguinte em diante a
-- regra normal volta sozinha, sem ninguém precisar lembrar de limpar nada.
--
-- **2. O desfazer.** `origem_*` e `clones_removidos` guardam o estado anterior
-- inteiro. `fn_transferencia_desfazer` recoloca tudo numa transação só.
--
-- O que NÃO volta: acordo apagado. Quando a transferência escolhe "chegar
-- limpo", as tabulações são apagadas para os NRs ficarem livres — é o mesmo
-- caminho da exclusão de usuário (20260805c), com o relatório baixado ANTES de
-- qualquer DELETE. `relatorio_arquivo` guarda o nome do arquivo que foi baixado;
-- ele é o registro, e a tela diz isso antes de confirmar.
--
-- **3. A trilha.** Mudar alguém de empresa mexe em dado de cliente entre dois
-- CNPJs. Tem que ter dono, hora e motivo recuperáveis.
--
-- Idempotente. Tabela pequena: uma linha por transferência.

CREATE TABLE IF NOT EXISTS public.perfis_transferencias (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Empresa de ORIGEM. É ela que sofre o efeito (o fantasma vive nela, os
  -- números que mudam são os dela), então é ela que manda no escopo de leitura.
  empresa_id         UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  perfil_id          UUID NOT NULL REFERENCES public.perfis(id)   ON DELETE CASCADE,

  -- 'yyyy-MM' do mês em que a transferência aconteceu. O fantasma vale SÓ nele:
  -- os anteriores já estão congelados em `composicao_mes` e os seguintes têm de
  -- mostrar a pessoa no lugar novo.
  mes                TEXT NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),

  tipo               TEXT NOT NULL CHECK (tipo IN ('setor', 'empresa')),

  origem_setor_id    UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  origem_equipe_id   UUID REFERENCES public.equipes(id) ON DELETE SET NULL,
  destino_empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  destino_setor_id   UUID REFERENCES public.setores(id) ON DELETE SET NULL,

  -- FALSE = chegou limpo: relatório baixado e tabulações apagadas.
  -- TRUE  = levou tudo, vínculos (EXTRA/pareado) preservados.
  levou_acordos      BOOLEAN NOT NULL,
  acordos_apagados   INTEGER NOT NULL DEFAULT 0,
  relatorio_arquivo  TEXT,

  -- Equipes em que a pessoa era clone, para o desfazer recolocar. Um clone
  -- pendurado depois da transferência faz ela continuar contando no setor
  -- emprestado — o defeito que a limpeza dos clones evita.
  -- Formato: [{"equipe_id": "...", "conta_recebimento": true}, ...]
  clones_removidos   JSONB NOT NULL DEFAULT '[]'::JSONB,

  fantasma_ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  fantasma_removido_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
  fantasma_removido_em  TIMESTAMPTZ,

  desfeita_em        TIMESTAMPTZ,
  desfeita_por       UUID REFERENCES public.perfis(id) ON DELETE SET NULL,

  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por         UUID REFERENCES public.perfis(id) ON DELETE SET NULL
);

-- A leitura quente: toda montagem de composição do mês corrente pergunta
-- "quem saiu daqui neste mês e ainda tem fantasma?". Índice parcial porque
-- transferência desfeita e fantasma removido não interessam a essa pergunta —
-- e são a maioria das linhas com o tempo.
CREATE INDEX IF NOT EXISTS idx_transferencias_fantasma
  ON public.perfis_transferencias (empresa_id, mes)
  WHERE desfeita_em IS NULL AND fantasma_ativo;

-- Histórico da pessoa e "qual foi a última", que é a que o desfazer alcança.
CREATE INDEX IF NOT EXISTS idx_transferencias_perfil
  ON public.perfis_transferencias (perfil_id, criado_em DESC);

ALTER TABLE public.perfis_transferencias ENABLE ROW LEVEL SECURITY;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Chamadas de sessão embrulhadas em (SELECT ...) para virarem InitPlan — mesmo
-- padrão de 20260726a/20260812e.

-- Leitura: as DUAS pontas. A empresa de origem precisa (é onde o fantasma
-- aparece e onde os números mudaram) e a de destino também — senão o admin que
-- recebeu a pessoa não consegue nem ver de onde ela veio, muito menos desfazer.
DROP POLICY IF EXISTS "transferencias_select" ON public.perfis_transferencias;
CREATE POLICY "transferencias_select" ON public.perfis_transferencias
  FOR SELECT USING (
    (SELECT public.fn_user_is_super_admin())
    OR empresa_id         = (SELECT public.fn_user_empresa_id())
    OR destino_empresa_id = (SELECT public.fn_user_empresa_id())
  );

-- Registro: quem pode mexer no perfil pode registrar a transferência dele.
-- Manter os dois públicos iguais é o que impede uma transferência de acontecer
-- SEM registro: se a política daqui fosse mais estreita que a de `perfis`, o
-- UPDATE passaria e o INSERT falharia, deixando exatamente o estado sem rastro
-- que esta tabela existe para acabar.
DROP POLICY IF EXISTS "transferencias_insert" ON public.perfis_transferencias;
CREATE POLICY "transferencias_insert" ON public.perfis_transferencias
  FOR INSERT WITH CHECK (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id         = (SELECT public.fn_user_empresa_id())
      OR destino_empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

-- UPDATE existe por UM motivo: o líder desligar o fantasma da equipe dele.
--
-- RLS não restringe coluna, então esta política também deixaria carimbar
-- `desfeita_em` na mão. Isso não desfaz nada — o desfazer de verdade reescreve
-- `perfis`, `equipe_operadores_clones` e `acordos`, e mora em
-- `fn_transferencia_desfazer`, que cobra cargo de administrador. O pior efeito
-- de um carimbo mentiroso aqui é a linha sumir da lista de "pode desfazer", e o
-- histórico continua íntegro.
DROP POLICY IF EXISTS "transferencias_update" ON public.perfis_transferencias;
CREATE POLICY "transferencias_update" ON public.perfis_transferencias
  FOR UPDATE USING (
    ((SELECT public.fn_user_is_super_admin())
      OR empresa_id = (SELECT public.fn_user_empresa_id()))
    AND (SELECT public.fn_user_has_any_role(
           ARRAY['lider','elite','gerencia','diretoria','administrador','super_admin']))
  );

-- Sem política de DELETE de propósito. O registro de uma transferência é a
-- única prova de que ela aconteceu; desfazer é `desfeita_em`, não sumir com a
-- linha. Mesma escolha de 20260812e pelo motivo inverso: lá a linha não tinha o
-- que guardar, aqui ela guarda o que não pode ser perdido.

-- ─── Desfazer ───────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER porque precisa reescrever `perfis` de DUAS empresas na mesma
-- transação (a de origem e a de destino), e nenhuma sessão enxerga as duas —
-- `fn_user_empresa_id()` é uma só. O cargo é conferido aqui dentro, na primeira
-- linha, e `search_path` fixo fecha o caminho de sequestro de nome.
--
-- Só administrador e super_admin. Transferência de empresa cruza CNPJ; desfazer
-- é a mesma operação ao contrário.
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

  -- O login volta para uma empresa onde ele já existe de novo?
  -- `idx_perfis_usuario_empresa` é UNIQUE (usuario, empresa_id): sem esta
  -- checagem o desfazer estoura com erro cru do Postgres na cara do admin.
  -- O caso é real — `robson_cofen` existe nas duas empresas hoje.
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

  -- Estado anterior de volta. `equipe_id` sai junto: ele foi zerado na ida.
  UPDATE public.perfis
     SET empresa_id = v_t.empresa_id,
         setor_id   = v_t.origem_setor_id,
         equipe_id  = v_t.origem_equipe_id
   WHERE id = v_t.perfil_id;

  -- Clones que a ida removeu. ON CONFLICT porque desfazer duas vezes em
  -- corrida não pode virar linha duplicada.
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
    'ok',                TRUE,
    'perfil_id',         v_t.perfil_id,
    'voltou_para_setor', v_t.origem_setor_id,
    'voltou_para_empresa', v_t.empresa_id,
    'clones_restaurados', v_clones_volta,
    -- Quem chama TEM de mostrar isto: é o que o desfazer não alcança.
    'acordos_nao_restaurados', v_t.acordos_apagados,
    'relatorio', v_t.relatorio_arquivo
  );
END $$;

REVOKE ALL ON FUNCTION public.fn_transferencia_desfazer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_transferencia_desfazer(UUID) TO authenticated;

-- ─── Auditoria (Logs 2.0, 20260812a) ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_log_auditoria'
  ) THEN
    DROP TRIGGER IF EXISTS trg_log_perfis_transferencias ON public.perfis_transferencias;
    CREATE TRIGGER trg_log_perfis_transferencias
      AFTER INSERT OR UPDATE ON public.perfis_transferencias
      FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria(
        -- `usuario`, singular: é o valor que `logs_sistema_categoria_check`
        -- aceita. No plural o CHECK derruba o INSERT, e como o trigger é AFTER
        -- na mesma transação, derruba a transferência inteira junto.
        'usuario',                  -- categoria
        'transferencia_usuario',    -- slug da ação
        'a transferência',          -- substantivo da frase
        'tipo,mes',                 -- colunas do rótulo
        '',                         -- ignorar
        'empresa_id',               -- coluna do tenant
        'aviso'                     -- severidade
      );
  ELSE
    RAISE NOTICE 'fn_log_auditoria ausente (20260812a não aplicada) — transferências ficam sem trilha.';
  END IF;
END $$;

-- ─── Conferência ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_politicas INT;
  v_funcao    INT;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'perfis_transferencias';

  IF v_politicas < 3 THEN
    RAISE EXCEPTION
      'perfis_transferencias com % política(s) — esperado ao menos 3 '
      '(select/insert/update).', v_politicas;
  END IF;

  SELECT count(*) INTO v_funcao
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_transferencia_desfazer';

  IF v_funcao = 0 THEN
    RAISE EXCEPTION 'fn_transferencia_desfazer não foi criada.';
  END IF;

  RAISE NOTICE
    'perfis_transferencias pronta: % políticas + desfazer. Tabela vazia — '
    'nenhum número muda até a primeira transferência.', v_politicas;
END $$;
