# Contexto — Joguinho do Pet (Aura): loja, vida própria, clima e fase 2

> Handoff de 2026-07-11 (atualizado ao fim do dia) para continuar em outra máquina.
> Frentes do dia: loja mensal (70b8223) → fase 1 de vida do pet (6a18eef, 6085d6e)
> → pacote "vida própria" (b8b6b7b) → clima real (6408292) → **fase 2: loja
> validada no servidor + painel admin** (este commit).

## O que é o joguinho

Mascote "Aura" (coelhinha espiritual lilás) que vive no canto inferior direito de
todas as telas. Widget flutuante ([PetWidget.tsx](../src/components/pet/PetWidget.tsx))
com passeio pelo rodapé, humores, eventos aleatórios e comemoração quando um
acordo é marcado como pago. Clicar abre o **quartinho**
([PetQuartinho.tsx](../src/components/pet/PetQuartinho.tsx)).

- Visível para todos; **interação completa só admin/super_admin** (`usePetInterativo`
  em [petConfig.ts](../src/components/pet/petConfig.ts)) — demais cargos veem teaser.
- Votação de nome (Aura/Lupi/Albi) em andamento — `usePetDoTenant` retorna rótulo
  neutro "mascote". `PetRolo` existe como possível skin futura.

## Vida do pet (tudo já no ar)

- **Eventos aleatórios**: videogame, borboleta, moeda, espreguiçada, escada,
  **pescaria multi-fase** (espera → fisgada! → 70% peixe / 25% escapa / 5% bota),
  carrinho de controle remoto, dancinha, marshmallow na fogueira.
- **Reações ao mouse**: pupilas seguem o cursor (compensando o flip da caminhada);
  hover 1x → surpresa+feliz; hover 4+ em 6s → tontinha. Clique só abre o menu.
- **Micro-comportamentos**: pulinho, bocejo (mais ao fim do dia), espirro,
  espreguiçada (mais de manhã). Sexta a dança pesa mais no sorteio.
- **Balõezinhos contextuais** raros (bom dia, sextou, fominha, frases por clima)
  com memória da última comida (localStorage).
- **Cochilo por inatividade**: 5 min sem mouse/teclado → dorme em pé; acorda
  assustadinha ao voltar.
- **Clima real** ([usePetClima.ts](../src/components/pet/usePetClima.ts)):
  Open-Meteo (sem chave), cache 20 min, refetch 30 min. Cidades Birigui/Marília
  (as 2 empresas têm gente nas duas) — seletor na aba Quarto, localStorage.
  Chuva → gotas + guarda-chuva (some com patinhas ocupadas); tempestade → nuvem
  + relâmpago; calor ≥31° → sol + suor + picolé; frio ≤14° → cachecol azul
  (se sem roupa) + bafinho; vento ≥25 km/h → folhinhas. Janela do quartinho
  reflete clima/dia/noite.
- **Desativar o pet**: botão (olho) no cabeçalho do quartinho → vira iconezinho
  estático; preferência local por usuário. **Cama** no quartinho: pet desliza
  até ela ao dormir (clicar na cama alterna o sono).
- Animações: ondinhas da barra ondulam via CSS `d: path()` (lenta parada, rápida
  andando); sombra fica no chão (passinhos só no corpo).

## Economia — como está após a FASE 2

Migrations (ordem): `20260709a_pet_economia.sql` (**aplicada**) →
`20260710b_pet_economia_estrutura.sql` (estrutura pet_itens/pet_inventario/
pet_economia_regras) → **`20260711b_pet_loja_servidor.sql` (NOVA — APLICAR no
Supabase Dashboard → SQL Editor)**.

A nova migration:

- **Fecha as 2 brechas conhecidas**: compra agora é por id via
  `fn_pet_comprar_item(p_item_id)` — o servidor lê preço/janela/ativo em
  `pet_itens` e recusa `ja_possui`/`saldo`/`indisponivel`; `fn_pet_salvar_visual`
  só aceita roupa grátis (preço 0) ou possuída. `fn_pet_gastar_moedas` com item
  delega para a RPC validada (preço do cliente é ignorado).
