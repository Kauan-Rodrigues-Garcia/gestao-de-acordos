# Testes — Guia do Projeto

Este projeto usa **[Vitest](https://vitest.dev/)** + **[Testing Library](https://testing-library.com/docs/react-testing-library/intro/)** com `happy-dom` como ambiente DOM. O setup está em `vitest.config.ts` e `src/test/setup.ts`.

## Status atual (2026-04-22)

| Métrica | Valor |
|---|---:|
| **Testes verdes** | **497** |
| **Arquivos de teste** | **26** |
| **Tempo da suíte** | ~20 s |
| Cobertura `src/services/` (lines) | ~73 % |
| Cobertura `src/lib/` (lines) | ~76 % |
| Cobertura `src/hooks/` (lines, cobertos) | ~95 % em 8 hooks (useAuth, useAcordos, useNrRegistros, useAnalytics, useNotificacoes, useCargoPermissoes, useDiretoExtraConfig, useEmpresa) |
| Cobertura `src/providers/` (lines) | ~98 % (RealtimeAcordosProvider + PresenceProvider) |
| Cobertura global (lines) | ~25 % |

> A cobertura global reflete o foco em camada de domínio, hooks críticos e providers. Páginas grandes (`ImportarExcel`, `PainelDiretoria`, `Dashboard`) e `src/components/ui/` (shadcn) seguem sem teste direto — são alvos de iterações futuras.

## Como rodar

```bash
npm test             # roda todos os testes uma vez (CI)
npm run test:watch   # modo watch, re-roda ao salvar
npm run test:ui      # interface visual interativa no navegador
npm run test:coverage # relatório de cobertura em coverage/index.html
```

## Onde colocar os testes

- **Co-localizados** junto ao arquivo testado: `foo.ts` → `foo.test.ts`.
- Helpers compartilhados ficam em `src/test/` (não são incluídos como testes).

## Escrevendo um teste novo

### 1. Função pura (o mais simples)

```ts
import { describe, it, expect } from 'vitest';
import { minhaFuncao } from './minhaFuncao';

describe('minhaFuncao', () => {
  it('faz X quando Y', () => {
    expect(minhaFuncao('entrada')).toBe('saída esperada');
  });
});
```

### 2. Componente React

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeuComponente } from './MeuComponente';

describe('<MeuComponente />', () => {
  it('renderiza o texto esperado', () => {
    render(<MeuComponente />);
    expect(screen.getByText(/olá/i)).toBeInTheDocument();
  });
});
```

### 3. Serviço que usa Supabase (com mock)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sempre declare o mock ANTES de importar o SUT.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(/* ... */) },
}));
import { meuServico } from './meuServico';

// Veja src/services/tratarExclusaoVinculo.test.ts para um exemplo real
// de mock chainable (.from().select().eq().maybeSingle()).
```

## Roadmap de cobertura (pirâmide)

### Camada 1 — Funções puras (✅ **concluída**)

| Arquivo | Status |
|---|---|
| `src/lib/deduplicarVinculados.ts` | ✅ 100 % |
| `src/components/VinculoTag.tsx` | ✅ 100 % |
| `src/components/OperadorCell.tsx` | ✅ 100 % |
| `src/lib/index.ts` (formatters, parsers, getTodayISO, isPaguePlay, extractEstado, calcHO/Coren/Cofen) | ✅ ~100 % — **60 testes** |
| `src/lib/motion.ts` (springs) | baixa prioridade (cosmético) |

### Camada 2 — Serviços com Supabase mockado (✅ **concluída**)

| Arquivo | Status |
|---|---|
| `src/services/tratarExclusaoVinculo.ts` | ✅ 81 % |
| `src/services/nr_registros.service.ts` | ✅ 100 % lines / 97 % branches / 100 % funcs (26 testes) |
| `src/services/lixeira.service.ts` | ✅ 100 % lines / 88 % branches / 100 % funcs (12 testes) |
| `src/services/notificacoes.service.ts` | ✅ 100 % lines / 100 % branches / 100 % funcs (12 testes) |
| `src/services/acordos.service.ts` | ✅ 100 % lines / 100 % branches / 100 % funcs (26 testes) |
| `src/services/direto_extra.service.ts` | ✅ 100 % lines / 100 % branches / 100 % funcs (16 testes) |

### Camada 3 — Componentes integrados (✅ **concluída**)

