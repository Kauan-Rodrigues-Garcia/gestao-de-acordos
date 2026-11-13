# Quadro de Pessoal — aba «Histórico do mês» (RH)

Data: 13/11/2026 · Branch: `feat/quadro-pessoal` · Pedido do Cleber.

## Objetivo

Dar ao RH, dentro do Quadro de Pessoal, o histórico de movimentação das pessoas
num mês, separado por cidade (Birigui · BookPlay e Marília · PaguePlay):
transferências, mudanças de cargo, desligamentos, reativações, afastamentos,
férias, entradas e trocas de equipe.

É a parte 1 de um plano maior para o RH. Fora desta entrega (cada uma com o seu
spec): etiqueta de situação / online / «sem usar há X dias» na lista de
operadores por setor (parte 2), painel de atenção (parte 3), comunicado do RH
pelo chat (parte 4), anotações feitas pelo próprio RH.

## Decisões tomadas com o Cleber

- **Só leitura.** Tudo vem do que o sistema já registra; o RH não anota nada aqui.
- **Leitura por tipo:** cards de totais por cidade no topo, uma seção por tipo embaixo.
- **Quem entra:** todo mundo, menos a cúpula — fora `super_admin`, `diretoria`
  e conta de sistema (`perfis.robo = true`).
- **Transferência entre cidades** aparece nas duas: saída na origem, entrada no destino.
- **Caminho de dados:** uma função no banco própria do RH (não dar `ver_logs` ao RH,
  não criar tabela nova).

## Dados — `fn_rh_historico_mes(p_empresa uuid, p_mes date)`

Migration nova, `SECURITY DEFINER`, `SET search_path = public` (é RPC chamada pela
tela, não helper embutido). Sem escrita.

**Porta:** `fn_user_tem('ver_rh_gestao') AND fn_user_tem('rh_escopo_todos_setores')`
— o mesmo alcance que abre a aba no menu (`niveisLiberados('rh', …)` inclui
`todos_setores`). Sem a porta: `RAISE EXCEPTION` com código `42501`.
`p_empresa` NULL = todas as empresas a que a pessoa tem acesso
(`fn_can_access_empresa`), igual ao seletor «Todas as empresas» da tela.
`EXECUTE` só para `authenticated`; `REVOKE` de `anon` e `PUBLIC`.

**Janela:** do 1º dia do mês 00:00 até o 1º dia do mês seguinte, fuso
`America/Sao_Paulo`. Mês anterior a 2026-08 devolve vazio (não há log antes de 12/08/2026).

**Fontes e regra de cada tipo:**

| `tipo` | Fonte | Regra |
|---|---|---|
| `transferencia` | `logs_sistema` (`tabela='perfis'`, UPDATE) | `'setor_id' = ANY(campos)`; de = `antes->'setor_id'`, para = `depois->'setor_id'` |
| `troca_equipe` | idem | `equipe_id` mudou **e** `setor_id` não mudou no mesmo registro de log |
| `cargo` | idem | `perfil` mudou; `sentido` = `promocao`/`rebaixamento` por `cargos.nivel`; `NULL` quando um dos cargos não tem nível (`rh`, `assistente_adm`) |
| `desligamento` | idem | `situacao` passou para `desligado`; dia = `desligado_em` quando houver, senão o do log |
| `reativacao` | idem | `situacao` saiu de `desligado` |
| `entrada` | `logs_sistema` (`tabela='perfis'`, INSERT) | pessoa criada no mês; setor = o do cadastro, senão o primeiro que recebeu depois, senão o de hoje. Receber o primeiro setor NÃO é transferência |
| `afastamento` | `ausencias` | `tipo <> 'ferias'` e `[inicio, fim]` cruza o mês; `fim = '9999-12-31'` = sem data de volta |
| `ferias` | `ausencias` `tipo='ferias'` | período cruza o mês; `perfis.ferias_desde/ferias_ate` só cobrem quem tem férias sem linha em `ausencias` |
| `ferias` (jeito antigo) | log de `perfis` | `situacao` virou `ferias` sem data no cadastro: do dia do log até a próxima mudança de situação, ou em aberto |

Ler o log com `antes->'campo'` (jsonb), nunca `->>` — ver memória «logs reconstroem o passado».
Desligamento lançado por `fn_arquivar_desligados_*` (cron) não é evento novo: só a
mudança de `situacao` conta. Um mesmo UPDATE que muda setor e cargo gera **dois**
eventos (transferência e cargo).

