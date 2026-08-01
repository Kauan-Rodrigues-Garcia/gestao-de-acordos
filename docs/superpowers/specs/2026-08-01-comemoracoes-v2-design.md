# Comemorações v2 — design

**Data:** 01/08/2026 · **Estado:** aprovado, não implementado
**Sucede:** `2026-07-31-comemoracao-de-meta-design.md` (a base continua valendo)

A aba **Comemorações** entrou no ar e a base está de pé. Este documento cobre a
segunda leva: quatro defeitos com causa localizada e cinco frentes novas, sendo a
maior delas a **biblioteca de mídia com cota e validade**.

Vale para PaguePlay e BookPlay.

---

## 1. O que já existe e NÃO precisa ser feito

Levantado ao ler o código antes de desenhar. Três pedidos já estão prontos:

| Pedido | Situação real |
|---|---|
| "Mídia visível para todos os setores" | Já é. `listarMidias` filtra por `empresa_id` e a RLS da `20260731f` é por empresa — setor nunca entrou na conta. |
| "Aceitar imagens, não só GIF" | PNG e WEBP já sobem hoje; estão apenas rotulados como "GIF" no seletor. O trabalho é **separar em categorias**, não criar suporte. |
| "GIF até 10 MB" | O bucket já aceita 10 MB desde a `20260731g`. Só a constante `LIMITE_GIF_BYTES` do front trava em 5 MB. |
| "Nunca GIF e imagem ao mesmo tempo" | O card tem **um** slot de mídia. A exclusão mútua é estrutural; basta o seletor limpar o outro campo. |

---

## 2. Defeitos e suas causas

### 2.1 O editor não bate com a tela real

**Causa.** As *posições* são % do card (`layout.ts`), mas os *tamanhos* são px
fixos: `text-3xl` no título, `h-14 w-14` no avatar, `maxHeight: 129px` no GIF. O
card do editor mede 320–420 px (coluna do grid em `pages/Comemoracoes/index.tsx`);
o da exibição mede 576 px (`max-w-xl` no overlay). O vão entre elementos cresce
junto com o card, o texto não — daí "colado no editor, afastado no real".

**Correção.** `CardComemoracao` desenha o conteúdo numa caixa lógica fixa de
**640×360** e o wrapper aplica `transform: scale(largura / 640)` com
`transform-origin: top left`, reservando `360 × escala` de altura. Fonte, avatar,
mídia e vãos passam a escalar juntos: editor e exibição ficam idênticos **por
construção**, não por coincidência de largura.

Layouts já gravados continuam válidos — seguem sendo percentuais.

### 2.2 A mesma comemoração dispara de novo

**Causa.** O conjunto "já exibidas" é `useRef<Set>` em memória
(`useComemoracoes.ts`). Recarregar a página zera o conjunto; se a comemoração
ainda estiver dentro da janela `inicia_em + duracao_s`, ela explode outra vez.
Cada aba aberta conta separado pelo mesmo motivo.

**Correção.** Duas camadas, ver §4.

### 2.3 Silenciar não silencia

**Causa.** `alternarMudo` no overlay só grava a preferência no `localStorage`. A
música que já começou segue tocando até o fim — a função de parada
(`pararSomRef`) existe e não é chamada.

**Correção.** Ao silenciar, chamar `pararSom()`. Ao dessilenciar, **não** religar
a música no meio: quem silenciou no meio da festa não quer o som voltando.

### 2.4 Prévia de música empilha e não pausa

**Causa.** O botão Play da biblioteca chama `tocarArquivoDeSom` e descarta a
função de parada devolvida. Nada guarda quem está tocando: cada clique cria outro
`<audio>`, e não há como pausar.

**Correção.** Um player de prévia único, ver §6.3.

---

## 3. Card: modelos, animação e tipo de mídia

### 3.1 Modelos de layout

Novo módulo `src/pages/Comemoracoes/modelos.ts`, puro e testável, que devolve um
`LayoutComemoracao` pronto:

| id | Arranjo |
|---|---|
| `midia_topo` | mídia em cima, texto embaixo — é o `LAYOUT_PADRAO` de hoje |
| `texto_sobre` | texto por cima da mídia, ambos centralizados |
| `midia_lado` | mídia à esquerda, texto à direita |

