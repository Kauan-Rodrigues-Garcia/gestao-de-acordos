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
