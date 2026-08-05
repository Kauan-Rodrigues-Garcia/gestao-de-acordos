-- ═══════════════════════════════════════════════════════════════════════════
-- 20260805a — Foto do setor: destrava o salvamento e cria a foto do Receptivo
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEMA (relatado em 05/08): a foto que os líderes colocam no card do setor
-- em "Desempenho Equipes" não persiste. O upload vai para o storage, o card
-- mostra a imagem, o toast diz "Foto do setor atualizada!" — e ao recarregar
-- a página a foto sumiu.
--
-- CAUSA: a única policy de escrita em `setores` é `setores_admin`
-- (step5_fix_all_rls_use_functions_2026_04_16.sql), restrita a
-- 'administrador' e super admin. `DesempenhoEquipes` é uma aba de líder+,
-- então quem clica no avatar quase nunca é administrador.
--
-- E o UPDATE não dá erro: a RLS FILTRA as linhas em vez de recusar o comando,
-- então o PostgREST devolve sucesso com zero linhas afetadas. O código lia
-- `error === null` como "gravou" e mostrava sucesso. Falha silenciosa.
--
-- SOLUÇÃO: uma função SECURITY DEFINER dedicada. Não dá para resolver com uma
-- policy nova porque RLS filtra LINHAS, não colunas — abrir UPDATE em `setores`
-- para líder deixaria o líder renomear e mover setores também. A função escreve
-- SÓ as duas colunas de foto e devolve quantas linhas mudaram, para a tela
-- poder distinguir "gravou" de "a RLS recusou".
--
-- Quem pode, seguindo o mesmo escopo por setor do resto do sistema
-- (ver 20260723b e 20260804a):
--   • administrador / super_admin / diretoria / gerencia → qualquer setor da empresa;
--   • líder / elite                                      → SOMENTE o próprio setor;
--   • operador e demais                                  → ninguém.

-- ── 1. Coluna da foto do card "Contribuição Receptivo" ──────────────────────
-- Separada de `foto_url` porque são dois cards distintos do mesmo setor: o
-- placar do setor e o card manual do Receptivo. Ficar na tabela `setores` (e
-- não em `contribuicao_receptivo`, que é por MÊS) faz a foto sobreviver à
-- virada do mês em vez de precisar ser reenviada todo dia 1º.
ALTER TABLE public.setores
  ADD COLUMN IF NOT EXISTS foto_receptivo_url TEXT;

COMMENT ON COLUMN public.setores.foto_receptivo_url IS
  'URL pública da foto do card Contribuição Receptivo (bucket perfis, path setores/<id>-receptivo). Persiste entre meses.';

-- ── 2. Quem pode alterar a foto de um setor ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pode_editar_foto_setor(p_setor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p_setor_id IS NOT NULL
    AND (
      public.fn_user_is_super_admin()
      OR (
        -- O setor tem de ser da empresa de quem está editando. Sem isto, um
        -- líder da BookPlay poderia trocar a foto de um setor da PaguePlay:
        -- as duas empresas dividem o mesmo banco.
        EXISTS (
          SELECT 1 FROM public.setores s
          WHERE s.id = p_setor_id
            AND s.empresa_id = public.fn_user_empresa_id()
        )
        AND (
          public.fn_user_has_any_role(ARRAY['administrador','diretoria','gerencia'])
          OR (
            public.fn_user_has_any_role(ARRAY['lider','elite'])
            AND public.fn_user_setor_id() = p_setor_id
          )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.fn_pode_editar_foto_setor(UUID) IS
  'Regra de escrita das fotos do setor. Diretoria/gerência/admin: qualquer setor da empresa. Líder/elite: só o próprio.';

-- ── 3. A escrita em si ──────────────────────────────────────────────────────
-- p_campo aceita 'placar' (setores.foto_url) ou 'receptivo'
-- (setores.foto_receptivo_url). Dois valores fixos, validados aqui — não é
-- SQL dinâmico, então não há superfície de injeção.
--
-- Retorna TRUE só quando uma linha foi realmente atualizada. É esse retorno
-- que a tela usa para não mostrar "salvo!" quando nada foi salvo.
CREATE OR REPLACE FUNCTION public.fn_set_setor_foto(
  p_setor_id UUID,
  p_foto_url TEXT,
  p_campo    TEXT DEFAULT 'placar'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linhas INT;
BEGIN
  IF p_campo NOT IN ('placar', 'receptivo') THEN
    RAISE EXCEPTION 'Campo de foto inválido: %', p_campo
      USING HINT = 'Use ''placar'' ou ''receptivo''.';
  END IF;

  IF NOT public.fn_pode_editar_foto_setor(p_setor_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a foto deste setor.'
      USING ERRCODE = '42501';
  END IF;

  IF p_campo = 'placar' THEN
    UPDATE public.setores SET foto_url = p_foto_url WHERE id = p_setor_id;
  ELSE
    UPDATE public.setores SET foto_receptivo_url = p_foto_url WHERE id = p_setor_id;
  END IF;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  RETURN v_linhas > 0;
END;
$$;

COMMENT ON FUNCTION public.fn_set_setor_foto(UUID, TEXT, TEXT) IS
  'Grava a foto do setor (placar ou receptivo). SECURITY DEFINER porque a policy setores_admin só deixa administrador escrever, e o card é de líder+. Levanta 42501 quando a regra recusa, em vez de gravar zero linhas em silêncio.';

GRANT EXECUTE ON FUNCTION public.fn_pode_editar_foto_setor(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_setor_foto(UUID, TEXT, TEXT)  TO authenticated;

-- ── 4. Diagnóstico ──────────────────────────────────────────────────────────
-- Lista os setores e se já têm cada foto. Serve para conferir, depois de
-- aplicar, que as fotos antigas (as que os líderes acharam ter salvado) de
-- fato não estavam lá.
SELECT
  s.nome                                             AS setor,
  CASE WHEN s.foto_url           IS NULL THEN 'sem foto' ELSE 'ok' END AS placar,
  CASE WHEN s.foto_receptivo_url IS NULL THEN 'sem foto' ELSE 'ok' END AS receptivo
FROM public.setores s
ORDER BY s.nome;
