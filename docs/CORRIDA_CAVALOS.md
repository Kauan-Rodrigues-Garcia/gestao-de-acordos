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
para todos. Quem bate perde 18% de ritmo por 60 px. Os scripts de medida estão
descritos no histórico; para refazer, simule muitas sementes e conte a chance
de vitória por posição.

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
