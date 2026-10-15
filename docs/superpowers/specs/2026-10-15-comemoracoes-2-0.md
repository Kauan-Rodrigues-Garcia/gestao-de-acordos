# Comemorações 2.0 — design

**Data:** 15/10/2026 · **Pedido:** Cleber · **Estado:** em teste (só super_admin)
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

## Pendente

- Aprovar o visual e liberar a 2.0 para todos (tirar o portão de super_admin em `pages/Comemoracoes/index.tsx`).
- Aplicar a migration (com autorização) e cadastrar `GIPHY_API_KEY` na Vercel.
- "Quem bateu a meta" ainda cruza metas com o Analítico pela empresa inteira, sem separar por regra do setor (Cofen × Nosso produto). Ver `CLAUDE.md`.
