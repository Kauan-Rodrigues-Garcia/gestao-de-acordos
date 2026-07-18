## Context

A aba Pix Automático vive em `src/pages/Acordos/PixAutomatico.tsx`, alimentada por `src/services/pix_automatico.service.ts` (tabela de acordos Pix, sem vínculo com `acordos`). O botão de acesso está em `src/pages/Acordos/AcordosFilters.tsx`. O projeto já usa `@e965/xlsx` para ler/gerar planilha em `src/pages/ImportarExcel.tsx`, e `sonner` (toast) para feedback. Comissão por linha já é calculada por `comissaoDe(item, pctPorSetor)`.

## Goals / Non-Goals

**Goals:**
- Botão da aba visualmente consistente com as abas underline da tela.
- Copiar NR individual e copiar lote formatado (fluxo líder) sem sair da página.
- Importar planilha preenchida somando aos registros atuais; exportar os visíveis.
- Reusar libs/serviços existentes; zero mudança de schema.

**Non-Goals:**
- Não muda o modelo de aprovação/comissão nem o cálculo de percentual.
- Não cria backend/endpoint novo (tudo client-side com o cliente Supabase atual).
- Não altera a aba para PaguePlay (segue exclusiva BookPlay).

## Decisions

- **Botão da aba underline**: trocar o pill gradiente por um `button` no mesmo padrão dos outros tabs (`border-b-2`, `text-primary` quando ativo), mantendo o ícone `Zap` para identidade. Alternativa considerada: manter pill mas neutralizar cor — descartada por continuar fora do padrão de abas.
- **Copiar via `navigator.clipboard.writeText`** com fallback de erro em toast. Ícone `Copy` (lucide) por linha no NR; ação em lote num botão da barra de seleção.
- **Formato do lote** montado por um helper puro `formatarLinhaPix(item)` → `NR: <nr> OPERADOR <operador> VALOR <valor> COMISSÃO <comissao> DATA <dd/mm>`. Helper puro facilita teste unitário. Valor/comissão usam os mesmos formatadores já existentes; data via `criado_em` formatada `dd/MM`.
- **Seleção**: estado `Set<string>` de ids no componente, checkbox por linha + "selecionar todos os visíveis" operando sobre `visiveis`. Só renderiza para `ehLider` (mesma checagem já usada).
- **Import**: reusar `@e965/xlsx` (`read` + `sheet_to_json`). Mapear cabeçalhos tolerando variações (NR/nr, valor/Valor, operador/Operador). Criar em lote via nova função no serviço `criarAcordosPixLote(...)` que faz dedupe por `NR+operador` contra os existentes e insere só os novos. Reaproveita a validação de `criarAcordoPix`.
- **Export**: `xlsxUtils.json_to_sheet` a partir de `visiveis` + `xlsxWrite`/download, mesmas colunas do spec. Respeita filtros porque parte de `visiveis`.
- **Atribuição de operador na import**: sem operador na planilha ou importador não-líder → usa o usuário logado; líder com operador reconhecido (match por nome na lista `operadores` já carregada) → atribui a ele. Evita criar operador inexistente.

## Risks / Trade-offs

- [Planilha com cabeçalhos fora do padrão] → mapeamento tolerante + linhas inválidas ignoradas com resumo; documentar colunas esperadas na UI.
- [Import em lote pode gerar muitas inserções] → inserir em lote único (array) e recarregar uma vez; dedupe antes de inserir evita duplicatas.
- [Clipboard bloqueado em contexto inseguro] → só funciona em HTTPS/localhost (já é o caso); erro tratado em toast.
- [Nome de operador ambíguo na import] → match exato por nome; se não bater, cai no usuário logado (líder) e o resumo indica.

## Migration Plan

Mudança puramente aditiva de UI + uma função de serviço; sem migração de dados. Deploy normal via branch/PR. Rollback = reverter o commit; nenhum dado alterado de forma irreversível.

## Open Questions

- Colunas exatas/nome do cabeçalho que o time já usa nas planilhas de Pix (para o mapeamento) — assumir NR, Operador, Valor até confirmação.
