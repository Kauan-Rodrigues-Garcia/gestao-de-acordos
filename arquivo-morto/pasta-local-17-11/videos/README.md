# Vídeos do sistema

Todos os vídeos do Gestão de Acordos no estilo "demo de produto" moram aqui:
um cursor que clica, as telas que abrem e animações limpas. São feitos em código
com [Remotion](https://www.remotion.dev) (1080p, 60 fps). As telas usam o CSS e
as classes do próprio app (tema claro), via Tailwind v4.

Projeto separado do app: tem o próprio `package.json` e não mexe em nada fora
desta pasta. Todos os dados que aparecem na tela são fictícios.

## Catálogo

| Vídeo | Para quem | Duração | Composição | Gerar | Arquivo pronto |
|---|---|---|---|---|---|
| Apresentação do sistema | operador (regra Nosso produto) | ~82 s, com narração | `Operador` | `npm run render` | `prontos/apresentacao-operador.mp4` |
| Autorizações no chat (atualização de permissões) | líderes | ~21 s, sem voz | `Autorizacoes` | `npm run render:autorizacoes` | `prontos/autorizacoes-no-chat.mp4` |
| Modo TV (mesa e parede) | liderança | ~2 min, sem voz, música baixa | `ModoTV` | `npm run render:modo-tv` | `prontos/modo-tv.mp4` |
| Entre Metas e Risadas (fechamento, foto por foto dos setores) | todo mundo, para postar | ~2 min 34 s, vertical 1080×1920 30 fps, trilha própria | `Fechamento` | `npm run render:fechamento` | `prontos/entre-metas-e-risadas.mp4` |

Os `.mp4` de `prontos/` ficam **só no computador** (estão no `.gitignore`):
cada versão tem dezenas de MB e incharia o repositório para sempre. O código de
cada vídeo está no git; para ter o arquivo de novo, rode o `render` dele.

## Comandos

```bash
npm install                    # uma vez
npm run estudio                # abre o editor no navegador, com a linha do tempo de cada vídeo
npm run render                 # gera prontos/apresentacao-operador.mp4
npm run render:autorizacoes    # gera prontos/autorizacoes-no-chat.mp4
npm run medir                  # depois de mexer no desenho de uma tela: reposiciona cursor e câmera
```

## Vídeo novo

1. Crie a pasta `src/<nome-do-video>/` com o componente e os tempos (veja
   `src/autorizacoes/`). Telas, cursor, câmera, fundo e manchetes são
   reaproveitados de `src/app/`, `src/componentes/` e `src/cenas/`.
2. Registre a composição em `src/Root.tsx`.
3. Adicione o `render:<nome>` no `package.json`, com saída em `prontos/<nome>.mp4`.
4. Ponha a linha dele no catálogo acima.

## Apresentação do operador: trocar a narração

1. Substitua o arquivo em `public/audio/cena-XX.mp3` (mesmo nome).
2. Rode `npm run transcrever`. Ele mede a duração e o tempo de cada palavra
   (Whisper local) e grava `src/duracoes.json` e `src/tempos.json`.
3. Pronto: as cenas se reencaixam sozinhas. Os cliques e as animações estão
   presos às palavras (`palavra('cena-04', 'salvo')`). Se mudar o texto falado,
   confira em `src/app/roteiro.ts` se as palavras usadas ainda existem.

Histórico e o que falta nesse vídeo: `PROGRESSO.md`.

## Música de fundo

Coloque `public/musica.mp3`. Ela entra sozinha, com fade no início e no fim, e
abaixa enquanto a voz fala. Sem o arquivo, o vídeo sai só com voz e efeitos.

## Modo TV: gravado, não redesenhado

O vídeo do Modo TV mostra a mesa REAL (o código de `arquivo-morto/modo-tv/`)
rodando com dados fictícios na página de ensaio `lab-modo-tv.html` (raiz do
repositório, fora do git). Para refazer a gravação, com o `npm run dev` do app
de pé:

1. `node scripts/modo-tv-gravar.mjs <pasta>` — clica, digita e alterna mesa e
   parede; grava os quadros e o `log.json` (cursor, cliques, teclas, marcas,
   retângulos, vistas).
2. `node scripts/modo-tv-montar.mjs <pasta> public/modo-tv/gravacao.mp4`.
3. Copie o `log.json` para `src/modo-tv/gravacao.json` (sem o campo `quadros`,
   cursor como `[t, x, y]`). Se o roteiro mudou, confira os tempos dos balões,
   da câmera e das manchetes em `src/modo-tv/VideoModoTV.tsx`.

A música (`public/modo-tv/musica.wav`) é composta por código:
`node scripts/musica-modo-tv.mjs 130`.

## Entre Metas e Risadas: trocar fotos ou nomes

Tema cinema, vertical para Reels/Status. Cada setor abre numa claquete, cada
pessoa entra numa polaroid (a foto INTEIRA, sem corte, com ela mesma desfocada
ao fundo) e o setor fecha num mural com todo mundo. Depois vêm o mosaico, os
créditos e o «Fim… continua».

1. Fotos em `public/fechamento/fotos/<setor>-<nome>.jpg` (no máximo 1400 px).
   Foto nova: rode de novo o bloco que grava `src/fechamento/fotos.json` (as
   medidas de cada foto) ou acrescente a linha à mão.
2. Nomes, ordem, gênero de cada setor e cor: `src/fechamento/elenco.ts`.
3. `npm run render:fechamento` regera a trilha (ela lê quantas pessoas cada
   setor tem, para os cortes caírem nas batidas) e o vídeo.
4. Folha de contato para conferir as fotos:
   `npx remotion still src/index.ts FechamentoFolha out/folha.png`.

A trilha (`public/fechamento/trilha.wav`) é composta por código em
`scripts/musica-fechamento.mjs` — sem direito autoral, pode postar.

## Líderes que bateram o desafio

Vertical, 1min54s: abertura com o medidor, uma cena por entrega do Vale Compra
Bandeirante (17) e o mosaico de parabéns. Sem o som original dos vídeos, só a
trilha. Transições em três estilos revezando (faixa, zoom, chicote), em
`src/lideres93/transicoes.tsx`. `npm run render:lideres93` →
`prontos/lideres-que-bateram-o-desafio.mp4`.

- Os vídeos vêm de `Downloads\Lideres que fecharam acima de 93` (ordem
  alfabética = `c01`…`c21`), passados para 1080×1920 em `public/lideres93/`
  (fora do git: são pessoas reais). As fotos do mosaico ficam em
  `public/lideres93/fotos/`.
- Cortes, o instante do «ganhou» e a foto do mosaico: `src/lideres93/elenco.json`.
  `scripts/lideres93-linha.mjs` prende tudo às batidas e grava `linha.json`.
- O `c20` mostra o cupom de perto com nome e CPF legíveis: ficou de fora de propósito.
- Três versões de música (`src/lideres93/versoes.json`), cada uma com a linha do
  tempo refeita no ritmo dela (o «ganhou» cai na batida da música):
  - `npm run render:lideres93` — trilha própria (120 bpm);
  - `npm run render:lideres93:uptown` — Uptown Funk (115 bpm, explosão em 16,45 s
    na primeira entrega);
  - `npm run render:lideres93:cantstop` — Can't Stop the Feeling (113 bpm; a
    introdução tem a batida deslocada meio tempo, então a explosão de 25,39 s é
    colada direto na primeira entrega).
  As músicas ficam em `public/lideres93/musicas/` (fora do git). Com música de
  verdade, `musica-lideres93.mjs <versão>` gera só os efeitos (sem nada com nota,
  para não desafinar) e mixa por baixo → `public/lideres93/audio-<versão>.wav`.
  As versões dividem o `linha.json`: renderize uma de cada vez.

## Onde está cada coisa

| Arquivo | O quê |
|---|---|
| `src/Root.tsx` | lista de composições (um vídeo cada) |
| `src/linhaDoTempo.ts` | duração de cada cena (voz + respiro) e `palavra()` |
| `src/movimento.ts` | curvas, mola (overshoot ~3%), entrada escalonada, aperto do clique |
| `src/cenas/` | abertura (pergunta + logos), app, fechamento, manchetes |
| `src/app/` | as telas do app (mesmas classes do sistema), roteiro do cursor e da câmera, `alvos.json` |
| `src/autorizacoes/` | o vídeo das autorizações no chat |
| `src/estilo/` | Tailwind + o CSS copiado do app (`npm run css-do-app`) |
| `src/Trilha.tsx` | voz, efeitos sonoros e música |
| `scripts/sons.mjs` | gera os efeitos sonoros (`public/sons/`) |
| `scripts/quadros.mjs` | tira quadros soltos para conferir: `node scripts/quadros.mjs 600 1500` |
| `prontos/` | os `.mp4` gerados (fora do git) |
