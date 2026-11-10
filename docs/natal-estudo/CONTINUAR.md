# Estudo do Natal: arte e ideias — onde parou

Ponto de retomada para outra sessão. Escrito em 10/11/2026.

## O pedido

Cleber pediu duas coisas sobre o tema de Natal do Gestão de Acordos:

1. **Exemplos visuais de estilos de arte.** Pegar os elementos do tema (boneco de neve, Papai Noel e os outros) e mostrar tipos diferentes de ilustração que combinariam: mais cartoon, desenhado à mão, pixel art, e o tema atual melhorado.
2. **Ideias do que acrescentar.** Coisas interativas, de cenário ou que acontecem ao acaso, nas abas enfeitadas (Dashboard, Acordos, Analítico) e em outras. A ideia que ele já trouxe: um bonequinho de Natal com a foto de perfil dos diretores e gerentes gerais no lugar da cabeça, escolhidos por ele, aparecendo ao acaso para as pessoas.

## O que foi entregue

Uma página só, com as duas partes e um raio-x do que existe hoje.

- **Publicada (privada, do Cleber):** https://claude.ai/artifact/Bmrb6zANAegtq8TEkYmvHi
- **Fonte:** [`pagina.html`](pagina.html), nesta pasta. É o arquivo que foi publicado, sem `<html>` nem `<body>` (o Artifact põe o esqueleto em volta). Abre direto no navegador assim mesmo.
- **Conferir sem abrir janela:** `node docs/natal-estudo/conferir.cjs`, da raiz. Salva as imagens na pasta temporária do sistema.

Nada do sistema foi alterado. Nenhuma linha em `src/`, nenhuma migration, nenhuma escrita no banco.

### Como republicar a página

Para manter o mesmo link, publicar com a ferramenta Artifact passando o `url` acima e o `file_path` de `pagina.html`. De outra conversa é preciso ler o artifact antes (`action: "read"`), senão a publicação é recusada. Publicar sem `url` cria outro link.

## Estado: aguardando a escolha do Cleber

Ele ainda não respondeu. Antes de desenhar ou programar qualquer coisa, perguntar:

1. **Qual estilo de arte** (ou qual mistura) segue.
2. **Quais ideias** entram, e em que ordem.
3. Se os **quebra-nozes da diretoria** seguem como proposto.

## Parte 1: os oito estilos

Seis personagens (boneco de neve, Papai Noel, urso polar, duende, árvore com presente, e um pinguim que ainda não existe no tema) desenhados com as mesmas formas, trocando só o tratamento.

| Estilo | O que é | Peso em PC fraco | Trabalho para converter |
|---|---|---|---|
| Atual | Vetor chapado, sem contorno. É o que está no ar. | O mais leve | Nenhum |
| Atual+ | O mesmo desenho com degradê, tricô no cachecol, azevinho, neve nos galhos, brilhos | Igual ao atual | Baixo |
| Cartoon | Contorno grosso, cor viva. Já é a linguagem do Grinch e dos duendes | Igual ao atual | Médio |
| Feito à mão | Lápis de cor, traço tremido, hachura, papel | O tremido tem de vir pronto no desenho | Alto |
| Recorte de papel | Camadas com sombra, tons de cartolina | Sombra tem de ser desenhada, não filtro | Médio para alto |
| Massinha | Volume e brilho, como stop-motion | Bom parado; caro de animar | Alto |
| Traço fino | Só linha e o vermelho | Quase nada | Baixo |
| Pixel art | Sprite de 40 × 44 | O mais barato de animar (tira de quadros) | Alto |

**Recomendação dada:** base em Atual+; cartoon só para quem chega fazendo barulho (Grinch, duendes, visitantes novos); feito à mão para tudo que é papel (bilhetes, a carta, o plano de batalha do Kevin, um álbum); traço fino nas abas sem cena e no modo leve; pixel art só se nascer um evento próprio.

### Como a página desenha

Vale saber para mexer em `pagina.html`:

- Cada personagem é uma lista de formas em `PERS` (círculo, elipse, retângulo, caminho, linha), num quadro de 100 × 110 com os pés em y = 100.
- Cada forma pode ter um tipo `k`: `g` chão, `s` sombra, `h` brilho, `x` detalhe extra (só Atual+), `i` miolo sem contorno, `f` traço fino, `px` só no pixel art.
- Cada estilo em `ESTILOS` diz quais tipos ficam de fora (`fora`) e como desenha uma forma (`des`). Degradês, hachuras e filtros compartilhados são criados uma vez no `<svg id="defs">`.
- O pixel art não é desenhado à mão: `pixelDe` desenha as formas num canvas grande, lê o centro de cada ponto de uma grade de 40 × 44, escurece a borda direita e de baixo e contorna.
- Personagem novo: acrescentar em `PERS`. Estilo novo: acrescentar em `ESTILOS`. O resto da página se monta sozinho.