**Cúpula fora:** cargo da pessoa no momento do evento (`antes->'perfil'`, senão o de
hoje) não pode ser `super_admin` nem `diretoria`; `perfis.robo` fora.

**Cidade:** pelo setor **no dia do evento** — de origem e de destino na
transferência (o setor vem do log). A cidade do setor é a de hoje:
`setores.cidade_id` → `rh_celulas.nome`, o mesmo nome que `marcaDaCidade`
(`lib/marca.ts`) recebe nas outras telas; setor muda de cidade raramente e o log
de `setores` não entra nesta conta. Pessoa ou setor sem cidade: `NULL`, aparece
em «Sem cidade».

**Saída — uma linha por evento:**

```
tipo text, dia date, pessoa_id uuid, pessoa_nome text, cargo text,
empresa_id uuid,
setor_de_id uuid, setor_de_nome text, cidade_de text,
setor_para_id uuid, setor_para_nome text, cidade_para text,
valor_de text, valor_para text,          -- cargo, equipe, situação
sentido text,                            -- promocao | rebaixamento | NULL
ausencia_tipo text, ausencia_rotulo text, inicio date, fim date,
feito_por text                           -- usuario_nome do log; criado_por da ausência
```

Nomes de setor e equipe resolvidos no banco. Setor/equipe excluído (`excluido_em`)
continua com nome — é âncora, não some.

**Desempenho:** antes de escrever, conferir (com «pode») os índices de
`logs_sistema` em `(tabela, criado_em)`. Sem índice útil, a migration cria
`idx_logs_sistema_tabela_criado (tabela, criado_em)`. Meta: < 300 ms num mês da
BookPlay. Função em plpgsql calculando a janela uma vez (ver memória
«plpgsql só valida em execução» — testar chamando, não só criando).

## Front

**Arquivos novos**

- `src/services/rh/historicoMes.service.ts` — chama a RPC, devolve `EventoRh[]`.
- `src/services/rh/historicoMes.ts` — puro: agrupa por tipo, conta por cidade
  (transferência entre cidades conta nas duas), filtra por cidade e setor,
  ordena por dia. Testado em `historicoMes.test.ts`.
- `src/pages/RhQuadro/AbaHistorico.tsx` — a aba.
- Planilha: função nova em `quadroPessoalPlanilha.ts`, uma aba por tipo.

**Tela**

- 4ª aba «Histórico do mês» entre Equipes e Conferir planilha; `aba=historico`
  na URL, como as outras.
- Seletor de mês com setas; padrão = mês atual; não volta antes de ago/2026.
  Mês corrente com a nota «até agora».
- Filtros: cidade (Todas · Birigui · Marília) e setor. Cards por cidade com os
  totais por tipo; clicar num total aplica cidade + rola até a seção.
- Seções na ordem: Transferências, Mudanças de cargo, Desligamentos, Reativações,
  Afastamentos, Férias, Entradas, Trocas de equipe (esta recolhida). Seção vazia
  não aparece.
- Linha: dia · nome · cargo · de → para · «por Fulano»; transferência entre cidades
  ganha etiqueta «Marília → Birigui»; afastamento/férias mostram o período inteiro
  e a etiqueta do tipo; promoção ▲ / rebaixamento ▼.
- Nome clicável: reaproveita `irParaPessoa` (abre no setor de hoje).
- Carrega ao abrir a aba, uma vez por (empresa, mês); guarda em memória enquanto a
  tela está aberta; «Atualizar» do topo relê. Sem sinal realtime.
- Exportar: botão próprio na aba (o «Exportar Excel» do topo segue sendo o do quadro).

**Erros:** falha da RPC mostra a mesma caixa «Tentar de novo» da tela; `42501`
mostra «Sem acesso ao histórico».

## Testes

- `historicoMes.test.ts`: agrupamento, contagem por cidade (incluindo transferência
  entre cidades contando nas duas), filtro por setor, ordem, seção vazia escondida.
- Teste da migration lida como texto (padrão `*.sql.test.ts`): porta presente,
  `SECURITY DEFINER`, `REVOKE` de anon, nenhum `->>` em `antes`/`depois` onde o
  campo pode ser NULL, cúpula e robô excluídos.
- Conferência no banco **só com «pode» do Cleber**, com o SQL mostrado antes:
  chamar a função para nov/2026 e bater algumas transferências com a aba Logs.

## Banco — o que vai precisar de autorização

1. Leitura: índices de `logs_sistema`.
2. Aplicar a migration nova (e registrar em `schema_migrations`).
3. Leitura de conferência: a função para nov/2026.

Cada uma com o seu «pode».
