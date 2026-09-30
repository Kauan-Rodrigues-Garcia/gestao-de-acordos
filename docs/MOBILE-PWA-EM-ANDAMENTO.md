# Versão mobile (PWA) + push de pagamento — brainstorm em andamento

> **ESTADO EM 30/09/2026: etapas 1–3 (operador) NO AR. Fase da LIDERANÇA: L1 (tela da
> equipe) implementada, aguardando conferência; L2 (aviso de meta) pendente — ver «Liderança — brainstorm RETOMADO».**
>
> **Para quem retoma isto** (o Cleber ou um agente numa sessão nova). Escrito em
> **29/09/2026**, no meio do brainstorm. **Nada foi implementado.** Não existe
> design aprovado nem spec: o processo está na etapa de perguntas. Leia a §4
> («Onde paramos») e continue dali. No fim há outras pendências da mesma sessão
> (§7), que não têm relação com o mobile.

---

## 1. O pedido, nas palavras do usuário

«Aprimorar o projeto para funcionar 100% no celular — acessando hoje tá tudo
bagunçado. Uma versão para mobile, mais minimalista, **só com dashboard**. O
pessoal baixa o app, aqueles apps simples que são o próprio site, e tem acesso às
suas informações: se teve algum pagamento novo, com **notificações chamativas
tipo aplicativo de vendas (Hotmart)**, dizendo que recebeu tanto via Pix,
boleto ou cartão.»

Dúvida que ele levantou e já foi respondida: **«isso vai ter que fazer um
app?»** Não. É um **PWA**: o mesmo site, instalado pelo navegador («Adicionar à
tela inicial»), com ícone e tela cheia, atualizado a cada deploy da Vercel, sem
loja. Se um dia precisar de loja, dá para embrulhar o mesmo site depois
(Capacitor / TWA) sem refazer.

---

## 2. O que existe hoje (levantado em 29/09/2026)

| | Estado |
|---|---|
| `manifest.webmanifest` | **não existe** (`public/` só tem logos, `sounds/`, `version.json`) |
| Service worker | **não existe**; `vite-plugin-pwa`, `workbox` e `web-push` não estão no `package.json` |
| Push de verdade | **não existe**. O único aviso nativo é `new Notification()` em `src/hooks/useSolicitacoesWhatsapp.ts` — só funciona com a aba aberta |
| Notificação interna | tabela `public.notificacoes` + `src/providers/NotificacoesProvider.tsx` (um canal Realtime, lista de 200) |
| Mobile | só **1** componente usa `isMobile`; as telas são de desktop espremidas |
| Servidor | Vercel (`api/*.ts`, funções serverless com `service_role`) e **1** Edge Function do Supabase |
| Recebimento BookPlay | o **robô do 59** (`scripts/robo59/`) sobe o relatório **sozinho, de hora em hora**, no PC do trabalho → linhas em `analitico_recebimentos` (tem `valor_recebido`, `forma_pagamento`, `data_pagamento`, `operador_id`) |
| Recebimento PaguePlay | **sem robô**: o analítico só entra quando alguém importa o 58 pela tela |

**Limitação que pesa em tudo:** no **iPhone**, Web Push só funciona com o PWA
**instalado na tela inicial** e iOS **16.4+**. Aberto no Safari, não recebe. No
Android funciona direto.

---

## 3. Decisões já tomadas (com o usuário, uma a uma)

1. **Formato:** PWA, não app de loja.
2. **Público da primeira versão: só OPERADORES** — dashboard pessoal (o meu
   recebido, a minha meta, os meus pagamentos). Líder e diretoria ficam para
   depois.
3. **Gatilho do push: linha NOVA no analítico** (dinheiro confirmado pelo ERP),
   não «acordo marcado como pago». BookPlay: de hora em hora, sozinho, pelo
   robô. PaguePlay: quando alguém importar. Se a PaguePlay ganhar robô, o push
   vem junto sem mudar nada.
4. **Volume: híbrido** — até **3** pagamentos novos da pessoa no mesmo lote, um
   push por pagamento («💰 Pix de R$ 350,00 — Maria S.»); de **4** em diante,
   um push só com o resumo («💰 Você recebeu 6 pagamentos — R$ 2.140,00 · 4 Pix,
   2 boletos»). O corte (3) fica **configurável**.
