# Analítico — Por operador: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a aba Analítico → Por operador na estética do Gestão de Acordos e absorver o Recebimento diário como um recorte de dia da mesma tela, eliminando a aba duplicada.

**Architecture:** Uma lente de recorte (`Mês · Dia · Período`) no topo da página escolhe a fonte: `analitico_recebimentos` para mês e período, `diario_recebimentos` para dia. Dois adaptadores puros convertem os resumos de cada fonte para um contrato único, `LinhaOperadorPainel`, que alimenta uma única lista de operadores. As tabelas do banco permanecem intactas; o que some é a segunda tela.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library (happy-dom), Tailwind v4, shadcn/ui, Supabase JS, lucide-react, recharts, framer-motion.

**Spec:** `docs/superpowers/specs/2026-09-05-analitico-por-operador-design.md`

## Global Constraints

- **Nenhuma operação de banco.** Sem migration, sem RPC nova, sem `execute_sql`, sem `supabase db push`. O banco `vfrvvoetidtsqbbhdkmj` é produção — ver `CLAUDE.md` na raiz. Tudo neste plano é código de aplicação lendo pelas consultas que já existem.
- **Testes puros antes da tela.** Módulos sem JSX (`recorte.ts`, `linhaOperador.ts`) têm teste escrito antes da implementação.
- **Idioma:** todo texto de UI, comentário e mensagem de commit em português. Commits em Conventional Commits com escopo, no estilo do repositório: `feat(analitico): a regua de abas deixa de ser sublinhada`.
- **Nomes de arquivo de teste:** colocados ao lado do módulo, sufixo `.test.ts` / `.test.tsx`.
- **Comandos:** `npm test -- <caminho>` para um arquivo, `npm run typecheck` para os três tsconfigs, `npm run lint` para ESLint.
- **`null` em literal de objeto precisa de tipo por perto.** `tsconfig.app.json` combina `"strict": false` com `"noImplicitAny": true`. Sem `strictNullChecks`, um `null` cru num literal alarga para `any`, e o `noImplicitAny` o reprova: `error TS7018: Object literal's property 'x' implicitly has an 'any' type`. A anotação de retorno da função **não** alcança o literal dentro de um `.map()`. Sempre que um objeto literal carregar `null`, anote o callback: `lista.map((r): Tipo => ({ … }))`. Anotar é melhor que `null as T | null` — o cast cala o compilador, a anotação faz ele conferir o objeto inteiro.
- **Teste verde não é build verde.** O `exclude` do `tsconfig.app.json` tira todo `*.test.ts` e `*.test.tsx` do typecheck, e o vitest transpila sem checar tipo. Um arquivo pode ter 10/10 testes passando e o build quebrado. Rode `npm run typecheck` **antes** de acreditar no verde do vitest, não só antes de commitar.
- **`AbasSegmentadas` precisa do genérico explícito quando as abas vêm de um `.map`.** O `.map` alarga `key` para `string`, e aí `onTrocar` não encaixa no `setState` tipado: `Type 'Dispatch<SetStateAction<"analitico" | "colchao" | "desafios">>' is not assignable to type '(k: string) => void'`. Declare o tipo das chaves uma vez (`type AbaPrincipal = …`) e passe-o na instanciação: `<AbasSegmentadas<AbaPrincipal> …>`. Vale para todas as instâncias das tarefas 9, 10 e 12.
- **Ao testar `AbasSegmentadas`, use nome exato, não regex.** O componente é `role="group"` com botões comuns, então o papel deixou de estreitar a busca: `getByRole('button', { name: /Mês/ })` casa com o botão do modo **e** com o "Mês atual" ao lado, e o teste falha com `Found multiple elements`. Enquanto o papel era `tab`, o filtro escondia a colisão. Prefira `{ name: 'Mês' }` — é o padrão de `PainelMetas/SeletorUnidade.test.tsx` — e afirme o `aria-pressed` do ativo, que é o contrato novo.
- **Data e hora na tela levam `timeZone: 'America/Sao_Paulo'`.** `importado_em` e afins são `timestamptz`, então o instante chega certo — mas `toLocaleTimeString`/`toLocaleDateString` sem `timeZone` renderizam no relógio da máquina de quem olha. O projeto já se queimou com isso: o comentário de `getTodayISO` (`src/lib/index.ts:278`) conta que a versão antiga virava o dia às 21h e afetava justamente o dia inicial do recebimento diário. O precedente para este mesmo campo é `instanteLegivel` em `src/services/fechamento/fechamento.service.ts:149`.
- **Os arquivos de teste não têm porteiro de tipo, e isto é conhecido.** Existe um `tsconfig.test.json` que os incluiria, mas ele não está ligado ao `npm run typecheck` e já falha sozinho em testes antigos (`node:fs`, `__dirname`, um `TS7018` pré-existente em `solicitacoesWhatsapp.service.test.ts`) além de um `TS5010` na própria configuração. Consertá-lo é trabalho de outro dia e está fora deste plano. O que cobre os testes aqui é o ESLint e a execução do vitest — então, ao escrever um `.test.tsx`, prefira props explícitas a `as any`: o compilador não vai avisar.
- **Servidor de desenvolvimento:** `npm run dev` → http://localhost:8080/
- **O trabalho vive no ramo `feat/analitico-por-operador`, nunca na `main`.** A Task 8 deixa o typecheck vermelho de propósito — a página passa a mandar `recorte` antes de as duas telas filhas saberem recebê-lo, e só a Task 10 fecha a conta. Um commit que não compila é tolerável num ramo de trabalho e não é tolerável na `main`. Confira com `git branch --show-current` antes de commitar qualquer coisa das tarefas 8 em diante.
- **HO só existe na PaguePlay.** Toda coluna/tile de HO fica atrás de `tenant.isPaguePlay`.
- **Permissões não ganham chave nova.** `analitico_sub_recebimento_diario` passa a liberar a lente Dia; `analitico_sub_por_operador` e `importar_diario` seguem como estão. Nada muda em `src/lib/permissoes-catalogo.ts`.

---

## Estrutura de arquivos

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `src/pages/Analitico/recorte.ts` | O tipo `Recorte` e a navegação entre modos. Puro. |
| `src/pages/Analitico/recorte.test.ts` | Testes do acima. |
| `src/pages/Analitico/linhaOperador.ts` | O contrato `LinhaOperadorPainel` e os dois adaptadores. Puro. |
| `src/pages/Analitico/linhaOperador.test.ts` | Testes do acima. |
| `src/pages/Analitico/SeletorRecorte.tsx` | O controle segmentado Mês · Dia · Período. |
| `src/pages/Analitico/SeletorRecorte.test.tsx` | Teste de render/interação. |
| `src/components/KpiTile.tsx` | Tile de número no padrão Pix Automático. Compartilhado. |
| `src/components/KpiTile.test.tsx` | Teste de render. |
| `src/components/AbasSegmentadas.tsx` | Régua de abas em grupo segmentado. Compartilhada. |
| `src/pages/Analitico/ListaOperadores.tsx` | A lista de operadores, agnóstica de fonte. |
| `src/pages/Analitico/ListaOperadores.test.tsx` | Teste de render/barra. |
| `src/pages/Analitico/FaixaPulso.tsx` | Faixa de novos/ignorados/importação (recorte Dia). |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `src/pages/Analitico/index.tsx` | Lente substitui o seletor de mês; aba Diário sai; `?aba=diario` redireciona. |
| `src/pages/Dashboard/Analitico/AnaliticoLider.tsx` | Consome a lente, `ListaOperadores`, `KpiTile`, `DatePickerField`. |
| `src/pages/Dashboard/Analitico/AnaliticoOperador.tsx` | `KpiTile`, `DatePickerField`, barra de tabulação, tile de posição. |
| `src/pages/Analitico/Diario/DiaDetalhado.tsx` | Passa a ler `AnaliticoDashboardLinha[]` em vez do resumo mensal do diário. |

**Removidos** (na Task 12, depois que tudo estiver no lugar)

- `src/pages/Analitico/Diario/DiarioLider.tsx` (1.197 linhas)
- `src/pages/Analitico/Diario/DiarioOperador.tsx` (229 linhas)
- `src/pages/Analitico/Diario/index.tsx` (82 linhas)

**Intocados** — `src/services/diario/*`, `src/pages/Analitico/Diario/helpers.ts`, `ImportarDiarioModal.tsx`, `FormaChip.tsx`, `src/hooks/useDiario.ts`, e todos os testes existentes.

---

### Task 1: O tipo `Recorte`

**Files:**
- Create: `src/pages/Analitico/recorte.ts`
- Test: `src/pages/Analitico/recorte.test.ts`

**Interfaces:**
- Consumes: `deslocarMes`, `primeiroDiaDoMes`, `ultimoDiaDoMes`, `normalizarMes` de `@/lib/mesReferencia`. **Nada mais** — `hoje` entra como parâmetro em `trocarModo` e `recorteDaQuery` em vez de sair de `getTodayISO()` aqui dentro. É o que mantém o módulo puro: quem testa escolhe o dia.
- Produces: `type Recorte`, `type ModoRecorte`, `somarDias(iso, delta): string`, `mesDoRecorte(r): string`, `intervaloDoRecorte(r): { inicio: string; fim: string }`, `trocarModo(r, modo, hoje): Recorte`, `deslocarRecorte(r, delta): Recorte`, `queryDoRecorte(r): Record<string,string>`, `recorteDaQuery(params, hoje): Recorte | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/pages/Analitico/recorte.test.ts
import { describe, it, expect } from 'vitest';
import {
  mesDoRecorte, intervaloDoRecorte, trocarModo, somarDias,
  recorteDaQuery, queryDoRecorte, type Recorte,
} from './recorte';

const HOJE = '2026-09-05';

describe('mesDoRecorte', () => {
  it('devolve o mês do modo mes', () => {
    expect(mesDoRecorte({ modo: 'mes', mes: '2026-09' })).toBe('2026-09');
  });
  it('deriva o mês a partir do dia', () => {
    expect(mesDoRecorte({ modo: 'dia', dia: '2026-08-31' })).toBe('2026-08');
  });
  it('devolve o mês do período', () => {
    expect(mesDoRecorte({ modo: 'periodo', mes: '2026-07', inicio: '2026-07-03', fim: '2026-07-09' }))
      .toBe('2026-07');
  });
});

describe('intervaloDoRecorte', () => {
  it('mês vira o mês inteiro', () => {
    expect(intervaloDoRecorte({ modo: 'mes', mes: '2026-02' }))
      .toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
  it('dia vira um intervalo de um dia', () => {
    expect(intervaloDoRecorte({ modo: 'dia', dia: '2026-09-05' }))
      .toEqual({ inicio: '2026-09-05', fim: '2026-09-05' });
  });
  it('período devolve as próprias pontas', () => {
    expect(intervaloDoRecorte({ modo: 'periodo', mes: '2026-09', inicio: '2026-09-02', fim: '2026-09-04' }))
      .toEqual({ inicio: '2026-09-02', fim: '2026-09-04' });
  });
});

describe('somarDias', () => {
  it('atravessa a virada do mês', () => {
    expect(somarDias('2026-08-31', 1)).toBe('2026-09-01');
  });
  it('atravessa a virada do ano para trás', () => {
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('trocarModo', () => {
  it('mes → dia escolhe hoje quando hoje cai no mês em foco', () => {
    expect(trocarModo({ modo: 'mes', mes: '2026-09' }, 'dia', HOJE))
      .toEqual({ modo: 'dia', dia: '2026-09-05' });
  });
  it('mes → dia escolhe o último dia quando o mês já fechou', () => {
    expect(trocarModo({ modo: 'mes', mes: '2026-07' }, 'dia', HOJE))
      .toEqual({ modo: 'dia', dia: '2026-07-31' });
  });
  it('dia → mes mantém o mês daquele dia', () => {
    expect(trocarModo({ modo: 'dia', dia: '2026-07-14' }, 'mes', HOJE))
      .toEqual({ modo: 'mes', mes: '2026-07' });
  });
  it('mes → periodo abre com o mês inteiro selecionado', () => {
    expect(trocarModo({ modo: 'mes', mes: '2026-09' }, 'periodo', HOJE))
      .toEqual({ modo: 'periodo', mes: '2026-09', inicio: '2026-09-01', fim: '2026-09-30' });
  });
});

describe('query', () => {
  it('ida e volta preserva o recorte de dia', () => {
    const r: Recorte = { modo: 'dia', dia: '2026-09-05' };
    const params = new URLSearchParams(queryDoRecorte(r));
    expect(recorteDaQuery(params, HOJE)).toEqual(r);
  });
  it('aba=diario legado vira recorte de dia em hoje', () => {
    const params = new URLSearchParams({ aba: 'diario' });
    expect(recorteDaQuery(params, HOJE)).toEqual({ modo: 'dia', dia: HOJE });
  });
  it('query sem recorte devolve null', () => {
    expect(recorteDaQuery(new URLSearchParams({ aba: 'analitico' }), HOJE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Analitico/recorte.test.ts`
