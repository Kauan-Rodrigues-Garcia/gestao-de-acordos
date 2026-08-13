## Context

A conta de projeção deste sistema já está escrita e testada, mas mora em três lugares que não se conhecem:

| Onde | O que calcula | Para quem |
|---|---|---|
| `src/lib/diasUteis.ts` | dias úteis, quartil, cor da projeção | biblioteca — é a fonte boa |
| `src/components/MetaProgressoHeader.tsx` | meta diária, esperado, projeção %, ranking | o próprio usuário, no cabeçalho |
| `src/pages/Dashboard/Analitico/QuartisOperadores.tsx` | os mesmos quatro, por operador | líder+, na aba Analítico |

As duas telas repetem `meta / totalUteis`, `diaria * decorridos`, `recebido - hoje` e `recebido / hoje * 100` com pequenas diferenças de arredondamento e de piso (`Math.max(decorridos, 1)` num lado, `Math.max(..., 1)` dentro do `diasUteisDecorridos` no outro). Um terceiro consumidor copiando essas linhas seria a terceira versão da mesma verdade.

O outro contexto que pesa: `escopoAnalitico.ts` documenta, em comentário, um bug já vivido — cada painel montava à mão o conjunto de operadores que conta, e o dashboard somava clones com a caixinha desligada enquanto a aba Analítico não somava. A lição virou `useEscopoAnalitico`. O painel novo herda essa regra: ele não decide quem conta.

## Goals / Non-Goals

**Goals:**
- Uma superfície única no Dashboard que responde "estou no ritmo?" sem trocar de tela.
- Extrair a matemática duplicada para um módulo puro e testado, e reescrever os dois consumidores atuais em cima dele.
- Dar ao líder a mesma leitura para a equipe, sem uma segunda implementação da conta.
- Manter o painel "Dados Analíticos" exatamente como está.

**Non-Goals:**
- Não replicar o visual do dashboard de referência. A referência define QUAIS números aparecem e em que ordem; o visual segue o design system do projeto (`Card`, `MetricCard`, tokens do Tailwind, `framer-motion`, `COR_QUARTIL`).
- Não incluir os cards "Meta de hoje" e "Posição no ranking" da print de referência — decisão do usuário nesta rodada.
- Nenhuma migration. Nenhuma RPC nova. Se a conta precisar de dado que hoje não existe no cliente, ela sai do escopo em vez de virar uma coluna.
- Não mexer no painel Analítico, no Painel Diretoria nem em `DesempenhoEquipes`.

## Decisions

### 1. Extrair `src/lib/projecaoMetas.ts` antes de escrever a UI

Uma função pura que recebe `{ meta, recebido, totalUteis, decorridos, quartis }` e devolve `{ metaDiaria, esperado, diferenca, projecaoPct, quartil, proximo, paraSubir }`.

*Por quê:* é a única forma de garantir que o painel novo não discorde do `MetaProgressoHeader` nem da tabela de quartis. Sendo pura, o teste cobre os casos chatos (meta zero, decorridos zero, mês fechado) sem montar componente.

*Alternativa descartada:* deixar cada componente com a sua conta e comparar por teste de integração. Custa mais e falha depois, não antes.

Os dois consumidores atuais SÃO reescritos em cima dela na mesma mudança — extrair sem migrar deixa a quarta cópia no lugar das três.

### 2. `PainelMetas` é burro; o escopo vem de fora

O componente recebe `{ escopo, meta, recebido, porDia, totalUteis, decorridos, temLogicaDiretoExtra }` já resolvidos e só desenha. Quem resolve é um hook `usePainelMetas`, que compõe `useAnaliticoDashboard` + `useEscopoAnalitico` + `getMetasConfig` + a query de `metas`.

*Por quê:* é o que impede a divergência com o `AnalyticsPanel`. Os dois passam a sair de `agregarAnalitico(linhas, escopo)` com o MESMO `escopo`.

*Consequência prática:* `Dashboard/index.tsx` já calcula `setorFiltro`, `equipeFiltroAtivo`, `operadorFiltroAtivo` e `usuarioTemLogicaDiretoExtra` para o `AnalyticsPanel` (linhas 699–704). O painel novo recebe os mesmos valores, do mesmo lugar. Nada é recalculado.

### 3. Eu / Minha equipe muda o escopo, não o componente

O alternador troca o `EscopoAnalitico` passado ao hook: `{ tipo: 'operador' }` vira `{ tipo: 'equipe', operadores }` — variante que `escopoAnalitico.ts` já define e `useEscopoAnalitico` já sabe montar (incluindo clones com `conta_recebimento`).

