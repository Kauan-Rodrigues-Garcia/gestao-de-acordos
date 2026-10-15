# Pesquisa de experiência

**Arquivada em:** 15/10/2026
**No ar desde:** 08/10/2026 (migration `20261008150000_pesquisa_experiencia`)

## O que era

A pergunta «Como tá sendo usar o Gestão de Acordos?», com três carinhas
(Ruim · Tá ok · Tô curtindo) e um comentário opcional, no canto da tela
(modelo «Cafezinho»). Uma vez por pessoa. Desde a `20261013150000` só a
cobrança via.

Em Configurações → Geral ficava o card que ligava a pergunta para todos (só o
super_admin) e mostrava as respostas (quem tinha `config_sub_geral`).

## Por que saiu

Decisão do Cleber, 15/10/2026: a pesquisa já foi feita. Não precisa mais
aparecer, e o card na aba Geral só poluía a tela.

## O que veio para cá

```
src/components/PesquisaExperiencia/   index · CartaoPesquisa · pesquisa
                                      cafezinho.css · testes
src/components/admin/PesquisaExperienciaConfig.tsx   o card da aba Geral
```

## O que foi removido do código vivo

- o `<PesquisaExperiencia>` (o card no canto) em `src/components/Layout.tsx`
- o `<PesquisaExperienciaConfig>` em `src/pages/AdminConfiguracoes.tsx`

## O que ficou de propósito

**O banco inteiro.** As tabelas `pesquisa_experiencia_config` e
`pesquisa_experiencia_respostas` (com todas as respostas e comentários) e as
funções `fn_pesquisa_experiencia_*` continuam lá — arquivar código não apaga
dado. Sem o código, ninguém vê nem responde a pesquisa, mesmo que a config
esteja «ligada». Os tipos em `lib/database.types.ts` também ficam: o arquivo é
gerado a partir do banco.

Para ler as respostas sem a tela: `select * from pesquisa_experiencia_respostas`
(com autorização, pela regra do `CLAUDE.md`). Para trazer a tela de volta, copie
a árvore `src/` daqui por cima da do projeto e devolva as duas linhas acima.
