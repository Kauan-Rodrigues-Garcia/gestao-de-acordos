# App do celular: abrir sempre no app, unidade Cofen e a visão da gerência

Data: 06/10/2026 · Pedido: Cleber · Desenho aprovado na conversa, parte a parte.

A diretoria liberou o app para todo mundo baixar. Antes disso, três coisas:

1. **Correções e desempenho** — o app às vezes abre o site do computador; o
   aviso de «modo leve» aparece no celular; e o app precisa ficar mais leve.
2. **A tela da gerência** (`/m/setor`), irmã da tela do líder, e o Cofen em
   H.O. com interruptor para bruto em todo o app.
3. **Os avisos da gerência**.

Diretoria, super admin e administração ficam para depois.

---

## Parte 1 — Correções e desempenho

### 1.1 Abrir sempre no app

Diagnóstico (código de 06/10/2026). A decisão de mandar para o app mora só na
rota `/` (`useDesvioDoCelular` + `PainelDeEntrada`, em `App.tsx`) e falha em
quatro situações:

| # | Situação | Por quê |
|---|---|---|
| a | Internet ruim | O desvio não espera o perfil: com `user` e sem `perfil`, devolve `null`, o site desenha e, se o perfil não carregar, fica nele. |
| b | «Versão completa» tocada uma vez | Fica em `localStorage` para sempre naquele aparelho. |
| c | Celular deitado / «site para computador» | `ehCelular` olha `innerWidth ≤ 768`. |
| d | Link para outra rota | Só `/` desvia. |

Regras novas:

- **É celular** quando o app está instalado (`display-mode: standalone`) — sempre —
  ou, no navegador, quando há toque grosso e o **menor lado da tela**
  (`min(screen.width, screen.height)`) é ≤ 768. A largura da janela deixa de
  decidir.
- **Espera o perfil.** Com sessão e sem perfil, mostra o esqueleto do app, nunca
  o site. Se o perfil falhar, tela do app «Sem conexão · Tentar de novo».
- **Qualquer rota.** Quem pode usar o app, no celular e sem «Versão completa»
  ativa, é levado a ele a partir de qualquer rota do site (não só `/`). As rotas
  do próprio app (`/m…`), o login e a TV ficam de fora.
- **«Versão completa» vale até fechar o app** (`sessionStorage`). A escolha antiga
  em `localStorage` (`mobile:versao`) é apagada na primeira abertura depois da
  atualização. O atalho «Versão para celular» do site continua.
- **Gerência entra no app**: `gerencia` passa a abrir na tela mínima, com destino
  `/m/setor`. Destinos: líder → `/m/equipe`; gerência → `/m/setor`; quem recebe
  no próprio nome → `/m`.

### 1.2 «Modo leve» fora do celular

`SugestaoModoLeve` não monta (nem observa travadas) nas rotas do app e no app
instalado. O modo leve continua existindo para o site.

### 1.3 Desempenho

Medir o que `/m`, `/m/equipe` e `/m/setor` baixam e executam hoje (código,
provedores globais, Halloween, tempo real, presença) e tirar do caminho do app o
que ele não usa, sem perder o que já existe (chat, avisos, Halloween parado).
Os números de antes e depois vão no commit.

### 1.4 Testes

Puros: «é celular» (instalado, deitado, modo computador), «Versão completa» na
sessão, destino por cargo, desvio a partir de qualquer rota. Suíte inteira
verde.

---

## Parte 2 — Tela da gerência e a unidade Cofen

### 2.0 As três visões (Cleber, 06/10/2026 — revisão)

Cada cargo escolhe a visão no topo (Eu · Equipe · Setor). A primeira aba de
Equipe e de Setor é o **Resumo** — um painel «de casa»: recebido do mês, recebido
hoje, meta, quanto falta, quanto devia ter hoje, onde fecha e a faixa do ritmo.
Só números do conjunto; nenhum nome, nenhuma lista de pessoas.

| Cargo | Eu | Equipe | Setor |
|---|---|---|---|
| operador | completa (a de hoje) | **só o Resumo** (a equipe do cadastro) | **só o Resumo** (o setor do cadastro) |
| elite | completa | completa (a equipe dele) | completa (o setor do cadastro) |
| líder | — | completa (as que lidera) | completa (o setor do cadastro) |
| gerência | — | completa (escolhe entre as equipes do setor) | completa |

