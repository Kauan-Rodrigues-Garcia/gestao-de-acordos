# Cantina no gestão — fases 1 e 2

Data: 22/10/2026 · Pedido do Cleber · Status: aprovado em conversa, a implementar

## Objetivo

Trazer o cardápio da cantina (hoje uma janela Windows feia do sistema da empresa)
para dentro do gestão, com:

- **Fase 1 — colaborador:** cardápio bonito, carrinho, retirada em faixas de 15 min,
  acompanhamento do pedido e conversa com a cantina.
- **Fase 2 — cantina:** painel com a fila do dia por status, chat por pedido,
  marcar «não retirado» e exportar os não retirados do mês (desconto em folha).

Fora do escopo agora (YAGNI): tela de configuração da cantina (fase 3 — preço,
item, ordem, foto, aviso), relatório próprio do RH, estoque, aba no app do celular,
push no celular. O cardápio inicial entra pela migration.

## Decisões

| # | Decisão |
|---|---|
| 1 | Cantina é **empresa própria** (`empresas.produto = 'cantina'`), com cargo novo `cantina`. O menu é lista branca por produto: a cantina só vê o que for marcado `cantina`. |
| 2 | Acesso por **permissão**, nunca por cargo: `ver_cantina` (pedir; nasce para todos os cargos da operação) e `cantina_painel` (fila; só o cargo `cantina` da empresa Cantina, e acesso total por construção). |
| 3 | **Vários pedidos por dia**, cada um com o seu horário de retirada. |
| 4 | Retirada em **faixas de 15 min**, só hoje, a partir de agora + tempo de preparo, até o fechamento. |
| 5 | A janela do item («Efetuar pedido 13:30 às 15:30») é a janela para **fazer** o pedido daquele item. |
| 6 | Status: `novo → preparando → pronto → retirado`; saídas `cancelado` e `nao_retirado`. |
| 7 | Quem pediu cancela até **15 min antes** da retirada (novo ou preparando). A cantina cancela a qualquer hora, com motivo. |
| 8 | **Não retirado** é marcado pela cantina depois do horário; continua cobrado (desconto em folha). |
| 9 | Pedido guarda **retrato**: nome, empresa, setor, nome e preço de cada item. Preço novo não muda pedido velho. |
| 10 | Tudo validado no banco (janela, preço, faixa, prazo). O preço nunca vem do navegador. |
| 11 | Chat **preso ao pedido** (como Solicitações WhatsApp), não o chat interno. A cantina não entra no chat da empresa. |

## Dados (migration `20261022150000_cantina.sql`)

- `empresas_produto_conhecido` aceita `cantina`; empresa **Cantina** (slug `cantina`).
- Cargo `cantina` em `public.cargos` (não pertence a setor, sem acesso total, não
  conta no recebimento, não lidera). Entra como cargo criado pelo painel: o espelho
  estático `lib/cargos.ts` continua com os dez de sempre.
- Catálogo: `ver_cantina`, `cantina_painel`. Mapa do cargo `cantina` na empresa
  Cantina = só `cantina_painel`.
- Tabelas (RLS ligada, **sem acesso direto** de `authenticated`; tudo por função
  `SECURITY DEFINER`):
  - `cantina_config` (linha única): aberta, aviso do dia, preparo (15), prazo de
    cancelamento (15), abre/fecha.
  - `cantina_itens`: código, nome, descrição, preço, foto, categoria, ordem, ativo,
    janela de pedido, opções (sabores).
  - `cantina_pedidos`: número do dia, dono + retrato, retirada, status, total,
    observação, carimbos de cada etapa, motivo do cancelamento, leitura do chat
    pelos dois lados.
  - `cantina_pedido_itens`: retrato do item, quantidade, opção, observação.
  - `cantina_mensagens`: lado (`cliente`/`cantina`/`sistema`), texto.
- Funções: `fn_cantina_cardapio`, `fn_cantina_fazer_pedido`,
  `fn_cantina_meus_pedidos`, `fn_cantina_cancelar`, `fn_cantina_fila`,
  `fn_cantina_mudar_status`, `fn_cantina_mensagens`, `fn_cantina_enviar_mensagem`,
  `fn_cantina_marcar_lido`, `fn_cantina_nao_retirados`.
- Hora: sempre `America/Sao_Paulo`, por `fn_cantina_agora()` (o teste a troca).

## Tempo real — só onde precisa

Segue o padrão já otimizado do sistema (`acordos_pelo_sinal`, 20261009220000):
gatilho **por comando** manda Broadcast **só com ids**, em canal privado; a tela
relê pela função de sempre. Nada de Postgres Changes, nada de tabela na publicação.

| Tópico | Quem ouve (policy) | Para quê |
|---|---|---|
| `cantina-pessoa:<perfil_id>` | o próprio dono | status e mensagem dos pedidos dele |
| `cantina-fila:hoje` | `fn_user_tem('cantina_painel')` | pedido novo, mudança, mensagem do cliente |

- Assinado por `assinarTabela` (canal compartilhado) **só com a tela aberta**: aba
  Cantina com pedido em andamento, ou o painel. Sem pedido em andamento, o
  colaborador não abre canal nenhum.
- Cardápio não tem tempo real: lido com `lerComCache` (5 min).
- «Pedido pronto» e «mensagem da cantina» também viram linha em `notificacoes` —
  o sino, o card e o som que o sistema já tem chegam em qualquer tela, sem
  assinatura nova.

## Telas

**Colaborador — aba «Cantina»** (`/cantina`, produtos cobrança/comercial/rh):
faixa com o aviso do dia; chips de categoria e busca; grade de cards grandes
(foto ou ilustração da categoria, preço, +/−, cadeado fora da janela); carrinho
fixo à direita (barra no rodapé no celular) com as faixas de retirada; confirmação
com a regra de cobrança; «Meus pedidos» com linha do tempo, chat e cancelar.

**Cantina — Painel** (`/cantina/painel`, produto cantina, é a tela inicial dela):
cabeçalho com total do dia e «Exportar não retirados»; resumo de produção
(próximos 30 min); quadro Novos / Preparando / Prontos / Encerrados, agrupado por
faixa; um botão grande por etapa; atrasado em laranja; som e título piscando
quando chega pedido; card abre detalhe com itens, chat e cancelar com motivo.

## Testes

- PGlite (`src/services/cantina/__tests__/cantina.sql.test.ts`): a migration
  aplica; pedido fora da janela, faixa errada, depois do fechamento, preço
  forjado e item inativo são recusados; cancelar no prazo e fora dele; transições
  de status; quem não é da cantina não muda status; o sinal sai nos dois tópicos
  só com ids.
- Unidade: cálculo das faixas, carrinho, agrupamento da fila.
- Contratos existentes: catálogo de permissões, menu por produto.

## Ordem de entrega

1. Migration revisada e testada em PGlite → **mostrar SQL e esperar o «pode»**.
2. Front (colaborador + painel), `npm run typecheck`, eslint nos tocados, vitest.
3. `npm run dev` para o Cleber testar no localhost.
