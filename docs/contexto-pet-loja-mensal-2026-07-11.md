# Contexto — Joguinho do Pet (Aura) e Loja Mensal

> Handoff de 2026-07-11 para continuar a atualização em outra máquina.
> Último commit desta frente: `70b8223 feat(pet): loja mensal rotativa com 10 itens de julho + comidas pagas`.

## O que é o joguinho

Mascote "Aura" (coelhinha espiritual lilás) que vive no canto inferior direito de
todas as telas. Widget flutuante ([PetWidget.tsx](../src/components/pet/PetWidget.tsx))
com passeio pelo rodapé, humores, eventos aleatórios (videogame, borboleta, escada…)
e comemoração quando um acordo é marcado como pago. Clicar abre o **quartinho**
([PetQuartinho.tsx](../src/components/pet/PetQuartinho.tsx)).

- Visível para todos; **interação completa só admin/super_admin** (`usePetInterativo`
  em [petConfig.ts](../src/components/pet/petConfig.ts)) — demais cargos veem teaser.
- Votação de nome (Aura/Lupi/Albi) em andamento — `usePetDoTenant` retorna rótulo
  neutro "mascote" enquanto isso. `PetRolo` existe no repo como possível skin futura.

## Economia (Fase 1 — já no ar)

Migration `20260709a_pet_economia.sql` (JÁ APLICADA no Supabase):

- `pet_estado` (1 linha/usuário): moedas, moedas_ganhas/gastas_total, **xp, nivel,
  streak (colunas criadas mas AINDA SEM USO na UI)**, roupa_equipada,
  `itens_desbloqueados` (jsonb, inventário permanente), dormindo. RLS: só lê a própria.
- `pet_recompensas`: ledger por usuário+dia com marca d'água (não resgata 2×).
- RPCs SECURITY DEFINER: `fn_pet_estado_get`, `fn_pet_recompensa_disponivel`,
  `fn_pet_resgatar_recompensa`, `fn_pet_gastar_moedas(p_valor, p_item)`,
  `fn_pet_salvar_visual`.

**Regra de ouro anti-hack**: o cliente NUNCA credita moedas. Crédito vem só do
**recebimento diário** (`diario_recebimentos`): operador soma o próprio; líder+ soma
a empresa. Janela 7 dias; 1 moeda a cada R$ 10. Nada de moedas por marcar "pago"
manualmente (seria dinheiro infinito).

Frontend: [usePetEstado.ts](../src/components/pet/usePetEstado.ts) +
[petEstado.service.ts](../src/services/pet/petEstado.service.ts). Degradação
graciosa: sem migration → `dbAtiva=false`, cai no localStorage (sem moedas).

## Fase 2 — Loja mensal rotativa (FEITA em 2026-07-11, commit 70b8223)

Ideia do Cleber: **vitrine temporária que troca todo mês (~10 itens/mês); o que
for comprado fica salvo no banco para sempre**, mesmo após sair da loja.

Implementação (sem migration nova — a RPC de gasto já gravava o item):

- **Catálogo** em [petConfig.ts](../src/components/pet/petConfig.ts):
  `LOJA_MENSAL: ItemLojaMensal[]` com `{ id, nome, emoji, preco, mes: 'yyyy-MM' }`.
  Helpers: `itensLojaDoMes(mes)`, `roupaInfo(id)`, `ROUPAS_VALIDAS`.
  Itens de **julho/2026**: coroa 250, capa 220, oculos_sol 150, tiara 140,
  colar 130, bone 110, oculos_nerd 100, laco 90, gravata 80, flor 60.
- **Arte**: cada item tem camada SVG própria em
  [PetAura.tsx](../src/components/pet/PetAura.tsx) (bloco "itens da loja mensal").
  Âncoras úteis: olhos (83,96)/(119,96) · topo da cabeça y≈42 · orelhas
  (72,50)/(132,60) · pescoço y≈124-138.
