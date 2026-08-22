# Permissões por aba — projeto

Desenho da nova estrutura. Escrito depois do levantamento em
[PERMISSOES-ANALISE-ATUAL.md](PERMISSOES-ANALISE-ATUAL.md) e **antes** de
qualquer código, para ser revisado como desenho.

Decisão tomada em 2026-08-22: o escopo por aba **também amplia** o alcance de um
cargo, não apenas estreita.

---

## 1. O que "ampliar" exige, e o que ele custa

Hoje o RLS decide por cargo, setor e empresa, e nenhuma política consulta o mapa
de permissões. Para "Pix Automático → todos os setores" funcionar de verdade num
líder da BookPlay — cujo teto atual é o próprio setor — o banco precisa passar a
consultar o mapa.

### O problema que não tem saída limpa

Uma política em `acordos` **não sabe de qual aba veio a consulta**. Acordos,
Lixeira, Dashboard e Pix Automático leem a mesma tabela. PostgREST não carrega
"estou na aba X" para dentro da política.

Portanto, com escopo por aba que amplia, só existem dois desenhos possíveis:

| | Como funciona | Custo |
| --- | --- | --- |
| **Teto = maior escopo** | A política concede o MAIOR escopo entre todas as abas do cargo. Cada aba estreita na própria consulta. | O teto do banco sobe para o maior escopo. Chamada direta à API alcança esse teto, não o da aba. |
| **Tudo por RPC** | Toda leitura passa por RPC `SECURITY DEFINER` que recebe o contexto da aba. | Superfície nova e delicada; `SECURITY DEFINER` ignora RLS por construção. Foi o caminho de 20/08. |

**Este projeto adota o primeiro.** É coerente com a arquitetura que já existe —
RLS é teto, a tela estreita — e não cria funções privilegiadas novas.

### A consequência, dita sem rodeio

> Conceder "Pix Automático → todos os setores" a um cargo **levanta o teto de
> `acordos` daquele cargo para todos os setores**, inclusive fora do Pix.
>
> Na tela, Acordos continua mostrando só o que a aba dele permite. Mas uma
> chamada direta à API, feita por alguém com o token daquele usuário, alcança o
> teto — não o recorte da aba.

Isso não é regressão: hoje a mesma pessoa já alcança o teto dela por chamada
direta, e a tela já é quem estreita. O que muda é **quão alto o teto sobe** para
quem receber um escopo amplo em qualquer aba.

Regra prática que sai daí, e que o painel precisa deixar visível:

> Escopo amplo numa aba é decisão sobre o **dado**, não sobre a **tela**.

---

## 2. Nomenclatura

Três formatos, e nada fora deles:

| Forma | Significa | Exemplo |
| --- | --- | --- |
| `aba_<nome>` | A aba principal existe para o cargo | `aba_acordos` |
| `<aba>_sub_<nome>` | Aba interna daquela aba | `analitico_sub_colchao` |
| `<aba>_escopo_<nivel>` | Escopo de dados **daquela aba** | `pix_escopo_todos_setores` |
| `<aba>_<acao>` | Ação dentro da aba | `usuarios_editar_senha` |

Níveis de escopo, sempre nesta ordem: `individual`, `equipe`, `setor`,
`todos_setores`.

**Regra de dependência:** desligar `aba_x` torna toda chave `x_*` inefetiva, sem
exceção. Isso é resolvido no leitor, não por gravação em cascata — assim religar
a aba devolve a configuração que já existia, em vez de exigir refazer tudo.

---

## 3. Inventário completo

### 3.1 Abas principais

`aba_dashboard`, `aba_acordos`, `aba_novo_acordo`, `aba_pix_automatico`,
`aba_painel_lider`, `aba_painel_diretoria`, `aba_usuarios`, `aba_configuracoes`,
`aba_lixeira`, `aba_analitico`, `aba_tickets`, `aba_importar_excel`,
`aba_campanha_facil`, `aba_ouvidoria`, `aba_solicitar_atendimento`

Pix Automático é aba principal no painel mesmo aparecendo dentro de Acordos na
tela — foi pedido assim, e é o que o torna independente de `aba_acordos`.

### 3.2 Dashboard

Escopo: `dashboard_escopo_individual` · `_equipe` · `_setor` · `_todos_setores`

Sem ações próprias. O filtro único e dinâmico é consequência do escopo, não
permissão separada.

### 3.3 Acordos (BookPlay)

Escopo: `acordos_escopo_individual` · `_equipe` · `_setor` · `_todos_setores`

