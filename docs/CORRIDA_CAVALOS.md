# Corrida de Cavalos

Laboratório da nova categoria da Corrida da Sorte. Tudo está num arquivo só,
`lab-cavalos.html` na raiz, e roda só no `npm run dev`:
<http://localhost:8080/lab-cavalos.html>. O build leva só o `index.html`, então
o lab nunca vai ao ar.

**Estado (21/10/2026):** fechado como laboratório. Ele **não tem banco**: as
pessoas, as fotos e as apostas são de mentira, geradas na própria aba. Este
documento diz o que já está decidido e o que falta para ligar ao sistema.

---

## Regras do Cleber — valem para a versão de produção

1. **Super admin sempre assiste, invisível.** Ele não é marcado na lista e não
   aparece no paddock, nas contagens, nas apostas nem na arquibancada. Depois
   de criar a corrida, recebe um botão «Assistir». Assiste como uma pessoa
   normal, mas com os controles do organizador em cima da janela. O palpite
   dele só ele vê.
2. **Só o super admin vê que a corrida é gravada.** Para quem corre ou assiste,
   nenhum texto, status, faixa ou aviso contém «grav». A corrida continua
   aleatória; a palavra é que gera briga.
3. **Janela no canto, não tela cheia.** Mesmo formato da Corrida da Sorte
   (`PalcoCorrida.tsx`): 760×450 no canto e ampliar para 1280×780. Um balão de
   fala recomenda a tela cheia, uma vez por corrida.
4. **Sem versão de celular.**
5. **Desenhada ao vivo em cada PC, não em vídeo.** A gravação são só as
   posições. Prioridade: não travar em PC fraco. Sem enfeites novos.
6. **Animação mesmo com «reduzir animações» do Windows.** O arquivo não tem
   `@media (prefers-reduced-motion)`, de propósito (ver `docs/CREATORS_LAB.md`).

## Fluxo

| Quem | O que vê |
|---|---|
| Super admin | Monta a corrida, depois «Assistir» invisível com PREPARAR e SOLTAR em cima da janela |
| Operador que corre | Escolhe o cavalo (um dono por cavalo) e espera no paddock |
| Operador que assiste | Convite «Assistir», paddock, palpite só pela sorte (sem prêmio), emojis |

Fases: `escolha`/`convite` → `lobby` (paddock) → **PREPARAR** (sorteia os
cavalos sem dono, grava a corrida, senta a torcida) → `preparada` → **SOLTAR**
(contagem de 3 s) → `corrida` → `replay` → `foto` → `festa`. Replay e foto
acontecem em **toda** corrida.

A montagem é a mesma da Corrida da Sorte (`admin/SeletorPessoas.tsx` e
`CorredoresSemPerfil.tsx`): prêmio, mapa, quem corre (até 24), corredor sem
perfil e quem assiste.

## O contrato da gravação

`simular(seed, n)` é **determinística**: mesma semente e mesmo número de
cavalos dão a mesma corrida em qualquer aparelho. Todo sorteio sai do `rng`
semeado, na ordem, inclusive as chances de arrancada e as batidas nas
barreiras. Para mudar o motor sem quebrar corrida já gravada, só acrescente
sorteios **no fim**.

O que a simulação devolve e precisa ir no arquivo da gravação:

| Campo | O que é |
|---|---|
| `X` | `Int16Array`, posição de cada cavalo a cada 1/30 s, em quartos de pixel desde a largada |
| `fin`, `ordem`, `vencedor`, `tVenc`, `gap`, `dur` | Chegada |
| `barreiras`, `bate` | Onde estão as barreiras e quem bate em qual (o desenho do pulo e do tombo depende disso) |
| `seed`, `tipo`, `n`, `frames` | Identificação |

Uma corrida de 10 cavalos tem ~16 KB crus e ~14 KB em gzip. O formato
`CDS1` de `src/components/Corrida/gravacao.ts` serve: basta trocar os vetores
(`X`, `fin`, `ordem`) e mandar `barreiras` e `bate` no cabeçalho JSON.

## Justiça e emoção (medidos em 2.000 corridas)

| | Antes | Agora |
|---|---|---|
| Chance de vencer por posição aos 3 s (justo = 10%) | 13% → 8% | 9% a 11% |
| Ultrapassagens visíveis (10 cavalos) | 50 | 76 |
| Último do meio da corrida no pódio | 4% | 18% |

O que produz isso: ondas de ritmo e surtos por cavalo, arrancada de quem fica
para trás, cansaço de quem abre mais de 12 m, **largada parelha** (reação de
0,05 a 0,17 s) e **fôlego guardado** (quem estava atrás aos 30% ganha até +3,5%
na reta final). As barreiras são 3, com 7% de chance de bater em cada, igual
para todos. Depois de pousar, todo cavalo perde até 16% de ritmo e volta a
acelerar em 110 px (`RECUP`, `pouso`); quem bate ainda perde 18% por 60 px.
Com a recuperação (22/10/2026), a vitória por raia ficou entre 9,3% e 10,8%
em 2.000 corridas de 10. Os scripts de medida estão descritos no histórico;
para refazer, simule muitas sementes e conte a chance de vitória por posição.

