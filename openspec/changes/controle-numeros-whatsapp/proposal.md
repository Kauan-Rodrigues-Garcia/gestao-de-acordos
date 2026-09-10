## Why

O setor **Núcleo de Inteligência e Gestão** (BOOKPLAY, `setores.id
b3ef6857-85c5-4fb1-bd5b-f225c70aa7ad`) compra números de WhatsApp por site, com
DDD aleatório, aquece cada número, e distribui os que ficaram prontos para os
setores de cobrança. Hoje esse controle vive fora do sistema.

Não há chip físico nem lote: a unidade é **o número**. Um número nasce no
Núcleo, vai para o setor dono do celular, é lançado a um operador, e pode
voltar ao Núcleo quando dá problema — sem nunca ser recadastrado, e sem perder
o caminho que percorreu.

O Gestão de Acordos já tem onde encaixar isso: setores, cargos, o painel de
permissões que manda na RLS, e o módulo RH Gestão como precedente de módulo com
tabelas, chaves e fluxo próprios. Falta o módulo.

## What Changes

- **Celular** como cadastro do Núcleo: identificação, modelo (opcional), setor
  dono, até **6 números**. O setor do celular é imutável enquanto houver número
  vinculado — é o que impede um celular do Play 3 hospedar número do Play 1.
- **Número de WhatsApp** como registro próprio: número normalizado (só
  dígitos), celular, setor, `situacao` (`em_aquecimento` / `ativo` / `banido`),
  `posse` (`nucleo` / `setor`), operador quando lançado. **Único por empresa** —
  recadastrar o mesmo número é recusado pelo banco, não pela tela.
- **Três níveis de distribuição**: Núcleo → setor (liderança) → operador. Cada
  passo é uma RPC no banco, e cada passo grava movimentação.
- **Aba "Meus Chips"** por setor: operador vê só os números lançados para ele;
  liderança vê o setor inteiro, inclusive o que ainda não distribuiu.
- **Relançar ao Núcleo** pela liderança, com motivo de lista + observação. O
  operador tem o passo curto — **Devolver à liderança** —, que solta o número
  sem tirá-lo do setor.
- **Histórico append-only** por número: tipo, setor origem/destino, operador
  origem/destino, situação anterior/nova, motivo, autor, data. Sem UPDATE e sem
  DELETE, escrito só por RPC.
- **Isolamento no banco**, não no menu: RLS reconhece o Núcleo por uma tabela de
  configuração que aponta o setor, e reconhece setor e operador pela escada de
  escopo que o projeto já usa.

## Capabilities

### New Capabilities
- `controle-numeros-nucleo`: cadastro de celulares e números, controle de
  situação, liberação ao setor, configuração de qual setor é o Núcleo, e
  recebimento dos números relançados.
- `meus-chips-setor`: consulta dos números do próprio setor, lançamento ao
  operador, devolução à liderança, relançamento ao Núcleo.

### Modified Capabilities
<!-- Nenhuma capability existente muda de requisito. As edições em arquivos
     existentes são acréscimos: rota, item de menu e chaves de permissão. -->

## Impact

- **Banco (3 migrations)**: 4 tabelas novas (`numeros_config`,
  `numeros_celulares`, `numeros_whatsapp`, `numeros_movimentacoes`), 5 RPCs de
  transição, funções de visibilidade, RLS, e 10 chaves no catálogo.
  `fn_permissoes_catalogo()` e `fn_abas_escopo()` ganham entradas — as duas são
  `CREATE OR REPLACE` de função existente, sem alterar o que já está lá.
- **Frontend**: `src/pages/ControleNumeros/`, `src/pages/MeusChips/`,
  `src/hooks/useControleNumeros.ts`, `src/hooks/useMeusChips.ts`,
  `src/services/numeros/`.
- **Arquivos existentes, só acréscimo**: `src/lib/index.ts` (2 rotas),
  `src/App.tsx` (2 rotas com `ProtectedRoute`), `src/lib/menuLateral.ts`
  (2 itens em `NAV_ITEMS`), `src/lib/permissoes-catalogo.ts` (10 chaves +
  1 grupo).
- **Não toca**: acordos, parcelas, Pix Automático, Analítico, Diário, RH
  Gestão, Comercial, Pagueplay, Tickets, Ouvidoria.
- **Tenant**: exclusivo BOOKPLAY (`tenants = ARRAY['bookplay']` no catálogo),
  porque é a única empresa que tem o setor.

## Non-Goals

- Não integra com a API do WhatsApp, não envia mensagem, não lê status real de
  banimento. A situação é declarada por quem opera.
- Não controla chip físico, lote, ICCID, operadora ou custo de aquisição.
- Não cria cargo novo. O acesso sai do painel de permissões + o setor da pessoa.
- Não cria status além de `em_aquecimento`, `ativo` e `banido`.