A meta segue a precedência que `useAnalytics.ts` já usa: meta do tipo `equipe` para a equipe quando existe; senão, a soma das metas `operador` dos membros.

*Por quê:* zero código novo de agregação. O mesmo `PainelMetas` desenha os dois modos porque a diferença inteira está no par (escopo, meta).

*Alternativa descartada:* um `PainelMetasEquipe` separado. Duas árvores de card para manter, e o primeiro card que divergisse já quebraria a promessa de "mesma régua".

### 4. Direto/Extra sai do analítico, classificado pelo acordo

*Revisada duas vezes durante a implementação. Vale registrar o caminho, porque o meio-termo era tentador e errado.*

A primeira versão assumia que direto/extra saíam da mesma agregação do Total recebido. Não saem: `AnaliticoDashboardLinha` não tem `tipo_vinculo`, e a RPC do dashboard devolve linhas já somadas por dia e forma.

A segunda versão somava `acordos` por vínculo, em paralelo. Fechava a tipagem, mas media **outra coisa**: acordo agendado no mês não é recebimento do mês, e os dois números nunca reconciliariam com o total da tela.

A versão final usa o elo que já existe: `analitico_recebimentos.acordo_id`, gravado pela tabulação. Cada linha do analítico é classificada pelo vínculo do acordo dela; linha sem acordo vira **sem vínculo definido**. Assim a base continua sendo o analítico — o que o usuário pediu — e a soma fecha por construção:

```
direto + extra + sem vínculo = total do analítico no escopo
```

O card "sem vínculo" some quando é zero, então em um mês totalmente tabulado a tela mostra só direto e extra somando o total.

*Alternativa descartada:* ratear o total do analítico pela proporção direto/extra da tabulação. A soma fecharia, mas os dois números viram estimativa — inaceitável num painel que alimenta discussão de comissão.

Custo: uma leitura extra de `analitico_recebimentos` no mês (paginada, três colunas) mais uma de `acordos` pelos IDs citados. Só acontece quando `temLogicaDiretoExtra` está ativo.

Isto passa a valer também na BookPlay. O `AnalyticsPanel` calculava direto/extra só quando `isPP`, embora `useDiretoExtraConfig` seja por empresa/setor/equipe/usuário e não por tenant — um setor BookPlay com a lógica ativa via zero.

Vale ainda a regra do card que some: sem `temLogicaDiretoExtra`, somem todos os cards de vínculo. Um card com R$ 0,00 parece dado real e não é.

### 8. O painel substitui o corpo antigo; a faixa "Dados Analíticos" fica

O pedido foi explícito: substituir, não incrementar. Mas a faixa de cabeçalho — título, seletor de mês, sparkline, totais — tinha sido declarada intocável desde o começo, e continua.

Logo, o recorte é: `AnalyticsPanel` segue dono do cabeçalho e dos dados (`useAnalytics` + `useAnaliticoDashboard` + escopo); o **corpo** BookPlay passa a ser `<PainelMetas>`. A PaguePlay não muda em nada — `PPMetrics`, `ChartsSection` e as métricas adicionais continuam no caminho antigo.

Consequências deliberadas:

- **O mês vem de fora.** O painel não tem `SeletorMes` próprio. Dois seletores na mesma área é como os dois lados saem de sincronia.
- **O donut antigo virou o card de Projeção.** É mais detalhado e mais bonito que o anel que eu havia escrito, e o time já o reconhece — o `AnelProjecao` foi deletado.
- **"Recebido vs Agendado" foi mesclado na evolução diária**, em vez de virar um segundo gráfico. Barra é o que entrou, linha é o que está prometido.
- **"Projeção do mês" foi removido.** Ele projeta ritmo sobre dias CORRIDOS; o painel novo projeta contra meta e dias ÚTEIS. Dois números chamados "projeção" na mesma tela discordariam por construção, e o certo é o de dias úteis.
- **O resto virou bloco recolhível.** Agendado, Não Pagos, Agendado hoje, Agendado restante, Acordos no mês, Taxa de conversão e Ticket médio continuam úteis, mas não falam de meta — abertos, competiriam com o que a tela veio dizer.

### 5. Baixa anterior sai do dado, não do calendário

"Último dia útil anterior" e "último dia com recebimento" divergem sempre que houve feriado, ponte ou simplesmente um dia sem baixa. A leitura que interessa ao operador é a segunda.

Implementação: varrer `porDia` para trás a partir de hoje e parar no primeiro dia com `bruto > 0`. Sem esse dia, o card não é renderizado.

*Nota sobre a print de referência:* ela rotula o card com uma data (09/08) que não bate com a barra do gráfico (dia 10). Esta especificação escolhe deliberadamente a data do dado, não a da print.

