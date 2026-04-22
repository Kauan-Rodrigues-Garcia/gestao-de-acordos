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
| `src/services/nr_registros.service.ts` | ⏳ próximo — crítico |
| `src/services/lixeira.service.ts` | ⏳ próximo |
| `src/services/notificacoes.service.ts` | ⏳ |
| `src/services/acordos.service.ts` | ⏳ |

### Camada 3 — Componentes integrados

| Componente | Status |
|---|---|
| `AcordoEditInline` — bloqueio de NR duplicado na edição | ⏳ alta prioridade |
| `AcordoNovoInline` — fluxo CASO A/B Direto/Extra | ⏳ alta prioridade |
| `AcordoDetalheInline` — conversão Extra → Direto | ⏳ alta prioridade |
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

## Adicionando um novo teste: checklist

- [ ] Arquivo `.test.ts` ou `.test.tsx` co-localizado com o código testado.
- [ ] Import primeiro os helpers de teste (`describe`, `it`, `expect`, `vi`).
- [ ] Se usa Supabase: declare `vi.mock('@/lib/supabase', ...)` ANTES de importar o SUT.
- [ ] `beforeEach` zerando mocks se houver algum.
- [ ] Pelo menos 1 caso para cada `if`/`else`/`switch case`.
- [ ] `npm test` passa antes do commit.
- [ ] `npm run test:coverage` — arquivo tocado deve ficar ≥ 80%.
