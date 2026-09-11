# Comissão por meta — Plano de implementação

> **Execução:** inline, nesta sessão, tarefa a tarefa (as skills de execução por
> subagente não estão instaladas). Passos em checkbox (`- [ ]`).

**Objetivo:** comissão mensal por faixa de meta — configurada na tela de Metas,
visível no Dashboard do operador e consultável pela liderança, com histórico
independente por mês.

**Arquitetura:** duas tabelas por competência (`comissao_config`,
`comissao_faixas`) escritas só por RPC; cálculo puro no navegador
(`services/comissao/comissao.ts`) alimentado pelas mesmas metas e pelo mesmo
recebido que o painel de metas já usa; UI em `components/Comissao/*`.

**Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library, Supabase
(Postgres 17, RLS, RPC `SECURITY DEFINER`, realtime), shadcn/Radix (`Tabs`, `Dialog`).

**Spec:** `docs/superpowers/specs/2026-09-11-comissao-por-meta-design.md`

## Restrições globais

- Banco `vfrvvoetidtsqbbhdkmj` é produção: nada roda contra ele sem autorização
  explícita. A migration só é aplicada depois de mostrar o SQL exato e receber o «pode».
- PaguePlay: comissão em H.O. (`PP_HO_PERCENTUAL = 0.2496`). BookPlay: bruto.
- Clone: setor, equipe, meta, configuração e trava vêm do usuário original.
- O código tolera a migration ausente: erro de relação vira «comissão indisponível».
- Nenhuma lista de cargo no código: `temPermissao` na tela, `fn_user_tem` no banco.
- Tabelas e RPCs novas não estão em `database.types.ts`: acesso por
  `supabase as unknown as SupabaseClient` e `rpc` sem tipos, como `numeros.service.ts`.
- Não tocar: `rankingCriterio.ts`, `useRankingAnalitico.ts`,
  `rankingConfig.service.ts`, `rhGestao.service.ts` (trabalho do usuário em andamento).
- A cada commit: testes do que mudou verdes. Antes do push: suíte inteira,
  `npx tsc -p tsconfig.app.json --noEmit` e eslint dos arquivos tocados.
- Commits em português sem acento, pelo Git Bash com heredoc, trailer
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/services/analitico/acumuladoDoSetor.ts` (novo) | Soma do analítico por setor e o acumulado do card de setor — puro |
| `src/pages/Dashboard/Analitico/DesempenhoEquipes.tsx` | Passa a usar as duas funções acima |
| `src/services/comissao/comissao.ts` (novo) | Tipos da configuração, config que vale para o operador, `calcularComissao` — puro |
| `src/services/comissao/entradaDoOperador.ts` (novo) | Monta a entrada do cálculo a partir de meta, recebido, tenant e configs — puro |
| `supabase/migrations/20260911190000_comissao_por_meta.sql` (novo) | Tabelas, RLS, RPCs, realtime, catálogo, prova |
| `src/services/comissao/comissaoPorMeta.sql.test.ts` (novo) | Garantias da migration lidas no SQL |
| `src/lib/permissoes-catalogo.ts` | Quatro chaves novas |
| `src/services/comissao/comissao.service.ts` (novo) | Leitura das configs do mês e as quatro RPCs |
| `src/services/comissao/useConfigsComissao.ts` (novo) | Configs do mês com realtime |
| `src/services/comissao/useAcumuladoDoSetorNoMes.ts` (novo) | Busca do acumulado do setor e dos resumos por operador, para a aba Comissão |
| `src/services/comissao/useComissaoOperador.ts` (novo) | A comissão de uma pessoa no Dashboard |
| `src/components/Comissao/formato.ts` (novo) | `formatarPct`, `lerPct` — puro |
| `src/components/Comissao/rascunhoConfig.ts` (novo) | Rascunho editável ↔ config ↔ payload — puro |
| `src/components/Comissao/FormConfigComissao.tsx` (novo) | Formulário de uma configuração (padrão ou exceção), grava sozinho |
| `src/components/Comissao/AbaComissao.tsx` (novo) | A aba: estados, importar, padrão, exceções, meta do setor, lista |
| `src/components/Comissao/MetaDoSetorComissao.tsx` (novo) | Acumulado × meta do setor e a confirmação |
| `src/components/Comissao/ListaComissaoOperadores.tsx` (novo) | A consulta da liderança |
| `src/components/Comissao/VerComissao.tsx` (novo) | O `Dialog` com a progressão das faixas |
| `src/components/Comissao/CardComissao.tsx` (novo) | O card do Dashboard |
| `src/pages/MetasConfig.tsx` | Metas extras na PaguePlay; abas `Metas | Comissão`; origem do clone |
| `src/hooks/usePainelMetas.ts` | Expõe `comissaoBase` no modo `eu` |
| `src/components/PainelMetas/CardsMetas.tsx` | Recebe `slotComissao` |
| `src/components/PainelMetas/index.tsx` | Liga `useComissaoOperador`, card e `VerComissao` |
| `docs/REGRAS-DE-NEGOCIO.md` | Seção 12.4 |

---

### Task 1: acumulado do setor fora do JSX

**Files:**
- Create: `src/services/analitico/acumuladoDoSetor.ts`
- Create: `src/services/analitico/acumuladoDoSetor.test.ts`
- Modify: `src/pages/Dashboard/Analitico/DesempenhoEquipes.tsx` (memo `dados` e bloco do card de setor)

**Interfaces — Produces:**

```ts
export interface SomaDoSetor { bruto: number; ho: number; ajuste: number }