5. **Celular sempre abre a versão mínima** (opção A, decidida em 30/09/2026):
   no app instalado e no navegador do celular, dashboard + lista de pagamentos,
   com link «Versão completa» para o site de sempre.
6. **Envio do push: fila no banco + `pg_cron`** (opção 1 da §5.1, decidida em
   30/09/2026).

---

## 4. Onde paramos — pergunta em aberto

Decididas em 30/09/2026: a versão mínima (§3.5) e o envio por fila (§3.6).

**Seção 1 do design (app instalável) — APROVADA em 30/09/2026**, com uma
mudança pedida pelo usuário:

- **Ícone único para o app** (não um por empresa): o mesmo aperto de mão dos
  logos, com as cores num «degradê bagunçado» de verde (PaguePlay) e azul
  (BookPlay). Rascunho em `docs/mobile/icone-rascunho.png` (duas variantes:
  mão em degradê sobre branco / mão branca sobre degradê), gerado por
  `docs/mobile/gerar-icone.py`. O usuário pediu uma terceira: **variante C**
  = só a mão colorida (degradê bagunçado, tons mais claros) sobre fundo em
  degradê liso e escuro de azul para verde — `docs/mobile/icone-C-rascunho.png`
  (1024 px em `icone-C-1024.png`). **Aguardando o ok do usuário na C.**
- Com ícone único, basta **um** `manifest.webmanifest` estático (nome do app
  e `start_url` = `/m`).
- Service worker escrito à mão, **sem cache offline**: só `push` e
  `notificationclick`. O aviso «Nova versão» (`useVersionCheck`) e o deploy
  da Vercel seguem como estão. Dispensa o `vite-plugin-pwa`.
- Botão «Instalar app» na `/m` (Android: prompt do navegador; iPhone: passo a
  passo «Compartilhar → Adicionar à Tela de Início»).
- No celular, após o login, operador cai em `/m`. «Versão completa» fica
  lembrado no aparelho, com botão para voltar à versão mínima (sugestão
  aceita — «do restante pode seguir como está»).

- **Ícone: variante C aprovada** (`docs/mobile/icone-C-1024.png`).

**Seção 2 (tela mínima `/m`) — APROVADA em 30/09/2026**, com um acréscimo:

- **Card de comissão**, só para quem tem comissão configurada: quanto a pessoa
  recebe de comissão de metas se o mês fechar hoje, faixa atual e %, quanto
  falta para a próxima faixa e quanto a comissão vira nela. Reusar
  `useMinhaComissao` (mesma conta do card do Dashboard; exige a permissão
  `dashboard_comissao`). Esconder o card quando `motivo` = `sem_config` ou
  `sem_meta`; com `nenhuma_faixa`, mostrar quanto falta para a 1ª. PaguePlay:
  valores em H.O., como no Dashboard.
- Resto como proposto: cabeçalho, recebido do mês + meta + %, recebido hoje,
  ranking só com `podeVerRanking`, últimos pagamentos com forma, rodapé.
- Pedido de visual: «minimalista e bonito, fácil de entender, chamativo
  profissionalmente». **Protótipo estático** em `docs/mobile/prototipo-m.html`
  (print em `prototipo-m.png`, dados fictícios): cartão principal com as cores
  do ícone e a régua das faixas de meta (1ª–4ª) como elemento marcante;
  fontes Bricolage Grotesque (números) e Figtree (texto). **Visual aprovado
  em 30/09/2026** («gostei, segue»).

**Seção 3 (ativar notificações) apresentada em 30/09/2026, aguardando
aprovação.** Proposta:

- Tabela `push_inscricoes` (perfil_id → `perfis`, empresa_id, endpoint único,
  chaves `p256dh`/`auth`, nome do aparelho, criada_em, ultimo_envio_em).
  RLS «só a própria» no padrão de `acordos_mensagens_whatsapp`
  (`perfil_id = (SELECT auth.uid())`), sem `anon`. Quem lê todas é só a
  Edge Function de envio (service_role).