Escolher um modelo é a **primeira** ação do editor e reposiciona todos os
elementos. Arrastar depois continua liberado e muda o rótulo para
"personalizado" — o modelo é ponto de partida, não jaula.

Gravado em `comemoracoes.modelo TEXT NOT NULL DEFAULT 'midia_topo'`.

No `texto_sobre`, a mídia é desenhada **atrás** do texto. Como os elementos são
irmãos posicionados em absoluto, a ordem de empilhamento sai da ordem no DOM: a
mídia é renderizada primeiro. O contorno escuro do texto (`SOMBRA_TEXTO`) já
garante leitura sobre imagem clara.

### 3.2 Animação do texto

Coluna `anim_texto TEXT NOT NULL DEFAULT 'subir'`. Valores:

| id | Efeito |
|---|---|
| `nenhuma` | aparece pronto |
| `subir` | sobe e revela — o de hoje |
| `pop` | entra com estouro de escala |
| `maquina` | letra por letra |
| `brilho` | varredura de brilho sobre o título |
| `tremor` | chacoalha uma vez ao entrar |

Aplicada ao **título**. A mensagem entra com o mesmo efeito, atrasada, como já
acontece hoje.

Valor desconhecido vindo do banco cai em `subir`, no mesmo padrão de
`efeitoValido`/`somValido` do `catalogo.ts`.

### 3.3 GIF, imagem e som

`comemoracao_midias.tipo` passa a aceitar `'gif' | 'imagem' | 'som'`. A
classificação é por MIME no envio: `image/gif` → `gif`, `image/png` e
`image/webp` → `imagem`, áudio → `som`. Linhas já existentes permanecem `gif`,
que é o que elas são na prática.

O card tem um slot só, então escolher uma imagem limpa o GIF escolhido e
vice-versa.

`LIMITE_GIF_BYTES` sobe para 10 MB, alinhado ao `file_size_limit` do bucket.

---

## 4. Três estados e disparo único

Estado deixa de ser puramente derivado do relógio:

| Estado | Como é reconhecido |
|---|---|
| **finalizada** | `finalizada_em` **ou** `cancelada_em` preenchidos, **ou** a janela já passou |
| **agendada** | não finalizada e `inicia_em > agora` |
| **em andamento** | não finalizada e dentro da janela |

A ordem importa: "finalizada" é testada primeiro e inclui a janela vencida. Sem
isso, uma comemoração que passou da hora e ainda não foi marcada por ninguém não
se encaixaria em nenhum dos três estados.

Nova coluna `comemoracoes.finalizada_em TIMESTAMPTZ`.

**Quem finaliza.** Duas fontes, ambas idempotentes (`WHERE finalizada_em IS NULL`):

1. o cliente que exibiu o card chama `fn_comemoracao_finalizar(id)` quando a
   duração acaba ou quando o × é clicado;
2. o job do pg_cron (§5.3) fecha quem passou da janela sem ninguém logado para
   fechar — o caso do disparo agendado para o fim do expediente.

**Finalizada nunca mais explode.** O filtro do overlay passa a exigir
`finalizada_em IS NULL`, além do `cancelada_em IS NULL` de hoje.

**Não repetir para quem já viu.** O conjunto de exibidas sai da memória da aba e
vai para o `localStorage`, por usuário, em `comemoracao:vistas::<usuarioId>`:
lista de `{ id, ts }` podada acima de 7 dias. É o que faz F5 e segunda aba
pararem de repetir — a causa real relatada.

As duas camadas resolvem coisas diferentes e as duas são necessárias:
`finalizada_em` fecha a comemoração para **todo mundo**; o `localStorage` impede
que **eu** veja duas vezes a mesma comemoração que ainda está no ar para os
outros.

A lista da aba passa a mostrar as três seções separadas.

---

## 5. Biblioteca: cota, fixados e validade

### 5.1 Colunas novas em `comemoracao_midias`

| Coluna | Regra |
|---|---|
| `fixada BOOLEAN NOT NULL DEFAULT false` | não expira |
| `expira_em TIMESTAMPTZ` | `criado_em + 3 dias`; `NULL` quando `fixada` |