export function somarAnaliticoPorSetor(params: {
  resumos: readonly ResumoOperadorAnalitico[];
  operadorEquipeMap: Record<string, OperadorEquipeInfo>;
  equipesExtrasPorOperador: Record<string, string[]>;
  setorDaEquipe: Map<string, string>;
  orfaosPorSetor: Record<string, { total: number; qtd: number }>;
}): Record<string, SomaDoSetor>;

export function acumuladoDoSetor(params: {
  setorId: string;
  isPaguePlay: boolean;
  alternativo: boolean;
  somaPorSetor: Record<string, SomaDoSetor>;
  totalPorSetor: Record<string, { total: number; ho: number }>;
  receptivoPorSetor: Record<string, { acumulado: number }>;
}): SomaDoSetor;
```

Regra (a mesma de hoje no card): `setorSomaPorUsuarios({ isPaguePlay, alternativo })`
escolhe soma dos operadores ou total do relatório; o Receptivo soma só no bruto; o
ajuste vem sempre da soma.

- [ ] Escrever `acumuladoDoSetor.test.ts`: soma por setor; clone soma no setor da
  equipe clonada sem sair do próprio; clone no próprio setor não duplica; órfãos
  só no bruto; ajuste viaja junto; BookPlay normal = relatório + Receptivo;
  alternativo = soma + Receptivo; PaguePlay = soma; Receptivo fora do H.O.; setor
  sem dado = zeros.
- [ ] Rodar: `npx vitest run src/services/analitico/acumuladoDoSetor.test.ts` → falha (módulo ausente).
- [ ] Implementar `acumuladoDoSetor.ts`.
- [ ] Trocar em `DesempenhoEquipes.tsx` o laço de `porSetor` e o cálculo de
  `baseSetor`/`baseSetorHO`/`ajusteDoSetor` pelas duas funções.
- [ ] Rodar o teste novo e `desempenhoEquipe.test.ts` → verdes.
- [ ] Commit `refactor(analitico): acumulado do setor vira funcao pura`.

### Task 2: cálculo da comissão

**Files:**
- Create: `src/services/comissao/comissao.ts`
- Create: `src/services/comissao/comissao.test.ts`
- Create: `src/services/comissao/entradaDoOperador.ts`
- Create: `src/services/comissao/entradaDoOperador.test.ts`

**Interfaces — Produces:**

```ts
export type ModoIndireta = 'junto' | 'separado';
export type RegraSetor = 'nenhuma' | 'percentual_especial' | 'multiplicador';
export interface FaixaConfig { ordem: number; pct: number; pctEspecial: number | null }
export interface ConfigComissao {
  id: string; empresaId: string; setorId: string; equipeId: string | null;
  ano: number; mes: number;
  modoIndireta: ModoIndireta; pctIndireta: number | null; pctIndiretaEspecial: number | null;
  regraSetor: RegraSetor; multiplicador: number | null;
  setorMetaConfirmadaEm: string | null; setorMetaConfirmadaPor: string | null;
  setorMetaConfirmadaPorNome: string | null;
  faixas: FaixaConfig[];
}
export function configDoOperador(p: {
  configs: readonly ConfigComissao[]; setorId: string | null; equipeId: string | null;
}): { config: ConfigComissao | null; doSetor: ConfigComissao | null };

