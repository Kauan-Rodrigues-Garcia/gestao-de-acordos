/**
 * Guarda do pacote de entrada.
 *
 * Painéis e a janela do chat saíram do pacote que toda página baixa (852 KB →
 * 566 KB). O que os devolveria é pequeno demais para alguém notar: UM `import`
 * estático em qualquer arquivo que carrega com o Layout. O build não falha —
 * no máximo imprime «dynamic import will not move module into another chunk»
 * no meio de centenas de linhas.
 *
 * Por isso a verificação é no fonte: estes módulos só podem entrar por
 * `import()`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', '..');

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), 'utf8');
}

/** Caminhos de `import ... from '...'` estáticos — `import type` não conta. */
function importsEstaticos(fonte: string): string[] {
  const achados: string[] = [];
  const re = /^\s*import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm;
  for (let m = re.exec(fonte); m; m = re.exec(fonte)) achados.push(m[1]);
  return achados;
}

function arquivosDoApp(dir = RAIZ): string[] {
  return readdirSync(dir).flatMap(nome => {
    const cheio = join(dir, nome);
    if (statSync(cheio).isDirectory()) return arquivosDoApp(cheio);
    if (!/\.(ts|tsx)$/.test(nome) || /\.test\.(ts|tsx)$/.test(nome)) return [];
    return [cheio];
  });
}

describe('pacote de entrada', () => {
  it('o Layout não importa estaticamente os painéis sob demanda', () => {
    const imports = importsEstaticos(ler('components/Layout.tsx'));
    for (const painel of [
      './DesempenhoDia',
      './DesafioMenu/PainelDesafio',
      './ModalRecortarFoto',
      '@/components/MenuLateralEditor',
    ]) {
      expect(imports, painel).not.toContain(painel);
    }
  });

  it('a BolhaChat não importa estaticamente nenhuma peça da janela', () => {
    const imports = importsEstaticos(ler('components/Chat/BolhaChat.tsx'));
    for (const peca of [
      './janela', './ListaConversas', './Conversa', './PainelMonitor',
      './DisparoDialog', './NovaConversaDialog', './NovoGrupoDialog',
      './ConfigGrupoDialog', './GaleriaDialog', './BoasVindasChat',
    ]) {
      expect(imports, peca).not.toContain(peca);
    }
  });

  it('nenhum arquivo do app importa `Chat/janela` estaticamente', () => {
    const culpados = arquivosDoApp()
      .filter(f => importsEstaticos(readFileSync(f, 'utf8'))
        .some(i => i === '@/components/Chat/janela'
          || (i === './janela' && f.includes(join('components', 'Chat')))))
      .map(f => relative(RAIZ, f));
    expect(culpados).toEqual([]);
  });
});
