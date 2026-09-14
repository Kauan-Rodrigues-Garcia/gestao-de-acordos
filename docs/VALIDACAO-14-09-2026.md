# Validação de 14/09/2026 — a troca de fonte e a equipe do líder

> ## ⚠️ Correção de desenho, no mesmo dia
>
> A primeira versão fazia o 58 virar **prévia inerte** nos setores do 59: lia o
> arquivo e não gravava nada. Estava errado. O pedido é outro:
>
> > «o 58 é pra ir atualizando os valores também, igual é hoje, porém ao entrar
> > o 59 sincroniza tudo»
>
> Corrigido em `20260914110614`. O 58 voltou a alimentar; o 59 passou a
> sincronizar **por gatilho**, no instante em que o lote é promovido.
>
> **O que isso custa:** entre uma importação do 58 e a entrada seguinte do 59,
> os NRs em que as duas fontes discordam da data podem aparecer duas vezes —
> **50 grupos, R$ 40.903,78, 0,6% dos grupos**. Some sozinho na sincronização
> seguinte.
>
> É por isso que a sincronização é gatilho e não botão: se dependesse de alguém
> lembrar de clicar, esses R$ 40 mil virariam permanentes.
>
> Ciclo completo medido (promoção → sincronizar 10 setores → 301 notificações):
> **2.689 ms**, e idempotente.

O que foi verificado depois de trocar todos os setores para o relatório 59, e
duas perguntas que foram feitas junto: **o valor do líder conta para a equipe
dele?** e **algum caminho do Painel Diretoria deixa isso passar despercebido?**

---

## 1. A troca de fonte — validada

| | |
|---|---:|
| analítico, setembro/2026 | R$ 3.622.488,42 |
| mestre comparável (o 59 pelo mesmo recorte) | R$ 3.622.488,42 |
| **diferença** | **R$ 0,00** |
| chaves duplicadas | 0 |
| linhas com setor, operador ou valor nulo | 0 |
| linhas com `tipo_comissao` nulo | **0** (eram 4.750, R$ 1.542.372,87) |
| agosto/2026 | intacto — R$ 6.212.828,49, zero linhas do 59 |
| retrato anterior guardado | 8.445 linhas, R$ 3.234.735,25 |

As duas fontes concordam ao centavo. O `tipo_comissao` nulo — que jogava
R$ 1,5 milhão em «Sem vínculo definido» no painel de metas — acabou.

### O snapshot da Fase 5 agiu em produção, sozinho, antes de eu chegar

Às **10:33 UTC**, uma importação do 58 do Play 2 (por Luan Barreto) trouxe 45
linhas novas e **removeu 5, R$ 1.466,00**. `fn_analitico_remover_com_snapshot`
guardou as cinco.

Antes de 14/09/2026 elas teriam sumido sem registro, como as 2.659 de agosto e
setembro. Foi a primeira vez que o mecanismo agiu de verdade, e ele agiu certo.

---

## 2. O valor do líder conta para a equipe dele?

**Sim — para 23 dos 34 líderes.**

| | líderes | valor em setembro |
|---|---:|---:|
| chega na equipe | 23 | **R$ 28.142,79** |
| não chega — sem vínculo nenhum | 7 (2 com dinheiro) | R$ 4.927,56 |
| não chega — lidera várias equipes | 4 | R$ 0,00 |

A regra que faz isso funcionar é `equipeDoLider.ts`, e ela já existia:

> vale `perfis.equipe_id` quando existe; na falta dele, o vínculo de
> `equipe_lideres` — **e só quando ele é único**.

Os 4 que lideram mais de uma equipe ficam de fora **de propósito**: somar o
recebimento deles nas três contaria o mesmo dinheiro três vezes no mesmo setor,
e escolher uma no escuro seria pior.

**O que precisa de cadastro:** 2 líderes com R$ 4.927,56 não têm vínculo nenhum
— nem `perfis.equipe_id`, nem `equipe_lideres`. Não é defeito de código.

Dado de contexto: dos 34 líderes, **apenas 4 têm `perfis.equipe_id`**. Os outros
30 dependem de `equipe_lideres`, e 26 estão lá.

---

## 3. ⚠️ O que passa despercebido — e é maior que a questão do líder

### 3.1. Existem DUAS noções de «equipe», e nenhuma tela avisa