- Um aparelho = uma linha; a pessoa pode ter vários (celular e PC).
- Pedido de permissão só no toque em «Ativar notificações» (card na `/m`
  enquanto não ativou; depois vira o sino do topo). Ao ativar, chega um push
  de teste. iPhone sem app instalado: o botão explica que precisa instalar
  primeiro.
- Permissão negada: instrução de como liberar nas configurações do celular.
- «Desativar notificações» no sino apaga a linha do aparelho.
- Sair (logout) apaga a inscrição daquele aparelho, para ninguém receber o
  pagamento de outra pessoa num celular compartilhado.
- Chave VAPID pública em variável `VITE_`; a privada só em secret da Edge
  Function.
- Clone: resolvido. Clone não é outro perfil — é o MESMO `operador_id` ligado
  a outra equipe (`equipe_operadores_clones`). A linha já nasce com o id da
  pessoa, então o push vai para ela sem regra especial.

**Seção 3 — APROVADA em 30/09/2026.**

**Seção 4 (como a notificação chega) apresentada em 30/09/2026, aguardando
aprovação.** Achado que muda o texto: `forma_pagamento` no analítico é só
`boleto_pix` | `cartao`. O detalhe (Pix, Boleto, Cartão recorrente, Pix
automático…) vem de `forma_detalhe`, que **só a BookPlay preenche** — na
PaguePlay o push diz «Boleto/Pix» ou «Cartão». Usar `rotuloDaForma` +
`familiaDaForma` (`src/lib/formasPagamento.ts`); a Edge Function (Deno) não
importa de `src/`, então a spec precisa decidir entre copiar com teste de
paridade ou calcular a família no banco. Proposta:

- 1 a 3 pagamentos no lote: um push cada — título «💰 Pagamento recebido!»,
  corpo «Pix de R$ 350,00 · Maria S.» (primeiro nome + inicial: tela de
  bloqueio é pública).
- 4+: um push — «💰 Você recebeu 6 pagamentos!», corpo «R$ 2.140,00 · 4 Pix,
  2 boletos · no mês: R$ 38.420,50».
- Extra sugerido: push quando bate uma faixa de meta («🎯 Você bateu a 2ª
  meta! Comissão agora: R$ 810,67»). Só com comissão/meta configurada.
- Ícone do app + badge monocromático (mão branca) para a barra do Android;
  vibração no Android. Som: o do sistema — Web Push não permite som próprio.
- Toque abre `/m` com os pagamentos novos destacados.
- `tag` por lote para não empilhar duplicado se reenviar.
- Horário de silêncio: **não** — avisa a qualquer hora, por enquanto.

**Seção 4 — APROVADA em 30/09/2026**, com o aviso de meta batida incluído.

**Seção 5 (erros e casos-limite) apresentada em 30/09/2026, aguardando
aprovação.** Ponto de desenho novo: o push de meta batida roda no servidor, e a
comissão hoje só é calculada no navegador (`useMinhaComissao` junta meta,
extras, indireta, config por setor/equipe/exceção, confirmação do setor,
bônus; PaguePlay em H.O. com degrau = meta × 24,96%). Proposta: o servidor só
detecta a faixa cruzada (acumulado antes × depois do lote contra
`metas.meta_valor` / `metas_extras`, com a mesma unidade do Dashboard) e o
texto diz «🎯 Você bateu a 2ª meta! Toque para ver sua comissão» — sem valor,
para não criar uma segunda conta de comissão que pode divergir. O valor
aparece na `/m`. Demais pontos:

- Envio falhou com 404/410 (inscrição morta): apaga a linha do aparelho.
- Outro erro (rede, 5xx): até 3 tentativas nas rodadas seguintes; depois
  descarta e registra. Push atrasado mais de 6 h é descartado (aviso velho
  confunde).
- Falha no envio nunca trava nem desfaz a importação (a fila é só gravada
  pelo gatilho).
- Reimportação / sincronização do 59: só INSERT com `operador_id` entra na
  fila; UPDATE/transferência não. Linha apagada e reinserida pela mesma
  importação (se o importador fizer delete+insert) precisa de chave de
  deduplicação — conferir no código do importador na spec.
