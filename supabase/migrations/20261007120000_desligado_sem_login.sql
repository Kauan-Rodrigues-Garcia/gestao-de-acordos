-- ============================================================================
-- Desligado não faz login (auditoria, 07/10/2026)
-- ============================================================================
--
-- ## Por que
--
-- O app barra quem está com `situacao = 'desligado'` na TELA (useAuth), mas só
-- depois de o Supabase aceitar a senha e entregar o token. As regras do banco
-- não olham a situação: com o token na mão, a API responde como antes do
-- desligamento. Em 07/10/2026 havia 49 desligados com login liberado, 13 deles
-- com login nos últimos 30 dias. Esses 49 foram bloqueados à mão no mesmo dia.
--
-- ## O que muda
--
-- Gatilho em `perfis`: ao virar `desligado`, o login da pessoa é bloqueado
-- (`auth.users.banned_until = 'infinity'`). Ao sair de `desligado`
-- (readmissão), o login volta (`banned_until = null`). Os dados, o histórico e
-- os meses fechados não mudam: só o acesso.
--
-- A régua é a mesma da tela: só a `situacao`, e super_admin nunca é bloqueado.
-- ============================================================================

create or replace function public.fn_perfis_login_do_desligado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.perfil = 'super_admin' then
    return new;
  end if;

  if new.situacao = 'desligado' and old.situacao is distinct from 'desligado' then
    update auth.users
       set banned_until = 'infinity'
     where id = new.id;
  elsif old.situacao = 'desligado' and new.situacao is distinct from 'desligado' then
    update auth.users
       set banned_until = null
     where id = new.id;
  end if;

  return new;
end $$;

comment on function public.fn_perfis_login_do_desligado() is
  'Desligado não faz login: bloqueia auth.users ao desligar e libera na readmissão. Ver 20261007120000.';

revoke all on function public.fn_perfis_login_do_desligado() from public, anon, authenticated;

drop trigger if exists trg_perfis_login_do_desligado on public.perfis;
create trigger trg_perfis_login_do_desligado
  after update of situacao on public.perfis
  for each row
  when (old.situacao is distinct from new.situacao)
  execute function public.fn_perfis_login_do_desligado();
