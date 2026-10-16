# Vídeo de apresentação (operador): onde paramos

Última atualização: 13/10/2026, versão 2.
Branches: `video/apresentacao-operador` (versão 1) e `claude/awesome-cori-bhogly`
(versão 2, por cima da 1).

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

## 3. Versão 2 (o que mudou, pedido do Cleber)

Feedback da versão 1: «as telas não estão fiéis à estética do sistema; parece
outro sistema. Quero no tema claro e quase 100% igual ao sistema (inclusive o
chat)». E depois: «refaz toda a primeira cena, sem o efeito de sumir; fundo
mais claro; a primeira tela do operador é o Dashboard».

- **Tema claro em tudo**, inclusive o fundo do vídeo (claro, com as manchas de
  cor do «fundo vivo» do app do celular).
- **Cena 1 refeita.** A planilha, o relatório 59, o recado e o post-it
  flutuam em volta da pergunta; nada se desfaz. No «Chega» as peças se
  organizam numa pilha, a pilha se recolhe num ponto de luz e dele nascem as
  duas logos, que se juntam no ícone como antes. O efeito Thanos e a poeira
  saíram do projeto.
- **As telas usam o CSS do próprio app.** `npm run css-do-app` copia
  `../src/index.css` (tokens do tema claro, camadas e componentes) e o CSS do
  app do celular para `src/estilo/`; o Tailwind v4 roda no Remotion; as
  classes são as mesmas dos componentes reais (Layout, AnalyticsPanel,
  PainelMetas, FormBP, AcordosTableBody, ModalReagendar, DesempenhoDia, Chat,
  comemoração, /m). Ícones do `lucide-react`, como no app.
- **Telas na ordem real do operador** (BookPlay, Birigui):
  - cena 3: **Dashboard** (saudação, régua Minha visão / Minha equipe / Meu
    setor, cards de meta, rosca, evolução diária);
  - cena 4: Novo Acordo, com o calendário;
  - cena 5: Acordos (Pago, pendente, Reagendar Próxima Parcela);
  - cena 6: gaveta Desempenho do Dia;
  - cena 7: Dashboard trocando para equipe e setor;
  - cena 8: Acordos → WhatsApp → «Qual mensagem mandar?» → conversa aberta;
  - cena 9: o chat interno com o líder;
  - cena 10: «META BATIDA!» com confete e os balões de parabéns;
  - cena 11: o app do celular, com o CSS real dele, e o aviso «Pagamento recebido».
- **Cursor e câmera polidos.** O cursor anda em curva, chega um instante
  antes do clique, aperta e solta uma onda na cor do sistema. A câmera
  enquadra sozinha a área de cada momento (formulário, diálogo, gaveta),
  medida no próprio desenho.
- **Onde clicar é medido, não escrito à mão.** `npm run medir` renderiza a
  parte do app em miniatura e grava em `src/app/alvos.json` onde ficou cada
  elemento com `data-alvo`. Mudou uma tela? Rode de novo.
- **Som:** saiu o chiado de areia; entraram toques de tecla na digitação e um
  «pop» suave nos avisos e janelas. Os efeitos da versão 1 (clique, whoosh,
  sucção, impacto, ding, festa) são os mesmos arquivos.
- As fontes vêm do `@fontsource` (Inter, JetBrains Mono, Caveat, Figtree,
  Bricolage Grotesque): o render não depende de internet.

## 4. O que falta / em aberto

- **Rodada de ajustes finos** com o Cleber passando «segundo + o que mudar».
- **Música de fundo.** As faixas em `Downloads\Musicasss` são comerciais
  (Arctic Monkeys, Marília Mendonça…), com risco de direitos autorais num vídeo
  da empresa. Escolher uma faixa livre de direitos e salvar como
  `public/musica.mp3` (a Trilha abaixa sozinha quando a voz fala).
- **Fora do vídeo (achado na sessão da v1):** migrations com a **mesma
  versão** `20261013180000`: `mestre_59_grava_so_a_diferenca` (aplicada e
  registrada) e `desempenho_dia_escopo` (não registrada; não conferido se foi
  aplicada). É preciso renumerar a `desempenho_dia_escopo`. Para conferir no
  banco: `fn_permissoes_catalogo_antes_desempenho_dia_20261013` existe? Rodar
  só com autorização.

## 5. Comandos

```bash
cd video
npm install                 # 1ª vez (node_modules fica fora do git)
npm run estudio             # editor com linha do tempo no navegador
npm run render              # out/gestao-de-acordos-operador.mp4
npm run medir               # depois de mexer no desenho de uma tela (~3 min)
npm run transcrever         # depois de trocar algum áudio
node scripts/quadros.mjs 600 1500 2400   # quadros soltos em out/quadros/
node scripts/marcos.mjs     # em que frame cai cada cena e cada palavra
node scripts/sons.mjs       # regera os efeitos sonoros
```

## 6. Mapa dos arquivos

| Arquivo | O quê |
|---|---|
| `src/Video.tsx` | monta tudo: fundo, cenas 1–2, SecaoApp, fechamento, trilha |
| `src/linhaDoTempo.ts` | respiro antes e depois de cada voz, `palavra()`, `TOTAL_FRAMES` |
| `src/movimento.ts` | curvas, mola, `entrada`, `saida`, `aperto`, `desfoque` |
| `src/tema.ts` | cores do que fica fora do app, fontes, espera das fontes |
| `src/estilo/` | Tailwind + CSS copiado do app (`app.css`, `mobile*.css`, gerados) |
| `src/cenas/Cena01Problema.tsx` | cena 1: pergunta, peças do jeito antigo, pilha |
| `src/cenas/Cena02Virada.tsx` | logos → ícone → nome |
| `src/cenas/SecaoApp.tsx` | cenas 3–11: janela, câmera, cursor, telas, celular, manchetes |
| `src/app/Casca.tsx` | menu lateral e cabeçalho (o `Layout.tsx` do app) |
| `src/app/paginas/` | Dashboard, NovoAcordo, Acordos, DesempenhoDia, Chat, WhatsApp, Comemoracao |
| `src/app/roteiro.ts` | quando cada clique acontece, rota do cursor e câmera |
| `src/app/dados.ts` | os dados fictícios (contas coerentes entre si) |
| `src/app/alvos.json` | onde fica cada `data-alvo` (gerado por `npm run medir`) |
| `src/componentes/Celular.tsx` | o app do celular (`/m`) na cena 11 |
| `src/Trilha.tsx` | voz, efeitos, música com abaixamento automático |
| `webpack.mjs` | Tailwind, alias `@/` para o `src/` do app, React único |
