# Caça aos Zumbis (ex-Caça à Abóbora) — em andamento

> **ESTADO EM 08/10/2026: código pronto e testado na branch `feat/caca-zumbis`, que AINDA
> NÃO FOI PARA A `main`. A migration `20261007200000_caca_zumbis.sql` está ESCRITA e
> NÃO APLICADA no banco.**
>
> **Para quem retoma isto** (o Cleber ou um agente numa sessão nova, no computador do
> trabalho): leia a §5 («O que falta») e continue dali. A §3 diz onde está cada coisa; a §6
> tem as armadilhas que já custaram tempo.

---

## 1. O pedido

Em 07/10/2026 o Cleber pediu para trocar a Caça à Abóbora (feita em 05/10, ver migration
`20261005120000_caca_abobora.sql`) por **zumbis em pixel art**. A mecânica continua a mesma:
o super_admin liga a caça só para o dia, o cron solta um de cada vez, quem chega primeiro ao
banco leva e o nome passa na faixa do topo.

As decisões dele, na ordem em que vieram (não relitigar):

| Data | Decisão |
|---|---|
| 07/10 | Zumbi em pixel art no lugar da abóbora, **um diferente a cada vez no dia** e o mesmo para todo mundo. Tamanho médio, difícil de acertar, bem detalhado e animado. |
| 07/10 | **Tiro na cabeça = HEADSHOT**: a cabeça explode com sangue e física. **Tiro no corpo**: o corpo explode e a cabeça cai numa poça de sangue. |
| 07/10 | A faixa diz **«Fulano matou o zumbi primeiro, em X s»**, com a etiqueta **HEADSHOT** na frente de «matou». **Dois recordes**: o mais rápido do dia (qualquer tiro) e o headshot mais rápido do dia. |
| 07/10 | Depois de sair da cova o zumbi **anda devagar**, numa direção **sorteada na tela de cada pessoa**. |
| 07/10 | O zumbi fica **preso ao ponto da página** onde apareceu: rolar a página leva ele junto, e o sangue também. Isso **revoga** a regra de 05/10, em que ele ficava parado na janela como um adesivo. |
| 07/10 | Depois da morte fica **uma mancha de sangue** mais clara no lugar, por um tempo (3 min, a 50%). |
| 08/10 | Escolheu 3 de 10 ideias extras: **cada zumbi morre do seu jeito** (os enfeites caem: o machado crava, a bag solta uma pizza, a gravata plana…), a **câmera lenta no headshot** (que depois mandou tirar) e os **sons em 8 bits**. |
| 08/10 | **Tirar a câmera lenta.** Os sons tocam **para todos, sempre**, sem depender do Som ambiente do Halloween estar ligado. No headshot, som de **cérebro estourando, gosmento**. O som da saída da cova é **o primeiro gemido, bem baixinho** («só para ter alguma coisa ali»). |
| 08/10 (tarde) | Sons do tiro **a um terço** («só um somzinho ambiente»), gemido igual. A caça **ignora o Modo leve**: é gincana da empresa inteira. A mancha de sangue fica **1 min a 30%** e **desbota devagar em 30 s** (revoga os 3 min a 50%). Corrigido o zumbi que **pulava de canto** logo depois de nascer (`lugarAindaServe`). |

Escolhas feitas pelo agente, que ele não contestou (confirmar se estranhar):
- Clicar no vão do sprite (entre o braço e a perna) é **tiro na parede**: não mata, só faz um furo e toca o ricochete.
- Quem **não** atirou vê o zumbi morrer **do jeito que o vencedor matou** (o banco conta se foi headshot).
- O recado de quem atirou fica **embaixo, no centro** da tela (em cima ele cobria a faixa).
- «Dois recordes» foi lido como **mais rápido de qualquer tiro** e **mais rápido só entre os headshots**.
- Por dentro, os nomes não mudaram: pasta `CacaAbobora/`, tabelas e funções `abobora_*`, tópico `abobora:<empresa>`. Renomear o banco em produção não compraria nada.

---

## 2. Como testar no localhost

```
npm run dev            → http://localhost:8080
http://localhost:8080/?zumbis#/    (faça login normalmente)
```

Com `?zumbis` no endereço aparece o **Laboratório de zumbis** no canto de baixo à esquerda
(`laboratorio.tsx`). Ele **só existe no `npm run dev`**, porque o build de produção o descarta,
e **nunca toca o banco**: as rodadas dele têm id negativo, e o tiro se resolve no navegador
(«Ensaio» em `caca.ts`). Dá para escolher um dos 8 zumbis e soltar, simular «outro matou»
(com ou sem headshot) e «voltar para a cova», e ver a faixa nas três versões.

