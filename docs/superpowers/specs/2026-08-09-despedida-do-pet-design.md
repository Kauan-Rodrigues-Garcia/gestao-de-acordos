# Despedida do pet — design

*Data: 2026-08-09 · Status: aprovado, aguardando plano de implementação*

## Objetivo

Tirar o pet do sistema **por enquanto**, abrindo espaço para um outro estilo de
jogo que está sendo planejado. Sair sem aviso seria estranho para quem convive
com ele todo dia, então a saída é encenada: o pet se despede, acena e vai embora
andando.

Três resultados, nessa ordem:

1. a votação do nome (Aura / Lupi / Albi) encerra e o card sai do ar;
2. para quem **nunca acessou** o sistema, o pet simplesmente nunca existiu;
3. para quem **já acessou**, aparece um card de despedida com um botão
   "Até logo" que fecha o card e dispara a animação de saída.

### Não faz parte deste trabalho

- Remover o código do pet do repositório. A decisão foi **desligar agora,
  remover depois** — a lista do que remover está na última seção.
- Apagar qualquer dado do pet no banco.
- Desenhar o novo jogo.

---

## 1. Quem vê o quê

### A regra

Coluna nova em `perfis`, no mesmo formato de `viu_notificacao_chatplay`
(migration `20260720a`):

```sql
ALTER TABLE public.perfis ADD COLUMN IF NOT EXISTS pet_despedida TEXT;

UPDATE public.perfis p SET pet_despedida = 'pendente'
  FROM auth.users u
 WHERE u.id = p.id AND u.last_sign_in_at IS NOT NULL;
```

| Valor | Quem é | O que vê |
|---|---|---|
| `'pendente'` | já tinha logado quando a migration rodou | pet normal **+ card de despedida** |
| `'concluida'` | já dispensou o card de despedida | nada — o pet some de vez |
| `null` | criado e nunca acessou, ou criado depois | nada — o pet nunca existiu |

Quem nunca entrou fica `null` porque o `UPDATE` não o alcança; quem for criado
daqui em diante nasce `null` pelo default da coluna. Não é preciso data de corte
nem job agendado.

### Por que `last_sign_in_at` e não `perfis.criado_em`

`criado_em` era o caminho óbvio e está **errado** para o caso que motivou o
pedido: usuário cadastrado semana passada que nunca entrou tem `criado_em`
antigo e seria classificado como veterano. `auth.users.last_sign_in_at` é o
único sinal confiável de "esta pessoa esteve aqui", e só é legível de dentro de
uma migration ou RPC `SECURITY DEFINER` — daí o backfill.

`perfis.ativo` também não serve: usuário criado e nunca acessado nasce ativo.

### Coluna ausente ≠ coluna vazia

`undefined` (a coluna não existe — migration ainda não aplicada) é tratado
**diferente** de `null` (existe e está vazia):

- `undefined` → fase `normal`: o pet fica exatamente como está hoje;
- `null` → fase `ausente`: sem pet.

É a mesma distinção que `temCarimboDeSetor` já faz em
[`src/services/analitico/escopoAnalitico.ts`](../../../src/services/analitico/escopoAnalitico.ts),
e ela tem uma consequência boa: **a migration vira o interruptor**. O deploy do
frontend não muda nada para ninguém; a despedida começa quando a migration
rodar. Quem controla a hora é você, e um deploy adiantado não estraga a
surpresa.

### Onde a regra mora

Função pura em `src/components/pet/petConfig.ts`:

```ts
export type FasePet = 'normal' | 'despedindo' | 'ausente';

export function fasePet(
  perfil: { pet_despedida?: string | null } | null | undefined,
): FasePet {
  if (perfil?.pet_despedida === undefined) return 'normal';   // migration pendente
  if (perfil?.pet_despedida === 'pendente') return 'despedindo';
  return 'ausente';                                            // null | 'concluida'
}
```

Consumidor único: `usePetHabilitado()`, hoje um `return true`, que já é o gate
do widget (`if (!habilitado) return null`). Nenhuma query nova — `useAuth` faz
`select('*')` em `perfis`, então a coluna chega de graça no `perfil`.

`src/lib/supabase.ts` ganha o campo opcional na interface `Perfil`.

---

## 2. O card de despedida

Componente novo `src/components/pet/PetDespedida.tsx`, montado onde hoje está a
votação (`src/components/Layout.tsx`) e com o **mesmo gate**:
`!termoLoading && !precisaAceitar && tourPronto`. Sem isso a despedida
empilharia por cima do aceite de termos ou do tour — o problema que originou
esse gate.

