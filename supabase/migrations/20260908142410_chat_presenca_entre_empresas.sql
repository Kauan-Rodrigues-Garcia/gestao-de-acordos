-- Presence acompanha a identidade do perfil, inclusive nas conversas entre
-- empresas. Não concede leitura de conversas, mensagens ou arquivos.
-- Clientes precisam declarar config.private = true para usar este tópico.
create policy chat_presenca_receber
on realtime.messages for select to authenticated
using (
  (select realtime.topic()) = 'presenca-chat'
  and extension in ('presence', 'broadcast')
  and (select public.fn_chat_pode_usar((select auth.uid())))
);

create policy chat_presenca_publicar
on realtime.messages for insert to authenticated
with check (
  (select realtime.topic()) = 'presenca-chat'
  and extension in ('presence', 'broadcast')
  and (select public.fn_chat_pode_usar((select auth.uid())))
);
