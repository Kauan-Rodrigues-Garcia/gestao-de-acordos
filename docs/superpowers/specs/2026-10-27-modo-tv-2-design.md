# Modo TV 2 — design (27/10/2026)

Pedido do Cleber: recriar o Modo TV do arquivo morto, mais simples e bonito.
Templates prontos (ex.: contagem regressiva da meta), atualizando com o
relatório (58/59, Nosso produto ou Cofen), leve para o PC da TV e seguro.

## Decisões (Cleber, 27/10/2026)

| Pergunta | Escolha |
|---|---|
| Escopo | Metas + ranking + mídia (sem jogos, sem alerta ao vivo) |
| Montagem | Rodízio de telas prontas, cada uma em tela cheia |
| Entrada da TV | Código de pareamento (sem login no PC da TV) |
| Alvo | Setor inteiro ou uma equipe |
| Caminho técnico | A: tabelas novas e enxutas; mesa antiga não volta |

## Peças

- **Banco** — `supabase/migrations/20261027170000_modo_tv_2.sql`
  - `tv_paineis`: alvo, tema, unidade (H.O./bruto, só Cofen), segundos por tela, `telas` jsonb (≤ 12).
  - `tv_conexoes`: TV pareada; só o sha256 do token. Desconectar apaga a linha.
  - `tv_numeros_cache`: números por alvo, recalculados no máximo 1×/min.
  - Alcance (`fn_tv_alvo_no_meu_alcance`): super admin tudo; admin/diretoria a empresa;
    gerência o setor; líder/elite o setor e as equipes que lidera. Só líder, elite e acima
    (Cleber, 27/10) — menu e rota por cargo (`CARGOS_MODO_TV`), sem chave no catálogo.
  - Números: `fn_recebido_por_setor` / `fn_recebido_por_equipe` (régua do Painel do
    Líder, com ajuste), dias úteis de `fn_tv_metricas_setor`, meta de `metas`.
    Ranking: top 10 de quem conta no recebimento, linhas do setor (ou da pessoa no
    alternativo/equipe) + ajuste por operador.
  - TV (anon): `fn_tv_conexao_nova` (código 6 dígitos, 15 min, teto de 500 aguardando)
    e `fn_tv_ver(token)` (painel + números). Nada mais é alcançável sem login.
  - Mídia: balde `tv`, pasta `paineis/<id>/`, envio só para quem alcança o painel.
- **Front** — `src/pages/ModoTV/`
  - `templates.ts` (vitrine, opções, `midiaSegura`), `numeros.ts` (visão, H.O.), `TelaTv.tsx`
    (desenho em palco 1920×1080 escalado), `Rodizio.tsx` (TV e prévia), `index.tsx` +
    `Editor.tsx` (montagem), `servico.ts` (banco), `demo.ts`.
  - `src/pages/TvPalco.tsx` em `/#/tv`: código → painel; lê a cada 30 s; segura a
    última tela boa sem rede; wakeLock; cursor oculto. `/#/tv?demo=1` sem banco.

## Editar × no ar (2ª rodada, 27/10)

- Tudo é rascunho até «Publicar na TV». Faixa no topo: amarelo (falta publicar), azul
  (TV pegando a versão nova), verde (TV em dia), cinza (sem TV / TVs desligadas).
- Prévia com duas vistas: «Editando» (rascunho) e «Na TV agora» (publicado, rodando).
- A TV pergunta a cada 5 s `fn_tv_versao` (busca por índice) e relê tudo só quando muda;
  grava `versao_exibida`. `pagehide` chama `fn_tv_sair` → «página fechada» na hora.
  Ligada = sinal < 75 s.
- Tempo por tela (`telas[].segundos`, 5 s a 1 h) além do padrão do painel; «Outro tempo» livre.
- Fixar tela (`tv_paineis.tela_fixa`): controle remoto, vai na hora sem publicar; só tela publicada.
- Lista de painéis agrupada por setor; equipe dentro do setor.

## Templates

Metas: contagem regressiva, barra, anel, meta de hoje (alvo manual opcional), ritmo e
projeção, placar. Ranking: pódio, lista (top 5/10, valor opcional). Mídia: imagem,
vídeo (mudo, laço), recado.

## Segurança

- Token de 244 bits só no navegador da TV; banco guarda o hash; coluna do hash sem
  `SELECT` para ninguém.
- Conectar exige login, alcance do painel e limite de 10 tentativas/min.
- Mídia na parede só do próprio balde (`midiaSegura`); texto passa pelo React (escapado).

## Pendências conhecidas

- Migration **não aplicada**.
- Setor Cofen: conferir no localhost se o recebido da TV bate com o Painel do Líder.
- Ajuste de recebimento com alvo **equipe** pode não entrar no total da equipe se
  `fn_recebido_por_equipe` não o somar (o do setor entra).