| onde | como agrupa | responde |
|---|---|---|
| **Painel Diretoria**, «As equipes» | `subgrupo_equipe` → `mestre_equipes` | quanto entrou **por aquela frente de trabalho** |
| **Dashboard / Painel Líder** | `perfis.equipe_id` / `composicao_mes` / `equipe_lideres` | quanto **a minha equipe produziu** |

Nenhuma das duas está errada. Mas elas **divergem materialmente**:

| equipe | pelo subgrupo (Diretoria) | pela pessoa (Painel Líder) | diferença |
|---|---:|---:|---:|
| Rhaissa / Mateus | R$ 542.746,00 | R$ 520.232,22 | **−22.513,78** |
| Matheus (Receptivo) | R$ 577.062,62 | R$ 591.196,04 | **+14.133,42** |
| Luciana (Receptivo) | R$ 427.703,56 | R$ 434.553,46 | +6.849,90 |
| Luciano (Play 2) | R$ 179.479,12 | R$ 184.083,87 | +4.604,75 |
| Digital Bruno (Play 4) | R$ 25.275,42 | R$ 21.774,42 | −3.501,00 |
| Isabela (Play 4) | R$ 29.536,03 | R$ 33.037,03 | +3.501,00 |

O par Digital Bruno / Isabela é o caso mais claro: R$ 3.501,00 exatos saindo de
uma e entrando na outra — gente de uma equipe cobrando pelo subgrupo da outra.

**Um líder que abrir as duas telas vai concluir que uma está quebrada.** Hoje
nada na interface explica que são perguntas diferentes.

### 3.2. R$ 375.699,51 não chegam a equipe nenhuma (10,4% do mês)

| causa | linhas | valor | pessoas |
|---|---:|---:|---:|
| **cobradora sem perfil no sistema** | 1.125 | **R$ 295.160,75** | 30 |
| pessoa com perfil, sem equipe | 255 | R$ 75.209,06 | 15 |
| líder sem vínculo de equipe | 24 | R$ 4.927,56 | 2 |
| perfil inativo ou de outra empresa | 1 | R$ 402,14 | 1 |

Por setor:

| setor | total | em equipes | sem equipe | % |
|---|---:|---:|---:|---:|
| Play 4, Play 3, Play Mix Marília | — | = total | **R$ 0** | 0% |
| Play 5 | 146.172 | 145.770 | 402 | 0,3% |
| Playmix | 257.871 | 257.236 | 635 | 0,2% |
| Play 2 | 379.843 | 376.064 | 3.779 | 1,0% |
| Play 1 | 976.815 | 944.059 | 32.756 | 3,4% |
| **Receptivo** | 1.167.351 | 1.025.135 | **142.215** | **12,2%** |
| **Jornada Play** | 122.778 | 0 | **122.778** | 100% |
| **Manutenção** | 74.623 | 1.489 | **73.134** | 98% |

Jornada Play e Manutenção em 98–100% é esperado: os setores não foram
integrados ao sistema, então as pessoas deles não têm perfil. Os R$ 197 mil
aparecem no setor e não na equipe, o que é o correto enquanto não houver
cadastro.

**O Receptivo com 12,2% é o número que merece olhar.** São R$ 142.215,20 num
setor que está integrado — 577 linhas de gente sem perfil e 60 de gente com
perfil e sem equipe.

---

## 4. O que eu recomendo, em ordem

1. **Cadastrar as 30 cobradoras sem perfil** — destrava R$ 295 mil, e é o maior
   item de longe. Boa parte é Jornada Play e Manutenção; a parte do Receptivo é
   a que dá resultado imediato.
2. **Vincular os 2 líderes sem equipe** — R$ 4.927,56, e é rápido.
3. **Decidir o que fazer com a divergência das duas noções de equipe.** Três
   saídas possíveis, e a escolha é de negócio:
   - as telas passam a dizer qual pergunta cada uma responde (barato, honesto,
     não muda número nenhum);
   - o Painel Diretoria passa a agrupar pela pessoa, como as outras telas
     (unifica, mas perde a visão por frente de trabalho);
   - as duas convivem lado a lado na mesma tela, com a diferença explicada.

O item 3 não é urgente porque nenhum número está errado — mas é o que mais
produz «o sistema está com problema» sem ter problema.
