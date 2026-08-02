-- ═══════════════════════════════════════════════════════════════════════════
-- 20260802c — PaguePlay: nenhum acordo entra sem estado (UF)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pedido da diretoria (02/08/2026): não deve ser possível tabular um acordo da
-- PaguePlay sem escolher o estado, por caminho nenhum.
--
-- "Caminho nenhum" é o ponto. Hoje um acordo nasce por SEIS rotas diferentes:
-- o formulário inline do dashboard, a página de Novo Acordo, o reagendamento de
-- parcela (dois lugares), a importação de Excel, a restauração da lixeira e o
-- fluxo de tabulação do analítico. Validar em cada tela é garantir seis vezes e
-- esquecer na sétima que aparecer. Aqui a regra fica no banco: as telas
-- continuam avisando cedo e bonito, mas quem recusa é o Postgres.
--
-- O gatilho também NORMALIZA: `estado_uf` vazio herda o prefixo `[ESTADO:XX]`
-- de `observacoes`. Isso não é conveniência — é o que mantém os caminhos de
-- reagendamento funcionando: eles copiam `observacoes` do pai e nunca copiaram
-- a coluna. Sem a normalização, reagendar uma parcela passaria a falhar.
--
-- Escopo:
--   • só PaguePlay (a BookPlay não trabalha com UF);
--   • INSERT sempre exige;
--   • UPDATE só recusa APAGAR um estado que existia. Acordo antigo sem estado
--     continua editável e pagável — travar isso quebraria a operação por causa
--     de dado histórico, sem impedir nenhuma tabulação nova.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_acordo_exige_estado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug     TEXT;
  v_prefixo  TEXT;
  v_atual    TEXT;
BEGIN
  SELECT e.slug INTO v_slug FROM public.empresas e WHERE e.id = NEW.empresa_id;
  IF v_slug IS DISTINCT FROM 'pagueplay' THEN
    RETURN NEW;
  END IF;

  -- `estado_uf` é char(2): vem preenchido com espaço, então o TRIM é necessário
  -- para distinguir "sem estado" de "estado gravado".
  v_atual := NULLIF(TRIM(COALESCE(NEW.estado_uf, '')), '');

  IF v_atual IS NULL THEN
    -- Herda do prefixo legado [ESTADO:XX] em observacoes.
    v_prefixo := (regexp_match(COALESCE(NEW.observacoes, ''), '^\[ESTADO:([A-Za-z]{2})\]'))[1];
    IF v_prefixo IS NOT NULL THEN
      NEW.estado_uf := UPPER(v_prefixo);
      v_atual       := UPPER(v_prefixo);
    END IF;
  ELSE
    NEW.estado_uf := UPPER(v_atual);
  END IF;

  IF v_atual IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'Estado (UF) obrigatório: nenhum acordo da PaguePlay pode ser salvo sem o estado do cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- UPDATE: só barra quem está APAGANDO um estado que existia.
  IF NULLIF(TRIM(COALESCE(OLD.estado_uf, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION
      'Estado (UF) obrigatório: não é possível remover o estado de um acordo já tabulado.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acordos_exige_estado ON public.acordos;
CREATE TRIGGER trg_acordos_exige_estado
  BEFORE INSERT OR UPDATE ON public.acordos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_acordo_exige_estado();

COMMENT ON FUNCTION public.fn_acordo_exige_estado() IS
  'PaguePlay: exige estado_uf em todo INSERT de acordo e impede que um estado '
  'existente seja apagado. Normaliza a partir do prefixo [ESTADO:XX] de '
  'observacoes, que é como os fluxos de reagendamento transportam a UF.';

-- Diagnóstico: quantos acordos da PaguePlay ficaram sem estado (histórico).
-- Eles continuam editáveis; a trava vale para o que entra de agora em diante.
SELECT COUNT(*) AS acordos_pagueplay_sem_estado
  FROM public.acordos a
  JOIN public.empresas e ON e.id = a.empresa_id
 WHERE e.slug = 'pagueplay'
   AND NULLIF(TRIM(COALESCE(a.estado_uf, '')), '') IS NULL
   AND COALESCE(a.observacoes, '') !~ '^\[ESTADO:[A-Za-z]{2}\]';