«Completa» = Resumo + as abas Quartis, Gráfico e Hoje e os cartões por equipe e
pessoa. Operador NUNCA vê quartil, lista ou valor de outra pessoa.

**Onde mora cada visão.** A troca Eu · Equipe · Setor fica no topo das três telas.
- Operador: tudo dentro de `/m`. Equipe e Setor desenham só o Resumo, lido de
  `fn_app_resumo_visoes` — ele nunca entra em `/m/equipe` nem `/m/setor`, que
  continuam exigindo `ver_painel_lider`.
- Elite: Eu em `/m`; Equipe leva a `/m/equipe`; Setor leva a `/m/setor`.
- Líder: abre em `/m/equipe`; Setor leva a `/m/setor`.
- Gerência: abre em `/m/setor`; Equipe leva a `/m/equipe`, com as equipes do setor
  no seletor.

**De onde vem cada visão**

- **Elite, líder e gerência** já têm escopo de SETOR no Painel Líder e no
  Analítico (`painel_lider_escopo_setor`, `analitico_escopo_setor` — conferido no
  banco em 06/10, BookPlay e PaguePlay). As visões completas usam as mesmas
  fontes do Painel Líder (`carregarFontes`), sem abrir nada novo.
- **Operador** tem escopo individual: o Resumo de equipe e de setor vem de uma
  função nova no banco, `fn_app_resumo_visoes(p_mes)`, SECURITY DEFINER, que
  descobre a equipe e o setor de QUEM CHAMA e devolve só os totais deles — nunca
  de outra equipe ou setor, nunca linha de pessoa:
  - equipe: `fn_recebido_por_equipe` (a régua do card do Painel Líder, já usada
    pelo desafio e pelos avisos);
  - setor Nosso produto: `fn_recebido_por_setor` (nova, extraída do total de
    setor que o desafio já valida contra o Painel — normal pelo carimbo,
    alternativo pela gente dele);
  - setor Cofen: o relatório de conciliação (ver 2.5);
  - metas: a da equipe e a do setor na aba Metas.

### 2.1 Quem abre

- Cargo `gerencia` abre em `/m/setor`, no **setor do cadastro** (`perfis.setor_id`;
  o cargo pertence a setor — os 7 gerentes de 06/10 têm setor). Sem setor: aviso
  «Seu cadastro está sem setor» e o link para a versão completa.
- Sem troca «Eu / Equipe»: a gerência não está no ranking (0adb5508).
- Super admin testa como hoje: escolhe um gerente e entra como ele.
- A rota exige `ver_painel_lider` (a chave da tela do líder; o padrão da
  liderança inclui a gerência), como `/m/equipe`.

### 2.2 Topo

Foto, nome do setor, mês. Em setor Cofen, o interruptor **H.O. | Bruto** (abre em
H.O.; lembrado no aparelho).

### 2.3 Abas

1. **Setor** — cartão principal: recebido do mês × meta do setor, quanto devia
   ter hoje, onde fecha, ritmo (a conta do Painel Líder). Embaixo, um cartão por
   equipe do setor, do melhor para o pior % da meta; tocar abre a equipe com as
   pessoas (o modelo da tela do líder).
2. **Quartis** — primeiro um cartão do setor, minimalista: uma barra Q1–Q4 com,
   para cada faixa, a quantidade e o % das pessoas do setor. Depois as pessoas
   separadas por equipe.
3. **Gráfico** — dia a dia do setor contra o caminho da meta. Abaixo, o cartão
   «Equipes», recolhido; ao tocar, expande e mostra um minigráfico diário de cada
   equipe.
4. **Hoje** — seletor no topo «Setor · Equipe 1 · Equipe 2…» (um toque, desliza
   na horizontal): recebido de hoje, quantidade e a lista de pagamentos do dia
   do que estiver escolhido.

### 2.4 Fonte dos números

As mesmas do Dashboard e do Painel Líder — o 59 escreve no analítico e o 58
complementa; nada de conta nova:

- `carregarFontes` (o que o celular da equipe já usa) e `montarEquipe` para cada
  equipe do setor;
- acumulado do setor por `acumuladoDoSetor` (regra do setor: alternativo soma a
  gente dele; líder em alternativo conta só no setor — regras de 06/10);
- meta = meta do SETOR na aba Metas;
- atualização pelo mesmo sinal de tempo real do Painel Líder, sem canal novo.

