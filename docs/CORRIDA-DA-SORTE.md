# Corrida da Sorte

O sorteio em forma de corrida (20/10/2026). Cada pessoa escolhida corre com um
bichinho; quem cruzar primeiro leva o prêmio. Todo mundo assiste junto, no
mesmo segundo. Substitui a Caça aos Zumbis e às Bruxas (ver
`arquivo-morto/caca-zumbis-bruxas/`).

## Onde mora

| O quê | Onde |
|---|---|
| O banco (tabelas, funções, avisos, bucket) | `supabase/migrations/20261020130000_corrida_da_sorte.sql` |
| O card do super_admin (Configurações → Geral) | `src/components/admin/CorridaConfig.tsx` |
| A porta no Layout (escolha, convite, card, palco) | `src/components/Corrida/index.tsx` |
| O estado de cada pessoa, o relógio do banco, os avisos | `src/components/Corrida/banco.ts` |
| O palco (HTML em volta do canvas) | `src/components/Corrida/PalcoCorrida.tsx` |
| O motor (mapas, física, lobby, festa, vídeo) | `src/components/Corrida/motor/motor.js` (contrato em `motor.d.ts`) |
| O arquivo da gravação | `src/components/Corrida/gravacao.ts` |
| As músicas | `public/sons/corrida/` (Tokyo Drift no lobby, o Tema da Vitória) |

## O caminho de uma corrida

1. **Montar** (super_admin): prêmio, quem corre, quem assiste → «Chamar».
   Só quem corre fica sabendo: recebe na hora o convite para escolher o
   bichinho (três sorteados para a pessoa; dá para trocar até a gravação).
2. **Abrir**: o card «Assistir» chega para quem foi chamado (quem assiste e
   quem corre). Quem entra senta na arquibancada do lobby, com a foto do
   cadastro. A música começa 15 s depois da abertura, em 10% subindo até
   20% em 6 s; cada um ajusta de 0 a 20% ou deixa mudo.
3. **Gravar**: o navegador do super_admin simula a corrida e grava em vídeo o
   replay e a festa de quem venceu. Os arquivos sobem para o bucket
   `corridas` e o resumo vai para `corridas.gravacao`. Daí em diante ninguém
   troca bichinho, pessoas nem prêmio (dá para descartar e gravar de novo).
4. **Largar**: `inicia_em` = hora do banco + 4 s. Cada tela calcula o que
   mostrar a partir de `agora - inicia_em` (contagem de 10 s, a caixa dos
   mapas, a abertura, a corrida, a festa). Quem entra atrasado cai no ponto
   certo.
5. **Encerrar**: depois da festa. Esquecida «correndo», a corrida para de
   segurar a próxima 15 min depois da largada.

O **card de divulgação** é à parte: o super_admin escolhe quem recebe, a
pessoa fecha, e fica anotado no banco.

## Quem vê o quê (regra do banco, provada em `Corrida/banco.sql.test.ts`)

- `fn_corrida_minha`: na fase de escolha, só quem corre vê a corrida; aberta
  ou correndo, quem foi chamado; ninguém mais.
- Os avisos vão por Broadcast do banco: `corrida-eu:<usuario>` (só a
  pessoa) e `corrida-sala:<corrida>` (só quem foi chamado e o super_admin).
  Ninguém escreve nos tópicos: só o banco avisa.
- O bucket `corridas` é privado: baixa quem foi chamado; envia só o
  super_admin.

## Testar

- Em Configurações → Geral, «Testar só na minha tela»: uma corrida inteira com
  pessoas de mentira, sem banco e sem ninguém mais ver (lobby, música,
  gravação, largada, corrida, festa).
- No `npm run dev`: `/lab-corrida.html` (o mesmo teste, mais a escolha do
  bichinho e o card de divulgação). Rode o dev apontando para um Supabase que
  não seja o de produção.
