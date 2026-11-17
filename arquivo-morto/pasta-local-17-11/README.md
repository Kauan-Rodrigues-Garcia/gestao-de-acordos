# Pasta local de 17/11/2026

O que existia **só nesta pasta**, sem commit, quando a `main` local foi alinhada
com a `origin/main` (c75a0af5) em 17/11/2026. Ficou valendo o que está no Git;
o que era só local veio para cá, no caminho que tinha.

Nada aqui é compilado, testado ou publicado.

- Backup completo do estado anterior (inclusive não rastreados):
  `refs/backup/pasta-principal-17-11` (a512d4cb, filho de 637c04cb).
- `patches/modificados-sobre-637c04cb.patch`: as mudanças nos arquivos que já
  eram rastreados, como diff sobre 637c04cb (base antiga, não aplica limpo na
  main nova).
- Ficaram de fora 43 arquivos que já estavam no Git, idênticos ao push 1675a9e2
  (Desafio Cobrança, Votação de opções, Dashboard, Direto/Extra).

## O que tem aqui

| Caminho | O que era |
|---|---|
| `src/pages/CreatorsLab/` | Reescrita do Creators Lab como «área de trabalho» (`desktop/`, `programas/`, `museu/`, `lib/intro`, `lib/janelas`). Também apagava `BarraLab`, `BootSequence` e `RealitySelect`, que continuam no Git. |
| ~~`src/pages/CampanhaFacil/`~~ | Campanha «Por setor» (quais líderes lançaram campanha, por setor). **Voltou para o app em 17/11** a pedido do usuário — saiu daqui. |
| `src/components/Corrida/guerra/cartas/`, `cavaloDaGuerra.d.ts`, `admin/CorridaConfig.tsx` | Cartas do Cavalo da Guerra. |
| `src/components/Insignias/lendas/dadosDasLendas.ts`, `arquivo-morto/halloween/...` | Ajuste das Lendas (em cima do Halloween, que já estava arquivado). |
| `src/pages/DesafioCobranca/index.tsx` | Versão de 16/11 com a correção do valor do ajuste: «R$ 50.000,00» ou valor com espaço virava NaN e o botão ficava apagado sem aviso; também diz o que falta para lançar. **Não está no Git.** A versão do Cleber (e3c23ea9) deixou o motivo opcional, então reaplicar só a parte do valor. |
| `src/pages/ModoTV/` | Mudanças pequenas no Modo TV, já superadas pelos commits do Cleber de 16/11 (0271a790, 8bdc3f7f). |
| `src/App.tsx` | Rota do RH com `RhUsuarios`. O Git (7e16cb72) decidiu ao contrário: a rota usa `AdminUsuarios` na visão do RH, e `RhUsuarios` foi apagada. |
| `lab-*.html`, `lab-*.tsx`, `lab-modo-tv/`, `lab-quadro.*` | Laboratórios: Desafio Cobrança, Modo TV, Cartas e Guerra dos Cavalos, Quadro. |
| `public/fonts/`, `public/sons/chefao/` | Fontes Cinzel e Cormorant, mais os sons do chefão. |
| `videos/` | Versão local do projeto Remotion: Modo TV, Líderes 93 e Fechamento «Entre Metas e Risadas», com músicas e scripts. |
| `videos/public/fechamento/`, `videos/public/lideres93/`, `videos/public/modo-tv/musica.wav` | Fotos de pessoas reais, os vídeos das entregas e a trilha gerada do Modo TV (~750 MB). **Ignorados pelo Git** (ver `.gitignore` desta pasta), ficam só neste computador. |

## Para restaurar algo

Copiar o arquivo de volta para o mesmo caminho, a partir da raiz do repositório.
Ou pegar do backup: `git show refs/backup/pasta-principal-17-11:<caminho>`.
