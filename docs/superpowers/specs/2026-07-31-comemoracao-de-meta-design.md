# Comemoração de Meta — design

**Data:** 31/07/2026 · **Estado:** aprovado, não implementado

Aba nova **"Comemorações"** (`/comemoracoes`), visível de **líder pra cima**. O líder
monta uma comemoração para quem bateu a meta e dispara; ela **explode no topo-centro**
da tela de quem for do escopo, com texto, GIF, som e duração configurável — no estilo
dos alertas de live da Twitch. Quem vê pode clicar em "Parabenizar", e os parabéns
sobem como balões pelas laterais da tela de todo mundo.

Vale para PaguePlay e BookPlay.

---

## 1. O que já existe e será reaproveitado

Nada aqui é construído do zero:

| Peça | Onde já existe |
|---|---|
| Overlay em qualquer página | `NotificacaoToast`, montado no `Layout` |
| Som sintetizado, falhando em silêncio | `src/lib/som-notificacao.ts` |
| Realtime com canal compartilhado | `assinarTabela` (`src/lib/realtime.ts`) |
| Upload para o Storage | bucket `perfis`, padrão usado em 3 telas |
| Animação | `framer-motion` |
| Setor e clones do operador | `perfis.setor_id`, `equipe_operadores_clones` |

---

## 2. Decisões e o porquê

**Arquitetura: tabela + realtime + timer no cliente.**
A comemoração é uma linha em `comemoracoes` desde a criação, não desde o disparo —
por isso o agendamento sai de graça, sem peça nova. Todo cliente logado assina a
tabela; ao receber a linha, agenda um timer local para `inicia_em`. Quem abre o
sistema no meio também vê, porque busca as que estão em janela.

*Descartado — broadcast puro:* o navegador do líder teria que estar aberto na hora
agendada, quem entra no meio não vê nada, e **broadcast não passa por RLS**: o filtro
por setor teria que ser no cliente, ou seja, mandar a comemoração para todo mundo e
pedir que finjam não ver.

*Descartado — pg_cron:* resolveria o relógio do cliente, mas exige a extensão
habilitada, tem granularidade de 1 minuto e é uma peça móvel a mais. O desvio de
relógio se resolve mais barato: comparar uma vez o `now()` do banco com o local.

**Vários homenageados = um card só.** Três pessoas em fila, com duração de 1 minuto,
dariam 3 minutos de tela ocupada.

**Parabéns = balões subindo pelas laterais.** Aguenta o setor inteiro clicando junto
sem virar parede de texto no centro da tela.

**Escopo por setor, considerando clones.** Vê quem está no setor do homenageado ou num
setor onde ele tem clone. Clone é por **equipe** (`equipe_operadores_clones`), e a
equipe é que pertence a um setor. A flag `conta_recebimento` é **ignorada** aqui: ela
decide soma de dinheiro, não quem é colega de quem.

**Editor: arrastar livre, posições em % de um card de proporção fixa.** Nunca pixels.
Editor e exibição usam **o mesmo componente**, com prop `modo: 'editor' | 'exibicao'`.
Se fossem dois componentes, divergiriam na primeira mudança — e o líder descobriria
isso com a comemoração já na tela de todo mundo.

**O botão Testar não toca no banco.** O card é montado no navegador de quem clicou, a
partir de dados que ele já tem. Sem INSERT, sem realtime. É o que torna impossível um
teste escapar para a tela dos outros.

---

## 3. Dados

```
comemoracoes
  id, empresa_id, criado_por
  titulo, mensagem
  gif_midia_id, som_midia_id        → comemoracao_midias
  layout JSONB                       → posição/escala de cada elemento
  inicia_em TIMESTAMPTZ
  duracao_s INT                      → 5..60
  setores_alvo UUID[]                → congelado por trigger na criação
  cancelada_em TIMESTAMPTZ
  criado_em

comemoracao_homenageados
  comemoracao_id, operador_id        → PK (comemoracao_id, operador_id)

comemoracao_parabens
  comemoracao_id, usuario_id, frase, criado_em
  PK (comemoracao_id, usuario_id)    → um parabéns por pessoa, garantido pelo banco

comemoracao_midias
  id, empresa_id (NULL = catálogo global), tipo ('gif'|'som')
  nome, url, padrao BOOL, criado_por, criado_em
```

`setores_alvo` é preenchido por trigger a partir dos homenageados. Congelar o público
na criação evita que um operador que muda de setor entre o agendamento e a hora troque
a plateia no meio do caminho.

**Storage:** bucket `comemoracoes`, **5 MB para GIF e 1 MB para som**, validados na
policy — no front seria só sugestão.

### Visibilidade

Duas regras diferentes, de propósito:

| Onde | Regra |
|---|---|
| RLS de SELECT | meu setor ∈ `setores_alvo` **ou** eu criei **ou** sou líder+ |
| Overlay (explode) | só se meu setor ∈ `setores_alvo`, ou eu criei |
| Aba Comemorações | tudo que a RLS deixar — líder+ vê o que outro líder agendou |