Aparece quando `fasePet(perfil) === 'despedindo'`.

**Visual**: mesma linguagem do card de votação — backdrop escuro com blur,
cartão de 380px arredondado, `PetAura` no cabeçalho com humor `feliz`.

**Conteúdo** (texto de partida, ajustável na implementação):

> ### Até logo, por enquanto!
>
> O mascote vai tirar umas férias. Estamos preparando algo novo por aqui, e ele
> volta em breve — com novidades.
>
> Obrigado por ter cuidado dele até aqui. 💜

Não menciona a votação nem promete data: o novo jogo ainda está sendo desenhado,
e prometer prazo num card de despedida é dívida que alguém vai cobrar.

**Um botão só: "Até logo".** Sem "talvez depois".

### Fechar de qualquer jeito é se despedir

**Todo caminho de fechar o card dispara a despedida** — não existe saída que
adie. São quatro gatilhos para uma ação só:

| Gatilho | Resultado |
|---|---|
| botão "Até logo" | despedida |
| clique no backdrop (fora do card) | despedida |
| botão X | despedida |
| tecla `Esc` | despedida |

Todos chamam o mesmo `despedir()`. Não há handler de "fechar sem fazer nada".

Isso é mais simples do que ter dois caminhos, e resolve o furo da versão
anterior: com um "fechar" neutro, quem clicasse fora todo dia nunca se
despediria e veria o mesmo card para sempre. O pet vai embora de qualquer forma
— então todo jeito de dispensar o card deve entregar o adeus, não adiá-lo.

O `Esc` entra na lista por coerência: é um jeito de fechar como qualquer outro,
e deixá-lo de fora criaria justamente a porta dos fundos que se quer eliminar.

O único caso que **não** completa é fechar a aba ou navegar para fora — aí nada
é gravado, o usuário continua `'pendente'` e o card volta na próxima sessão.
Não dá para interceptar isso de forma confiável, e o comportamento é o desejado.

### A ordem de operações (a parte que erra fácil)

O caminho óbvio — gravar no banco e chamar `refreshPerfil()` na hora, como faz o
`ChatplayNewFeatureModal` — **mataria a animação**: o `perfil` viraria
`'concluida'`, o gate fecharia e o widget desmontaria antes de o pet acenar.

A ordem correta, com o widget dono da própria saída:

1. qualquer um dos quatro gatilhos → grava `pet_despedida = 'concluida'`
   (**sem** `refreshPerfil`) → card fecha → dispara `despedirPet()`;
2. o widget liga `saindo = true`, que **sobrepõe o gate** — nenhuma
   re-renderização o desmonta no meio da animação;
3. terminada a animação, o widget chama `refreshPerfil()` e aí sim desmonta.

### Por que gravar ao fechar, e não no fim da animação

Se a gravação dependesse da animação completar, um defeito que a impedisse de
terminar deixaria o usuário preso vendo o mesmo card em toda sessão, para
sempre. Gravando ao fechar, o pior caso é alguém fechar a aba no meio e perder a
animação — tendo já dado o adeus.

Falha de rede na gravação mantém `'pendente'`: o card volta na próxima sessão,
que é o comportamento desejado.

---

## 3. A animação de saída

Quase tudo já existe no código.

**O aceno**: `PetCena` já tem `'aceno'`, desenhado em `PetAura.tsx` e usado hoje
quando o pet chega ao topo da escada. Reusar.

**A conversa entre card e widget**: eles vivem em subárvores diferentes (card em
`Layout`, widget em `App`), e `src/components/pet/petEvents.ts` existe
exatamente para isso — *"canal simples para o app avisar o pet; zero
acoplamento, quem dispara não precisa saber se o pet está montado"*. Entra um
`PET_EVENTO_DESPEDIDA` / `despedirPet()` ao lado do `celebrarPetAcordoPago`.

**A saída**: o widget é `fixed bottom-2 right-3` e o passeio usa um estado `x`
em que negativo anda para a esquerda (`ALCANCE = 190`). Sair pela direita é
animar `x` até cerca de `+160px` — o bastante para limpar a largura do pet mais
o respiro da borda. A caminhada usa o ciclo de passos que já existe, num ritmo
um pouco mais vivo que o passeio normal de 45 px/s.

