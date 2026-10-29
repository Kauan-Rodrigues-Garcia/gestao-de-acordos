# Afastamentos e pontos de atenção de uso — design (27/10/2026)

Pedido do Cleber: na aba Usuários, avisar o líder de quem está ativo e não abre
o Gestão há dias, para ele classificar (atestado, férias, desligado, ignorar).
Para isso, a situação da pessoa ganha «afastado», com motivo, texto livre e
volta com data ou por tempo indeterminado. Sem falso positivo: ninguém pode ser
acusado de não usar o sistema estando a usar.

## Decisões (Cleber, 27/10/2026)

| Pergunta | Escolha |
|---|---|
| Quem vê e marca | Cada um no seu alcance (escopo da aba Usuários): líder a equipe, supervisão o setor, admin tudo |
| Gatilho | 4 dias úteis SEGUIDOS sem abrir o sistema (menor aprendiz: 5) |
| Ignorar | Zera a contagem; se ficar mais 4 dias úteis sem entrar, avisa de novo |
| Afastado conta no ranking? | Quem classifica escolhe, por afastamento («tirar das contas») |
| Onde mora | Tudo em Usuários; férias, atestado, maternidade etc. no mesmo lugar |
| Caminho técnico | B: tabela `ausencias` (já existe) + situação `afastado` quando sai das contas |

## O modelo

Um afastamento é uma linha em `ausencias`: tipo, início, fim (indeterminado =
`9999-12-31`), observação, `fora_das_contas`, quem lançou.

Por que a data-sentinela e não `NULL`: as funções do Comercial conferem
sobreposição com `fim >= inicio` e recortam o mês com `LEAST(fim, ...)`. Com
`NULL`, um afastamento sem volta deixaria de bloquear um atestado lançado por
cima. Com a sentinela, nada do que já existe precisa ser reescrito; a leitura
(`fn_usuarios_afastamentos`) devolve `NULL` para a tela.

O que ele faz com `perfis.situacao` enquanto está em curso:

| Afastamento | `perfis.situacao` | Efeito |
|---|---|---|
| Férias | `ferias` (+ `ferias_desde/ate`, como hoje) | Igual hoje. Sempre fora das contas |
| Qualquer outro, `fora_das_contas = true` | `afastado` | Tratado como férias: sai de ranking, quartis, desafios, TV |
| Qualquer outro, `fora_das_contas = false` | continua `ativo` | Conta normal; só sai dos pontos de atenção e os dias não contam contra |

Começa no futuro: grava a linha e a situação muda no dia (cron diário). Fim
passou: volta a `ativo` sozinho (cron diário). Indeterminado: só volta quando
alguém encerrar.

Tipos oferecidos (ordem da tela): Férias, Atestado, Licença-maternidade,
Licença-paternidade, INSS, Licença (luto/casamento), Banco de horas,
Suspensão, Outros. Outros exige texto. Padrão de «tirar das contas»: ligado em
Férias (travado), INSS e licenças; desligado no resto. Férias exige data de
volta (regra de 01/09/2026 continua).

`falta`, `abono` e `declaracao` continuam no banco para o Comercial, mas não
aparecem no seletor de Usuários (são de um dia, não afastamento).

## Peças

### Banco — `supabase/migrations/20261028100000_afastamentos_e_atencao_de_uso.sql`

- `perfis_situacao_check` passa a aceitar `afastado`.
- `ausencias_tipos`: entram `licenca_maternidade` e `licenca_paternidade`.
- `ausencias.fora_das_contas BOOLEAN NOT NULL DEFAULT false`; férias gravam `true`.
- `fn_usuarios_afastar(p_operador, p_tipo, p_inicio, p_fim, p_fora_das_contas, p_observacao)`
  — SECURITY DEFINER. Exige `usuarios_administrar` ou `usuarios_editar_do_setor`
  (a mesma porta do seletor de situação de hoje) e a pessoa no alcance do
  escopo `usuarios`. Recusa sobreposição. Aplica a situação se começa hoje ou antes.
- `fn_usuarios_encerrar_afastamento(p_ausencia, p_ultimo_dia)` — fecha o
  período e devolve a `ativo` (se nenhum outro afastamento cobre hoje).
- Cron diário (junto do `ausencias-iniciar-ferias`): inicia afastamentos que
  começam hoje e encerra os vencidos.
- `uso_atencao_ignorados(empresa_id, operador_id, ignorado_por, ignorado_em, comentario)`
  — RLS de leitura pelo alcance; escrita só por `fn_uso_atencao_ignorar`.
- `fn_uso_pontos_de_atencao(p_empresa_id)` — SECURITY DEFINER STABLE, só
  devolve gente do alcance de quem chama. O algoritmo está abaixo.

