-- ─────────────────────────────────────────────────────────────────────────────
-- Um canal de presence para a aplicação inteira: `presence-global`
--
-- ── O sintoma ────────────────────────────────────────────────────────────────
-- 903 `PresenceRateLimitReached: Too many presence events per second` em 24 h,
-- em ritmo constante (~4 por minuto) durante todo o horário de operação. O log
-- do Realtime atribui o estouro ao TENANT, sem quebra por canal: o projeto
-- inteiro divide um único orçamento de eventos de presence por segundo.
--
-- ── A causa ──────────────────────────────────────────────────────────────────
-- Cada pessoa logada emitia DOIS `track()`, um por canal de presence:
--
--     presence-empresa-{id}   PresenceProvider  (contador, bolinha, admin)
--     presenca-chat           useChatPresenca   (bolinha do chat)
--
-- Como os dois canais dividem o mesmo orçamento, era o dobro de eventos para
-- responder a mesma pergunta: quem está online.
--
-- ── Por que um canal GLOBAL, e não o da empresa ──────────────────────────────
-- O chat cruza empresas — 319 das 920 conversas (34,7%) têm participantes de
-- empresas diferentes. Ler a presença do canal por empresa deixaria um terço das
-- conversas com o contato eternamente "offline", que é pior que não mostrar
-- nada. Então o canal que sobra é o global.
--
-- Quem precisa do recorte por empresa é o contador de `UsuariosOnline`, e esse
-- recorte passa a ser feito no cliente: o `track` carrega `empresa_id`, o
-- Provider monta os dois conjuntos a partir do mesmo `presenceState` e entrega
-- `onlineIds` (a empresa de quem olha) e `onlineIdsGlobal` (todos). Nenhuma
-- tela muda de comportamento, e o super_admin segue somando as quatro empresas
-- — agora sem precisar dos três canais extras que ele abria só para isso.
--
-- ── Sobre privacidade ────────────────────────────────────────────────────────
-- `presence-empresa-{id}` era canal ABERTO (sem `private: true`): protegia-se
-- por obscuridade do tópico, que carrega um uuid. `presence-global` tem nome
-- adivinhável, então nasce privado, e é o que estas duas policies fazem — a
-- mesma forma das de `presenca-chat`, trocando o portão do chat por "tem
-- sessão". Na prática a postura MELHORA: o canal de presença da aplicação sai
-- de aberto para fechado por RLS.
--
-- ── Como voltar atrás ────────────────────────────────────────────────────────
--     DROP POLICY presenca_global_publicar ON realtime.messages;
--     DROP POLICY presenca_global_receber  ON realtime.messages;
-- ─────────────────────────────────────────────────────────────────────────────

SET LOCAL lock_timeout = '5s';

DROP POLICY IF EXISTS presenca_global_publicar ON realtime.messages;
DROP POLICY IF EXISTS presenca_global_receber  ON realtime.messages;

-- Publicar a própria presença.
CREATE POLICY presenca_global_publicar
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT realtime.topic()) = 'presence-global'
    AND extension = 'presence'
    AND (SELECT auth.uid()) IS NOT NULL
  );

-- Receber a presença dos outros.
CREATE POLICY presenca_global_receber
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (SELECT realtime.topic()) = 'presence-global'
    AND extension = 'presence'
    AND (SELECT auth.uid()) IS NOT NULL
  );
