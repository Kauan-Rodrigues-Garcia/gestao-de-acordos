# Permissões 2.0 — design

*Data: 2026-08-15 · Status: aprovado, aguardando plano de implementação*

## Objetivo

Reconstruir a aba **Configurações → Permissões** para que ela seja verdadeira:
o que a tela mostra é o que o sistema faz. Hoje não é — e isso é mensurável, não
opinião.

Junto disso, cobrir os módulos que hoje não têm permissão nenhuma e acrescentar
exceção **por pessoa**, além da permissão por cargo.

### Não faz parte deste trabalho

- Mover a decisão de permissão para o banco. Permissão de frontend governa
  **navegação e interface**; quem manda no dado é a RLS, e continua sendo.
- Mexer nas políticas RLS existentes.
- Alterar os cargos ou a hierarquia de `PERFIL_NIVEL`.

---

## 1. O diagnóstico, com número

### 1.1 A tela diz «não» e o sistema diz «sim»

A tela lê `permissoes[chave]`: chave ausente no JSON renderiza o toggle
**desligado**. O `temPermissao` tem um fallback,
`PERMISSOES_LEGADAS_PADRAO_TRUE`, que devolve **`true`** para 13 chaves quando
ausentes. Os dois lados discordam em silêncio.

Medido em produção — **25 casos**:

| Empresa · cargo | Aparece desligado, mas concede |
|---|---|
| bookplay · **operador** | `editar_usuarios`, `editar_equipes`, `gerenciar_metas` |
| bookplay · elite · gerencia · diretoria | `editar_usuarios`, `editar_equipes`, `gerenciar_metas` |
| bookplay · lider | `gerenciar_metas` |
| bookplay · ouvidoria | as três acima + `filtrar_por_setor`, `filtrar_por_equipe`, `ver_logs` |
| pagueplay · ouvidoria | as mesmas seis |

Operador da BookPlay com `editar_usuarios` e `editar_equipes` não é cosmético.

### 1.2 Um cargo é invisível

`CARGOS_EDITAVEIS` lista cinco cargos: `operador`, `lider`, `elite`,
`gerencia`, `diretoria`. O sistema tem **oito**.

`ouvidoria` é cargo real, tem linha em `cargos_permissoes` com 16 chaves, está
dentro de `PERFIS_LIDER` no código e no banco — e **não existe na tela**. Nunca
foi configurável.

`administrador` e `super_admin` são omitidos de propósito (acesso total por
construção), mas somem sem explicação.

E há uma assimetria não intencional entre os dois: a `20260812b` criou linha de
`super_admin` em toda empresa, com todas as chaves `true`. **`administrador`
nunca ganhou linha nenhuma** — nas duas empresas existem 7 linhas, e a dele não
está entre elas. Hoje isso não quebra nada, porque `temPermissao` devolve `true`
para os dois cargos antes de olhar o banco. Mas é estado inconsistente esperando
alguém confiar na tabela em vez do atalho.

### 1.3 Não existe contrato de chaves

| Fonte | Quantidade |
|---|---|
| Catálogo da tela (`PERMISSOES_META`) | 26 |
| Chaves distintas no banco | 29 |
| Chaves que o código consulta | 24 |

E cada cargo tem um conjunto diferente: de **16** (`ouvidoria`) a **29**
(`super_admin`). Três listas, nenhuma mandando nas outras.

### 1.4 Toggles que não fazem nada

`ver_acordos_proprios` e `ver_analiticos_setor` aparecem na tela e **nenhuma
linha do app as consulta**. Ligar ou desligar não muda coisa alguma.

Outras três — `ver_ouvidoria`, `editar_ouvidoria`,
`gerenciar_acessos_ouvidoria` — existem no banco, **não** aparecem na tela e
também não são consultadas. Foram criadas e esquecidas.

### 1.5 Seis módulos sem permissão nenhuma

