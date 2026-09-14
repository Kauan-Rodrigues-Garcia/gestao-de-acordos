/**
 * env.ts — a configuração do robô, lida do `.env` ao lado dele.
 *
 * ## Por que não usar uma biblioteca
 *
 * São seis variáveis e nenhum caso exótico. Uma dependência a mais é uma coisa
 * a mais para instalar no PC do trabalho, e o robô existe justamente para não
 * depender de ninguém lembrar de instalar nada.
 *
 * ## Por que ao lado do executável, e não no diretório atual
 *
 * O Agendador de Tarefas do Windows roda a tarefa a partir de `C:\Windows\
 * System32` quando ninguém informa o diretório — e aí um `.env` relativo não é
 * encontrado, com uma mensagem que não ajuda. Procurar ao lado do próprio
 * arquivo faz o robô funcionar independentemente de onde foi chamado.
 *
 * Variável já definida no ambiente vence a do arquivo: é o que permite testar
 * outro mês ou outro arquivo sem editar nada.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function carregar(): void {
  const aqui = dirname(fileURLToPath(import.meta.url));
  // `dist/robo59.mjs` roda de dentro de `dist`; o `.env` fica na pasta do robô,
  // então os dois lugares são procurados.
  const candidatos = [resolve(aqui, '.env'), resolve(aqui, '..', '.env')];
  const caminho = candidatos.find(existsSync);
  if (!caminho) return;

  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const i = limpa.indexOf('=');
    if (i < 1) continue;
    const chave = limpa.slice(0, i).trim();
    // Aspas ao redor do valor são convenção de .env e não fazem parte dele —
    // um caminho do Windows com espaço quase sempre vem aspeado.
    const valor = limpa.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

carregar();

/** Lê uma variável obrigatória, com uma mensagem que diz o que fazer. */
export function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    throw new Error(
      `Falta ${nome}. Preencha o arquivo .env na pasta do robô — `
      + 'o README lista as seis variáveis e o que cada uma é.',
    );
  }
  return v;
}