Ações: `acordos_criar`, `acordos_editar`, `acordos_excluir`,
`acordos_excluir_em_lote`, `acordos_alterar_status`

`aba_novo_acordo` é subordinada a `aba_acordos`: com Acordos desligada, Novo
Acordo é sempre inefetiva; com Acordos ligada, pode ser desligada sozinha.

### 3.4 Pix Automático

Escopo: `pix_escopo_individual` · `_equipe` · `_setor` · `_todos_setores`

Ações: `pix_editar_configuracoes` (percentual de comissão, interruptor de
registro manual e as metas de Pix do setor)

> ⚠️ **Os níveis aqui decidem só o que a pessoa VÊ.** Aprovar Pix mexe em
> comissão: aprovar, reprovar, editar registro alheio, restaurar da lixeira e
> registrar em nome de outro seguem em `aprovar_pix_automatico` e numa lista de
> cargo (`podeAgirSobreOutros` no arquivo). Separá-las do cargo é trabalho da
> fase de ações — fazê-lo junto com o escopo arriscaria tirar de alguém um
> botão que hoje funciona.

### 3.5 Lixeira

Escopo: `lixeira_escopo_individual` · `_equipe` · `_setor` · `_todos_setores`

Ações: `lixeira_restaurar`, `lixeira_limpar`

### 3.6 Painel Líder

Escopo: `painel_lider_escopo_setor` · `painel_lider_escopo_todos_setores`

Abas internas: `painel_lider_sub_acompanhamento`, `_sub_desempenho_equipes`,
`_sub_quartis`, `_sub_grafico_recebimento`

### 3.7 Painel Diretoria

Só `aba_painel_diretoria`. Sem escopo e sem ações, como pedido.

### 3.8 Analítico

Escopo: `analitico_escopo_individual` · `_setor` · `_todos_setores` — vale para
o Analítico **e** para o Recebimento Diário.

> ✏️ **Corrigido na implementação (fase 4).** Este documento previa dois níveis,
> `propria` e `geral`. Estavam errados: a tela sempre teve **três** alcances —
> operador vê os próprios números, liderança vê o setor, cúpula escolhe entre os
> setores. Com dois níveis, `geral` teria que significar "setor" e "todos os
> setores" ao mesmo tempo, e um líder ganharia o filtro de setor que não tem
> hoje — exatamente a concessão automática que o §5 do pedido proíbe.
>
> `equipe` continua de fora: o seletor de equipe do Recebimento Diário recorta
> dentro do setor que a pessoa já enxerga. É filtro de tela, não permissão.

Abas internas primárias: `analitico_sub_analitico`, `_sub_recebimento_diario`,
`_sub_colchao`

Abas internas secundárias: `analitico_sub_por_operador`,
`_sub_formas_pagamento`, `_sub_ranking`, `_sub_destaques_dia`,
`_sub_sem_operador`

### 3.9 Usuários

Escopo: `usuarios_escopo_proprio_setor` · `usuarios_escopo_todos_setores`

Abas internas: `usuarios_sub_usuarios`, `_sub_setores`, `_sub_equipes`,
`_sub_metas`, `_sub_comemoracoes`

**Usuários:** `usuarios_alterar_situacao` (férias / desligado / ativo),
`usuarios_entrar_como`, `usuarios_editar`, `usuarios_excluir`,
`usuarios_editar_senha`

**Setores:** `setores_criar`, `setores_editar`, `setores_transferir_usuario`

`setores_transferir_usuario` é exclusiva desta aba. Hoje ativar transferência
libera também em Equipes — isso acaba.

Quem tem `usuarios_sub_setores` enxerga **todos os setores da empresa dentro
dessa aba**, e só dentro dela. Não vaza para outras telas.

**Equipes:** `equipes_escopo_proprio_setor` · `equipes_escopo_geral`,
`equipes_editar` (inclui criar, como pedido)

**Metas:** `metas_escopo_proprio_setor` · `metas_escopo_todos_setores`,
`metas_editar`, `metas_editar_dias_uteis`, `metas_editar_quartis`

**Comemorações:** só `usuarios_sub_comemoracoes`. Ligada, a aba vem inteira.

### 3.10 Tickets

Escopo: `tickets_escopo_individual` · `_equipe` · `_setor`

Ações: `tickets_abrir`, `tickets_atender`, `tickets_solicitar_atendimento`

### 3.11 Ouvidoria (PaguePlay)

Mantém as duas permissões atuais. Nada novo.

### 3.12 Solicitar Atendimento (PaguePlay)

`solicitar_editar_responsaveis`, `solicitar_ver_todas`, `solicitar_criar`