| Rota | Hoje |
|---|---|
| `/ouvidoria` `[PP]` | Livre: qualquer cargo logado entra |
| `/campanha-facil` `[BP]` | Livre |
| `/solicitacoes-whatsapp` | Livre |
| `/analitico` | Livre na rota (só guard interno por slug) |
| `/acordos` `[BP]` | Livre — é a lista principal da BookPlay |
| `/painel-diretoria` | Só cargo, sem permissão configurável |

### 1.6 Mudança não propaga

`useCargoPermissoes` busca uma vez na montagem. Salvar uma permissão só afeta
quem está logado depois que a pessoa recarrega a página.

---

## 2. O catálogo é a fonte da verdade

`src/lib/permissoes-catalogo.ts`, no mesmo padrão de `src/lib/logs-catalogo.ts`,
que o projeto já usa e que funcionou.

```ts
export type GrupoPermissao =
  | 'Abas e telas' | 'Acordos' | 'Importações'
  | 'Gestão de pessoas' | 'Metas' | 'Filtros e visão' | 'Ações específicas';

export interface PermissaoMeta {
  key: string;
  label: string;
  descricao: string;
  grupo: GrupoPermissao;
  /** Tenants onde a permissão existe. Ausente = as duas operações. */
  tenants?: ('bookplay' | 'pagueplay')[];
  /** Valor de partida ao semear. Cargo ausente = false. */
  /**
   * Valor de partida ao semear, por cargo. Cargo omitido = `false`.
   * `CargoConfiguravel` são os seis editáveis; `administrador` e
   * `super_admin` recebem tudo `true` sem passar por aqui.
   */
  padrao: Partial<Record<CargoConfiguravel, boolean>>;
}
```

Os grupos são nomeados pelo que o admin reconhece — **Abas e telas** — e não por
conceito interno.

### 2.1 As 35 chaves

**Mantidas (24):** `ver_acordos_gerais`, `criar_acordos`, `editar_acordos`,
`excluir_acordos`, `excluir_em_lote`, `importar_excel`, `importar_analitico`,
`importar_diario`, `ver_painel_lider`, `ver_analiticos_global`,
`ver_todos_setores`, `gerenciar_metas`, `ver_metas`, `filtrar_por_setor`,
`filtrar_por_equipe`, `filtrar_por_usuario`, `ver_usuarios`, `editar_usuarios`,
`ver_equipes`, `editar_equipes`, `ver_operadores`, `ver_lixeira`, `ver_logs`,
`ver_configuracoes`.

**Removidas (2):** `ver_acordos_proprios` e `ver_analiticos_setor`. As duas são
governadas por RLS — o operador vê os próprios acordos porque a política diz
isso, não porque um toggle permite. Manter botão que não faz nada é pior que não
ter o botão.

**Novas (11):**

| Chave | Grupo | Tenant |
|---|---|---|
| `ver_acordos` | Abas e telas | `[BP]` |
| `ver_analitico` | Abas e telas | ambos |
| `ver_painel_diretoria` | Abas e telas | ambos |
| `ver_ouvidoria` | Abas e telas | `[PP]` |
| `ver_campanha_facil` | Abas e telas | `[BP]` |
| `ver_solicitacoes_whatsapp` | Abas e telas | ambos |
| `ver_pix_automatico` | Abas e telas | `[BP]` |
| `editar_ouvidoria` | Ações específicas | `[PP]` |
| `gerenciar_acessos_ouvidoria` | Ações específicas | `[PP]` |
| `criar_solicitacao_whatsapp` | Ações específicas | ambos |
| `aprovar_pix_automatico` | Ações específicas | `[BP]` |

As três de ouvidoria já existem no banco e passam a ser **ligadas de fato** ao
`ProtectedRoute` e à tela — deixam de ser decorativas.

`ver_pix_automatico` e `aprovar_pix_automatico` são separadas de propósito:
aprovar Pix mexe em comissão, e ver o painel não deveria implicar poder aprovar.

