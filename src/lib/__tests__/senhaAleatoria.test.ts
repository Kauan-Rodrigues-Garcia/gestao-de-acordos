import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarSenhaAleatoria, LETRAS_SENHA, NUMEROS_SENHA, TAMANHO_SENHA } from '../senhaAleatoria';
import { gerarSenhaProvisoria } from '../../../api/aprovar-pedido-senha';

describe('senha aleatória', () => {
  it('6 caracteres, minúsculas e números, sem os que se confundem', () => {
    for (let i = 0; i < 500; i++) {
      const s = gerarSenhaAleatoria();
      expect(s).toHaveLength(TAMANHO_SENHA);
      expect(s).toMatch(/^[a-z2-9]+$/);
      expect(s).not.toMatch(/[01ilo]/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[0-9]/);
    }
  });

  it('o servidor gera no mesmo formato', () => {
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toHaveLength(6);
      expect(s).toMatch(/^[a-hj-km-np-z2-9]{6}$/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[0-9]/);
    }
  });

  it('o alfabeto do servidor é o mesmo do navegador', () => {
    const api = readFileSync(resolve(__dirname, '../../../api/aprovar-pedido-senha.ts'), 'utf8');
    expect(api).toContain(`const LETRAS = '${LETRAS_SENHA}'`);
    expect(api).toContain(`const NUMEROS = '${NUMEROS_SENHA}'`);
  });

  it('sorteio só de letras é refeito até ter número', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 23];
    let i = 0;
    const s = gerarSenhaAleatoria(() => seq[i++] ?? 0);
    expect(s).toBe('aaaaa2');
  });
});
