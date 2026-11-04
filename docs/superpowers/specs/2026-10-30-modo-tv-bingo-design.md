# Modo TV — telas sob demanda e Bingo — design (30/10/2026)

Pedido do Cleber em 30/10/2026: uma Central de jogos no Modo TV, começando por
um bingo completo com cara de jogo, com cartela na tela de cada participante,
e uma categoria de tempo de tela para o que não pode sair do ar sozinho (o
sorteio não pode trocar de tela no meio).

Do mesmo pedido, ficam para specs próprios: roleta, sorteio de pessoa, opções
de ranking (equipe × equipe, pessoas de uma equipe, projeção), cena «Ranking
de quitação» (igual ao Analítico, com prêmios, e com aviso quando o setor não
tem o ranking) e a cena livre (editor de arrastar no molde do Estúdio de
Comemorações).

## Decisões (Cleber, 30/10/2026)

| Pergunta | Escolha |
|---|---|
| Tela «até trocar» | Sob demanda: fora do rodízio, entra só quando o líder põe |
| Quem pode ser sob demanda | Qualquer tela (cada tela: «No rodízio» ou «Sob demanda») |
| Cartela do bingo | Na tela de cada participante, no sistema |
| Marcação | A pessoa marca na mão; o sistema marca se ela não marcar em 2 min |
| Pedra nova no jogador | Surge num canto de cima do sistema e pisca com brilho por alguns segundos |
| Cartela | Dobrável: dobrada fica num canto de baixo; clicando, abre |
| Como se ganha | O líder decide na hora: escolhe ganhador(es) e se foi quina ou cartela cheia |
| Painel do líder | Quatro grupos ao vivo, com as pedras da sorte |
| Ritmo | Manual (botão) + automático opcional 20/30/60 s com pausa |
| Grito do jogador | Botão «BINGO!» que acende quando as marcações fecham |
| Tempo real | Banco é a verdade; broadcast por gatilho; sem Postgres Changes |
| Visual | Os 8 estilos, como temas escolhidos na criação da partida |
| Leveza | Nada pesado para as pessoas, para o banco ou para o backend |

Escolhas assumidas e confirmadas: participantes do alcance do líder (com
inclusão no meio da partida); uma cartela por pessoa; auto-marcação de 1, 2
(padrão), 3 ou 5 min; prêmio da quina e do bingo opcionais, em texto; som
sintetizado na TV com chave para desligar e «plim» com mudo no jogador; uma
partida aberta por painel; histórico ao encerrar.

## 1. Telas sob demanda

- `TelaDoPainel` ganha `sob_demanda?: boolean` (jsonb, sem migration de
  coluna). Ausente = `false` = no rodízio, como hoje.
- `telaNoInstante` (`relogio.ts`) passa a contar só as telas do rodízio. Painel
  só com telas sob demanda e nada no ar: a TV mostra a tela de espera do tema.
- No editor, as telas sob demanda ficam numa seção própria, com «Pôr no ar
  agora». Pôr no ar = `tela_fixa` (mecanismo existente, imediato, com aviso
  pelo `tv-painel:<id>`). «Tirar do ar» = `tela_fixa` nulo; o rodízio recomeça
  pela versão nova, como já acontece hoje ao soltar.
- Tela sob demanda nunca tem tempo; o campo de tempo some para ela.

## 2. Central de jogos e ciclo da partida

Aba «Jogos» dentro de `/modo-tv`, ao lado da montagem. Card «Bingo» ativo;
«Roleta» e «Sorteio» aparecem como «em breve».

1. **Criar** — painel (a TV onde passa), tema, participantes, auto-marcação,
   prêmios.
2. **Abrir** — o banco gera as cartelas. A TV entra no bingo («Partida vai
   começar», cartelas sendo distribuídas). A cartela surge no canto da tela de
   cada participante.
3. **Sortear** — botão ou automático. TV anima; jogador vê a pedra brilhar no
   canto de cima e marca.
4. **Acompanhar** — painel do líder refeito a cada pedra; gritos com destaque.
5. **Comemorar** — líder marca ganhador(es) e o tipo; TV e jogadores veem a
   festa com a cartela-prova. A partida continua após uma quina.
6. **Encerrar** — TV volta ao rodízio, cartelas somem, partida no histórico.

O bingo não é uma entrada em `tv_paineis.telas`: partida aberta no painel
passa por cima do rodízio e da tela fixa. Encerrar devolve a TV ao que ela
mostrava pela versão atual do painel.

## 3. Banco

Migration nova (arquivo; aplicar só com o «pode» do Cleber). Tabelas sem
policy de leitura/escrita para o cliente: tudo por RPC `SECURITY DEFINER`,
`SET search_path`, grants explícitos (`authenticated`; as da TV para `anon`
pelo token). Policy que precisar existir nasce `TO authenticated`, com função
em `(SELECT ...)`.

### Tabelas

