# Caça às Bruxas — plano (semana que vem da gincana)

> **ESTADO EM 14/10/2026:** elenco novo (8 personagens, 4 fofos que só desmaiam) e a faixa decorada. Antes, **em 09/10/2026:** a bruxa existe só no **laboratório local**
> (`npm run dev` → http://localhost:8080/lab-bruxas.html). Nada no banco, nada no
> menu, nada no deploy. A caça de verdade continua sendo a dos zumbis.

## 1. O pedido (Cleber, 09/10/2026)

- Na semana que vem, no lugar dos zumbis, **bruxas** (Halloween).
- Ela voa numa vassoura, **um pouco mais rápida** que o zumbi andava, para ficar mais difícil acertar.
- Pixel art **bem detalhada**, animação de voo detalhada, **com física**.
- Morreu: **cai da vassoura, se espatifa no chão no sangue**; a vassoura cai do lado e **às vezes quebra, às vezes não**.
- Muito sangue, como no zumbi.
- **Leve**, otimizado.
- **Skins diferentes**.

## 2. O que está pronto (`src/components/CacaAbobora/bruxas/`)

| Arquivo | O que é |
|---|---|
| `arte.ts` | A bruxa de 48×38 em 11 peças, no mesmo esquema de letras dos zumbis. 4 quadros de voo (capa e cabelo ondulam, ponta do chapéu e barra da saia batem no vento, palha treme, quem monta sobe e desce) + 2 de gargalhada (cabeça para trás, boca aberta). **8 bruxas** (abaixo). O boneco de juntas (`JUNTAS`, `OSSOS`). |
| `voo.ts` | O voo, puro: inércia, curva, onda de lado. Humores: chega (puf), cruzeiro, **mergulho rasante**, sobe, **paira e gargalha** (a chance de quem está de olho), **brava** (perdeu o chapéu: zigue-zague mais rápido), foge (tempo acabou). `VELOCIDADES`: Calma 28, Normal 42, Rápida 60, Insana 85 px da arte/s (na tela ×2). O zumbi anda ≈ 8 px/s na tela. |
| `queda.ts` | A morte, pura: corpo em **boneco de juntas** (Verlet, 11 partículas), vassoura e chapéu como peças rígidas, sangue, poças, manchas no chão. |
| `pixels.ts` | Canvas prontos e giros em passos de 15° por amostragem de pixel (nada borra). |
| `palco.ts` | O motor: dois canvas de baixa resolução (chão e ação) + uma caixa de tiro invisível por bruxa. Para sozinho quando não há nada se mexendo. |
| `sons.ts` | Gargalhada, puf, vento do rasante, grito da queda, ESPATIFA, vassoura partindo, chapéu, vidro, miado. Sintetizados, mesmo volume baixo dos zumbis (`../sons.ts` agora exporta `sintetizador`). |
| `laboratorio.ts/.css`, `/lab-bruxas.html` | A página de ensaio. |
| `bruxas.test.ts` | 13 testes: sprites, juntas, voo na zona, fuga, as 3 mortes espatifam e assentam, vassoura quebra às vezes, chapéu assenta. |

### O tiro

| Onde | O que acontece |
|---|---|
| Cabeça | **HEADSHOT**: a cabeça estoura (pedaços, sangue, miolo, osso), o pescoço jorra enquanto ela cai mole. |
| Corpo, braço, perna | Furo no peito, sangue espirra para o lado, tranco, ela solta a vassoura e cai sangrando. |
| Vassoura ou palha | **VASSOURADA**: a vassoura parte no ar em duas, ela cai inteira **se debatendo e gritando**. |
| Chapéu | **Não mata.** O chapéu voa furado, ela fica **brava** (mais rápida por 4 s), aparece o cabelo arrepiado. |
| Capa ou cabelo | Raspão: pano rasga, não mata. |
| Fundo da caixa | Tiro na parede (o mesmo furo dos zumbis). |

No chão, sempre: **ESPATIFA** — respingo largo e baixo, poça que cresce, o corpo sangra para a poça, tremida de tela; bateu forte, às vezes **um braço se solta**. A vassoura que caiu sozinha quebra em ~55% das vezes (`CHANCE_DE_QUEBRAR`), com lascas.

### O elenco (14/10/2026): um personagem por rodada, fofo e assustador alternando

Pedido do Cleber: «uma bruxa de cada, diferentezinha… uma mais fofinha, uma
que é a Hello Kitty, uma mais feia, um gato que é uma bruxa». Os desenhos
novos estão em `figurinos.ts` (peças inteiras trocadas por personagem).

| # | Personagem | Desenho | Fofo? | Rastro |
|---|---|---|---|---|
| 0 | Bruxinha Fofa | chibi: cabeça grande, franja roxa, olhão com brilho, chapelão de fita | sim | estrelinhas |
| 1 | Bruxa Feiosa | pele verde com verruga, narigão adunco, olho arregalado, fivela dourada; a poção do cinto estoura no chão | não | faíscas verdes |
| 2 | Gatinha Bruxa | gatinha branca de cabeça redonda, flor na orelha, chapeuzinho azul com estrela, rabinho | sim | estrelinhas rosa |
| 3 | Vampira | presas, gola alta; o morcego que voa junto foge | não | névoa vermelha |
| 4 | Gato Bruxo | gato preto, olho amarelo de fenda, cachecol vermelho | sim | faíscas |
| 5 | Catrina | caveira pintada, flores de cempasúchil | não | pétalas |
| 6 | Fantasminha | lençol de chapéu laranja; a ponta do lençol ondula no lugar da capa | sim | vagalumes |
| 7 | Bruxa da Cobrança | fone de operadora, crachá; voam boletos | não | moedas |

A Gatinha Bruxa é «no estilo» da Hello Kitty (gatinha branca, flor, chapéu),
sem copiar a personagem: a Hello Kitty é marca registrada da Sanrio.

**Os fofos não morrem.** Levam o tiro do mesmo jeito (cabeça, corpo, vassoura;
chapéu e raspão também), mas sem sangue, sem estourar e sem perder braço: no
tiro saem estrelinhas («BONK!», «NOCAUTE!»), caem e ficam **desacordados** no
chão com estrelinhas rodando na cabeça. Para a gincana conta igual: quem
acertou primeiro.

**A faixa** (`faixa.ts`): o letreiro corre como o dos zumbis, decorado —
bandeirinhas de Halloween, estrelinhas piscando, o rosto do personagem (olho em
X se morreu), a foto ou as iniciais numa moldura dourada e o nome entre
brilhinhos. Nos fofos é rosa, com coração, e diz «nocauteou».

## 3. Como testar

```
npm run dev
http://localhost:8080/lab-bruxas.html
```

Painel: escolher a bruxa, soltar (uma, sorteada, 3 de uma vez, «sem parar»), velocidade,
«outra pessoa matou» (headshot / corpo / vassoura), «tempo acabou», fundo (noite / sistema
claro / sistema escuro, para ver contraste), câmera lenta, **mostrar as áreas de tiro**, placar
com tempo médio e o mais rápido.

## 4. Para decidir (Cleber)

1. **Velocidade padrão**: Normal (42) ou Rápida (60)? Testar no laboratório.
2. **Tiro na vassoura vale como morte** no placar (hoje mata)? E o recorde de «vassourada» além do headshot?
3. **Chapéu não mata**: manter? (é a pegadinha de quem mira alto).
4. **Onde é o chão** na tela de verdade: a borda de baixo da área visível (como no laboratório) ou um chão a ~150 px abaixo de onde ela morreu? No sistema, a borda de baixo faz ela cair a tela inteira.
5. A bruxa voa **presa à janela** (atravessa a tela por cima da rolagem) ou **presa à página** como o zumbi? Voando, presa à janela faz mais sentido.
6. Quanto tempo a mancha fica (hoje 40 s; o zumbi é 1 min a 30%).

## 5. Fase 2 — ligar na caça de verdade (NÃO feita)

Precisa de migration, então **só com o «pode»** (regra do `CLAUDE.md`):

- `abobora_caca`: coluna `tema text DEFAULT 'zumbis'` (`'zumbis' | 'bruxas'`), escolhida no cartão de Configurações → Geral. O super_admin troca o tema da semana.
- `abobora_rodadas`: coluna `bruxa smallint` (0–7, sorteio sem repetir no dia, igual `zumbi`) e `tiro text` (`'cabeca' | 'corpo' | 'vassoura'`), para quem não atirou ver a bruxa morrer do jeito do vencedor e para um possível recorde de vassourada. `headshot` continua.
- `fn_abobora_soltar` sorteia `bruxa` quando o tema é bruxas; `fn_abobora_pegar` recebe o tipo do tiro.
- App: `index.tsx` carrega `bruxas/palco.ts` sob demanda (como a cena do zumbi) quando a rodada é de bruxa; a faixa diz «Fulano **derrubou a bruxa** primeiro, em X s» com HEADSHOT / VASSOURADA.
- Prazo: o «sumiu» do banco vira `fugirTodas()` (ela vai embora rindo).
- O teste `pacoteDeEntrada.test.ts` continua valendo: nada das bruxas no pacote de entrada.

## 6. Ideias que ficaram de fora (para escolher)

- **Caldeirão chefão**: a Bruxa-Mãe num caldeirão gigante, no lugar do Rei do Pop, que solta bruxinhas.
- Ela **joga uma poção** na tela de quem errou 3 tiros (a tela fica verde 2 s).
- **Abóbora-bomba** caindo da vassoura no rasante: acertar a abóbora dá ponto extra.
- Lua cheia: numa rodada por dia ela vem **dourada** (vale dobrado no ranking da gincana).
