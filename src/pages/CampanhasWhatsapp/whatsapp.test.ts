import { describe, it, expect } from 'vitest';
import { contar, filtrar, linkWhatsApp, proximoPendente, telefoneLegivel, textoDoContato, type Contato } from './whatsapp';

const base: Contato = {
  id: '1', envio_id: 'e', ordem: 1, nome: 'MARIA SILVA', contrato: '123', empresa_cliente: 'Coren',
  telefone: '18 99999-9999', whatsapp: '5518999999999', telefone2: null, whatsapp2: null, mensagem: 'Olá Maria', mensagem_editada: null,
  pendencias: [], status: 'pendente', enviado_em: null,
};

describe('linkWhatsApp', () => {
  it('Web abre direto na conversa, com o texto codificado', () => {
    expect(linkWhatsApp('5518999999999', 'Olá & tchau\nok', 'web'))
      .toBe('https://web.whatsapp.com/send?phone=5518999999999&text=Ol%C3%A1%20%26%20tchau%0Aok');
  });
  it('app do computador pelo protocolo whatsapp://', () => {
    expect(linkWhatsApp('5518999999999', 'Oi', 'app')).toBe('whatsapp://send?phone=5518999999999&text=Oi');
  });
});

describe('o que sai e a contagem', () => {
  it('a mensagem editada vale no lugar da original', () => {
    expect(textoDoContato(base)).toBe('Olá Maria');
    expect(textoDoContato({ ...base, mensagem_editada: 'Oi, Maria!' })).toBe('Oi, Maria!');
  });

  it('conta por situação', () => {
    const l = [base, { ...base, status: 'enviado' as const }, { ...base, status: 'nao_enviado' as const }];
    expect(contar(l)).toEqual({ total: 3, pendentes: 1, enviados: 1, naoEnviados: 1 });
  });

  it('o próximo é o primeiro pendente COM número', () => {
    const l = [{ ...base, id: 'a', status: 'enviado' as const }, { ...base, id: 'b', whatsapp: null }, { ...base, id: 'c' }];
    expect(proximoPendente(l)?.id).toBe('c');
    expect(proximoPendente([{ ...base, whatsapp: null }])).toBeNull();
  });
});

describe('filtrar', () => {
  const l = [base, { ...base, id: '2', nome: 'JOÃO', contrato: '999', whatsapp: '5511988887777', status: 'enviado' as const }];
  it('pela situação', () => {
    expect(filtrar(l, 'pendentes', '').map(c => c.id)).toEqual(['1']);
    expect(filtrar(l, 'enviados', '').map(c => c.id)).toEqual(['2']);
    expect(filtrar(l, 'todos', '').length).toBe(2);
  });
  it('por nome sem acento, contrato ou número', () => {
    expect(filtrar(l, 'todos', 'joao').map(c => c.id)).toEqual(['2']);
    expect(filtrar(l, 'todos', '999').map(c => c.id)).toEqual(['2']);
    expect(filtrar(l, 'todos', '8888-7777').map(c => c.id)).toEqual(['2']);
  });
});

describe('telefoneLegivel', () => {
  it('formata celular e fixo; sem número usa o cadastrado', () => {
    expect(telefoneLegivel('5518999999999', null)).toBe('(18) 99999-9999');
    expect(telefoneLegivel('551833334444', null)).toBe('(18) 3333-4444');
    expect(telefoneLegivel(null, '123')).toBe('123');
  });
});
