## Why

A aba Pix Automático (BookPlay) já funciona para registrar/aprovar comissões, mas tem atrito no dia a dia: o botão de acesso destoa visualmente das outras abas, o líder não consegue copiar rápido um NR nem repassar os dados de um acordo para outra pessoa, e não há como trazer uma planilha já preenchida nem exportar a lista. Isso força trabalho manual (redigitar NR a NR, montar texto na mão) e impede migrar dados existentes.

## What Changes

- **Design do botão da aba** alinhado ao padrão de abas (underline) do restante da tela de Acordos, em vez do pill com gradiente violeta/fúcsia que hoje flutua fora do padrão.
- **Copiar NR** com um clique por linha (ícone de cópia ao lado do NR).
- **Seleção múltipla (líder)**: checkbox por linha + "selecionar todos os visíveis"; botão "Copiar selecionados" gera texto pronto para encaminhar, uma linha por acordo no formato:
  `NR: 23232 OPERADOR LUIZ_SILVA VALOR 3334 COMISSÃO 8,33 DATA 08/07`
- **Importar planilha** (.xlsx/.csv) de Pix Automático já preenchida: cada linha vira um registro; continua permitido adicionar novos manualmente. Duplicados (mesmo NR do mesmo operador) são ignorados/avisados, não sobrescrevem.
- **Exportar planilha** dos registros visíveis (respeitando filtros) para repassar a terceiros.

## Capabilities

### New Capabilities
- `pix-automatico-copiar`: copiar NR individual e copiar em lote o texto formatado dos acordos selecionados (fluxo do líder para encaminhar).
- `pix-automatico-planilha`: importar planilha de Pix Automático já preenchida (adicionando aos existentes, sem sobrescrever) e exportar os registros visíveis.

### Modified Capabilities
<!-- Nenhuma capability spec-level existente muda de requisito; o realinhamento do botão da aba é ajuste visual sem mudança de comportamento. -->

## Impact

- **UI**: `src/pages/Acordos/PixAutomatico.tsx` (seleção, copiar, importar/exportar, ações na tabela), `src/pages/Acordos/AcordosFilters.tsx` (botão da aba).
- **Serviço**: `src/services/pix_automatico.service.ts` (criação em lote a partir da planilha, dedupe por NR+operador).
- **Libs**: reutiliza `@e965/xlsx` (já usado em `ImportarExcel.tsx`) para ler/gerar planilha; clipboard via `navigator.clipboard`.
- **Sem mudança de schema** no banco (usa a mesma tabela de acordos Pix já existente).
