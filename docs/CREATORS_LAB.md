# Creators Lab — manual de manutenção

Área escondida do Gestão de Acordos, dedicada a Kauan e Cleber.
Tudo vive em `src/pages/CreatorsLab/`, mais dois arquivos fora dela.

---

## Como se chega lá

**Cinco cliques rápidos no logo**, em até 3 segundos. Passou disso, o contador
zera. Um clique não abre; cinco cliques lentos também não.

O logo reage progressivamente: nada, nada, leve aumento, falha curta,
interferência forte. No quinto, **a tela do Gestão escurece** por
`DURACAO_ESCURECIMENTO_MS` (1,15 s) e só então a rota muda.

| Onde | Arquivo |
|---|---|
| A regra de tempo | `src/hooks/useEasterEggCriadores.ts` |
| O gatilho e o escurecimento | `src/components/Layout.tsx` (procure `abrindoLab`) |
| A animação de falha | `src/index.css`, classes `creators-logo-*` |

> ⚠️ O hook **precisa** ser chamado no corpo de `Layout`, nunca dentro de
> `SidebarContent`. Aquele componente é declarado dentro do `Layout` e usado
> como `<SidebarContent />` — a identidade da função muda a cada render, o React
> remonta tudo, e o contador nunca passaria de 1.

### Por que o escurecimento

Sem ele, o quinto clique trocava uma lista de acordos por uma tela de terminal
em um quadro — o que o olho lê como defeito, não como passagem. O `Layout`
anima três camadas (preto, interferência, risco de tubo desligando) e usa a
**mesma constante** no atraso da navegação, para os dois nunca saírem de
sincronia. O Lab já abre em preto, então a emenda é invisível.

### O distintivo é da pessoa, não do navegador

Depois da primeira descoberta o logo ganha um `✦` discreto. Essa marca vem da
tabela `creators_lab_progresso` (ver *Progresso na conta*), com `localStorage`
servindo só de resposta imediata enquanto a rede não volta.

`false` do servidor significa **"não sei"** — tabela não migrada, sessão
expirada, offline — e nunca apaga a marca de quem já a tinha. Há teste para
isso.

---

## Onde editar o conteúdo

**Um arquivo só: `creators.config.ts`.** Nenhum componente tem texto pessoal
dentro dele.

| O que | Onde |
|---|---|
| Nome, função, bio, foto | `CRIADORES[].nome / papel / sobre / foto` |
| Habilidades (barras) | `CRIADORES[].habilidades` — `nivel` de 0 a 100 |
| Curiosidades | `CRIADORES[].curiosidades` |
| Filmes, jogos, música | `CRIADORES[].categorias[].itens` |
| Contatos | `CRIADORES[].contato` |
| Projetos | `PROJETOS` |
| Números do projeto | `PROJETO_REAL` |

### Placeholders

O que ainda não foi informado usa `PENDENTE('descrição')`. A interface mostra
esses campos como lacuna marcada, **nunca inventa texto**.

```ts
papel: PENDENTE('função do Kauan'),   // aparece como ⚠ na tela
papel: 'Desenvolvedor Full Stack',    // aparece normalmente
```

Para preencher: troque a chamada `PENDENTE(...)` pelo texto real.

### Fotos

Coloque em `public/creators/` e aponte:

```ts
foto: '/creators/kauan.jpg',
```

Sem foto, o card mostra as iniciais. Não quebra.

### Adicionar um filme

```ts
{
  id: 'blade-runner',        // único
  titulo: 'Blade Runner 2049',
  simbolo: '🎬',             // usado enquanto não houver imagem
  imagem: '/creators/posters/br2049.jpg',   // opcional
  nota: 9,
  descricao: '...',
  porQue: '...',
  curiosidade: '...',        // opcional
}
```

---

## Movimento — leia antes de "consertar"

**O Lab não obedece sozinho ao `prefers-reduced-motion`. É de propósito.**