- `bingo_partidas` — `id`, `empresa_id`, `painel_id` (FK `tv_paineis`, `ON
  DELETE CASCADE`), `criada_por`, `tema` (CHECK nos 8 ids), `auto_marcar_s`
  (CHECK 60/120/180/300), `premio_quina`/`premio_bingo` (texto ≤ 60),
  `estado` (`aberta`|`encerrada`), `auto_intervalo_s` (nulo = manual; CHECK
  20/30/60), `auto_pausado`, `proxima_pedra_em`, `criada_em`,
  `encerrada_em`. Índice único parcial `(painel_id) WHERE estado='aberta'`.
- `bingo_cartelas` — PK `(partida_id, perfil_id)`, `numeros SMALLINT[25]`
  (linha a linha; índice 12 = 0, a estrela), `gritou_em`, `gritou_tipo`,
  `criada_em`. As marcações NÃO ficam aqui (ver §5).
- `bingo_pedras` — PK `(partida_id, ordem)`, `UNIQUE (partida_id, numero)`,
  `numero` 1–75, `sorteada_em`.
- `bingo_vitorias` — `id`, `partida_id`, `tipo` (`quina`|`cheia`),
  `comemorada_em`, `por`; `bingo_vitoria_ganhadores` — PK `(vitoria_id,
  perfil_id)`, `padrao` (índices da linha vencedora, ou os 25 na cheia).

### Aleatoriedade

O gerador forte do Postgres, via `gen_random_uuid()` (implementação, 30/10:
sem depender do pgcrypto, que não aparece em migration nenhuma) — nunca
`random()`. Cartela: B 1–15, I 16–30, N 31–45 (4 + estrela), G 46–60, O 61–75,
cinco distintos por coluna (`fn_bingo_cartela_nova`). Cartela repetida na mesma
partida é refeita. A pedra sai do conjunto das ainda não sorteadas
(`fn_bingo_sorteio`).

### RPCs

Controle (alcance = `fn_tv_alvo_no_meu_alcance` do alvo do painel):

- `fn_bingo_criar(painel, tema, participantes uuid[], auto_marcar_s, premio_quina, premio_bingo)` → partida; gera cartelas. Participante precisa estar no alcance. Teto 200.
- `fn_bingo_incluir(partida, participantes uuid[])`.
- `fn_bingo_sortear(partida)` → `{ordem, numero}`; recusa com 75 sorteadas.
- `fn_bingo_automatico(partida, intervalo_s | null, pausado)`.
- `fn_bingo_controle(partida)` → partida, pedras, todas as cartelas (id, nome, foto, números), gritos, vitórias. Lido uma vez; o resto chega por broadcast.
- `fn_bingo_comemorar(partida, tipo, ganhadores uuid[])` → recusa quem não completou pelo conjunto das pedras sorteadas.
- `fn_bingo_encerrar(partida)`.

Jogador:

- `fn_bingo_minha_cartela()` → partidas abertas em que estou: tema, números, pedras, prêmios, auto-marcar, última vitória (com as cartelas-prova).
- `fn_bingo_gritar(partida, marcadas smallint[])` → confere: todas sorteadas, todas na cartela, fecham quina ou cheia. Grava `gritou_em`/`gritou_tipo`.

TV (token, anon):

- `fn_tv_ver` ganha o bloco `bingo` quando há partida aberta no painel: tema, pedras, prêmios, gritos com nome e foto (a TV já mostra nome e foto no ranking) e a última vitória com as cartelas-prova.
- `fn_tv_bingo_tique(token)` → sorteia só se automático ligado, não pausado e `proxima_pedra_em <= now()`.

A mesma condição vale para `fn_bingo_sortear` chamado pelo tique da central:
TV e central chamando juntas dão uma pedra só (`FOR UPDATE` na partida).

Rede de segurança: partida aberta há mais de 12 h é encerrada na próxima
leitura de qualquer ponta.

### Tempo real

Mudou na implementação (30/10), para ficar mais leve: em vez de mandar cada
pedra para o canal pessoal de cada participante (N envios por pedra), as RPCs
chamam `fn_bingo_avisar`, que manda UM aviso por evento em dois tópicos:

- `bingo:<partida>` (privado) — participantes e controle. A policy
  `bingo_sinal_receber` confere uma vez, na entrada do canal
  (`fn_bingo_posso_ouvir`: tem cartela, ou controla o painel).
- `tv-painel:<painel>` (público, existente) — a TV.

Payload mínimo: `{tipo, partida, ordem?, numero?}` (pedra), `{tipo:'grito',
quem, grito}`, ou só o tipo (partida, vitória). Pedra entra direto; o resto o
cliente relê.

O convite (cartela nova) vai uma vez por pessoa pelo canal pessoal
`chat:<perfil>`, evento `bingo` — as escutas desse tópico moram em
`lib/canalPessoal.ts`, compartilhadas com o chat. Quem não joga não ganha
assinatura. Envio protegido por `BEGIN … EXCEPTION WHEN OTHERS THEN NULL`.

O automático: a central e a TV pedem a pedra na hora; o banco sorteia só se
`proxima_pedra_em` já passou (`FOR UPDATE`), e toda resposta devolve a próxima
hora, para quem pediu cedo recalibrar sem reler.

## 4. Telas

### TV

