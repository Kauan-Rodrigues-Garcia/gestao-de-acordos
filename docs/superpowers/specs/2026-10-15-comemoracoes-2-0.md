# Comemorações 2.0 — design

**Data:** 15/10/2026 · **Pedido:** Cleber · **Estado:** oficial desde 15/10/2026 (para quem tem `comemoracoes_gerenciar`; o editor 1.0 está em `arquivo-morto/comemoracoes-1.0`)
**Sucede:** `2026-08-01-comemoracoes-v2-design.md` no visual; as regras de plateia, volume, agendamento e clone continuam as mesmas.

## O que muda

| Antes (1.0) | Agora (2.0) |
|---|---|
| Texto solto sobre a tela, chuva de confete atrás | **Card sólido** com papel de parede; o efeito estoura na chegada e acaba |
| GIF/imagem enviados pela empresa (cota de 30, validade de 3 dias) | **GIF buscado no GIPHY**; sem GIF, um **troféu desenhado em SVG** |
| Formulário longo numa página só | **Estúdio em 7 etapas**, uma aberta por vez, cada uma com resumo |
| Prévia pequena ao lado | **Palco grande** com arrasto, tamanho por elemento e "Ver animação" |
| Lista das últimas 24 h | **Agenda e histórico** de 30 dias, com miniatura, busca e **Duplicar** |

## Peças

- `src/components/comemoracao2/design.ts` — o contrato do card: elementos, arranjos, letras, entradas, efeitos, leitura saneada do JSON (`designDoJson`). Só aceita GIF de `*.giphy.com`.
- `src/components/comemoracao2/papeisDeParede.ts` — 18 fundos em CSS, em 6 temas. Cada fundo traz as cores do texto.
- `src/components/comemoracao2/CardV2.tsx` — o card, usado na festa, no palco e nas miniaturas. Caixa lógica de 640×400 escalada inteira.
- `src/components/comemoracao2/CenaV2.tsx` — como a festa aparece. O `ComemoracaoOverlay` desenha a 2.0 quando a comemoração tem `design`, e a 1.0 quando não tem.
- `api/gifs.ts` — ponte com o GIPHY. Chave só no servidor (`GIPHY_API_KEY`), exige sessão do Supabase, classificação `g`.
- `src/services/gifs.service.ts` — busca salva primeiro (`comemoracao_gif_buscas`, 7 dias), GIPHY depois. Sem a tabela, guarda no `localStorage`.
- `src/pages/Comemoracoes2/` — o estúdio e o histórico.
- `lab-comemoracao.html` — vitrine sem banco (`npm run dev` → `/lab-comemoracao.html`).

## Banco

Migration `20261015120000_comemoracoes_2_0.sql` (**não aplicada**):

1. `comemoracoes.design jsonb` — NULL = comemoração 1.0.
2. `comemoracao_gif_buscas` — buscas salvas por empresa e termo, RLS igual às outras tabelas de comemoração.

Sem a migration: o estúdio abre, o **Testar** funciona (é local), e o **Comemorar** avisa que a migration falta. As buscas salvas ficam só no navegador.

## Compatibilidade

A 2.0 grava também as colunas da 1.0 (`efeito`, `anim_texto`, `som`, `volume`...). Quem ainda roda o app antigo vê a festa no card antigo, sem o GIF, até a 2.0 ir para produção.

## Ajustes do primeiro teste (15/10/2026, tarde)

- **Fotos de quem bateu:** formato (redonda/quadrada), tamanho (pequena a gigante) e moldura (cor do fundo, branca, dourada, neon, sem). Ficam em `design.fotos`; card antigo sem o campo sai como sempre saiu.
- **Tamanho direto no palco:** o elemento selecionado ganha alças nos cantos (`escalaPelaAlca`); a barra de porcentagem saiu. Selecionar as fotos abre as opções de foto embaixo do palco.
- **Animação em todos os PCs:** a festa, o efeito, o troféu e as prévias ignoram o "reduzir movimento" do sistema e o modo leve (`MotionConfig reducedMotion="never"` no overlay e no estúdio).
- **Prévia sozinha:** trocar a entrada ou o efeito toca a prévia no palco, com o efeito por cima do card.
- **Separação por setor** (`pages/Comemoracoes2/alcance.ts`): líder e elite só escolhem pessoas, equipes e setor do próprio setor (cadastro + equipes que lideram), veem só o histórico do setor e só as músicas do setor. Gerência para cima vê a empresa.
- **GIFs entre empresas:** buscas salvas e "Usados recentemente" valem para todas as empresas.
- Migration `20261015180000_comemoracoes_2_0_setor_e_gifs.sql` (**não aplicada**): `comemoracao_midias.setor_id` (preenchido por trigger, com as músicas atuais indo para o setor de quem enviou), leitura de `comemoracao_gif_buscas` entre empresas, tabela `comemoracao_gifs_usados` + RPC `fn_comemoracao_gif_usado`. Sem ela: a biblioteca de músicas mostra só o que a própria pessoa enviou para quem tem setor, e "Usados recentemente" cai nos GIFs das comemorações da empresa.

## Parabéns refeito (15/10/2026)

`components/comemoracao/PainelParabens.tsx` + textos em `pages/Comemoracoes/parabens.ts`, usado pela 2.0 e pela 1.0:

- **Convite** grande logo abaixo do card, pulsando, com chamada que se reveza e fala diferente para pessoa, grupo, equipe e setor ("Sua equipe…"/"Nosso setor…" para quem é do time). O clique estoura confete no botão, que vira "Você parabenizou…".
- **Frases** sorteadas por tipo de festa (`FRASES_POR_ALVO`), gravadas na linha como antes.
- **Mural "Quem já parabenizou"** para todo mundo, até a festa acabar: o mais novo entra em destaque por 4 s; os seis mais novos com frase, o resto como rostos. Sem contador. Saíram os balões que subiam e sumiam.
- **Festejado** vê "Seus colegas estão te parabenizando!" no lugar do botão.
- **Testar** mostra o convite e o mural: o clique e os colegas de mentira (`COLEGAS_DO_ENSAIO`) ficam só na tela de quem testa.
- O nome da equipe/setor vem de `buscarNomeDoAlvo` (30 min de cache; falhou = convite genérico).

## Som e parabéns em fila (15/10/2026, fim do dia)

- **Trecho da música** (`pages/Comemoracoes2/TrechoMusica.tsx`): a linha do tempo da música com a janela da duração da festa; o começo fica em `design.somInicioS` (por festa, não por música) e o `buscarComemoracoes` o prefere ao `inicio_s` da música.
- **Músicas do player** (`components/comemoracao2/musicasDoPlayer.ts`): as faixas de fábrica do Som ambiente, todas numa lista, com capa. A festa guarda o id em `design.somFaixa`; o volume leva o ganho de loudness da faixa (`volumeComGanho`). Faixa que sair do app cai no som do catálogo. Playlists de YouTube ficam de fora.
- **Volume** padrão e recomendado: 15% (a trava da meta de setor também), com o aviso fixo embaixo da barra.
- **Parabéns em duas filas** ao lado do card (`FilasParabens`), entrando devagar e alternando os lados; em tela estreita, uma fileira embaixo do botão.

## Pendente

- Aplicar a migration (com autorização) e cadastrar `GIPHY_API_KEY` na Vercel.
- "Quem bateu a meta" ainda cruza metas com o Analítico pela empresa inteira, sem separar por regra do setor (Cofen × Nosso produto). Ver `CLAUDE.md`.