O Lab abria com tudo animado em casa e **completamente parado** em dois
computadores do trabalho. Ninguém tinha mexido em acessibilidade: o Windows
10/11 traz *Efeitos de animação* desligado em boa parte das imagens
corporativas, e com ele desligado o navegador responde
`prefers-reduced-motion: reduce`. Uma `@media` no CSS zerava
`animation-duration` e `transition-duration` de tudo, com `!important`, sem
botão nem aviso.

A regra que ficou:

| | |
|---|---|
| Padrão | movimento **completo**, em qualquer máquina |
| Quem decide | a pessoa, pelo botão `◉ / ◐` na `BarraLab` |
| O sistema | **oferece** uma vez, e a resposta fica guardada |
| Onde o CSS lê | `data-movimento="reduzido"` na raiz do Lab |

O Gestão continua respeitando a preferência normalmente — a exceção vale só
aqui, numa área escondida que se abre de propósito. A única outra exceção é a
falha do logo (`creators-logo-*` em `index.css`), porque sem ela o Easter Egg
ficava inencontrável justamente nas máquinas dessas pessoas; ela só dispara a
partir do terceiro clique rápido e dura 0,22 s.

> ⚠️ Se você acrescentar `@media (prefers-reduced-motion)` a
> `creators-lab.css`, o teste `theme/__tests__/movimento.test.tsx` quebra. Ele
> existe exatamente para isso.

---

## Progresso na conta

Tabela `creators_lab_progresso` — migration `20260816210000`. Uma linha por
usuário, com o objeto `Progresso` em `jsonb`. RLS fecha por padrão e cada
pessoa só enxerga a própria linha.

Fluxo: ao abrir, o provider lê o remoto e **junta** com o local por
`mesclarProgresso` — lista vira união, número vira o maior, booleano vira
"algum dos dois". Progresso não retrocede: ninguém des-descobre um Easter Egg.
Depois disso, toda mudança é gravada com 1,2 s de espera.

O que volta do banco passa por `normalizarProgresso` antes de ser usado: é
`jsonb`, pode estar velho ou editado à mão, e uma linha estragada tem que virar
progresso zerado em vez de página quebrada.

> Tudo aqui tolera a tabela **não existir**: entre o deploy do front e a
> aplicação da migration existe uma janela, e nela o Lab segue em localStorage.
> `src/services/creatorsLab.service.ts` nunca lança.

---

## Painel de descobridores

`sections/HallDescobridores.tsx`. Lista quem achou o Lab, na ordem de chegada,
com o **primeiro sempre em destaque** — card maior, moldura própria, e o lugar
não muda mais.

Quem fica de fora, e a decisão é toda do servidor
(`fn_creators_lab_selar_descoberta`, migration `20260816220000`):

| Fora | Por quê |
|---|---|
| `super_admin` e `administrador` | contas que existem para operar o sistema, não para usá-lo |
| quem acessou antes de 16/08/2026 | eram os testes do próprio desenvolvimento — ocupariam o 1º lugar |
| outra empresa | multi-tenant; misturar BookPlay e PaguePlay seria vazamento |

A elegibilidade é decidida **uma vez, na descoberta**, e o gatilho a congela no
UPDATE. Quem descobriu como operador e virou líder continua no painel: ele conta
o que aconteceu, não o organograma de hoje. Para mudar quem fica de fora, a
lista está numa linha só, dentro do gatilho.

A regra está escrita na tela, embaixo da lista — painel de honra com critério
secreto gera conversa de corredor.

> As duas listas (painel e ranking) saem por `security definer`, não por
> `select`. A RLS só deixa cada um ver a própria linha, corretamente; o recorte
> "mesma empresa, só nome e foto" precisa ficar num lugar auditável em vez de
> montado pelo cliente.

---

## Máquina de fliperama

