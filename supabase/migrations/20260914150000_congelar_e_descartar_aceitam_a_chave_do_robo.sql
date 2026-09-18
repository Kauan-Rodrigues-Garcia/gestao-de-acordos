-- ═══════════════════════════════════════════════════════════════════════════
-- `congelar_operadores` e `descartar_lote` passam a aceitar a chave do robo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Continuacao de `20260914122912`, que liberou `inserir_linhas` e
-- `promover_lote`. Faltaram duas portas, e o primeiro teste do robo no PC do
-- trabalho (14/09/2026 11:10) achou as duas de uma vez:
--
--   • `fn_mestre_congelar_operadores` roda POR DENTRO de `promover_lote` e tem
--     portao proprio. A promocao abortou com «Apenas super_admin pode congelar
--     operadores do relatorio mestre» depois das 22.274 linhas enviadas.
--   • `fn_mestre_descartar_lote` e a faxina que o cliente chama quando a
--     importacao falha. Tambem so aceitava super_admin — a faxina falhou em
--     silencio e o lote ficou preso em «aberto».
--
-- O lote preso daquele teste e os cinco de 08/09 foram descartados a mao, pelo
-- SQL editor, antes desta migration.
--
-- ## Como a lista foi fechada
--
-- Consulta ao catalogo (14/09): todas as funcoes alcancaveis a partir de
-- `promover_lote` e `descartar_lote` — chamada direta, chamada da chamada e
-- trigger das tabelas tocadas — que citam `fn_user_is_super_admin`. Deram estas
-- duas com o portao `if not fn_user_is_super_admin() then`. As outras que
-- apareceram sao triggers de `perfis`/`setores`, que a importacao nao escreve.
--
-- `congelar_operadores` nao esta no repositorio: nasceu pelo SQL editor. Por
-- isso o patch e o mesmo de `20260914122912` — corpo lido do catalogo, UMA
-- linha trocada, tamanho conferido. Nao ha como retipar o que nao se tem.
--
-- ## O que muda
--
--   antes:  if not fn_user_is_super_admin() then raise
--   depois: if not (fn_user_is_super_admin()
--                   or fn_user_tem('mestre_importar_automatico')) then raise
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
  foreach v_nome in array array['fn_mestre_congelar_operadores', 'fn_mestre_descartar_lote'] loop
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
    -- Uma ocorrencia so, e o resto do corpo identico: mesmo tamanho mais a
    -- diferenca exata dos dois textos.
    if length(v_novo) <> length(v_def) + (length(v_troca) - length(v_velho)) then
      raise exception 'O patch mexeu em mais do que a linha do portao em %.', v_nome;
    end if;

    execute v_novo;
  end loop;
end $$;

-- Verificacao final: as cinco portas do caminho do robo aceitam a chave, e
-- nenhuma perdeu o portao de super_admin.
do $$
declare v_nome text; v_def text;
begin
  foreach v_nome in array array['fn_mestre_abrir_lote', 'fn_mestre_inserir_linhas',
                                'fn_mestre_promover_lote', 'fn_mestre_congelar_operadores',
                                'fn_mestre_descartar_lote'] loop
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
