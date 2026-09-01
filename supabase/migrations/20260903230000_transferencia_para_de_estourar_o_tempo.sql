-- ============================================================================
-- Transferência de usuário para de estourar o tempo
-- ============================================================================
--
-- ## O erro
--
--   POST /rest/v1/rpc/fn_transferencia_mover_empresa 500
--   canceling statement due to statement timeout
--
-- Transferir o Matheus (1.118 acordos) morria nos 2 minutos de
-- `statement_timeout`. Não é volume: 1.118 linhas é pouco. É uma chave
-- estrangeira sem índice, e o efeito dela cresce mais rápido que o volume.
--
-- ## O que estava acontecendo, medido
--
-- `analitico_recebimentos.acordo_id` referencia `acordos(id)` com
-- `ON DELETE SET NULL`, e a coluna NÃO TEM ÍNDICE. Nenhum dos nove índices da
-- tabela começa por ela.
--
-- Para cada acordo apagado, o Postgres executa a ação da FK como um comando
-- próprio:
--
--   UPDATE analitico_recebimentos SET acordo_id = NULL WHERE acordo_id = $1;
--
-- Sem índice, isso é uma varredura completa das 38.570 linhas da tabela:
--
--   Seq Scan on analitico_recebimentos (actual time=8.245..8.245 rows=0)
--     Rows Removed by Filter: 38570
--
-- 8,3 ms por acordo × 1.118 acordos já daria 9 segundos. Mas 870 dessas linhas
-- APONTAM para acordos dele — ou seja, a varredura não só lê, também escreve, e
-- cada escrita deixa uma versão morta que a varredura seguinte tem de pular. O
-- custo por acordo sobe ao longo da transação, e o total passa dos 2 minutos.
--
-- É o motivo clássico: chave estrangeira sem índice do lado que referencia.
--
-- ## As duas correções
--
--   1. O índice que faltava. Transforma a varredura em busca direta.
--   2. `fn_admin_apagar_acordos_do_usuario` passa a soltar o vínculo do
--      analítico em UM comando, antes do DELETE. Com o vínculo já nulo, a ação
--      da FK não encontra nada para fazer — o custo deixa de existir em vez de
--      ficar barato.
--
-- A segunda sozinha resolveria; a primeira sozinha também. As duas juntas
-- porque a FK continua valendo para qualquer outro caminho que apague acordo —
-- a lixeira, o expurgo, a exclusão em lote — e nenhum deles deveria depender de
-- lembrar de limpar o analítico antes.
--
-- ## O que NÃO muda
--
-- Nada de comportamento. O vínculo `acordo_id` do analítico já ia para NULL
-- pela ação da FK; agora vai pelo mesmo motivo, só que de uma vez. Nenhuma
-- linha de analítico é apagada — o recebimento continua lá, com operador, valor
-- e data. Some apenas o ponteiro para o acordo que deixou de existir, que é
-- exatamente o que `ON DELETE SET NULL` sempre fez.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

-- ── 1. O índice que faltava ─────────────────────────────────────────────────
--
-- Parcial porque 33.112 das 38.570 linhas têm `acordo_id` nulo — o analítico
-- nasce do relatório do ERP e só ganha vínculo quando alguém tabula. O índice
-- fica com 14% do tamanho e serve igual: a ação da FK procura por
-- `acordo_id = $1`, que implica `IS NOT NULL`.
--
-- Sem CONCURRENTLY de propósito: a tabela tem 24 MB, a criação leva bem menos
-- de um segundo, e CONCURRENTLY não roda dentro de transação — o que tiraria
-- esta migration do all-or-nothing.
CREATE INDEX IF NOT EXISTS idx_analitico_acordo
  ON public.analitico_recebimentos (acordo_id)
  WHERE acordo_id IS NOT NULL;

COMMENT ON INDEX public.idx_analitico_acordo IS
  'Sustenta a FK analitico_recebimentos.acordo_id -> acordos(id), que e '
  'ON DELETE SET NULL. Sem ele, apagar acordo varre a tabela inteira POR '
  'ACORDO — foi o que estourou o statement_timeout na transferencia de '
  'usuario em 03/09/2026.';