export interface EntradaComissao {
  metaBruta: number | null; metasExtrasBrutas: readonly number[];
  metaIndiretaBruta: number | null;
  recebidoDireto: number;           // BookPlay: bruto; PaguePlay: H.O.
  recebidoIndiretoBruto: number;
  fatorUnidade: number;             // 1 ou PP_HO_PERCENTUAL
  config: ConfigComissao | null; doSetor: ConfigComissao | null;
}
export type SituacaoFaixa = 'atingida' | 'atual' | 'proxima' | 'nao_atingida';
export interface FaixaComissao {
  ordem: number; meta: number;
  pctNormal: number | null; pctEfetivo: number | null;
  comissaoNormal: number | null; comissao: number | null;
  situacao: SituacaoFaixa; atingida: boolean; falta: number | null;
}
export interface IndiretaComissao {
  meta: number; recebido: number; atingida: boolean; falta: number | null;
  pctNormal: number | null; pctEfetivo: number | null;
  valorNormal: number | null; valor: number | null;   // ao atingir
  comissaoNormal: number; comissao: number;            // 0 enquanto não atinge
}
export type MotivoSemComissao = 'sem_meta' | 'sem_config' | 'nenhuma_faixa';
export interface ResultadoComissao {
  motivo: MotivoSemComissao | null;
  modoIndireta: ModoIndireta | null;
  recebido: number;
  faixas: FaixaComissao[]; atual: FaixaComissao | null; proxima: FaixaComissao | null;
  indireta: IndiretaComissao | null;
  regraSetor: RegraSetor; multiplicador: number | null;
  temRegraSetor: boolean; beneficioAtivo: boolean;
  confirmadaEm: string | null; confirmadaPorNome: string | null;
  total: number; totalNormal: number;
}
export function calcularComissao(e: EntradaComissao): ResultadoComissao;