- Fila com 22 mil linhas: a Edge Function processa em blocos e agrupa por
  pessoa; lote grande de uma pessoa vira um resumo só.
- Pessoa sem nenhuma inscrição: a linha sai da fila sem envio.
- Operador desligado/férias: não recebe.
- Limpeza: fila processada apagada após 7 dias (pg_cron).

**Seção 5 — APROVADA em 30/09/2026**, com o aviso de meta sem valor e duas
exigências do usuário: (1) limpar e reimportar **não** pode notificar de novo;
(2) tudo leve — processamento, banco, app.

Levantado no código para essas duas exigências:

- A importação grava com `upsert` na chave natural
  `empresa_id,codigo,data_pagamento,forma_pagamento,operador_usuario`
  (`analitico.service.ts` ~l.599): linha que já existe vira UPDATE.
- Mas existem `limparDadosDoMes` / `limparDadosDoMesSetor` (DELETE do mês
  inteiro, «para reimportar do zero») — depois deles tudo volta como INSERT.
- Nenhum gatilho em `analitico_recebimentos` hoje (no repositório).

Desenho resultante (apresentado ao usuário):

1. **Janela de data**: só vira push linha com `data_pagamento` nos últimos
   3 dias (configurável). Reimportar o mês não avisa nada antigo.
2. **Memória da chave natural**: `push_fila` tem índice único na chave
   natural; o gatilho faz `INSERT … ON CONFLICT DO NOTHING`. A linha da fila
   **sobrevive ao DELETE do analítico**, então reimportar os últimos dias
   também não avisa de novo. Retenção da fila (7 dias) > janela (3 dias), a
   memória nunca some antes da hora.
3. **Gatilho por comando, não por linha** (`FOR EACH STATEMENT` com
   `REFERENCING NEW TABLE`): um INSERT…SELECT por bloco de importação, não
   22 mil execuções. Filtra já no gatilho: `operador_id` não nulo, dentro da
   janela, e **só quem tem aparelho inscrito** (`EXISTS push_inscricoes`) —
   sem inscritos, a fila nem cresce. No `upsert`, linha já existente vai para
   a transição de UPDATE, não de INSERT — não entra.
4. **Cron barato**: o `pg_cron` roda a cada minuto uma função SQL que só chama
   a Edge Function (`pg_net`) **se houver pendente** (índice parcial
   `WHERE enviado_em IS NULL`). Parado = uma consulta de índice vazia por
   minuto, zero chamada.
5. **Edge Function**: uma leitura da fila, agrupa por pessoa, envia em
   paralelo limitado, marca em lote. Meta batida só para quem está no lote.
6. **App**: `/m` em chunk separado (lazy), sem recharts; sem canal Realtime
   novo — atualiza ao abrir, ao voltar para o app e quando chega um push
   (service worker avisa a página).

**Seção 6 (testes) — APROVADA em 30/09/2026.**

**Spec APROVADA em 30/09/2026:** `docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md`
(respostas da revisão no fim dela).

**Plano:** `docs/superpowers/plans/2026-09-30-mobile-pwa-push.md`.

**Etapa 1 IMPLEMENTADA em 30/09/2026** (app instalável + tela `/#/m`, sem banco).
Commits na branch `ccr-de15f4b2-ko9k07`. Testes, typecheck e build verdes; a tela
foi conferida numa prévia com dados fictícios (o app local não tem `.env` e não
pode ler o banco de produção sem «pode»).

Descobertas da implementação:
- O app usa **HashRouter**: a tela é `/#/m` (manifest e service worker já apontam
  para ela).
- `usePainelMetas` passou a expor `metasExtras` (régua das faixas).
- `ROTULO_AJUSTE` mudou para `lib/formasPagamento` (reexportado pelo serviço).
- Na PaguePlay, sem `forma_detalhe`, `familiaDaForma('Pix/Boleto')` daria
  «Boleto/Pix Cofen»; a tela usa o consolidado direto.

**Super admin (pedido de 30/09/2026):** vê a tela para teste. Ícone de celular
no cabeçalho do site (qualquer aparelho) → «Escolha um operador» → entra como
ele pela impersonação existente → tela com os números do operador; faixa
amarela ou «Voltar à minha conta» retornam. Super admin não é redirecionado.