### 2.2 Dois testes seguram o contrato

Rodam na CI e falham o build:

1. **Toda chave do catálogo é consultada em algum lugar do app.** Impede que
   nasça outro `ver_acordos_proprios`.
2. **Todo `temPermissao('x')` e `requiredPermissao="x"` existe no catálogo.**
   Impede que alguém fiscalize uma chave que o admin não tem como configurar.

O varredor ignora `AdminPermissoes/` (que é a definição) e os arquivos `.test.`
(que usam chaves fictícias de propósito).

---

## 3. A resolução, em três camadas

```
1. admin ou super_admin ............... sim, sempre
2. exceção da pessoa tem a chave ...... vale o valor dela
3. permissão do cargo tem a chave ..... vale o valor dela
4. nenhuma das duas ................... NÃO
```

O passo 4 é a mudança central: **`PERMISSOES_LEGADAS_PADRAO_TRUE` deixa de
existir**. Ele só era necessário porque havia ausência para interpretar; depois
da migration não há — toda chave está presente em todo cargo.

O passo 1 permanece porque é o desenho declarado do projeto: a
`20260812b_super_admin_acesso_total` estabeleceu acesso total por construção,
não por lista. A tela passa a **dizer isso** em vez de esconder os dois cargos.

---

## 4. Banco

### 4.1 Tabela nova: `perfis_permissoes`

```sql
CREATE TABLE public.perfis_permissoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_id    UUID NOT NULL REFERENCES public.perfis(id)  ON DELETE CASCADE,
  permissoes    JSONB NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID REFERENCES public.perfis(id),
  UNIQUE (empresa_id, usuario_id)
);
```

Semântica do JSON: **chave presente é exceção** (`true` força sim, `false` força
não); **chave ausente herda o cargo**. É o que dá os três estados sem inventar um
tipo novo.

**RLS**
- `SELECT`: a própria pessoa lê a sua linha (sem isso o hook dela não resolve) e
  admin/super_admin leem todas da empresa.
- `INSERT`/`UPDATE`/`DELETE`: só admin e super_admin, e só na própria empresa —
  via `fn_can_access_empresa`, nunca comparando `empresa_id` na mão (foi essa a
  fresta que a `20260812b` fechou em duas políticas).
- Política `perfis_permissoes_super_admin_total` `FOR ALL`, no padrão que as
  outras 58 tabelas seguem.

### 4.2 Normalização de `cargos_permissoes`

Para cada empresa e cada um dos **8 cargos** — os 7 que já têm linha mais
`administrador`, que nunca teve —, grava o catálogo inteiro:

- chave já presente → **preserva o valor**
- chave ausente → **`false`**

É a decisão registrada: a tela vence. Os 25 casos passam a negar, e **ninguém
ganha acesso que não tinha**.

`administrador` e `super_admin` nascem com tudo `true`, refletindo o acesso que
o código já lhes dá. As linhas deles são informativas — `temPermissao` continua
respondendo `true` antes de consultar o banco —, mas passam a existir, e a
tabela deixa de ter buraco.

Remove as duas chaves aposentadas do JSON de todos os cargos.

### 4.3 Empresa nova nasce completa

Trigger em `empresas`, no mesmo padrão da `20260812b`, semeando as duas tabelas.
Sem isso a próxima empresa reabre o problema de chave ausente.

### 4.4 Auditoria

`cargos_permissoes` já é auditada pela trigger genérica da Logs 2.0 com
severidade **crítica**. `perfis_permissoes` entra na mesma configuração — mudar
o que uma pessoa pode fazer é evento de segurança, e a trilha é append-only.

---

## 5. Frontend

### 5.1 O hook

`useCargoPermissoes` vira `usePermissoes` (o nome antigo permanece exportado
como alias enquanto as ~40 chamadas migram, para o refactor não virar um commit
de mil linhas).

