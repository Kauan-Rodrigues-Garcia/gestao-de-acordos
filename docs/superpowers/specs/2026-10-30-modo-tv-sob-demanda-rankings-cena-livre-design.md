# Modo TV — sob demanda, rankings, quitação e cena livre — design (30/10/2026)

Pedido do Cleber em 30/10/2026, feito antes do Bingo
(`2026-10-30-modo-tv-bingo-design.md`), que fica para a próxima rodada.

## Decisões (Cleber, 30/10/2026)

| Pergunta | Escolha |
|---|---|
| Tela «até trocar» | Sob demanda: fora do rodízio, só entra quando o líder põe no ar |
| Quem pode ser sob demanda | Qualquer tela |
| Formas de ranking | Equipe × equipe, pessoas de uma equipe, projeção (o «do dia» ficou de fora) |
| Quitação na TV | Igual ao Analítico, com os prêmios |
| Cena livre | Estúdio de arrastar no molde das Comemorações |

## Peças

- **Sob demanda** — `telas[].sob_demanda` no jsonb (só o `true` é gravado).
  `telaNoInstante` conta só as do rodízio e devolve o índice da lista
  inteira (-1 = nenhuma: tela de espera). Pôr no ar = `tela_fixa`, o mesmo
  controle remoto do «Fixar». Editor e «Na TV agora» mostram as duas seções.
- **Ranking** — Pódio e Lista ganham «Ranking de» (pessoas / uma equipe /
  equipes) e «Comparar» (recebido / projeção). `rankingDaTela` em
  `numeros.ts`. Entre pessoas a projeção não muda a ordem (o fator é o mesmo);
  entre equipes a barra mostra o % da meta da equipe.
- **Quitação** — template `quitacao`; `quitacaoDaTela` aplica as regras da aba
  (`POSICOES_COM_PREMIO`, `faltaParaPassar`). Setor sem o ranking: avisa onde
  ligar. Mês sem importação: avisa o mês.
- **Cena livre** — template `livre`, cena em `opcoes.cena`.
  `livre/cena.ts` (formato, saneamento, modelos, mover/redimensionar/camadas),
  `livre/CenaLivre.tsx` (o desenho, igual na TV e no estúdio),
  `livre/Estudio.tsx` (editor), `livre/metricas.ts` (número ao vivo).
  Elementos: texto, número ao vivo, imagem, relógio, forma; fundo do tema,
  cor, degradê, papel de parede das Comemorações ou imagem. Até 24 elementos.
  Mídia passa por `midiaSegura`.

## Banco

`supabase/migrations/20261030170000_modo_tv_sob_demanda_rankings_quitacao.sql`:
telas até 20 e 64 KB; `fn_tv_numeros_calcular` (corpo de 20261029230000) ganha
`equipes_ranking`, `ranking_por_equipe` e `quitacao`. O front funciona sem
ela: as cenas que dependem dela avisam, e painel com mais de 12 telas é
recusado com mensagem clara.

## Testes

`rodada5.test.ts` (sob demanda, ranking, quitação) e `livre/livre.test.ts`
(saneamento, caixa no palco, camadas, número ao vivo). Demonstração:
`/#/tv?demo=1&tela=17` a `21`.