## O obstáculo e o salto (22/10/2026)

- **O obstáculo** copia a foto de hipismo que o Cleber mandou: asas roxas com
  painel amarelo e um cavalinho branco empinado em cima, e três varas brancas
  com o meio roxo e faixas amarelas. É um só por ponto da pista, atravessando
  as raias em diagonal: a asa do fundo fica atrás da primeira raia e a da
  frente fica na grama, na frente da última (`OB_K`, `OB_Y0`, `OB_Y1`). Cada
  raia cruza as varas num ponto próprio (`desvioRaia(i, n)`), e a simulação
  usa o mesmo ponto. As varas são desenhadas em fatias de profundidade entre
  os cavalos (`varas`), para cada um passar na frente do que está atrás dele.
  Um obstáculo por raia virava uma escada roxa: as raias ficam a 7,6 px uma
  da outra.
- **O salto** tem 16 quadros próprios (`pose.s`): decola empinado, com as
  dianteiras dobradas e as traseiras empurrando; passa reto por cima das
  varas, com as quatro pernas encolhidas; desce de focinho, esticando as
  dianteiras; pousa levantando terra. O corpo é girado nos dados do quadro
  (`girar`) e nunca passa do chão (`baixo`, `chao`). Quem bate sobe menos e
  derruba a vara de cima, que fica no chão até o fim.
- **Leveza:** os quadros do salto saem no «gravando a corrida» (~6 ms por
  cavalo), e não no primeiro obstáculo, onde todos pulariam no mesmo quadro.

## A reta final, a arquibancada e a festa (22/10/2026)

- **Chegada de focinho, como no turfe:** quem decide é a ponta do nariz, e a
  cabeça sobe quando as patas da frente saem do chão e desce quando pousam.
  Nos últimos 240 px o cavalo estica o pescoço e baixa a cabeça, em três
  níveis (`estica`, quadros `e1` a `e3`), e alonga a passada; passada a linha,
  volta ao galope normal em 100 px. O corpo recua o que a cabeça avança, então
  o focinho desenhado é sempre o da simulação (medido: +1 px, o contorno, em
  todo quadro e nível). A foto da chegada continua batendo com o resultado.
- **Arquibancada com quem assiste:** o bloco de fotos se repete a cada tela
  (`G.arqP`), e não um lugar só ao longo de 1.600 px; com mais gente do que
  cabe numa tela (150 por tela na arquibancada, 50 na praia), o bloco ocupa
  mais telas. «Você» se repete a cada tela, sempre, e o lugar fica guardado
  nas outras repetições. Os lugares que sobram são da torcida desenhada.
- **Festa:** a foto de quem venceu ao lado do nome, e a foto do 2º e do 3º
  no pódio (sem foto, as iniciais). A foto vai no `dono` do cavalo; a sua sai
  de `G.eu`.
- **Festa sem rolagem:** os raios girando têm 240vmax e criavam barra de
  rolagem nos dois sentidos (`#festa` era `overflow:auto`). Agora a festa corta
  o que passa da janela, fica em duas colunas (quem venceu | pódio, palpites e
  botões) e `encaixarFesta` encolhe o conteúdo para caber na janela pequena,
  sem nunca aumentar. Na Corrida da Sorte a festa é desenhada no canvas, por
  isso lá nunca rolou.

## Card de divulgação, plateia atrasada, rosas e o tema (22/10/2026)

- **Card de divulgação:** o mesmo aviso da Corrida da Sorte
  (`CardDivulgacao.tsx`), no tema do hipódromo. No alto, os cavalos do jogo
  galopando e pulando o obstáculo (o mesmo salto e as mesmas `varas`, numa
  pista menor: `DV`); embaixo, «Fica esperto!», o título em Rye, a mensagem,
  o prêmio num bilhete de páreo com a roseta de campeão e «Oba! Vou ficar de
  olho». Na montagem, a caixa «Card de divulgação» escreve, mostra («Ver como
  fica»), escolhe quem recebe (o mesmo seletor), manda e lista os cards com
  «X/Y viram» e «Tirar do ar». No lab, quem vira operador recebe o card que
  está no ar, e o pessoal «fecha» sozinho aos poucos. **Para ligar ao
  sistema:** dá para reaproveitar as divulgações da Corrida da Sorte
  (`divulgar`, `fecharDivulgacao`, `tirarDivulgacao`), com um campo dizendo
  de qual corrida é o card.