-- ── 2. Soltar o vínculo do analítico antes do DELETE ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_admin_apagar_acordos_do_usuario(
  p_user_id UUID, p_empresa_id UUID DEFAULT NULL::UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_apagados       int := 0;
  v_empresa_escopo uuid;
begin
  if not public.fn_user_has_any_role(array['administrador','super_admin']) then
    raise exception 'Sem permissão para apagar acordos de usuário' using errcode = '42501';
  end if;

  if p_empresa_id is null then
    select empresa_id into v_empresa_escopo from public.perfis where id = p_user_id;
    if not found then
      raise exception 'Perfil % não encontrado', p_user_id;
    end if;
  else
    v_empresa_escopo := p_empresa_id;
  end if;

  if not public.fn_can_access_empresa(v_empresa_escopo) then
    raise exception 'Sem permissão para apagar acordos de usuário de outra empresa'
      using errcode = '42501';
  end if;

  -- O acordo do outro operador sobrevive. Só a referência ao transferido sai:
  -- DIRETO fica sem EXTRA; EXTRA continua EXTRA, porém sem DIRETO associado.
  update public.acordos
     set vinculo_operador_id   = null,
         vinculo_operador_nome = null
   where vinculo_operador_id = p_user_id
     and operador_id is distinct from p_user_id
     and (p_empresa_id is null or empresa_id = p_empresa_id);

  /*
   * Solta o vínculo do analítico de UMA vez, antes do DELETE.
   *
   * `analitico_recebimentos.acordo_id` é ON DELETE SET NULL. Deixar a FK fazer
   * isso significa um comando por acordo apagado — 1.118 comandos numa
   * transferência real, cada um deles escrevendo na mesma tabela e deixando
   * versões mortas para o próximo pular. Foi o que estourou o
   * `statement_timeout` em 03/09/2026.
   *
   * Aqui é um comando só, pelo índice `idx_analitico_acordo`. Quando o DELETE
   * roda, a ação da FK não acha mais nada — o custo não fica barato, ele
   * desaparece.
   *
   * NÃO apaga linha de analítico: o recebimento continua com operador, valor e
   * data. Sai só o ponteiro para o acordo que vai deixar de existir, que é o
   * que a FK já fazia.
   */
  update public.analitico_recebimentos ar
     set acordo_id = null
   where ar.acordo_id is not null
     and exists (
       select 1 from public.acordos a
        where a.id = ar.acordo_id
          and a.operador_id = p_user_id
          and (p_empresa_id is null or a.empresa_id = p_empresa_id)
     );

  delete from public.acordos
   where operador_id = p_user_id
     and (p_empresa_id is null or empresa_id = p_empresa_id);
  get diagnostics v_apagados = row_count;

  -- Rastro deixado pelo perfil em acordos de terceiros.
  delete from public.historico_acordos where usuario_id = p_user_id;

  -- Aqui existia `DELETE FROM logs_whatsapp`, que nunca apagou nada (tabela
  -- vazia, hoje removida). NÃO ganhou substituto: a trilha de auditoria é
  -- append-only, e exclusão de usuário não apaga auditoria. Expurgo de trilha
  -- tem caminho próprio, com piso de idade e registro — `fn_logs_expurgar`.

  -- Sobra defensiva: `nr_registros` é índice derivado e não tem FK.
  delete from public.nr_registros nr
   where nr.operador_id = p_user_id
     and not exists (select 1 from public.acordos a where a.id = nr.acordo_id);

  return v_apagados;
end;
$function$;

REVOKE ALL     ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_admin_apagar_acordos_do_usuario(UUID, UUID) IS
  'Apaga os acordos de um usuario e o rastro dele em acordos de terceiros. '
  'Solta o vinculo de analitico_recebimentos ANTES do DELETE, em um comando so '
  '— deixar a FK ON DELETE SET NULL fazer isso linha a linha estourava o '
  'statement_timeout numa transferencia com mais de mil acordos.';

-- ── Prova ───────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_plano TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = 'public.idx_analitico_acordo'::regclass
  ) THEN
    RAISE EXCEPTION 'o indice nao foi criado';
  END IF;

  -- A busca por acordo_id não pode mais ser varredura completa.
  EXECUTE 'EXPLAIN (FORMAT TEXT) SELECT 1 FROM public.analitico_recebimentos '
          'WHERE acordo_id = ''00000000-0000-0000-0000-000000000000''::uuid'
     INTO v_plano;

  IF v_plano ILIKE '%Seq Scan%' THEN
    RAISE WARNING
      'O planejador ainda escolhe Seq Scan para acordo_id (plano: %). Com a '
      'tabela pequena isso pode ser legitimo; rode ANALYZE e confira de novo '
      'se a transferencia continuar lenta.', v_plano;
  ELSE
    RAISE NOTICE 'Busca por acordo_id agora usa indice: %', v_plano;
  END IF;
END
$prova$;

ANALYZE public.analitico_recebimentos;

COMMIT;
