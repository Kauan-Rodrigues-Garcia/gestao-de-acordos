# Correções 2 — roteiro de execução

> Fonte: `C:\Users\Windows\Downloads\Correções 2 .docx` (14/09/2026), 15 pedidos em 7 áreas, 2 prints.
>
> Este arquivo **organiza** o trabalho: ordem, onde mexer, o que depende do banco
> e o que precisa de decisão. O plano detalhado (passo a passo, com teste) de cada
> onda é escrito quando a onda começar — com o código da época, não com o de hoje.

---

## Como foi organizado

1. **Defeito visível antes de funcionalidade nova.** Gráfico cinza, cargo quebrado
   e download abrindo guia incomodam todo dia e são pequenos.
2. **Uma onda = arquivos que mudam juntos.** Evita dois trabalhos no mesmo
   arquivo ao mesmo tempo e deixa um commit revisável por onda.
3. **Só front primeiro, banco por último.** Tudo que precisa de migration fica no
   fim da sua frente, e cada operação no banco segue o `CLAUDE.md`: SQL exato,
   linhas afetadas, e espera o «pode».
4. **O que é funcionalidade grande passa por desenho antes.** «Equipes no Painel
   Diretoria» não é correção; vai por OpenSpec (`openspec-propose`).

## Mapa geral

| # | Pedido | Onda | Banco? | Tamanho |
|---|---|---|---|---|
| 1.1 | Gráfico «O ritmo do recebimento» ainda cinza | 1 | não | P |
| 1.2 | Cargo vermelho demais + perfil desalinhado no header | 1 | não | P |
| 1.3 | Chat: baixar arquivo sem abrir outra guia | 1 | não | P |
| 1.4 | Chat: «Alguém saiu do grupo» → nome de quem saiu | 1 | não* | P |
| 1.5 | Usuários: cada setor vê só as próprias transferências | 1 | não* | P |
| 2.1 | Formas de pagamento agrupadas como no Painel Diretoria | 2 | não | P |
| 2.2 | Card Progresso da meta: sem «Top formas», mesmo tamanho nas duas vistas | 2 | não | M |
| 2.3 | Card Comissão com o mesmo tamanho | 2 | não | P |
| 2.4 | Modal de comissão simétrico (print 2) | 2 | não | P |
| 3.1 | Controle de Números agrupado por situação | 3 | não | M |
| 3.2 | Fechamento na ordem do quartil | 3 | não | P |
| 3.3 | Fechamento: baixar em Excel e HTML | 3 | talvez | M |
| 4 | Chat carregando aos poucos ao subir (como WhatsApp) | 4 | não | M |
| 5 | Tickets: botão de excluir | 5 | **sim** | M |
| 6.1 | Painel Diretoria: Visão Geral e Setores com os mesmos números | 6 | não* | M |
| 6.2 | Painel Diretoria: equipes do setor vinculado + detalhe da equipe | 6 | talvez | G |

\* dá para fazer sem banco; a alternativa com banco está descrita no item.

**Paralelismo possível:** ondas 1, 2 e 3 não dividem arquivo (exceto 2.1, que
também muda o «Como o dinheiro chega» do Painel Diretoria — efeito desejado).
Podem correr em worktrees separadas. Ondas 4, 5 e 6 são sequenciais entre si.

---

## Onda 0 — antes de começar

- [ ] **Separar o que já está sem commit.** A árvore tem mudanças soltas
  (`scripts/robo59/*`, `src/services/rh/rhGestao.service.ts`, `eslint.config.js`,
  `.gitignore`, migrations `20260901200000` e `20260914150000`, dois
  `sql_scripts`). Commitar ou guardar antes, para as correções não se misturarem
  com o Robô do 59.
- [ ] **Fechamento em produção:** a migration `20260914170000` (aba Fechamento)
  ainda não foi aplicada e as chaves nascem desligadas. O código das ondas 3.2 e
  3.3 pode andar; testar com dado real depende dela.

---

## Onda 1 — correções rápidas, só front

