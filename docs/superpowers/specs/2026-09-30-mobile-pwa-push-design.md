# Versão mobile (PWA) e aviso de pagamento

**Data:** 2026-09-30
**Estado:** aprovada em 30/09/2026. Plano: `docs/superpowers/plans/2026-09-30-mobile-pwa-push.md`
**Histórico da conversa:** `docs/MOBILE-PWA-EM-ANDAMENTO.md`
**Toca:** `public/` (manifest, ícones, service worker), `index.html`, rota nova `/m`
(`src/pages/Mobile/*`), redirecionamento pós-login, `src/lib/formasPagamento.ts` (só
leitura/reuso), banco (migrations novas: `push_inscricoes`, `push_fila`, gatilho,
funções, jobs do `pg_cron`), Edge Function nova `enviar-push`, `docs/REGRAS-DE-NEGOCIO.md`
**Não toca:** telas atuais do site (não ficam responsivas), cálculo de comissão, importação
do analítico (só ganha um gatilho no banco), robô do 59

---

## O pedido

> «Aprimorar o projeto para funcionar 100% no celular — acessando hoje tá tudo bagunçado.
> Uma versão para mobile, mais minimalista, só com dashboard. O pessoal baixa o app,
> aqueles apps simples que são o próprio site, e tem acesso às suas informações: se teve
> algum pagamento novo, com notificações chamativas tipo aplicativo de vendas (Hotmart),
> dizendo que recebeu tanto via Pix, boleto ou cartão.»

Não é app de loja: é um **PWA** — o mesmo site, instalado pelo navegador, com ícone,
tela cheia e atualização a cada deploy da Vercel.

---

## Decisões

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Formato | PWA. Loja (Capacitor/TWA) só se um dia for preciso, embrulhando o mesmo site. |
| 2 | Público da 1ª versão | Só **operadores**, dashboard pessoal. Líder e diretoria depois. |
| 3 | Gatilho do aviso | Linha **nova** em `analitico_recebimentos` (dinheiro confirmado pelo ERP), não «acordo marcado como pago». |
| 4 | Volume | Até **3** pagamentos da pessoa no mesmo lote: um aviso cada. De 4 em diante: um resumo. Corte configurável. |
| 5 | O que o celular abre | **Sempre** a versão mínima `/m` (app instalado e navegador). «Versão completa» fica lembrado no aparelho, com botão para voltar. |
| 6 | Envio | **Fila no banco + `pg_cron`** chamando uma Edge Function. |
| 7 | Ícone | **Um só** para as duas empresas: a mão dos logos em degradê verde/azul sobre fundo escuro azul→verde (`docs/mobile/icone-C-1024.png`). |
| 8 | Comissão na `/m` | Card de comissão de metas, só para quem tem comissão configurada. |
| 9 | Aviso de meta batida | Sim, **sem o valor** da comissão no texto. |
| 10 | Horário de silêncio | Não, por enquanto. Avisa a qualquer hora. |
| 11 | Reimportação | Limpar e reimportar **não** avisa de novo. |
| 12 | Custo | Leve no banco, no servidor e no celular — requisito, não detalhe. |

---

## 1. App instalável

### Manifest e ícones

- `public/manifest.webmanifest` único, estático: `name` «Gestão de Acordos»,
  `short_name` curto, `start_url: "/m"`, `scope: "/"`, `display: "standalone"`,
  `background_color`/`theme_color` do fundo do ícone (`#0a2a4a`).
- Ícones gerados de `docs/mobile/icone-C-1024.png` por `docs/mobile/gerar-icone.py`:
  192 e 512 (`purpose: "any"`), 512 com margem de segurança (`purpose: "maskable"`),
  `apple-touch-icon` 180 e um **badge monocromático** (mão branca, fundo transparente,
  96 px) para a barra do Android.
- `index.html` ganha `<link rel="manifest">` e o `apple-touch-icon` novo. O favicon por
  empresa (`TenantThemeApplier`) continua como está.

### Service worker

`public/sw.js`, escrito à mão, **sem cache offline**. Só dois ouvintes:

- `push`: monta a notificação a partir do JSON recebido (título, corpo, `tag`, ícone,
  badge, `data.url`), com `vibrate` no Android.
- `notificationclick`: foca uma janela já aberta do app e navega para `data.url`, ou abre
  uma nova; avisa a página por `postMessage` para recarregar os dados.

Sem `fetch` handler: o site continua indo à rede como hoje, o `useVersionCheck` segue
valendo, e o celular não fica preso numa versão velha. Por isso **não** entra o
`vite-plugin-pwa`/workbox.

