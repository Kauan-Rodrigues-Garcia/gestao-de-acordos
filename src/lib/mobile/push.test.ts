import { describe, it, expect } from 'vitest';
import { chaveParaBytes, estadoPush, type AmbientePush } from './push';

const base: AmbientePush = {
  chavePublica: 'BExemplo', suportaPush: true, iPhone: false, instalado: false,
  permissao: 'default', inscrito: false,
};

describe('estadoPush', () => {
  it('sem chave VAPID no build o recurso não aparece', () => {
    expect(estadoPush({ ...base, chavePublica: undefined })).toBe('desligado');
  });
  it('Android com suporte e sem inscrição: oferece ativar', () => {
    expect(estadoPush(base)).toBe('inativo');
  });
  it('iPhone no Safari (não instalado): precisa instalar antes', () => {
    expect(estadoPush({ ...base, iPhone: true, suportaPush: false })).toBe('precisa-instalar');
  });
  it('iPhone instalado com suporte: oferece ativar', () => {
    expect(estadoPush({ ...base, iPhone: true, instalado: true })).toBe('inativo');
  });
  it('permissão bloqueada: explica como liberar', () => {
    expect(estadoPush({ ...base, permissao: 'denied' })).toBe('negado');
  });
  it('inscrito com permissão: ativo', () => {
    expect(estadoPush({ ...base, permissao: 'granted', inscrito: true })).toBe('ativo');
  });
  it('inscrição sobrando sem permissão não conta como ativo', () => {
    expect(estadoPush({ ...base, permissao: 'default', inscrito: true })).toBe('inativo');
  });
  it('navegador sem Web Push', () => {
    expect(estadoPush({ ...base, suportaPush: false })).toBe('sem-suporte');
  });
});

describe('chaveParaBytes', () => {
  it('base64url sem padding vira os bytes certos', () => {
    // «hi?» → aGk_ (base64url)
    expect(Array.from(chaveParaBytes('aGk_'))).toEqual([104, 105, 63]);
    // «a» → YQ (sem padding)
    expect(Array.from(chaveParaBytes('YQ'))).toEqual([97]);
  });
});