Um quebra-blocos de verdade, em `sections/ArcadeCabinet.tsx`. O gabinete
(cabeça inclinada, marquise iluminada, grade de alto-falante, moldura funda,
painel de controle com manche de bola vermelha, ranhura de ficha e pés) é CSS
em `components/GabineteFliperama.tsx`; a tela é `<canvas>` 240×320 esticado com
`image-rendering: pixelated`. Referência: arte vetorial de gabinete retrô azul —
o corpo é azul no Arcade e chumbo no Cyberpunk, que não tem azul na paleta.

### Uma ficha por pessoa

A linha em `creators_lab_fliperama` nasce quando a partida **começa**, não
quando termina. É o que fecha a brecha óbvia: jogar, ver que o placar ficou ruim
e recarregar antes de morrer. O preço é que abandonar no meio queima a ficha do
mesmo jeito — e por isso o aviso está na tela **antes** de o botão aparecer.

| Garantia | Onde |
|---|---|
| segunda partida impossível | chave primária é `usuario_id` |
| placar/vidas/tempo zerados no início | gatilho `BEFORE INSERT` |
| partida encerrada não reabre | gatilho recusa UPDATE com `finalizado_em` preenchido |
| tempo não vem do cliente | gatilho calcula de `iniciado_em` até `now()` |
| ficha queimada não se apaga | nenhuma política de DELETE |

Ficha encontrada em aberto ao carregar a página **não** deixa continuar: o
estado do jogo mora no navegador, então "continuar" seria sempre "recomeçar". A
tela reconhece o abandono e encerra em zero.

Sem a migration aplicada, o serviço devolve `indisponivel` e a máquina entra em
**modo livre**: joga à vontade, nada é registrado.

### Ranking

`fn_creators_lab_ranking`. Ordem: zerou a máquina → pontos → menos vidas
gastas → menos tempo → `usuario_id` (só para o empate ser estável entre duas
consultas). Ordenado no banco, não no cliente: é lá que estão todas as linhas.

### O prêmio

Quem zera ganha três coisas: a conquista `arcade-master`, a **coroa 👑** ao lado
do nome no ranking e no painel de descobridores, e o comando `premio` no
terminal desta página — que só responde a quem ganhou, não aparece no `help` dos
outros e não é oferecido pelo Tab. O texto do prêmio está em `lib/terminal.ts`,
`case 'premio'`.

### A câmera

Ao inserir a ficha, o gabinete sai do fluxo da página e vem para a frente:
`lib/enquadramento.ts` mede onde ele está e devolve translação e escala; a curva
é `easeInOutQuint` (`0.83, 0, 0.17, 1`) — começa devagar, acelera no meio,
desacelera no fim. Ao terminar, o caminho é o mesmo ao contrário.

Enquanto focado, a página fica travada (`overflow: hidden`): com o gabinete
deslocado por `transform`, rolar o levaria embora. A medida é refeita no
`resize`, senão girar o celular no meio da partida deixaria a máquina fora da
tela.

> ⚠️ **Empilhamento.** A cortina é `position: fixed` e vive dentro de
> `.creators-lab__conteudo`, nem fora nem dentro da seção. Fora, cobriria todo
> o conteúdo (aquele elemento tem `z-index: 1` e é contexto de empilhamento);
> dentro da seção, o `transform` de entrada da seção viraria o bloco de
> contenção do elemento fixo. E o `z-index: 61` do gabinete fica no elemento
> **animado** que o envolve — quem carrega o `transform` carrega o contexto.

**A regra do jogo está em `lib/fliperama.ts` e não conhece canvas nem React.**
`avancar(estado, dt, entrada)` é pura: nada lê relógio, sorteia ou escreve
fora do estado devolvido. É o que permite jogar uma partida inteira num teste,
em milissegundos, sem tela.

Detalhes que os testes trancam:

- `DT_MAX` limita o passo. Sem ele, uma aba que dormiu 4 s volta com `dt = 4` e
  a bola atravessa parede, tijolo e chão sem tocar em nada.