### 3.13 Configurações

`aba_configuracoes` mais uma chave `configuracoes_sub_<nome>` por aba interna
existente, levantadas na implementação.

### 3.14 Sem configuração interna

`aba_importar_excel` e `aba_campanha_facil`: só ligar e desligar.

---

## 4. Derivação: como cada chave nova nasce

Esta é a parte crítica. Toda chave nova é calculada do **estado efetivo atual**
do cargo. Nenhuma nasce de valor padrão.

### 4.1 Abas

| Chave nova | Nasce de |
| --- | --- |
| `aba_acordos` | `ver_acordos` |
| `aba_analitico` | `ver_analitico` |
| `aba_painel_lider` | `ver_painel_lider` |
| `aba_painel_diretoria` | `ver_painel_diretoria` |
| `aba_ouvidoria` | `ver_ouvidoria` |
| `aba_campanha_facil` | `ver_campanha_facil` |
| `aba_solicitar_atendimento` | `ver_solicitacoes_whatsapp` |
| `aba_pix_automatico` | `ver_pix_automatico` |
| `aba_lixeira` | `ver_lixeira` |
| `aba_configuracoes` | `ver_configuracoes` |
| `aba_usuarios` | `ver_usuarios` |
| `aba_importar_excel` | `importar_excel` |
| `aba_novo_acordo` | `criar_acordos` |
| **`aba_dashboard`** | **`true` para todos** |
| **`aba_tickets`** | **`true` para todos** |

As duas últimas são as que exigem atenção:

- **Dashboard não tem permissão hoje.** É a tela inicial e todo mundo a vê.
  Nascer `false` tiraria o Dashboard de todos no mesmo deploy.
- **Tickets não é decidido por permissão**, e sim por `useTicketsAcesso`
  (administrador OU atendente OU (`liberado_para_lideranca` E liderança)). A
  chave nasce `true` e **o gate continua valendo por cima** até alguém decidir o
  contrário. Nascer `false` fecharia a aba para os atendentes atuais.

### 4.2 Escopos

O escopo atual efetivo de um cargo, hoje, é:

```
todos_setores  se ver_todos_setores
setor          se ver_acordos_gerais            (teto do RLS decide o alcance real)
individual     caso contrário
```

Cada aba recebe **o mesmo escopo que ela tem hoje**, calculado da chave que a
governa hoje:

| Aba | Escopo derivado de |
| --- | --- |
| Dashboard | `ver_acordos_gerais` + `ver_todos_setores` |
| Acordos | `ver_acordos_gerais` + `ver_todos_setores` |
| Lixeira | `ver_acordos_gerais` + `ver_todos_setores` |
| Pix Automático | `ver_acordos_gerais` + `ver_todos_setores` |
| Analítico | cargo (`isLiderMais`, `isElite`) + `ver_analiticos_global` / `ver_todos_setores` |
| Painel Líder | `ver_todos_setores` → `todos_setores`, senão `setor` |
| Usuários | `ver_todos_setores` → `todos_setores`, senão `proprio_setor` |
| Equipes | `ver_equipes` + `ver_todos_setores` |
| Metas | `ver_metas` + `ver_todos_setores` |
| Tickets | `individual` para todos |

`equipe` só nasce ligado onde `filtrar_por_equipe` já está ligado hoje.

> ✏️ **Corrigido na implementação (fase 5a).** Isto vale para o Dashboard, onde
> `filtrar_por_equipe` acendia o seletor. Em **Acordos** quem acendia os
> atalhos de equipe era `isPerfilLider(cargo)`, uma lista de cargo escrita na
> tela — então lá `equipe` nasce dessa lista, e a `diretoria`, que nunca viu os
> atalhos, nasce sem o nível.

### 4.2-b Chave nova nasce `true` para acesso total

`temPermissao` devolve `true` para tudo quando o cargo é `administrador` ou
`super_admin`, e o semeador de `permissoes_2_0` grava `true` para os dois por
construção. A única exceção legítima é `ignorar_fechamento_mes`, que exige
concessão explícita.

Uma derivação que saia do CARGO quebra isso sem avisar — foi o que a fase 4 fez
com `analitico_escopo_individual`, gravando `false` para admin. É inerte no app
(o curto-circuito de `temPermissao` responde antes), mas é uma **armadilha para
a fase 7**: uma policy que calcule o teto lendo o JSON não tem curto-circuito
nenhum, e leria `false` como restrição de verdade.

A migration da fase 5a corrigiu a linha e passou a **verificar o invariante** no
bloco de prova. Toda migration nova deve repetir essa verificação.

