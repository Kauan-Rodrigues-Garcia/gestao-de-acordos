# Vídeo de apresentação — operador

Vídeo de ~82 s (1080p, 60 fps) feito em código com [Remotion](https://www.remotion.dev).
As telas usam o CSS e as classes do próprio app (tema claro), via Tailwind v4.
Projeto separado do app: tem o próprio `package.json` e não mexe em nada fora desta pasta.
Todos os dados que aparecem na tela são fictícios.

## Comandos

```bash
npm install            # uma vez
npm run estudio        # abre o editor no navegador, com a linha do tempo
npm run render         # gera out/gestao-de-acordos-operador.mp4
npm run medir          # depois de mexer no desenho de uma tela: reposiciona cursor e câmera
```

## Trocar a narração

1. Substitua o arquivo em `public/audio/cena-XX.mp3` (mesmo nome).
2. Rode `npm run transcrever`. Ele mede a duração e o tempo de cada palavra
   (Whisper local) e grava `src/duracoes.json` e `src/tempos.json`.
3. Pronto: as cenas se reencaixam sozinhas. Os cliques e as animações estão
   presos às palavras (`palavra('cena-04', 'salvo')`). Se mudar o texto falado,
   confira em `src/app/roteiro.ts` se as palavras usadas ainda existem.

## Música de fundo

Coloque `public/musica.mp3`. Ela entra sozinha, com fade no início e no fim, e
abaixa enquanto a voz fala. Sem o arquivo, o vídeo sai só com voz e efeitos.

## Onde está cada coisa

| Arquivo | O quê |
|---|---|
| `src/linhaDoTempo.ts` | duração de cada cena (voz + respiro) e `palavra()` |
| `src/movimento.ts` | curvas, mola (overshoot ~3%), entrada escalonada, aperto do clique |
| `src/cenas/` | abertura (pergunta + logos), app, fechamento, manchetes |
| `src/app/` | as telas do app (mesmas classes do sistema), roteiro do cursor e da câmera, `alvos.json` |
| `src/estilo/` | Tailwind + o CSS copiado do app (`npm run css-do-app`) |
| `src/Trilha.tsx` | voz, efeitos sonoros e música |
| `scripts/sons.mjs` | gera os efeitos sonoros (`public/sons/`) |
| `scripts/quadros.mjs` | tira quadros soltos para conferir: `node scripts/quadros.mjs 600 1500` |