- **Plateia com foto desde a largada:** os lugares eram distribuídos uma vez,
  no PREPARAR, e só para quem já tinha chegado ao lobby; quem chegava depois
  ficava sem lugar. Agora quem chega depois entra atrasado e senta na hora
  (`chegarAtrasado`), sem apostar, e o bloco da arquibancada conta todos os
  convidados.
- **Festa sem confete:** chuva de pétalas de rosa e brilhos dourados
  (`Petalas`), e o campeão com a manta de rosas no pescoço (`comManta`), como
  no Derby.
- **O tema da chegada (22/10/2026):** na reta final (os últimos 700 px) a
  música do jogo vai baixando; no instante em que o vencedor cruza a linha entra
  «O Rei do Gado» (`public/sons/cavalos/rei-do-gado.mp3`) **já alto**, e ele
  segue pelo replay, pela foto e pela festa até a música acabar (o «Ver replay»
  não o corta). Só uma corrida nova o tira. Quem entra atrasado ouve o mesmo
  trecho que os outros (`tocarTema`, pelo relógio do banco). O arquivo desce no
  paddock, cada tela num segundo diferente (até 20 s). Sem fanfarra na festa.
  Respeita o botão de som.
- **Ficha do cavalo (22/10/2026):** clicar no cavalo do paddock abre a ficha:
  quem corre com ele (foto, nome, setor) e quem apostou nele. O palpite é só
  nos cards de baixo, que mostram o dono de cada cavalo. O boneco de quem corre
  leva o número do cavalo junto do nome.
- **Teste do super admin (22/10/2026):** o «Testar só na minha tela» não anda
  sozinho: barra com Lobby do zero, Encher o paddock, Música agora, Gravar,
  Largar, Pular a contagem, Ir para a chegada, a visão (quem assiste / quem
  corre) e a chegada apertada.
- **Gravação leva o cavalo de cada raia (`cavalos`, 22/10/2026):** quem ganhou
  cavalo no sorteio do PREPARAR entra na largada mesmo que a tela ainda não
  tenha relido a sala. O SOLTAR do organizador só libera 8 s depois de gravar
  (o tempo de toda tela baixar a corrida, espalhada em até 6 s).

## O locutor, o seu cavalo, a tremida e o zoom ao vivo (22/10/2026)

Medido em 300 corridas de 10: um terço das chegadas é no focinho, mas a faixa
ficava vazia por 24 s e só o tombo na barreira era anunciado. A emoção existia
e ninguém contava. Nada disto mexe na física nem no banco.

- **O locutor** (`montarLances`, `narrar`): os lances saem da própria gravação,
  uma vez por corrida (`rec.lances`, < 1 ms), sem sortear nada. Toda tela narra
  a mesma corrida no mesmo segundo, e quem entra atrasado começa do lance de
  agora (`F.lc`). No feed: quem sai na frente, quem **assume a ponta** (só quem
  segura 1 s, com a folga do placar) e quem **vem por fora** (subiu 3 posições
  em 2 s, 2 com menos de 8 cavalos, e está entre os 4 primeiros), com o dono
  entre parênteses. Na faixa, no alto da pista (`faixa(txt, true)`): **RETA
  FINAL!** a 300 m, **#A E #B CABEÇA A CABEÇA!** (os dois da frente a até 5 px
  por 0,5 s, depois da faixa da reta) e **FOTO À VISTA!** a 60 m com os dois a
  até 6 px. Há um espaço mínimo entre lances (1,8 s no feed, 2,2 s na faixa). A
  frase varia pelo quadro do lance (`FRASES`). São de 6 a 10 lances por corrida.
- **O seu cavalo** (`atualizarHud`): o chip pula ao subir (▲, verde) e treme ao
  cair (▼, vermelho), com um som curto (`Som.sobe`/`Som.desce`). Na frente vira
  «VOCÊ NA PONTA!», mas só depois de 1,5 s, porque na largada todos estão
  parelhos. Na janela pequena o chip some, e a sua linha do placar pisca.
- **A tremida** (`tremer`): só CSS, nada a mais por quadro. A imagem treme e a
  moldura fica. Acontece no «VAI!», no tombo na barreira e no cruzar da linha.
- **O coração**: com os dois da frente a menos de 8 px nos últimos 260 px, um
  tum-tum grave a cada 0,5 s (`Som.coracao`). Não é ruído contínuo.
- **Zoom ao vivo** (`ZOOM_GAP`, `ZOOM_PX`, `ZOOM_RAMPA`): quando a chegada é
  por uma cabeça ou menos (`gap` < 0,07 s, metade das corridas de 10), a câmera
  fecha nos últimos 150 m até o mesmo recorte do replay. As fotos da
  arquibancada saem enquanto vale o zoom.

