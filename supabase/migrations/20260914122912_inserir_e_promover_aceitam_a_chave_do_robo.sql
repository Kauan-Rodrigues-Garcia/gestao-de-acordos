-- ═══════════════════════════════════════════════════════════════════════════
-- `inserir_linhas` e `promover_lote` passam a aceitar a chave do robô
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Continuação de `20260914122820`, que já tratou o `abrir_lote`.
--
-- ## Por que o patch é feito pelo próprio banco
--
-- `fn_mestre_promover_lote` tem ~200 linhas e já estourou o tempo uma vez
-- (migration 20260908210000). Retipá-la inteira para trocar UMA linha de portão
-- transcreveria as outras 199 — e é no resto que o erro se esconde, como ficou
-- claro quando decidi NÃO reescrever `fn_mestre_diferenca_detalhe` pelo mesmo
-- motivo.
--
-- Então o corpo é lido do catálogo, a linha do portão é trocada por `replace`, e
-- o resultado é reexecutado. O que não é a linha do portão não tem como mudar.
--
-- A troca é verificada três vezes: a linha antiga tem de existir, a nova tem de
-- aparecer, e o tamanho final tem de ser exatamente o anterior mais a diferença
-- dos dois textos. Qualquer desvio levanta e nada é aplicado.
--
-- ## O que muda no comportamento
--
--   antes:  if not fn_user_is_super_admin() then raise
--   depois: if not (fn_user_is_super_admin()
--                   or fn_user_tem('mestre_importar_automatico')) then raise
--
-- `or`, e não substituição: quem é super_admin continua importando pela tela.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';
set local statement_timeout = '120s';

do $$
declare
  v_nome  text;
  v_def   text;
  v_novo  text;
  v_velho constant text := 'if not fn_user_is_super_admin() then';
  v_troca constant text :=
    'if not (fn_user_is_super_admin() or fn_user_tem(''mestre_importar_automatico'')) then';
begin
  foreach v_nome in array array['fn_mestre_inserir_linhas', 'fn_mestre_promover_lote'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nome;

    if v_def is null then
      raise exception 'Funcao % nao encontrada.', v_nome;
    end if;
    if position(v_velho in v_def) = 0 then
      raise exception 'A linha do portao mudou em % — o patch cego nao se aplica mais.', v_nome;
    end if;

    v_novo := replace(v_def, v_velho, v_troca);

    if position(v_troca in v_novo) = 0 then
      raise exception 'A troca nao produziu o portao novo em %.', v_nome;
    end if;
    -- O resto do corpo tem de continuar identico: mesmo tamanho mais a
    -- diferenca exata dos dois textos.
    if length(v_novo) <> length(v_def) + (length(v_troca) - length(v_velho)) then
      raise exception 'O patch mexeu em mais do que a linha do portao em %.', v_nome;
    end if;

    execute v_novo;
  end loop;
end $$;

-- Verificacao final: as tres portas aceitam a chave, e nenhuma ficou sem portao.
do $$
declare v_nome text; v_def text;
begin
  foreach v_nome in array array['fn_mestre_abrir_lote', 'fn_mestre_inserir_linhas',
                                'fn_mestre_promover_lote'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nome;
    if v_def not like '%mestre_importar_automatico%' then
      raise exception '% ficou sem aceitar a chave do robo.', v_nome;
    end if;
    if v_def not like '%fn_user_is_super_admin%' then
      raise exception '% perdeu o portao de super_admin.', v_nome;
    end if;
  end loop;
end $$;

commit;