| Componente | Status |
|---|---|
| `AcordoEditInline` — bloqueio de NR duplicado na edição | ✅ 81 % lines / 79 % branches / 84 % funcs (9 testes) |
| `AcordoNovoInline` — fluxo CASO A/B/C Direto/Extra + modal aviso | ✅ 52 % lines (caminhos críticos 100 %) — 15 testes |
| `AcordoDetalheInline` — conversão Extra → Direto | ✅ 37 % lines (fluxo Extra→Direto 100 %) — 12 testes |
| `AdminDiretoExtra` — herança de ativação | ✅ 92 % lines / 74 % branches / 77 % funcs — 10 testes |
| `ModalFilaWhatsApp` — fila de disparo WhatsApp + auto-envio | ✅ 100 % lines / 91 % branches / 100 % funcs — 13 testes |
| `NotificacoesDetalhadas` — página de histórico de notificações | ✅ 96 % lines / 89 % branches / 100 % funcs — 13 testes |

### Camada 4 — Hooks com renderHook (✅ **8 de 12 — núcleo fechado**)

| Hook | Status |
|---|---|
| `useAcordos.ts` — fetch + realtime + CRUD (inclui `useDashboardMetricas`) | ✅ **37 testes** — fetch/erro/refetch/patch/remove/add, realtime (INSERT/UPDATE/DELETE + cleanup), equipe_id |
| `useNrRegistros.ts` — cache de NR + realtime + verificarConflito | ✅ **26 testes** — cache lowercase, realtime, verificarConflito (case/trim/acordoIdExcluir), refetch, cleanup |
| `useAuth.tsx` — autenticação + backoff exponencial 7 tentativas + validação multi-tenant | ✅ **26 testes** — signIn (email/username), signOut, backoff, slug bypass (super_admin), cleanup de subscription |
| `useAnalytics.ts` (447 linhas) | ✅ **38 testes** — **97 % lines** — séries por período/setor/operador, filtros de equipe, `maybeSingle` em `metas`, determinismo com `vi.setSystemTime`, cap de percentual em 999 |
| `useNotificacoes.ts` | ✅ **17 testes** — fetch/marcarLida/marcarTodasLidas/limparTodas/criar, realtime INSERT/UPDATE/DELETE, cleanup de channel + interval |
| `useCargoPermissoes.ts` — autorização (SEGURANÇA) | ✅ **19 testes — 100 % cobertura** — todos os 7 perfis, combinações de roles, fallbacks, guard `loading=true` |
| `useDiretoExtraConfig.ts` — config Direto/Extra por nível | ✅ **13 testes** — precedência usuário > equipe > setor, realtime genérico, refetch |
| `useEmpresa.tsx` — context de empresa/tenant | ✅ **13 testes** — load inicial, TOKEN_REFRESHED não-op, SIGNED_IN/OUT, fallback sem empresa |
| `useChartColors.ts` | baixa prioridade (cosmético) |
| `use-mobile.tsx` | baixa prioridade (thin wrapper) |
| `use-toast.ts` | baixa prioridade (thin wrapper) |
| `usePresence.ts` (13 linhas) | baixa prioridade — thin wrapper do `PresenceProvider` (já coberto) |

### Camada 5 — Providers (✅ **ambos cobertos**)

| Provider | Status |
|---|---|
| `RealtimeAcordosProvider.tsx` — canal único de realtime + distribuição para subscribers | ✅ **34 testes** — lifecycle do canal, múltiplos subscribers, INSERT/UPDATE/DELETE (incl. fetch pós-INSERT), early-returns — **100 % lines** |
| `PresenceProvider.tsx` — presence realtime (quem está online) | ✅ **17 testes** — subscribe/unsubscribe, heartbeat 20s, track/untrack, eventos sync/join/leave, reconexão em troca de empresa — ~96 % lines |

### Camada 6 — E2E (futuro)

Ainda não foi decidido se usaremos Playwright ou Cypress. Sugestão: Playwright pela velocidade e suporte nativo ao Vitest.

## Boas práticas adotadas

