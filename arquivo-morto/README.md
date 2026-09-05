# Arquivo morto

Onde ficam os projetos que **saíram do ar**. Nada aqui é compilado, testado,
importado ou publicado: é backup legível, não código vivo.

## A regra

Um projeto que sai do produto sai **inteiro** do `src/`. Não fica desligado por
uma flag, não fica comentado, não fica "para o caso de". Ele é movido para cá,
com os arquivos no caminho original, e as pontas que ele deixava no código vivo
são removidas na mesma passagem.

O motivo é o que já aconteceu duas vezes neste repositório: código desligado
continua aparecendo na busca, continua sendo lido por quem for mexer em outra
coisa, continua sendo mantido em refatorações que não deviam alcançá-lo — e
continua pesando no bundle enquanto alguém não conferir se ainda entra.

## Como está organizado

```
arquivo-morto/
  <projeto>/
    README.md    o que era, quando saiu, o que ficou para trás
    src/...      os arquivos, no caminho que tinham
```

O caminho original é preservado de propósito: para restaurar, basta copiar a
árvore `src/` de volta por cima — e o `git log --follow` de cada arquivo continua
alcançando a história dele.

## O que NÃO vem para cá

- **Migrations.** Elas ficam em `supabase/migrations/`, sempre. O histórico do
  banco é linear e uma migration removida quebra quem rodar do zero.
- **Tabelas e colunas.** Arquivar código não apaga dado. Cada README diz o que
  continua no banco, e apagar é decisão à parte, com o dono do banco na sala.

## Índice

| Projeto | Saiu em | Por quê |
|---|---|---|
| [`pet/`](pet/README.md) | 05/09/2026 | O mascote foi desligado em 09/08/2026 e o código ficou órfão desde então |
| [`ouvidoria/`](ouvidoria/README.md) | 05/09/2026 | A aba saiu do produto |