Expected: FAIL — `Failed to resolve import "./recorte"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/pages/Analitico/recorte.ts
/**
 * O recorte de tempo do Analítico — a "lente".
 *
 * Antes eram dois controles em telas diferentes: o seletor de mês da aba
 * Analítico e o seletor de dia da aba Recebimento diário. São a mesma pergunta
 * com janelas diferentes, e separá-los obrigava a trocar de aba para mudar de
 * janela — o caminho que fez as duas telas desenharem a mesma lista duas vezes.
 *
 * O módulo é puro de propósito: a decisão "que janela é esta" precisa ter teste
 * sem montar React.
 */
import {
  deslocarMes, primeiroDiaDoMes, ultimoDiaDoMes, normalizarMes,
} from '@/lib/mesReferencia';

export type ModoRecorte = 'mes' | 'dia' | 'periodo';

export type Recorte =
  | { modo: 'mes';     mes: string }
  | { modo: 'dia';     dia: string }
  | { modo: 'periodo'; mes: string; inicio: string; fim: string };

/** 'yyyy-MM-dd' + delta dias, atravessando mês e ano. Meio-dia evita fuso. */
export function somarDias(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** O mês ('yyyy-MM') em que a lente está, qualquer que seja o modo. */
export function mesDoRecorte(r: Recorte): string {
  return r.modo === 'dia' ? r.dia.slice(0, 7) : r.mes;
}

/** As duas pontas da janela, inclusivas, em 'yyyy-MM-dd'. */
export function intervaloDoRecorte(r: Recorte): { inicio: string; fim: string } {
  if (r.modo === 'dia')     return { inicio: r.dia, fim: r.dia };
  if (r.modo === 'periodo') return { inicio: r.inicio, fim: r.fim };
  return { inicio: primeiroDiaDoMes(r.mes), fim: ultimoDiaDoMes(r.mes) };
}

/**
 * Troca de modo preservando a janela.
 *
 * Ao ir para o dia, escolhe HOJE se hoje cai no mês em foco; senão o último dia
 * do mês. Cair em "dia 1 de um mês fechado" mostraria uma tela vazia e daria a
 * impressão de que a troca apagou os dados.
 */
export function trocarModo(r: Recorte, modo: ModoRecorte, hoje: string): Recorte {
  if (modo === r.modo) return r;
  const mes = mesDoRecorte(r);
  if (modo === 'mes') return { modo: 'mes', mes };
  if (modo === 'dia') {
    const dia = hoje.slice(0, 7) === mes ? hoje : ultimoDiaDoMes(mes);
    return { modo: 'dia', dia };
  }
  return { modo: 'periodo', mes, inicio: primeiroDiaDoMes(mes), fim: ultimoDiaDoMes(mes) };
}

/** Anda um passo para frente ou para trás, no que o modo entende por passo. */
export function deslocarRecorte(r: Recorte, delta: number): Recorte {
  if (r.modo === 'dia') return { modo: 'dia', dia: somarDias(r.dia, delta) };
  if (r.modo === 'mes') return { modo: 'mes', mes: deslocarMes(r.mes, delta) };
  return r;   // período tem duas pontas escolhidas à mão; não se desloca inteiro
}

/** O recorte vira query string, para o link ser compartilhável. */
export function queryDoRecorte(r: Recorte): Record<string, string> {
  if (r.modo === 'dia')     return { recorte: 'dia', dia: r.dia };
  if (r.modo === 'periodo') return { recorte: 'periodo', mes: r.mes, de: r.inicio, ate: r.fim };
  return { recorte: 'mes', mes: r.mes };
}

/**
 * Lê o recorte da URL. `null` = a URL não fala de recorte, e quem chama decide
 * o padrão.
 *
 * `?aba=diario` é o link antigo das notificações de importação do diário. Ele
 * continua existindo em notificações já enviadas, então continua funcionando:
 * vira o recorte de dia em hoje.
 */
export function recorteDaQuery(params: URLSearchParams, hoje: string): Recorte | null {
  if (params.get('aba') === 'diario' && !params.get('recorte')) {
    return { modo: 'dia', dia: params.get('dia') || hoje };
  }
  const modo = params.get('recorte');
  if (modo === 'dia')  return { modo: 'dia', dia: params.get('dia') || hoje };
  if (modo === 'mes')  return { modo: 'mes', mes: normalizarMes(params.get('mes')) };
  if (modo === 'periodo') {
    const mes = normalizarMes(params.get('mes'));
    return {
      modo: 'periodo',
      mes,
      inicio: params.get('de')  || primeiroDiaDoMes(mes),
      fim:    params.get('ate') || ultimoDiaDoMes(mes),
    };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/Analitico/recorte.test.ts`
Expected: PASS, 15 testes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Analitico/recorte.ts src/pages/Analitico/recorte.test.ts
git commit -m "feat(analitico): a lente de recorte vira um tipo com teste

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: O contrato `LinhaOperadorPainel` e os adaptadores

**Files:**
- Create: `src/pages/Analitico/linhaOperador.ts`
- Test: `src/pages/Analitico/linhaOperador.test.ts`

**Interfaces:**
- Consumes: `ResumoOperadorAnalitico` de `@/services/analitico/analitico.service`; `ResumoOperadorDiario` de `@/pages/Analitico/Diario/helpers`; `AnaliticoDashboardLinha` de `@/lib/supabase`; `rotuloDaForma` de `@/lib/formasPagamento`; `OperadorEquipeInfo` de `@/services/analitico/analitico.service`.
- Produces: `interface LinhaOperadorPainel`, `interface FatiaFormaOperador`, `deResumoAnalitico(resumos, linhas, equipeDe): LinhaOperadorPainel[]`, `deResumoDiario(resumos, equipeDe): LinhaOperadorPainel[]`, `fatiaDoGrupo(valor, totalDoGrupo): number`.

- [ ] **Step 1: Write the failing test**

```ts
// src/pages/Analitico/linhaOperador.test.ts
import { describe, it, expect } from 'vitest';
import { deResumoAnalitico, deResumoDiario, fatiaDoGrupo } from './linhaOperador';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';
import type { ResumoOperadorDiario } from '@/pages/Analitico/Diario/helpers';

const ANA = '11111111-1111-1111-1111-111111111111';
const BRU = '22222222-2222-2222-2222-222222222222';

const equipeDe = (id: string) =>
  id === ANA
    ? { equipe_id: 'eq-1', equipe_nome: 'Play 1', setor_id: 's-1' }
    : { equipe_id: null, equipe_nome: 'Sem equipe', setor_id: 's-1' };

describe('fatiaDoGrupo', () => {
  it('devolve a proporção', () => {
    expect(fatiaDoGrupo(250, 1000)).toBeCloseTo(0.25);
  });
  it('grupo zerado não divide por zero', () => {
    expect(fatiaDoGrupo(0, 0)).toBe(0);
  });
  it('valor negativo de ajuste manual vira zero na barra', () => {
    expect(fatiaDoGrupo(-100, 1000)).toBe(0);
  });
  it('nunca passa de 1', () => {
    expect(fatiaDoGrupo(1500, 1000)).toBe(1);
  });
});

describe('deResumoAnalitico', () => {
  const resumos: ResumoOperadorAnalitico[] = [
    { operador_id: ANA, operador_usuario: 'ana.silva', operador_nome: 'Ana Silva',
      total_recebido: 1000, total_ho: 300, total_pagamentos: 4, ajuste_manual: 200 },
  ];
  const linhas: AnaliticoDashboardLinha[] = [
    { dia: '2026-09-01', operador_id: ANA, forma_pagamento: 'boleto_pix',
      forma_detalhe: 'Pix', status_tabulacao: 'tabulado', total: 600, total_ho: 180, qtd: 2 },
    { dia: '2026-09-02', operador_id: ANA, forma_pagamento: 'cartao',
      forma_detalhe: null, status_tabulacao: 'tabulado', total: 400, total_ho: 120, qtd: 2 },
    { dia: '2026-09-02', operador_id: BRU, forma_pagamento: 'cartao',
      forma_detalhe: null, status_tabulacao: 'tabulado', total: 999, total_ho: 0, qtd: 1 },
  ];

  it('preenche o contrato a partir do resumo', () => {
    const [linha] = deResumoAnalitico(resumos, linhas, equipeDe);
    expect(linha).toMatchObject({
      operador_id: ANA, usuario: 'ana.silva', nome: 'Ana Silva',
      equipeId: 'eq-1', equipeNome: 'Play 1',
      valor: 1000, ho: 300, pagamentos: 4, novos: 0, ajusteManual: 200,
    });
  });

  it('quebra por forma usando o rótulo do ERP, da maior para a menor', () => {
    const [linha] = deResumoAnalitico(resumos, linhas, equipeDe);
    expect(linha.porForma).toEqual([
      { rotulo: 'Pix',    valor: 600 },
      { rotulo: 'Cartão', valor: 400 },
    ]);
  });

  it('ignora as linhas de outro operador na quebra por forma', () => {
    const [linha] = deResumoAnalitico(resumos, linhas, equipeDe);
    expect(linha.porForma.reduce((s, f) => s + f.valor, 0)).toBe(1000);
  });

  it('operador sem linhas no dashboard fica sem quebra, não quebra', () => {
    const [linha] = deResumoAnalitico(resumos, [], equipeDe);
    expect(linha.porForma).toEqual([]);
  });
});

describe('deResumoDiario', () => {
  const resumos: ResumoOperadorDiario[] = [
    { operadorId: BRU, usuario: 'bruno.lima', nome: 'Bruno Lima',
      total: 900, pix: 500, boleto: 300, cartao: 100,
      nAcordos: 6, nPagamentos: 8, novos: 3 },
  ];

  it('preenche o contrato e marca HO como ausente', () => {
    const [linha] = deResumoDiario(resumos, equipeDe);
    expect(linha).toMatchObject({
      operador_id: BRU, usuario: 'bruno.lima', nome: 'Bruno Lima',
      equipeId: null, equipeNome: 'Sem equipe',
      valor: 900, ho: null, pagamentos: 8, novos: 3,
    });
  });

  it('quebra por forma sai dos três subtotais, sem os zerados', () => {
    const [linha] = deResumoDiario(
      [{ ...resumos[0], boleto: 0 }], equipeDe,
    );
    expect(linha.porForma).toEqual([
      { rotulo: 'Pix',    valor: 500 },
      { rotulo: 'Cartão', valor: 100 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Analitico/linhaOperador.test.ts`