**Etapa 1 publicada na main em 30/09/2026 e testada pelo usuário («por enquanto
tudo certo»).**

**Etapa 2 (avisos) — NO AR em 30/09/2026 (aviso de teste):**
- Migration `20260930120624_push_inscricoes.sql` aplicada com «pode» (RLS
  ligada, 4 políticas, anon sem acesso).
- Edge Function `enviar-push` publicada (v1, `verify_jwt` ligado). Secrets
  VAPID cadastrados pelo usuário; teste de fumaça: sem login 401, ação vazia
  400 (chaves presentes), `teste` com anon 401.
- `VITE_VAPID_PUBLIC_KEY` cadastrada pelo usuário na Vercel (PaguePlay e
  BookPlay); branch mandada para a main para o deploy ler a chave.
- **Falta o usuário testar no aparelho:** «Ativar» na `/#/m` → permitir →
  chegar «Pronto! 🔔». iPhone só com o app instalado.

**Etapa 3 (aviso automático) — NO AR em 30/09/2026.**
- Migration `20260930124757_push_fila.sql` aplicada com «pode»: `pg_net`
  ligado, `push_config` (segredo gerado no banco), `push_fila`, gatilho
  `trg_analitico_push_fila`, agendas `push-disparar` (a cada minuto) e
  `push-faxina` (03:40 UTC). Config e fila fechadas para a API.
- `enviar-push` v2 publicada com `verify_jwt` desligado (ações `teste` e
  `rodada`). Fumaça: `teste` sem sessão 401; `rodada` sem/errado segredo 401;
  corrente banco → pg_net → função com o segredo certo: 200, fila vazia.
- Desligar tudo: `UPDATE public.push_config SET ativo = false;`
- Diferença conhecida: o comentário do topo de `index.ts` no repositório cita
  `20260930124757`; a v2 publicada cita `20260930140000` (só comentário).

**Falta:** o usuário ativar os avisos no celular e acompanhar a primeira
importação (robô do 59 de hora em hora / importação da PaguePlay).

---

## PAUSADO em 30/09/2026 — fases seguintes pendentes

O usuário pausou o mobile para uma manutenção. Etapas 1, 2 e 3 (operador) estão
no ar e na main. **Ficou pendente, para retomar depois:**

1. **Versão para LIDERANÇA** (líder e elite que lidera): tela mínima com a
   equipe — recebido e projeção da equipe (mesma conta do Desempenho Equipes /
   `CardEquipe`, H.O. na PaguePlay), quartil dos operadores, quem recebeu hoje.
   Avisos: resumo da equipe (definir frequência — por lote ou fechamento do dia)
   e «equipe bateu a meta». Hoje líder no celular cai no site completo
   (`deveAbrirMobile` só atende `PERFIS_QUE_CONTAM_NO_RECEBIMENTO`).
2. **Versão para DIRETORIA / gerência**: visão por setor/empresa (Painel
   Diretoria resumido). Decidir o que entra.
3. Decisões adiadas da spec: horário de silêncio (hoje avisa a qualquer hora);
   valor do aviso na PaguePlay em bruto «por enquanto».
4. Acompanhar o primeiro aviso automático real (robô do 59 / importação PP) e
   conferir `push_fila.situacao` se algo não chegar.
5. Na próxima publicação da `enviar-push`, o comentário do topo passa a citar
   `20260930124757` (hoje a v2 publicada cita `20260930140000` — só comentário).

Retomar pelo brainstorm da fase 1 (liderança): perguntas de escopo antes de
qualquer código, no mesmo processo das etapas do operador (§5).

### Liderança — brainstorm RETOMADO em 30/09/2026

Levantado no código antes das perguntas:

- **Quem lidera qual equipe:** `lideresDaEquipe.ts` — `equipe_lideres` manda;
  sem vínculo explícito, reserva em `perfis.equipe_id` + clones (22 dos 31
  líderes da BookPlay só estão no legado).
- **Elite** já cai na `/m` como operador (`PERFIS_QUE_CONTAM_NO_RECEBIMENTO`).
- **Alcance do Painel do Líder** vem da permissão `painel_lider`
  (`escopoEfetivo`: individual / equipe / setor / todos_setores), não do cargo.
