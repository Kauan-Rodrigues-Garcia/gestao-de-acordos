-- Modo TV — fase 2, primeira parte: fundo e relógio.
--
-- Duas fontes novas. O CHECK de `tv_fontes.tipo` é uma lista fechada de
-- propósito (tipo desconhecido não desenha nada e some da tela sem erro), então
-- ampliar a lista é o que libera as duas.
--
-- ## Por que estas duas primeiro
--
-- FUNDO é o que separa "tela preta com coisas em cima" de tela acabada. Ele
-- nasce na camada mais baixa — ver `adicionarFonte` — porque adicionar um fundo
-- e ver a cena inteira sumir atrás dele é o comportamento literal de "a última
-- fonte fica na frente", e ninguém espera isso de algo chamado fundo.
--
-- RELÓGIO é a fonte que prova que a tela está VIVA. Uma parede com ranking
-- parado é indistinguível de uma parede congelada; com o relógio andando, quem
-- passa sabe que o sistema está de pé. Ele lê a hora de São Paulo e não a do
-- PC: a máquina da TV pode estar com o fuso errado e ninguém repararia, mas o
-- relógio errado na parede todo mundo repara.
--
-- Nenhuma chave de permissão nova: quem monta cena já é `tv_editar_cenas`.

ALTER TABLE public.tv_fontes
  DROP CONSTRAINT IF EXISTS tv_fontes_tipo;

ALTER TABLE public.tv_fontes
  ADD CONSTRAINT tv_fontes_tipo
  CHECK (tipo IN ('texto', 'imagem', 'ranking', 'meta', 'fundo', 'relogio'));

COMMENT ON COLUMN public.tv_fontes.tipo IS
  'Lista fechada. Tipo fora dela nao desenha nada e sumiria da tela sem erro '
  'nenhum, entao o CHECK e o que transforma isso em falha visivel no cadastro.';

-- `fn_tv_palco` não muda: fundo e relógio desenham a partir do `config` e não
-- consultam dado nenhum, então caem no `ELSE NULL` do CASE que já existe.
