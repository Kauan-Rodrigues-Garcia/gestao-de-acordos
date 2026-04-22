# Testes — Guia do Projeto

Este projeto usa **[Vitest](https://vitest.dev/)** + **[Testing Library](https://testing-library.com/docs/react-testing-library/intro/)** com `happy-dom` como ambiente DOM. O setup está em `vitest.config.ts` e `src/test/setup.ts`.

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

### Camada 1 — Funções puras (concluída parcialmente)

| Arquivo | Status |
|---|---|
| `src/lib/deduplicarVinculados.ts` | ✅ 100% |
| `src/components/VinculoTag.tsx` | ✅ 100% |
| `src/components/OperadorCell.tsx` | ✅ 100% |
| `src/lib/index.ts` (formatters, parsers) | ⏳ próximo |
| `src/lib/motion.ts` (springs) | baixa prioridade |

### Camada 2 — Serviços com Supabase mockado (iniciada)

| Arquivo | Status |
|---|---|
| `src/services/tratarExclusaoVinculo.ts` | ✅ 81% |
| `src/services/nr_registros.service.ts` | ✅ 100% lines / 97% branches / 100% funcs (26 testes) |
| `src/services/lixeira.service.ts` | ⏳ próximo |
| `src/services/notificacoes.service.ts` | ⏳ |
| `src/services/acordos.service.ts` | ⏳ |

### Camada 3 — Componentes integrados

| Componente | Status |
|---|---|
| `AcordoEditInline` — bloqueio de NR duplicado na edição | ✅ 81% lines / 79% branches / 84% funcs (9 testes) |
| `AcordoNovoInline` — fluxo CASO A/B/C Direto/Extra + modal aviso | ✅ 52% lines (caminhos críticos 100%) — 15 testes |
| `AcordoDetalheInline` — conversão Extra → Direto | ✅ 37% lines (fluxo Extra→Direto 100%) — 12 testes |
| `AdminDiretoExtra` — herança ativação | ⏳ |
| `ModalFilaWhatsApp` | ⏳ |
| `NotificacoesDetalhadas` | ⏳ |

### Camada 4 — E2E (futuro)

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
- **`AcordoDetalheInline`** — conversão Extra → Direto, cenário do bug do campo `inscricao` inexistente. 12 testes cobrindo: badge "Extra" + botão "Acordo direto" condicional ao dono; modal Extra→Direto com/sem autorização do líder; **fluxo completo com par direto** (delete direto antigo + update extra→direto + notificação + transferirNr + liberarNrPorAcordoId); fluxo sem par direto (promoção órfã); PaguePlay usa `instituicao`; chave vazia → alerta defensivo; erro no UPDATE → alerta e aborto.

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