**Sequência**: cancela o evento em curso (pescaria, escada, o que for) → fecha o
quartinho se estiver aberto → aceno ~1,2 s → caminhada para fora ~1,6 s → some.

### Dois casos sem os quais parte das pessoas não vê o adeus

- **pet minimizado** — a preferência `usePetMinimizado` deixa só um ícone
  parado no canto. A despedida ignora o minimizado temporariamente; sem isso a
  pessoa dispensa o card e não acontece nada visível.
- **pet dormindo** — o ciclo teaser de 5 min dormindo / 5 min acordado vale para
  todos os cargos que não são admin. O pet acorda para se despedir.

---

## 4. O que sai da tela agora

| Item | Ação |
|---|---|
| `PetNomeVotacaoLembrete` | desmontado do `Layout` e arquivo removido — é o "card de votação" do pedido |
| `PetNomeVotacao.tsx` | removido junto: é código morto, não está montado em lugar nenhum |
| Aba Pet em Admin → Configurações (`AdminPetAba`) | o gatilho e o conteúdo da aba deixam de ser renderizados em `AdminConfiguracoes.tsx`; o arquivo do componente **fica** para a remoção futura. Administra uma economia congelada |
| Chamadas a `celebrarPetAcordoPago` (5 arquivos) | **não mexer** — sem widget montado o CustomEvent não tem ouvinte e vira no-op; alterar 5 arquivos para zero mudança de comportamento é churn |

---

## 5. O que fica guardado

Nada é apagado no banco. Seguem intactos: `pet_estado`, `pet_itens`,
`pet_inventario`, `pet_recompensas`, `pet_economia_regras` e `pet_nome_votos` —
moedas, itens comprados e a apuração do nome por empresa continuam disponíveis
para o próximo jogo.

A votação **encerra sem anúncio de resultado**. O nome mais votado de cada
empresa fica no banco, consultável por `fn_pet_nome_resultado`.

---

## 6. Testes

`fasePet` é pura e decide quem vê o quê — é o que vai com teste, cobrindo os
quatro casos: `undefined`, `null`, `'pendente'` e `'concluida'`.

O card e a animação são visuais e não valem teste automatizado aqui; a
verificação é abrir a tela com um usuário em cada estado.

---

## 7. Riscos

**Ordem de deploy.** Entre o deploy e a migration todo mundo fica em `normal`
(pet como hoje). Quem logar pela primeira vez nesse intervalo é alcançado pelo
backfill quando a migration rodar e recebe a despedida normalmente. Não há
brecha em que alguém perca o pet sem se despedir — **desde que a migration rode
depois do deploy, nunca antes**.

**Impersonação.** Durante impersonação o `perfil` é o do usuário-alvo, então a
fase do pet segue a dele. É o comportamento correto: o super_admin vê o que
aquela pessoa veria.

---

## 8. Lista de remoção futura

Registrada aqui para o "remover depois" não virar código órfão esquecido. Deve
ser feita **depois** que a despedida tiver rodado para todo mundo (ou seja,
quando não sobrar mais ninguém com `pet_despedida = 'pendente'`).

**Frontend**

```
src/components/pet/          PetAura.tsx · PetQuartinho.tsx · PetRolo.tsx
                             PetWidget.tsx · PetDespedida.tsx · pet.css
                             petConfig.ts · petEvents.ts
                             usePetClima.ts · usePetEstado.ts
src/services/pet/            petAdmin.service.ts · petEstado.service.ts
                             petNomeVotacao.service.ts
src/components/admin/        AdminPetAba.tsx
```

**Pontas soltas a limpar junto**

- `<PetWidget />` em `src/App.tsx`
- chamadas a `celebrarPetAcordoPago` em `AcordoDetalheInline`,
  `AcordoNovoInline`, `Acordos/index.tsx` e `Dashboard/index.tsx`
- aba Pet em `src/pages/AdminConfiguracoes.tsx`
- coluna `pet_despedida` em `perfis` e o campo em `src/lib/supabase.ts`

**Banco** (só quando houver certeza de que o novo jogo não reaproveita nada)

```
20260709a_pet_economia · 20260710a_pet_nome_votacao
20260710b_pet_economia_estrutura · 20260711b_pet_loja_servidor
20260721c_fase1_gate_pet · 20260722_fix_min_uuid_pet_dias_disponiveis
```

**Documentação**: a seção 13.4 (Pet) de `docs/REGRAS-DE-NEGOCIO.md` e a menção a
`pet/` na árvore do `ARQUITETURA.md`.