- **Compra**: `usePetEstado.comprar(preco, item?)` → `fn_pet_gastar_moedas` valida
  saldo no servidor, debita e adiciona em `itens_desbloqueados`. Hook expõe
  `itens: string[]`. Compra de roupa **já equipa** o item.
- **Quartinho**: abas Quarto | **Loja** | Roupas | Comidas.
  - Loja: título "Loja de {mês}" + selo "troca em X dias" (até o dia 1º do mês
    seguinte); item comprado vira botão Equipar/Remover; sem saldo → desabilitado
    com tooltip "faltam X". `lojaAtiva={estado.dbAtiva}` — sem banco, loja fechada.
  - Roupas: guarda-roupa = grátis (chapéu festa, cachecol) + tudo já comprado
    (permanente, mesmo de meses passados).
  - Comidas: maçã 🪙3, ração 🪙5, bolinho 🪙8 — pagar chama `onAlimentar` (humor
    feliz + balão). Botão "Alimentar" do topo agora abre essa aba.

### Como lançar o mês seguinte (ex.: agosto/2026)

1. Acrescentar ~10 itens novos em `LOJA_MENSAL` com `mes: '2026-08'`.
   **NUNCA reutilizar ids antigos** (são as chaves do inventário).
2. Adicionar o id novo ao union `PetRoupa` e desenhar a camada SVG na `PetAura`
   (`{roupa === 'novo_id' && (...)}`).
3. Nada mais: a vitrine troca sozinha pela data, e os itens de julho continuam
   funcionando no guarda-roupa de quem comprou.

### Limitação conhecida (aceitável enquanto admin-only)

O **preço** é validado no cliente — `fn_pet_gastar_moedas` só confere saldo.
Antes de abrir para todos os cargos: mover catálogo para tabela e validar preço
(e "já possui") no servidor. Equipar roupa não-comprada via RPC direta também é
possível hoje (a UI impede, o servidor não).

## Roadmap combinado (fases seguintes)

- **Fase 3 — Progressão**: usar xp/nivel/streak (colunas já existem): XP por ações,
  níveis desbloqueando itens exclusivos, streak de resgates consecutivos com
  multiplicador, bônus por bater meta diária pessoal.
- **Fase 4 — Social**: ranking de nível/streak, troféu do destaque do dia
  (integração com Destaques do analítico), comemoração quando equipe/setor bate meta.
- **Fase 5 — Abertura**: encerrar votação do nome (PetNomeVotacao), liberar
  interação para todos os cargos (endurecer a loja no servidor ANTES).

## Contexto rápido do resto do dia (fora do pet)

- Card "Total recebido" do Analítico (PP) agora usa o **total do recebimento
  diário 945** (todas as linhas do mês) com ícone "!" explicativo; mesmo valor no
  painel do setor em Desempenho Equipes. Motivo: o ERP não credita no analítico
  pagamentos com status Coren/indireto (~R$ 171 mil na conferência) — só o 945
  fecha com o total. Fallback para o analítico sem diário importado.
- Parser do diário descarta o **rodapé de totais** (linha sem operador e sem
  qualquer identificação). Limpeza dos rodapés antigos já importados:
  `DELETE FROM diario_recebimentos WHERE operador_usuario='' AND cpf IS NULL AND nome_cliente IS NULL AND acordo_codigo IS NULL;`
- Modal de **recorte de foto** de perfil (arrasta + zoom, saída 512×512) no header
  e no Admin → Usuários ([ModalRecortarFoto.tsx](../src/components/ModalRecortarFoto.tsx)).

## Ambiente / fluxo

- `npm install` → `npx tsc --noEmit` → `npx eslint <arquivos>` → testes `npx vitest run`
  (CI tem ~90 testes pré-existentes falhando que não são nossos; rodar os do arquivo tocado).
- Push direto na `main` (sem PR); `git pull --ff-only` antes de editar/commitar —
  o Kauan também pusha. Commits só depois de typecheck+lint limpos.