- **Um tijolo por quadro.** Dois no mesmo passo inverteriam o mesmo eixo duas
  vezes e a bola seguiria em frente.
- `ANGULO_MIN` (10°) impede a devolução perfeitamente vertical. Com a raquete
  exatamente sob a bola, ela subiria e desceria na mesma coluna para sempre — a
  partida ficava sem fim. Quem joga acompanhando a bola com o mouse cai nisso
  sem querer.
- Bater na parede **reposiciona** além de inverter, senão a bola encravada fica
  tremendo lá dentro.

Zerar a tela desbloqueia `arcade-master`. O recorde fica em
`creatorsLab:fliperamaRecorde`.

O laço para sozinho quando a aba some (`visibilitychange`) **e** quando o
gabinete sai da tela (`IntersectionObserver`) — as duas condições, porque
nenhuma cobre a outra.

---

## Theme Engine

Dois temas: **Cyberpunk** e **Arcade**. Toda diferença entre eles vive em
`theme/themes.ts` — cor, fonte, raio, sombra, duração, textura, cursor e o
**vocabulário** (a mesma seção se chama `DATABASE` num e `CHARACTER SELECT` no
outro).

### A regra que separa os dois

A primeira versão errou aqui: ciano e magenta contra amarelo e vermelho, mesma
grade, mesma varredura, mesmo brilho. Trocar de realidade mudava o texto e
quase nada mais.

| | Cyberpunk | Arcade |
|---|---|---|
| Dominante | amarelo `#FCEE0A` | magenta `#FF3DCB` |
| Fundo | preto puro | roxo profundo |
| Forma | chanfro, tarja de perigo, HUD | bloco, sombra dura, CRT abaulado |
| Tipo | condensada (Bahnschrift) | pesada (Impact) |
| Tempo | desliza (0,45 s) | estala (0,22 s) |

**Amarelo é exclusivo do Cyberpunk** — `theme/__tests__/temas.test.ts` falha se
alguém puser amarelo no Arcade, se as dominantes chegarem perto no círculo
cromático, ou se alguma cor for repetida nos dois. Ciano aparece nos dois de
propósito: é secundária em ambos, e o que separa os mundos é a dominante, o
fundo e a forma.

> Se você encontrar `tema === 'cyberpunk'` dentro de um componente, faltou um
> token. Acrescente o token em vez de espalhar a condicional.

As cores viram variáveis CSS `--creator-*` aplicadas **no elemento raiz do Lab**,
nunca em `:root` — é isso que impede o tema de vazar para o Gestão.

### Criar um terceiro tema

1. Copie um `TokensTema` em `themes.ts`;
2. acrescente em `TEMAS` e `LISTA_TEMAS`;
3. pronto — a seleção de realidade e a barra o encontram sozinhas.

---

## Conquistas

Regras puras em `lib/conquistas.ts`. Para criar uma:

1. acrescente o id em `IdConquista`;
2. acrescente o objeto em `CONQUISTAS` (`secreta: true` aparece como `🔒 ???`);
3. acrescente a condição em `conquistasDesbloqueadas()`.

O progresso é gravado em `localStorage` (`creatorsLab:progresso`) e alimentado
por `registrar({...})`, disponível em `useCreators()`.

> Cuidado com a armadilha do "abriu tudo": condições sobre listas precisam
> exigir `total > 0`, senão a conquista cai sozinha quando não há nada para
> abrir. Há teste para isso.

---

## Terminal

`lib/terminal.ts`. **Lista branca de comandos — nada é executado.** Sem `eval`,
sem `Function`, sem shell, sem rede.

Para criar um comando:

1. acrescente o nome em `COMANDOS_VALIDOS`;
2. acrescente um `case` em `interpretar()`;
3. se precisar mexer na tela, devolva um `efeito` — quem executa é
   `sections/SecretTerminal.tsx`.

> Não afrouxe essa regra. É um brinquedo dentro de um sistema que guarda dado de
> cobrança, escondido num lugar onde ninguém procuraria uma porta aberta.

