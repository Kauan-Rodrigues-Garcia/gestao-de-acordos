-- Cobre a FK usada ao apagar um perfil e elimina o aviso do advisor.
create index if not exists idx_menu_lateral_config_atualizado_por
  on public.menu_lateral_config (atualizado_por)
  where atualizado_por is not null;
