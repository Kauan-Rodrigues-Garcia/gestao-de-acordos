-- ═══════════════════════════════════════════════════════════════════════════
-- 20260730e — Diretório mínimo de pessoas (nome + foto) para a aba
-- ═══════════════════════════════════════════════════════════════════════════
-- Sintoma: operador marcado como responsável não vê de quem é a solicitação —
-- nem nome, nem foto, nem no chat.
--
-- Causa: a policy `perfis_select` (11_tenant_lockdown) permite ler OUTRO perfil
-- apenas para 'lider', 'administrador' e super_admin:
--
--     auth.uid() = id
--     OR (fn_can_access_empresa(empresa_id)
--         AND fn_user_has_any_role(ARRAY['lider','administrador']))
--     OR fn_user_is_super_admin()
--
-- A aba trazia nome/foto por join embutido em `perfis`, e join no PostgREST
-- respeita a RLS da tabela juntada: para operador, elite, gerência e diretoria
-- o join volta NULO. Não é bug da aba, é a policy fazendo o trabalho dela.
--
-- Correção: NÃO afrouxar `perfis_select` — ela protege e-mail, cargo, setor,
-- situação, e é usada pelo app inteiro. Em vez disso, uma função que devolve
-- só o que a tela precisa para identificar uma pessoa: id, nome e foto.
--
-- O que isto expõe: nome e foto dos colegas da MESMA empresa, para usuários
-- autenticados dessa empresa. É o mesmo que já aparece no chat, na presença
-- (quem está online) e no cabeçalho do sistema. Nada de e-mail, cargo, setor
-- ou qualquer outra coluna.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.fn_wpp_diretorio()
RETURNS TABLE (
  id       UUID,
  nome     TEXT,
  foto_url TEXT
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.foto_url
  FROM public.perfis p
  WHERE p.empresa_id = public.fn_user_empresa_id()
  -- Inclui desligados de propósito: pedido antigo de quem saiu da empresa
  -- continua tendo que mostrar o nome de quem abriu.
$$;

REVOKE ALL ON FUNCTION public.fn_wpp_diretorio() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_wpp_diretorio() TO authenticated;

COMMENT ON FUNCTION public.fn_wpp_diretorio() IS
  'Diretório mínimo (id, nome, foto_url) dos usuários da empresa do chamador. '
  'Existe porque perfis_select só deixa lider/administrador lerem outros perfis, '
  'e a aba de Solicitar Atendimento precisa mostrar de quem é cada pedido.';
