-- ═══════════════════════════════════════════════════════════════════════════
-- PIX AUTOMÁTICO — prazo do desaprovado, NR livre de novo e meta por equipe
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Desaprovar avisa o operador por notificação, dizendo o prazo. Antes ele
--    só descobria abrindo a aba e reparando que a linha mudou de cor.
-- 2. Desaprovado vive 2 DIAS ÚTEIS e depois é excluído. O prazo existe para o
--    operador conferir com o líder; passado ele, a linha some sozinha.
-- 3. Excluir um desaprovado (pelo operador, pelo líder ou pelo expurgo) LIBERA
--    o NR: aquele acordo não foi aceito daquela pessoa, mas outra pode fechá-lo
--    depois — e, com o registro histórico preso em 'recusado', o NR ficava
--    inutilizável para sempre em qualquer caminho que consultasse o registro.
-- 4. A UNIQUE da meta de Pix por equipe volta a ser CONSTRAINT.
--
-- Idempotente.

-- ─── 1. Notificação ao desaprovar ────────────────────────────────────────────
-- Só na TRANSIÇÃO para desaprovado: sem o `IS DISTINCT FROM`, qualquer update
-- posterior na linha (marcar pago, editar) renotificaria o mesmo fato.
CREATE OR REPLACE FUNCTION public.fn_pix_notifica_desaprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'desaprovado' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notificacoes (usuario_id, empresa_id, titulo, mensagem, lida, rota)
  VALUES (
    NEW.operador_id,
    NEW.empresa_id,
    'Acordo Pix desaprovado — NR ' || NEW.nr_cliente,
    COALESCE(NEW.avaliado_por_nome, 'O líder')
      || ' desaprovou o acordo Pix do NR ' || NEW.nr_cliente
      || '. Você tem 2 dias úteis para verificar; depois disso o registro é'
      || ' excluído automaticamente e o NR volta a ficar disponível.',
    false,
    '/acordos?tab=pix'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pix_notifica_desaprovacao ON public.pix_automatico_acordos;
CREATE TRIGGER trg_pix_notifica_desaprovacao
  AFTER UPDATE OF status ON public.pix_automatico_acordos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pix_notifica_desaprovacao();

-- ─── 2. Excluir desaprovado devolve o NR ─────────────────────────────────────
-- A versão de 20260721i só apagava o registro 'pendente'. O 'recusado' ficava,
-- e é justamente ele que precisa sair: a recusa é do acordo daquela pessoa, não
-- do NR. 'validado' continua para sempre — esse virou dinheiro.
CREATE OR REPLACE FUNCTION public.fn_pix_nr_apos_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.pix_automatico_nr_registro r
  WHERE r.empresa_id     = OLD.empresa_id
    AND r.nr_normalizado = public.fn_pix_nr_normalizar(OLD.nr_cliente)
    AND r.acordo_id      = OLD.id
    AND r.status IN ('pendente', 'recusado');
  RETURN OLD;
END;
$$;

-- Limpeza dos registros que já ficaram órfãos: recusados cujo acordo não existe
-- mais. Sem isto, os NRs travados antes desta migration continuariam travados.
DELETE FROM public.pix_automatico_nr_registro r
 WHERE r.status = 'recusado'
   AND NOT EXISTS (
     SELECT 1 FROM public.pix_automatico_acordos a WHERE a.id = r.acordo_id
   );

-- ─── 3. Expurgo dos desaprovados vencidos ────────────────────────────────────
-- Dois dias ÚTEIS a partir da avaliação, contando só sábado e domingo como
-- não-úteis. Feriado não entra de propósito: a tabela de feriados é por tenant
-- e por mês (`metas_config`), e o front calcula o mesmo prazo com a mesma regra
-- simples — as duas pontas precisam mostrar e cumprir a MESMA data.
CREATE OR REPLACE FUNCTION public.fn_pix_dias_uteis_apos(p_base TIMESTAMPTZ, p_dias INT)
-- STABLE, não IMMUTABLE: `EXTRACT(DOW FROM timestamptz)` depende do TimeZone da
-- sessão, e prometer imutabilidade a algo que muda com a configuração é o tipo
-- de mentira que só aparece dentro de um índice.
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_data   TIMESTAMPTZ := p_base;
  v_faltam INT := p_dias;
BEGIN
  WHILE v_faltam > 0 LOOP
    v_data := v_data + INTERVAL '1 day';
    IF EXTRACT(DOW FROM v_data) NOT IN (0, 6) THEN
      v_faltam := v_faltam - 1;
    END IF;
  END LOOP;
  RETURN v_data;
END;
$$;

/*
 * Apaga os desaprovados cujo prazo venceu e devolve quantos saíram.
 *
 * SECURITY DEFINER com checagem explícita de empresa e de cargo: a função apaga
 * linhas, então quem não é líder+ da empresa não pode executá-la nem por
 * engano. O DELETE dispara `trg_pix_nr_delete`, que libera o NR.
 *
 * Linha sem `avaliado_em` não é tocada: sem a data da avaliação não há de quando
 * contar o prazo, e apagar por precaução destruiria registro que ninguém avisou.
 */
CREATE OR REPLACE FUNCTION public.fn_pix_expurga_desaprovados(p_empresa_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_apagados INTEGER;
BEGIN
  IF NOT public.fn_can_access_empresa(p_empresa_id)
     OR NOT public.fn_user_has_any_role(
              ARRAY['lider','elite','gerencia','administrador','super_admin'])
  THEN
    RETURN 0;
  END IF;

  WITH apagados AS (
    DELETE FROM public.pix_automatico_acordos a
     WHERE a.empresa_id  = p_empresa_id
       AND a.status      = 'desaprovado'
       AND a.avaliado_em IS NOT NULL
       AND public.fn_pix_dias_uteis_apos(a.avaliado_em, 2) <= NOW()
    RETURNING a.id
  )
  SELECT COUNT(*)::INTEGER INTO v_apagados FROM apagados;

  RETURN COALESCE(v_apagados, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_pix_expurga_desaprovados(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_pix_expurga_desaprovados(UUID) TO authenticated;

-- Varredura do expurgo: acha os vencidos sem ler a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_pix_auto_desaprovado_avaliado
  ON public.pix_automatico_acordos (empresa_id, avaliado_em)
  WHERE status = 'desaprovado';

-- ─── 4. Meta de Pix por equipe: UNIQUE de verdade ────────────────────────────
-- 20260804b trocou a UNIQUE por dois índices PARCIAIS. O `ON CONFLICT
-- (empresa_id, equipe_id, mes, ano)` do upsert não infere índice parcial sem
-- repetir o predicado, e o PostgREST não o repete: salvar meta de equipe falhava
-- com "no unique or exclusion constraint matching the ON CONFLICT
-- specification". Uma CONSTRAINT resolve — `equipe_id` NULL não conflita com
-- nada em UNIQUE, então as linhas antigas de setor continuam convivendo.
DROP INDEX IF EXISTS public.uq_pix_metas_equipe_periodo;

DO $$ BEGIN
  ALTER TABLE public.pix_automatico_metas
    ADD CONSTRAINT uq_pix_metas_equipe_periodo
    UNIQUE (empresa_id, equipe_id, mes, ano);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

COMMENT ON FUNCTION public.fn_pix_expurga_desaprovados(UUID) IS
  'Apaga os acordos Pix desaprovados há mais de 2 dias úteis e devolve a contagem. Chamada ao abrir a aba Pix Automático (não há job agendado).';
