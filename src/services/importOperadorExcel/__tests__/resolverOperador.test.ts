import { describe, it, expect } from 'vitest';
import { criarResolver, type MapaLogins } from '../resolverOperador';
import { normalizarLogin } from '../normalizar';

function mapaDe(pares: Array<[login: string, id: string, nome: string]>): MapaLogins {
  const m: MapaLogins = new Map();
  for (const [login, id, nome] of pares) {
    const k = normalizarLogin(login);
    const lista = m.get(k) ?? [];
    lista.push({ id, nome, usuario: login, setorId: null });
    m.set(k, lista);
  }
  return m;
}

describe('criarResolver', () => {
  it('resolve login exato', () => {
    const r = criarResolver(mapaDe([['gabriel_oliveira', 'u1', 'Gabriel Oliveira']]));
    expect(r(normalizarLogin('Gabriel_Oliveira'))).toEqual({ id: 'u1', nome: 'Gabriel Oliveira', setorId: null });
  });
  it('login sem operador → null', () => {
    const r = criarResolver(mapaDe([['gabriel_oliveira', 'u1', 'Gabriel']]));
    expect(r(normalizarLogin('desconhecido'))).toBeNull();
  });
  it('login duplicado → AMBIGUOUS', () => {
    const r = criarResolver(mapaDe([
      ['maria', 'u1', 'Maria A'],
      ['maria', 'u2', 'Maria B'],
    ]));
    expect(r(normalizarLogin('maria'))).toBe('AMBIGUOUS');
  });
});