- Pedra: animação do tema (~4 s) com o número gigante e a letra.
- Quadro: painel das 75 (acesas as sorteadas), últimas 5, «pedra N de 75»,
  prêmios, aviso de grito.
- Festa: animação do tema com nome, foto e cartela-prova de cada ganhador, a
  linha vencedora brilhando.
- Palco 1920×1080 em `scale()`, texto grande (número da pedra ≥ 300 px
  lógicos; painel das 75 ≥ 40 px).
- Som sintetizado (Web Audio) com chave na criação da partida.

### Central do líder

- Criar: tema com prévia, participantes (atalhos «todos do setor», «equipe X»,
  indicador de online pela presença existente), auto-marcação, prêmios.
- Jogo: «Sortear pedra» grande, automático 20/30/60 s + pausa, prévia da TV,
  gritos no topo, quatro grupos:
  1. **Perto da quina** — falta 1 pedra em alguma linha/coluna/diagonal; as
     pedras da sorte são as que faltam (uma por linha nessa condição).
  2. **Já fizeram quina.**
  3. **Perto da cartela cheia** — faltam até 3; pedras da sorte = as que faltam.
  4. **BINGO** — cartela completa.
  Clicar no card abre a cartela. Grupos calculados no navegador do líder a
  partir das cartelas (lidas uma vez) e das pedras (broadcast).
- Comemorar: marca ganhadores, tipo, solta. Só habilita quem completou.

### Jogador

- Componente global no `Layout` (como `ComemoracaoOverlay`), carregado sob
  demanda: só baixa o código do bingo quando há cartela.
- Cartela dobrada num canto de baixo (aba com tema e contador); clique abre;
  tocar no número marca. «Plim» e mudo na cartela.
- Pedra nova: surge num canto de cima e pisca com brilho por alguns segundos.
  `pointer-events: none`.
- Auto-marcação após `auto_marcar_s` sem marcar aquela pedra, com efeito
  próprio («marcado para você»).
- «BINGO!» acende pulsando quando as marcações fecham quina ou cheia; envia as
  marcações para `fn_bingo_gritar`.
- Festa dos ganhadores por cima, com a cartela-prova.

### Temas

Ids: `fliperama`, `chiclete`, `rpg`, `galaxia`, `aquario`, `bloco`, `gacha`,
`bichinho`. Um arquivo por tema em `src/pages/ModoTV/bingo/temas/`, com
contrato fixo: `Globo`, `Bola`, `Cartela`, `Marca`, `Festa`, paleta e fontes.
O motor não conhece o tema. Cada tema é `lazy()`. Tema que falha ao carregar
cai no padrão (`chiclete`). Referência visual: os mockups A–I do brainstorm
(`.superpowers/brainstorm/…/bingo-estilo-todas.html`, só nesta máquina, fora
do git):

- A fliperama — arcade, fonte pixel, neon rosa/menta; bingo = «STAGE CLEAR!».
- B chiclete — globo é máquina de chiclete, bolas com carinha, pastel.
- C rpg — moeda dourada sai do baú; cartela-pergaminho; «Tesouro encontrado!».
- E galaxia — foguete solta planeta com anel; bingo = «Decolagem!».
- F aquario — peixe sopra bolha com o número; baleia espirra confete.
- G bloco — cabeçada no bloco solta moeda; cartela de tijolos; bandeira no mastro.
- H gacha — cápsula cai, abre ao meio; «PRÊMIO RARO!».
- I bichinho — ovo racha com o número; o bichinho evolui na quina.

## 5. Leveza

- Marcações ficam no navegador do jogador (`localStorage`, por partida, em
  try/catch). O banco só as recebe no grito. Sem RPC por clique.
- A pedra vem dentro do broadcast: ninguém relê por pedra. Por pedra, o banco
  faz 1 INSERT e os envios.
- Painel do líder calculado no cliente.
- Animação só `transform`/`opacity`; pausa com aba escondida; sons sem
  arquivo; código do bingo e de cada tema carregado só quando usado.

## 6. Falhas

- Broadcast perdido: relê em `onReconectado` e ao voltar a aba visível;
  buraco na `ordem` (chegou 24 sem 23) também dispara releitura.
- TV sem rede: segura a última pedra; `fn_tv_versao` puxa o estado na volta.
- F5: marcações voltam da cópia local; sem cópia, a auto-marcação cobre.
- Grito inválido: mensagem amigável, botão apaga.
- Pessoa desligada/transferida no meio: a cartela vale até o fim.
- Tema que falha: tema padrão, nunca tela branca.

## 7. Testes

- Vitest, funções puras: geração/validação de cartela (faixas por coluna),
  quina/cheia, pedras da sorte, os quatro grupos, buraco na sequência,
  `telaNoInstante` com telas sob demanda.
- Teste que lê a migration e confere grants e assinaturas contra o front.
- Prévia sem banco: `/#/tv?demo=1&bingo=1&tema=<id>` com pedras simuladas.

## 8. Entrega

1. Sob demanda + motor + migration + central + jogador + TV, com 2 temas:
   **chiclete** e **bloco** (os mais diferentes entre si).
2. Os outros 6 temas, um commit por tema.
