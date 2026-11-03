# Halloween 2026 (o tema, o Mural de Outubro, o Jumpscare e o álbum de insígnias)

**Arquivado em:** 03/11/2026
**No ar desde:** 01/10/2026 (migration `20261001140000_halloween_preferencias`)
**Último commit com tudo no ar:** `8030860` (main, 03/11/2026)

## O que era

Tudo o que o Halloween de outubro de 2026 pôs no sistema:

- **O tema** (`src/components/Halloween/`): teias, aranha, chuva com trovão,
  nuvens, névoa, fantasmas, o vulto atrás do vidro, a lanterna, os morcegos, os
  chapéus de bruxa nas fotos (chat e lista de pessoas), a abóbora no lugar da
  bolha do chat, a marca do menu em Creepster e o cartaz «Procura-se». Valia só
  em outubro (`temporadaHalloween`), depois que o super_admin liberava em
  Configurações → Geral (`LiberacaoHalloween`). Cada pessoa podia desligar em
  «Detalhes de Halloween», no botão de tema. Recolhia sozinho em máquina sem
  placa de vídeo (`aguenta.ts`) e no modo leve.
- **A mensagem de outubro** (`BoasVindasHalloween`): o envelope com trilha
  própria, uma vez por pessoa, que segurava o tema até o «Ler agora».
- **O Mural de Outubro** (`src/components/PortalOutubro/`, 26–31/10/2026): o
  bueiro na semana, a abertura, a Coisa, o mural de Derry, a invasão, a
  cerimônia das Lendas de Outubro e o prêmio sorteado no banco
  (`MuralOutubroConfig` em Configurações → Geral).
- **O Jumpscare** (`src/components/Jumpscare/`, 23/10/2026): a imagem em tela
  cheia para todos num horário marcado (`JumpscareConfig`).
- **O álbum de insígnias** (`src/components/Insignias/`): as medalhas
  penduradas no topo (zumbi, Rei do Pop, bruxas, Pântano, Cavalo da Guerra) e as
  Lendas de Outubro. Tinha voltado ao código vivo em 20/10/2026, quando a Caça
  saiu (ver [`caca-zumbis-bruxas/`](../caca-zumbis-bruxas/README.md)); agora
  saiu de vez.
- **Os temas de terror do Som ambiente**: Hello Zepp (Saw), Dead Silence, Every
  27 Years (IT), Halloween (John Carpenter) e Stranger Things, e a lápide
  «RIP PLAYER» (`PlayerSeFoi`) que quem não era super_admin via no lugar do
  player.

## Por que saiu

Decisão do Cleber, 03/11/2026: acabou outubro, tudo do tema de Halloween sai
para o arquivo morto — de um jeito que dê para pôr de novo exatamente igual.

## O que veio para cá

```
src/components/Halloween/                 o tema, a mensagem, o cartaz, fonte.ts, aguenta.ts (e os testes)
src/components/Halloween/SomAmbiente/PlayerSeFoi.tsx   a lápide do player
src/components/PortalOutubro/             o Mural de Outubro e a Coisa
src/components/Jumpscare/                 o jumpscare
src/components/Insignias/                 o álbum, as Lendas e os desenhos (zumbis, bruxas, chefões)
src/components/admin/LiberacaoHalloween.tsx, JumpscareConfig.tsx, MuralOutubroConfig.tsx
lab-portal.html, lab-coisa.html, lab-lendas.html   os laboratórios (só no npm run dev)
public/sons/coisa/                        os sons da Coisa
public/sounds/halloween-tema.mp3          a trilha da mensagem de outubro
public/sounds/halloween-{saw-hello-zepp,dead-silence,it-every-27-years,john-carpenter,stranger-things}.mp3
public/sounds/capas/{saw,deadsilence,it27,halloween,stranger}.jpg
public/fonts/{rye,special-elite,caveat}.woff2   as fontes do cartaz «Procura-se»
supabase/sql_scripts/notificar_sons_halloween_2026_10_05.sql
```

Cada arquivo está byte a byte como estava no commit `8030860`, no mesmo
caminho relativo.

## O que continuou vivo, e o que mudou nele

- **O Som ambiente** saiu de `components/Halloween/SomAmbiente/` para
  `src/components/SomAmbiente/`, sem os temas de terror (a aba «Temas» sumiu do
  painel). O padrão passou de «Halloween» para «300 no 7», e quem estava com um
  tema de terror cai nela (`SUBSTITUTAS`). Antes ele só aparecia em outubro,
  junto do tema; agora fica o ano todo — **só para o super_admin**, como estava
  desde 23/10/2026 (os demais viam a lápide, que veio para cá). Para dar aos
  demais, monte `<BotaoSomAmbiente>` sem `completo` no `Layout`.
- **As músicas do player** perderam o prefixo: `public/sounds/halloween-veigh-clickbait.mp3`
  virou `public/sounds/veigh-clickbait.mp3`, e assim as quinze. As festas da
  Comemorações guardam só o id da faixa, então nada quebrou; festa que estava
  com um tema de terror toca o som do catálogo.
