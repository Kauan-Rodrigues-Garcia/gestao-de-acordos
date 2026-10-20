# Caça aos Zumbis e Caça às Bruxas (e o álbum de insígnias)

**Arquivada em:** 20/10/2026
**No ar desde:** 05/10/2026 (migration `20261005120000_caca_abobora`)

## O que era

A gincana do Halloween, ligada pelo super_admin em Configurações → Geral:

- **Caça aos Zumbis** (até 07/10/2026, Caça à Abóbora): um zumbi escondido num
  canto livre da tela; quem acertava primeiro ganhava a faixa no topo por 10 min.
- **O chefão** (o Rei do Pop zumbi, 09/10/2026) e **a chefona** (a Bruxa do
  Pântano, 15/10/2026), com lobby, contagem, música e a luta de todo mundo junto.
- **Caça às Bruxas** (14/10/2026): bruxas na vassoura no lugar dos zumbis.
- **O álbum de insígnias** (19/10/2026): as medalhas penduradas no topo, uma por
  gincana completada. As quatro medalhas eram da Caça (zumbi, Rei do Pop,
  bruxas, Pântano) e o álbum desenhava a arte dos zumbis e das bruxas — sem a
  Caça ele não tinha o que mostrar nem como desenhar.

**O álbum voltou para o código vivo no mesmo 20/10/2026**, sem a
Caça: está em `src/components/Insignias/` e mostra as medalhas que as
gincanas já gravaram no banco. Os desenhos que ele usa (zumbis, Rei do Pop,
bruxas, a placa do Minecraft) foram copiados para
`src/components/Insignias/desenhos/`; os originais seguem aqui, para a Caça
continuar inteira. A releitura ao vivo (pegou o zumbi, o chefe caiu) não voltou.

## Por que saiu

Decisão do Cleber, 20/10/2026: a parte do zumbi e da bruxa sai para o arquivo
morto. A gincana da vez passa a ser a Corrida da Sorte
(`src/components/Corrida`), com o card em Configurações → Geral.

## O que veio para cá

```
src/components/CacaAbobora/            a caça, o chefão, as bruxas, a chefona e o lobby dela (e os testes)
src/components/admin/CacaAboboraConfig.tsx   o card da aba Geral
lab-bruxas.html, lab-bruxa-lobby.html  os laboratórios (só no npm run dev)
public/sons/minecraft/                 os sons da chefona
public/sons/musica/the-mad-king.mp3    a música do lobby da chefona
docs/CACA-ZUMBIS-EM-ANDAMENTO.md, docs/CACA-BRUXAS-PLANO.md
```

`public/` e `docs/` vieram junto porque só a Caça usava esses arquivos. Para
restaurar, devolva cada pasta ao mesmo caminho na raiz do projeto.

## O que foi removido do código vivo

- `src/components/Layout.tsx`: `<FaixaDaCaca>`, `<AboboraDaCaca>`, `<BotaoChefao>`,
  `<BotaoInsignias>` e os atributos que só a Caça lia (`data-palco-abobora`,
  `data-chefona-livre`, `data-alvo-feitico`).
- `src/pages/AdminConfiguracoes.tsx`: o `<CacaAboboraConfig>`.
- `data-alvo-feitico` em `pages/Acordos/AcordosTableBody.tsx`,
  `pages/Acordos/AcordosFilters.tsx` e `components/AnalyticsPanel/index.tsx`
  (as poções da chefona).
- `src/index.css`: a exceção das classes `zb-*`/`bx-*` no Modo leve.
- Os três testes da Caça em `components/__tests__/pacoteDeEntrada.test.ts` e a
  exceção dela em `lib/__tests__/painel-manda.test.ts`.
- O bloco `public/sons/chefao/` do `.gitignore`.

## O que ficou de propósito

**O banco inteiro.** As tabelas `abobora_caca`, `abobora_rodadas`, as do chefão
e da chefona (`chefao_golpes`, `chefona_golpes` e as rodadas), as funções
`fn_abobora_*`, `fn_chefao_*` e `fn_chefona_*` e as policies do canal
`abobora:<empresa>` continuam lá — arquivar código não apaga dado. Sem o código
ninguém vê zumbi nem bruxa, mesmo que a caça esteja «ligada». As migrations
continuam em `supabase/migrations/` (de `20261005120000` a `20261016220000`).

Também ficaram, sem uso: `Halloween/fonte.ts` (`carregarFontesPixel`, as fontes
em pixel) e o `pausar()` de `Halloween/SomAmbiente/motor.ts`. São do Halloween
e não quebram nada.
