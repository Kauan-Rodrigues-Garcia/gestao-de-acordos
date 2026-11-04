-- ═══════════════════════════════════════════════════════════════════════════
-- Calendário: a diretoria também pode ser o aniversariante do setor (04/11/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O caso
--
-- Ao lançar um «Aniversário», quem monta o calendário escolhe a pessoa numa
-- lista (`fn_calendario_pessoas`), e a foto dela aparece no dia e em
-- «Aniversariantes». A lista só tinha quem é DO setor
-- (`fn_setores_do_operador`). A diretoria não está em setor nenhum, então o
-- aniversário de um diretor só podia ser lançado como título solto, sem foto.
--
-- ## O que muda
--
-- Só a lista: quem tem o cargo `diretoria` na empresa aparece na lista de todo
-- setor, junto com as pessoas do setor. Lançar continua opcional: aparece no
-- calendário do setor em que alguém lançar.
--
-- Nada mais precisa mudar. `fn_calendario_evento_salvar` já aceita qualquer
-- pessoa da empresa (`p.empresa_id = p_empresa_id`), e `fn_calendario_mes` já
-- traz nome e foto de qualquer `pessoa_id` (LEFT JOIN em `perfis`).
--
-- Mesma assinatura e mesmo retorno: CREATE OR REPLACE basta, nada a derrubar.
-- Quem pode chamar continua o mesmo (`fn_calendario_edita`).
--
-- ## Para desfazer
--
-- Rodar de novo a função de 20261006170000 (seção 5), que não tem o `OR`.

CREATE OR REPLACE FUNCTION public.fn_calendario_pessoas(p_empresa_id UUID, p_setor_id UUID)
RETURNS TABLE(id UUID, nome TEXT, foto_url TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.fn_calendario_edita(p_empresa_id, p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissao para montar o Calendario deste setor.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nome, p.foto_url
    FROM public.perfis p
   WHERE p.empresa_id = p_empresa_id
     AND NOT COALESCE(p.arquivado, FALSE)
     AND p.situacao <> 'desligado'
     AND (
       p_setor_id IN (SELECT s FROM public.fn_setores_do_operador(p.id) AS s)
       -- A diretoria não mora em setor: entra na lista de todos (04/11/2026).
       OR p.perfil = 'diretoria'
     )
   ORDER BY p.nome;
END;
$function$;

COMMENT ON FUNCTION public.fn_calendario_pessoas(UUID, UUID) IS
  'Pessoas ativas do setor, e a diretoria da empresa, para marcar aniversariante no Calendario. '
  'So quem edita. 20261006170000; diretoria em 20261104120000.';