O registro (`navigator.serviceWorker.register('/sw.js')`) acontece só na `/m`.

### Instalar

- Android/Chrome: guarda o `beforeinstallprompt` e mostra «Instalar app» na `/m`.
- iPhone: não existe prompt. O botão abre um passo a passo curto: «Compartilhar →
  Adicionar à Tela de Início». No iPhone o aviso **só** funciona com o app instalado
  (iOS 16.4+).
- Já instalado (`display-mode: standalone`): o botão some.

### Redirecionamento

- Celular (critério: `pointer: coarse` + largura ≤ 768 px) e perfil que conta no
  recebimento (`PERFIS_QUE_CONTAM_NO_RECEBIMENTO`: `operador`, `elite`):
  depois do login cai em `/m`.
- «Versão completa» grava `localStorage['mobile:versao'] = 'completa'`; enquanto
  estiver assim, não redireciona. A versão completa ganha um botão «Versão para
  celular», que apaga a marca. `localStorage` com `try/catch`: se falhar, vale o
  padrão (versão mínima).
- Líder, diretoria e demais cargos: nada muda nesta versão.

---

## 2. Tela mínima `/m`

Protótipo aprovado: `docs/mobile/prototipo-m.html` (print `prototipo-m.png`, dados
fictícios). Uma coluna, mês corrente, de cima para baixo:

1. **Cabeçalho** — ícone, nome, empresa · mês, sino (estado do aviso).
2. **Recebido no mês** — cartão escuro com as cores do ícone; valor grande; «Meta R$ X ·
   Nª meta batida» e o %; **régua das faixas** (1ª…Nª) com a barra no degradê da mão.
   Mesma base e mesma meta dos cards de meta do Dashboard (`usePainelMetas` /
   `useAnaliticoDashboard`), na unidade do Dashboard (H.O. na PaguePlay).
3. **Sua comissão** — `useMinhaComissao({ aberto: true, mes })`, a mesma conta do card
   do Dashboard. Mostra `total`, faixa atual e %, quanto falta para a próxima e quanto
   vira nela. Some quando: sem a permissão `dashboard_comissao`, `dbAtiva = false`,
   `motivo` = `sem_config` ou `sem_meta`. Com `nenhuma_faixa`: «Faltam R$ X para a 1ª
   meta». Com `erro`: «Não foi possível carregar a comissão» — nunca R$ 0,00.
4. **Recebido hoje** e **Ranking** lado a lado. Ranking só com a mesma permissão que
   libera a aba Ranking hoje (`podeVerRanking`); sem ela, «Recebido hoje» ocupa a linha.
5. **Últimos pagamentos** — valor, forma (chip por família), cliente abreviado, data/hora.
   Os que chegaram depois da última visita ficam destacados em verde com «novo».
   «Ver todos» abre a lista do mês.
6. **Rodapé** — card «Receba um aviso a cada pagamento» enquanto não ativou; «Instalar
   app» enquanto não instalou; «Versão completa»; «Sair».

Forma do pagamento: `familiaDaForma(rotuloDaForma(forma_pagamento, forma_detalhe))`.
Na **PaguePlay** o analítico não traz `forma_detalhe`, então o chip é «Boleto/Pix» ou
«Cartão». Se o relatório passar a trazer, o chip se separa sozinho.

Fora da 1ª versão: filtro de período, registrar acordo, visões de líder/diretoria.

Leveza: `/m` é rota `lazy()` com chunk próprio, sem recharts. **Nenhum canal Realtime
novo** — recarrega ao abrir, no `visibilitychange` para visível e no `postMessage` do
service worker quando chega um aviso.

---

## 3. Ativar avisos

### `push_inscricoes`

| Coluna | Tipo | |
|---|---|---|
| `id` | uuid pk | |
| `perfil_id` | uuid not null → `perfis(id)` on delete cascade | |
| `empresa_id` | uuid not null | |
| `endpoint` | text not null **unique** | um aparelho = uma linha |
| `p256dh`, `auth` | text not null | chaves da inscrição |
| `aparelho` | text | rótulo legível («Android · Chrome») |
| `criada_em` | timestamptz default now() | |
| `ultimo_envio_em` | timestamptz | |
| `falhas` | int default 0 | |

Índice em `perfil_id`. RLS no padrão de `acordos_mensagens_whatsapp`:
SELECT/INSERT/UPDATE/DELETE com `perfil_id = (SELECT auth.uid())`, `REVOKE ALL FROM
anon`. Só a Edge Function (service_role) lê as de todos.

### Fluxo