## A reta final na física: o fim de cada um, a pressão e o duelo (22/10/2026)

Essa mudança, ao contrário do locutor, mexe no resultado, mas só das corridas
**novas**. A gravação guarda as posições, não a semente, então uma corrida já
gravada não muda. Os sorteios novos ficam no fim (`fimA`, `duelo`), como pede o
contrato. Constantes e medida estão no comentário em cima de `simular`.

- **O fim de cada um:** a partir de 80% da pista, cada cavalo ganha ou perde até
  8% de ritmo (`FIM_A`, sorteado por cavalo).
- **A pressão no líder:** na reta final, o líder perde até 5% de ritmo
  (`PRESSAO`), proporcional à folga sobre o segundo, até 20 px.
- **O duelo** (tipo novo, `rec.tipo === 'duelo'`): metade das corridas normais,
  ~20% de todas. Aos 75%, os dois da frente duelam até a linha. A diferença
  entre eles segue um caminho que troca de lado 2 ou 3 vezes, até 14 px no
  começo e 7 px na linha, e termina com o vencedor sorteado. Quem chega perto da
  dupla cansa. O locutor anuncia «RETA FINAL: #A CONTRA #B!».

| 2.000 corridas de 10 | Antes | Agora |
|---|---|---|
| Quem lidera aos 90% vence | 55,6% | 41,3% |
| Trocas de ponta visíveis no último quarto | 1,13 | 1,35 |
| Sem troca de ponta no último quarto | 24,5% | 17,3% |
| Chegada apertada | 33,3% | 37,0% |
| Vitória por posição aos 3 s (justo = 10%) | 8,9% a 11,3% | 9,0% a 11,3% |

Com 4 cavalos, o líder aos 90% vence 52% (era 66%); com 24, vence 39% (era 48%).
«Trocas visíveis» usa a mesma folga do placar (6 px). Na primeira versão do
duelo a correção era fraca: as ondas de ritmo (até ±18%) brigavam com ela, e um
terceiro cavalo passava pelos dois. Daí o `DUELO_KP` alto e o cansaço de quem
se aproxima.

## Leveza (o que não pode voltar)

- **Paddock:** 30 quadros por segundo, e 15 atrás da tela de escolha. No
  máximo 48 bonecos e 6 emojis ao mesmo tempo.
- **Corrida:** qualidade automática. Roda a 60 q/s e cai para 30 se a média
  entre quadros passar de 24 ms por 1,5 s.
- **Fotos e nomes:** DOM do paddock só é tocado quando a cabeça muda de pixel.
  As fotos da arquibancada ficam num canvas só, na faixa da arquibancada (um
  elemento HTML por pessoa custava +29 pontos de CPU).
- **Texto em canvas:** emoji e etiqueta viram imagem pronta uma vez. Emoji
  desenhado como texto por quadro custava ~18 pontos.
- **Sem `backdrop-filter`** em cima do canvas animado.
- **Sprites dos cavalos** montados só quando alguém pede, e com 4 px de folga
  à esquerda para o rabo do galope não ser cortado.
- **Replay:** a câmera do cenário anda em pixel inteiro; cavalo e poeira se
  medem contra a câmera sem arredondar (o arredondamento duplo fazia tremer).
- **Medir com GPU ligada também:** o Chromium headless sem GPU exagera o custo
  de composição.

## O que falta para produção

Nada disto foi feito. **Mexer no banco exige autorização explícita do Cleber**
(ver `CLAUDE.md`).

1. **Banco.** Reaproveitar as tabelas e RPCs da Corrida da Sorte (`banco.ts`,
   `admin/acoes.ts`), com um tipo de corrida «cavalos». Conferir no schema o que
   já existe: escolha única de cavalo por corrida (índice único corrida + cavalo),
   palpite e prêmio. A escolha concorrente hoje é simulada; no sistema é RPC.
2. **Super admin invisível.** Hoje a Corrida da Sorte não tem essa regra. Ela
   precisa entrar nas consultas da sala, das contagens e das apostas, nos dois
   jogos.
3. **Gravação.** Empacotar com `gravacao.ts`, subir no balde `corridas` e
   espalhar o download como o `PalcoAoVivo` já faz (espera aleatória antes da
   largada).
4. **Fotos reais.** `perfis.foto` no lugar de `fotoFalsa()`. As fotos de quem
   assiste precisam estar carregadas antes do PREPARAR, porque o recorte em
   círculo é feito uma vez.
5. **Componente React.** O lab é um arquivo único de propósito. Para o sistema,
   separar motor (simular, desenhar), paddock, placar e janela, e carregar sob
   demanda como o palco da Corrida da Sorte (`index.tsx`).
6. **Modo leve.** A caça aos zumbis ignora o Modo leve; aqui deve ser igual (o
   jogo já é leve por conta própria).