### 5.2 Limites

- **4 fixados por tipo, por empresa** (4 gifs + 4 imagens + 4 áudios). Cota da
  empresa inteira, não por pessoa: a mídia já é compartilhada, e cota por pessoa
  com 10 líderes daria 120 itens fixos contra um teto de 30.
- **30 mídias no total, por empresa**, contando fixadas e temporárias. Espaço só
  volta com exclusão manual ou vencimento.

Ambos no banco, não na tela: `fn_comemoracao_midia_fixar(p_id, p_fixar)` valida a
cota de fixados; um `BEFORE INSERT` barra a 31ª com mensagem legível
("Biblioteca cheia (30). Exclua uma mídia ou espere expirar."). Validação só no
navegador é contornável pela API — mesmo princípio já registrado no cabeçalho do
`comemoracaoMidias.service.ts`.

### 5.3 Faxina

`fn_comemoracao_midias_faxina()` apaga o que venceu: a linha em
`comemoracao_midias` **e** a linha correspondente em `storage.objects`. Agendada
no **pg_cron**, uma vez por dia de madrugada. O mesmo job finaliza as
comemorações vencidas (§4).

> **Mudança de decisão.** A spec de 31/07 descartou o pg_cron para o *disparo* da
> comemoração, e isso continua valendo: disparo depende de granularidade de
> segundos e não pode ter peça móvel. Faxina é outro problema — roda uma vez por
> dia e nada quebra se atrasar.

> **Risco aceito.** Se a extensão `pg_cron` não estiver habilitada no projeto, o
> job não roda e **falha em silêncio**: a biblioteca enche sem ninguém entender o
> porquê. Duas defesas: a RPC de faxina é chamável à mão, e o contador `18/30`
> fica visível no seletor, então o acúmulo aparece antes de virar bloqueio.

### 5.4 Seletor novo

O seletor atual é uma fileira de chips que não cabe 30 itens. Vira um painel com:

- abas **GIFs · Imagens · Áudios**;
- grade de miniaturas — GIF anima no `hover`, imagem mostra o recorte, áudio
  vira cartão com play/pause;
- contador `18/30` e botão de envio no topo;
- por item: **📌 fixar**, **🗑 excluir**, "expira em 2 d" e selo "em uso";
- item escolhido destacado.

---

## 6. Som

### 6.1 Silenciar (§2.3)

Silenciar para a música em andamento. Dessilenciar não a religa.

### 6.2 Volume por comemoração

Hoje o volume é a constante `VOLUME_ARQUIVO = 0.25` no código, igual para todas.

Nova coluna `comemoracoes.volume SMALLINT NOT NULL DEFAULT 100 CHECK (volume BETWEEN 0 AND 100)`,
com slider no editor.

`volume` é **percentual do volume padrão de cada som**, não um ganho absoluto:

- música enviada: `VOLUME_ARQUIVO (0,25) × volume/100`
- som do catálogo: `VOLUME (0,22) × volume/100`

Assim o padrão 100 reproduz exatamente o comportamento atual dos dois, que hoje
já são calibrados diferente de propósito — o arquivo do líder vem masterizado
alto, os sintetizados nascem no volume certo. Um ganho absoluto único obrigaria a
escolher qual dos dois estragar.

### 6.3 Prévia única

Novo módulo `src/lib/previaSom.ts`: um player só para a página inteira.

- `tocarPrevia(url, opcoes)` — **para o anterior** antes de começar;
- `pausarPrevia()` / `estaTocando(url)`;
- o botão de cada item vira Play ↔ Pause.

Resolve o empilhamento e a falta de pausa numa peça só, testável sem montar tela.

---

## 7. Equipe e setor como alvo

Hoje o alvo é sempre uma lista de operadores, e `setores_alvo` é preenchido por
trigger a partir do setor de cada um (mais os setores onde têm clone).

### 7.1 Colunas novas em `comemoracoes`