- «Ativar notificações» → `Notification.requestPermission()` **só no toque**, nunca ao
  abrir → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` →
  upsert por `endpoint` → a Edge Function manda na hora o aviso de teste «Pronto! Você
  vai ser avisado a cada pagamento».
- iPhone fora do app instalado: o botão explica que precisa instalar primeiro.
- Permissão negada: instrução de como liberar nas configurações do aparelho.
- Sino → «Desativar notificações»: `unsubscribe()` + DELETE da linha.
- **Sair** apaga a inscrição daquele aparelho antes do `signOut` (celular
  compartilhado não recebe pagamento de outra pessoa).
- Endpoint trocado pelo navegador: a `/m` confere a inscrição ao abrir e regrava se
  mudou.

### Chaves VAPID

Pública em `VITE_VAPID_PUBLIC_KEY`. Privada **só** em secret da Edge Function
(`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Nunca no repositório.

---

## 4. Como o aviso chega

### Texto

- **1 a 3** pagamentos da pessoa no lote — um aviso cada:
  - título «💰 Pagamento recebido!»
  - corpo «Pix de R$ 350,00 · Maria S.»
- **4 ou mais** — um aviso:
  - título «💰 Você recebeu 6 pagamentos!»
  - corpo «R$ 2.140,00 · 4 Pix, 2 boletos · no mês: R$ 38.420,50»
- **Meta batida** — quando o lote faz a pessoa cruzar uma faixa:
  - título «🎯 Você bateu a 2ª meta!»
  - corpo «Toque para ver sua comissão»
  - Cruzou mais de uma faixa no mesmo lote: um aviso só, com a maior.

Cliente: **primeiro nome + inicial do último** (a tela de bloqueio é pública). Valor
e forma na unidade que o operador vê: na PaguePlay, o valor do aviso de pagamento é o
bruto recebido (é o que o cliente pagou); o «no mês» segue a unidade do Dashboard.

### Aparência

Ícone do app, badge monocromático, `vibrate` no Android. **Som:** o do sistema — Web
Push não permite som próprio em Android nem iPhone.

### Toque

Abre `/m?novos=1`; os pagamentos novos aparecem destacados.

### `tag`

`pgto:<id da fila>` no aviso individual, `lote:<perfil>:<rodada>` no resumo,
`meta:<perfil>:<mês>:<faixa>` na meta — reenvio do mesmo aviso substitui em vez de
empilhar.

### Detecção de meta batida

O servidor **não** calcula comissão. Só compara o acumulado do mês da pessoa **antes**
e **depois** do lote contra os degraus da meta dela (`metas` com `tipo = 'operador'`:
`meta_valor` = 1ª, `metas_extras` = 2ª em diante), na mesma unidade e com a mesma base
do card «Progresso da meta» (inclui ajuste manual; PaguePlay compara `total_ho` com o
degrau convertido pelo `ho_percentual` da empresa, `lib/hoPercentual.ts`). Sem linha de
meta: sem aviso de meta.

**Risco:** a base do «Progresso da meta» é montada no cliente. A implementação precisa
de um **teste de paridade** com os mesmos casos do `usePainelMetas` para não avisar uma
faixa que a tela ainda não mostra.

---

## 5. Fila, anti-repetição e custo

### Onde a repetição apareceria

- A importação grava com `upsert` na chave natural
  `(empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)`
  (`analitico.service.ts`). Linha que já existe vira **UPDATE**.
- `limparDadosDoMes` / `limparDadosDoMesSetor` apagam o mês para reimportar do zero —
  depois deles, **tudo volta como INSERT**.
- A sincronização do 59 atualiza e transfere linhas (UPDATE).

### `push_fila`

| Coluna | Tipo | |
|---|---|---|
| `id` | bigint identity pk | |
| `empresa_id`, `codigo`, `data_pagamento`, `forma_pagamento`, `operador_usuario` | como no analítico | **unique** (chave natural) |
| `perfil_id` | uuid not null | `operador_id` da linha |
| `valor`, `valor_ho` | numeric | |
| `forma_detalhe`, `nome_cliente` | text | só para o texto |
| `criada_em` | timestamptz default now() | |
| `enviado_em` | timestamptz | null = pendente |
| `tentativas` | smallint default 0 | |

Índice parcial `WHERE enviado_em IS NULL`. Sem RLS de leitura para `authenticated`
(`REVOKE ALL`): só gatilho e service_role mexem.

### As duas travas

1. **Janela de data:** só entra linha com `data_pagamento >= current_date - 3`
   (configurável). Reimportar o mês não avisa nada antigo.
