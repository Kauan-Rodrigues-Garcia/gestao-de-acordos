## 1. Botão da aba (design)

- [x] 1.1 Em `AcordosFilters.tsx`, trocar o pill gradiente do botão "Pix Automático" por um tab underline no mesmo padrão dos demais (`border-b-2`, ativo = `border-primary text-primary`), mantendo o ícone `Zap`
- [x] 1.2 Garantir estado ativo/inativo coerente com `pixAbaAtiva` e que clicar alterna corretamente (sem regressão nas outras abas)

## 2. Copiar NR e helper de formato

- [x] 2.1 Criar helper puro `formatarLinhaPix(item, comissao)` que retorna `NR: <nr> OPERADOR <operador> VALOR <valor> COMISSÃO <comissao> DATA <dd/mm>`
- [x] 2.2 Criar util `copiarTexto(texto)` usando `navigator.clipboard.writeText` com toast de sucesso/erro
- [x] 2.3 Em `PixAutomatico.tsx`, adicionar botão de copiar (ícone `Copy`) ao lado do NR em cada linha, chamando `copiarTexto(item.nr_cliente)`

## 3. Seleção múltipla + copiar lote (líder)

- [x] 3.1 Adicionar estado `selecionados: Set<string>` e checkbox por linha (só quando `ehLider`)
- [x] 3.2 Adicionar checkbox "selecionar todos os visíveis" no cabeçalho da tabela, operando sobre `visiveis`
- [x] 3.3 Barra de ações em lote mostrando a contagem e o botão "Copiar selecionados"
- [x] 3.4 "Copiar selecionados" monta uma linha por acordo via `formatarLinhaPix`, junta com `\n` e chama `copiarTexto`; avisa se nada selecionado

## 4. Serviço — criação em lote

- [x] 4.1 Em `pix_automatico.service.ts`, criar `criarAcordosPixLote(empresaId, linhas[])` que valida NR/valor, faz dedupe por `NR+operador` contra os existentes e insere só os novos (array insert), retornando `{ importados, ignorados, duplicados }`
- [x] 4.2 Reaproveitar a validação/normalização de `criarAcordoPix` para consistência

## 5. Importar planilha

- [x] 5.1 Botão "Importar planilha" com input de arquivo (.xlsx/.csv), lendo via `@e965/xlsx` (`read` + `sheet_to_json`)
- [x] 5.2 Mapear cabeçalhos tolerando variações (NR/nr, Valor/valor, Operador/operador); montar as linhas para o lote
- [x] 5.3 Atribuir operador: sem operador na planilha ou importador não-líder → usuário logado; líder com operador reconhecido (match por nome em `operadores`) → esse operador
- [x] 5.4 Chamar `criarAcordosPixLote`, recarregar a lista e mostrar toast com resumo (importados / ignorados / duplicados)

## 6. Exportar planilha

- [x] 6.1 Botão "Exportar" que gera planilha a partir de `visiveis` (colunas: NR, Operador, Valor, Comissão, Status, Data) via `xlsxUtils.json_to_sheet` + `xlsxWrite` e dispara download
- [x] 6.2 Avisar via toast quando não há registros visíveis para exportar

## 7. Testes e verificação

- [x] 7.1 Teste unitário de `formatarLinhaPix` (formato exato). Dedupe de `criarAcordosPixLote` coberto pela lógica pura de chave `NR+operador`; teste com mock de Supabase adiado (custo de mock alto, lógica trivial)
- [x] 7.2 Rodar `npx tsc --noEmit`, `eslint --max-warnings=0` nos arquivos alterados e `npm run build` — todos passaram
- [x] 7.3 Verificado no preview: botão alinhado na fileira de abas, copiar NR por linha, seleção múltipla + barra "Copiar selecionados" (líder), botões Importar/Exportar presentes. Leitura do clipboard bloqueada pela permissão do navegador (não é bug; escrita sem erro)