### 1.1 Gráfico «O ritmo do recebimento» cinza

- **Onde:** [useChartColors.ts](../../../src/hooks/useChartColors.ts) — `toRgbCompativelComSvg`;
  consumido em [DiretoriaVisaoGeral.tsx:284-286](../../../src/pages/PainelDiretoria/DiretoriaVisaoGeral.tsx#L284-L286).
- **Causa provável:** as cores do tema são `oklch(...)`. O hook pinta um `<span>`
  e lê `getComputedStyle().color` esperando `rgb(...)`, mas o Chrome atual
  devolve a cor no próprio espaço (`oklch(...)`). A regex falha e o hook devolve
  o fallback `#94a3b8` — cinza. O `?? FALLBACK_PRIMARIA` da tela nunca dispara,
  porque o hook sempre devolve string.
- **Correção:** converter pelo canvas 2D (`ctx.fillStyle = cor`, `fillRect`,
  `getImageData`) e montar `rgb(r, g, b)`. Conserta de uma vez todo gráfico que
  usa o hook (DiretoriaSetores também).
- **Verificar:** jsdom não tem canvas — teste unitário cobre só o fallback.
  Confirmação é no navegador, nos temas claro, escuro e PaguePlay.

### 1.2 Cargo no header

- **Onde:** cor em [lib/index.ts:136](../../../src/lib/index.ts#L136); bloco do perfil em
  [Layout.tsx:715-733](../../../src/components/Layout.tsx#L715-L733); selo de impersonação em
  [ImpersonacaoBanner.tsx:41](../../../src/components/ImpersonacaoBanner.tsx#L41).
- **O que está errado (print 1):**
  - `assistente_adm` é o único cargo sólido (`bg-red-600 text-white` + sombra).
    Os outros usam tom claro (`/10` de fundo, `/30` de borda).
  - A etiqueta sólida com borda e sombra fica mais alta que a linha do texto; o
    nome (`leading-none`) e a linha de baixo desalinham em relação à foto.
  - O selo «Como Cristopher Barboza» é `fixed top-1.5 right-1.5` e cobre o nome.
- **Correção:** tom claro como os demais, com matiz próprio para não confundir com
  `administrador` (que já é avermelhado claro); etiqueta com altura fixa
  (`h-4 leading-4 whitespace-nowrap`); bloco de texto centralizado com a foto;
  nome do setor truncado. Selo de impersonação sai de cima do header (entra no
  fluxo do header ou desce abaixo dele).
- **Conferir também:** a mesma etiqueta aparece em `DialogUsuario`,
  `ListaPessoas` e `AdminEquipes`.
- **Teste:** `src/lib/__tests__/index.test.ts` já exige cor para todo cargo.

### 1.3 Chat: baixar sem abrir outra guia

- **Onde:** [VisualizadorMidia.tsx:201](../../../src/components/Chat/VisualizadorMidia.tsx#L201) e
  [comum.tsx:210](../../../src/components/Chat/comum.tsx#L210).
- **Causa:** `<a download target="_blank">` com URL assinada do Storage (outro
  domínio). O navegador ignora `download` em link de outra origem e abre a guia.
- **Correção recomendada:** helper `baixarAnexo(caminho, nome)` em
  `chat.service.ts` que pede `createSignedUrl(caminho, validade, { download: nome })`
  — o Storage responde com `Content-Disposition: attachment` e o navegador salva
  direto, sem carregar o arquivo inteiro na memória da aba. Os dois botões chamam
  o helper em vez de seguir o link.
- **Verificar:** imagem, vídeo, PDF e áudio, em Chrome e Edge.

### 1.4 Chat: «Alguém saiu do grupo»

- **Onde:** [Conversa.tsx:385-388](../../../src/components/Chat/Conversa.tsx#L385-L388) monta `autores`
  só com os membros **atuais** (`fn_chat_grupo_membros`). Quem saiu deixa de
  estar no mapa e cai no `'Alguém'` das linhas 771 e 831. O aviso gravado no banco
  tem o id certo (`sistema_dados.quem`), falta o nome.
- **Correção recomendada (sem banco):** para todo `autor_id` fora do mapa, buscar
  os nomes em lote uma vez por conversa e guardar em cache. Corrige também as
  mensagens antigas e as mensagens comuns de ex-membros.
- **A conferir antes:** se a RLS de `perfis` deixa ler o nome de quem saiu do
  grupo. Se não deixar, a alternativa é o banco: `fn_chat_avisar` gravar o nome no
  `sistema_dados` — mas isso só vale para avisos novos.

### 1.5 Usuários: transferências por setor

- **Onde:** [HistoricoTransferencias.tsx](../../../src/components/admin/HistoricoTransferencias.tsx) usa
  `listarTransferencias(empresaId)` ([transferenciaUsuario.service.ts:594](../../../src/services/admin/transferenciaUsuario.service.ts#L594)),
  que traz a empresa inteira.
- **Correção:** quando `veUsuariosDeTodosSetores` for falso
  ([AdminUsuarios.tsx:102](../../../src/pages/AdminUsuarios.tsx#L102)), mostrar só as transferências com
  origem **ou** destino num setor do escopo de quem vê. Função pura
  `transferenciasVisiveis(lista, setoresDoEscopo)` com teste (Play 4 → Play 5 não
  aparece para o Play 1; Play 1 → Play 3 aparece; Play 3 → Play 1 aparece).
- **Limite:** é filtro de tela. A RLS continua deixando ler. Se precisar ser trava
  de verdade, vira policy (banco).

**Fecha a onda:** `npm run lint`, `npm run typecheck`, `npx vitest run` nos
arquivos tocados, e conferência no navegador.

---

## Onda 2 — Dashboard: progresso da meta, formas e comissão

A ordem interna importa: 2.1 antes de 2.2.

### 2.1 Formas de pagamento agrupadas

- **Onde:** `familiaDaForma` em [formasPagamento.ts:89](../../../src/lib/formasPagamento.ts#L89) — a
  mesma função do «Como o dinheiro chega».
- **Hoje:** agrupa recorrente, cartão e boleto. Pix e Pix Automático ficam soltos,
  cada variação do ERP numa linha.
- **Regra pedida, na ordem dos testes:**
  1. contém «recorrente» → **Cartão recorrente**
  2. contém «cart» → **Cartão**
  3. contém «boleto» → **Boleto**
  4. contém «pix» e «autom» → **Pix automático**
  5. contém «pix» → **Pix**
- **Efeito colateral (desejado):** o Painel Diretoria passa a juntar Pix também.
- **Teste:** [formasPagamento-familias.test.ts](../../../src/lib/__tests__/formasPagamento-familias.test.ts).
- **Decisão pendente:** o rótulo consolidado da PaguePlay `"Pix/Boleto"` tem as
  duas palavras — hoje cai em Boleto.

### 2.2 Card «Progresso da meta»

- **Onde:** [CardMetaDonut.tsx](../../../src/components/PainelMetas/CardMetaDonut.tsx).
- **Mudanças:**
  - sai o bloco «Top formas de pagamento» (linhas 117-131): a vista padrão fica só
    com gráfico, percentual e «R$ recebido de R$ meta»;
  - botão `Formas` passa a `Formas de pagamento` (e o de volta, `Progresso da meta`);
  - as fatias usam `agruparFormas` (2.1) em vez do rótulo cru;
  - **altura fixa igual nas duas vistas:** as duas ocupam a mesma caixa (altura
    definida pela vista de formas); a lista de formas rola por dentro se crescer.
    Nada de o card pular ao alternar.
- **Dados:** `porForma` vem de [useAnaliticoDashboard.ts:107](../../../src/hooks/useAnaliticoDashboard.ts#L107) e
  `usePainelMetas.ts:131`.
- **Teste:** [CardMetaDonut.test.tsx](../../../src/components/PainelMetas/CardMetaDonut.test.tsx).

### 2.3 Card «Comissão» com o mesmo tamanho

- **Onde:** [CardComissaoDashboard.tsx](../../../src/components/Comissao/CardComissaoDashboard.tsx); a grade que põe os dois
  lado a lado em [CardsMetas.tsx:299-312](../../../src/components/PainelMetas/CardsMetas.tsx#L299-L312).
- **Correção:** uma altura só, exportada como constante e usada pelos dois cards
  (e pela grade), para os três estados — meta, formas, comissão — terem o mesmo
  tamanho.

### 2.4 Modal de comissão simétrico (print 2)

- **Onde:** [ConteudoComissao.tsx](../../../src/components/Comissao/ConteudoComissao.tsx).
- **O que está torto:**
  - os três números do topo (linhas 199-218) têm alturas e fontes diferentes;
  - nos cards das faixas (`CartaoFaixa`, 103-159), «A partir de» quebra em duas
    linhas na 3ª e 4ª Meta e empurra o «Faltam» para baixo — cada card termina
    numa altura.
- **Correção:** três números com `h-full` e mesma escala; `dt` com
  `whitespace-nowrap`; cards das faixas com `h-full` e o «Faltam» preso ao rodapé
  (`mt-auto`), para todos alinharem na mesma linha.
- **Verificar:** modal (`VerComissao`) e versão `compacto`, com 3, 4 e 5 faixas.

**Fecha a onda:** lint, typecheck, testes de `PainelMetas` e `Comissao`, e
conferência no navegador alternando as vistas.

---

## Onda 3 — Controle de Números e Fechamento

### 3.1 Controle de Números agrupado por situação

- **Onde:** [ListaNumeros.tsx:119-133](../../../src/pages/ControleNumeros/ListaNumeros.tsx#L119-L133) — hoje agrupa por
  **celular**; situação é só filtro.
- **Correção:** seletor «Agrupar por: Situação / Celular». Em Situação, um card
  por situação (todos os «Aguardando 24 horas» juntos, todos «Em aquecimento»
  juntos…), com o celular aparecendo na linha do número. Filtros atuais continuam.
- **Código:** função pura `agruparPorSituacao(aparelhos, filtros)` ao lado de
  `numerosRegras.ts`, com teste; o componente só desenha.
- **Decisão pendente:** qual agrupamento abre por padrão, e a ordem das situações.

### 3.2 Fechamento na ordem do quartil

- **Onde:** hoje ordena por nome em [useFechamentoOperadores.ts:294](../../../src/hooks/useFechamentoOperadores.ts#L294).
- **Régua do Painel Líder:** [QuartisOperadores.tsx:931-934](../../../src/pages/Dashboard/Analitico/QuartisOperadores.tsx#L931-L934) — maior
  projeção primeiro (o que já põe 1º quartil antes do 2º), sem meta no fim por nome.
- **Correção:** `LinhaFechamento` passa a guardar a `projecao` que
  `montarLinhaFechamento` já calcula ([calculoFechamento.ts:132](../../../src/services/fechamentoOperadores/calculoFechamento.ts#L132)) e
  ganha `ordenarLinhasFechamento`: projeção desc, sem quartil no fim, empate por
  nome. Teste em `calculoFechamento.test.ts`.

### 3.3 Baixar o fechamento em Excel e HTML

- **Onde:** botões em [Fechamento/index.tsx](../../../src/pages/Fechamento/index.tsx).
- **Reaproveitar:**
  - `@e965/xlsx` com import dinâmico, como [Colchao/index.tsx:84](../../../src/pages/Analitico/Colchao/index.tsx#L84);
  - a entrega do arquivo de [baixarFechamento.ts:27](../../../src/services/fechamento/baixarFechamento.ts#L27) (extrair para
    `lib`, aceitando Blob e tipo) e o log de auditoria que ele registra — o
    arquivo sai do sistema com nome e valor de cada operador.
- **Novo:** `src/services/fechamentoOperadores/exportarFechamento.ts` com
  `montarPlanilhaFechamento(linhas, resumo, mes)` e
  `montarHtmlFechamentoOperadores(linhas, resumo, mes)` — funções puras, testáveis
  sem DOM. HTML autossuficiente (CSS embutido), mesma ordem da tela (depende de 3.2).
- **Decisão pendente:** quem pode baixar. Quem vê a aba (sem banco) ou chave nova
  `fechamento_baixar` (catálogo + migration).

**Fecha a onda:** lint, typecheck, testes de `numeros` e `fechamentoOperadores`,
abrir o `.xlsx` no Excel e o `.html` no navegador.

---

## Onda 4 — Chat carregando aos poucos

- **Hoje:** já pagina — [chat.service.ts:478](../../../src/services/chat/chat.service.ts#L478) (`PAGINA_MENSAGENS = 60`) —, mas
  a página anterior só vem clicando em «Ver mensagens anteriores»
  ([Conversa.tsx:722](../../../src/components/Chat/Conversa.tsx#L722)).
- **Correção:** sentinela no topo com `IntersectionObserver` chamando
  `pedirAnteriores` sozinho ao subir; guardar `scrollHeight` antes e compensar
  depois, para a tela não pular; trava contra pedido duplo. Avaliar página menor
  (30) para abrir mais rápido.
- **Risco:** rolagem é a parte mais delicada do chat — «ir para o fim» em mensagem
  nova, resposta citando mensagem antiga, monitoria. Por isso onda própria.
- **Teste:** [Conversa.rolagem.test.tsx](../../../src/components/Chat/Conversa.rolagem.test.tsx). A galeria já lê a conversa
  inteira e não é afetada.

---

## Onda 5 — Tickets: excluir (precisa de banco)

- **Hoje:** não há botão. A policy `tickets_delete` só libera
  `administrar_sistema` ([20260823060000_painel_manda_no_resto.sql:67](../../../supabase/migrations/20260823060000_painel_manda_no_resto.sql#L67)).
  Mensagens e eventos saem em cascata. Anexos do bucket `tickets` ficam órfãos (a
  policy do Storage só deixa o dono do arquivo apagar).
- **Caminho recomendado:**
  1. chave `tickets_excluir` no [permissoes-catalogo.ts](../../../src/lib/permissoes-catalogo.ts);
  2. migration com `fn_ticket_excluir(p_ticket uuid)` (SECURITY DEFINER): cobra a
     chave, registra log, apaga ticket e anexos;
  3. botão em [DetalheTicket.tsx](../../../src/pages/Tickets/DetalheTicket.tsx) com confirmação.
- **Caminho mínimo, sem migration:** botão só para `administrar_sistema`, delete
  direto. Anexos ficam órfãos.
- **Banco:** conferir no schema real se a policy é a da migration (histórico
  defasado — ver `CLAUDE.md`), mostrar o SQL e esperar o «pode».
- **Decisões pendentes:** quem exclui; exclusão definitiva ou Lixeira.

---

## Onda 6 — Painel Diretoria

### 6.1 Visão Geral e Setores com os mesmos números

- **Por que não bate (lido nas migrations do repositório):**
  - «Onde o resultado acontece» soma o 59 **por carteira**, direto das linhas
    cruas — `fn_mestre_diretoria_visao_geral`
    ([20260908230000](../../../supabase/migrations/20260908230000_diretoria_visao_geral_do_59.sql)).
  - Os cards de setor usam `fn_mestre_diretoria_linhas`
    ([20260909100000](../../../supabase/migrations/20260909100000_diretoria_setores_e_equipes.sql)), que aplica equipe movida
    de setor, a segunda perna do `Integral` e, desde `20260913201024`, o descarte
    do colchão.
  - Mesmo dinheiro, regras diferentes: as duas telas nunca vão bater enquanto
    lerem funções diferentes.
- **Correção recomendada (sem banco):** a tabela da Visão Geral passa a ler
  `buscarGradeDeSetores` — a mesma chamada dos cards — e mostra setores e, embaixo,
  as carteiras sem setor, com a nota de que a soma dos setores passa do total da
  empresa por causa do `Integral`.
- **Confirmar com números reais** exige leitura no banco: SQL exato + «pode».
- **Decisão pendente:** a tabela troca carteira por setor, ou mostra setor com as
  carteiras de cada um dentro.

### 6.2 Equipes do setor vinculado + detalhe da equipe

- **Hoje:** o detalhe do setor lista as equipes **do relatório 59**
  (`EquipeDoSetor`, [diretoriaSetores.service.ts:112](../../../src/services/mestre/diretoriaSetores.service.ts#L112)).
- **Pedido:** as equipes **do cadastro do sistema** do setor vinculado (ex.:
  Receptivo → equipes do Matheus e da Luciana). Card com as informações do Painel
  Líder (não o visual). Clique abre o detalhe: operação, equipe, recebimento
  diário, faixa atual, ritmo, fechamento, quartil de cada operador, quantas pessoas
  por quartil, operador destaque.
- **Reaproveitar os dados do Painel Líder**, que já leem `analitico_recebimentos`
  (alimentado pelo 59 desde 14/09):
  `buscarEquipesComOperadores`, `buscarResumoOperadoresAnalitico`,
  `operadoresDaEquipe` ([analitico.service.ts](../../../src/services/analitico/analitico.service.ts)); as contas do card em
  [desempenhoEquipe.ts](../../../src/pages/Dashboard/Analitico/desempenhoEquipe.ts); diário em `buscarResumoMensalDiario`.
- **A conferir:** o escopo da diretoria para ler analítico de todos os setores
  (chaves `analitico_*` e RLS).
- **Forma de trabalhar:** é funcionalidade, não correção. Abrir change no OpenSpec
  (`openspec-propose`), aprovar o desenho, depois as tarefas.
  [DiretoriaSetores.tsx](../../../src/pages/PainelDiretoria/DiretoriaSetores.tsx) já tem 852 linhas — o card e o detalhe da
  equipe nascem em arquivos próprios.
- **Depende de 6.1:** mesma tela, mesmo arquivo.

---

## Decisões (respondidas em 14/09/2026)

| # | Onda | Pergunta | Decidido |
|---|---|---|---|
| D1 | 1.2 | Cor do Assistente ADM | tom claro como os outros, **mantendo o vermelho** |
| D2 | 1.5 | Quem vê todas as transferências | quem tem `usuarios_escopo_todos_setores` |
| D3 | 2.1 | `"Pix/Boleto"` (PaguePlay) entra em qual grupo | **campo separado: «Boleto/Pix Cofen»** |
| D4 | 3.1 | Controle de Números abre agrupado por | Situação |
| D5 | 3.3 | Quem baixa o fechamento | quem vê a aba (sem banco) |
| D6 | 5 | Quem exclui ticket; definitivo ou Lixeira | chave `tickets_excluir`, definitivo com confirmação |
| D7 | 6.1 | Tabela da Visão Geral | **setores e as equipes do Gestão; equipe do 59 sem vínculo com equipe do sistema fica numa lista separada** |

## Andamento

- **Onda 0:** não mexer (pedido do usuário).
- **Ondas 1, 2 e 3:** implementadas em 14/09/2026, sem commit. Lint, typecheck e
  suíte inteira (362 arquivos, 5.973 testes) passando. Conferência visual numa
  página isolada, sem banco.
- **Pendente de banco (1.4):** `20260914190000_chat_nomes_de_quem_ja_participou.sql`
  está só no repositório. Até ser aplicada, o nome de quem saiu vem da leitura de
  `perfis`, que a RLS limita ao escopo de quem olha.
- **Ondas 4, 5 e 6:** não iniciadas.

## Verificação (toda onda)

```bash
npm run lint
npm run typecheck
npx vitest run <arquivos de teste da onda>
```

Mais conferência no navegador (skill `run`) antes de dizer que ficou pronto.
Commit por onda, mensagem no padrão do repositório (`fix(...)`/`feat(...)`).