Expected: FAIL — `Failed to resolve import "./linhaOperador"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/pages/Analitico/linhaOperador.ts
/**
 * O contrato que a lista de operadores lê — e que as DUAS fontes preenchem.
 *
 * O Analítico e o Recebimento diário respondiam à mesma pergunta ("quanto cada
 * operador recebeu?") com duas telas escritas separado. Elas divergiram: a do
 * diário ganhou subtotal por forma, a do analítico ganhou ajuste manual, e
 * nenhuma das duas ganhou o que a outra tinha.
 *
 * Aqui as duas viram o mesmo formato, e a tela deixa de saber de onde o número
 * veio. O que a fonte não sabe dizer vem explícito: `ho: null` no diário, que
 * não tem a coluna, é diferente de `ho: 0`, que seria "não houve HO".
 */
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import type {
  ResumoOperadorAnalitico, OperadorEquipeInfo,
} from '@/services/analitico/analitico.service';
import type { ResumoOperadorDiario } from '@/pages/Analitico/Diario/helpers';
import { rotuloDaForma } from '@/lib/formasPagamento';

export interface FatiaFormaOperador {
  /** Rótulo do ERP — é a chave de `corDaForma` e `iconeDaForma`. */
  rotulo: string;
  valor: number;
}

export interface LinhaOperadorPainel {
  operador_id: string;
  usuario:     string;
  nome:        string | null;
  equipeId:    string | null;
  equipeNome:  string;
  valor:       number;
  /** `null` quando a fonte não tem a coluna (o diário). Não é o mesmo que 0. */
  ho:          number | null;
  pagamentos:  number;
  /** Acordos vindos na última importação do dia. Sempre 0 fora do recorte Dia. */
  novos:       number;
  porForma:    FatiaFormaOperador[];
  /** Quanto do valor veio de lançamento à mão. Pode ser negativo. */
  ajusteManual?: number;
}

/** Como a equipe de um operador é resolvida. Injetado para o módulo ficar puro. */
export type EquipeDeOperador = (id: string) => OperadorEquipeInfo | undefined;

/**
 * A fatia do operador dentro do grupo, para a barra da linha.
 *
 * Presa entre 0 e 1: ajuste manual pode deixar um operador negativo, e uma
 * barra negativa desenharia para fora da linha.
 */
export function fatiaDoGrupo(valor: number, totalDoGrupo: number): number {
  if (!totalDoGrupo || totalDoGrupo <= 0) return 0;
  return Math.min(1, Math.max(0, valor / totalDoGrupo));
}

function ordenarFatias(m: Map<string, number>): FatiaFormaOperador[] {
  return [...m.entries()]
    .filter(([, valor]) => valor !== 0)
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor);
}

function equipeOu(info: OperadorEquipeInfo | undefined) {
  return {
    equipeId:   info?.equipe_id ?? null,
    equipeNome: info?.equipe_nome ?? 'Sem equipe',
  };
}

/**
 * Recorte de mês e de período: o resumo vem da RPC
 * `fn_analitico_resumo_por_operador`, e a quebra por forma das linhas de
 * `fn_analitico_dashboard_mes` — a mesma fonte da aba Formas de pagamento.
 *
 * As linhas chegam JÁ filtradas pelo escopo e pela janela por quem chama; este
 * módulo não decide quem enxerga o quê.
 */
export function deResumoAnalitico(
  resumos: readonly ResumoOperadorAnalitico[],
  linhas: readonly AnaliticoDashboardLinha[],
  equipeDe: EquipeDeOperador,
): LinhaOperadorPainel[] {
  // O callback é anotado, não só a função: sem `strictNullChecks`, a anotação
  // de retorno daqui não alcança o literal lá dentro. Ver Global Constraints.
  const formasPorOperador = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    if (!l.operador_id) continue;
    const rotulo = rotuloDaForma(l.forma_pagamento, l.forma_detalhe);
    let m = formasPorOperador.get(l.operador_id);
    if (!m) { m = new Map(); formasPorOperador.set(l.operador_id, m); }
    m.set(rotulo, (m.get(rotulo) ?? 0) + (Number(l.total) || 0));
  }

  return resumos.map((r): LinhaOperadorPainel => ({
    operador_id: r.operador_id,
    usuario:     r.operador_usuario,
    nome:        r.operador_nome,
    ...equipeOu(equipeDe(r.operador_id)),
    valor:       r.total_recebido,
    ho:          r.total_ho,
    pagamentos:  r.total_pagamentos,
    novos:       0,
    porForma:    ordenarFatias(formasPorOperador.get(r.operador_id) ?? new Map()),
    ajusteManual: r.ajuste_manual,
  }));
}

/**
 * Recorte de dia: `agregarPorOperador` (Diario/helpers) já entregou tudo — os
 * três subtotais de forma e a contagem de novos. Aqui é só renomear.
 */
export function deResumoDiario(
  resumos: readonly ResumoOperadorDiario[],
  equipeDe: EquipeDeOperador,
): LinhaOperadorPainel[] {
  return resumos.map((r): LinhaOperadorPainel => {
    const m = new Map<string, number>([
      ['Pix',    r.pix],
      ['Boleto', r.boleto],
      ['Cartão', r.cartao],
    ]);
    return {
      operador_id: r.operadorId,
      usuario:     r.usuario,
      nome:        r.nome,
      ...equipeOu(equipeDe(r.operadorId)),
      valor:       r.total,
      ho:          null,
      pagamentos:  r.nPagamentos,
      novos:       r.novos,
      porForma:    ordenarFatias(m),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/Analitico/linhaOperador.test.ts`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Analitico/linhaOperador.ts src/pages/Analitico/linhaOperador.test.ts
git commit -m "feat(analitico): as duas fontes passam a falar o mesmo contrato

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `KpiTile` — o card de número do sistema

**Files:**
- Create: `src/components/KpiTile.tsx`
- Test: `src/components/KpiTile.test.tsx`

**Interfaces:**
- Consumes: `ValorAnimado` de `@/components/ValorAnimado`; `cn` de `@/lib/utils`.
- Produces: `KpiTile` com props `{ rotulo, valor, valorNumerico?, formatar?, sub?, Icon, tom, className? }`; `type TomKpi = 'primario' | 'neutro' | 'sucesso' | 'alerta'`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/KpiTile.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendingUp } from 'lucide-react';
import { KpiTile } from './KpiTile';