1. **Não tocar o banco real.** Todo teste de serviço mocka `@/lib/supabase`. Nunca faça `import { supabase }` sem `vi.mock`.
2. **Mock chainable.** Supabase usa encadeamento (`from().select().eq()...`). Construir um builder que retorna `this` em cada método é a forma padrão — veja `tratarExclusaoVinculo.test.ts`.
3. **Reset de mocks entre testes.** Use `beforeEach` para zerar `mockReset()`, senão chamadas vazam entre casos.
4. **Testar o comportamento, não a implementação.** Prefira `screen.getByText` / `getByRole` sobre `querySelector(...)` com classes CSS — se o layout mudar, o teste continua valendo.
5. **Arrange–Act–Assert visível.** Separe preparação, ação e verificação com linhas em branco.
6. **Nomes descritivos.** `it('não notifica quando UPDATE falha')` > `it('handles error')`.
7. **Guardas defensivas merecem teste.** Todo `if (!x) return` ou `if (a === b)` é um ramo — precisa de um caso cobrindo-o, senão ele é desabilitado silenciosamente numa refatoração.

## Por que esses arquivos primeiro?

Os testes iniciais cobrem **funções que causaram bugs reais em produção** em 2026-04-21:

- **`deduplicarVinculados`** — a lógica de consolidar pares tinha 3 pontos de quebra silenciosa (sem chave, mesmo operador, grupo com 3+).
- **`VinculoTag`** — o bug das duas tags simultâneas ("Vínculo" + "Direto+Extra") foi resolvido com regra de prioridade mutuamente exclusiva; agora temos um teste que GARANTE que só renderiza UMA tag.
- **`OperadorCell`** — nova exigência de mostrar dois operadores; o teste previne que alguém apague a lógica sem querer.
- **`tratarExclusaoVinculo`** — helper crítico de consistência pós-delete; se quebrar, pares ficam órfãos, bloqueio de NR aponta pra operador errado, notificações somem.
- **`nr_registros.service`** — fonte-de-verdade do bloqueio de NR. 26 testes cobrindo 7 funções em 22 ms, 100% lines. Se este arquivo quebrar, tabulações duplicadas voltam a aparecer.
- **`AcordoEditInline`** — cenário original do bug das tabulações duplicadas via edição. 9 testes cobrindo: não chama verificação quando chave não muda; bloqueia com toast quando muda para valor ocupado; salva + sincroniza `nr_registros` quando livre; Extras NÃO são registrados como titulares; PaguePlay usa `instituicao` como chave; queda da verificação → `toast.warning` e segue.
- **`AcordoNovoInline`** — fluxo de criação com bloqueio de NR e ramificação Direto/Extra. 15 testes cobrindo: validações de campos obrigatórios; bloqueio por mesmo operador; **CASO A** (usuário tem lógica → insere como EXTRA + atualiza direto antigo + notifica); **CASO B** (só o outro tem lógica → abre modal de aviso sem autorização); **CASO C** (ninguém tem → abre modal de autorização do líder); NR livre → insert simples + onSaved. Também cobre o componente exportado `ModalAvisoDiretoExtra` em isolado.
- **`AcordoDetalheInline`** — conversão Extra → Direto, cenário do bug do campo `inscricao` inexistente. 12 testes cobrindo: badge "Extra" + botão "Acordo direto" condicional ao dono; modal Extra→Direto com/sem autorização do líder; **fluxo completo com par direto** (delete direto antigo + update extra→direto + notificação + transferirNr + liberarNrPorAcordoId); fluxo sem par direto (promoção órfã); PaguePlay usa `instituicao`; chave vazia → `toast.error` defensivo; erro no UPDATE → `toast.error` e aborto.
- **`lixeira.service`** — 4 funções (`enviarParaLixeira`, `fetchLixeira`, `esvaziarLixeira`, `deletarItemLixeira`). 12 testes cobrindo snapshot completo no insert, fallback null para campos ausentes, erro de RLS, lista com limit custom, delete por empresa e por id. Se este serviço quebrar, acordos transferidos via transferência de NR são perdidos sem retenção.
- **`notificacoes.service`** — 5 funções (`fetchNotificacoes`, `marcarComoLida`, `marcarTodasLidas`, `limparTodasNotificacoes`, `criarNotificacao`). 12 testes cobrindo: listagem ordenada por `criado_em desc` com limit 50; marcação individual e em lote (só não-lidas); limpeza total por usuário; insert com e sem `empresa_id`; todos os caminhos de erro apenas logam warning (não lançam). Serviço crítico: usado por `AcordoNovoInline` (CASO A + autorização do líder), `AcordoDetalheInline` (Extra→Direto) e pelo sino de notificações. Se quebrar, operadores deixam de receber avisos de transferência de chave.
- **`acordos.service`** — fonte-de-verdade das queries e cálculos de acordos. 26 testes cobrindo: `fetchAcordos` (filtros status/tipo/operador/setor/empresa/vencimento/data_inicio/data_fim, `apenas_hoje`, `busca` com `.or()` multi-coluna, paginação server-side com `.range()`, fluxo `equipe_id` que faz 2 queries encadeadas — `perfis` antes de `acordos_deduplicados` — com early-return quando equipe não tem membros, propagação de erro); `verificarNrDuplicado` (nr vazio defensivo, sem/com duplicata, `acordoIdExcluir` na edição, campo `instituicao` para PaguePlay); `verificarNrsDuplicadosEmLote` (trim+dedupe, mapping por coluna, fallback "Operador desconhecido", guarda contra valores vazios); e as três funções puras `calcularMetricas`/`calcularMetricasMes`/`calcularMetricasDashboard` com `vi.setSystemTime` fixando 2026-04-22 para determinismo. Se este arquivo quebrar, TODA a listagem + paginação + métricas de dashboard deixam de funcionar.
- **`direto_extra.service` + `AdminDiretoExtra`** — núcleo da lógica "Direto e Extra", que define se um operador pode tabular acordo sobre NR alheio. 16 testes no serviço (fetch/upsert/resolver em 3 níveis — usuário → equipe → setor) + 10 testes no componente (render das 3 abas, herança equipe←setor, herança usuário←equipe, herança usuário←setor, config própria sobrescreve herança, toggle com sucesso e erro, botões/switches travados em itens herdados, badges de total). Se quebrar, operadores deixam de poder tabular acordos extras — regra de negócio central do produto.
- **`ModalFilaWhatsApp`** — modal de disparo de lembretes via WhatsApp (individual e em lote). 13 testes cobrindo: render do Dialog e progresso; label NR vs CPF condicional ao `isPaguePlay`; botão "Enviar todos" só visível em PaguePlay; `abrirProximo` chama `window.open` + registra log em `logs_sistema`; proteção `if (!usuarioId) return` no log; copiar mensagem individual e todas (com numeração `[n/total]` e separadores `---`); expansão/colapso de item via chevron; envio automático com fake timers e delay de 1500ms entre disparos; `toast.warning` quando popup é bloqueado; cancelamento do loop automático (botão "Cancelar" interrompe sem emitir toast final). Cobertura 100% de linhas e 91% de branches. Se quebrar, operadores não conseguem disparar cobrança via WhatsApp em lote.
- **`NotificacoesDetalhadas`** — página `/notificacoes` que lista as notificações dos últimos 5 dias do usuário atual. 13 testes cobrindo: estado de loading → vazio; query correta (filtro `usuario_id`, `gte criado_em`, `order desc`, `limit 500`); agrupamento por dia com labels "Hoje"/"Ontem"/dia da semana; contagem de não-lidas no header; filtro textual por título ou mensagem + estado "Nenhuma notificação corresponde"; `marcarLida` individual; `marcarTodasLidas`; `excluir` individual; "Limpar todas" com guarda de `window.confirm` (teste que confirm=false não executa delete); fluxo de erro + "Tentar novamente"; realtime callback recarregando a lista. Usa `vi.setSystemTime` para determinismo nas datas relativas. Cobertura 96% de linhas.

