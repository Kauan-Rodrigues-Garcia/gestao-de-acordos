## Context

O Gestão de Acordos é multi-tenant (`empresas`: BOOKPLAY, PAGUEPLAY, COMERCIAL)
com setores por empresa. Desde 23/08/2026 **o painel de permissões é a
autoridade única sobre acesso**, e a RLS pergunta a ele: `fn_user_tem(chave)` e
`fn_user_escopo(aba)` são as primitivas, `fn_abas_escopo()` é o registro de
abas, e `fn_permissoes_catalogo()` espelha `src/lib/permissoes-catalogo.ts` —
dois testes de contrato quebram a CI se os dois lados divergirem.

O módulo **RH Gestão** (migrations `20260823090000`–`20260824120000`) é o
precedente direto: tabelas próprias, chaves próprias, RPCs `SECURITY DEFINER`
para as transições, e uma trilha append-only (`rh_eventos`). Este módulo segue a
mesma forma.

O setor existe e foi confirmado em produção:

    BOOKPLAY · Núcleo de Inteligência e Gestão · b3ef6857-85c5-4fb1-bd5b-f225c70aa7ad · ativo

## Goals / Non-Goals

**Goals:**
- O número é a unidade, e ele nunca é recadastrado nem apagado — só se move.
- Celular pertence a um setor, e os números dele pertencem ao mesmo setor. Isso
  é garantido pelo banco, não pela tela.
- Três alcances de leitura: Núcleo (tudo), liderança (o setor), operador (o que
  foi lançado para ele).
- Histórico completo das movimentações, imutável.
- Zero acoplamento com acordos, recebimentos, Pix ou RH.

**Non-Goals:**
- Sem integração com WhatsApp, sem detecção automática de banimento.
- Sem chip físico, lote, ICCID ou custo.
- Sem arquitetura genérica para "qualquer recurso distribuível". Este módulo
  controla número de WhatsApp.

## Decisions

### O Núcleo é reconhecido por configuração, não por nome

`numeros_config(empresa_id PK, setor_nucleo_id)` — uma linha por empresa.
`fn_numeros_sou_do_nucleo(empresa_id)` compara `perfis.setor_id` com ela.

Alternativa descartada: comparar `setores.nome` com a string do setor no SQL e
no TS. É o antipadrão que a migration `20260823092000` documenta ter removido
(condicional por nome de setor espalhada pelo código), e renomear o setor pela
tela de Admin derrubaria o módulo em silêncio.

Alternativa descartada: coluna booleana em `setores`. Chegaria de graça em toda
tela que faz `select *` em setores, e permitiria dois setores marcados como
Núcleo ao mesmo tempo. A PK por empresa impede isso por construção.

### Duas fechaduras diferentes, porque cargo não distingue setor

Gente do Núcleo tem cargo comum (operador, líder). Conceder
`escopo_todos_setores` ao cargo `operador` liberaria **todo** operador de
**todo** setor. Então:

| Quem | Como o banco reconhece |
|---|---|
| Núcleo | `perfis.setor_id = numeros_config.setor_nucleo_id` **e** `ver_controle_numeros` |
| Liderança do setor | `chips_escopo_setor` **e** `setor_id` bate com o dela |
| Operador | `chips_escopo_individual` **e** `operador_id = auth.uid()` |

`fn_numeros_visivel(p_empresa_id, p_setor_id, p_operador_id)` concentra a regra,
para as policies não divergirem entre si — mesma razão de
`fn_rh_lancamento_visivel` existir.

### `situacao` e `posse` são colunas separadas

`situacao` = `em_aquecimento | ativo | banido` responde *como o número está*.
`posse` = `nucleo | setor` responde *quem está com ele*. `operador_id` responde
*com quem, dentro do setor*.

Alternativa descartada: um status único. "Banido no Núcleo" e "banido no setor"
são estados reais e diferentes, e a lista única precisaria do produto cartesiano
dos dois eixos — exatamente os "diversos status adicionais" que o pedido proíbe.

`CHECK (posse <> 'nucleo' OR operador_id IS NULL)` impede o estado
contraditório: número no Núcleo não pode estar na mão de um operador.

### `setor_id` é copiado do celular para dentro do número

Denormalização deliberada. A RLS filtra por setor em toda leitura, e resolver
isso por JOIN com `numeros_celulares` dentro da policy paga o JOIN por linha —
o custo que as migrations `20260910125537`–`20260910180000` passaram a semana
removendo de outras tabelas.

