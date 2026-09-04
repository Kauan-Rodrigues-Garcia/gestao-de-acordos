-- ============================================================================
-- Backfill: congelar o operador nos lotes que já estão vigentes
--
-- `fn_mestre_congelar_operadores` roda na promoção, mas o lote de agosto/2026 da
-- BookPlay foi promovido antes dela existir. Sem este preenchimento, aquele mês
-- fica com `operador_setor_id` nulo e o empréstimo não enxerga nada — o 59
-- continuaria contando pela carteira exatamente no mês que usamos para provar
-- que a carteira está errada.
--
-- ---- Sobre usar o cadastro de hoje -----------------------------------------
--
-- Congelar é gravar o cadastro do momento da promoção, e esse momento passou.
-- Para o que já está no banco, o cadastro de HOJE é a única fonte que existe —
-- não há histórico de `perfis.setor_id` para reconstruir 31/08.
--
-- Isso é aceitável aqui e não vira precedente: a conferência de agosto foi feita
-- contra este mesmo cadastro, uma a uma, e o resultado casou ao centavo com o
-- ajuste manual que a Brenda lançou em 31/08 (seis pessoas, R$ 36.733,36, motivo
-- `playmix`). Ou seja: o cadastro de hoje e o de 31/08 concordam para as pessoas
-- que importam. Do próximo lote em diante, a promoção congela sozinha e a
-- pergunta não se repete.
--
-- Escreve `operador_id` e `operador_setor_id` em linhas de lote VIGENTE cuja
-- `Cobradora` casa com um `perfis.usuario` da mesma empresa. Não toca em mais
-- nada: nem valor, nem carteira, nem vínculo de grupo. Linha de operador sem
-- cadastro continua nula, e sem cadastro ela fica na carteira mesmo.
--
-- Rollback: update mestre_recebimentos set operador_id = null,
--           operador_setor_id = null where operador_id is not null;
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '300s';

update public.mestre_recebimentos r
   set operador_id       = p.id,
       operador_setor_id = p.setor_id
  from public.perfis p,
       public.mestre_lotes l
 where l.id = r.lote_id
   and l.estado = 'vigente'
   and r.cobradora <> ''
   and p.empresa_id = r.empresa_id
   and lower(p.usuario) = lower(r.cobradora)
   and r.operador_id is null;

COMMIT;