Passa a carregar duas fontes — permissões do cargo e exceções da própria pessoa
— e a **assinar realtime** em `cargos_permissoes` e `perfis_permissoes` da
empresa. Hoje a tela só reflete uma mudança depois de recarregar; passa a
refletir na hora, como o resto do sistema já faz via `RealtimeAcordosProvider`.

Expõe também `resolverParaUsuario(usuarioId, key)`, que a aba «Por pessoa» usa
para mostrar o herdado ao lado da exceção.

### 5.2 A tela

`src/pages/AdminPermissoes/`, substituindo `AdminCargos.tsx`. Arquivos pequenos e
com uma responsabilidade cada:

```
index.tsx          # abas internas + guard de admin
PorCargo.tsx       # os 8 cargos (6 editáveis + 2 em leitura)
PorPessoa.tsx      # busca de pessoa + três estados
GrupoPermissoes.tsx# um grupo, com ligar/desligar tudo
useRascunho.ts     # estado editado, contagem de alterações, descartar
```

**Aba «Por cargo».** Os **oito** cargos: seis editáveis — `operador`,
`ouvidoria` (que hoje não aparece), `lider`, `elite`, `gerencia`, `diretoria` —
e dois em modo leitura, `administrador` e `super_admin`, com uma frase
explicando que o acesso deles é por construção e apontando a `20260812b`.
Melhor que sumirem sem motivo aparente.

**Aba «Por pessoa».** Busca por nome, filtro por cargo e por setor. Cada linha
mostra **o que a pessoa herda** ao lado do **que você está forçando**, em três
estados. Um contador de exceções ativas por pessoa, e um filtro «só quem tem
exceção», para achar rapidamente quem está fora do padrão.

**Escopo por tenant.** A tela monta o catálogo filtrado por
`tenant.slug`: quem entra pela BookPlay não vê toggle de Ouvidoria, e quem entra
pela PaguePlay não vê Campanha Fácil nem Pix Automático.

**Aviso de camada.** Um texto fixo, curto, dizendo que estas permissões
controlam navegação e interface, e que o acesso ao dado é governado pela RLS.
Evita a leitura de que forçar `ver_acordos_gerais` num operador faz ele enxergar
acordo dos outros — não faz, e isso é correto.

### 5.3 Os seis módulos ganham gate

`ProtectedRoute` passa a receber `requiredPermissao` em `/acordos`,
`/analitico`, `/painel-diretoria`, `/ouvidoria`, `/campanha-facil` e
`/solicitacoes-whatsapp`. O `Layout` esconde do menu o que a pessoa não pode
abrir — hoje o item aparece e a tela é que barra, quando barra.

---

## 6. Testes

- **Contrato do catálogo:** os dois varredores da seção 2.2.
- **Resolução:** a tabela verdade das quatro camadas, incluindo o caso «cargo
  nega, exceção concede» e o inverso.
- **Fim do fallback:** um teste que fixa que chave ausente agora nega —
  substitui o teste atual, que fixa o comportamento oposto.
- **Escopo por tenant:** catálogo da BookPlay não traz chave `[PP]` e vice-versa.
- **Os 25 casos:** um teste de dados sobre o seed, provando que nenhum cargo sai
  da migration com mais acesso do que a tela mostrava antes.
- **RLS de `perfis_permissoes`:** operador lê a própria linha e não escreve nada.

---

## 7. Ordem de implementação

1. `permissoes-catalogo.ts` + os dois testes de contrato (falham de início —
   é o esperado, eles descrevem o alvo)
2. Migration: tabela nova, RLS, normalização, trigger de empresa nova
3. `usePermissoes` com as três camadas e realtime
4. Ligar os seis gates de rota e o menu
5. A tela nova, aba «Por cargo»
6. A tela nova, aba «Por pessoa»
7. Remover `AdminCargos.tsx` e o fallback legado

Os passos 1 e 2 já entregam valor sozinhos: alinham os 25 casos e acabam com a
divergência, mesmo antes da tela nova existir.