Atenção: o localhost usa o **banco de produção** (`.env.local`). O cartão de Configurações e o
botão «Soltar um zumbi agora» são de verdade, para todo mundo das duas empresas.

---

## 3. O que está pronto (branch `feat/caca-zumbis`)

Tudo em `src/components/CacaAbobora/`, salvo onde indicado.

| Arquivo | O que é |
|---|---|
| `zumbis.ts` | Os **8 zumbis** (Operador, Gerente, Estagiária, Entregador, Noiva, Roqueiro, Cientista e Lenhador), feitos como grades de letras sobre um corpo-base de 24×34 em 6 peças. Tem os quadros parado (0–3) e andando (4–7), o mapa de peças do tiro (`parteNoPonto`) e os enfeites que se soltam na morte (`solta`). |
| `fisica.ts` | A morte: motor próprio que pinta numa grade de pixels. Cabeça ou corpo explodindo, corpo tombando, cabeça quicando e rolando, poças, respingos e enfeites caindo cada um do seu jeito. A pintura é separada em `desenharChao` (fica como mancha) e `desenharResto` (apaga). Os eventos de som vão em `m.eventos`. |
| `cena.tsx` | O zumbi escondido: sobe da cova, anda dentro de uma ronda medida sem botões, recebe o tiro (com a mira em pixel e um pixel de tolerância) e morre. Também tem o letreiro HEADSHOT!, o recado e a **faixa** nova. |
| `camada.ts` | A lâmina sobre o `<main>` que faz o zumbi **rolar com a página** e corta o que passa da borda. |
| `sons.ts` | Os sons sintetizados no WebAudio, sem nenhum arquivo: tiro, respingo, cérebro gosmento, ricochete, baque, o tóc do machado, o pop, o plof e o gemido. `VOLUME` geral = 0,45; `GEMIDO` = 0,07. |
| `SpriteZumbi.tsx`, `pixels.ts` | O zumbi num canvas, para o cartão de Configurações, a faixa e o recado. |
| `laboratorio.tsx` | O painel de ensaio, só no localhost. |
| `caca.ts` | Os campos novos da rodada (`zumbi`, `headshot`, `headshot_mais_rapido_do_dia`), o `pegarAbobora(id, headshot)` com **recuo automático** quando o banco ainda não tem a função nova (PGRST202), e o ensaio. |
| `components/admin/CacaAboboraConfig.tsx` | O cartão «Caça aos Zumbis» em Configurações → Geral: os dois recordes, a cabeça de cada zumbi e o HEADSHOT em cada rodada. |
| `components/Halloween/fonte.ts` + `public/fonts/pixelify-sans.woff2`, `press-start-2p.woff2` | As fontes pixel, guardadas no próprio site, ambas com licença OFL. |
| `supabase/migrations/20261007200000_caca_zumbis.sql` | **Escrita, não aplicada** — ver §5. |
| `.claude/skills/pixel-art`, `8-bit-pixel-art-patterns`, `retro-css-architecture`, `animation-performance-retro` | Skills de pixel art para o Claude. Origem: `omer-metin/skills-for-antigravity` (pixel-art) e `TheOrcDev/8bitcn-ui` (as outras três). Foram copiadas à mão, por isso não aparecem no `skills-lock.json`. |

O desenho antigo da abóbora (`DesenhoAbobora.tsx`) foi apagado.

**Testes:** são 60, em `caca.test.ts`, `caca.sql.test.ts`, `zumbis.test.ts`, `fisica.test.ts`,
`camada.test.ts` e `sons.test.ts`, mais `__tests__/pacoteDeEntrada.test.ts`. Rodar com
`npx vitest run src/components/CacaAbobora`. O typecheck é `npm run typecheck` (o
`npx tsc --noEmit` da raiz não confere nada).

**Funciona mesmo sem a migration:** os zumbis aparecem e morrem normalmente. Só que (a) o
zumbi é escolhido pela semente e **pode repetir no mesmo dia**, (b) o headshot **não é gravado**,
então a faixa dos outros não mostra a etiqueta, e (c) não existe o recorde de headshot.

---

## 4. O banco hoje

O que **existe** em produção: a caça da abóbora inteira (`20261005120000`), aplicada e
registrada em `schema_migrations`.