### O algoritmo (contra falso positivo)

Para cada pessoa:

1. **Quem entra.** Cargo que conta no recebimento (operador, elite), `ativo`,
   `situacao = 'ativo'`, não robô, não arquivado, nome sem «superv» (regra do
   Cleber: conta de supervisão não é pessoa).
2. **Último sinal de uso.** O MAIOR entre: dia em `uso_sessoes` (abriu o
   sistema), dia em `uso_telas` (navegou), `presenca_online.visto_em` (batida
   de 60 s) e `auth.users.last_sign_in_at`. Quatro fontes independentes: uma
   falhar não acusa ninguém.
3. **Ponto de partida.** O MAIOR entre: último sinal, criação da conta, último
   «ignorar» e fim do último afastamento.
4. **Dias que contam.** Dias úteis DEPOIS do ponto de partida e ANTES de hoje
   (hoje ainda não acabou), tirando:
   - sábado, domingo e feriados de `metas_config_mes` da empresa;
   - dias cobertos por qualquer ausência da pessoa (inclusive falta/abono do Comercial);
   - **dias sem telemetria**: dia em que menos de 20% dos operadores ativos da
     empresa tem linha em `uso_sessoes`. Se o registro caiu para todo mundo,
     o dia não acusa ninguém.
5. **Avisa** se os dias que contam ≥ 4 (aprendiz ≥ 5, porque folga terça ou
   quarta e o cadastro não diz qual).

Devolve: pessoa, setor, equipe, dias sem uso, último uso, limite, aprendiz,
último ignorar (quando e comentário).

### Front

- `SituacaoUsuario` ganha `afastado` (rótulo «Afastado», cor própria).
- Seletor de situação na lista: **Ativo · Afastar… · Desligado**. «Afastar…»
  abre `DialogAfastamento` (substitui a caixa de férias de hoje): tipo, texto,
  início (padrão hoje), volta (data ou «tempo indeterminado»), «tirar das contas».
- Etiqueta no nome: «Afastado · Atestado até 05/11» / «· sem data de volta».
  Generaliza `TagFerias`.
- **Pontos de atenção**: faixa no topo da aba Usuários, com contagem; abre a
  lista com «6 dias úteis sem entrar · último acesso 20/10» e as ações
  **Afastar… · Desligar · Ignorar** (ignorar pede comentário curto). Entra
  também como pendência «sem uso» no filtro de pendências que já existe.
- Ficha da pessoa: histórico de afastamentos, com encerrar.
- `?previa=atencao` no localhost: a faixa e o diálogo com dados de mentira,
  para ver o visual antes de a migration estar no banco.

### Quem lê situação e precisa conhecer `afastado`

Onde hoje férias tira a pessoa, `afastado` passa a tirar também:

- Front: `idsOcultosRankingQuartil` e `buscarForaDoRanking`
  (`services/situacaoUsuario.service.ts`), `linhasQuartil.ts`,
  `PerfilContatoPainel.tsx`, `PulsoDeUsuarios.tsx`, contadores e CSV de
  `AdminUsuarios.tsx`, filtro em `usuarios/modelo.ts`, `ListaPessoas.tsx`,
  `FichaPessoa.tsx`.
- Banco: `fn_analitico_ranking_pessoas` (20261023120000), pessoas do Modo TV
  (20261027170000 e 20261027200000).
- Quem filtra `situacao = 'ativo'` (Desempenho Equipes, Painel Diretoria,
  celular) já exclui `afastado` sem mudança — igual férias.
- `composicao_mes.situacao` não tem CHECK; o retrato congela `afastado` como
  congela `ferias`.
- Comercial: o SQL já recorta por `LEAST`; na tela, `acompanhamento.service.ts`
  tira o «até 31/12/9999» e `AcompanhamentoPessoa.tsx` mostra «—» na contagem de dias.

## Testes

- `ausencias.test.ts` já compara a lista TS com o INSERT da migration; os
  tipos novos entram nos dois.
- Validação do diálogo (Outros sem texto, férias sem volta, fim antes do início).
- Leitores: `afastado` some de ranking/quartil como `ferias`.
- Algoritmo: caso a caso numa consulta de conferência que o Cleber roda
  (feriado, ausência no meio, ignorar, conta nova, dia sem telemetria).

## Fora deste trabalho

- Notificação push/chat para o líder (a faixa na tela basta por ora).
- Descontar afastamento da meta da cobrança.
- Saber qual dia o aprendiz folga.

## Banco

A migration NÃO é aplicada por mim. O Cleber aplica (SQL Editor) ou autoriza
explicitamente. Até lá, o localhost mostra a prévia com dados de mentira.