**Tickets nasce `individual` para todos** porque a tabela é nova (19/08) e tem
RLS próprio, que continua sendo o piso. Nenhum escopo mais amplo existe hoje
para derivar.

### 4.3 Ações

| Chave nova | Nasce de |
| --- | --- |
| `acordos_criar` | `criar_acordos` |
| `acordos_editar` | `editar_acordos` |
| `acordos_alterar_status` | `editar_acordos` |
| `acordos_excluir` | `excluir_acordos` |
| `acordos_excluir_em_lote` | `excluir_em_lote` |
| ~~`pix_editar_configuracoes`~~ | ~~`aprovar_pix_automatico`~~ — **errado, ver abaixo** |
| `lixeira_restaurar` | `ver_lixeira` |
| `lixeira_limpar` | `excluir_em_lote` |
| `usuarios_editar` | `editar_usuarios` |
| `usuarios_excluir` | `editar_usuarios` |
| `usuarios_editar_senha` | `editar_usuarios` |
| `usuarios_alterar_situacao` | `editar_usuarios` |
| `usuarios_entrar_como` | `editar_usuarios` |
| `setores_criar` / `setores_editar` / `setores_transferir_usuario` | `editar_usuarios` |
| `equipes_editar` | `editar_equipes` |
| `metas_editar` / `_dias_uteis` / `_quartis` | `gerenciar_metas` |
| `solicitar_criar` | `criar_solicitacao_whatsapp` |
| `solicitar_ver_todas` | `ver_acordos_gerais` |
| `solicitar_editar_responsaveis` | `gerenciar_acessos_ouvidoria` |
| `tickets_abrir` | `true` (hoje quem vê a aba abre) |
| `tickets_atender` | é atendente hoje |
| `tickets_solicitar_atendimento` | `true` |

> ✏️ **Corrigido na implementação (fase 5b).** `pix_editar_configuracoes` **não**
> nasce de `aprovar_pix_automatico`. Derivar assim erraria nos dois sentidos:
> `elite` e `ouvidoria` têm o painel de configuração hoje e **não** têm
> `aprovar_pix_automatico` — perderiam o percentual de comissão do setor; e
> `diretoria` tem `aprovar_pix_automatico` e **não** tem o painel — ganharia
> poder de editar comissão que nunca teve.
>
> Quem acende o painel hoje é `isPerfilAdminOuLider(cargo)`, e é daí que a chave
> nasce. Mesmo tipo de erro que a fase 1 pegou em `lixeira_limpar`: a tabela
> acima foi escrita por afinidade de nome, e o código diz outra coisa.
>
> **Regra que sai disso:** conferir a derivação de toda ação contra o gate REAL
> na tela, nunca contra a chave de nome parecido.

### 4.4 Abas internas

Todas nascem `true` quando a aba-mãe está ligada. Nenhuma aba interna é
escondida hoje, então nascer `false` removeria conteúdo que já existe.

### 4.5 A regra que fecha

Depois de derivar, uma verificação automatizada compara **acesso efetivo antigo
× acesso efetivo novo**, cargo a cargo, chave a chave, nas duas empresas. A
migração aborta se algum cargo ganhar ou perder acesso.

Foi isso que faltou em 20/08: a derivação existia, mas a prova de equivalência
não rodava contra o estado real das duas empresas.

---

## 5. Fases

Cada fase é um commit revisável e reversível sozinho. O catálogo tem teste de
contrato que exige toda chave consultada em código — então **chave nova e seu
consumidor entram juntos**, sempre.

| Fase | O quê |
| --- | --- |
| 1 | Catálogo novo (TS + SQL), migração de derivação, prova de equivalência |
| 2 | Resolvedor por aba no frontend, substituindo `veTodosOsSetores` |
| 3 | Painel de permissões: abas, escopos, ações, dependências |
| 4 | Dashboard: filtro único e dinâmico ligado ao escopo da aba |
| 5 | Acordos, Lixeira, Pix — escopo próprio e filtro coerente |
| 6 | Painel Líder, Analítico, Usuários, Tickets |
| 7 | RLS: teto elevado ao maior escopo, com testes por cargo |
| 8 | Remoção das seis chaves globais |

A fase 7 é a única que mexe em segurança, e vem depois de tudo funcionar com o
teto atual. Assim, se ela precisar voltar, as fases 1 a 6 continuam de pé.

A fase 8 só roda quando nenhuma leitura das chaves antigas sobrar no código.

### 5.1 Como as fases realmente saíram

