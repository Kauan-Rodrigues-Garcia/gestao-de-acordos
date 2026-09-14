-- ═══════════════════════════════════════════════════════════════════════════
-- O robô precisa saber se o arquivo já entrou — sem poder ler `mestre_lotes`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O ERP reescreve o 59 de hora em hora, mesmo quando nada mudou. Sem esta
-- consulta o robô subiria 22 mil linhas a cada hora para trocar um retrato por
-- outro idêntico: 24 lotes por dia, cada um substituindo o anterior.
--
-- `mestre_lotes` tem RLS de super_admin, e o robô **não** é super_admin de
-- propósito. Esta função devolve uma coisa só — o hash do lote vigente — para
-- ele comparar com o do arquivo que acabou de ler.
--
-- ## Por que não guardar o hash num arquivo no PC
--
-- Porque o arquivo no PC não sabe o que aconteceu no sistema. Alguém importa
-- pela tela, o robô continua achando que o último hash é outro, e reimporta à
-- toa — ou pior, alguém limpa a pasta e o robô reimporta tudo. O banco é a
-- única fonte que sabe o que está vigente de verdade.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

create or replace function public.fn_mestre_hash_do_lote_vigente(
  p_empresa_id uuid,
  p_mes        text
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ml.arquivo_hash
    from mestre_lotes ml
   where ml.empresa_id = p_empresa_id
     and ml.mes = ((p_mes || '-01')::date)
     and ml.estado = 'vigente'
     and (fn_user_is_super_admin() or fn_user_tem('mestre_importar_automatico'))
   limit 1;
$function$;

comment on function public.fn_mestre_hash_do_lote_vigente(uuid, text) is
  'O hash do arquivo que gerou o lote vigente do mes. Existe para o robo saber '
  'se o 59 mudou antes de subir 22 mil linhas — o ERP reescreve o arquivo de '
  'hora em hora mesmo sem mudanca. Devolve uma coisa so: o robo nao pode ler '
  'mestre_lotes, que e super_admin.';

grant execute on function public.fn_mestre_hash_do_lote_vigente(uuid, text) to authenticated;

commit;