### 2.5 Cofen em todo o app

Vale para operador (`/m`), líder (`/m/equipe`) e gerente (`/m/setor`) de setor
com regra Cofen (`tenant.isPaguePlay` já responde pela regra do setor da pessoa
desde 02/10):

- o interruptor **H.O. | Bruto** aparece só para Cofen; abre em H.O.;
- troca TUDO o que tem valor: recebido, meta, faixas, quartis, gráfico, Hoje e a
  lista de pagamentos (hoje gráfico, Hoje e lista estão em bruto);
- meta em H.O. por `metaNaUnidade` (a régua do site);
- **o total do SETOR Cofen é o do card do Painel Líder**: o relatório de
  conciliação (`fn_pp_conciliacao_setor` — bruto `total`, H.O. `pp`, pela coluna
  `data`), NUNCA a soma das pessoas. Equipe e pessoa Cofen seguem o analítico
  (`total_ho`), como no Painel Líder.

### 2.6 Testes

Puros, sobre a montagem do setor: soma das equipes, quartis do setor, Cofen em
H.O. e em bruto — com setor normal, alternativo e Cofen.

---

## Parte 3 — Avisos da gerência

### 3.1 Quem recebe

Gerente do setor: cargo `gerencia`, ativo, `setor_id` = o setor, com aparelho e
avisos ligados. Nova `fn_push_destinatarios_setor`, irmã de
`fn_push_destinatarios_equipe`.

### 3.2 Os quatro avisos (interruptores no app, todos começam LIGADOS)

| Aviso | Quando | Exemplo |
|---|---|---|
| Setor bateu a meta | recebido do setor passa da meta do setor (uma vez no mês) | «Play 1 alcançou a meta do mês · R$ 420.312,00» |
| Equipe bateu a meta | cada equipe do setor que passa da meta | «Equipe da Ana alcançou a meta · Play 1» |
| Pessoa bateu a meta | cada pessoa do setor na 1ª, 2ª ou 3ª meta | «Maria S. alcançou a 2ª meta · Equipe da Ana» |
| Resumo do setor | todo hora cheia + 10 min (`10 * * * *`), logo depois de o 59 atualizar; só se entrou dinheiro na última hora | «Play 1 recebeu R$ 12.400,00 na última hora · R$ 38.540,00 hoje» |

### 3.3 Regras

- **Por estado**, como os do líder: marco de setor em `push_marcos_setor` (única por
  setor e mês); equipe e pessoa reaproveitam os marcos existentes
  (`push_marcos_operador`, `push_marcos_equipe`). Reimportar não repete; ao
  ligar, grava o que já foi alcançado sem avisar. O resumo por hora guarda o
  total do dia por setor a cada rodada (`push_resumo_setor`); «na última hora» é
  o total de agora menos o da rodada anterior. Cofen: total da conciliação, em
  H.O.
- **Sem enxurrada**: várias pessoas na mesma rodada viram UM aviso por gerente
  («3 pessoas do Play 1 alcançaram metas»), com os nomes no corpo.
- **Cofen: só H.O.** em todo aviso, dito com clareza («R$ 226,00 em H.O.»), sem o
  bruto. Vale também para o aviso de pagamento do operador Cofen (antes bruto,
  decisão de 30/09 substituída em 06/10).
- Tocar no aviso abre `/m/setor` na aba certa (marco → Setor; resumo → Hoje).

### 3.4 Banco e Edge Function

- Migration: `push_marcos_setor`; `fn_push_destinatarios_setor`; marco do setor e
  resumo do setor; quatro chaves em `push_preferencias` (`setor_meta`,
  `setor_metas_equipes`, `setor_metas_operadores`, `setor_resumo`); rodada de metas
  ampliada; aviso de pagamento Cofen em H.O.
- `enviar-push`: textos novos e H.O. do Cofen; republicar os DOIS arquivos
  (`index.ts`, `texto.ts`), verify_jwt desligado.
- Testes dos textos novos, como os de `texto.ts`.

---

## Ordem de entrega

1. Parte 1 (libera a distribuição).
2. Parte 2.
3. Parte 3 (migration aplicada pelo SQL Editor, conferida e registrada; Edge
   Function republicada).

## Fora do escopo

Visão da diretoria, super admin e administração no app; senha (decisão da TI).
