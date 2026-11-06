# Previsão do tempo no Calendário — design (06/11/2026)

Pedido do Cleber: previsão do tempo no Calendário do setor, com desenho
animado no estilo gibi, um por condição e variações por estação; visível no
botão do topo e ao abrir o calendário; Birigui vê Birigui, Marília vê Marília;
animações leves que respeitem «reduzir movimento»; atualizar para todos sem
multiplicar chamadas de API.

## Decisões

| Ponto | Decisão |
|---|---|
| Quanto mostrar | Agora + hoje detalhado + 5 dias seguintes |
| Onde | Botão próprio no topo, colado ao do Calendário (mesmo traço e paleta do mês): personagem + temperatura. O clique abre só o card do tempo. O calendário não tem nada do tempo (revisão do Cleber, 06/11: a coluna do lado já estava cheia) |
| Card | Temperatura, condição e máx/mín no alto, FORA do desenho; depois o cenário sozinho; sensação, chuva, umidade, vento; 5 dias |
| Quem vê | Quem está logado, mesmo sem calendário |
| Desenho | Botão e faixa de dias: personagem com carinha. Caixa: cenário da estação com o personagem grande no céu |
| Cidade | Do setor (`setores.cidade_id` › `rh_celulas.nome`). Sem cidade, ou outra cidade: Birigui |
| Fonte | MET Norway (api.met.no): grátis inclusive para uso comercial, sem chave; pede User-Agent, cache e crédito. O Open-Meteo foi descartado por ser grátis só para uso não comercial |

## Dados

- `api/clima.ts` (Vercel): `GET /api/clima` busca as duas cidades no MET e
  devolve `{ fonte, geradoEm, cidades: { birigui, marilia } }`, já traduzido
  para o vocabulário do app (`limpo`, `poucas_nuvens`, `nublado`, `neblina`,
  `garoa`, `chuva`, `chuva_forte`, `tempestade`).
- Cache na CDN: `s-maxage=1800, stale-while-revalidate=3600`. Todos os
  usuários recebem a mesma resposta; o MET recebe ~2 rodadas por hora. Uma
  cidade falhando: `s-maxage=300`. As duas: 502 `no-store` (a CDN segue com a
  última boa).
- Sem banco, sem sessão, sem Realtime, sem migration.
- Navegador: `useClima(setorId)` — uma busca por aba (`lerComCache`),
  relê a cada 30 min e na volta à aba se passou disso; falha fica com a última
  boa. `lib/cidadeDoSetor.ts` é a leitura da cidade, compartilhada com
  `useMarca`.

### Tradução do MET

- Cada passo cobre o período seguinte (`next_1_hours`, senão `next_6_hours`);
  período contado uma vez.
- Dia pelo horário de Brasília (UTC-3 fixo).
- Máx/mín: temperaturas do instante + máx/mín de seis horas do dia.
- Condição do dia: a mais forte do dia; chuva com menos de 1 mm no dia não
  conta como dia chuvoso.
- Noite: pelo sufixo do símbolo (`_night`/`_day`), senão pela hora (18h–6h).
- O dia de hoje só tem o que falta dele (o MET começa na hora corrente).

## Desenho

`src/components/Calendario/clima/`:

- `personagens.tsx` — sol (acessório por estação, 2 variações: óculos/chapéu,
  folha/boné, cachecol/gorro, flor/flores; sua a partir de 32°), lua dormindo
  de gorro, nuvens com expressão por condição. Quadro 64×64, contorno e
  acessórios na paleta do tema do mês.
- `cenarios.tsx` — 300×150: céu pela condição e hora, retícula, estrelas,
  nuvens de fundo, chuva, neblina, clarão; chão `morro` / `cidade` / `campo`
  com cores da estação (inverno seco com ipê-roxo, primavera com ipê-amarelo).
  De noite o chão escurece e janelas e poste acendem.
- Sorteio: `varianteDoDia(data, semente)` — mesmo desenho para todos no dia.
- `CaixaDoTempo.tsx` (o card, só desenho), `BotaoDoTempo.tsx` (botão + card
  que desce, fecha no clique fora/Esc), `BotaoClima.tsx` (lê a previsão e
  baixa o card só no primeiro clique). O `BotaoCalendario` devolve os dois
  botões lado a lado, sem mexer no `Layout`.

## Movimento

Só CSS (`transform`, `translate`, `opacity`). Roda MESMO com «reduzir
animações» do Windows ligado (revisão do Cleber, 06/11, como o Bingo); quem
desliga é o Modo leve (`html[data-leve]` › `animation-name: none`). Parado, o
desenho está completo. No card, laço enquanto está aberto; no botão do topo,
o personagem entra com um pulinho e fica parado, mexendo só com o mouse em
cima.

## Fora do escopo

Alerta de tempestade, push, previsão hora a hora, outras cidades, banco.

## Testes

- `src/services/clima.api.test.ts` — símbolos, dias, chuva sem contar duas
  vezes, noite, cache e falhas da rota.
- `src/lib/__tests__/clima.test.ts` — cidade, estação, sorteio, textos.
- `src/hooks/__tests__/useClima.test.tsx` — cidade do setor, busca única,
  releitura de 30 min, última boa.
- `src/components/Calendario/clima/__tests__/BotaoDoTempo.test.tsx` — abre o
  card, fecha no Esc e no clique fora.
- Lab: `lab-calendario.html?clima=chuva&noite=1&estacao=inverno&chao=cidade&temp=31&tempo=1&galeria=1`.
