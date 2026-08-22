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

Ações: `pix_editar_configuracoes` (percentual de comissão, critérios de meta e
demais ajustes da aba)

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

Escopo: `analitico_escopo_propria` · `analitico_escopo_geral` — vale para o
Analítico **e** para o Recebimento Diário.

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
| Analítico | `ver_analiticos_global` ou `ver_todos_setores` |
| Painel Líder | `ver_todos_setores` → `todos_setores`, senão `setor` |
| Usuários | `ver_todos_setores` → `todos_setores`, senão `proprio_setor` |
| Equipes | `ver_equipes` + `ver_todos_setores` |
| Metas | `ver_metas` + `ver_todos_setores` |
| Tickets | `individual` para todos |

`equipe` só nasce ligado onde `filtrar_por_equipe` já está ligado hoje.

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
| `pix_editar_configuracoes` | `aprovar_pix_automatico` |
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