// entradaDoOperador.ts
export interface MetaLinhaBruta {
  tipo: string; referencia_id: string; meta_valor: number | null;
  metas_extras?: unknown; meta_indireta_ativa?: boolean | null; meta_indireta_valor?: number | null;
}
export function montarEntradaComissao(p: {
  meta: MetaLinhaBruta | null;
  recebidoBruto: number; recebidoHO: number; recebidoIndiretoBruto: number;
  isPaguePlay: boolean;
  configs: readonly ConfigComissao[];
  setorOrigemId: string | null; equipeOrigemId: string | null;
}): EntradaComissao;
```

Casos de `comissao.test.ts` (valores exatos):
- tabela do pedido, recebido 50.000 → comissões 595,00 · 780,70 · 1.320,00 · 1.732,90;
- recebido 38.450 → atual 2ª (780,70); próxima 3ª, falta 1.550; situações
  `atingida, atual, proxima, nao_atingida`; 4ª falta 4.550;
- recebido 34.000 exato → atual 1ª;
- recebido 30.000 → `nenhuma_faixa`, próxima 1ª falta 4.000, total 0;
- sem meta → `sem_meta`; sem config → `sem_config`;
- extras fora de ordem `[43.000, 37.000]` → metas `34.000, 37.000, 43.000`;
- config com 2 faixas, operador com 4, recebido 41.000 → 3ª atingida sem %,
  atual 2ª, próxima 4ª falta 2.000;
- % especial confirmado: 32.000 · 2,00 → 2,24 → comissão 716,80, normal 640,00;
- regra sem confirmação → % normal, `temRegraSetor` true, `beneficioAtivo` false;
- % especial ausente → cai no normal;
- multiplicador 2x separado: direta 37.000 · 2,11 e indireta 5.000 · 1,50 →
  1.561,40 + 150,00 = 1.711,40; `totalNormal` 855,70;
- junto: 30.000 + 5.000 = 35.000 contra 33.000 + 2.500 → atinge, 700,00 a 2%;
- junto só com direta 34.000 → `nenhuma_faixa`;
- separado com indireta não atingida → indireta 0, falta 1.000;
- PaguePlay: meta bruta 136.217,95 · fator 0,2496, recebido H.O. 34.000 → meta 34.000,00, 595,00;
- PaguePlay indireta: 20.032,05 bruto → meta 5.000,00, 1,50% → 75,00;
- centavos: 33.333,33 × 1,75% → 583,33;
- `modoIndireta` null sem meta indireta;
- `configDoOperador`: exceção da equipe vence; sem exceção cai no padrão; outro setor não vale; setor nulo → nada.

Casos de `entradaDoOperador.test.ts`: BookPlay usa bruto e fator 1; PaguePlay usa H.O. e
fator 0,2496; `metas_extras` não-array vira lista vazia; meta indireta só com a flag ligada e valor > 0; config resolvida pela origem.

- [ ] Escrever os dois testes → rodar → falham.
- [ ] Implementar `comissao.ts` e `entradaDoOperador.ts` → rodar → verdes.
- [ ] Commit `feat(comissao): calculo da comissao por faixa de meta`.

### Task 3: migration, testes SQL e chaves

**Files:**
- Create: `supabase/migrations/20260911190000_comissao_por_meta.sql`
- Create: `src/services/comissao/comissaoPorMeta.sql.test.ts`
- Modify: `src/lib/permissoes-catalogo.ts` (grupo Metas e grupo Dashboard)

Conteúdo da migration: exatamente o da spec, seção «Modelo de dados» e
«Migration e publicação» — tabelas com `UNIQUE NULLS NOT DISTINCT` e CHECK de
exceção sem regra; RLS com policy só de `SELECT` (`fn_can_access_empresa`, faixas pelo
config); `fn_comissao_salvar(jsonb)`, `fn_comissao_importar_mes_anterior(uuid,uuid,integer,integer,boolean)`,
`fn_comissao_excluir_excecao(uuid)`, `fn_comissao_confirmar_meta_setor(uuid,uuid,integer,integer,boolean)`
com `fn_user_tem` e `fn_can_access_empresa`; trava por `fn_metas_esta_validada`
nas três primeiras; `REVOKE` de `PUBLIC, anon` e `GRANT EXECUTE` a `authenticated`;
publicação realtime; `fn_permissoes_catalogo()` renomeada para
`fn_permissoes_catalogo_antes_comissao_por_meta_20260911` e recriada com as 4 chaves;
padrões em `cargos_permissoes` onde a chave falta; bloco `DO $prova$`.

Chaves (TS e SQL iguais):

| chave | grupo | padrão |
|---|---|---|
| `metas_comissao_ver` | Metas | `{ lider, elite, gerencia }` |
| `metas_comissao_editar` | Metas | `{ gerencia }` |
| `metas_comissao_confirmar_setor` | Metas | `{ gerencia }` |
| `dashboard_comissao` | Dashboard | `TODOS` |

Casos de `comissaoPorMeta.sql.test.ts`: RLS ligada nas duas tabelas; nenhuma policy
`FOR INSERT|UPDATE|DELETE|ALL` nelas; unicidade `NULLS NOT DISTINCT`; cada RPC chama
`fn_user_tem` com a própria chave; salvar/importar/excluir chamam
`fn_metas_esta_validada` e confirmar não; importar e salvar não escrevem
`setor_meta_confirmada`; as duas tabelas entram em `supabase_realtime`; as 4 RPCs
têm `REVOKE ... FROM PUBLIC, anon` e `GRANT EXECUTE ... TO authenticated`.

- [ ] Escrever o teste SQL → rodar → falha (migration ausente).
- [ ] Escrever a migration e as chaves no catálogo TS.
- [ ] Rodar o teste SQL e `src/lib/permissoes-catalogo.sql.test.ts` → verdes.
- [ ] Commit `feat(comissao): migration e chaves de permissao da comissao`.

### Task 4: metas extras na PaguePlay

**Files:**
- Modify: `src/pages/MetasConfig.tsx` (`MetaInput`, `MetaRow`, handlers, `montarPayload`, três botões `+`)
- Create: `src/pages/__tests__/MetasConfig.extras.test.tsx`

Mudanças: `MetaInput.extras_ho: string[]`; `onChangeExtra` mantém o par (bruto →
H.O. na PaguePlay) e `onChangeExtraHO` faz o inverso; `MetaRow` desenha
`Nª meta` e, com `mostrarHO`, `Nª meta H.O.`; `numExtras={extraCampos.X}` e
botões `+` sem `isBP`; `metas_extras` sempre no payload; ajuda na seção de operador.

- [ ] Teste: tenant PaguePlay mostra «Adicionar 2ª meta» e, clicado, os campos
  «2ª meta» e «2ª meta H.O.»; digitar 10.000,00 na H.O. preenche 40.064,10 no bruto.
- [ ] Rodar → falha. Implementar → verde, junto com `MetasConfig.feriados.test.tsx`.
- [ ] Commit `feat(metas): metas extras tambem na PaguePlay`.

### Task 5: aba Comissão na tela de Metas

**Files:**
- Create: `src/components/Comissao/formato.ts` (+ teste)
- Create: `src/components/Comissao/rascunhoConfig.ts` (+ teste)
- Create: `src/services/comissao/comissao.service.ts`
- Create: `src/services/comissao/useConfigsComissao.ts`
- Create: `src/services/comissao/useAcumuladoDoSetorNoMes.ts`
- Create: `src/components/Comissao/FormConfigComissao.tsx`
- Create: `src/components/Comissao/MetaDoSetorComissao.tsx`
- Create: `src/components/Comissao/ListaComissaoOperadores.tsx`
- Create: `src/components/Comissao/VerComissao.tsx`
- Create: `src/components/Comissao/AbaComissao.tsx` (+ teste)
- Modify: `src/pages/MetasConfig.tsx` (abas, `metasDoMes`, origem do clone)

**Interfaces — Produces:**

```ts
// formato.ts
export function formatarPct(v: number | null): string;      // 2.11 → "2,11%"; null → "—"
export function lerPct(texto: string): number | null;        // "2,11" | "2.11" → 2.11; "" → null