describe('KpiTile', () => {
  it('mostra rótulo, valor e subtítulo', () => {
    render(
      <KpiTile rotulo="Total recebido" valor="R$ 1.000,00"
        sub="inclui R$ 200,00 de ajuste" Icon={TrendingUp} tom="primario" />,
    );
    expect(screen.getByText('Total recebido')).toBeInTheDocument();
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
    expect(screen.getByText('inclui R$ 200,00 de ajuste')).toBeInTheDocument();
  });

  it('sem subtítulo não deixa parágrafo vazio', () => {
    const { container } = render(
      <KpiTile rotulo="Operadores" valor={23} Icon={TrendingUp} tom="neutro" />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/KpiTile.test.tsx`
Expected: FAIL — `Failed to resolve import "./KpiTile"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/KpiTile.tsx
/**
 * KpiTile — o card de número do sistema.
 *
 * O Analítico desenhava essa grade em quatro lugares, cada um com um `<Card>`
 * chapado escrito à mão. O padrão que o resto da plataforma adotou (Pix
 * Automático) tem profundidade: borda arredondada, fundo em gradiente sutil e o
 * ícone dentro de uma caixa tingida pelo tom do número. Aqui ele vira um
 * componente, para não haver uma quinta versão.
 *
 * `valorNumerico` liga a animação: o número anda até o novo valor em vez de
 * saltar. Sem ele o tile mostra `valor` como texto e fica parado — é o certo
 * para contagens, onde a animação seria ruído.
 */
import type { LucideIcon } from 'lucide-react';
import { ValorAnimado } from '@/components/ValorAnimado';
import { cn } from '@/lib/utils';

export type TomKpi = 'primario' | 'neutro' | 'sucesso' | 'alerta';

const TONS: Record<TomKpi, { caixa: string; fundo: string; valor: string }> = {
  primario: {
    caixa: 'bg-primary/12 text-primary ring-1 ring-primary/20',
    fundo: 'from-primary/[0.06] to-transparent border-primary/20',
    valor: 'text-primary',
  },
  neutro: {
    caixa: 'bg-muted text-muted-foreground ring-1 ring-border',
    fundo: 'from-muted/40 to-transparent border-border',
    valor: 'text-foreground',
  },
  sucesso: {
    caixa: 'bg-success/12 text-success ring-1 ring-success/20',
    fundo: 'from-success/[0.06] to-transparent border-success/20',
    valor: 'text-success',
  },
  alerta: {
    caixa: 'bg-warning/15 text-warning ring-1 ring-warning/25',
    fundo: 'from-warning/[0.07] to-transparent border-warning/25',
    valor: 'text-warning',
  },
};

interface KpiTileProps {
  rotulo: string;
  /** O que aparece quando não há animação. */
  valor: string | number;
  /** Presente = o número anda até o novo valor. Use com `formatar`. */
  valorNumerico?: number;
  formatar?: (v: number) => string;
  sub?: string;
  Icon: LucideIcon;
  tom: TomKpi;
  className?: string;
}

export function KpiTile({
  rotulo, valor, valorNumerico, formatar, sub, Icon, tom, className,
}: KpiTileProps) {
  const t = TONS[tom];
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br p-4 h-full', t.fundo, className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {rotulo}
          </p>
          {valorNumerico !== undefined && formatar ? (
            <ValorAnimado
              valor={valorNumerico} formatar={formatar}
              className={cn('block text-lg font-bold font-mono leading-tight mt-1 truncate', t.valor)}
            />
          ) : (
            <p className={cn('text-lg font-bold font-mono leading-tight mt-1 truncate', t.valor)}>
              {valor}
            </p>
          )}
          {sub && <p className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', t.caixa)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/KpiTile.test.tsx`
Expected: PASS, 2 testes.

- [ ] **Step 5: Commit**

```bash
git add src/components/KpiTile.tsx src/components/KpiTile.test.tsx
git commit -m "feat(ui): o card de numero do sistema vira um componente

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `AbasSegmentadas` — a régua de abas deixa de ser sublinhada

**Files:**
- Create: `src/components/AbasSegmentadas.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/utils`.
- Produces: `AbasSegmentadas<K extends string>` com props `{ abas: readonly { key: K; label: string; Icon: LucideIcon; badge?: number }[]; ativa: K | null; onTrocar: (k: K) => void; rotulo: string; className?: string }`. `rotulo` é obrigatório: vira o `aria-label` do grupo.

- [ ] **Step 1: Write the implementation**

Este componente não tem lógica própria — é o mesmo desenho do alternador
"Minha visão / Visão geral" que já existe em `Analitico/index.tsx:354`,
extraído para não ser copiado uma terceira vez. A verificação dele é o
typecheck e o olho na tela (Task 14).

```tsx
// src/components/AbasSegmentadas.tsx
/**
 * A régua de abas em grupo segmentado.
 *
 * A página Analítico tinha DOIS vocabulários de aba a 40px um do outro: o
 * alternador de visão, um grupo segmentado com fundo elevado no item ativo, e a
 * régua de abas logo abaixo, sublinhada com `border-b-2`. Os dois faziam a mesma
 * coisa — escolher entre opções mutuamente exclusivas — com desenhos que não se
 * pareciam.
 *
 * Este é o desenho que fica. O sublinhado sai.
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AbaSegmentada<K extends string> {
  key: K;
  label: string;
  Icon: LucideIcon;
  /** Contador ao lado do rótulo (ex.: nº de órfãos). Zero não desenha. */
  badge?: number;
}

interface AbasSegmentadasProps<K extends string> {
  abas: readonly AbaSegmentada<K>[];
  ativa: K | null;
  onTrocar: (k: K) => void;
  /**
   * O que este grupo escolhe — vira o `aria-label`. Obrigatório de propósito:
   * um componente compartilhado não sabe sozinho o que está selecionando, e um
   * grupo anônimo não ajuda ninguém.
   */
  rotulo: string;
  className?: string;
}

export function AbasSegmentadas<K extends string>({
  abas, ativa, onTrocar, rotulo, className,
}: AbasSegmentadasProps<K>) {
  if (abas.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1',
        'max-w-full overflow-x-auto',
        className,
      )}
    >
      {abas.map(({ key, label, Icon, badge }) => (
        <button
          key={key}
          type="button"
          aria-pressed={ativa === key}
          onClick={() => onTrocar(key)}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
            'whitespace-nowrap transition-colors',
            ativa === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
          )}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          {label}
          {!!badge && (
            <span className="rounded-full bg-warning/15 px-1.5 text-[10px] font-bold text-warning">
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/AbasSegmentadas.tsx
git commit -m "feat(ui): a regua de abas vira grupo segmentado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `SeletorRecorte` — o controle da lente

**Files:**
- Create: `src/pages/Analitico/SeletorRecorte.tsx`
- Test: `src/pages/Analitico/SeletorRecorte.test.tsx`

**Interfaces:**
- Consumes: `Recorte`, `ModoRecorte`, `trocarModo`, `deslocarRecorte`, `mesDoRecorte` de `./recorte`; `AbasSegmentadas` de `@/components/AbasSegmentadas`; `DatePickerField` de `@/components/DatePickerField`; `rotuloDoMes`, `primeiroDiaDoMes`, `ultimoDiaDoMes` de `@/lib/mesReferencia`; `getTodayISO` de `@/lib/index`.
- Produces: `SeletorRecorte` com props `{ recorte, onMudar: (r: Recorte) => void; podeVerDia: boolean }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/Analitico/SeletorRecorte.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeletorRecorte } from './SeletorRecorte';

describe('SeletorRecorte', () => {
  it('esconde o modo Dia de quem não tem a permissão', () => {
    render(
      <SeletorRecorte recorte={{ modo: 'mes', mes: '2026-09' }}
        onMudar={vi.fn()} podeVerDia={false} />,
    );
    expect(screen.queryByRole('button', { name: /Dia/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicar em Dia troca o recorte', () => {
    const onMudar = vi.fn();
    render(
      <SeletorRecorte recorte={{ modo: 'mes', mes: '2026-09' }}
        onMudar={onMudar} podeVerDia />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Dia/ }));
    expect(onMudar).toHaveBeenCalledWith(
      expect.objectContaining({ modo: 'dia' }),
    );
  });

  it('no modo mês a seta anterior recua um mês', () => {
    const onMudar = vi.fn();
    render(
      <SeletorRecorte recorte={{ modo: 'mes', mes: '2026-09' }}
        onMudar={onMudar} podeVerDia />,
    );
    fireEvent.click(screen.getByLabelText('Anterior'));
    expect(onMudar).toHaveBeenCalledWith({ modo: 'mes', mes: '2026-08' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Analitico/SeletorRecorte.test.tsx`
Expected: FAIL — `Failed to resolve import "./SeletorRecorte"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/pages/Analitico/SeletorRecorte.tsx
/**
 * O controle da lente: Mês · Dia · Período.
 *
 * Substitui dois controles que viviam em telas diferentes — o seletor de mês da
 * aba Analítico e o seletor de dia da aba Recebimento diário.
 *
 * O modo Dia só aparece para quem tem `analitico_sub_recebimento_diario`. Era a
 * chave que ligava a aba; hoje liga a lente, e continua querendo dizer a mesma
 * coisa: quem tem, vê o recebimento diário.
 */
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AbasSegmentadas } from '@/components/AbasSegmentadas';
import { DatePickerField } from '@/components/DatePickerField';
import { getTodayISO } from '@/lib/index';
import {
  primeiroDiaDoMes, ultimoDiaDoMes, rotuloDoMes,
} from '@/lib/mesReferencia';
import {
  deslocarRecorte, mesDoRecorte, trocarModo,
  type ModoRecorte, type Recorte,
} from './recorte';

interface SeletorRecorteProps {
  recorte: Recorte;
  onMudar: (r: Recorte) => void;
  /** `analitico_sub_recebimento_diario` — sem ela, não há modo Dia. */
  podeVerDia: boolean;
}

export function SeletorRecorte({ recorte, onMudar, podeVerDia }: SeletorRecorteProps) {
  const hoje = getTodayISO();
  const mes  = mesDoRecorte(recorte);

  const modos = ([
    { key: 'mes' as const,     label: 'Mês',     Icon: Calendar },
    ...(podeVerDia ? [{ key: 'dia' as const, label: 'Dia', Icon: CalendarDays }] : []),
    { key: 'periodo' as const, label: 'Período', Icon: CalendarRange },
  ]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <AbasSegmentadas<ModoRecorte>
        abas={modos}
        ativa={recorte.modo}
        rotulo="Recorte de tempo"
        onTrocar={m => onMudar(trocarModo(recorte, m, hoje))}
      />

      {recorte.modo !== 'periodo' && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Anterior"
            className="h-8 w-8 rounded-lg"
            onClick={() => onMudar(deslocarRecorte(recorte, -1))}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="min-w-[136px] text-center text-sm font-semibold tabular-nums">
            {recorte.modo === 'mes'
              ? rotuloDoMes(recorte.mes)
              : new Date(recorte.dia + 'T12:00:00').toLocaleDateString('pt-BR', {
                  weekday: 'short', day: '2-digit', month: 'short',
                })}
          </span>
          <Button variant="outline" size="icon" aria-label="Próximo"
            className="h-8 w-8 rounded-lg"
            disabled={recorte.modo === 'dia' && recorte.dia >= hoje}
            onClick={() => onMudar(deslocarRecorte(recorte, 1))}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-muted-foreground"
            onClick={() => onMudar(
              recorte.modo === 'dia'
                ? { modo: 'dia', dia: hoje }
                : { modo: 'mes', mes: hoje.slice(0, 7) },
            )}>
            {recorte.modo === 'dia' ? 'Hoje' : 'Mês atual'}
          </Button>
        </div>
      )}

      {recorte.modo === 'periodo' && (
        <div className="flex items-center gap-1.5">
          <DatePickerField
            value={recorte.inicio}
            onChange={v => onMudar({ ...recorte, inicio: v })}
            placeholder="Data início" triggerClassName="w-32 rounded-lg"
            minDate={primeiroDiaDoMes(mes)} maxDate={recorte.fim || ultimoDiaDoMes(mes)}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePickerField
            value={recorte.fim}
            onChange={v => onMudar({ ...recorte, fim: v })}
            placeholder="Data fim" triggerClassName="w-32 rounded-lg"
            minDate={recorte.inicio || primeiroDiaDoMes(mes)} maxDate={ultimoDiaDoMes(mes)}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/Analitico/SeletorRecorte.test.tsx`
Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Analitico/SeletorRecorte.tsx src/pages/Analitico/SeletorRecorte.test.tsx
git commit -m "feat(analitico): mes, dia e periodo passam a ser um controle so

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `ListaOperadores` — a lista que não sabe de onde o número veio

**Files:**
- Create: `src/pages/Analitico/ListaOperadores.tsx`
- Test: `src/pages/Analitico/ListaOperadores.test.tsx`

**Interfaces:**
- Consumes: `LinhaOperadorPainel`, `fatiaDoGrupo` de `./linhaOperador`; `corDaForma` de `@/lib/formasPagamento`; `formatBRL` de `@/lib/money`; `Avatar`, `AvatarFallback`, `AvatarImage` de `@/components/ui/avatar`.
- Produces: `ListaOperadores` com props `{ grupos: GrupoOperadores[]; mostrarHO: boolean; fotos: Record<string, string | null>; expandidos: Set<string>; onToggle: (id: string) => void; renderExpandido: (l: LinhaOperadorPainel) => ReactNode; acoesDaLinha?: (l: LinhaOperadorPainel) => ReactNode }`; `interface GrupoOperadores { equipeId: string | null; equipeNome: string; itens: LinhaOperadorPainel[] }`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/Analitico/ListaOperadores.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListaOperadores } from './ListaOperadores';
import type { LinhaOperadorPainel } from './linhaOperador';

const ana: LinhaOperadorPainel = {
  operador_id: 'a', usuario: 'ana.silva', nome: 'Ana Silva',
  equipeId: 'eq-1', equipeNome: 'Play 1',
  valor: 750, ho: 200, pagamentos: 4, novos: 0,
  porForma: [{ rotulo: 'Pix', valor: 750 }],
};
const bruno: LinhaOperadorPainel = {
  operador_id: 'b', usuario: 'bruno.lima', nome: 'Bruno Lima',
  equipeId: 'eq-1', equipeNome: 'Play 1',
  valor: 250, ho: 50, pagamentos: 2, novos: 3,
  porForma: [{ rotulo: 'Cartão', valor: 250 }],
};
const grupos = [{ equipeId: 'eq-1', equipeNome: 'Play 1', itens: [ana, bruno] }];

describe('ListaOperadores', () => {
  it('desenha o nome da equipe e os operadores', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={vi.fn()} renderExpandido={() => null} />,
    );
    expect(screen.getByText('Play 1')).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
  });

  it('a barra mede a fatia dentro da equipe, não da empresa', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={vi.fn()} renderExpandido={() => null} />,
    );
    expect(screen.getByTestId('barra-a')).toHaveStyle({ width: '75%' });
    expect(screen.getByTestId('barra-b')).toHaveStyle({ width: '25%' });
  });

  it('a contagem de novos só aparece quando existe', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={vi.fn()} renderExpandido={() => null} />,
    );
    expect(screen.getByText('+3 novos')).toBeInTheDocument();
    expect(screen.queryByText('+0 novos')).not.toBeInTheDocument();
  });

  it('clicar na linha avisa quem abre', () => {
    const onToggle = vi.fn();
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set()} onToggle={onToggle} renderExpandido={() => null} />,
    );
    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('só o expandido renderiza o conteúdo de dentro', () => {
    render(
      <ListaOperadores grupos={grupos} mostrarHO fotos={{}}
        expandidos={new Set(['a'])} onToggle={vi.fn()}
        renderExpandido={l => <div>detalhe de {l.usuario}</div>} />,
    );
    expect(screen.getByText('detalhe de ana.silva')).toBeInTheDocument();
    expect(screen.queryByText('detalhe de bruno.lima')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/pages/Analitico/ListaOperadores.test.tsx`
Expected: FAIL — `Failed to resolve import "./ListaOperadores"`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/pages/Analitico/ListaOperadores.tsx
/**
 * A lista de operadores — uma só, para as duas fontes.
 *
 * Ela recebe `LinhaOperadorPainel` e não sabe se o número veio do relatório
 * mensal ou do diário. Foi assim que a segunda tela deixou de precisar existir.
 *
 * ## Por que a barra mede a EQUIPE
 *
 * A pergunta que o líder faz olhando esta lista é "quem carrega o grupo", e o
 * grupo em que o operador está desenhado é a equipe. Medir contra a empresa
 * daria barras de 3% para todo mundo — verdadeiro e inútil.
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { corDaForma } from '@/lib/formasPagamento';
import { formatBRL } from '@/lib/money';
import { cn } from '@/lib/utils';
import { fatiaDoGrupo, type LinhaOperadorPainel } from './linhaOperador';

export interface GrupoOperadores {
  equipeId: string | null;
  equipeNome: string;
  itens: LinhaOperadorPainel[];
}

interface ListaOperadoresProps {
  grupos: GrupoOperadores[];
  mostrarHO: boolean;
  /** operador_id → foto_url. Ausente = iniciais. */
  fotos: Record<string, string | null>;
  expandidos: Set<string>;
  onToggle: (operadorId: string) => void;
  renderExpandido: (l: LinhaOperadorPainel) => ReactNode;
  /** Botões à direita da linha (ex.: "Tirar da equipe"). */
  acoesDaLinha?: (l: LinhaOperadorPainel) => ReactNode;
}

function iniciais(nome: string | null, usuario: string): string {
  const base = (nome ?? usuario).trim();
  const partes = base.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function ListaOperadores({
  grupos, mostrarHO, fotos, expandidos, onToggle, renderExpandido, acoesDaLinha,
}: ListaOperadoresProps) {
  return (
    <div className="space-y-5">
      {grupos.map(grupo => {
        const totalDoGrupo = grupo.itens.reduce((s, l) => s + Math.max(0, l.valor), 0);
        return (
          <div key={grupo.equipeId ?? '__sem__'} className="space-y-1.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {grupo.equipeNome}
              </span>
              <div className="h-px flex-1 bg-border" />
              <span className="font-mono text-xs text-muted-foreground">
                {formatBRL(totalDoGrupo)}
              </span>
            </div>

            {grupo.itens.map(l => {
              const aberto = expandidos.has(l.operador_id);
              const fatia  = fatiaDoGrupo(l.valor, totalDoGrupo);
              return (
                <div key={l.operador_id}
                  className={cn(
                    'rounded-xl border border-border bg-card overflow-hidden transition-colors',
                    aberto && 'border-primary/30',
                  )}
                >
                  <div
                    role="button" tabIndex={0}
                    onClick={() => onToggle(l.operador_id)}
                    onKeyDown={e => { if (e.key === 'Enter') onToggle(l.operador_id); }}
                    className="flex cursor-pointer select-none items-center gap-3 px-3 py-2.5 hover:bg-accent/40"
                  >
                    {aberto
                      ? <ChevronDown  className="w-4 h-4 shrink-0 text-muted-foreground" />
                      : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}

                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={fotos[l.operador_id] ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px] font-semibold">
                        {iniciais(l.nome, l.usuario)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">
                        {l.nome ?? l.usuario}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate font-mono text-[11px] text-muted-foreground">
                          {l.usuario}
                        </span>
                        {l.porForma.map(f => (
                          <span key={f.rotulo}
                            title={`${f.rotulo}: ${formatBRL(f.valor)}`}
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                          >
                            <span className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: corDaForma(f.rotulo) }} />
                            {f.rotulo}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="hidden w-28 shrink-0 sm:block">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div data-testid={`barra-${l.operador_id}`}
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${(fatia * 100).toFixed(0)}%` }} />
                      </div>
                      <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                        {(fatia * 100).toFixed(0)}% da equipe
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-primary leading-tight">
                        {formatBRL(l.valor)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.pagamentos} pgto.
                        {mostrarHO && l.ho !== null && <> · HO {formatBRL(l.ho)}</>}
                        {l.novos > 0 && (
                          <span className="ml-1 font-semibold text-primary">+{l.novos} novos</span>
                        )}
                      </p>
                    </div>

                    {acoesDaLinha && (
                      <div className="shrink-0" onClick={e => e.stopPropagation()}>
                        {acoesDaLinha(l)}
                      </div>
                    )}
                  </div>

                  {aberto && (
                    <div className="border-t border-border">{renderExpandido(l)}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/pages/Analitico/ListaOperadores.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Analitico/ListaOperadores.tsx src/pages/Analitico/ListaOperadores.test.tsx
git commit -m "feat(analitico): a lista de operadores passa a servir as duas fontes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `FaixaPulso` — o que só o diário sabe

**Files:**
- Create: `src/pages/Analitico/FaixaPulso.tsx`

**Interfaces:**
- Consumes: `formatBRL` de `@/lib/money`. Só isso — as classes são todas estáticas, então **não** importe `cn`: o ESLint reprova import sem uso.
- Produces: `FaixaPulso` com props `{ importacao: number; novos: number; valorIgnorado: number; qtdIgnorados: number; importadoEm: string | null }`.

- [ ] **Step 1: Write the implementation**

```tsx
// src/pages/Analitico/FaixaPulso.tsx
/**
 * A faixa de pulso do recorte Dia.
 *
 * É a razão de o Recebimento diário ter existido como aba: o relatório é
 * importado várias vezes ao dia, e sem `import_index` ninguém sabe o que entrou
 * na última rodada. Os ignorados (próximo contato ≤ data do pagamento) somam no
 * total e saem das listas — dizer isso em voz alta evita a pergunta "por que a
 * soma da lista não bate com o card".
 *
 * A aba morreu; a faixa não.
 */
import { Sparkles, EyeOff, RefreshCw } from 'lucide-react';
import { formatBRL } from '@/lib/money';

interface FaixaPulsoProps {
  /** Nº da última importação do dia (`import_index`). 1 = primeira do dia. */
  importacao: number;
  novos: number;
  valorIgnorado: number;
  qtdIgnorados: number;
  /** ISO da última importação; null enquanto não se sabe. */
  importadoEm: string | null;
}

export function FaixaPulso({
  importacao, novos, valorIgnorado, qtdIgnorados, importadoEm,
}: FaixaPulsoProps) {
  // O fuso é fixado, não herdado da máquina — ver Global Constraints.
  const hora = importadoEm
    ? new Date(importadoEm).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-xs">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 text-primary/70" />
        <span className="text-muted-foreground">Recebimento vivo · importação</span>
        <strong className="text-foreground">nº {importacao}</strong>
        {hora && <span className="text-muted-foreground">· {hora}</span>}
      </span>

      {importacao >= 2 && (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary" />
          <strong className="text-primary">{novos}</strong>
          <span className="text-muted-foreground">
            acordo{novos !== 1 ? 's' : ''} novo{novos !== 1 ? 's' : ''} no último relatório
          </span>
        </span>
      )}

      {qtdIgnorados > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs"
          title="Próximo contato anterior ou igual ao pagamento. O valor soma no total do dia e fica fora das listas.">
          <EyeOff className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <strong className="font-mono text-foreground">{formatBRL(valorIgnorado)}</strong>
          <span className="text-muted-foreground">
            em {qtdIgnorados} acordo{qtdIgnorados !== 1 ? 's' : ''} ignorado{qtdIgnorados !== 1 ? 's' : ''}
          </span>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Analitico/FaixaPulso.tsx
git commit -m "feat(analitico): o pulso do dia sobrevive ao fim da aba diario

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: A página passa a falar em recorte

**Files:**
- Modify: `src/pages/Analitico/index.tsx`

**Interfaces:**
- Consumes: `Recorte`, `recorteDaQuery`, `queryDoRecorte`, `mesDoRecorte` de `./recorte`; `SeletorRecorte` de `./SeletorRecorte`; `AbasSegmentadas` de `@/components/AbasSegmentadas`.
- Produces: `AnaliticoLider` e `AnaliticoOperador` passam a receber a prop `recorte: Recorte` no lugar de `mes: string`. `AbaDiario` deixa de ser renderizada.

- [ ] **Step 1: Trocar o estado de mês pelo estado de recorte**

Em `src/pages/Analitico/index.tsx`, substituir o bloco do `useMesGlobal`
(linha ~140) por:

```tsx
  // O mês do sistema inteiro (`MesProvider`) continua sendo a memória entre
  // páginas; o recorte é a janela DESTA tela, e nasce dele ou da URL.
  const { mes: mesFiltro, setMes: setMesFiltro } = useMesGlobal();
  const [recorte, setRecorteInterno] = useState<Recorte>(
    () => recorteDaQuery(searchParams, getTodayISO()) ?? { modo: 'mes', mes: mesFiltro },
  );

  /*
   * Trocar de recorte devolve o mês ao provider — sem isto, ir para o Painel
   * Líder depois de olhar agosto no Analítico voltaria para setembro.
   */
  const setRecorte = useCallback((r: Recorte) => {
    setRecorteInterno(r);
    const m = mesDoRecorte(r);
    if (m !== mesFiltro) setMesFiltro(m);
  }, [mesFiltro, setMesFiltro]);
```

- [ ] **Step 2: Tirar a aba Diário da régua e traduzir o link antigo**

Substituir a lista `abasPrincipais` (linha ~112) por:

```tsx
  const abasPrincipais = useMemo(() => ([
    { key: 'analitico', label: 'Analítico', Icon: BarChart2, permissao: 'analitico_sub_analitico', extra: true },
    // A aba "Recebimento diário" virou o recorte Dia da lente, acima. A chave
    // `analitico_sub_recebimento_diario` continua existindo e continua querendo
    // dizer a mesma coisa — ela agora libera o recorte, não uma aba.
    { key: 'colchao',  label: 'Colchão',  Icon: Layers3, permissao: 'analitico_sub_colchao', extra: !tenant.isPaguePlay },
    { key: 'desafios', label: 'Desafios', Icon: Trophy,  permissao: 'analitico_sub_desafios', extra: desafiosNoMeuSetor },
  ] as const).filter(a => a.extra && temPermissao(a.permissao)),
  [temPermissao, desafiosNoMeuSetor, tenant.isPaguePlay]);
```

E substituir o `useEffect` de `abaDaUrl` (linha ~85) por:

```tsx
  /*
   * `?aba=diario` é o link das notificações de importação do diário já
   * enviadas. Ele não pode quebrar: vira a aba Analítico no recorte de dia.
   */
  useEffect(() => {
    if (abaDaUrl === 'diario') {
      setAbaPrincipal('analitico');
      const r = recorteDaQuery(searchParams, getTodayISO());
      if (r) setRecorte(r);
      return;
    }
    if (abaDaUrl === 'analitico') setAbaPrincipal('analitico');
    if (abaDaUrl === 'colchao')   setAbaPrincipal('colchao');
    if (abaDaUrl === 'desafios')  setAbaPrincipal('desafios');
  }, [abaDaUrl, searchParams, setRecorte]);
```

Trocar o tipo do estado `abaPrincipal` para `'analitico' | 'colchao' | 'desafios'`
e remover `'diario'` do inicializador.

- [ ] **Step 3: Trocar o seletor de mês pelo `SeletorRecorte`**

Substituir todo o bloco `{/* Seletor de mês + filtro de setor */}` (linha ~407)
até o fechamento da `div` do mês por:

```tsx
      {/* Lente + filtro de setor */}
      <div className="flex items-center gap-4 flex-wrap">
        {abaVisivel !== 'desafios' && (
          <SeletorRecorte
            recorte={recorte}
            onMudar={setRecorte}
            podeVerDia={temPermissao('analitico_sub_recebimento_diario')}
          />
        )}
```

O filtro de setor logo abaixo fica como está, mas com o `<select>` trocado:

```tsx
        {podeVerSetor && veTodosSetores && setores.length > 0 && (
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={filtroSetorId ?? '__todos__'}
              onValueChange={v => setFiltroSetorId(v === '__todos__' ? null : v)}>
              <SelectTrigger className="h-8 w-44 rounded-lg text-xs">
                <SelectValue placeholder="Todos os setores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todos os setores</SelectItem>
                {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
```

Adicionar o import: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';`

- [ ] **Step 4: Trocar a régua de abas e passar o recorte adiante**

Substituir o bloco de botões de aba (linha ~380) por:

```tsx
      <AbasSegmentadas
        abas={abasPrincipais.map(({ key, label, Icon }) => ({ key, label, Icon }))}
        ativa={abaVisivel}
        rotulo="Seção do Analítico"
        onTrocar={setAbaPrincipal}
      />
```

Trocar `mes={mesFiltro}` por `recorte={recorte}` nas chamadas de
`<AnaliticoOperador>` e `<AnaliticoLider>`. `ValidacaoRelatorioSetor` e
`AbaColchao` continuam recebendo `mes={mesDoRecorte(recorte)}`.

Remover o bloco `{abaVisivel === 'diario' && <AbaDiario … />}` e o import de
`AbaDiario`.

- [ ] **Step 5: Verificar que compila**

Run: `npm run typecheck`
Expected: erros APENAS em `AnaliticoLider.tsx` e `AnaliticoOperador.tsx`, que
ainda esperam `mes: string`. Eles são as próximas duas tarefas.

- [ ] **Step 6: Commit**

Este commit deixa o typecheck vermelho de propósito — as duas telas ainda não
mudaram de prop. Commit mesmo assim, para a Task 9 partir de uma base pequena:

```bash
git add src/pages/Analitico/index.tsx
git commit -m "refactor(analitico): a pagina passa a falar em recorte, nao em mes

A aba Recebimento diario sai da regua. A chave
analitico_sub_recebimento_diario passa a liberar o recorte Dia. Links
?aba=diario ja enviados continuam caindo no lugar certo.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: `AnaliticoOperador` na estética nova

**Files:**
- Modify: `src/pages/Dashboard/Analitico/AnaliticoOperador.tsx`

**Interfaces:**
- Consumes: `KpiTile` de `@/components/KpiTile`; `AbasSegmentadas` de `@/components/AbasSegmentadas`; `DatePickerField` de `@/components/DatePickerField`; `Recorte`, `intervaloDoRecorte`, `mesDoRecorte` de `@/pages/Analitico/recorte`.
- Produces: a prop `mes: string` vira `recorte: Recorte`.

- [ ] **Step 1: Trocar a prop e derivar o mês**

Na interface `AnaliticoOperadorProps`, trocar `mes: string;` por
`recorte: Recorte;`. No corpo, logo após `const tenant = useTenant();`:

```tsx
  const mes = mesDoRecorte(recorte);
  const { inicio: pisoDoRecorte, fim: tetoDoRecorte } = intervaloDoRecorte(recorte);
```

Trocar as três referências a `mes` no `carregarRanking` — elas já usam a
variável derivada, nada mais a fazer.

- [ ] **Step 2: Trocar os `<input type="date">` por `DatePickerField`**

Substituir o bloco do filtro de data (linhas 158-181) por:

```tsx
            <div className="flex items-center gap-1.5 flex-wrap">
              <CalendarDays className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Período:</span>
              <DatePickerField
                value={filtroInicio} onChange={setFiltroInicio}
                placeholder="Data início" triggerClassName="w-32 rounded-lg"
                minDate={pisoDoRecorte} maxDate={filtroFim || tetoDoRecorte}
              />
              <span className="text-xs text-muted-foreground">até</span>
              <DatePickerField
                value={filtroFim} onChange={setFiltroFim}
                placeholder="Data fim" triggerClassName="w-32 rounded-lg"
                minDate={filtroInicio || pisoDoRecorte} maxDate={tetoDoRecorte}
              />
              {(filtroInicio || filtroFim) && (
                <>
                  <Button size="sm" variant="ghost"
                    className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
                    onClick={limparFiltro}>
                    <X className="w-3 h-3" /> Limpar
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {dadosFiltrados.length} de {dados.length} registros
                  </span>
                </>
              )}
            </div>
```

- [ ] **Step 3: Trocar os três cards por `KpiTile`**

Substituir o bloco `{/* Resumo */}` (linhas 186-211) por:

```tsx
            <div className={cn('grid gap-3', mostrarHO ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
              <KpiTile
                rotulo="Total recebido" Icon={TrendingUp} tom="primario"
                valor={formatBRL(totalRecebido)}
                valorNumerico={totalRecebido} formatar={formatBRL}
              />
              {mostrarHO && (
                <KpiTile
                  rotulo="Total HO" Icon={CreditCard} tom="neutro"
                  valor={formatBRL(totalHO)}
                  valorNumerico={totalHO} formatar={formatBRL}
                />
              )}
              <div className="rounded-xl border border-success/20 bg-gradient-to-br from-success/[0.06] to-transparent p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Tabulados
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold leading-tight text-success">
                      {tabulados}<span className="text-muted-foreground">/{dadosFiltrados.length}</span>
                    </p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success ring-1 ring-success/20">
                    <ListChecks className="h-4 w-4" />
                  </div>
                </div>
                {/* A fração exige conta de cabeça; a barra, não. */}
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success transition-[width]"
                    style={{
                      width: dadosFiltrados.length
                        ? `${((tabulados / dadosFiltrados.length) * 100).toFixed(0)}%`
                        : '0%',
                    }} />
                </div>
              </div>
            </div>
```

Adicionar aos imports de `lucide-react`: `TrendingUp`, `CreditCard`.
Adicionar: `import { KpiTile } from '@/components/KpiTile';` e
`import { DatePickerField } from '@/components/DatePickerField';`.

- [ ] **Step 4: O tile de posição no ranking**

O operador só descobre onde está trocando de aba. O dado já está carregado
quando ele tem `analitico_sub_ranking` — o tile só o traz para a frente.

Acima do `return`, carregar o ranking também na aba "meus" (hoje ele só carrega
na aba "ranking") e derivar a posição:

```tsx
  // A posição já é sabida por quem tem o ranking; mostrá-la custa nada e evita
  // a viagem à outra aba só para responder "onde eu estou?".
  useEffect(() => {
    if (podeVerRanking && ranking.length === 0) void carregarRanking();
  }, [podeVerRanking, ranking.length, carregarRanking]);

  const minhaPosicao = useMemo(() => {
    if (!podeVerRanking || ranking.length === 0) return null;
    const visiveis = ranking
      .filter(r => !operadoresOcultos.has(r.operador_id))
      .sort((a, b) => b.total_recebido - a.total_recebido);
    const i = visiveis.findIndex(r => r.operador_id === operadorId);
    if (i < 0) return null;
    return {
      posicao: i + 1,
      de:      visiveis.length,
      // Quanto falta para o degrau de cima. `null` no primeiro lugar.
      faltam:  i === 0 ? null : visiveis[i - 1].total_recebido - visiveis[i].total_recebido,
    };
  }, [podeVerRanking, ranking, operadoresOcultos, operadorId]);
```

E, logo abaixo da grade de tiles do Step 3:

```tsx
            {minhaPosicao && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-gradient-to-br from-muted/40 to-transparent px-3 py-2">
                <Trophy className="w-4 h-4 shrink-0 text-warning" />
                <span className="text-xs text-muted-foreground">Sua posição no mês:</span>
                <strong className="font-mono text-sm text-foreground">
                  {minhaPosicao.posicao}º
                </strong>
                <span className="text-xs text-muted-foreground">de {minhaPosicao.de}</span>
                {minhaPosicao.faltam !== null && (
                  <span className="text-xs text-muted-foreground">
                    · faltam{' '}
                    <strong className="font-mono text-foreground">
                      {formatBRL(minhaPosicao.faltam)}
                    </strong>{' '}
                    para o {minhaPosicao.posicao - 1}º
                  </span>
                )}
              </div>
            )}
```

- [ ] **Step 5: O tile "Hoje", no recorte Dia**

No recorte Dia, `dados` já chega recortado por quem chama — o tile só nomeia o
recorte, para o operador não ler "Total recebido" achando que é o mês:

```tsx
              <KpiTile
                rotulo={recorte.modo === 'dia' ? 'Recebido no dia' : 'Total recebido'}
                Icon={TrendingUp} tom="primario"
                valor={formatBRL(totalRecebido)}
                valorNumerico={totalRecebido} formatar={formatBRL}
                sub={recorte.modo === 'dia' ? 'Recebimento vivo' : undefined}
              />
```

Trocar o primeiro `KpiTile` do Step 3 por este.

- [ ] **Step 6: Trocar a régua de abas interna**

Substituir o bloco de abas (linhas 121-139) por:

```tsx
      <AbasSegmentadas<'meus' | 'ranking'>
        abas={[
          { key: 'meus', label: 'Meus recebimentos', Icon: ListChecks },
          ...(podeVerRanking ? [{ key: 'ranking' as const, label: 'Ranking', Icon: Trophy }] : []),
        ]}
        ativa={abaOp}
        onTrocar={setAbaOp}
        rotulo="Visão do operador"
      />
```

Adicionar: `import { AbasSegmentadas } from '@/components/AbasSegmentadas';`.

- [ ] **Step 7: Arredondar a tabela**

Na `<Card className="border-border">` que envolve a tabela (linha ~215),
trocar por `<div className="overflow-hidden rounded-xl border border-border">`
e fechar com `</div>`, removendo o `<CardContent className="p-0">`. No
`<thead>`, trocar a classe da `<tr>` para
`"sticky top-0 z-10 border-b border-border bg-muted/60 backdrop-blur"`.

- [ ] **Step 8: Verificar**

Run: `npm run typecheck && npm test -- src/pages/Dashboard/Analitico`
Expected: typecheck sem erro neste arquivo; testes existentes verdes.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Dashboard/Analitico/AnaliticoOperador.tsx
git commit -m "feat(analitico): a visao do operador entra no padrao da plataforma

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: `AnaliticoLider` — casca nova, recorte de mês

**Files:**
- Modify: `src/pages/Dashboard/Analitico/AnaliticoLider.tsx`

**Interfaces:**
- Consumes: `KpiTile`, `AbasSegmentadas`, `DatePickerField`, `ListaOperadores`, `deResumoAnalitico`, `Recorte`, `intervaloDoRecorte`, `mesDoRecorte`, `useAnaliticoDashboard`.
- Produces: a prop `mes: string` vira `recorte: Recorte`. A aba "Por operador" passa a renderizar `ListaOperadores`.

Nesta tarefa a lista muda de desenho **mantendo a fonte de hoje** (o mês). O
recorte de dia entra na Task 11 — separar as duas mantém cada commit revisável.

- [ ] **Step 1: Trocar a prop e buscar as fotos**

Na interface, trocar `mes: string;` por `recorte: Recorte;`. No corpo:

```tsx
  const mes = mesDoRecorte(recorte);
  const { inicio: pisoDoRecorte, fim: tetoDoRecorte } = intervaloDoRecorte(recorte);

  /*
   * Fotos dos operadores visíveis. A RPC do resumo não devolve `foto_url` e a
   * regra do projeto proíbe mexer no banco, então vem numa consulta só, com
   * `.in()` — não uma por linha.
   */
  const [fotos, setFotos] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const ids = resumos.map(r => r.operador_id).filter(Boolean);
    if (ids.length === 0) { setFotos({}); return; }
    let vivo = true;
    void supabase
      .from('perfis')
      .select('id, foto_url')
      .in('id', ids)
      .then(({ data }) => {
        if (!vivo) return;
        const m: Record<string, string | null> = {};
        for (const p of ((data ?? []) as { id: string; foto_url: string | null }[])) {
          m[p.id] = p.foto_url;
        }
        setFotos(m);
      });
    return () => { vivo = false; };
  }, [resumos]);
```

- [ ] **Step 2: Trocar a grade de cards por `KpiTile`**

Substituir o bloco `{/* ── Cards de resumo mensal ── */}` (linha 678) até o
fechamento da grade por:

```tsx
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', mostrarHO ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        {loadingSnapshot ? (
          Array.from({ length: mostrarHO ? 5 : 4 }).map((_, i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-xl bg-muted" />
          ))
        ) : metricas ? (
          <>
            <KpiTile rotulo="Total recebido" Icon={TrendingUp} tom="primario"
              valor={formatBRL(metricas.totalRecebido)}
              valorNumerico={metricas.totalRecebido} formatar={formatBRL} />
            {mostrarHO && (
              <KpiTile rotulo="Total HO" Icon={CreditCard} tom="neutro"
                valor={formatBRL(metricas.totalHo)}
                valorNumerico={metricas.totalHo} formatar={formatBRL} />
            )}
            <KpiTile rotulo="Operadores" Icon={Users} tom="neutro"
              valor={metricas.totalOperadores} />
            <KpiTile rotulo="Acordos pagos" Icon={BarChart3} tom="neutro"
              valor={metricas.totalPagamentos.toLocaleString('pt-BR')} />
            <KpiTile rotulo="Período" Icon={Calendar} tom="neutro"
              valor={
                metricas.periodoInicio && metricas.periodoFim
                  ? `${new Date(metricas.periodoInicio + 'T12:00:00').toLocaleDateString('pt-BR')}`
                    + ` – ${new Date(metricas.periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')}`
                  : '—'
              }
              className="[&_p:nth-child(2)]:text-sm" />
          </>
        ) : (
          <div className="col-span-full py-4 text-center text-xs text-muted-foreground">
            Nenhum dado importado para este mês.
          </div>
        )}
      </div>
```

Adicionar: `import { KpiTile } from '@/components/KpiTile';`.

- [ ] **Step 3: Trocar a régua de abas interna**

Substituir o `<div className="flex items-center gap-1 border-b border-border …">`
com os botões (linha ~782) por:

```tsx
        <AbasSegmentadas
          abas={abasInternas.map(({ key, label, Icon }) => ({
            key, label, Icon,
            badge: key === 'orfaos' ? orfaos.length : undefined,
          }))}
          ativa={abaVisivel}
          onTrocar={setAbaAtiva}
          rotulo="Detalhamento do Analítico"
        />
```

E arredondar os dois botões de ação ao lado: acrescentar `rounded-lg` às
classes de "Limpar mês" e "Importar relatório".

- [ ] **Step 4: Trocar a aba "Por operador" por `ListaOperadores`**

Substituir o bloco `{abaVisivel === 'operadores' && (…)}` (linhas 820-1000)
pelo seguinte. O conteúdo expandido (filtro de data + tabela) sai para uma
função local `detalheDoOperador`, que recebe a linha:

```tsx
      {abaVisivel === 'operadores' && (
        <div className="space-y-5">
          {loadingResumos && (
            <div className="animate-pulse space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-muted" />
              ))}
            </div>
          )}
          {!loadingResumos && gruposDoPainel.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              Nenhum dado para este recorte.
            </div>
          )}
          {!loadingResumos && gruposDoPainel.length > 0 && (
            <ListaOperadores
              grupos={gruposDoPainel}
              mostrarHO={mostrarHO}
              fotos={fotos}
              expandidos={expandidos}
              onToggle={id => void toggleExpandido(id)}
              renderExpandido={detalheDoOperador}
              acoesDaLinha={l => (
                transferidos[l.operador_id] && temPermissaoImportar ? (
                  <Button size="sm" variant="ghost"
                    className="h-7 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-destructive"
                    disabled={fantasmasTirados.has(l.operador_id)}
                    onClick={() => setConfirmandoFantasma({
                      perfilId: l.operador_id,
                      nome: l.nome ?? l.usuario,
                      equipeNome: l.equipeNome,
                    })}>
                    Tirar da equipe
                  </Button>
                ) : null
              )}
            />
          )}
        </div>
      )}
```

Acima do `return`, o memo que monta os grupos no contrato novo:

```tsx
  /*
   * Os grupos que a lista desenha, já no contrato único.
   *
   * `agruparPorEquipe` continua sendo quem decide QUEM aparece em qual equipe —
   * é ela que sabe de clone, de setor e de "sem equipe", e tem teste próprio.
   * Aqui só se converte o resultado dela para `LinhaOperadorPainel`.
   */
  const gruposDoPainel = useMemo<GrupoOperadores[]>(() => {
    const equipeDe = (id: string) => operadorEquipeMap[id];
    return resumosPorEquipe.map(g => ({
      equipeId:   g.equipeId,
      equipeNome: g.equipeNome,
      // A equipe da linha é a do GRUPO em que ela está desenhada, não a de
      // origem: um operador clonado aparece sob a equipe do clone, e é essa que
      // o aviso de "tirar da equipe" precisa nomear.
      itens: deResumoAnalitico(g.items, linhasDashboard, equipeDe)
        .map((it): LinhaOperadorPainel => ({
          ...it, equipeId: g.equipeId, equipeNome: g.equipeNome,
        })),
    }));
  }, [resumosPorEquipe, linhasDashboard, operadorEquipeMap]);
```

Onde `linhasDashboard` vem do hook que a aba irmã já usa:

```tsx
  // Quebra por forma de cada operador. Mesma fonte da aba Formas de pagamento —
  // a RPC do resumo não traz forma, e não vamos criar uma que traga.
  // A assinatura é POSICIONAL e o hook resolve a empresa sozinho por
  // `useEmpresa()` — não recebe `empresaId`.
  const { linhas: linhasDashboard } = useAnaliticoDashboard(abaVisivel === 'operadores', mes);
```

E `detalheDoOperador` é o antigo `<CardContent>` expandido, com o filtro em
`DatePickerField`:

```tsx
  function detalheDoOperador(l: LinhaOperadorPainel) {
    const carregando  = loadingLinhas.has(l.operador_id);
    const linhas      = getLinhasOp(l.operador_id);
    const todasLinhas = linhasMap.get(l.operador_id) ?? [];
    const filtro      = filtrosDatas.get(l.operador_id);
    const temFiltro   = !!(filtro?.inicio || filtro?.fim);

    if (carregando) {
      return (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      );
    }
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-3 py-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Filtrar:</span>
          <DatePickerField
            value={filtro?.inicio ?? ''}
            onChange={v => setFiltroData(l.operador_id, 'inicio', v)}
            placeholder="Início" triggerClassName="w-28 rounded-lg"
            minDate={pisoDoRecorte} maxDate={filtro?.fim || tetoDoRecorte}
          />
          <span className="text-xs text-muted-foreground">até</span>
          <DatePickerField
            value={filtro?.fim ?? ''}
            onChange={v => setFiltroData(l.operador_id, 'fim', v)}
            placeholder="Fim" triggerClassName="w-28 rounded-lg"
            minDate={filtro?.inicio || pisoDoRecorte} maxDate={tetoDoRecorte}
          />
          {temFiltro && (
            <>
              <Button size="sm" variant="ghost"
                className="h-8 gap-1 rounded-lg px-2 text-xs text-muted-foreground"
                onClick={() => limparFiltroData(l.operador_id)}>
                <X className="h-3 w-3" /> Limpar
              </Button>
              <span className="text-xs text-muted-foreground">
                {linhas.length}/{todasLinhas.length}
              </span>
            </>
          )}
          <Button size="sm" variant="outline"
            className="ml-auto h-8 gap-1 rounded-lg px-2 text-xs"
            disabled={linhas.length === 0}
            onClick={() => void copiarTexto(
              montarTextoListaAnalitico(l.nome ?? l.usuario, linhas),
              'Lista de acordos copiada',
            )}>
            <Copy className="h-3 w-3" /> Copiar lista
          </Button>
        </div>
        {tabelaDeLinhas(linhas, temFiltro)}
      </>
    );
  }
```

`tabelaDeLinhas(l, linhas, temFiltro)` é a `<table>` que já existe hoje dentro do
bloco expandido, extraída sem alteração de conteúdo. Ela precisa da linha `l`
além das linhas: o corpo passa operador e nome ao `TabulacaoCell`, que antes
vinham do `r` do `.map`. No `<thead>`, trocar a classe da `<tr>` para
`"sticky top-0 z-10 bg-muted/60 backdrop-blur"`.

O estado `abaAtiva` também precisa estreitar. Hoje ele carrega oito chaves, três
delas mortas (`desempenho`, `quartis`, `grafico` mudaram para o Painel Líder e
não têm entrada em `abasInternas` nem bloco de render). Sem estreitar,
`ativa={abaVisivel}` não tipa. Declare
`type AbaInterna = 'operadores' | 'formas' | 'ranking' | 'destaques' | 'orfaos'`.

E o selo âmbar "transferido" fica: ele explica por que o botão "Tirar da equipe"
existe. Os dois vão juntos dentro de `acoesDaLinha`, num `flex items-center
gap-1.5` — o selo sempre que `transferidos[l.operador_id]`, o botão só com
`temPermissaoImportar`.

Adicionar os imports:

```tsx
import { KpiTile } from '@/components/KpiTile';
import { AbasSegmentadas } from '@/components/AbasSegmentadas';
import { DatePickerField } from '@/components/DatePickerField';
import { ListaOperadores, type GrupoOperadores } from '@/pages/Analitico/ListaOperadores';
import { deResumoAnalitico, type LinhaOperadorPainel } from '@/pages/Analitico/linhaOperador';
import { intervaloDoRecorte, mesDoRecorte, type Recorte } from '@/pages/Analitico/recorte';
import { useAnaliticoDashboard } from '@/hooks/useAnaliticoDashboard';
```

- [ ] **Step 5: Rodar tudo**

Run: `npm run typecheck && npm test`
Expected: typecheck limpo; toda a suíte verde. Os testes de
`agregacaoLider.test.ts` continuam passando sem alteração — a função não mudou.

- [ ] **Step 6: Conferir na tela**

Com `npm run dev` no ar, abrir http://localhost:8080/ → Analítico → Por operador.
Verificar: a régua é segmentada, os cards têm gradiente e ícone em caixa, cada
operador tem avatar, barra de fatia e chips de forma, e o filtro de data dentro
do operador abre um calendário em popover.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard/Analitico/AnaliticoLider.tsx
git commit -m "feat(analitico): por operador ganha a estetica da plataforma

Cards viram tiles com gradiente, a regua vira grupo segmentado, o filtro
de data vira calendario em popover, e cada operador ganha rosto, chips de
forma e a barra da fatia dentro da equipe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: O recorte Dia alimenta a mesma lista

**Files:**
- Modify: `src/pages/Dashboard/Analitico/AnaliticoLider.tsx`

**Interfaces:**
- Consumes: `useDiario` de `@/hooks/useDiario`; `linhasVivas`, `agregarPorOperador`, `consolidarIgnorados` de `@/pages/Analitico/Diario/helpers`; `deResumoDiario` de `@/pages/Analitico/linhaOperador`; `escopoDoDiario`, `linhasVisiveis` de `@/services/diario/escopoDiario`; `FaixaPulso`.
- Produces: nada novo para fora. A aba "Por operador" passa a desenhar o dia quando `recorte.modo === 'dia'`.

- [ ] **Step 1: Buscar o dia quando a lente está em Dia**

```tsx
  /*
   * O recorte Dia lê do diário, não do analítico — é o único que sabe o que
   * entrou na última importação e o que foi ignorado. A regra da tela é curta:
   * o analítico responde pelo mês, o diário responde pelo dia.
   */
  const diaEmFoco = recorte.modo === 'dia' ? recorte.dia : null;
  const { dados: linhasDoDia } = useDiario({ dia: diaEmFoco });

  /*
   * O escopo do diário tem a própria régua (`escopoDoDiario`), diferente da do
   * analítico (`filtrarResumos`). Ela NÃO é fundida aqui: cada fonte continua
   * decidindo quem enxerga o quê pelo módulo testado dela. O que muda é o
   * número de telas que chamam — de duas para uma.
   */
  const vinculosDiario: VinculosDiario = useMemo(() => ({
    equipes,
    operadorEquipeMap,
    equipesExtrasPorOperador: equipesExtras,
  }), [equipes, operadorEquipeMap, equipesExtras]);

  const escopoDia = useMemo(
    () => (diaEmFoco ? escopoDoDiario({
      veTodosOsSetores: podeVerTodosSetores,
      setorDoUsuario:   setorId ?? null,
      totalDeSetores:   contarSetores(vinculosDiario),
    }) : null),
    [diaEmFoco, setorId, podeVerTodosSetores, vinculosDiario],
  );

  const pulsoDoDia = useMemo(() => {
    if (!diaEmFoco || !escopoDia) return null;
    const visiveis = linhasVisiveis(linhasDoDia, escopoDia, vinculosDiario);
    // Dia sem nada no escopo não tem pulso. Sem isto a faixa apareceria dizendo
    // "importação nº 1" para um dia em que ninguém importou coisa alguma.
    if (visiveis.length === 0) return null;
    const vivas    = linhasVivas(visiveis, diaEmFoco);
    const maxIdx   = visiveis.reduce((m, r) => Math.max(m, r.import_index), 1);
    const ignor    = consolidarIgnorados(visiveis, diaEmFoco);
    const resumos  = agregarPorOperador(vivas, maxIdx);
    const valorIgnorado = ignor.reduce((s, i) => s + i.valor, 0);
    return {
      resumos,
      importacao:    maxIdx,
      novos:         resumos.reduce((s, r) => s + r.novos, 0),
      valorIgnorado,
      qtdIgnorados:  ignor.length,
      // Comparação por INSTANTE, não por string: a ordem lexicográfica só
      // coincide com a cronológica enquanto o PostgREST devolver todas as
      // linhas com o mesmo offset e a mesma largura. Não é contrato.
      importadoEm: visiveis.reduce<string | null>(
        (m, r) => (!m || Date.parse(r.importado_em) > Date.parse(m) ? r.importado_em : m),
        null,
      ),
      // O ignorado SOMA no total do dia e sai das listas — regra herdada do
      // diário, e o motivo de a faixa de pulso dizer o valor em voz alta.
      total: vivas.reduce((s, r) => s + r.valor_recebido, 0) + valorIgnorado,
      pagamentos: vivas.length,
    };
  }, [diaEmFoco, linhasDoDia, escopoDia, vinculosDiario]);
```

Os imports desta tarefa:

```tsx
import { useDiario } from '@/hooks/useDiario';
import {
  escopoDoDiario, linhasVisiveis, contarSetores, type VinculosDiario,
} from '@/services/diario/escopoDiario';
import {
  linhasVivas, agregarPorOperador, consolidarIgnorados,
} from '@/pages/Analitico/Diario/helpers';
import { deResumoDiario } from '@/pages/Analitico/linhaOperador';
import { FaixaPulso } from '@/pages/Analitico/FaixaPulso';
```

- [ ] **Step 2: Escolher a fonte dos grupos pela lente**

Trocar o `gruposDoPainel` da Task 10 por:

```tsx
  const gruposDoPainel = useMemo<GrupoOperadores[]>(() => {
    const equipeDe = (id: string) => operadorEquipeMap[id];

    if (recorte.modo === 'dia') {
      if (!pulsoDoDia) return [];
      const linhas = deResumoDiario(pulsoDoDia.resumos, equipeDe);
      // Mesmo agrupamento por equipe do mês, aplicado às linhas do dia.
      const porEquipe = new Map<string, GrupoOperadores>();
      for (const l of linhas) {
        const chave = l.equipeId ?? '__sem__';
        let g = porEquipe.get(chave);
        if (!g) { g = { equipeId: l.equipeId, equipeNome: l.equipeNome, itens: [] }; porEquipe.set(chave, g); }
        g.itens.push(l);
      }
      for (const g of porEquipe.values()) g.itens.sort((a, b) => b.valor - a.valor);
      return [...porEquipe.values()];
    }

    return resumosPorEquipe.map(g => ({
      equipeId:   g.equipeId,
      equipeNome: g.equipeNome,
      itens:      deResumoAnalitico(g.items, linhasDashboard, equipeDe),
    }));
  }, [recorte.modo, pulsoDoDia, resumosPorEquipe, linhasDashboard, operadorEquipeMap]);
```

- [ ] **Step 3: Desenhar a faixa de pulso e ajustar os tiles**

Acima da lista, dentro do bloco `abaVisivel === 'operadores'`:

```tsx
          {recorte.modo === 'dia' && pulsoDoDia && (
            <FaixaPulso
              importacao={pulsoDoDia.importacao}
              novos={pulsoDoDia.novos}
              valorIgnorado={pulsoDoDia.valorIgnorado}
              qtdIgnorados={pulsoDoDia.qtdIgnorados}
              importadoEm={pulsoDoDia.importadoEm}
            />
          )}
```

E os `KpiTile` do topo passam a mudar de rótulo e de fonte com a lente:

```tsx
            <KpiTile
              rotulo={recorte.modo === 'dia' ? 'Total do dia' : 'Total recebido'}
              Icon={TrendingUp} tom="primario"
              valor={formatBRL(recorte.modo === 'dia' ? (pulsoDoDia?.total ?? 0) : metricas.totalRecebido)}
              valorNumerico={recorte.modo === 'dia' ? (pulsoDoDia?.total ?? 0) : metricas.totalRecebido}
              formatar={formatBRL}
              sub={recorte.modo === 'dia'
                ? 'Recebimento vivo'
                : `Relatório mensal · ${metricas.periodoFim
                    ? new Date(metricas.periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')
                    : '—'}`}
            />
```

O tile de HO some no recorte Dia — o diário não tem a coluna:

```tsx
            {mostrarHO && recorte.modo !== 'dia' && ( /* … tile de HO … */ )}
```

- [ ] **Step 4: Mover importar e limpar do diário**

No bloco de ações ao lado da régua, quando `recorte.modo === 'dia'`, trocar os
botões de mês pelos do dia — e manter o aviso do mensal da PaguePlay:

```tsx
        {temPermissaoImportar && recorte.modo === 'dia' && !setorId && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline"
              className="gap-1.5 rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmandoLimpezaDia(true)}>
              <Trash2 className="h-4 w-4" /> Limpar dia
            </Button>
            {isPP && (
              <Button size="sm" className="gap-1.5 rounded-lg"
                onClick={() => setModalImportarDiario(true)}>
                <Upload className="h-4 w-4" /> Importar relatório
              </Button>
            )}
          </div>
        )}
```

Trazer para cá, de `DiarioLider.tsx`, sem alteração de lógica: o estado
`modalImportarDiario`, o `<ImportarDiarioModal>`, o `AlertDialog` de limpar dia
(`limparDadosDoDia`), e o aviso "Primeiro relatório do dia: importe o MENSAL"
(`mensalJaImportadoHoje`), este último renderizado só quando
`isPP && recorte.modo === 'dia' && !mensalOkHoje`.

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm test`
Expected: verde.

- [ ] **Step 6: Conferir na tela**

Analítico → Por operador → lente em **Dia**. Verificar: a faixa de pulso aparece,
o tile diz "Total do dia · Recebimento vivo", o tile de HO some, a lista mostra
"+N novos", e os botões de importar/limpar são os do dia.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard/Analitico/AnaliticoLider.tsx
git commit -m "feat(analitico): o recorte dia alimenta a mesma lista de operadores

O pulso do dia — novos, ignorados e numero da importacao — vira uma faixa
acima da lista. Importar e limpar o dia passam a morar aqui.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: O mapa do mês entra na lista

**Files:**
- Modify: `src/pages/Analitico/Diario/DiaDetalhado.tsx`
- Modify: `src/pages/Dashboard/Analitico/AnaliticoLider.tsx`

**Interfaces:**
- Consumes: `AnaliticoDashboardLinha` de `@/lib/supabase`.
- Produces: `DiaDetalhado` troca as props `{ empresaId, mes, hojeISO, escopo, vinculos, equipeId }` por `{ linhas: readonly AnaliticoDashboardLinha[]; mes: string; nomeDoOperador: (id: string) => string }`.

- [ ] **Step 1: Re-alimentar o mapa a partir do analítico**

Em `DiaDetalhado.tsx`, remover o `useEffect` que chama
`buscarResumoMensalDiario` e as props de escopo. Em lugar dele, montar a matriz
das linhas recebidas:

```tsx
  /*
   * O mapa é MENSAL, e pela regra da tela o mês é do analítico. Antes ele lia o
   * resumo do diário: duas somas do mesmo dinheiro, na mesma tela, livres para
   * discordar sem avisar. As linhas chegam já dentro do escopo de quem chama.
   */
  const matriz = useMemo(() => {
    const porOperador = new Map<string, Map<string, number>>();
    for (const l of linhas) {
      if (!l.operador_id) continue;
      let m = porOperador.get(l.operador_id);
      if (!m) { m = new Map(); porOperador.set(l.operador_id, m); }
      m.set(l.dia, (m.get(l.dia) ?? 0) + (Number(l.total) || 0));
    }
    return porOperador;
  }, [linhas]);
```

O resto do componente — paginação de dias, escala de cor, legenda — continua
como está, lendo `matriz` no lugar do resultado da RPC.

- [ ] **Step 2: Ligar o alternador lista × mapa**

Em `AnaliticoLider.tsx`, dentro da aba "Por operador":

```tsx
  const [visaoOperadores, setVisaoOperadores] = useState<'lista' | 'mapa'>('lista');
```

```tsx
          <div className="flex items-center justify-end">
            <AbasSegmentadas<'lista' | 'mapa'>
              abas={[
                { key: 'lista', label: 'Lista', Icon: Users },
                { key: 'mapa',  label: 'Mapa do mês', Icon: CalendarRange },
              ]}
              ativa={visaoOperadores}
              onTrocar={setVisaoOperadores}
              rotulo="Formato da lista"
            />
          </div>
```

E, no lugar da `<ListaOperadores>` quando `visaoOperadores === 'mapa'`:

```tsx
            <DiaDetalhado
              linhas={linhasDashboard}
              mes={mes}
              nomeDoOperador={id => {
                const r = resumos.find(x => x.operador_id === id);
                return r?.operador_nome ?? r?.operador_usuario ?? '—';
              }}
            />
```

Adicionar `CalendarRange` aos ícones importados e
`import { DiaDetalhado } from '@/pages/Analitico/Diario/DiaDetalhado';`.

- [ ] **Step 3: Verificar**

Run: `npm run typecheck && npm test`
Expected: verde.

- [ ] **Step 4: Conferir na tela**

Analítico → Por operador → **Mapa do mês**. O total da coluna Total do mapa deve
bater com o tile "Total recebido" do topo — antes eles vinham de tabelas
diferentes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Analitico/Diario/DiaDetalhado.tsx src/pages/Dashboard/Analitico/AnaliticoLider.tsx
git commit -m "feat(analitico): o mapa do mes sai da aba diario e passa a somar do analitico

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: A aba Diário sai do código

**Files:**
- Delete: `src/pages/Analitico/Diario/DiarioLider.tsx`
- Delete: `src/pages/Analitico/Diario/DiarioOperador.tsx`
- Delete: `src/pages/Analitico/Diario/index.tsx`
- Modify: `src/pages/Dashboard/Analitico/AnaliticoLider.tsx` (aba "Sem operador" ganha a lente)

- [ ] **Step 1: Confirmar que ninguém mais importa os três**

Run: `npx --no-install rg -n "Diario/index|AbaDiario|DiarioLider|DiarioOperador" src tests`
Expected: nenhuma ocorrência fora dos próprios arquivos a apagar. Se aparecer
alguma, corrigir antes de seguir.

- [ ] **Step 2: A aba "Sem operador" passa a respeitar a lente**

Em `AnaliticoLider.tsx`, no bloco `abaVisivel === 'orfaos'`, escolher a fonte:

```tsx
  /*
   * Órfãos do recorte. No mês vêm do analítico, como sempre; no dia, do
   * diário — mesma regra da lista de operadores. Resolver órfão continua sendo
   * de quem enxerga a empresa toda, por isso a aba some para quem é escopado.
   */
  const orfaosDoRecorte = useMemo(() => {
    if (recorte.modo !== 'dia') return orfaos;
    return linhasDoDia.filter(r => !r.operador_id);
  }, [recorte.modo, orfaos, linhasDoDia]);
```

E usar `orfaosDoRecorte` no lugar de `orfaos` na renderização da aba e no
`badge` da régua.

- [ ] **Step 3: Apagar os três arquivos**

```bash
git rm src/pages/Analitico/Diario/DiarioLider.tsx \
       src/pages/Analitico/Diario/DiarioOperador.tsx \
       src/pages/Analitico/Diario/index.tsx
```

- [ ] **Step 4: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo verde. `src/pages/Analitico/Diario/helpers.ts`,
`helpers.test.ts`, `FormaChip.tsx`, `ImportarDiarioModal.tsx` e
`DiaDetalhado.tsx` continuam existindo e sendo usados.

- [ ] **Step 5: Commit**

```bash
git add -A src/pages/Analitico src/pages/Dashboard/Analitico
git commit -m "refactor(analitico): a aba recebimento diario sai do codigo

A leitura dela virou o recorte Dia. helpers, services e o modal de
importacao ficam — so a casca duplicada foi embora.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Conferência final

**Files:** nenhum. Esta tarefa só verifica.

- [ ] **Step 1: A suíte inteira**

Run: `npm run typecheck && npm run lint && npm test`
Expected: três verdes. Copiar o resumo do vitest para o relatório final — não
afirmar que passou sem ter a saída na mão.

- [ ] **Step 2: Roteiro na tela**

Com `npm run dev` em http://localhost:8080/, percorrer, na aba Analítico:

1. Lente em **Mês**: cards com gradiente, régua segmentada, lista com avatar,
   barra e chips. Expandir um operador → calendário em popover no filtro.
2. Lente em **Dia**: faixa de pulso, tile "Total do dia", HO some, "+N novos"
   na linha, botões de importar/limpar o dia.
3. Lente em **Período**: dois `DatePickerField`, limitados ao mês.
4. **Mapa do mês**: total do mapa bate com o tile do topo.
5. Abrir `?aba=diario` na URL: cai na aba Analítico, recorte Dia, em hoje.
6. Com um cargo sem `analitico_sub_recebimento_diario`: o modo **Dia** não
   aparece na lente.
7. Alternar tema claro/escuro: os tiles e a régua seguem legíveis nos dois.

- [ ] **Step 3: Commit final, se algo foi ajustado no roteiro**

```bash
git add -A
git commit -m "fix(analitico): ajustes do roteiro de conferencia

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Cobertura da spec

| Seção da spec | Tarefa |
|---|---|
| A lente (`Recorte`) | 1, 5, 8 |
| Contrato + adaptadores | 2 |
| Casca visual: tiles | 3, 9, 10 |
| Casca visual: régua segmentada | 4, 9, 10 |
| Casca visual: `DatePickerField` | 5, 9, 10 |
| Casca visual: `Select` no lugar de `<select>` | 8 |
| Faixa de pulso | 7, 11 |
| Linha do operador (avatar, barra, chips) | 6, 10 |
| Lista × mapa, mapa re-alimentado | 12 |
| Visão do operador (tiles, barra de tabulação) | 9 |
| Visão do operador: tile de posição no ranking | 9 (Step 4) |
| Visão do operador: tile "Hoje" no recorte Dia | 9 (Step 5) |
| Fim da aba Diário + permissão remapeada | 8, 13 |
| Link antigo `?aba=diario` | 1, 8, 14 |
| Testes puros antes da tela | 1, 2 |

**Fora de escopo, conforme a spec:** fundir `escopoDiario` com `agregacaoLider`;
redesenhar Ranking, Destaques e Formas de pagamento; qualquer alteração de banco.
