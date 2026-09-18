-- ═══════════════════════════════════════════════════════════════════════════
-- `analitico_removidos` não volta a engolir o banco
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que aconteceu
--
-- De 14 a 18/09/2026 a sincronização do 59 guardou o setor-mês INTEIRO a cada
-- hora, mesmo sem nada ter saído: 522.852 linhas, 609 MB — quase metade do
-- banco (1,29 GB num compute de 2 GB de RAM). A causa foi corrigida na
-- 20260918100000, e em 18/09 ~13:50 UTC as 511.898 cópias foram apagadas
-- (`supabase/sql_scripts/limpeza_analitico_removidos_20260918.sql`): a tabela
-- ficou com 10.954 linhas, 12 MB, e o banco com 697 MB.
--
-- ## A trava
--
-- A correção vale enquanto ninguém reescrever a função. E o histórico de
-- migrations deste projeto está defasado (ver CLAUDE.md): um `create or
-- replace` a partir de um arquivo antigo traz o comportamento antigo de volta
-- sem aviso. Por isso, além da causa, um vigia:
--
-- `fn_analitico_removidos_faxina()`, todo dia às 02:35 (Brasília), apaga a
-- linha guardada que é CÓPIA IDÊNTICA de uma linha que continua viva no
-- analítico — mesma chave e os mesmos valores que a sincronização compara.
-- Isso não é registro de remoção: nada saiu, e restaurá-la esbarraria na linha
-- viva (`on conflict do nothing`).
--
-- Não toca em:
--   - retrato do 58 (`procedencia = relatorio_58`) — é o que o «devolver ao
--     58» repõe;
--   - linha que saiu de fato (não há linha viva com a chave);
--   - versão antiga de linha alterada (algum valor difere da viva);
--   - o que foi restaurado, nem o que foi guardado nas últimas 24 h (o
--     histórico da importação recente continua fechando).
--
-- Em funcionamento normal a faxina não acha nada. Se achar mais de 1.000
-- linhas, grava um AVISO em `logs_sistema` (categoria `sistema`): é o sinal de
-- que a sincronização voltou a guardar o setor inteiro.
--
-- Reexecutável.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

create or replace function public.fn_analitico_removidos_faxina()
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $function$
declare
  v_n integer;
begin
  delete from public.analitico_removidos r
   where r.restaurado_em is null
     and r.removido_em < now() - interval '1 day'
     and r.conteudo ->> 'procedencia' in ('relatorio_59', 'contribuicao_59')
     and exists (
       select 1
         from public.analitico_recebimentos a
        where a.empresa_id       = r.empresa_id
          and a.codigo           = r.codigo
          and a.data_pagamento   = r.data_pagamento
          and a.operador_usuario = r.operador_usuario
          and a.forma_pagamento  = r.conteudo ->> 'forma_pagamento'
          and a.valor_recebido   = r.valor_recebido
          and a.procedencia      = r.conteudo ->> 'procedencia'
          and a.setor_id                 is not distinct from (r.conteudo ->> 'setor_id')::uuid
          and a.operador_id              is not distinct from (r.conteudo ->> 'operador_id')::uuid
          and a.contribuicao_de_setor_id is not distinct from (r.conteudo ->> 'contribuicao_de_setor_id')::uuid
          and a.nome_cliente             is not distinct from r.conteudo ->> 'nome_cliente'
          and a.forma_detalhe            is not distinct from r.conteudo ->> 'forma_detalhe'
          and a.tipo_comissao            is not distinct from r.conteudo ->> 'tipo_comissao'
          and a.instituicao              is not distinct from r.conteudo ->> 'instituicao');
  get diagnostics v_n = row_count;

  if v_n > 1000 then
    begin
      insert into public.logs_sistema (
        acao, categoria, severidade, descricao, tabela, origem, detalhes)
      values ('faxina_analitico_removidos', 'sistema', 'aviso',
        format('A faxina apagou %s cópias idênticas em analitico_removidos. Em funcionamento '
               || 'normal são zero: a sincronização do 59 pode ter voltado a guardar o setor '
               || 'inteiro (ver migration 20260918100000).', v_n),
        'analitico_removidos', 'automatico',
        jsonb_build_object('apagadas', v_n));
    exception when others then
      null;  -- o aviso é conveniência; a faxina já fez o trabalho.
    end;
  end if;

  return v_n;
end;
$function$;

comment on function public.fn_analitico_removidos_faxina() is
  'Apaga de analitico_removidos a copia identica de linha viva do analitico (retrato do 58, '
  'remocao real e versao antiga ficam). Avisa em logs_sistema acima de 1.000. Ver 20260918120000.';

revoke all on function public.fn_analitico_removidos_faxina() from public, anon, authenticated;

do $agenda$
begin
  if exists (select 1 from cron.job where jobname = 'analitico-removidos-faxina') then
    perform cron.unschedule('analitico-removidos-faxina');
  end if;
  -- 05:35 UTC = 02:35 em Brasília. Longe do robô do 59 (minuto :07) e dos
  -- outros jobs da madrugada.
  perform cron.schedule(
    'analitico-removidos-faxina',
    '35 5 * * *',
    'SELECT public.fn_analitico_removidos_faxina();');
end
$agenda$;

commit;
