# Mobile (PWA) e aviso de pagamento — Plano de implementação

> **Execução:** inline, tarefa a tarefa. Passos em checkbox (`- [ ]`).
> A **Etapa 1** está detalhada. As Etapas 2 e 3 estão em roteiro: o passo a passo
> delas é escrito quando começarem, com o código da época.

**Objetivo:** operador instala o sistema no celular, abre uma tela mínima com o que
recebeu, a meta e a comissão, e recebe aviso a cada pagamento novo.

**Arquitetura:** PWA sem cache offline (manifest + service worker só de push); rota
`/m` lazy reaproveitando `usePainelMetas`, `useMinhaComissao` e
`useAnaliticoDashboard`; aviso por fila no banco (`push_fila`) alimentada por gatilho
por comando, drenada pelo `pg_cron` → Edge Function `enviar-push` (`web-push` + VAPID).

**Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, Supabase (Postgres,
RLS, `pg_cron`, `pg_net`, Edge Functions/Deno).

**Spec:** `docs/superpowers/specs/2026-09-30-mobile-pwa-push-design.md`
**Conversa:** `docs/MOBILE-PWA-EM-ANDAMENTO.md`

## Restrições globais

- Banco `vfrvvoetidtsqbbhdkmj` é produção (`CLAUDE.md`): nenhuma leitura ou escrita sem
  «pode». Migration: mostrar o SQL exato, o que altera, quantas linhas, e esperar.
  Registrar a versão aplicada (o histórico está defasado).
- **Etapa 1 não toca o banco.**
- «Operador» = `PERFIS_QUE_CONTAM_NO_RECEBIMENTO` (`operador`, `elite`,
  `src/lib/index.ts`) — nunca uma lista nova.
- Nenhuma conta nova de meta ou comissão: `/m` lê os mesmos hooks do Dashboard.
- Sem canal Realtime novo. Sem `vite-plugin-pwa`. Sem `fetch` no service worker.
- `localStorage` sempre em `try/catch`.
- Chave VAPID privada nunca no repositório nem com prefixo `VITE_`.
- A cada commit: testes do que mudou verdes. Antes do push: `npm test`,
  `npm run typecheck`, eslint dos arquivos tocados.

---

## Etapa 1 — App instalável + `/m` (sem banco)

> **Feita em 30/09/2026.** Desvios: o redirecionamento ficou só no
> `PainelDeEntrada` (o login já navega para `/`, então `Login.tsx` não mudou);
> a rota real é `/#/m` (HashRouter); a conferência visual foi numa prévia com
> dados fictícios — o teste no aparelho fica com o usuário.

### Mapa de arquivos

| Arquivo | O quê |
|---|---|
| `docs/mobile/gerar-icone.py` | passa a gerar também os tamanhos finais |
| `public/icons/app-192.png`, `app-512.png`, `app-512-maskable.png`, `apple-touch-180.png`, `badge-96.png` | novos |
| `public/manifest.webmanifest` | novo |
| `public/sw.js` | novo — só `push` e `notificationclick` (a Etapa 2 usa) |
| `index.html` | `<link rel="manifest">`, `apple-touch-icon`, `theme-color` |
| `src/lib/index.ts` | `ROUTE_PATHS.MOBILE = '/m'` |
| `src/lib/mobile/preferencia.ts` (+ test) | ler/gravar «versão completa»; `deveAbrirMobile()` |
| `src/lib/mobile/formato.ts` (+ test) | cliente abreviado, chip da forma, «novo» |
| `src/pages/Mobile/index.tsx` | a tela |
| `src/pages/Mobile/*.tsx` | `CartaoRecebido`, `ReguaFaixas`, `CartaoComissao`, `ParHojeRanking`, `ListaPagamentos`, `Rodape`, `InstalarApp` |
| `src/pages/Mobile/mobile.css` | tokens e fontes do protótipo, escopados em `.tela-mobile` |
| `src/App.tsx` | rota `/m` (lazy, `ProtectedRoute`, **sem** `LayoutWrapper`) + redirecionamento |
| `src/pages/Login.tsx` | depois do login, `deveAbrirMobile()` → `/m` |
| `src/components/Layout.tsx` | item «Versão para celular» (só no celular) |

### Task 1.1: ícones e manifest

- [x] Estender `gerar-icone.py` para exportar os 5 PNGs a partir da variante C
  (maskable: mão a ~60% do quadro; badge: só a máscara da mão, branca, fundo
  transparente).
- [x] `public/manifest.webmanifest`: `name`, `short_name`, `start_url: "/m"`,
  `scope: "/"`, `display: "standalone"`, `background_color`/`theme_color` `#0a2a4a`,
  ícones.
- [x] `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`,
  `apple-touch-icon` novo, `apple-mobile-web-app-capable`, `theme-color` do ícone.
- [x] Conferir que `_redirects`/`vercel.json` não reescrevem `/manifest.webmanifest`
  nem `/sw.js` para o `index.html` (a regra atual exclui só `/api`; arquivo estático
  existente é servido antes do rewrite na Vercel — confirmar no preview).
- [x] Commit.

### Task 1.2: service worker

- [x] `public/sw.js`: `push` → `showNotification(titulo, { body, icon, badge, tag,
  data: { url }, vibrate })`; `notificationclick` → foca janela do escopo e
  `navigate(url)`, senão `openWindow(url)`; `postMessage({ tipo: 'push' })` às
  janelas.