Os desenhos são exemplos para comparar tratamento, feitos de frente e parados. Não são os desenhos do sistema: o urso de lá é de lado e pesca, o boneco desliza e arremessa.

## Parte 2: as ideias

### Quebra-nozes da diretoria (a ideia do Cleber, desenvolvida)

O quebra-nozes foi escolhido porque a cabeça dele é uma peça separada: a foto entra sem parecer montagem, e é um soldado de desfile, combina com quem comanda.

- **Quando aparece:** raro e igual para todos, pelo relógio do Natal (como o urso), duas ou três vezes por dia. E no coral das 16h55.
- **Com motivo:** o setor bateu a meta do dia, o diretor daquele setor aparece e bate palma.
- **Recado:** cada diretor grava até três frases curtas; o balão mostra uma.
- **Onde escolhe:** um card em Config › Geral, ao lado da liberação do Natal, só super admin.
- **Banco:** uma tabela pequena (usuário, frases, ativo) e uma função de leitura. A foto vem do perfil; sem foto, não entra.
- **Cuidado:** boneco digno (nada de dança ou tombo); cada diretor aprova o próprio antes de ir ao ar.

### As sete por onde começar

1. **Pilha de presentes do dia** (Acordos): cada acordo salvo vira um presente debaixo da árvore do chalé.
2. **O coração do Grinch cresce** (Acordos): um arco de quatro semanas, até ele jantar com os duendes.
3. **O pinguim que rouba o peixe** (Analítico): e depois aparece no Dashboard; o urso reclama.
4. **O urso passa a acreditar no boneco** (Analítico): depois que a pessoa faz a cesta.
5. **Coral das 16h55** (todas as abas): mesmo horário para todos.
6. **Natal nos detalhes da interface** (outras abas): só CSS; chega a quem não tem Dashboard.
7. **Último dia útil** (todas as abas): o final do tema em 30/11.

As outras 28 estão na página, no array `IDEIAS` de `pagina.html`, com lugar, esforço (P, M, G), peso e se precisam de banco.

## O que a leitura mostrou

- **Três linguagens de arte convivem.** Boneco, urso e trem são vetor chapado. Grinch e duendes têm contorno grosso. Teteu, Kevin e o rosto do Grinch são foto recortada.
- **A melhor ideia do tema é a fofoca entre abas.** O Grinch invade em Acordos, os duendes contam, o urso comenta no Analítico (`noticiaDoGrinch.ts`, no `localStorage`). É um fio só; quase toda ideia boa puxa esse fio.
- **Foto de perfil é o gargalo.** O trem só leva quem tem foto, e os quebra-nozes também vão exigir.
- **O trem deixou de ser raro.** Cada inscrito viaja duas a três vezes por dia.
- **O gelo termina depois que todo mundo saiu.** O cubo do Teteu derrete até 25/12 (`gelo/degelo.ts`), mas a operação para em dezembro. Em 30/11 terá derretido 29 dos 54 dias.
- **A rádio é uma faixa só**, de 2min11s, em laço o mês inteiro (`musica.ts`).
- **Quase nada reage ao trabalho da pessoa.** Só a árvore da meta, a festa do acordo salvo e o Kevin leem dado real.

### Números do banco (10/11/2026)

Uma leitura, só contagens, autorizada pelo Cleber no pedido («analisa o banco também»). Pela regra do `CLAUDE.md`, essa autorização não vale para outra consulta: é preciso pedir de novo.

| | |
|---|---|
| Liberado para todos | 09/11/2026 |
| Perfis ativos | 502 |
| Ativos com foto de perfil | 305 |
| Passaram pelo presente (`natal_abertura`) | 296 |
| Assistiram ao vídeo até o fim | 206 |
| Pularam | 93 |
| Adiaram ao menos uma vez | 45 |
| Vídeo de Birigui / de Marília | 176 / 120 |
| Inscritos no trem | 144 |
| Viagens sorteadas (09 e 10/11) | 151 |
| Assentos ocupados | 755 |
| Pessoas diferentes que viajaram | 150 |
| Horário do trem | 08:00 às 17:00 |

A consulta, para repetir se ele autorizar:

