/**
 * O terminal simulado.
 *
 * O teste que mais importa aqui não é de funcionalidade: é o que garante que
 * NADA é executado. Um terminal de brinquedo escondido dentro de um sistema de
 * cobrança é exatamente o lugar onde ninguém iria procurar uma porta aberta.
 */
import { describe, it, expect } from 'vitest';
import { interpretar, completar, COMANDOS_VALIDOS } from '../terminal';

describe('lista branca', () => {
  it('comando desconhecido não executa nada — só reclama', () => {
    const r = interpretar('formatar disco');
    expect(r.efeito).toBeUndefined();
    expect(r.linhas[0].tipo).toBe('erro');
    expect(r.linhas[0].texto).toMatch(/não reconhecido/i);
  });

  it.each([
    'eval(1+1)',
    'require("fs")',
    'process.exit()',
    'fetch("http://exemplo.com")',
    'DROP TABLE acordos',
    '<script>alert(1)</script>',
    '../../etc/passwd',
  ])('não faz nada com %s', (entrada) => {
    const r = interpretar(entrada);
    expect(r.efeito).toBeUndefined();
    expect(r.linhas.every(l => l.tipo !== 'saida' || !l.texto.includes('undefined'))).toBe(true);
  });

  it('todo comando válido responde alguma coisa', () => {
    for (const c of COMANDOS_VALIDOS) {
      const r = interpretar(c);
      const respondeu = r.linhas.length > 0 || r.efeito !== undefined;
      expect(respondeu, `comando "${c}" ficou mudo`).toBe(true);
    }
  });

  it('entrada vazia não faz nada', () => {
    expect(interpretar('   ')).toEqual({ linhas: [] });
  });
});

describe('respostas para o que a pessoa vai tentar', () => {
  it('sudo é recusado com bom humor', () => {
    expect(interpretar('sudo rm -rf /').linhas[0].texto).toBe('Nice try.');
  });

  it('rm é recusado', () => {
    expect(interpretar('rm arquivo').linhas[0].tipo).toBe('erro');
  });

  it('ls responde algo plausível', () => {
    expect(interpretar('ls').linhas.length).toBeGreaterThan(0);
  });
});

describe('efeitos', () => {
  it('clear pede para limpar', () => {
    expect(interpretar('clear').efeito).toEqual({ tipo: 'limpar' });
  });

  it('exit pede para sair', () => {
    expect(interpretar('exit').efeito).toEqual({ tipo: 'sair' });
  });

  it('os temas pedem a realidade certa', () => {
    expect(interpretar('arcade').efeito).toEqual({ tipo: 'tema', tema: 'arcade' });
    expect(interpretar('cyberpunk').efeito).toEqual({ tipo: 'tema', tema: 'cyberpunk' });
  });

  it('matrix pede o efeito visual', () => {
    expect(interpretar('matrix').efeito).toEqual({ tipo: 'matrix' });
  });

  it('maiúsculas e espaços não atrapalham', () => {
    expect(interpretar('  HELP  ').linhas.length).toBeGreaterThan(3);
  });
});

describe('conteúdo', () => {
  it('help lista os comandos', () => {
    const texto = interpretar('help').linhas.map(l => l.texto).join('\n');
    for (const c of ['about', 'kauan', 'cleber', 'projects', 'clear', 'exit']) {
      expect(texto).toContain(c);
    }
  });

  /** Nada de inventar: o que não foi informado aparece como não informado. */
  it('ficha de criador sem dados diz "não informado", nunca inventa', () => {
    const texto = interpretar('kauan').linhas.map(l => l.texto).join('\n');
    expect(texto).toContain('KAUAN');
    expect(texto).toContain('(não informado)');
    expect(texto).not.toContain('⟦PENDENTE');
  });

  it('stack mostra tecnologia que o projeto realmente usa', () => {
    const texto = interpretar('stack').linhas.map(l => l.texto).join('\n');
    expect(texto).toContain('React 18');
    expect(texto).toContain('Supabase');
    // E não deve citar o que não está instalado.
    expect(texto).not.toContain('Three.js');
    expect(texto).not.toContain('GSAP');
  });

  it('stats traz os números medidos', () => {
    const texto = interpretar('stats').linhas.map(l => l.texto).join('\n');
    expect(texto).toContain('818');
  });

  it('phi mostra a razão áurea', () => {
    expect(interpretar('phi').linhas[0].texto).toContain('1.618');
  });
});

describe('completar', () => {
  it('completa quando só há uma opção', () => {
    expect(completar('cyb')).toBe('cyberpunk');
  });
  it('não adivinha quando há empate', () => {
    expect(completar('c')).toBeNull();
  });
  it('vazio não completa', () => {
    expect(completar('  ')).toBeNull();
  });
});

/**
 * O prêmio de quem zerou o fliperama.
 *
 * O comando existe para todo mundo — está na lista branca, como tudo. O que
 * muda é a RESPOSTA. Um comando que não existisse seria descoberto do mesmo
 * jeito por quem lê o pacote; o que faz dele prêmio é responder só a quem
 * ganhou, e não se anunciar para o resto.
 */
describe('premio', () => {
  const ganhou = { venceuFliperama: true };

  it('sem ter zerado, o gabinete não reconhece', () => {
    const r = interpretar('premio');
    expect(r.linhas[0].tipo).toBe('erro');
    expect(r.linhas.some(l => l.texto.includes('coroa'))).toBe(false);
  });

  it('depois de zerar, entrega o prêmio', () => {
    const r = interpretar('premio', ganhou);
    expect(r.linhas[0].tipo).toBe('destaque');
    expect(r.linhas.some(l => l.texto.includes('coroa'))).toBe(true);
    // Continua sendo um brinquedo: nenhum comando pede efeito colateral aqui.
    expect(r.efeito).toBeUndefined();
  });

  it('o `help` não entrega o segredo a quem não ganhou', () => {
    const semGanhar = interpretar('help').linhas.map(l => l.texto).join('\n');
    const comGanhar  = interpretar('help', ganhou).linhas.map(l => l.texto).join('\n');
    expect(semGanhar).not.toContain('premio');
    expect(comGanhar).toContain('premio');
  });

  /** O Tab também entrega segredo: `pr` + Tab ofereceria o comando de bandeja. */
  it('o Tab não completa `premio` para quem não ganhou', () => {
    expect(completar('pre')).toBeNull();
    expect(completar('pre', ganhou)).toBe('premio');
  });

  it('ganhar não muda mais nada do terminal', () => {
    for (const cmd of ['about', 'whoami', 'phi', 'stack']) {
      expect(interpretar(cmd, ganhou)).toEqual(interpretar(cmd));
    }
  });
});
