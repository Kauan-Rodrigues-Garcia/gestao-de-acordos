#!/usr/bin/env bash
#
# Devolve o tema de Halloween exatamente como estava no ar em 03/11/2026
# (o commit 8030860). Ver README.md desta pasta.
#
#   bash arquivo-morto/halloween/restaurar.sh
#
# 1. O patch religa as pontas no código vivo: Layout, Configurações, chat,
#    botão de tema, os temas de terror do Som ambiente (e o player de volta em
#    components/Halloween/SomAmbiente), as músicas com o prefixo halloween-.
# 2. Cada arquivo guardado aqui volta para o caminho original (git mv: o
#    `git log --follow` continua alcançando a história).
#
# Não mexe no banco: as tabelas e funções nunca saíram de lá.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
A=arquivo-morto/halloween

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Há alterações não commitadas. Commite ou guarde (git stash) antes de restaurar." >&2
  exit 1
fi

# Confere antes de mexer: se o código vivo mudou desde 03/11/2026 e o patch
# não encaixa mais, nada é alterado. Ver «Se o patch não aplicar» no README.
git apply --check "$A/restaurar.patch"
git apply --index "$A/restaurar.patch"

git ls-files "$A" | while read -r f; do
  case "$f" in
    "$A/README.md"|"$A/restaurar.patch"|"$A/restaurar.sh") continue ;;
  esac
  destino="${f#"$A"/}"
  mkdir -p "$(dirname "$destino")"
  git mv "$f" "$destino"
done

echo "Restaurado. Falta: git rm -r $A, tirar a linha dele de arquivo-morto/README.md e rodar os testes."
