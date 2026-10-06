/**
 * Quem cai na tela mínima (`/m`) — decisão 5 da spec do mobile.
 *
 * Celular + cargo que recebe no próprio nome + sem a escolha «Versão completa»
 * → `/m`. Qualquer outra combinação fica no site de sempre.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAVE_VERSAO, decidirDesvio, deveAbrirMobile, destinoMobile, ehCelular, gravarVersao, lerVersao, ofereceVersaoCelular,
  type AmbienteTela,
} from './preferencia';

const celular: AmbienteTela = { toqueGrosso: true, largura: 390 };
const desktop: AmbienteTela = { toqueGrosso: false, largura: 1440 };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('ehCelular', () => {
  it('toque grosso e tela estreita é celular', () => {
    expect(ehCelular(celular)).toBe(true);
  });
  it('notebook com tela sensível ao toque não é celular', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 1366 })).toBe(false);
  });
  it('janela estreita de desktop não é celular', () => {
    expect(ehCelular({ toqueGrosso: false, largura: 500 })).toBe(false);
  });
  it('tablet em pé (768) ainda conta', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 768 })).toBe(true);
  });
});

describe('deveAbrirMobile', () => {
  it('operador no celular, sem escolha → tela mínima', () => {
    expect(deveAbrirMobile('operador', celular)).toBe(true);
  });
  it('elite também recebe no próprio nome → tela mínima', () => {
    expect(deveAbrirMobile('elite', celular)).toBe(true);
  });
  it('líder no celular abre a tela mínima (a da equipe)', () => {
    expect(deveAbrirMobile('lider', celular)).toBe(true);
  });
  it('gerência no celular fica no site de sempre (fase da diretoria)', () => {
    expect(deveAbrirMobile('gerencia', celular)).toBe(false);
  });
  it('sem perfil carregado não redireciona', () => {
    expect(deveAbrirMobile(null, celular)).toBe(false);
  });
  it('operador no desktop fica no site de sempre', () => {
    expect(deveAbrirMobile('operador', desktop)).toBe(false);
  });
  it('quem escolheu «Versão completa» não é redirecionado de novo', () => {
    gravarVersao('completa');
    expect(deveAbrirMobile('operador', celular)).toBe(false);
  });
  it('voltar para a versão para celular apaga a escolha', () => {
    gravarVersao('completa');
    gravarVersao('mobile');
    expect(lerVersao()).toBe('mobile');
    expect(sessionStorage.getItem(CHAVE_VERSAO)).toBeNull();
    expect(deveAbrirMobile('operador', celular)).toBe(true);
  });
});

describe('abrir sempre no app (06/10/2026)', () => {
  it('app instalado é celular mesmo com janela larga e sem toque', () => {
    expect(ehCelular({ toqueGrosso: false, largura: 1280, instalado: true })).toBe(true);
  });
  it('celular deitado: a janela passa de 768, mas a tela é de celular', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 932, menorLado: 430, maiorLado: 932 })).toBe(true);
  });
  it('«site para computador» (janela de 980) num celular continua celular', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 980, menorLado: 390, maiorLado: 844 })).toBe(true);
  });
  it('notebook com tela de toque 1366×768 não é celular', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 1366, menorLado: 768, maiorLado: 1366 })).toBe(false);
  });
  it('iPad Air (820×1180) já é tela grande; tablet 768×1024 conta', () => {
    expect(ehCelular({ toqueGrosso: true, largura: 820, menorLado: 820, maiorLado: 1180 })).toBe(false);
    expect(ehCelular({ toqueGrosso: true, largura: 768, menorLado: 768, maiorLado: 1024 })).toBe(true);
  });
  it('«Versão completa» vale só nesta sessão do app', () => {
    gravarVersao('completa');
    expect(sessionStorage.getItem(CHAVE_VERSAO)).toBe('completa');
    expect(localStorage.getItem(CHAVE_VERSAO)).toBeNull();
    sessionStorage.clear(); // fechou o app
    expect(deveAbrirMobile('operador', celular)).toBe(true);
  });
  it('a escolha antiga, gravada para sempre, é apagada e o app volta', () => {
    localStorage.setItem(CHAVE_VERSAO, 'completa');
    expect(deveAbrirMobile('operador', celular)).toBe(true);
    expect(localStorage.getItem(CHAVE_VERSAO)).toBeNull();
  });
});

describe('armazenamento indisponível', () => {
  it('ler que lança vale como «sem escolha»: vai para a tela mínima', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('bloqueado'); };
    try {
      expect(lerVersao()).toBe('mobile');
      expect(deveAbrirMobile('operador', celular)).toBe(true);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
  it('gravar que lança não derruba a tela', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('cheio'); };
    try {
      expect(() => gravarVersao('completa')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('super admin (teste)', () => {
  it('não é redirecionado no celular — usa o site completo', () => {
    expect(deveAbrirMobile('super_admin', celular)).toBe(false);
  });
  it('vê o ícone da versão para celular em qualquer aparelho', () => {
    expect(ofereceVersaoCelular('super_admin', desktop)).toBe(true);
    expect(ofereceVersaoCelular('super_admin', celular)).toBe(true);
  });
  it('operador e líder só veem o ícone no celular; gerência nunca', () => {
    expect(ofereceVersaoCelular('operador', celular)).toBe(true);
    expect(ofereceVersaoCelular('operador', desktop)).toBe(false);
    expect(ofereceVersaoCelular('lider', celular)).toBe(true);
    expect(ofereceVersaoCelular('gerencia', celular)).toBe(false);
  });
});

describe('destinoMobile', () => {
  it('líder vai para a tela da equipe', () => {
    expect(destinoMobile('lider')).toBe('/m/equipe');
  });
  it('operador e elite vão para a tela pessoal (o elite troca lá dentro)', () => {
    expect(destinoMobile('operador')).toBe('/m');
    expect(destinoMobile('elite')).toBe('/m');
  });
});

describe('decidirDesvio — o celular nunca cai no site sem querer (06/10/2026)', () => {
  const base = {
    temSessao: true, celular: true, versaoCompleta: false, carregando: false,
    perfil: 'operador', produtoCobranca: true, permissoesCarregando: false,
    temPermissao: () => true,
  };

  it('operador no celular, em qualquer rota do site → vai para o app', () => {
    expect(decidirDesvio(base)).toEqual({ tipo: 'ir', destino: '/m' });
  });
  it('líder vai para a tela da equipe', () => {
    expect(decidirDesvio({ ...base, perfil: 'lider' })).toEqual({ tipo: 'ir', destino: '/m/equipe' });
  });
  it('perfil carregando: espera (esqueleto), nunca mostra o site', () => {
    expect(decidirDesvio({ ...base, carregando: true, perfil: null })).toEqual({ tipo: 'esperar' });
  });
  it('perfil que não veio (internet ruim): «Sem conexão», nunca o site', () => {
    expect(decidirDesvio({ ...base, perfil: null })).toEqual({ tipo: 'sem_conexao' });
  });
  it('«Versão completa» nesta sessão: deixa o site em paz', () => {
    expect(decidirDesvio({ ...base, versaoCompleta: true })).toEqual({ tipo: 'nada' });
  });
  it('computador: nada, nem espera', () => {
    expect(decidirDesvio({ ...base, celular: false, carregando: true })).toEqual({ tipo: 'nada' });
  });
  it('sem sessão: nada (o ProtectedRoute leva ao login)', () => {
    expect(decidirDesvio({ ...base, temSessao: false })).toEqual({ tipo: 'nada' });
  });
  it('sem a chave da tela de destino: fica no site (sem vai e volta)', () => {
    expect(decidirDesvio({ ...base, temPermissao: k => k !== 'ver_dashboard' })).toEqual({ tipo: 'nada' });
  });
  it('chaves carregando: espera', () => {
    expect(decidirDesvio({ ...base, permissoesCarregando: true })).toEqual({ tipo: 'esperar' });
  });
  it('fora da cobrança e cargos sem app: nada', () => {
    expect(decidirDesvio({ ...base, produtoCobranca: false })).toEqual({ tipo: 'nada' });
    expect(decidirDesvio({ ...base, perfil: 'diretoria' })).toEqual({ tipo: 'nada' });
    expect(decidirDesvio({ ...base, perfil: 'super_admin' })).toEqual({ tipo: 'nada' });
  });
});
