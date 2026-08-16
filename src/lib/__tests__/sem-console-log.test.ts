/**
 * sem-console-log.test.ts
 *
 * `console.log` não pode voltar ao código de produção.
 *
 * O motivo não é estilo. Em 16/08/2026 a auditoria achou dois
 * `console.log` em `BotaoCapturaErpPP.tsx` despejando o texto BRUTO do OCR da
 * tela do ERP — nome do cliente, valores, o que estivesse visível. O
 * comentário ao lado dizia "sempre loga para facilitar diagnóstico". Ficava no
 * console do navegador em produção, legível por qualquer extensão instalada.
 *
 * `logger.debug` faz o mesmo trabalho e só escreve quando `import.meta.env.DEV`.
 *
 * `console.warn` e `console.error` seguem liberados: são para falha, o projeto
 * inteiro os usa assim, e o `logger` também os deixa passar em produção.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const RAIZ = resolve(__dirname, '../..');

/** Onde `console.log`/`console.debug` são legítimos. */
const LIBERADOS = [
  'lib/logger.ts',            // é a própria implementação
];

function ehTeste(caminho: string): boolean {
  return /\.test\.|__tests__|\.spec\./.test(caminho);
}

function varrer(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      varrer(caminho, achados);
    } else if (/\.(ts|tsx)$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe('nenhum console.log em código de produção', () => {
  it('src/ usa logger.debug, não console.log', () => {
    const ofensores: string[] = [];

    for (const arquivo of varrer(RAIZ)) {
      const rel = relative(RAIZ, arquivo).split('\\').join('/');
      if (ehTeste(rel) || LIBERADOS.includes(rel)) continue;

      const linhas = readFileSync(arquivo, 'utf-8').split('\n');
      linhas.forEach((linha, i) => {
        /*
         * Só interessa CHAMADA de verdade. Duas fontes de falso positivo
         * precisam sair antes de olhar:
         *
         *   • comentários — esta base cita `console.log` justamente para
         *     explicar por que ele foi removido;
         *   • strings — `creators.config.ts` guarda o texto de exemplo
         *     `console.log("funcionou")` como conteúdo, não como código.
         *
         * Um guarda que não separa código de dado acusa o próprio texto que
         * documenta a regra.
         */
        const semComentario = linha.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        const semStrings = semComentario
          .replace(/'(?:[^'\\]|\\.)*'/g, "''")
          .replace(/"(?:[^"\\]|\\.)*"/g, '""')
          .replace(/`(?:[^`\\]|\\.)*`/g, '``');

        if (/\bconsole\.(log|debug)\s*\(/.test(semStrings)) {
          ofensores.push(`${rel}:${i + 1}`);
        }
      });
    }

    expect(ofensores, `Troque por logger.debug:\n${ofensores.join('\n')}`).toEqual([]);
  });
});