- Semeia os 10 itens de julho com janela de vitrine (1º/jul → 1º/ago), corrige
  chapéu/cachecol para grátis e comidas para 3/5/8, e sincroniza
  `itens_desbloqueados` (jsonb) ⇄ `pet_inventario` nos dois sentidos.
- **Painel admin**: `fn_pet_admin_listar` (jogadores), `fn_pet_admin_ajustar_moedas`
  (bônus/correção, saldo nunca negativo), RLS de escrita em `pet_itens` e
  `pet_economia_regras` para administrador/super_admin.

Front correspondente:

- [usePetEstado.ts](../src/components/pet/usePetEstado.ts) expõe `catalogo`
  (pet_itens) e `comprar(preco, item?, consumivel?)` — tenta a RPC validada e
  **cai no caminho legado se a migration ainda não foi aplicada** (tudo degrada
  graciosamente, como sempre).
- Quartinho: vitrine e comidas passam a vir do catálogo do servidor quando ele
  existe (filtro por janela/ativo/arte); senão usa o catálogo local do petConfig.
- **Configurações → aba Pet** ([AdminPetAba.tsx](../src/components/admin/AdminPetAba.tsx),
  só admin): tabela de jogadores (saldo/ganhas/gastas/itens + ajuste manual de
  moedas) e catálogo editável (preço, ativo). Item novo ainda exige arte no
  código (ver abaixo).

**Regra de ouro anti-hack** (inalterada): o cliente NUNCA credita moedas. Crédito
só via recebimento diário (`fn_pet_resgatar_recompensa`, taxa por cargo em
`pet_economia_regras`) ou ajuste manual de admin.

## Como lançar o mês seguinte (ex.: agosto/2026)

1. Desenhar a camada SVG do item novo na [PetAura.tsx](../src/components/pet/PetAura.tsx)
   e adicionar o id ao union `PetRoupa` + `LOJA_MENSAL` local (fallback) no petConfig.
   **NUNCA reutilizar ids antigos.** Âncoras: olhos (83,96)/(119,96) · topo da
   cabeça y≈42 · orelhas (72,50)/(132,60) · pescoço y≈124-138.
2. INSERT do item em `pet_itens` com `disponivel_de/ate` do mês (pode ser pela
   aba Pet no futuro; hoje via SQL) — a vitrine troca sozinha pela janela.
3. Itens de meses passados continuam no guarda-roupa de quem comprou.

## Roadmap (fases seguintes)

- **Fase 3 — Progressão**: missões diárias/semanais validadas no servidor
  (ações verificáveis no banco), usar xp/nivel/streak (colunas existem),
  destaque do dia ganha moedas (via `fn_pet_admin_ajustar_moedas` ou RPC própria).
- **Fase 4 — Social**: ranking, troféus top 3 (animação do pet do novo líder
  "roubando" o troféu), destaque do mês ganha colecionável (tipo já existe em
  pet_itens: 'trofeu'/'colecionavel' com `exclusivo=true`).
- **Fase 5 — Abertura**: encerrar votação do nome (PetNomeVotacao), liberar
  interação para todos os cargos (fase 2 já blindou o servidor), ativar regras
  de economia dos demais cargos em `pet_economia_regras`.
- Ideias na fila: reação à tela aberta (óculos no Analítico), datas
  comemorativas (janela sazonal já suportada por pet_itens), gincanas.

## Ambiente / fluxo

- `npm install` → `npx tsc --noEmit` → `npx eslint <arquivos>` → testes `npx vitest run`
  (CI tem ~90 testes pré-existentes falhando que não são nossos).
- Push direto na `main` (sem PR); `git pull --ff-only` antes de editar/commitar —
  o Kauan também pusha. Commits só depois de typecheck+lint limpos.
- Verificação visual do pet sem login: renderizar `PetAura` com
  `renderToStaticMarkup` via `npx vite-node` + screenshot com Playwright
  (o painel de browser integrado trava screenshot nesta máquina).