| Coluna | Regra |
|---|---|
| `alvo_tipo TEXT NOT NULL DEFAULT 'operadores'` | `operadores` · `equipe` · `setor` |
| `equipe_id UUID REFERENCES equipes(id) ON DELETE SET NULL` | só quando `alvo_tipo = 'equipe'` |
| `setor_id UUID REFERENCES setores(id) ON DELETE SET NULL` | só quando `alvo_tipo = 'setor'` |
| `empresa_inteira BOOLEAN NOT NULL DEFAULT false` | ligada quando `alvo_tipo = 'setor'` |

`CHECK` garante a coerência: `equipe` exige `equipe_id`, `setor` exige
`setor_id`, `operadores` exige os dois nulos.

### 7.2 Escopo

A trigger `fn_comemoracao_setores_alvo` passa a decidir por `alvo_tipo`:

- `operadores` — como hoje, a partir dos homenageados;
- `equipe` — `setores_alvo = { setor da equipe }`;
- `setor` — `empresa_inteira = true`; `setores_alvo` deixa de importar.

`deveExplodir` (`escopo.ts`) ganha uma linha: `empresa_inteira` verdadeiro
explode para todo mundo da empresa. Continua sendo filtro de **exibição** — quem
barra a leitura é a RLS, que já libera líder+ na empresa e o operador cujo setor
está em `setores_alvo`. A policy de SELECT ganha `OR empresa_inteira` para o
operador enxergar a comemoração do próprio setor.

### 7.3 Tela

Um seletor de alvo — **Pessoas · Equipe · Setor** — acima da busca. Escolher
equipe ou setor esconde a busca de pessoas e preenche o título:

- `Equipe Alfa bateu a meta!`
- `Setor Receptivo bateu a meta!`

Título continua editável; o preenchimento é sugestão, não trava.

O card não muda: quem monta escolhe a foto ou o GIF da equipe como sempre. Sem
homenageados, o bloco de fotos simplesmente não é renderizado — comportamento que
o componente já tem.

---

## 8. Migration

Uma só: `supabase/migrations/20260801a_comemoracoes_v2.sql`.

1. `comemoracoes`: `modelo`, `anim_texto`, `volume`, `finalizada_em`,
   `alvo_tipo`, `equipe_id`, `setor_id`, `empresa_inteira` + `CHECK` de coerência;
2. `comemoracao_midias`: `fixada`, `expira_em`, `CHECK` de tipo com `imagem`;
3. `fn_comemoracao_setores_alvo` reescrita para os três alvos;
4. policy de SELECT de `comemoracoes` com `OR empresa_inteira`;
5. `fn_comemoracao_finalizar`, `fn_comemoracao_midia_fixar`,
   `fn_comemoracao_midias_faxina`;
6. `BEFORE INSERT` do teto de 30;
7. agendamento no `pg_cron`, condicional à extensão existir — a migration **não
   pode falhar** onde ela não estiver habilitada.

Toda a leitura no front continua tolerando a ausência das colunas, no mesmo
padrão já usado (`dbAtiva`, `midias === null`): quem não aplicou a migration vê a
aba de hoje, não uma tela quebrada.

---

## 9. Testes

Seguindo o padrão da aba — a lógica pura fica fora do componente para ter teste:

| Arquivo | O que cobre |
|---|---|
| `modelos.test.ts` | cada modelo devolve os 4 elementos dentro das margens |
| `CardComemoracao` | a escala é `largura / 640`; card de largura 0 não gera `Infinity` |
| `janela.test.ts` | `finalizada_em` tira do ar; estado nos três casos |
| `vistas.test.ts` | grava, lê, poda acima de 7 dias, tolera `localStorage` indisponível |
| `previaSom.test.ts` | começar um para o anterior; pausar; tocar o mesmo alterna |
| `escopo.test.ts` | `empresa_inteira` explode para todos; equipe só no setor dela |
| `midias.test.ts` | cota de 4 fixados e teto de 30 (funções puras espelhando o banco) |

---

## 10. Fora de escopo

- Redesenho do jogo do pet — **pausado** a pedido, discussão registrada no
  histórico da conversa, sem spec.
- Múltiplas mídias no mesmo card (o slot único é decisão, não limitação).
- Editar comemoração já criada: continua sendo cancelar e criar outra.