- [x] `install` → `skipWaiting()`; `activate` → `clients.claim()`. Nada de cache.
- [x] Registro em `src/lib/mobile/sw.ts`, chamado só pela `/m`.
- [x] Commit.

### Task 1.3: preferência e redirecionamento

- [x] Teste primeiro (`preferencia.test.ts`): celular + operador + sem marca → `true`;
  com marca «completa» → `false`; desktop → `false`; líder → `false`;
  `localStorage` lançando → trata como sem marca.
- [x] Implementar `ehCelular()` (`matchMedia('(pointer: coarse)')` + largura ≤ 768),
  `lerVersao()`/`gravarVersao()`, `deveAbrirMobile(perfil)`.
- [x] `ROUTE_PATHS.MOBILE`; rota em `App.tsx`; `Login.tsx` navega para `/m` quando
  `deveAbrirMobile`. Acesso direto ao `/` num celular de operador sem marca também
  redireciona (guarda no Dashboard, não no `ProtectedRoute`).
- [x] «Versão para celular» no menu do `Layout` (só `ehCelular()`), apaga a marca.
- [x] Commit.

### Task 1.4: formato

- [x] Teste primeiro (`formato.test.ts`): «MARIA SILVA OLIVEIRA» → «Maria O.»; nome
  único; vazio → «Cliente»; chip por `familiaDaForma(rotuloDaForma(...))`, PaguePlay
  sem detalhe → «Boleto/Pix»; «Ajuste manual» não vira chip de forma.
- [x] Implementar reaproveitando `src/lib/formasPagamento.ts`.
- [x] Commit.

### Task 1.5: tela `/m`

- [x] Esqueleto com os dados reais: `usePainelMetas` (recebido, meta, faixas, unidade),
  `useMinhaComissao({ aberto: true, mes })`, linhas do mês de
  `useAnaliticoDashboard(true, mes)` (hoje e últimos pagamentos); ranking pela mesma
  fonte do `AnaliticoOperador` (`buscarResumoOperadoresAnalitico` +
  `idsOcultosRankingQuartil`), só com `temPermissao('analitico_sub_ranking')`.
- [x] Testes de componente: comissão some com `sem_config`/`sem_meta`/sem permissão,
  mostra «Faltam R$ X para a 1ª» com `nenhuma_faixa`, mensagem de erro com `erro`
  (nunca R$ 0,00); ranking só com permissão; régua marca as faixas batidas.
- [x] Visual do protótipo (`docs/mobile/prototipo-m.html`): fontes Bricolage
  Grotesque + Figtree carregadas só na `/m`; tokens escopados. Estados de
  carregando (esqueleto) e «sem relatório no mês».
- [x] «Novo»: guarda o `importado_em` mais recente visto (`localStorage`); linhas
  depois dele ganham destaque. `?novos=1` rola até a lista.
- [x] Recarregar em `visibilitychange` e no `message` do service worker.
- [x] Commit.

### Task 1.6: instalar

- [x] `InstalarApp`: guarda `beforeinstallprompt`; iPhone (`/iPhone|iPad/` +
  não standalone) → folha com o passo a passo; standalone → some.
- [x] Commit.

### Task 1.7: verificação e push

- [x] `npm test`, `npm run typecheck`, eslint dos arquivos tocados.
- [x] Rodar local (`npm run dev`) e conferir no Chromium em viewport de celular:
  redirecionamento, `/m` com dados de teste do dev, manifest válido (DevTools →
  Application), service worker registrado.
- [x] Atualizar `docs/MOBILE-PWA-EM-ANDAMENTO.md` e `docs/REGRAS-DE-NEGOCIO.md`.
- [x] Push na branch. Pedir ao usuário: testar no preview da Vercel num Android e num
  iPhone (instalar, abrir, conferir números contra o Dashboard).

---

## Etapa 2 — Ativar avisos (roteiro)

- Gerar par VAPID (fora do repositório); usuário cadastra `VITE_VAPID_PUBLIC_KEY` na
  Vercel e `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` nos secrets do Supabase.
- Migration `push_inscricoes` + RLS (spec §3) — **SQL mostrado, espera «pode»**.
- Edge Function `enviar-push` com a rota de «aviso de teste» (só para a própria
  inscrição, com o JWT da pessoa) — deploy **com «pode»**.
- `/m`: card «Ativar notificações», sino, desativar; `signOut` apaga a inscrição do
  aparelho; conferência do endpoint ao abrir.
- Testes: fluxo de permissão (concedida, negada, iPhone não instalado), apagar no
  logout.

## Etapa 3 — Aviso automático (roteiro)

- **Antes:** pedir «pode» para `SELECT extname FROM pg_extension WHERE extname IN
  ('pg_net','pg_cron');`.
- Migration `push_fila`, `fn_push_enfileirar` + gatilho por comando,
  `fn_push_disparar`, jobs do `pg_cron` (a cada minuto e limpeza diária) — **SQL
  mostrado, espera «pode»**.
- `enviar-push`: rodada da fila (`SKIP LOCKED`, corte de 3, resumo, meta batida,
  falhas 404/410, 3 tentativas, descarte > 6 h, desligado/férias).
- `supabase/functions/_shared/formasPagamento.ts` + teste de paridade com `src/lib`.
- Teste de paridade da meta batida com a base do `usePainelMetas`.
- Testes SQL (`*.sql.test.ts`): limpar + reimportar = zero; fora da janela = zero;
  `upsert` de existente = zero; sem inscritos = zero.