// comissao.service.ts
export interface Resultado<T = void> { ok: boolean; dados?: T; erro?: string }
export function mesAnterior(ano: number, mes: number): { ano: number; mes: number };
export async function buscarConfigsDoMes(empresaId: string, ano: number, mes: number):
  Promise<{ configs: ConfigComissao[]; dbAtiva: boolean }>;
export interface PayloadConfig {
  empresaId: string; setorId: string; equipeId: string | null; ano: number; mes: number;
  modoIndireta: ModoIndireta; pctIndireta: number | null; pctIndiretaEspecial: number | null;
  regraSetor: RegraSetor; multiplicador: number | null; faixas: FaixaConfig[];
}
export function salvarConfig(p: PayloadConfig): Promise<Resultado<string>>;
export function importarMesAnterior(p: { empresaId: string; setorId: string; ano: number; mes: number; substituir: boolean }): Promise<Resultado<number>>;
export function excluirExcecao(configId: string): Promise<Resultado>;
export function confirmarMetaSetor(p: { empresaId: string; setorId: string; ano: number; mes: number; confirmado: boolean }): Promise<Resultado>;

// useConfigsComissao.ts
export function useConfigsComissao(p: { empresaId: string | null | undefined; ano: number; mes: number; ativo: boolean }):
  { configs: ConfigComissao[]; dbAtiva: boolean; carregado: boolean; recarregar: () => void };

// rascunhoConfig.ts
export interface RascunhoFaixa { ordem: number; pct: string; pctEspecial: string }
export interface RascunhoConfig {
  modoIndireta: ModoIndireta; pctIndireta: string; pctIndiretaEspecial: string;
  regraSetor: RegraSetor; multiplicador: string; faixas: RascunhoFaixa[];
}
export function rascunhoDe(config: ConfigComissao | null): RascunhoConfig;   // null → 1 faixa vazia
export function payloadDe(r: RascunhoConfig, alvo: { empresaId: string; setorId: string; equipeId: string | null; ano: number; mes: number }): PayloadConfig;
export function assinaturaDo(r: RascunhoConfig): string;
export function faixasSemPct(r: RascunhoConfig): number[];   // ordens com % vazio/inválido

// useAcumuladoDoSetorNoMes.ts
export function useAcumuladoDoSetorNoMes(p: { empresaId: string; mes: string; setorId: string; isPaguePlay: boolean; ativo: boolean }):
  { acumulado: SomaDoSetor | null; resumos: ResumoOperadorAnalitico[]; carregado: boolean };
