# Pet (mascote "Aura")

**Arquivado em:** 05/09/2026
**Desligado em:** 09/08/2026 (migration `20260809c`)

## O que era

Um mascote que morava no canto da tela, com economia própria: moedas ganhas por
recebimento, XP, nível, streak, loja de roupas e móveis, um "quartinho" para
decorar e uma votação para escolher o nome. Comemorava com confete quando um
acordo era marcado como pago.

## Por que saiu

O mascote foi desligado em 09/08/2026 e substituído por um card de despedida.
A remoção do código ficou combinada como "depois" — e ficou. Desde então eram
cerca de 150 KB de fonte que ninguém executava, mas que continuavam sendo lidos
em busca, mantidos em refatoração e incluídos no bundle.

A spec original já previa esta limpeza:
`docs/superpowers/specs/2026-08-09-despedida-do-pet-design.md`, seção 8.

## O que veio para cá

```
src/components/pet/      PetAura · PetQuartinho · PetRolo · PetWidget
                         PetDespedida · pet.css · petConfig(+test)
                         petEvents · usePetClima · usePetEstado
src/components/admin/    AdminPetAba.tsx
src/services/pet/        petAdmin · petDespedida(+test) · petEstado
                         petNomeVotacao
```

## O que foi removido do código vivo

- `<PetWidget />` em `src/App.tsx`
- `<PetDespedida />` em `src/components/Layout.tsx`, junto com o estado
  `tourPronto` e o `onFinished` do `OnboardingTour`, que existiam só para
  liberar o card de despedida
- as chamadas a `celebrarPetAcordoPago()` em `AcordoNovoInline`,
  `AcordoDetalheInline`, `Acordos/index.tsx` e `Dashboard/index.tsx`
- os tipos `PetEstado`, `PetItem`, `PetInventarioItem` e `PetEconomiaRegra` em
  `src/lib/supabase.ts`
- o comentário da aba Pet em `src/pages/AdminConfiguracoes.tsx` (o gatilho da
  aba já não era renderizado desde 09/08)
- duas mensagens de tela em `Analitico/ValidacaoRelatorioSetor.tsx` que
  prometiam "libera o crédito do pet" — o crédito não existe mais

## O que continua no banco (nada foi apagado)

Tabelas: `pet_estado`, `pet_itens`, `pet_inventario`, `pet_economia_regras`,
`pet_nome_votacao` e o que mais as migrations abaixo criaram.

```
20260709a_pet_economia            20260710a_pet_nome_votacao
20260710b_pet_economia_estrutura  20260711b_pet_loja_servidor
20260721c_fase1_gate_pet          20260722_fix_min_uuid_pet_dias_disponiveis
20260809c (despedida)
```

Coluna `perfis.pet_despedida` também continua. Por causa dela, o campo
`pet_despedida?: string | null` **permanece** em `Perfil` (`src/lib/supabase.ts`):
as telas fazem `select('*') as Perfil[]`, e um campo que o banco devolve e o
tipo não declara derruba a conversão em `AdminUsuarios` e `PainelLider`.
Ninguém lê o valor — ele sai junto com a coluna, quando ela sair.

Apagar tabela ou coluna é decisão à parte, com o dono do banco na sala.

## Como voltar

Copiar a árvore `src/` desta pasta por cima de `src/` e refazer as pontas
listadas acima. O `git log --follow` de cada arquivo alcança a história inteira.