- **Contas da equipe** (acumulado, esperado até hoje, projeção, quartil, ritmo)
  já isoladas e testadas em `desempenhoEquipe.ts`; o card é `CardEquipe.tsx`.
- **Meta da equipe** existe em `metas` com `tipo = 'equipe'`.

Decisões (30/09/2026):

1. **Público:** líder **e** elite. O elite **troca** entre a visão individual
   (a `/m` de hoje) e a da equipe.
2. **Alcance:** só as equipes que a pessoa **lidera** (regra do
   `lideresDaEquipe`), não o alcance da permissão `painel_lider`.
3. **Aviso:** só **«equipe bateu a meta»**. Sem resumo por lote nem
   fechamento do dia.
4. **Conteúdo:** «o Painel do Líder como um todo é importante para a liderança
   visualizar — manter o modelo»: recebido + projeção, quartil dos operadores,
   quem recebeu hoje e últimos pagamentos da equipe.
5. **Formato:** abas no rodapé, como app.
6. **Abas do Painel que vêm:** Desempenho Equipes, Quartis e Gráfico de
   recebimento. Ficam só no site: Ajuste de recebimento e Plantão Elite.
7. **Várias equipes** (líder de mais de uma, ou clone): seletor no topo, uma
   equipe por vez, lembrando a última escolhida.
8. **Mês:** só o atual (mês passado fica na versão completa).

Achado: a meta da equipe é **um valor só** (`metas.meta_valor` com
`tipo = 'equipe'`, lida em `DesempenhoEquipes.tsx` por `metaDe('equipe', id)`),
sem 2ª/3ª faixa como a do operador.

9. **Gráfico:** próprio e leve (barras SVG do dia a dia + linha da meta
   diária), sem recharts no celular.
10. **Elite:** abre **sempre** na visão individual; a equipe é um toque.
11. **Aviso «equipe bateu a meta»:** vai para os **líderes e para a equipe
    toda** (operadores recebem «Sua equipe bateu a meta!»).
12. **Marco do aviso:** só ao bater **100%** da meta da equipe — um aviso por
    equipe por mês.

**Rascunho da spec:** `docs/superpowers/specs/2026-09-30-mobile-lideranca-design.md`
+ protótipo `docs/mobile/prototipo-lider.html` (print `prototipo-lider.png`).
Confirmado: aviso **sem valores**; aba Hoje sem permissão mostra **só agregados**.
O usuário pediu, antes de seguir, um visual **mais minimalista e profissional, baseado
nas abas do site** (ex.: Quartis). Feito o **protótipo v2**: cartão escuro só na aba
Equipe, resto em grupos brancos; **a régua** (marcas 50/80/100%) como assinatura em
equipe, operador e detalhe; Quartis vira barra de distribuição + faixas como filtro +
lista com régua + folha de detalhe (a linha expandida do site) com «Mandar resumo no
WhatsApp»; Gráfico com a média diária do site e leitura do dia tocado. Corrigido do v1:
faixas de quartil padrão são 100/80/50% (o v1 dizia 110%) e a linha do gráfico do site é
a média, não a meta diária.

**Spec e visual v2 APROVADOS em 30/09/2026.** Plano:
`docs/superpowers/plans/2026-09-30-mobile-lideranca.md`.

**L1 (tela da equipe `/#/m/equipe`) IMPLEMENTADA em 30/09/2026**, sem banco, na branch
`claude/sleepy-ptolemy-vqekei`:
- Líder cai na tela da equipe; elite ganha a troca Eu / Equipe na `/m` (só quem tem
  vínculo em `equipe_lideres` e a permissão `ver_painel_lider`); super admin testa
  entrando como um líder pelo «Escolha um operador ou líder».
- Números sem conta nova: `DesempenhoEquipes` e `QuartisOperadores` passaram a
  chamar funções puras extraídas deles (`acumuladoDaEquipe.ts`, `linhasQuartil.ts`),
  as mesmas que a tela do celular usa. Quem lidera: `idsDosLideresPorEquipe`.
- Conferida numa prévia local com dados fictícios (o app local não lê o banco de
  produção). **Falta o usuário conferir no preview da Vercel** com um líder e um
  elite, comparando com o Painel do Líder.