### 6. Gráfico: Recharts, como o resto do projeto

`ChartsSection` e `GraficoRecebimento` já usam Recharts com `useAxisColors` para os tokens de tema. O gráfico novo é um `BarChart` com `<Cell>` colorido por barra e `<ReferenceLine>` na meta diária.

*Por quê:* nenhuma dependência nova, tema claro/escuro já resolvido pelo hook, e o comportamento responsivo é o mesmo dos gráficos vizinhos.

### 7. `MetaProgressoHeader` esvazia em vez de coexistir

O bloco de meta/quartil/ranking do cabeçalho passa a ser redundante com o painel. Duas barras de meta na mesma tela, com arredondamentos possivelmente diferentes, é pior que nenhuma.

O componente deixa de renderizar meta, quartil e ranking — e, como não sobra nada nele, o arquivo é removido.

*Corrigido durante a implementação:* esta decisão afirmava que `data-tour="meta-progresso"` era referenciado pelo tour guiado. Não é. `OnboardingTour.tsx` só aponta para `metricas`, `filtros`, `tabela-acordos` e `novo-acordo` — o atributo já estava órfão antes desta mudança. Ele foi levado para o `PainelMetas` mesmo assim, porque o painel é o alvo natural caso um passo de tour sobre metas seja criado, mas nada quebraria se fosse descartado.

## Risks / Trade-offs

**[Número do painel novo diverge do "Dados Analíticos" logo acima]** → Os dois saem de `agregarAnalitico(linhas, escopo)` com o mesmo `escopo` vindo de `useEscopoAnalitico`. Teste dedicado que monta os dois com as mesmas linhas e compara o total, incluindo o caso da Contribuição Receptivo, que soma por cima do relatório e é a fonte histórica de discordância.

**[Reescrever `MetaProgressoHeader` e `QuartisOperadores` sobre `projecaoMetas` muda um número em produção]** → São 1.899 testes no repo e `QuartisOperadores` tem cobertura via `agregacaoLider.test.ts`. A extração é feita preservando o comportamento atual bit a bit (mesmos `Math.round`, mesmo piso de `decorridos`); qualquer divergência aparece como teste vermelho, não como reclamação de operador.

**[Peso na primeira pintura do Dashboard]** → O painel não abre requisição nova: `useAnaliticoDashboard` é `useQuery` com chave compartilhada, e o Dashboard já monta dois consumidores dela. `getMetasConfig` e a query de `metas` já são feitas pelo `MetaProgressoHeader`, que está saindo. O saldo tende a zero.

**[Líder de várias equipes]** → O alternador é binário (Eu / Minha equipe) e assume UMA equipe. Quando `perfil.equipe_id` é nulo mas o usuário lidera por `equipe_lideres`, o modo equipe usa a primeira equipe liderada e não oferece troca. Aceito nesta rodada; o filtro por equipe que já existe no header do Dashboard cobre o caso avançado.

**[Grid quebrado quando cards somem]** → Com meta ausente somem 4 cards; sem Direto/Extra somem 2. O grid usa classes responsivas com `auto-fit` em vez de contagem fixa de colunas, para não deixar buraco.

## Migration Plan

Sem migration de banco. Ordem de implementação que mantém o app verde a cada passo:

1. `projecaoMetas.ts` + testes — nada consome ainda.
2. Reescrever `MetaProgressoHeader` e `QuartisOperadores` sobre ele; suíte tem que continuar verde sem alterar expectativa nenhuma.
3. `usePainelMetas` + `PainelMetas` com os cards, montado no Dashboard.
4. Gráfico de evolução diária.
5. Alternador Eu / Minha equipe.
6. Esvaziar `MetaProgressoHeader` e migrar o `data-tour`.

Rollback: o painel é um bloco isolado em `Dashboard/index.tsx`. Remover o `<PainelMetas />` e reverter o passo 6 devolve a tela anterior; os passos 1 e 2 são refatoração pura e podem ficar.

## Open Questions

- Meta de EQUIPE: quando existe meta `tipo: 'equipe'` E metas individuais dos membros, qual manda? Esta proposta adota "meta de equipe quando existir, senão a soma" seguindo `useAnalytics.ts`, mas vale confirmar com quem cadastra as metas se é essa a intenção do negócio.
- Contribuição Receptivo na visão de equipe: hoje ela é por SETOR. Numa equipe que é parte de um setor, ratear seria inventar número. A proposta é NÃO somar Receptivo no modo equipe e dizer isso no subtexto do card — confirmar se o líder concorda com essa leitura.