Duas triggers mantêm a cópia honesta:
- `BEFORE INSERT OR UPDATE` no número: `setor_id` recebe o do celular, sempre.
  O cliente não escolhe.
- `BEFORE UPDATE` no celular: trocar `setor_id` com número vinculado levanta
  exceção. É o que garante que o vínculo nunca se mistura.

### O limite de 6 é trigger com lock, não `CHECK`

`CHECK` não enxerga outras linhas. Uma contagem solta perde a corrida entre dois
cadastros simultâneos e grava o sétimo. A trigger faz
`SELECT ... FROM numeros_celulares WHERE id = NEW.celular_id FOR UPDATE` antes
de contar: o segundo cadastro espera o primeiro e vê o total certo.

O limite também aparece na tela (contador "4/6", botão desabilitado no sexto),
mas a tela é conveniência — a garantia é a trigger.

### As transições são RPC, o CRUD é RLS

Cadastrar celular e número é `INSERT` comum sob RLS. As **transições** são cinco
RPCs `SECURITY DEFINER`, porque cada uma precisa validar quem chama, validar o
estado de origem, mudar duas ou três colunas juntas e gravar a movimentação — e
nada disso pode depender de o cliente lembrar de fazer.

| RPC | Quem | Exige | Efeito |
|---|---|---|---|
| `fn_numeros_liberar_ao_setor` | Núcleo + `numeros_liberar_ao_setor` | `posse='nucleo'`, `situacao='ativo'` | `posse='setor'` |
| `fn_numeros_lancar_ao_operador` | liderança + `chips_lancar_ao_operador` | `posse='setor'`, operador do mesmo setor | grava `operador_id` |
| `fn_numeros_devolver_a_lideranca` | o próprio operador + `chips_devolver_a_lideranca` | `operador_id = auth.uid()` | limpa `operador_id` |
| `fn_numeros_relancar_ao_nucleo` | liderança + `chips_relancar_ao_nucleo` | `posse='setor'`, motivo obrigatório | `posse='nucleo'`, limpa operador |
| `fn_numeros_alterar_situacao` | Núcleo + `numeros_administrar` | situação válida | troca `situacao` |

Só o Núcleo altera situação. Liderança que precisa marcar banimento usa o
relançamento com motivo `banido` — o Núcleo aplica a situação ao tratar. Isso
mantém uma dona só para a coluna.

### O histórico não tem FK nos snapshots

`numeros_movimentacoes` guarda `setor_origem_id` + `setor_origem_nome` (e o
mesmo para destino e operadores), com os `*_id` **sem foreign key**. Apagar um
setor não pode apagar nem invalidar histórico — mesma decisão de
`rh_lancamentos`. Sem policy de `UPDATE` nem de `DELETE`, e escrita só por
`fn_numeros_movimentacao`, que é `SECURITY DEFINER` com `REVOKE ... FROM PUBLIC`.