```sql
SELECT
  (SELECT to_jsonb(l) - 'liberado_por' FROM public.natal_liberacao l) AS liberacao,
  (SELECT jsonb_build_object(
      'linhas', count(*), 'assistiu', count(assistiu_em), 'pulou', count(pulou_em),
      'liberou', count(liberou_em), 'adiou_alguma_vez', count(*) FILTER (WHERE adiou_vezes > 0),
      'video_birigui', count(*) FILTER (WHERE video = 'birigui'),
      'video_marilia', count(*) FILTER (WHERE video = 'marilia'))
   FROM public.natal_abertura) AS abertura,
  (SELECT count(*) FROM public.natal_trem_inscricoes) AS trem_inscritos,
  (SELECT jsonb_build_object(
      'viagens', count(*), 'dias', count(DISTINCT dia), 'primeira', min(dia), 'ultima', max(dia),
      'assentos_ocupados', coalesce(sum(cardinality(passageiros)), 0),
      'pessoas_distintas', (SELECT count(DISTINCT p) FROM public.natal_trem_viagens v2, unnest(v2.passageiros) p))
   FROM public.natal_trem_viagens) AS trem_viagens,
  (SELECT to_jsonb(c) - 'atualizado_por' FROM public.natal_trem_config c) AS trem_config,
  (SELECT inicio FROM public.natal_trem_inicio) AS trem_inicio,
  (SELECT count(*) FROM public.perfis WHERE ativo AND NOT arquivado AND situacao IS DISTINCT FROM 'desligado') AS perfis_ativos,
  (SELECT count(*) FROM public.perfis WHERE ativo AND NOT arquivado AND situacao IS DISTINCT FROM 'desligado'
     AND nullif(btrim(foto_url), '') IS NOT NULL) AS perfis_ativos_com_foto;
```

## O que existe hoje, e onde está no código

Tudo em `src/components/Natal/` (cerca de 110 arquivos). No banco: `natal_liberacao`, `natal_abertura`, `natal_trem_inscricoes`, `natal_trem_viagens`, `natal_trem_config`, `natal_trem_inicio`.

| Onde | O quê | Arquivo |
|---|---|---|
| Todas as abas | Presente, vídeo por cidade, carta | `presente/`, `abertura.ts`, `liberacao.ts` |
| | Trenó com renas (voo sorteado, média de 3 min) | `CenaNatal.tsx` (`RevoadaNatal`) |
| | Globo de neve do chat, gorro nas fotos | `Desenhos.tsx` |
| | Rádio de Natal | `musica.ts`, `BotaoMusicaNatal.tsx` |
| | Marca «Boas Festas», sincelos | `MarcaNatal.tsx`, `Sincelos.tsx` |
| Dashboard | Varal de pisca-pisca, guirlanda, bolas, neve, montes | `CenaNatal.tsx`, `piscaPisca.ts` |
| | Boneco de neve no card | `BonecoDeNeve.tsx` |
| | Bola da saudação e cesta de basquete | `BolaDaSaudacao.tsx`, `cesta/` |
| | Árvore da meta | `ArvoreDaMeta.tsx` |
| | Estação, ticket e sorteio do trem | `trem/` |
| Acordos | Chalé | `chale/Chale.tsx` |
| | Grinch e duendes | `chale/grinch/` (`roteiro.ts` manda) |
| | Festa do acordo salvo | `CenaNatal.tsx` (`Festa`) |
| | Pix: varal, rena de neon, Kevin | `pix/PixNatal.tsx` |
| Analítico | Iglu e urso | `iglu/` (`urso.ts`, `falas.ts`, `espiar.ts`) |
| | Cubo de gelo do Teteu | `gelo/` |

## Regras que valem para o que vier

- **Peso.** O alvo são PCs de 8 GB com vídeo integrado, alguns com 4 GB. Animação de CSS dentro de SVG não vai para a placa de vídeo: pedaço que anima sem fim é uma caixa HTML. Nada de filtro (`drop-shadow`, desfoque, distorção) em peça que anima. Medido em 10/11: o Dashboard caiu de 288 para 155 ms/s.
- **Medir sem abrir janela.** O Edge sem janela usa a placa de vídeo. Janela de verdade, só perguntando antes.
- **Modo leve e «ninguém olhando».** Todo enfeite novo respeita `useModoLeve` e `lib/atencao.ts`.
- **Banco é produção.** Cada consulta e cada alteração precisa do «pode» do Cleber, com o SQL mostrado antes (`CLAUDE.md`).
- **O Natal acaba em 30/11.** Dezembro a operação está de férias.
- **Commit.** Só os arquivos da tarefa, um por um; o trabalho local do Cleber em `videos/` fica de fora.
