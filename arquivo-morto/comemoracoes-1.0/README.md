# Comemorações 1.0 (o editor)

**Arquivado em:** 15/10/2026
**No ar desde:** 31/07/2026 (migration `20260731e`)

## O que era

O editor antigo da aba Comemorações (Admin → Usuários → Comemorações): o
formulário de uma página com a prévia ao lado, o texto solto sobre a tela, a
biblioteca de GIFs e imagens enviados pela empresa (`SeletorMidia`), o recorte
da música no envio (`EditorTrecho`) e o painel de quem bateu a meta
(`PainelMetaBatida`).

## Por que saiu

Decisão do Cleber, 15/10/2026: a Comemorações 2.0 (`src/pages/Comemoracoes2`)
vira a versão oficial, para todos os cargos que já tinham acesso
(`comemoracoes_gerenciar`). O editor 1.0 ficava atrás dela como «versão atual»
só enquanto a 2.0 estava em teste.

## O que veio para cá

```
src/pages/Comemoracoes/index.tsx          o editor 1.0 e a «porta» que trocava 1.0/2.0
src/pages/Comemoracoes/SeletorMidia.tsx   biblioteca de GIF/imagem/som enviados
src/pages/Comemoracoes/EditorTrecho.tsx   recorte da música no envio
src/pages/Comemoracoes/PainelMetaBatida.tsx
src/pages/Comemoracoes/permissoes.ts(+test)   a lista de cargos que espelhava fn_comemoracao_pode_criar
```

## O que foi removido do código vivo

- `src/pages/AdminUsuarios.tsx` passa a abrir `@/pages/Comemoracoes2` direto.
- A 2.0 perdeu o selo «2.0 · teste» e o botão «Voltar para a versão atual».

## O que ficou de propósito

- **Tudo o que a 2.0 e a exibição das festas usam** continua em
  `src/pages/Comemoracoes/` (catálogo, janela, escopo, clones, volume, frases,
  parabéns, layout, testeLocal, metaBatida…). O nome da pasta ficou: são
  peças compartilhadas, não a tela.
- **A exibição da 1.0** (`components/comemoracao/CardComemoracao` e afins): as
  comemorações criadas antes, sem `design`, continuam aparecendo com o card
  antigo enquanto estiverem no ar e no histórico.
- **O banco inteiro**, inclusive `comemoracao_midias` com GIFs e imagens
  enviados. A 2.0 só usa as músicas dessa tabela.
