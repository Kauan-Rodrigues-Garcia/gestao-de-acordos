-- ============================================================================
-- Cúpula pertence à EMPRESA, não a um setor
-- ============================================================================
--
-- Diretoria, administrador e super_admin supervisionam a operação inteira. O
-- `setor_id` deles era valor de preenchimento: o formulário de criação escolhia
-- sozinho o primeiro setor da lista e ninguém nunca decidiu aquilo.
--
-- ## Por que isso não era inofensivo
--
-- Duas telas resolvem o setor com `setorId ?? perfil?.setor_id`. O componente
-- pai passava `null` quando a pessoa enxerga todos os setores — e o `??` caía no
-- setor de preenchimento. Resultado: a diretoria via UM setor no Desempenho
-- Equipes, e em Quartis a opção "Todos os setores" voltava calada para um setor
-- só. O oposto do que as duas telas pretendiam.
--
-- Com `setor_id` nulo o `??` não tem para onde cair e a intenção do pai
-- sobrevive.
--
-- ## Por que é seguro
--
--   • `perfis.setor_id` e `perfis.equipe_id` sempre foram nullable — nada no
--     esquema exigia valor;
--   • `ver_todos_setores` é `true` para os três cargos nas DUAS empresas, então
--     todo guarda `if (!setor_id && !verTodosSetores) return` continua passando;
--   • a RLS de `acordos` trata `administrador`/`diretoria` num ramo próprio, que
--     não compara setor nenhum. `perfis_lider_update` compara setor, mas só para
--     lider/elite/gerencia — cargos que continuam tendo setor;
--   • a importação do analítico JÁ obriga a escolher o setor quando quem importa
--     não tem setor ou enxerga todos (`useAnaliticoImport`), então o carimbo do
--     relatório não depende do setor de quem importa. Sem isso, o super_admin da
--     BookPlay que importou 2.535 linhas perderia o carimbo delas.
--
-- Os cargos de cúpula não entram em `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`
-- (operador, elite), logo não aparecem em quartil, ranking nem Painel do Líder.
-- Zerar o vínculo deles não muda número nenhum de recebimento.
--
-- ## O que esta migration NÃO faz
--
-- Não devolve setor a quem for REBAIXADO de cúpula para líder. Essa pessoa fica
-- com setor nulo e precisa de uma transferência explícita — que é a única porta
-- para mover de setor desde a migration 20260805a. Silenciosamente adivinhar um
-- setor no rebaixamento seria reintroduzir exatamente o valor de preenchimento
-- que esta migration está removendo.
-- ============================================================================

-- ── 1. A regra, na gravação ────────────────────────────────────────────────
--
-- Um gatilho BEFORE, e não a correção em cada tela: são seis lugares que
-- escrevem em `perfis` (formulário de usuários, transferências, o gatilho de
-- criação a partir de auth.users, impersonação, seeds e o SQL Editor). Corrigir
-- tela por tela deixa a próxima escrita livre para reintroduzir o problema.

create or replace function public.fn_perfis_escopo_empresa()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  -- A lista é a mesma de `PERFIS_ESCOPO_EMPRESA` em `src/lib/index.ts`. Os dois
  -- lados precisam mudar juntos: divergir aqui é como as quatro listas de
  -- "quem pode autorizar tabulação" divergiram em agosto/2026.
  if new.perfil in ('diretoria', 'administrador', 'super_admin') then
    new.setor_id  := null;
    new.equipe_id := null;
  end if;
  return new;
end;
$function$;

comment on function public.fn_perfis_escopo_empresa() is
  'Cúpula (diretoria/administrador/super_admin) não pertence a setor nem a equipe: zera setor_id e equipe_id na gravação. Espelha PERFIS_ESCOPO_EMPRESA em src/lib/index.ts.';

drop trigger if exists trg_perfis_escopo_empresa on public.perfis;

-- Nome com prefixo que ordena ANTES de `trg_impedir_escalada_de_cargo` e
-- `trg_perfis_updated`: o PostgreSQL dispara gatilhos do mesmo tipo em ordem
-- alfabética, e normalizar o vínculo antes das validações evita que uma delas
-- julgue um valor que vai ser descartado de todo jeito.
create trigger a_trg_perfis_escopo_empresa
  before insert or update on public.perfis
  for each row execute function public.fn_perfis_escopo_empresa();

-- ── 2. Mover quem já existe ────────────────────────────────────────────────
--
-- `trg_log_perfis` (AFTER INSERT/UPDATE/DELETE) registra cada linha alterada em
-- `logs_sistema` com `usuario_id` nulo — o SQL Editor não tem sessão. É a trilha
-- desta migration, e é de propósito que ela venha do gatilho comum em vez de um
-- INSERT à mão: assim aparece na aba Logs com o mesmo formato de qualquer outra
-- alteração de perfil.

do $$
declare
  v_qtd     integer;
  v_restam  integer;
  v_aviso   text;