O que **falta**: `20261007200000_caca_zumbis.sql`. Ela faz o seguinte:
- cria 3 colunas em `abobora_rodadas`: `zumbi smallint` (0–7, com CHECK), `headshot` e `headshot_mais_rapido_do_dia` (boolean, default false). **Nenhuma linha existente tem dado alterado**;
- `fn_abobora_soltar`: sorteia um zumbi que **ainda não saiu no dia**; depois dos 8, sorteia qualquer um menos o último;
- `fn_abobora_pegar(bigint)` sai e entra `fn_abobora_pegar(bigint, boolean DEFAULT false)`. As duas não podem existir juntas, senão o PostgREST não sabe qual chamar. Uma aba antiga que ficou aberta cai na nova pelo default;
- grants, um bloco «Prova» que se confere sozinho e `NOTIFY pgrst, 'reload schema'`.

---

## 5. O que falta (em ordem)

1. **Aplicar a migration — só com o «pode» do Cleber** (regra do `CLAUDE.md`). Mostrar o SQL
   do arquivo, dizer o que altera (3 colunas, 2 funções, 0 linhas de dado) e esperar.
   - Pelo SQL editor do dashboard, colando o arquivo inteiro. Depois, registrar:
     `npx supabase migration repair --status applied 20261007200000 --project-ref vfrvvoetidtsqbbhdkmj`
   - Ou pelo MCP (`apply_migration`). Nesse caso a versão registrada sai com o timestamp
     **da hora**, não o do arquivo: renomeie o arquivo para a versão registrada, senão o
     `db push` reaplica.
   - Para conferir sem confiar no histórico: `to_regprocedure('public.fn_abobora_pegar(bigint, boolean)')`
     tem que existir, `to_regprocedure('public.fn_abobora_pegar(bigint)')` tem que ser NULL, e as
     3 colunas têm que aparecer em `information_schema.columns`.
2. **Teste de verdade** com o super_admin: Configurações → Geral → «Soltar um zumbi agora».
   Conferir que a faixa mostra HEADSHOT para quem **não** atirou e que o cartão mostra os dois recordes.
3. **Juntar na `main`** (o deploy da Vercel sai da `main`). A branch está em cima da `main` de 07/10 à noite (`9af6fd7e`).
4. Depois disso, atualizar este documento ou apagá-lo.

---

## 6. Armadilhas desta sessão

- **Animação passa por cima do `transform` inline.** A subida da cova (`zb-sobe`) anima o `transform` do canvas, e por isso o `scaleX(-1)` do espelhamento nunca valia: o zumbi andava para a esquerda olhando para a direita, e o tiro na cabeça desse lado contava errado. O espelhamento agora fica num `<span class="zb-zumbi-vira">` próprio. **Não junte as duas coisas de novo.**
- **A Press Start 2P não tem maiúscula acentuada.** «RÁPIDO» saía «RAPIDO». Ela só serve para HEADSHOT, para os números e para títulos sem acento; o resto vai na Pixelify Sans.
- **`pacoteDeEntrada.test.ts`**: nenhum arquivo de `CacaAbobora/` pode importar `./cena` de forma estática. A cena, a física e os sons só são baixados quando há zumbi.
- **Para ver no navegador sem login**, crie uma página temporária `ensaio-zumbis.html` na raiz que monte `FaixaDaCaca` + `<main data-palco-abobora>` + `AboboraDaCaca` com `MemoryRouter`, abra com `?zumbis` e use o Playwright. Apague no fim; ela nunca foi commitada.
- **Revisar sprite**: o Node 24 roda `.ts` direto. Gere um PNG ampliado de `montarQuadro` e olhe a imagem. Foi assim que os 8 zumbis foram desenhados e corrigidos.

---

## 7. Fora desta branch

Dois arquivos que já estavam soltos no computador de casa antes desta sessão **não entraram**
no commit, porque não são desta tarefa e ninguém sabe de onde vieram:
`src/hooks/usePendentesDeAgendamento.ts` e `src/lib/reagendamento.ts`. Eles continuam só lá.

---

## 8. O chefão: o Rei do Pop zumbi (09/10/2026)

> **ESTADO EM 09/10/2026: código pronto e testado no localhost (ensaio). A migration
> `20261009120000_chefao_rei_do_pop.sql` está ESCRITA e NÃO APLICADA.** Sem ela, o botão
> «Soltar o chefão» dá erro e nada aparece para ninguém; o resto da caça segue igual.

Pedido: no modo de soltar zumbi, um chefão zumbi «clássico» (o Rei do Pop do clipe de terror),
que todo mundo derruba junto. Ele dança os passinhos, anda pela tela, desvia dos tiros, e no fim
aparece um ranking de quem ajudou.