### Exemplo prático: refatoração `alert()` → `toast.error()` (AcordoDetalheInline)

Depois que a suíte do `AcordoDetalheInline` ficou verde (12/12), foi possível substituir 9 ocorrências de `window.alert(...)` por `toast.error(...)` em poucos segundos e com **zero risco**:

1. Os 2 testes que validavam mensagens de erro passaram a asserir contra `toastError` (o mesmo mock já existente).
2. O spy de `alert` foi transformado em **tripwire permanente**: `expect(alertSpy).not.toHaveBeenCalled()` em todos os fluxos de erro. Se alguém reintroduzir `window.alert` no componente por acidente, os testes falham na hora.
3. Resultado: a UX ficou consistente com o resto do app (sonner/toast) sem precisar abrir o navegador nem clicar manualmente em 9 cenários de erro.

Esse tipo de refatoração só é seguro porque os testes existem. **É o payoff direto do investimento em testes** — manutenibilidade, não só detecção de bug.

### Padrão de builder mock para serviços com múltiplas queries concorrentes

Ao escrever o teste de `acordos.service`, descobrimos que o builder thenable usado até então tinha uma limitação: ele mantinha `currentCall` em variável **global** — funciona quando o serviço faz uma query por vez, mas **quebra silenciosamente** quando duas queries vivem simultaneamente. Cenário concreto: em `fetchAcordos({ equipe_id })`, o código faz `let query = supabase.from('acordos_deduplicados')...` criando o primeiro builder, depois chama `resolverOperadoresDaEquipe()` que cria o builder de `perfis` (sobrescrevendo `currentCall`), e por fim chama `query.in(...)` no builder ORIGINAL de `acordos_deduplicados`. Como o método `.in()` escrevia em `currentCall` (agora apontando para `perfis`), o teste via filtro aparecer no builder errado.