2. **Memória da chave natural:** o gatilho faz `INSERT … ON CONFLICT DO NOTHING`. A fila
   **não é apagada pelo «Limpar dados»**, então reimportar os últimos dias também não
   avisa de novo. Retenção da fila: **7 dias** — maior que a janela, a memória nunca some
   antes da hora.

### Gatilho — um por comando, não por linha

```sql
CREATE TRIGGER trg_analitico_push_fila
AFTER INSERT ON public.analitico_recebimentos
REFERENCING NEW TABLE AS novas
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_push_enfileirar();
```

`fn_push_enfileirar` (SECURITY DEFINER, `search_path` fixo) faz **um** `INSERT … SELECT`
de `novas` com `operador_id IS NOT NULL`, dentro da janela, e
`EXISTS (SELECT 1 FROM push_inscricoes WHERE perfil_id = operador_id)` — sem aparelho
inscrito, a fila nem cresce. Numa `upsert`, a linha que já existia vai para a transição
de UPDATE, não para `novas`. Qualquer erro dentro da função é capturado e registrado:
**o gatilho nunca derruba a importação**.

### Rodada de envio

- `pg_cron` a cada minuto roda `fn_push_disparar()`: se
  `EXISTS (SELECT 1 FROM push_fila WHERE enviado_em IS NULL)`, chama a Edge Function por
  `pg_net` (`net.http_post`); senão, nada. Parado, custa uma consulta de índice vazia.
- `pg_net`: nenhuma migration do repositório o usa. **Confirmar se a extensão está ativa
  antes de implementar** — leitura no banco, só com «pode».
- Edge Function `enviar-push` (Deno, `web-push` + VAPID):
  1. pega até N pendentes (`FOR UPDATE SKIP LOCKED`, sem duas rodadas no mesmo item);
  2. descarta quem está desligado/férias (marca como enviado sem mandar);
  3. agrupa por pessoa, aplica o corte de 3, detecta meta batida só para quem está no
     lote;
  4. envia em paralelo limitado para cada aparelho da pessoa;
  5. marca `enviado_em` em lote.
- Família da forma: a Edge Function não importa de `src/`. Copiar `familiaDaForma` e
  `rotuloDaForma` para `supabase/functions/_shared/` com um **teste de paridade** que roda
  os mesmos casos contra as duas cópias.

### Falhas

- 404/410 do serviço de push: apaga a inscrição.
- Outro erro: `tentativas + 1`, volta na próxima rodada; após 3, marca como enviado e
  registra. Item pendente há mais de **6 h** é descartado (aviso velho confunde).
- Pessoa sem aparelho no momento do envio: marca como enviado.

### Limpeza

`pg_cron` diário apaga `push_fila` com `criada_em < now() - interval '7 days'`.

---

## 6. Testes

Automáticos, no padrão do projeto (`vitest`; SQL em `*.sql.test.ts`):

- corte 1–3 × resumo, e o texto de cada aviso;
- cliente abreviado; família da forma, inclusive «Boleto/Pix» da PaguePlay;
- paridade `familiaDaForma` (src × `_shared`);
- meta batida: cruzar uma faixa, cruzar duas, não cruzar, PaguePlay em H.O.; paridade
  com a base do `usePainelMetas`;
- anti-repetição: limpar + reimportar = zero itens novos; linha fora da janela = zero;
  `upsert` de linha existente = zero; UPDATE/transferência do 59 = zero;
- gatilho sem inscritos = fila vazia;
- `/m`: card de comissão aparece/some por `motivo`/permissão; ranking só com permissão;
  redirecionamento respeita a escolha «Versão completa».

Manual, antes de liberar: instalar num Android e num iPhone, ativar, receber o teste,
tocar e cair na `/m`.

---

## Entrega

1. **App instalável + `/m`** — não mexe no banco.
2. **Avisos** — `push_inscricoes`, VAPID, Edge Function, aviso de teste.
3. **Gatilho** — `push_fila`, `fn_push_enfileirar`, `fn_push_disparar`, jobs do
   `pg_cron`, aviso de meta.

Banco é produção (`CLAUDE.md`): cada migration é mostrada com o SQL exato e só roda com
o «pode» de quem manda. Registrar a versão aplicada (o histórico está defasado).

## Respondido na revisão (30/09/2026)

- Valor do aviso de pagamento na PaguePlay em **bruto**: mantido «por enquanto».
- Janela de **3 dias**: serve — a PaguePlay importa todos os dias.
- H.O.: segue o percentual configurado na aba Metas (`ho_percentual`).

## Em aberto

- `pg_net` ativo? (leitura no banco, pedir «pode» — início da Etapa 3)
