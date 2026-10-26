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
| A cantina no sistema (aba Cantina + painel da cantina) | o pessoal da cantina | ~54 s, sem voz | `Cantina` | `npm run render:cantina` | `prontos/cantina.mp4` |

Os `.mp4` de `prontos/` ficam **só no computador** (estão no `.gitignore`):
cada versão tem dezenas de MB e incharia o repositório para sempre. O código de
cada vídeo está no git; para ter o arquivo de novo, rode o `render` dele.

## Comandos

```bash
npm install                    # uma vez
npm run estudio                # abre o editor no navegador, com a linha do tempo de cada vídeo
npm run render                 # gera prontos/apresentacao-operador.mp4
npm run render:autorizacoes    # gera prontos/autorizacoes-no-chat.mp4
npm run render:cantina         # gera prontos/cantina.mp4
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

## Onde está cada coisa

| Arquivo | O quê |
|---|---|
| `src/Root.tsx` | lista de composições (um vídeo cada) |
| `src/linhaDoTempo.ts` | duração de cada cena (voz + respiro) e `palavra()` |
| `src/movimento.ts` | curvas, mola (overshoot ~3%), entrada escalonada, aperto do clique |
| `src/cenas/` | abertura (pergunta + logos), app, fechamento, manchetes |
| `src/app/` | as telas do app (mesmas classes do sistema), roteiro do cursor e da câmera, `alvos.json` |
| `src/autorizacoes/` | o vídeo das autorizações no chat |
| `src/cantina/` | o vídeo da cantina (fotos de exemplo em `public/cantina/`) |
| `src/estilo/` | Tailwind + o CSS copiado do app (`npm run css-do-app`) |
| `src/Trilha.tsx` | voz, efeitos sonoros e música |
| `scripts/sons.mjs` | gera os efeitos sonoros (`public/sons/`) |
| `scripts/quadros.mjs` | tira quadros soltos para conferir: `node scripts/quadros.mjs 600 1500` |
| `prontos/` | os `.mp4` gerados (fora do git) |