**Solução**: cada builder captura seu próprio `call` via closure:

```ts
function createBuilder(table: string) {
  const call: BuilderCall = { table, operation: null, filters: [] };
  calls.push(call);

  const builder = {
    eq: vi.fn((col, val) => { call.filters.push(['eq', col, val]); return builder; }),
    in: vi.fn((col, values) => { call.in = { col, values }; return builder; }),
    // ... cada método referencia o `call` capturado, nunca `currentCall`
    then: (resolve, reject) =>
      Promise.resolve(nextResultFor(table)).then(resolve, reject),
  };
  return builder;
}
```

E para simular múltiplas queries com resultados diferentes, usamos uma **fila por tabela**:

```ts
const resultsByTable: Record<string, MockResult[]> = {};
// Setup:
resultsByTable['perfis'] = [{ data: [...membros], error: null }];
resultsByTable['acordos_deduplicados'] = [{ data: [...], count: N, error: null }];
```

Esse é o padrão recomendado para qualquer serviço novo que orquestre 2+ queries encadeadas.

### Padrão de mocks UI para Radix (Dialog / Popover / Select / Calendar)

Radix usa Portal para renderizar fora da DOM tree, o que complica os testes no happy-dom. Nos testes de componentes grandes (`AcordoNovoInline`, `AcordoDetalheInline`) adotamos stubs leves:

```ts
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => open ? <div role="dialog">{children}</div> : null,
  DialogContent:     ({ children }) => <div>{children}</div>,
  DialogHeader:      ({ children }) => <div>{children}</div>,
  DialogTitle:       ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <div>{children}</div>,
  DialogFooter:      ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/popover', () => ({
  Popover:        ({ children }) => <>{children}</>,
  PopoverTrigger: ({ children }) => <>{children}</>,
  PopoverContent: ({ children }) => <>{children}</>,
}));

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }) => (
    <button data-testid="pick-date" onClick={() => onSelect?.(new Date('2026-05-15'))}>pick-date</button>
  ),
}));
```

Isso mantém os testes focados no comportamento do SUT sem ter que lutar contra o sistema de Portal / animação do Radix.

### Padrão de mock chainable "thenable" (nr_registros.service.test.ts)

O Supabase PostgrestBuilder é um objeto chainable que termina sendo awaited diretamente — ex.: `const { data } = await supabase.from().select().eq().limit(1)`. Para simular isso sem dependências externas, o builder mock implementa `then`:

```ts
const builder = {
  select: vi.fn(() => builder),
  eq:     vi.fn(() => builder),
  limit:  vi.fn(() => builder),
  then: (res, rej) => Promise.resolve(nextResult).then(res, rej),
};
```

Assim `await builder` consome `nextResult` (controlado por cada `it`) e ainda permite asserções sobre quais métodos foram chamados.

## Adicionando um novo teste: checklist

- [ ] Arquivo `.test.ts` ou `.test.tsx` co-localizado com o código testado.
- [ ] Import primeiro os helpers de teste (`describe`, `it`, `expect`, `vi`).
- [ ] Se usa Supabase: declare `vi.mock('@/lib/supabase', ...)` ANTES de importar o SUT.
- [ ] `beforeEach` zerando mocks se houver algum.
- [ ] Pelo menos 1 caso para cada `if`/`else`/`switch case`.
- [ ] `npm test` passa antes do commit.
- [ ] `npm run test:coverage` — arquivo tocado deve ficar ≥ 80%.
