# Parabéns nos destaques dos quebra-nozes

Pedido do Cleber em 18/11/2026. Quando os quebra-nozes mostram os destaques das 10h ou quem mais recebeu no dia, todo mundo pode parabenizar.

## Decisões

- Os parabéns são só ao vivo. Nada fica guardado depois do show.
- Um botão por show: «Parabenizar os destaques» às 10h e «Parabenizar <nome>» no boletim.
- A pessoa pode parabenizar várias vezes por show, com 700 ms de recarga entre os cliques. O botão existe enquanto os cartões estão em cena.
- Quem está nos cartões não vê botão, vê «Seus colegas estão te parabenizando!».
- Frases prontas, sem campo livre e sem valores. Palmas só para quem clicou.
- Balões com foto, nome e frase sobem pelas laterais, no máximo 6 na tela.

## Aviso antes dos destaques

Nos 5 s antes da chamada dos destaques, um aviso no alto e no centro da tela mostra sirene, contagem e «Os destaques vão ser anunciados agora», com som de sirene. Vale para as 10h e para «Chamar agora», que passa a subir 5,5 s depois do clique. Não vale para o boletim.

## Parte 1: tela (feita)

- `regrasDosParabens.ts`: textos, frases e colegas de mentira.
- `useParabensDoPalco.ts`: balões por WAAPI, sem redesenhar o palco.
- `BotaoDeParabens.tsx`: botão ou aviso embaixo dos cartões.
- Só aparece no laboratório e no «Ver só aqui» (`ensaio`). Show real segue sem botão.

## Parte 2: envio entre as pessoas (depende de migration)

1. O clique mostra o próprio balão na hora e espera um tempo sorteado de até 3 s.
2. Se chegou balão de outra pessoa nos últimos 2 s, não chama o banco. Cada pessoa tenta o banco no máximo 1 vez a cada 10 s: os outros cliques ficam só na tela dela.
3. Senão, chama uma função `SECURITY DEFINER`. Ela pega nome e foto do login, confere a cidade e recebe só o índice da frase.
4. Uma linha de freio por cidade deixa passar 1 envio a cada 2 s (`UPDATE ... WHERE ultimo < now() - interval '2 seconds'`).
5. Quem passa dispara `realtime.send` no tópico privado da cidade. A policy deixa ouvir quem é da cidade e o super admin.

O freio existe porque 300 pessoas por cidade recebem cada balão, e às 10h as duas cidades sobem juntas. Se o envio falhar, o show segue e a pessoa vê só o próprio balão.