O líder+ enxerga todas as comemorações na aba, mas só recebe o popup das que são do
setor dele. Como ele tem direito de leitura, filtrar a exibição no cliente aqui não
vaza nada.

Função auxiliar, usada pelo trigger:

```sql
-- fn_setores_do_operador(p_operador UUID) RETURNS SETOF UUID
SELECT setor_id FROM perfis WHERE id = p_operador
UNION
SELECT e.setor_id
  FROM equipe_operadores_clones c
  JOIN equipes e ON e.id = c.equipe_id
 WHERE c.operador_id = p_operador
```

### Permissão

`lider, elite, gerencia, diretoria, administrador, super_admin` — a mesma lista de
`PERFIS_VISAO_GERAL_WPP`. Espelhada na RLS e travada por um teste que **lê a migration**
e compara com as constantes do front, como o `permissoes.test.ts` já faz. É o que evita
repetir o problema das permissões mortas do Admin → Cargos.

---

## 4. Componentes

```
src/pages/Comemoracoes/
  index.tsx              lista (agendadas / realizadas) + botão Nova
  EditorComemoracao.tsx  controles à esquerda, preview à direita
  CardComemoracao.tsx    modo 'editor' | 'exibicao'  ← o mesmo nos dois lugares
  BibliotecaMidia.tsx    catálogo + upload + prévia + remover
  escopo.ts              setores alvo, quem vê            (puro, testável)
  janela.ts             está rolando? já acabou? fila     (puro, testável)
  frases.ts              sorteio das frases de parabéns   (puro, testável)

src/components/ComemoracaoOverlay.tsx   montado no Layout, vizinho do NotificacaoToast
src/hooks/useComemoracoes.ts            realtime, timers, fila
src/services/comemoracoes.service.ts
```

A lógica pura sai dos componentes para poder ter teste, seguindo o que já foi feito em
`leitura.ts` e `scroll-conversa.ts`.

### Editor

Card de **proporção fixa (640×360 lógicos)**, escalado por CSS. Elementos
posicionáveis: título, mensagem, GIF e o bloco de fotos+nomes. Cada um guarda `x`, `y`
e `escala` em percentual; texto guarda tamanho e cor.

Arrastar **não sai do retângulo**. Sem esse limite o líder posiciona o GIF pela metade
para fora, acha que ficou estiloso, e na tela dos outros vira um GIF cortado.

### Exibição

Ao montar, busca o que está em janela e agenda os timers do que começa em breve.
Duas comemorações no mesmo horário **viram fila** — sobrepostas no topo-centro seriam
ilegíveis.

Três decisões de convivência, porque isso aparece em cima de gente trabalhando:

- **O card não bloqueia cliques.** `pointer-events: none` no card, exceto no botão.
  Senão a comemoração de 1 minuto trava quem está tabulando.
- **Botão de mudo por usuário**, guardado no navegador. Tem gente em ligação, e som
  surpresa em cima de uma negociação é problema real.
- **GIF pré-carregado** antes de o card entrar, senão a animação começa com um
  retângulo vazio.

---

## 5. Limites

| O quê | Valor | Por quê |
|---|---|---|
| Duração | 5 a 60 s | abaixo de 5 ninguém lê o nome |
| Homenageados | até 12 | acima disso o card vira mosaico ilegível |
| Agendamento | até 7 dias, nunca no passado | agendar para daqui a três meses é esquecer |
| GIF | 5 MB | trava a tela de quem tem internet ruim |
| Som | 1 MB | idem |
| Parabéns | 1 por pessoa | PK composta |

Cancelar preenche `cancelada_em`; o realtime tira da fila de todo mundo.

---

## 6. Quando algo falha, a festa continua

- GIF não carrega → card aparece sem ele.
- Som bloqueado pelo navegador → silêncio, mesma regra do `som-notificacao.ts`.
- Realtime cai → `onReconectado` refaz a busca de janela.
- Clique duplo em parabenizar → a PK barra no banco; o botão vira "Parabenizado ✓".
- Relógio do cliente adiantado → corrigido pelo desvio medido contra o banco.

---

## 7. Testes

**Puros:** escopo de setores (incluindo clones), janela de exibição, fila, sorteio de
frase, limites de duração e de homenageados.

**Componente:** overlay entra e sai no tempo, botão de parabenizar, editor não deixa
arrastar para fora.

**Permissão:** teste que lê a migration e compara os cargos com o front.

---

## 8. Ordem de entrega

Três fases, sem cortar escopo:

1. **O coração.** Tabelas, RLS, overlay, disparo imediato, card com layout padrão,
   catálogo de GIF e som. No fim disso já dá para comemorar de verdade.
2. **O líder no controle.** Aba Comemorações, editor com arrastar, preview ao vivo,
   upload de mídia própria com prévia, botão Testar.
3. **O resto.** Agendamento e os balões de parabéns.

A fase 1 entrega valor sozinha e valida a parte mais arriscada — o disparo chegando na
tela certa. Editor e agendamento são trabalho grande em cima de uma base já vista
funcionando.
