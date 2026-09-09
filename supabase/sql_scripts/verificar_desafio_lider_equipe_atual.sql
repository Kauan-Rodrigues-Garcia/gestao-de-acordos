-- Regressão de leitura: compara o retorno real dos desafios com Usuários > Equipes.
-- Executar como postgres após a migration, no SQL Editor ou via execute_sql.
-- Não grava nem altera os cadastros. Falha se qualquer líder usar equipe antiga.
DO $test$
DECLARE
  v_empresa uuid;
  v_pessoa jsonb;
  v_perfil public.perfis%ROWTYPE;
  v_ids uuid[];
  v_nomes text;
  v_unica uuid;
  v_setor uuid;
  v_testados integer := 0;
BEGIN
  FOR v_empresa IN SELECT id FROM public.empresas LOOP
    FOR v_pessoa IN
      SELECT value FROM jsonb_array_elements(
        public.fn_desafio_pessoas_multi(ARRAY[v_empresa], '{}'::uuid[])
      )
    LOOP
      SELECT * INTO STRICT v_perfil FROM public.perfis
       WHERE id = (v_pessoa->>'id')::uuid;
      IF v_perfil.perfil <> 'lider' THEN
        -- O vínculo explícito não deve deslocar quem é membro de outra equipe.
        IF v_perfil.equipe_id IS NOT NULL
           AND (v_pessoa->>'equipe_id')::uuid IS DISTINCT FROM v_perfil.equipe_id THEN
          RAISE EXCEPTION 'Equipe de membro alterada: %', v_perfil.nome;
        END IF;
        CONTINUE;
      END IF;

      SELECT array_agg(e.id ORDER BY e.nome), string_agg(e.nome, ' · ' ORDER BY e.nome)
        INTO v_ids, v_nomes
        FROM public.equipe_lideres el JOIN public.equipes e ON e.id = el.equipe_id
       WHERE el.lider_id = v_perfil.id AND el.empresa_id = v_empresa
         AND e.setor_id = v_perfil.setor_id;
      IF v_ids IS NULL THEN
        SELECT array_agg(e.id ORDER BY e.nome), string_agg(e.nome, ' · ' ORDER BY e.nome)
          INTO v_ids, v_nomes
          FROM public.equipe_lideres el JOIN public.equipes e ON e.id = el.equipe_id
         WHERE el.lider_id = v_perfil.id AND el.empresa_id = v_empresa;
      END IF;

      IF v_pessoa->>'equipe_nome' IS DISTINCT FROM COALESCE(v_nomes, 'Sem equipe') THEN
        RAISE EXCEPTION 'Equipe incorreta de %: recebido %, esperado %',
          v_perfil.nome, v_pessoa->>'equipe_nome', COALESCE(v_nomes, 'Sem equipe');
      END IF;
      IF v_pessoa->'equipes_lideradas' IS DISTINCT FROM to_jsonb(COALESCE(v_ids, '{}'::uuid[])) THEN
        RAISE EXCEPTION 'Equipes lideradas divergentes: %', v_perfil.nome;
      END IF;

      SELECT CASE WHEN count(DISTINCT el.equipe_id) = 1
                  THEN min(el.equipe_id::text)::uuid END INTO v_unica
        FROM public.equipe_lideres el
       WHERE el.lider_id = v_perfil.id AND el.empresa_id = v_empresa;
      IF (v_pessoa->>'equipe_id')::uuid IS DISTINCT FROM v_unica THEN
        RAISE EXCEPTION 'Equipe principal antiga ou arbitrária: %', v_perfil.nome;
      END IF;
      SELECT COALESCE((SELECT e.setor_id FROM public.equipes e WHERE e.id = v_unica),
                      v_perfil.setor_id) INTO v_setor;
      IF (v_pessoa->>'setor_id')::uuid IS DISTINCT FROM v_setor THEN
        RAISE EXCEPTION 'Setor incorreto: %', v_perfil.nome;
      END IF;
      v_testados := v_testados + 1;
    END LOOP;
  END LOOP;
  IF v_testados = 0 THEN
    RAISE EXCEPTION 'Teste inconclusivo: nenhum líder disponível';
  END IF;
  IF has_function_privilege('anon', 'public.fn_desafio_pessoas_multi(uuid[],uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_desafio_pessoas_multi(uuid[],uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'Helper interno acessível sem os portões das RPCs';
  END IF;
  RAISE NOTICE 'Equipes, setores e vínculos validados para % líderes', v_testados;
END
$test$;
