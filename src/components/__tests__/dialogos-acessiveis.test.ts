/**
 * dialogos-acessiveis.test.ts
 *
 * O Radix avisa no console quando um `Dialog` abre sem descrição:
 *
 *   Warning: Missing `Description` or `aria-describedby={undefined}`
 *   for {DialogContent}.
 *
 * Não é enfeite: é o texto que o leitor de tela anuncia depois do título, e sem
 * ele quem usa leitor entra num painel que não se apresenta. O aviso aparece em
 * runtime, só quando aquele diálogo específico abre — então um caso novo passa
 * despercebido até alguém abrir aquela tela com o console ligado.
 *
 * Esta guarda troca isso por uma falha de CI.
 *
 * ## Sheet e AlertDialog contam
 *
 * Os dois são construídos sobre `@radix-ui/react-dialog`, e o aviso deles sai
 * com o mesmo nome — `{DialogContent}`. Procurar só por `<DialogContent>` ao
 * caçar a origem de um aviso desses é o caminho mais rápido para concluir, de
 * forma errada, que o código está limpo.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../..');

/** Todo `.tsx` de `src`, menos os próprios testes. */
function arquivosTsx(dir: string, saida: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'node_modules' || item.name === '__tests__') continue;
      arquivosTsx(completo, saida);
    } else if (item.name.endsWith('.tsx') && !item.name.includes('.test.')) {
      saida.push(completo);
    }
  }
  return saida;
}

const ABRE  = /<(Dialog|Sheet|AlertDialog)Content/;
const FECHA = /<\/(Dialog|Sheet|AlertDialog)Content>/;
const DESCREVE = /(Dialog|Sheet|AlertDialog)Description|aria-describedby/;

interface Achado { arquivo: string; linha: number }

function semDescricao(): Achado[] {
  const achados: Achado[] = [];

  for (const arquivo of arquivosTsx(SRC)) {
    const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
    let dentro = false;
    let inicio = 0;
    let descrito = false;

    linhas.forEach((linha, i) => {
      if (!dentro && ABRE.test(linha)) {
        dentro = true; inicio = i + 1; descrito = DESCREVE.test(linha);
        return;
      }
      if (!dentro) return;
      if (DESCREVE.test(linha)) descrito = true;
      if (FECHA.test(linha)) {
        if (!descrito) achados.push({ arquivo: path.relative(SRC, arquivo), linha: inicio });
        dentro = false;
      }
    });
  }
  return achados;
}

describe('todo diálogo se apresenta', () => {
  it('nenhum Dialog, Sheet ou AlertDialog abre sem descrição', () => {
    const achados = semDescricao();
    expect(
      achados,
      'Estes conteúdos de diálogo não têm `Description` nem `aria-describedby` — '
      + 'o Radix vai avisar no console e o leitor de tela não anuncia nada:\n  '
      + achados.map(a => `${a.arquivo}:${a.linha}`).join('\n  '),
    ).toEqual([]);
  });

  /*
   * A guarda acima só vale enquanto souber procurar. Se alguém trocar os nomes
   * dos componentes e as expressões pararem de casar com qualquer coisa, ela
   * passaria a aprovar tudo em silêncio — que é o pior estado possível para um
   * teste de contrato. Este caso garante que ela ainda está olhando para algo.
   */
  it('a varredura realmente encontra diálogos no projeto', () => {
    const comDialogo = arquivosTsx(SRC).filter(a =>
      ABRE.test(fs.readFileSync(a, 'utf8')));
    expect(comDialogo.length).toBeGreaterThan(10);
  });
});