- **A Sirene** usava `semPlacaDeVideo` de `aguenta.ts`: a função foi copiada
  para `src/lib/semPlacaDeVideo.ts`.
- **O tema `halloween` do Desafio** (cartaz com teia e morcegos) continua como
  opção; ele pegava a Creepster de `Halloween/fonte.ts`, e a declaração foi
  para dentro de `pages/Analitico/Desafios/EnfeiteHalloween.tsx`. A fonte
  (`public/fonts/creepster.woff2`) ficou.
- **O Cavalo da Guerra** (Corrida) solta uma medalha que voava para o álbum. As
  regras `.ins-medalha` que ela usa foram copiadas para
  `Corrida/guerra/guerra.css`; sem o álbum, ela voa para o meio do topo. O
  evento `insignia-ganha` continua sendo disparado, sem ninguém ouvindo.
- **Também ficaram como opção**, por decisão do Cleber: a pista «Noite
  Assombrada» da Corrida, o tema «Halloween» do Desafio e o papel de parede
  «Halloween» da Comemorações. São itens de catálogo, como o «Ano novo».

## O que foi removido do código vivo

- `src/components/Layout.tsx`: as camadas do tema (`FundoHalloween`,
  `CamadaHalloween`, `SobreposicaoHalloween`, `RevoadaHalloween`), a
  `MarcaHalloween`, a mensagem de outubro, o `TemaHalloweenContext`, o
  `<PortalDeOutubro>`, o `<JumpscareOverlay>`, o `<BotaoInsignias>`, o
  interruptor no `<ThemeToggle>` e o `<PlayerSeFoi>`.
- `src/pages/AdminConfiguracoes.tsx`: `<LiberacaoHalloween>`, `<JumpscareConfig>`
  e `<MuralOutubroConfig>`.
- `src/components/ThemeToggle.tsx`: o item «Detalhes de Halloween».
- `src/components/Chat/BolhaChat.tsx`: a abóbora no lugar da bolha.
- `src/components/Chat/comum.tsx` e `admin/ListaPessoas.tsx`: o `<ComChapeu>`.
- `src/pages/Mobile/comum/ChatDoApp.tsx`: o contexto do tema no app.
- `src/components/AcordoNovoInline/index.tsx`: o `avisarAcordoSalvo()` (a chuva
  de doces).
- `src/index.css`: a exceção do Mural (`data-portal-anima`) no Modo leve.
- `src/lib/__tests__/painel-manda.test.ts`: a exceção de `Halloween/preferencia.ts`.
- Comentários que citavam o tema (OnboardingTour, CrachaPendente, modoLeve).

## Como restaurar

Do zero, numa árvore limpa (nada por commitar):

```bash
bash arquivo-morto/halloween/restaurar.sh
```

O script aplica `restaurar.patch` (o caminho inverso de tudo o que mudou no
código vivo: Layout, Configurações, chat, botão de tema, os temas de terror e o
lugar do Som ambiente, o nome das músicas) e devolve cada arquivo daqui ao
caminho original com `git mv`. Depois:

1. `git rm -r arquivo-morto/halloween` e tirar a linha dele do índice em
   `arquivo-morto/README.md`;
2. `npm run typecheck && npm test`;
3. o tema só aparece em **outubro** (`temporadaHalloween` em
   `Halloween/preferencia.ts`) e depois de liberado. Para outra data, é ali que
   se mexe. O Mural tem as datas dele em `PortalOutubro/fases.ts`.

O resultado foi conferido no dia do arquivamento: aplicado sobre o commit do
arquivamento, o código fica idêntico ao `8030860`.

### Se o patch não aplicar

O patch é contra o código de 03/11/2026. Se o Layout (ou outro arquivo da
lista acima) mudou depois, o `git apply --check` recusa e o script para sem
mexer em nada. Aí:

- `git apply --3way arquivo-morto/halloween/restaurar.patch` tenta mesclar e
  marca os conflitos; ou
- pegue o arquivo como era direto do histórico — `git show 8030860:src/components/Layout.tsx`
  — e refaça à mão as partes do Halloween.

## O que ficou de propósito

**O banco inteiro.** Nada foi rodado contra o banco. Continuam lá:

- `halloween_liberacao`, `fn_halloween_liberar`, `fn_halloween_avisar` e as
  colunas `perfis.halloween_desligado` e `perfis.halloween_boas_vindas_em` —
  restaurado o código, a liberação e a escolha de cada pessoa voltam como
  estavam;
- `jumpscare`, o bucket `jumpscare` e as funções `fn_jumpscare_*`;
- `mural_outubro`, `mural_outubro_lendas` e as funções `fn_mural_outubro_*` e
  `fn_mural_lendas_*` (o prêmio das Lendas sorteado);
- o que o álbum lê: `abobora_rodadas`, as rodadas do chefão e da chefona e
  `fn_corrida_guerra_insignias` (a Corrida continua usando).

As migrations continuam em `supabase/migrations/` (`20261001140000`,
`20261023160000`, `20261029120000`, `20261029233000`, `20261029235000`,
`20261030120000`). Sem o código ninguém vê nada disso, mesmo com o Halloween
«liberado» e o Mural «solto».
