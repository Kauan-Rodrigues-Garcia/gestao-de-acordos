-- ============================================================================
-- EXECUTADO em 18/09/2026 ~13:50 UTC pelo MCP, com autorização do usuário.
-- NÃO rodar de novo: é registro do que foi feito.
-- ============================================================================
-- Limpeza de `analitico_removidos` depois da 20260918100000.
--
-- Antes: 522.852 linhas, 609 MB (banco 1,29 GB). Quase tudo cópia que a
-- sincronização antiga do 59 guardava de hora em hora, idêntica (mesma chave,
-- mesmo valor) a uma linha que continuava viva no analítico.
--
-- Ficaram 10.954 linhas: os 10.698 retratos do 58 (o «devolver ao 58» os
-- repõe) e 256 remoções reais. Depois: 12 MB; banco 697 MB.
--
-- Por que TRUNCATE + reinserção, e não DELETE + VACUUM FULL: apagar 511.898
-- linhas sujaria as 75 mil páginas da tabela (~600 MB de WAL com as imagens de
-- página, que o leitor do Realtime também percorre) e ainda exigiria o VACUUM
-- FULL para devolver o disco. Separar as 10.954 que ficam, esvaziar e
-- reinserir devolve o espaço na hora e quase não gera WAL. Nenhuma FK,
-- gatilho, view ou publicação depende da tabela (conferido antes).
--
-- A trava abaixo desfazia tudo se a contagem não batesse com a medida antes.
-- ============================================================================

begin;

set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table _manter on commit drop as
  select r.* from public.analitico_removidos r
   where not (
     r.restaurado_em is null
     and r.conteudo ->> 'procedencia' in ('relatorio_59', 'contribuicao_59')
     and exists (select 1 from public.analitico_recebimentos a
                  where a.empresa_id = r.empresa_id and a.codigo = r.codigo
                    and a.data_pagamento = r.data_pagamento
                    and a.operador_usuario = r.operador_usuario
                    and a.forma_pagamento = r.conteudo ->> 'forma_pagamento'
                    and a.valor_recebido = r.valor_recebido));

do $trava$
declare
  v_manter int; v_58 int;
begin
  select count(*), count(*) filter (where conteudo ->> 'procedencia' = 'relatorio_58')
    into v_manter, v_58 from _manter;
  if v_manter not between 10900 and 11100 or v_58 <> 10698 then
    raise exception 'TRAVA: manter=% retratos_58=% — fora do esperado, nada foi apagado', v_manter, v_58;
  end if;
end
$trava$;

truncate public.analitico_removidos;
insert into public.analitico_removidos select * from _manter;
analyze public.analitico_removidos;

commit;