| Arquivo | O que é |
|---|---|
| `chefaoArte.ts` | O sprite (um `Zumbi` de `zumbis.ts` com 4 poses: braços estendidos, garras, caídos, chute) e os 7 passos: garras, moonwalk, giro → ponta do pé, antigravidade, chute, marcha. Cada passo tem a sua chance de desvio. `pontoNaArte` desfaz a inclinação e o espelho no tiro. |
| `chefao.ts` | O estado: a vida de todos, o ranking, os tiros em lote (1 s), o ensaio com robôs. Ouve o sinal `chefao` no tópico da caça (`caca.ts`). |
| `cenaChefao.tsx` | O chefão na tela (lâmina presa à JANELA, não ao conteúdo), o placar de cima e o ranking final. Baixado só quando ele aparece. |
| `furo.ts` | O tiro na parede, agora dividido entre as duas cenas. |
| `chefaoMovimento.ts` | A física: inércia, pulo em arco com amasso na queda, deslize de costas, o passinho da Fúria, o tranco de dor. Puro, testado. |
| `chefaoEfeitos.ts` | Sangue no chão (45 s, até 90 manchas), o braço que voa e quica, o pingo do toco, o rastro, a poeira, as notas. |
| `sons.ts` | Acerto, «hee-hee», chegada, queda e uma batida de fundo ORIGINAL (não é a música do clipe). |
| `admin/CacaAboboraConfig.tsx` | «Soltar o chefão» com Fácil 200 / Médio 500 / Difícil 1200 de vida, 5 min na tela. |

Ferimentos (09/10, tarde): abaixo de 70% de vida fica machucado; abaixo de 45% perde o braço de
trás; abaixo de 20%, o da frente (com a luva), um olho e mostra a costela. O braço voa com física e
fica no chão. Ao perder um braço, e sozinho a cada 35–55 s, entra na **Fúria do Rei**: os olhos
acendem, aura e notas, e por 6,5 s desvia de todos os tiros. Tem chapéu (voa quando ele cai), a
pose com a mão na aba e o moonwalk com um pé na ponta e o outro deslizando.

Som: tudo tem versão sintetizada (a trilha é ORIGINAL, funk 8 bits em mi menor). Se existir a pasta
`public/sons/chefao/` com `trilha.mp3`, `hee-hee.mp3` e `gritos.mp3`, eles tocam no lugar — as vozes são
cortadas do silêncio sozinhas, e a trilha começa em 1:25 (`INICIO_DA_TRILHA_S` = 85,1 s, colado num bumbo), a pedido. A pasta está no `.gitignore` (áudio de terceiros, só no localhost de quem
testou); no deploy toca o sintetizado. Volume: operador (não super_admin) SEMPRE a 12% (era 50%; baixou em 09/10), super_admin a 100%
do que já é baixo (`VOLUME_DO_OPERADOR` em `sons.ts`). Hee-hee no máximo 1 a cada 4 s e só em parte dos desvios; grito 1 a cada 7 s. Com o chefão na tela, TODO som da caça (tiro, ricochete, morte) vai nessa escala, não só os dele. Ao surgir, ele solta um hee-hee.

**Fúria igual para todos:** a cada 40 s desde a chegada (`solta_em`) e quando a vida DO BANCO cruza a perda de um braço — nunca sorteada por tela.

**Vida que cresce:** `vida_por_pessoa` — cada caçador novo (primeiro tiro) soma vida. Níveis em `DIFICULDADES` (`chefao.ts`): Fácil 300 + 150/pessoa, Médio 500 + 250, Difícil 800 + 400. Conta: ~1,8 de dano/s por pessoa × ~2,5 min úteis ≈ 250.

**Esconder o chefão:** um X no MEIO da barra do topo (por cima da faixa), da contagem até o fim (`BotaoChefao.tsx`). Um clique esconde («Esconder o chefão»), outro mostra de novo («Mostrar o chefão»). Escondido, a pessoa não vê nem ouve nada dele; guardado por pessoa no navegador, vale também para o próximo.

**Sangue:** manchas 15 s, braço no chão 25 s, a poça da morte dele 12 s + 8 s desbotando.

**Contagem:** soltar o chefão começa 1 minuto de contagem na tela de todos (`ESPERA_S`). O banco grava a chegada em `solta_em` (`fn_chefao_soltar(vida, minutos, espera_s)`), recusa tiro antes dela, e o prazo de 5 min conta da chegada. Nos últimos 10 s, tique; nos últimos 5, o número grande no meio.