`descricao` é montada no banco em português ("Play 3 relançou ao Núcleo —
motivo: banido"), como em `rh_eventos`. A tela desenha, não interpreta.

### `numeros_configurar` exige concessão nominal

Entra em `PERMISSOES_EXPLICITAS` (coluna `explicita` do catálogo), ao lado de
`ignorar_fechamento_mes` e `rh_reabrir_fechamento`. Apontar `setor_nucleo_id`
para outro setor entregaria o módulo inteiro àquele setor — é escalonamento de
privilégio, e o acesso total de administrador não deve concedê-lo por herança.

### O número é guardado normalizado

Só dígitos, sem prefixo de país e sem máscara: `18999999999`.
`UNIQUE (empresa_id, numero)` faz a duplicidade ser recusada pelo banco, então
`(18) 99999-9999` e `18999999999` colidem — que é o comportamento pedido. A
máscara vive em `numerosFormato.ts` e só na exibição.

Validação: 10 ou 11 dígitos, DDD entre 11 e 99. Não se valida se o nono dígito
é 9 — o pedido diz DDD aleatório, e recusar número real por regra de formato é
pior do que aceitar um número torto.

## Data Model

```
numeros_config
  empresa_id       UUID PK  -> empresas(id)      ON DELETE CASCADE
  setor_nucleo_id  UUID     -> setores(id)       ON DELETE RESTRICT
  atualizado_por, atualizado_por_nome, atualizado_em

numeros_celulares
  id, empresa_id -> empresas
  identificacao  TEXT NOT NULL          -- "Celular 05"
  modelo         TEXT                   -- opcional
  setor_id       UUID NOT NULL -> setores  ON DELETE RESTRICT
  ativo          BOOLEAN DEFAULT TRUE
  criado_por, criado_por_nome, criado_em, atualizado_em
  UNIQUE INDEX (empresa_id, lower(trim(identificacao)))
  INDEX (empresa_id, setor_id) WHERE ativo

numeros_whatsapp
  id, empresa_id -> empresas
  celular_id  UUID NOT NULL -> numeros_celulares  ON DELETE RESTRICT
  setor_id    UUID NOT NULL -> setores            ON DELETE RESTRICT  (copia do celular, por trigger)
  numero      TEXT NOT NULL                       -- so digitos
  situacao    TEXT NOT NULL DEFAULT 'em_aquecimento'
              CHECK (situacao IN ('em_aquecimento','ativo','banido'))
  posse       TEXT NOT NULL DEFAULT 'nucleo'
              CHECK (posse IN ('nucleo','setor'))
  operador_id UUID -> perfis(id) ON DELETE SET NULL
  motivo_retorno      TEXT CHECK (motivo_retorno IN ('banido','sem_uso','problema_tecnico','outro'))
  observacao_retorno  TEXT
  criado_por, criado_por_nome, criado_em, atualizado_em
  UNIQUE (empresa_id, numero)
  CHECK (posse <> 'nucleo' OR operador_id IS NULL)
  INDEX (empresa_id, setor_id, posse)
  INDEX (celular_id)
  INDEX (operador_id) WHERE operador_id IS NOT NULL

numeros_movimentacoes                          -- append-only
  id, empresa_id, numero_id -> numeros_whatsapp ON DELETE CASCADE
  tipo TEXT CHECK (tipo IN ('cadastro','situacao_alterada','liberado_ao_setor',
                            'lancado_ao_operador','devolvido_a_lideranca',
                            'relancado_ao_nucleo'))
  setor_origem_id/nome, setor_destino_id/nome          -- snapshots, sem FK
  operador_origem_id/nome, operador_destino_id/nome    -- snapshots, sem FK
  situacao_anterior, situacao_nova
  motivo, observacao
  descricao TEXT NOT NULL                              -- frase pronta
  autor_id, autor_nome, criado_em
  INDEX (numero_id, criado_em DESC)
  INDEX (empresa_id, criado_em DESC)
```

## Permissões

Todas com `tenants = ARRAY['bookplay']`.

| Chave | Padrão | Nota |
|---|---|---|
| `ver_controle_numeros` | ninguém | aba do Núcleo |
| `numeros_administrar` | ninguém | cadastrar celular/número, alterar situação |
| `numeros_liberar_ao_setor` | ninguém | disponibilizar ao setor |
| `numeros_configurar` | ninguém | **explícita** — aponta o setor Núcleo |
| `ver_meus_chips` | todos | aba do setor |
| `chips_escopo_individual` | todos | operador vê o que foi lançado a ele |
| `chips_escopo_setor` | liderança | vê o setor inteiro |
| `chips_lancar_ao_operador` | liderança | |
| `chips_relancar_ao_nucleo` | liderança | |
| `chips_devolver_a_lideranca` | todos | operador solta o número |

`fn_abas_escopo()` ganha `('chips', 'ver_meus_chips')`. A aba do Núcleo **não**
entra no registro de escopo: ela não tem escada — quem é do Núcleo vê a empresa
inteira, e quem não é não vê nada por ali.

As chaves nascem desligadas para cargo existente e são semeadas com o mesmo
laço `DO $semear$` da migration `20260823092000`, senão a ausência vale negado e
o módulo nasce invisível.

## Frontend

```
src/pages/ControleNumeros/
  index.tsx              abas: Celulares · Números · Configuração
  ListaCelulares.tsx     cartão por celular com contador "4/6"
  DialogoCelular.tsx     cadastro/edição (setor travado se tiver número)
  ListaNumeros.tsx       filtro por setor, situação, posse; ação de liberar
  DialogoNumero.tsx      cadastro com validação e aviso de duplicado
  DialogoSituacao.tsx    troca de situação com registro no histórico
  HistoricoNumero.tsx    linha do tempo (reusada pelo Meus Chips)
  PainelConfiguracao.tsx aponta o setor Núcleo

src/pages/MeusChips/
  index.tsx              decide a visão pelo escopo
  VisaoLideranca.tsx     setor inteiro + lançar/relançar
  VisaoOperador.tsx      só os números lançados para ele + devolver
  DialogoLancar.tsx · DialogoRelancar.tsx · DialogoDevolver.tsx

src/hooks/useControleNumeros.ts · src/hooks/useMeusChips.ts
src/services/numeros/
  numeros.service.ts     queries + as 5 RPCs
  numerosFormato.ts      normalizar, validar, mascarar        (puro, testável)
  numerosRegras.ts       LIMITE_POR_CELULAR = 6, transições   (puro, testável)
```

Rotas `/controle-numeros` e `/meus-chips`, cada uma com `ProtectedRoute` e sua
chave. `HistoricoNumero` é o único componente compartilhado entre as duas
páginas — o histórico é o mesmo dado nos dois lados.

### Os três eixos que separam quem vê a aba

O projeto tem três filtros distintos, e confundi-los é erro fácil:

- **`produtos`** (`cobranca` / `comercial` / `rh`) — o produto da empresa.
  Vive em `ProtectedRoute` e em `NAV_ITEMS`. Este módulo é `SO_COBRANCA`: é
  vocabulário da cobrança.
- **`tenants`** (`bookplay` / `pagueplay`) — separa as duas operações de
  cobrança. Vive no catálogo de permissões e decide se a chave sequer aparece no
  painel. As 10 chaves entram com `tenants: ['bookplay']`.
- **`hiddenForPaguePay`** — esconde o item de menu na PaguePlay, o espelho do
  `tenants` do lado da barra lateral.

Os dois itens de `NAV_ITEMS` levam `produtos: SO_COBRANCA`,
`hiddenForPaguePay: true` e a respectiva `permissaoKey`. Nenhuma lista de cargo
na rota: quem abre é a chave, como nas abas já convertidas.

## Risks / Trade-offs

- **`numeros_config` vazia** → nenhuma pessoa é do Núcleo, e o módulo fica
  inerte em vez de aberto. Falha fechada, que é a direção certa. A migration de
  permissões já aponta o setor da BOOKPLAY; se o nome não existir, ela emite
  `RAISE NOTICE` e não inventa setor (mesmo comportamento de `20260823092000`).
- **`setor_id` duplicado no número** → uma cópia pode divergir se alguém
  escrever direto no banco por fora da trigger. Mitigado: a trigger roda em
  `INSERT` e em `UPDATE`, então mesmo escrita manual é corrigida.
- **Operador transferido de setor** com número lançado → o número continua
  apontando para ele em outro setor. Mitigado: `fn_numeros_visivel` exige
  `chips_escopo_individual` **e** o setor bater, então ele deixa de enxergar; a
  liderança vê o número como lançado a alguém de fora e pode devolvê-lo.
- **Migration `20260901200000_rh_min_uuid.sql` está sem commit** na árvore de
  trabalho. Não conflita com este módulo, mas quem aplicar as migrations daqui
  precisa saber que ela está pendente.
- **Histórico cresce sem expurgo.** Aceito: o volume é de dezenas de
  movimentações por número, não milhares. Se virar problema, particionar por ano
  é a saída — e nada aqui impede isso depois.

## Migration Plan

Três arquivos, nesta ordem, e **nenhum é executado sem autorização explícita por
operação** (CLAUDE.md — o banco é produção):

1. `..._numeros_whatsapp.sql` — tabelas, índices, triggers, funções de
   visibilidade e de movimentação.
2. `..._numeros_whatsapp_fluxo.sql` — as 5 RPCs, `ENABLE ROW LEVEL SECURITY` e
   as policies.
3. `..._numeros_whatsapp_permissoes.sql` — `fn_permissoes_catalogo()` com as 10
   chaves, `fn_abas_escopo()` com `chips`, o laço de semeadura, e a linha de
   `numeros_config` apontando o Núcleo da BOOKPLAY.

Rollback: `DROP` das 4 tabelas e das funções `fn_numeros_*`, mais reverter
`fn_permissoes_catalogo()` e `fn_abas_escopo()` para a versão anterior. Nenhuma
tabela existente é alterada, então não há dado de outro módulo em risco.

## Open Questions

Nenhuma. As quatro decisões abertas foram resolvidas em 10/09/2026: config
aponta o setor; só BOOKPLAY; `situacao` e `posse` separados; e a escada
Núcleo → liderança → operador com "Meus Chips" mostrando ao operador apenas o
que foi lançado para ele.