- Próximo: **L2** (aviso «equipe bateu a meta») — precisa de migration, com «pode».

**Rodada de ajustes de 30/09/2026 (pedido do usuário, antes da L2) — FEITA na branch:**
1. **Elite vê a equipe por pertencer a ela** (não precisa estar em `equipe_lideres`):
   `equipesDaVisao` = equipes que lidera + a de que faz parte (principal + clones).
   A troca Eu / Equipe aparece para quem tem `ver_painel_lider` e uma equipe.
2. **Acabamento v2 aplicado à `/m` do operador** (autorizado pelo usuário) e
   **barra da meta corrigida**: a escala começava pouco abaixo da 1ª faixa e quem
   estava abaixo dela via a barra vazia; agora começa em zero e enche conforme a %.
3. Estética:
   - **cartão principal pastel sólido** (sálvia névoa `#dde7e2`) nas duas telas, com
     **barra simples e animada** (cresce ao abrir, brilho que passa) — `comum/`;
   - **lista de pagamentos refeita**: nome do cliente (sem o código que algumas
     origens gravam na frente — `limparNomeCliente`, na leitura), embaixo **NR** e
     dia, à direita valor e forma. O **aviso** também: «Maria S.» / «NR 12345 · Pix de
     R$ 350,00»;
   - **quartil + quanto falta por faixa (hoje e amanhã)** na `/m` do operador;
   - **foto de perfil** no cabeçalho (sem foto, a logo);
   - **números que rolam** (valor antigo → novo; primeira carga sobe do zero) e
     entrada suave do conteúdo; movimento reduzido respeitado;
   - **fundo vivo**: três manchas de cor desfocadas, bem claras, derivando devagar.
4. **Tempo real**: a `/m` já relia a cada sinal do analítico (canal único por
   empresa, `assinarSinal`; entrega com até ~30–40 s de espera por regra do sinal).
   A tela da equipe **não** ouvia — agora ouve o mesmo sinal (e o do diário na
   PaguePlay), sem canal novo.
5. **Pagamento que saiu do recebimento**:
   - totais (mês, hoje, diário) já acompanhavam — somam as linhas que existem;
   - **com o app aberto**: aviso na tela quando um pagamento some da lista (chave
     natural NR + dia + forma, então limpar e reimportar não parece saída);
   - **push**: migration `20260930175642_push_saidas_e_nr.sql` + `enviar-push`
     (rodada de saídas; aviso com nome, NR, −valor e **o total de hoje**). Três
     travas: espera de 15 min com descarte do que voltou, corte de limpeza em massa
     (> 300 linhas num comando), uma vez por pagamento/pessoa. Validada num Postgres
     16 local descartável. **APLICADA com «pode» em 30/09/2026**, registrada como
     `20260930175642` (arquivo renomeado para bater), e **`enviar-push` v3 publicada**
     (verify_jwt desligado, como a v2). Fumaça: `rodada` sem segredo 401, `teste` sem
     sessão 401. Código na main (`5995bd0` e seguintes). Depois:
plano de implementação; L1 (tela, sem banco) antes de L2 (aviso, migration com
«pode»).

**Fora do mobile (30/09/2026): projeção do Desafio ≠ Painel do Líder — RESOLVIDO.**
Código na main (`67b4632`); migration aplicada em produção com «pode» e
registrada como `20260930115849` (arquivo renomeado para bater).

**Antes era:** o usuário testar no preview da Vercel num Android e num
iPhone (instalar, abrir, conferir os números contra o Dashboard). Depois,
Etapa 2 (avisos) — precisa de chaves VAPID e de migration, com «pode».

## 5. Próximos passos do processo (skill `brainstorming`)

Depois da resposta da §4:

1. **Propor 2–3 abordagens para o envio do push**, com recomendação. As que
   estavam na mesa:
   - **(recomendada) Fila no banco:** gatilho em `analitico_recebimentos`
     (só INSERT com `operador_id`, nunca UPDATE — a sincronização do 59 mexe e
     transfere linhas, e isso não pode virar push) grava em `push_fila`; o
     `pg_cron` (já ativo no projeto) chama a cada minuto uma Edge Function via
     `pg_net`, que agrupa por pessoa e por lote, aplica a regra do corte (§3.4)
     e envia com `web-push` + VAPID. Independe de quem importou (robô ou tela).
   - **API na Vercel chamada por Database Webhook** do Supabase a cada insert —
     mais simples, mas um lote de 22 mil linhas dispara 22 mil chamadas.
   - **O robô chama o envio depois de importar** — mais simples ainda, mas só
     cobre a BookPlay e esquece quem importa pela tela.
2. **Apresentar o design em seções**, aprovando cada uma:
   - PWA: manifest, ícones por empresa (BookPlay / PaguePlay), service worker,
     botão «Instalar app», instrução específica para iPhone.
   - Rota mobile (ex.: `/m`): recebido do mês, meta e %, projeção/quartil,
     recebido hoje, últimos pagamentos com forma (Pix/boleto/cartão).
   - Inscrição de push: tabela `push_inscricoes` (perfil, aparelho, endpoint,
     chaves), RLS «só a própria», permissão pedida por clique (nunca ao abrir).
   - Envio: fila, agrupamento, texto, som/ícone, deep-link para `/m`.
   - Erros: inscrição expirada (410) apaga a linha; falha não trava a
     importação.
   - Testes.
3. **Escrever a spec** em `docs/superpowers/specs/2026-09-29-mobile-pwa-push-design.md`,
   revisar, pedir aprovação do usuário, e só então o plano de implementação.

**Regras que valem aqui:** banco é produção (CLAUDE.md) — nenhuma leitura ou
escrita sem «pode». Chaves VAPID: a privada vai para variável de ambiente
(Vercel/Supabase secrets), nunca para o repositório. Canais Realtime novos
passam por `assinarTabela` (ver memória do projeto).

---

## 6. Ordem de entrega combinada

1. App instalável + tela mobile mínima (não depende de nada).
2. Infra de push (VAPID, inscrições, envio).
3. Gatilho «caiu pagamento» a partir do analítico.

---

## 7. Outras pendências da mesma sessão (29/09/2026) — sem relação com o mobile

- **«Manutenção» na regra do setor da pessoa.** Desde a migration
  `20260929211916` (aplicada), recebimento carimbado num setor onde a pessoa não
  está sai dela (BookPlay, set/2026+). Linhas «Manutenção» saem de José
  Casavechia (Playmix, ~R$ 7,2 mil) e Giovanna Carvalho (Play 3, ~R$ 7,1 mil).
  O usuário ainda não disse se Manutenção deve contar para o setor da pessoa.
- **Comercial — Visão Geral e Dashboard travados em ~R$ 740–790 mil.** Causa: a
  etapa «4. Lançar sobre as vendas» (projeção, `fn_vendas_projetar`, permissão
  `projetar_vendas`) não roda desde 15/09; o relatório importa certo. Falta a
  decisão: projetar automaticamente depois de importar o geral, ou manter o
  clique manual.
- **Setor Extreme (Comercial)** — conferido contra `Prospeccao_202609.csv`:
  franquias 7161, 7661 e 8441 precisam ser vinculadas ao setor; confirmar o
  login de `santos_maria`, se `larissa_bonatti` entra, quem é o «Agente de IA-
  Bianca» (só existe `ia_bianca_mara`) e se o Kevin (vende na 7661) fica sem
  equipe. Perfis de IA precisam do login exato do arquivo (`ia_...`).
- **Comissão PaguePlay** ainda converte a meta pela proporção do recebido
  (`fatorDoRecebido`, `entradaDoOperador.ts`); Quartis/Desempenho/Painel de
  metas já usam a meta da aba Metas. O usuário mandou **deixar como está por
  enquanto**.
- **Diário (PaguePlay)** dos 3 fantasmas religados na equipe Digital
  (helton_roldon, karolaine_silva, matheus_souza) não foi conferido — só o
  analítico foi repontado.
- **16 linhas de R$ 0,00** gravadas pela importação do 58 do Play 2 (29/09,
  17h32) na equipe Luan/ Gaby. Sem efeito em total; origem provável na mescla
  58×59. Não investigado.