O quadro acima separava por **camada** (catálogo, resolvedor, painel, telas). Na
execução isso não se sustentou: o teste de contrato exige que chave nova e seu
consumidor entrem **juntos**, então cada fase virou **uma aba inteira** —
catálogo, migração, prova de equivalência e telas no mesmo commit. É mais
revisável e reversível sozinho, que era o objetivo declarado.

| Fase | Aba | Commit | Estado |
| --- | --- | --- | --- |
| 1 | Lixeira (escopo + restaurar/limpar) | `7d5b245` | ✅ produção |
| 2 | Painel Líder (escopo + 4 abas internas) | `6ac51d9` | ✅ produção |
| 3a | Dashboard (escopo) | `d53a653` | ✅ produção |
| 3b | Dashboard (filtro único; 2 chaves aposentadas) | `2218117` | ✅ produção |
| 4 | Analítico (escopo + 8 abas internas; encerra `veTodosOsSetores`) | `2b88f00` | ✅ produção |
| 5a | Acordos (escopo; aposenta `ver_acordos_gerais`) | `0bad254` | ✅ produção |
| 5b | Pix Automático (escopo + `pix_editar_configuracoes`) | `3bf7585` | ✅ produção |
| 6a | Painel Diretoria; fim de `ver_todos_setores` | `7dbb711` | ✅ produção |
| 6b | Usuários | `dcc10f8` | ✅ produção |
| 7 | RLS de `acordos` lê o mapa, com o teto no lugar | `43a1a63` | ✅ produção |
| 8 | Faxina das chaves aposentadas | — | ✅ produção |

### 5.2 O que a fase 7 fez, e o que ela deixou para decidir

A policy de `acordos` deixou de decidir por listas de cargo e passou a ler o
mapa, por `fn_user_escopo_acordos()`. **Ninguém ganhou acesso**: o escopo é
cortado por `fn_teto_rls_acordos`, e nenhum cargo tem escopo menor que o teto —
o resultado é idêntico, linha por linha.

O que mudou de verdade: **baixar um escopo no painel agora baixa o acesso no
banco**, não só na tela.

O teto continua segurando cinco cargos. Levantar cada um é decisão de quem
responde pelo dado, e o lugar é `fn_teto_rls_acordos` — quatro linhas, feitas
para serem editadas com nome e data:

| Cargo | Tem hoje | Passaria a ter | Vem de |
| --- | --- | --- | --- |
| bookplay/gerencia | setor | todos os setores | Pix |
| bookplay/ouvidoria | só os próprios | setor | Dashboard, Acordos, Lixeira |
| pagueplay/elite | só os próprios | setor | Dashboard |
| pagueplay/gerencia | só os próprios | setor | Dashboard |
| pagueplay/ouvidoria | só os próprios | setor | Dashboard |

### 5.3 O que ficou de fora, e por quê

- **Tickets** não é governado por permissão: quem vê a aba sai de
  `useTicketsAcesso` (flag por empresa + cadastro de atendentes + cargo).
  Chaves ali nasceriam sem consumidor, e o teste de contrato reprova — foi
  exatamente chave decorativa que gerou o defeito de 15/08.
- **Configurações** é uma aba única atrás de `ver_configuracoes`, que só o
  administrador tem.
- **Ações por aba** (§4.3): as puras renomeações são churn. As que valem são as
  que SEPARAM um poder que hoje anda junto — `acordos_alterar_status` saindo de
  `editar_acordos`, e as ações do Pix saindo da lista de cargo
  (`podeAgirSobreOutros`). Entram quando alguém precisar delas.
- **O defeito dos KPIs do Dashboard**: quem tem `todos_setores` não estreita os
  cartões ao escolher "só os meus". Encontrado na fase 6a e não corrigido de
  propósito — muda número na tela de quem já usa o painel.

O painel de permissões (a antiga fase 3) não precisou de fase própria: ele
desenha `GRUPOS_PERMISSAO` e o catálogo, então cada aba nova aparece nele
sozinha ao ser registrada.

**As ações de aba (§4.3) ficaram de fora das fases de escopo, de propósito.**
Renomear `criar_acordos` para `acordos_criar` é churn: a chave já é da aba, só
muda a ordem das palavras, e ela governa a rota de Novo Acordo que a PaguePlay
também usa — onde a aba Acordos nem existe. As que valem trabalho são as que
**separam** um poder que hoje anda junto (`acordos_alterar_status` saindo de
`editar_acordos`, `pix_editar_configuracoes` saindo de
`aprovar_pix_automatico`), e essas entram com a aba correspondente.
