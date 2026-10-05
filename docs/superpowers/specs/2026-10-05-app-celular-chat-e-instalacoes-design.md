# App do celular: indicadores de instalação e chat com aviso — desenho

Data: 05/10/2026 · Pedido: Cleber · Versões do app: operador (`/m`) e líder (`/m/equipe`).

## 1. Indicadores: «instalou» e «celular registrado»

- **Instalou** = abriu o gestão ao menos uma vez como app instalado
  (`display-mode: standalone` / `navigator.standalone`, já detectado em
  `lib/mobile/instalar.ts`).
- **Celular registrado** = tem aparelho em `push_inscricoes` (avisos ativados).
- Sem monitoramento de uso do app (decisão do Cleber).

Registro: tabela `app_instalacoes` (uma linha por pessoa: `instalado_em`,
`ultima_abertura_em`, `aparelho` iPhone/Android). Grava por RPC
(`fn_app_registrar_abertura`), no máximo uma vez por dia por aparelho, sempre
que o gestão abre instalado — em qualquer rota.

Painel: card «App no celular» dentro do Monitoramento de uso — contadores
(instalaram, com celular registrado, instalaram sem avisos) e a lista de
pessoas (cargo, setor, quando instalou, celular registrado, aparelho). Mesmo
alcance e permissão do Monitoramento de uso.

## 2. Chat no app

Reaproveita a `BolhaChat` do desktop num modo `celular` (abordagem escolhida):

- botão flutuante no canto inferior direito das duas telas do app; abóbora
  quando o tema Halloween está ligado, ícone normal quando desligado; bolinha de
  não lidas;
- aberto, ocupa a tela inteira (`100dvh`, áreas seguras do iPhone): lista ou
  conversa, com «voltar»; sem o botão de expandir; toques maiores; a caixa de
  texto acompanha o teclado;
- mesmas funções e mesmas regras de acesso do desktop (`ver_chat` + trava
  `chat_config`);
- `?chat=<conversa>` na URL abre direto na conversa (vem do aviso).

## 3. Aviso no celular para mensagem nova

- Gatilho em `chat_mensagens` (mensagens de pessoa, não de sistema) grava em
  `push_chat_fila` uma linha por participante (menos o autor, menos quem saiu)
  e chama na hora a Edge Function `enviar-push` com `acao: 'chat'`.
- A função pega a fila, descarta quem está online no gestão
  (`presenca_online`), agrupa por pessoa + conversa e manda um aviso com etiqueta
  da conversa — o aviso novo substitui o anterior, como no WhatsApp.
- Título: nome de quem mandou (grupo: «Fulano · Grupo»). Texto: a última
  mensagem cortada, ou «Foto», «Áudio», «Vídeo», «Arquivo: nome» (sem emoji, como
  os demais avisos desde 30/09); «N mensagens não lidas» quando acumula.
  Mensagem com CPF: «Nova mensagem», sem o texto.
- Android: foto de quem mandou como ícone. iPhone: ícone do app (limite do
  sistema).
- Toque no aviso: abre o app na conversa (`/#/m?chat=`; o líder é levado a
  `/m/equipe` com o parâmetro junto).
- Melhor esforço: aviso que falha não volta para a fila. Faxina de 7 dias.

## 4. Testes e entrega

Testes da montagem do aviso, da regra de online, do agrupamento, do registro de
instalação e do botão (abóbora × normal). Duas migrations (instalações; fila do
chat) aplicadas pelo Cleber; a Edge Function é publicada de novo com a ação
`chat`. Nada vai ao banco nem ao GitHub sem o «pode» do Cleber.