---

## Mini projetos

`components/MiniApps.tsx`. As contas são funções puras exportadas e testadas.

Para adicionar:

1. escreva a função pura e o componente no mesmo arquivo;
2. acrescente o id em `ProjetoArquivo['miniApp']` (`creators.config.ts`);
3. acrescente o projeto em `PROJETOS` com esse `miniApp`;
4. ligue o componente em `sections/ProjectArchive.tsx`.

---

## 3D e partículas

**Não há Three.js.** O 3D é Canvas 2D com projeção escrita à mão em
`lib/projecao3d.ts` — rotação, perspectiva e ordenação por profundidade.

Motivos: não adicionar centenas de kB a um pacote já apontado como pesado;
fallback mais simples (Canvas 2D não depende de driver como WebGL); e, sobretudo,
porque **uma página que demonstra matemática não deveria importar a matemática**.

### Desligar

| O quê | Como |
|---|---|
| Partículas | `sections/`… remova `<CampoParticulas>` de `index.tsx`, ou passe `ativo={false}` |
| Núcleo 3D | remova `<NucleoHolografico>` de `sections/CreatorsHero.tsx` |
| Densidade no celular | a constante `densidade` em `index.tsx` |

Ambos já param sozinhos quando a aba está escondida, e somem com
`prefers-reduced-motion`.

---

## Isolamento

- Todo seletor de `creators-lab.css` começa com `.creators-lab`;
- as variáveis de tema são aplicadas no elemento raiz do Lab, não em `:root`;
- as três classes do logo (`creators-logo-*`) vivem em `index.css` porque quem
  as usa é o `Layout`, que nunca importa o CSS do Lab. O prefixo garante que não
  alcancem mais nada.

---

## Custo para quem nunca entra

A rota é `lazy()`, e partículas entram por `import()` dinâmico depois disso. Na
medição de 16/08/2026 o pacote principal foi de **598,76 kB para 600,25 kB** —
1,5 kB, que é o próprio `lazy`. Quem usa o Gestão e nunca descobre o Easter Egg
não baixa o Lab.

---

## Testes

```
src/pages/CreatorsLab/lib/__tests__/     matematica, projecao3d, conquistas,
                                          terminal, miniApps, fliperama,
                                          enquadramento, regras-no-banco
src/pages/CreatorsLab/theme/__tests__/   movimento, temas
src/hooks/__tests__/useEasterEggCriadores.test.ts
```

223 testes. Os que mais importam:

- **as regras do painel e da ficha estão no SQL, não no front** —
  `regras-no-banco.test.ts` lê a migration e confere gatilho, imutabilidade,
  ausência de política de DELETE e o recorte por empresa. A migration é aplicada
  à mão, então esta é a única verificação automática que ela tem;
- **o `help` e o Tab não entregam o comando `premio`** a quem não zerou;
- **a câmera não vira `Infinity`** quando o gabinete ainda não tem medida;

- **cinco cliques lentos NÃO abrem** — evita abertura acidental;
- **o sistema pedindo redução, o Lab abre animado** — o defeito dos dois
  computadores do trabalho, trancado;
- **o CSS do Lab não tem `@media (prefers-reduced-motion)`** — guarda de
  arquivo, porque media query roda antes de qualquer JavaScript;
- **resposta negativa do servidor não apaga o distintivo local**;
- **amarelo é exclusivo do Cyberpunk** e nenhuma cor se repete nos dois temas;
- **uma partida inteira termina** — 120 s de jogo simulados provam que não
  existe estado de onde nada mais sai;
- **um quadro gigantesco não teleporta a bola**;
- **o terminal não executa nada** — inclusive `eval`, `require`, `DROP TABLE`;
- **repulsão com distância zero** não vira infinito nem `NaN`;
- **conquista não cai de graça** quando não há conteúdo para explorar;
- **o icosaedro** tem 12 vértices equidistantes e usa φ.