Regras: corpo tira 1, cabeça 3. O banco aceita no máximo 12 acertos por lote e 1 lote a cada 600 ms
por pessoa, e avisa todos no máximo a cada 2 s (sempre quando ele cai ou foge). Quem tira a
última gota dá o GOLPE FINAL. Passou o prazo, ele foge no moonwalk. O desvio e a posição são da
tela de cada um; só a vida e o ranking são de todos.

**Testar no localhost:** `http://localhost:8080/?zumbis#/` → Laboratório → «Soltar o chefão»,
«Robôs atirando», «Pular contagem», «Soltar sem contagem», «Arrancar 30%» (para ver os ferimentos), «Fugir». Nada vai para o banco.

**Revisão de lançamento (09/10/2026) — para não derrubar o Realtime nem o banco:**

- Aviso a cada 2 s (era 700 ms). Cada aviso vai a TODA aba logada, até a de quem escondeu o chefão: com ~150 abas eram ~210 mensagens/s na cota do Realtime (a mesma do chat e da presença); agora ~75. Quem atira não perde nada, porque a resposta do próprio lote já traz a vida de todos.
- `fn_chefao_acertar` decide sem trava tudo o que não tira vida (prazo, contagem, freio, nome) e só depois entra na fila da linha. Na fila confere o freio de novo, escreve a linha uma vez só (`avisado_em` junto) e calcula o estado uma vez (o mesmo vai no aviso e na resposta). `lock_timeout` de 2 s: com o banco afogado, o lote falha em vez de prender conexão do app.
- O freio responde `freio: true`, e o app devolve esses tiros ao próximo lote. Antes, eram perdidos em silêncio quando a rede juntava dois lotes.
- No app: cada aba começa o relógio do lote num ponto sorteado do segundo (todas montam a cena com o mesmo aviso, então nasceriam alinhadas) e só tem um lote no ar por vez. A releitura «está quieto» acontece uma vez por silêncio, com sorteio, e nunca na contagem. Antes era a cada 4 s em toda aba, o que dava ~40 leituras/s no minuto da contagem.
- `chefao.sql.test.ts` roda a migration num Postgres de verdade (PGlite) e atira nela.
- Antes de soltar o primeiro: conferir no painel do Supabase o plano e a cota de mensagens do Realtime (Settings → Realtime / Usage).

**O banquete — recuperar vida (09/10/2026):** botão «+ RECUPERAR VIDA» no placar, só para o super_admin (e «Recuperar vida» no Laboratório). `fn_chefao_curar` devolve 25% da vida máxima (no máximo o que falta), marca `cura_em`/`cura_ate` (12 s) e soma 12 s ao prazo. Em toda tela, ao mesmo tempo: uma pessoa (pixel art genérica, por partes, roupa sorteada pela `cura_semente`) entra andando e assobiando; ele segue dançando, PARA e a vê («!», «FOME!»), ela se assusta e congela («SOCORRO!»), ele corre (`CORRIDA`) e dá o bote; ela cai, e ele come (`BANQUETE`) arrancando braço, braço, perna, perna e cabeça (`DESMEMBRA` em `cenaChefao.tsx`; os pedaços voam e ficam no chão) e roendo o tronco até sobrar osso. A barra sobe a cada mordida, com «+N». IMUNE o tempo todo: a tela mostra «IMUNE!» e o banco devolve `curando: true` sem tirar vida. Erros: `JA_COMENDO`, `VIDA_CHEIA`, `AINDA_CHEGANDO`. Correr e comer ficam fora de `PASSOS` (o sorteio da dança nunca escolhe).

**Autoclick (09/10/2026):** `autoclick.ts` ouve os cliques da página durante a luta e cada lote leva `p_cliques` e `p_suspeita` (bits: 1 ritmo de máquina, 2 rápido demais, 4 script — fortes; 8 botão sempre igual, 16 mouse parado — fracas). O banco soma em `chefao_golpes` (`cliques`, `lotes`, `suspeitas` = lotes com pista forte, `motivos`) e conta sozinho os lotes no teto de 12 (`lotes_no_teto`). Suspeito = script, ou 3+ lotes com pista forte, ou metade de 8+ lotes no teto. Só o super_admin vê (`fn_chefao_suspeitos`, Configurações → Geral → «Quem parece autoclick?»); fora do aviso e do ranking. Não tira dano de ninguém. Clique de script (`isTrusted` falso) nem vira tiro. No ensaio, o robô «Leandro Duarte» atira de autoclick.

**Para ligar de verdade:** aplicar a migration (só com o «pode», regra do `CLAUDE.md`), depois
Configurações → Geral → «Soltar o chefão».
