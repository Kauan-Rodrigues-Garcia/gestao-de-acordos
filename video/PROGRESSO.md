# Vídeo de apresentação (operador): onde paramos

Última atualização: 13/10/2026, fim da sessão.
Branch: `video/apresentacao-operador`.

## 1. Objetivo

Um vídeo curto, no estilo "demo de produto", para apresentar o Gestão de
Acordos ao **operador**. A referência é o botão «Assistir vídeo» de
foodshare.com.br: um cursor que clica, as telas que abrem e animações limpas.

Escopo combinado com o Cleber:

- Só o operador, só a regra de negócio **Nosso produto**. O vídeo não fala de
  regra; a Cofen vai num vídeo separado, depois.
- O operador aparece vendo o recebimento dele, o da equipe e o do setor.
- Abertura: a logo **verde** (PaguePlay, Marília) e a **azul** (BookPlay,
  Birigui) se juntam no ícone do app, e o ícone se expande na tela do sistema.
- Cena 1: planilha, relatório e recados se desfazem como no "efeito Thanos".
- Narração gerada pelo Cleber no ElevenLabs v4, um áudio por cena.
- Dados sempre fictícios. Nada vem do banco.

## 2. Roteiro gravado (textos exatos dos áudios)

| Cena | Fala |
|---|---|
| 1 | Quanto você já recebeu hoje? Sabe me falar de cabeça? |
| 2 | Chega de perder tempo procurando informação. Com o Gestão de Acordos, tudo chega até você em instantes. |
| 3 | Seu dia já começa organizado. Em um sistema onde cada detalhe faz uma diferença positiva. |
| 4 | Fechou com cliente? Registre o acordo em segundos. Valor, parcelas, vencimento... Salvo? Pronto! |
| 5 | Cada acordo fica na sua mão. Pago, pendente e, se precisar, reagenda com dois cliques. |
| 6 | E o melhor, você acompanha quanto já recebeu e quanto falta para bater a meta, atualizado o dia todo. |
| 7 | Quer saber como está a sua equipe e o seu setor? Está tudo aqui, e você sabe exatamente onde está! |
| 8 | Quer mandar um lembrete para o cliente? Tem mensagem pronta! Um clique e já está no WhatsApp! |
| 9 | Precisa do seu líder? Fala com ele sem sair do sistema. |
| 10 | E quando a meta vem, todos comemoram com você! |
| 11 | No computador ou no celular. |
| 12 | Gestão de Acordos, ajudando você a bater sua meta. |

Os áudios originais estão em `C:\Users\multiplay\Downloads\Musicasss\Cenas\Cena N.mp3`.
As cópias usadas pelo vídeo estão em `public/audio/cena-XX.mp3`.

## 3. O que está feito

- Projeto Remotion 4.0.535 nesta pasta, com `package.json` próprio. Ele não
  mexe no app.
- O vídeo tem 82 s, 1920×1080, 60 fps.
- **Versão 1 renderizada** em `out/gestao-de-acordos-operador.mp4` (49 MB). A
  pasta `out/` não vai para o git; para gerar de novo, use `npm run render`.
- **A voz comanda o tempo.** `npm run transcrever` roda o Whisper localmente,
  mede cada áudio e grava `src/duracoes.json` e `src/tempos.json`. Cada clique
  e cada animação está preso a uma palavra, por exemplo
  `palavra('cena-04', 'salvo')`.
- **Diretrizes de motion pedidas pelo Cleber, todas aplicadas** (em
  `src/movimento.ts`):
  - curva cubic-bezier(0.25, 1, 0.5, 1), sem nada linear;
  - mola com cerca de 3% de overshoot;
  - clique que aperta 1 → 0,95 → 1,02 → 1 em 150 ms, com uma onda de luz;
  - elementos entrando escalonados, 40 ms um do outro, subindo 18 px;
  - desfoque de movimento de 2 a 4 px no cursor;
  - o destaque do menu desliza de um item para o outro;
  - o ícone se transforma na janela, sem corte.
- **Abertura.** O efeito Thanos é um filtro SVG (ruído + rampa) em
  `src/componentes/Desintegrar.tsx`. A poeira é desenhada em canvas e forma as
  logos (`src/componentes/Poeira.tsx`).
- **Som.**
  - Efeitos sintetizados por `scripts/sons.mjs`: clique, areia, sucção,
    impacto, whoosh, ding e festa.
  - Também entram dois sons reais do app: `notificacao.mp3` e
    `chat-notificacao.mp3`.
  - A música de fundo é opcional, em `public/musica.mp3`. A Trilha abaixa o
    volume dela automaticamente quando a voz fala.

## 4. Onde paramos: feedback do Cleber sobre a versão 1

> As telas do sistema no vídeo **não estão fiéis à estética do sistema**;
> parece outro sistema. Quero no **tema claro** e **visualmente quase 100%
> igual ao sistema** (inclusive o chat). Pode ter detalhes mínimos diferentes.

Na versão 1, as telas das cenas 3 a 11 (`src/app/`) foram desenhadas à mão, no
tema escuro, só parecidas com o app. É isso que precisa ser refeito.

## 5. O que falta

### 5.1 Refazer as telas fiéis ao sistema, no tema claro (prioridade)

Plano combinado:

1. Ligar o Tailwind v4 no Remotion (`@remotion/tailwind-v4`) e importar **o
   mesmo CSS do app** (`../src/index.css`), com tokens, Inter + JetBrains Mono
   e tema claro.
2. Montar as telas com **os componentes reais** de `../src/components/ui`
   (shadcn: button, card, badge, table, tabs, input, avatar, progress…).
   Copiar a estrutura das páginas reais e trocar os hooks e o Supabase por
   dados fictícios. Referências:
   - `src/components/Layout.tsx` e `src/lib/menuLateral.ts`: menu e cabeçalho;
   - `src/pages/Acordos/index.tsx`, `src/components/AcordoNovoInline`,
     `src/components/ModalReagendar.tsx`;
   - `src/components/DesempenhoDia/`, `src/pages/Dashboard/`,
     `src/pages/CampanhasWhatsapp/`;
   - `src/components/Chat/` (BolhaChat, Conversa) e `src/components/comemoracao/`.
3. A tela «Início» da cena 3 **foi inventada e não existe no sistema**. Trocar
   pela tela que o operador vê de verdade ao entrar.
4. Manter a coreografia da versão 1: cursor, câmera, palavras de sincronia e
   manchetes no topo. O que muda é o visual das telas. Os pontos clicáveis
   ficam em `src/app/layout.ts` e `src/app/roteiro.ts` e precisam ser
   reposicionados nas telas novas.
5. Decidir se o fundo do vídeo (hoje escuro, com luzes verde e azul) continua
   escuro com a janela clara, ou se fica claro também.

**Está bloqueado esperando um destes dois:**

- **Prints das telas reais no tema claro**, enviados pelo Cleber (caminho
  recomendado):
  1. tela inicial do operador, com menu e cabeçalho;
  2. Novo Acordo;
  3. Acordos e o Reagendar;
  4. Desempenho do Dia;
  5. Dashboard (equipe/setor);
  6. Campanhas de WhatsApp;
  7. chat aberto;
  8. comemoração de meta;
  9. app no celular.

  Os prints são só referência: o vídeo continua com dados fictícios.
- **Ou** autorização explícita para rodar o app local logado. O app aponta
  para o banco de produção, então isso significa dados reais, e o CLAUDE.md
  exige um «pode» explícito.

### 5.2 Outros pontos em aberto

- **Música de fundo.** As faixas em `Downloads\Musicasss` são comerciais
  (Arctic Monkeys, Marília Mendonça…), com risco de direitos autorais num vídeo
  da empresa. O Cleber precisa escolher uma faixa livre de direitos e salvar
  como `public/musica.mp3`.
- **Cena 1.** A planilha verde e o relatório são de propósito o "jeito antigo",
  não o sistema. Confirmar com o Cleber se a crítica ("quando vai mostrar ali a
  planilha") era sobre a cena 1 ou sobre a tabela de Acordos.
- Depois de refazer: fazer uma rodada de ajustes finos, com o Cleber passando
  "segundo + o que mudar", e renderizar a versão 2.

## 6. Comandos

```bash
cd video
npm install                 # 1ª vez (node_modules fica fora do git)
npm run estudio             # editor com linha do tempo no navegador
npm run render              # out/gestao-de-acordos-operador.mp4 (~10 min)
npm run transcrever         # depois de trocar algum áudio
node scripts/quadros.mjs 600 1500 2400   # quadros soltos em out/quadros/ para conferir
node scripts/marcos.mjs     # em que frame cai cada cena e cada palavra
node scripts/sons.mjs       # regera os efeitos sonoros
```

Na primeira vez, `npm run transcrever` baixa o whisper.cpp e o modelo `small`
para `.whisper/`, que fica fora do git.

## 7. Mapa dos arquivos

| Arquivo | O quê |
|---|---|
| `src/Video.tsx` | monta tudo: fundo, cenas 1–2, SecaoApp, fechamento, trilha |
| `src/linhaDoTempo.ts` | respiro antes e depois de cada voz, `palavra()`, `TOTAL_FRAMES` |
| `src/movimento.ts` | curvas, mola, `entrada`, `saida`, `aperto`, `desfoque` |
| `src/tema.ts` | cores e fontes (hoje no tema ESCURO; vai mudar) |
| `src/cenas/Cena01Problema.tsx` | cena 1, com as posições dos emissores de poeira |
| `src/cenas/Cena02Virada.tsx` | logos → ícone → nome |
| `src/cenas/SecaoApp.tsx` | cenas 3–11: o ícone vira a janela, câmera, cursor, celular, manchetes |
| `src/cenas/Comemoracao.tsx`, `Cena12Fechamento.tsx`, `Manchete.tsx` | — |
| `src/app/` | **o app desenhado à mão (o que vai ser refeito)** + `roteiro.ts` (cliques, câmera) |
| `src/Trilha.tsx` | voz, efeitos, música com abaixamento automático |

## 8. Fora do vídeo (achado na mesma sessão)

- Migrations com a **mesma versão** `20261013180000`:
  `mestre_59_grava_so_a_diferenca` (aplicada e registrada, conferido em 13/10)
  e `desempenho_dia_escopo` (não registrada; não conferido se foi aplicada). É
  preciso renumerar a `desempenho_dia_escopo`. Para conferir no banco:
  `fn_permissoes_catalogo_antes_desempenho_dia_20261013` existe? Rodar só com
  autorização.
