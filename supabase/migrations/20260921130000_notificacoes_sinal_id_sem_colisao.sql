-- ============================================================================
-- O DELETE do sinal de notificação deixa de disputar a chave `id`
-- ============================================================================
--
-- ## O que apareceu na conferência da 20260921120000
--
-- O payload que chega ao cliente tem uma chave `id` que o gatilho não mandou.
-- Ela vem de `realtime.send`:
--
--   IF payload ? 'id' THEN
--     final_payload := payload;                                   -- o nosso fica
--   ELSE
--     final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
--   END IF;
--
-- Ou seja: hoje funciona. O `id` que o DELETE manda (o da notificação) é
-- preservado, e nas outras operações a Supabase injeta o id da MENSAGEM porque
-- não mandamos nada.
--
-- ## Por que mexer mesmo funcionando
--
-- Duas razões, nenhuma teórica:
--
-- 1. `payload.id` passa a significar coisas diferentes conforme a operação — id
--    da mensagem no INSERT/UPDATE/RECARREGAR, id da notificação no DELETE. Quem
--    ler o código depois não tem como adivinhar isso.
--
-- 2. O acerto depende de um `IF` dentro de uma função que não é nossa. Se a
--    Supabase passar a sobrescrever sempre (o caminho mais natural para quem
--    quer garantir rastreabilidade da mensagem), o cliente passa a filtrar a
--    lista por um id que nunca vai casar — e a notificação excluída fica na tela
--    até o próximo F5. Sem erro, sem log, sem sintoma no banco.
--
-- `notificacao_id` não disputa com nada e diz o que é.
--
-- ## Compatibilidade
--
-- O cliente desta mesma entrega lê `notificacao_id` e, se não achar, cai em
-- `id`. Então a ordem entre migration e deploy continua livre, e uma aba com o
-- bundle antigo segue funcionando até recarregar.
--
-- Só troca o corpo da função. Gatilhos, policy e publicação ficam como estão.
--
-- Reexecutável.
-- ============================================================================

begin;

set local lock_timeout = '15s';

create or replace function public.fn_notificacoes_sinal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  lote_max constant integer := 10;
  v_dono   record;
  v_linha  record;
begin
  if tg_op = 'DELETE' then
    for v_dono in
      select a.usuario_id, count(*) as quantas
        from antigas a
       where a.usuario_id is not null
       group by a.usuario_id
    loop
      if v_dono.quantas > lote_max then
        perform realtime.send(
          jsonb_build_object('operacao', 'RECARREGAR'),
          'nova',
          'notificacoes:' || v_dono.usuario_id::text,
          true);
        continue;
      end if;

      for v_linha in
        select a.id from antigas a where a.usuario_id = v_dono.usuario_id
      loop
        -- `notificacao_id`, e não `id`: `realtime.send` usa `id` para a própria
        -- mensagem. Ver o cabeçalho.
        perform realtime.send(
          jsonb_build_object('operacao', 'DELETE', 'notificacao_id', v_linha.id),
          'nova',
          'notificacoes:' || v_dono.usuario_id::text,
          true);
      end loop;
    end loop;

    return null;
  end if;

  -- INSERT e UPDATE: a linha nova é o que a tela precisa.
  for v_dono in
    select n.usuario_id, count(*) as quantas
      from novas n
     where n.usuario_id is not null
     group by n.usuario_id
  loop
    if v_dono.quantas > lote_max then
      perform realtime.send(
        jsonb_build_object('operacao', 'RECARREGAR'),
        'nova',
        'notificacoes:' || v_dono.usuario_id::text,
        true);
      continue;
    end if;

    for v_linha in
      select n.* from novas n where n.usuario_id = v_dono.usuario_id
    loop
      perform realtime.send(
        jsonb_build_object(
          'operacao',    tg_op,
          'notificacao', to_jsonb(v_linha)),
        'nova',
        'notificacoes:' || v_dono.usuario_id::text,
        true);
    end loop;
  end loop;

  return null;
end;
$function$;

comment on function public.fn_notificacoes_sinal() is
  'Gatilho por comando: um Broadcast «nova» por DONO no topico notificacoes:<usuario_id>. '
  'Substitui o Postgres Changes em notificacoes — era 91% das avaliacoes de RLS do Realtime. '
  'DELETE manda `notificacao_id`, nunca `id`: `id` e da mensagem do Realtime. '
  'Ver 20260921120000 e 20260921130000.';

revoke all on function public.fn_notificacoes_sinal() from public, anon, authenticated;

commit;

-- ============================================================================
-- Conferência (só leitura)
-- ============================================================================
--
-- Depois de a primeira exclusão real passar:
--
--   select payload->>'operacao'                         as operacao,
--          (payload->>'notificacao_id') is not null     as tem_chave_nova,
--          payload->>'id' = id::text                    as id_e_o_da_mensagem
--     from realtime.messages
--    where topic like 'notificacoes:%'
--      and payload->>'operacao' = 'DELETE'
--    order by inserted_at desc limit 5;
--   -- esperado: tem_chave_nova = true, id_e_o_da_mensagem = true
-- ============================================================================
