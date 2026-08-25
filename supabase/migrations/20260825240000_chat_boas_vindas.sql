-- ============================================================================
-- Chat — as boas-vindas que aparecem uma vez
-- ============================================================================
--
-- Antes de abrir a primeira conversa, a pessoa le um cartao curto: para que o
-- chat serve, que o historico fica, e que o CPF sai sozinho em 12 horas. Clica
-- em «Entendi» e nao ve mais.
--
-- ## Coluna, e nao localStorage
--
-- localStorage some quando a pessoa troca de maquina, limpa o navegador ou
-- entra pelo celular — e ela veria o mesmo aviso de novo, como se o sistema
-- nao guardasse nada. Pior: nao ficaria registro de que ela leu.
--
-- ## Data, e nao booleano
--
-- Os irmaos desta coluna em `perfis` sao booleanos (`viu_notificacao_chatplay`,
-- `senha_alterada`). Aqui vale a data: saber QUANDO alguem concordou custa os
-- mesmos bytes e responde uma pergunta a mais. `NULL` = ainda nao viu.
--
-- ## Onde isto e conferido
--
-- Na tela, e so nela. Nao e barreira de seguranca — e um aviso de boas
-- praticas, e transformar em policy de RLS faria a pessoa esbarrar num erro de
-- permissao em vez de num cartao. A RLS continua cuidando do que importa: quem
-- fala com quem.
-- ============================================================================

ALTER TABLE public.perfis
  ADD COLUMN IF NOT EXISTS chat_boas_vindas_em TIMESTAMPTZ;

COMMENT ON COLUMN public.perfis.chat_boas_vindas_em IS
  'Quando a pessoa leu as boas-vindas do chat. NULL = ainda nao viu, e o cartao '
  'aparece antes da primeira conversa. Conferido na tela, nao na RLS.';