```

`AbaComissao` recebe `{ empresaId, setorId, setorNome, ano, mes, isPaguePlay,
metaTravada, equipes, operadores, metas, metaDoSetorBruta }`, onde cada operador
traz `setorOrigemId`, `equipeOrigemId` e `clonadoDe`.

Casos de teste: `formato` (vírgula, ponto, vazio, lixo); `rascunhoConfig` (ida e
volta sem perder valor, exceção nunca leva regra, faixa sem % detectada, assinatura
ignora formatação `2,1` × `2,10`); `AbaComissao` com serviços mockados: migration
ausente mostra o aviso; mês vazio mostra o convite e «Importar configuração de
agosto» desativado sem config anterior; ativado quando agosto tem; trava desativa
importar e campos; confirmar desativado com acumulado abaixo da meta.

- [ ] Testes puros → falham → implementar → verdes.
- [ ] Serviço, hooks e componentes; teste de `AbaComissao` → verde.
- [ ] `MetasConfig`: `Tabs` com `Metas` e `Comissão` (esta com `metas_comissao_ver`);
  seletor de setor acima das abas; `metasDoMes` guardado em `fetchMetas`;
  `buscarClonadosNoSetor` passa a trazer `equipe_id` de origem.
- [ ] Rodar os testes de Metas e da aba → verdes.
- [ ] Commit `feat(comissao): aba Comissao na tela de Metas`.

### Task 6: Dashboard

**Files:**
- Modify: `src/hooks/usePainelMetas.ts`
- Create: `src/services/comissao/useComissaoOperador.ts`
- Create: `src/components/Comissao/CardComissao.tsx` (+ teste)
- Modify: `src/components/PainelMetas/CardsMetas.tsx`, `src/components/PainelMetas/index.tsx`
- Test: `src/components/Comissao/VerComissao.test.tsx`

**Interfaces:**

```ts
// usePainelMetas.ts — novo campo em DadosPainelMetas
export interface BaseComissaoOperador {
  operadorId: string;
  metaLinha: MetaLinhaBruta | null;
  recebidoBruto: number; recebidoHO: number; recebidoIndiretoBruto: number;
}
comissaoBase: BaseComissaoOperador | null;   // só no modo 'eu'

// useComissaoOperador.ts
export function useComissaoOperador(p: { base: BaseComissaoOperador | null; mes: string }):
  { resultado: ResultadoComissao | null; podeVer: boolean; dbAtiva: boolean; carregado: boolean };

// CardComissao.tsx
export function CardComissao(p: { resultado: ResultadoComissao; isPaguePlay: boolean; mesFechado: boolean; onVer: () => void }): JSX.Element;

// VerComissao.tsx
export function VerComissao(p: {
  aberto: boolean; onFechar: () => void; nome: string; mes: string;
  isPaguePlay: boolean; mesFechado: boolean; resultado: ResultadoComissao;
}): JSX.Element;

// CardsMetas.tsx
slotComissao?: React.ReactNode;   // desenhado depois de «Análise por quartil»
```

Casos de teste: card com faixa atual (valor, `2ª Meta · 2,11%`, próxima e falta);
card sem faixa («Nenhuma faixa ainda» e a 1ª); benefício mostra `✦`; mês fechado
diz «faltou»; botão chama `onVer`. `VerComissao`: cada faixa com texto de situação
(Atingida, Atual, Próxima, Não atingida), faixa atual marcada como «Comissão atual»,
faixa do benefício com «anterior → atual», linha «Se o setor bater a meta…» quando
não confirmado, indireta só no separado, total.

- [ ] Testes → falham → implementar → verdes, junto com `CardsMetas.test.tsx` e `usePainelMetas.test.tsx`.
- [ ] Commit `feat(comissao): card e Ver comissao no Dashboard`.

### Task 7: regras de negócio, verificação e push

- [ ] `docs/REGRAS-DE-NEGOCIO.md` ganha a 12.4 «Comissão por meta» (resumo da spec: faixas, H.O., junto/separado, benefício confirmado, trava, clone, importação, permissões).
- [ ] Suíte inteira, `tsc -p tsconfig.app.json --noEmit`, eslint dos arquivos tocados.
- [ ] Commit `docs(regras): comissao por meta`.
- [ ] `git push origin main`.
- [ ] Mostrar o SQL exato da migration, o que altera e as linhas afetadas; aplicar em produção só com o «pode».