begin
  update public.perfis
     set setor_id  = null,
         equipe_id = null
   where perfil in ('diretoria', 'administrador', 'super_admin')
     and (setor_id is not null or equipe_id is not null);

  get diagnostics v_qtd = row_count;

  select count(*) into v_restam
    from public.perfis
   where perfil in ('diretoria', 'administrador', 'super_admin')
     and (setor_id is not null or equipe_id is not null);

  if v_restam > 0 then
    raise exception 'ainda restam % perfis de cupula com setor ou equipe', v_restam;
  end if;

  -- `format()` com literais adjacentes: o formato de RAISE tem de ser um
  -- literal, e concatenar com `||` ali é erro de parse (42601) que derruba a
  -- migration antes da primeira linha rodar.
  v_aviso := format(
    'Cupula sem setor/equipe: %s perfis movidos. '
    'A trilha de cada um esta em logs_sistema via trg_log_perfis.',
    v_qtd
  );
  raise notice '%', v_aviso;
end;
$$;

-- ── 3. Rede de segurança declarativa ───────────────────────────────────────
--
-- O gatilho normaliza; o CHECK garante. São papéis diferentes: se algum dia o
-- gatilho for derrubado por outra migration, o CHECK ainda recusa a linha em vez
-- de deixar o valor de preenchimento voltar calado. Como o gatilho é BEFORE, ele
-- roda primeiro e este CHECK nunca dispara na prática — é justamente o que se
-- quer de uma rede.
--
-- Precisa vir DEPOIS do passo 2: um CHECK novo valida as linhas existentes, e
-- com os 7 perfis ainda carimbados ele recusaria a própria migration.

alter table public.perfis
  drop constraint if exists perfis_cupula_sem_vinculo;

alter table public.perfis
  add constraint perfis_cupula_sem_vinculo check (
    perfil not in ('diretoria', 'administrador', 'super_admin')
    or (setor_id is null and equipe_id is null)
  );

comment on constraint perfis_cupula_sem_vinculo on public.perfis is
  'Cúpula pertence à empresa, não a setor/equipe. Rede de segurança do gatilho a_trg_perfis_escopo_empresa.';

-- ── 4. Verificação ─────────────────────────────────────────────────────────

do $$
declare
  v_trg     text;
  v_chk     text;
  v_sobra   integer;
  v_teste   uuid;
begin
  -- O gatilho existe e está ativo. `tgenabled = 'O'` é o padrão (origin);
  -- 'D' seria desabilitado, e um gatilho desabilitado é indistinguível de
  -- ausente para quem confia nele.
  select t.tgname into v_trg
    from pg_trigger t
   where t.tgrelid = 'public.perfis'::regclass
     and t.tgname = 'a_trg_perfis_escopo_empresa'
     and t.tgenabled = 'O';
  if not found then
    raise exception 'gatilho a_trg_perfis_escopo_empresa ausente ou desabilitado';
  end if;

  select con.conname into v_chk
    from pg_constraint con
   where con.conrelid = 'public.perfis'::regclass
     and con.conname = 'perfis_cupula_sem_vinculo'
     and con.convalidated;
  if not found then
    raise exception 'constraint perfis_cupula_sem_vinculo ausente ou nao validada';
  end if;

  select count(*) into v_sobra
    from public.perfis
   where perfil in ('diretoria', 'administrador', 'super_admin')
     and (setor_id is not null or equipe_id is not null);
  if v_sobra <> 0 then
    raise exception 'restaram % perfis de cupula com vinculo', v_sobra;
  end if;

  -- Prova que o gatilho AGE, e não só que existe: pega um setor real e tenta
  -- carimbá-lo nos perfis de cúpula. Com o gatilho, o valor é descartado e as
  -- linhas continuam nulas; sem ele, o CHECK derruba o UPDATE com 23514 e a
  -- exceção sobe. Um gatilho que existe e não faz nada passaria nas duas
  -- verificações acima.
  select s.id into v_teste from public.setores s limit 1;
  if v_teste is not null then
    begin
      update public.perfis
         set setor_id = v_teste
       where perfil in ('diretoria', 'administrador', 'super_admin');

      select count(*) into v_sobra
        from public.perfis
       where perfil in ('diretoria', 'administrador', 'super_admin')
         and setor_id is not null;

      if v_sobra <> 0 then
        raise exception 'o gatilho deixou passar setor em % perfis de cupula', v_sobra;
      end if;

      -- Desfaz a sonda. Este `begin/exception` é uma SUBTRANSAÇÃO: a exceção
      -- sentinela reverte o UPDATE junto com o `atualizado_em` que
      -- `trg_perfis_updated` carimbaria e as linhas que `trg_log_perfis`
      -- inseriria em `logs_sistema`. Sem isso, verificar a migration sujaria a
      -- trilha de auditoria com 7 alterações que nunca aconteceram.
      raise exception 'sonda_ok';
    exception
      when others then
        if sqlerrm <> 'sonda_ok' then raise; end if;
    end;
  end if;

  raise notice 'Cupula sem setor/equipe: gatilho ativo, constraint validada, zero perfis carimbados.';
end;
$$;
