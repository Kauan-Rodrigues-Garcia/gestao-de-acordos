import { describe, expect, it } from 'vitest';
import {
  CERIMONIAS, ENTRADAS, ENTRADAS_SOLO, FINAIS, NUMEROS, NUMEROS_SOLO, SAIDAS, SAIDAS_SOLO,
  montarEspetaculo, type Destaque, type Formacao, type Pedido,
} from './diretor';
import type { Deixa, SomDeCena } from './deixas';
import { BOLETINS, CONVERSAS, MONOLOGOS } from './falas';
import { cartaDoBaralho, criarSorteio, sementeDe } from './sorteio';

const NOMES: Pedido['nomes'] = { a: { nome: 'Anderson', artigo: 'o' }, b: { nome: 'Jessica', artigo: 'a' } };

const DESTAQUES: Destaque[] = [
  { setor: 'Play 1', nome: 'Camila Souza', foto: null },
  { setor: 'Play 2', nome: 'Rafael Costa', foto: null, meu: true },
  { setor: 'Receptivo', nome: 'Felipe Nunes', foto: null },
];

const pedido = (mais: Partial<Pedido> = {}): Pedido => ({
  tipo: 'aparicao', cidade: 'birigui', dia: 12, indice: 0, nomes: NOMES, ...mais,
});

const LIDER: Destaque = { setor: 'Play 5', nome: 'Larissa Lima', foto: null };
/** O que o sorteio escolheu, tirado do resumo («conversa: nº 12» → «nº 12»). */
const doResumo = (e: { resumo: string[] }, campo: string) => e.resumo.find(r => r.startsWith(`${campo}: `))?.slice(campo.length + 2) ?? '';
const sonsDe = (deixas: readonly Deixa[]) =>
  deixas.flatMap(d => ('cena' in d && 'som' in d.cena ? [d.cena] : [])) as { som: SomDeCena; dur?: number; x?: number }[];
/** Os dias úteis, em fila, a partir da primeira segunda-feira (o dia 0 é domingo). */
const diasUteis = (quantos: number) => {
  const dias: number[] = [];
  for (let dia = 1; dias.length < quantos; dia++) if (dia % 7 >= 1 && dia % 7 <= 5) dias.push(dia);
  return dias;
};

const textos = (deixas: readonly Deixa[]) =>
  deixas.flatMap(d => ('balao' in d && d.balao.texto ? [d.balao.texto] : 'cena' in d && 'letreiro' in d.cena && d.cena.letreiro ? [d.cena.letreiro] : []));

/** O que toda folha de deixas tem de cumprir, seja qual for o sorteio. */
function conferir(e: ReturnType<typeof montarEspetaculo>, rotulo: string) {
  expect(e.deixas.length, rotulo).toBeGreaterThan(10);
  for (let i = 1; i < e.deixas.length; i++) {
    expect(e.deixas[i].t, `${rotulo}: deixa ${i} fora de ordem`).toBeGreaterThanOrEqual(e.deixas[i - 1].t);
  }
  for (const d of e.deixas) {
    expect(Number.isFinite(d.t) && d.t >= 0, `${rotulo}: hora inválida`).toBe(true);
    expect(d.t, `${rotulo}: deixa depois do fim`).toBeLessThanOrEqual(e.duracao + 0.01);
  }
  for (const t of textos(e.deixas)) {
    expect(t, `${rotulo}: marcador sem trocar em «${t}»`).not.toMatch(/[{}]/);
    expect(t, `${rotulo}: «${t}»`).not.toMatch(/undefined|null|NaN/);
    // Eles falam com a «Cobrança», não com a cidade.
    expect(t, `${rotulo}: cidade em «${t}»`).not.toMatch(/Birigui|Marília/);
  }
  // Ninguém fica no palco: o último movimento de cada boneco que apareceu é sair.
  for (const q of ['a', 'b'] as const) {
    const dele = e.deixas.filter((d): d is Extract<Deixa, { q: typeof q }> => 'm' in d && d.q === q);
    const mostra = dele.filter(d => d.m.mostra !== undefined);
    if (mostra.length) expect(mostra[mostra.length - 1].m.mostra, `${rotulo}: ${q} ficou no palco`).toBe(false);
  }
  // E nenhum balão fica aberto.
  for (const q of ['a', 'b'] as const) {
    const baloes = e.deixas.filter(d => 'balao' in d && d.balao.q === q);
    const ultimo = baloes[baloes.length - 1];
    if (ultimo && 'balao' in ultimo) expect(ultimo.balao.texto, `${rotulo}: balão de ${q} aberto`).toBeNull();
  }
}

describe('sorteio', () => {
  it('a mesma semente dá a mesma sequência', () => {
    const a = criarSorteio(sementeDe('x', 'birigui', 12, 0));
    const b = criarSorteio(sementeDe('x', 'birigui', 12, 0));
    expect(Array.from({ length: 20 }, () => a.prox())).toEqual(Array.from({ length: 20 }, () => b.prox()));
  });

  it('sementes vizinhas dão sequências diferentes', () => {
    const a = criarSorteio(sementeDe('x', 'birigui', 12, 0));
    const b = criarSorteio(sementeDe('x', 'birigui', 12, 1));
    expect(Array.from({ length: 8 }, () => a.prox())).not.toEqual(Array.from({ length: 8 }, () => b.prox()));
  });

  it('fica entre 0 e 1 e `int` respeita os limites', () => {
    const s = criarSorteio(7);
    for (let i = 0; i < 500; i++) {
      const v = s.prox();
      expect(v >= 0 && v < 1).toBe(true);
      const n = s.int(5);
      expect(n >= 0 && n < 5 && Number.isInteger(n)).toBe(true);
    }
  });

  it('o baralho não repete carta antes de acabar', () => {
    const baralho = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const volta = baralho.map((_, n) => cartaDoBaralho(baralho, n, 'teste'));
    expect(new Set(volta).size).toBe(baralho.length);
  });
});

describe('diretor dos quebra-nozes', () => {
  it('o mesmo pedido monta o mesmo espetáculo (a cidade inteira vê igual)', () => {
    expect(montarEspetaculo(pedido())).toEqual(montarEspetaculo(pedido()));
    const p = pedido({ tipo: 'parabens', destaques: DESTAQUES });
    expect(montarEspetaculo(p)).toEqual(montarEspetaculo(p));
  });

  it('cada aparição sai diferente da outra', () => {
    const resumos = new Set<string>();
    for (let indice = 0; indice < 12; indice++) resumos.add(montarEspetaculo(pedido({ indice })).resumo.join('|'));
    expect(resumos.size).toBeGreaterThanOrEqual(9);
  });

  it('120 aparições sorteadas, nas duas cidades, saem inteiras', () => {
    for (const cidade of ['birigui', 'marilia'] as const) {
      for (let dia = 0; dia < 20; dia++) {
        for (let indice = 0; indice < 3; indice++) {
          conferir(montarEspetaculo(pedido({ cidade, dia, indice })), `${cidade} dia ${dia} nº ${indice}`);
        }
      }
    }
  });

  it('toda combinação forçada de entrada, número e saída sai inteira', () => {
    const formacoes: Formacao[] = ['dupla', 'a', 'b'];
    for (const formacao of formacoes) {
      const solo = formacao !== 'dupla';
      for (const entrada of solo ? ENTRADAS_SOLO : ENTRADAS) {
        for (const numero of [...(solo ? NUMEROS_SOLO : NUMEROS), 'nenhum' as const]) {
          for (const saida of solo ? SAIDAS_SOLO : SAIDAS) {
            const e = montarEspetaculo(pedido({ forcar: { formacao, entrada, numero, saida } }));
            conferir(e, `${formacao}/${entrada}/${numero}/${saida}`);
            expect(e.formacao).toBe(formacao);
          }
        }
      }
    }
  });

  it('toda conversa e todo monólogo do banco de falas vai ao palco inteiro', () => {
    CONVERSAS.forEach((_, conversa) => conferir(montarEspetaculo(pedido({ forcar: { formacao: 'dupla', conversa } })), `conversa ${conversa}`));
    MONOLOGOS.forEach((_, conversa) => {
      conferir(montarEspetaculo(pedido({ forcar: { formacao: 'a', conversa } })), `monólogo ${conversa} (diretor)`);
      conferir(montarEspetaculo(pedido({ cidade: 'marilia', forcar: { formacao: 'b', conversa } })), `monólogo ${conversa} (head)`);
    });
  });

  it('na segunda-feira os destaques são «de sexta», também na boca deles', () => {
    for (let dia = 0; dia < 12; dia++) {
      const e = montarEspetaculo(pedido({ tipo: 'parabens', dia, destaques: DESTAQUES, quando: 'sexta' }));
      conferir(e, `parabéns de segunda, dia ${dia}`);
      expect(textos(e.deixas).join(' ')).not.toMatch(/\bontem\b/);
    }
  });

  it('a entrada e a saída são mudas: só soa o que se vê', () => {
    // Entrando pelos lados e saindo pelos lados, sem número: nenhum gesto com som.
    const e = montarEspetaculo(pedido({ forcar: { formacao: 'dupla', entrada: 'lados', numero: 'nenhum', saida: 'lados', conversa: 0 } }));
    const veu = e.deixas.flatMap(d => ('cena' in d && 'veu' in d.cena ? [d.t] : []));
    for (const s of sonsDe(e.deixas)) expect(['sino', 'tambor', 'corneta', 'corda', 'palmas', 'baque', 'pop', 'brinde', 'fanfarra']).toContain(s.som);
    // Nada toca colado no véu subindo nem no véu descendo.
    const horas = e.deixas.flatMap(d => ('cena' in d && 'som' in d.cena ? [d.t] : []));
    for (const t of horas) { expect(t - veu[0]).toBeGreaterThan(1); expect(veu[veu.length - 1] - t).toBeGreaterThan(1); }
    // A faixa dos destaques continua descendo com a fanfarra.
    expect(sonsDe(montarEspetaculo(pedido({ tipo: 'parabens', destaques: DESTAQUES })).deixas).map(s => s.som)).toContain('fanfarra');
  });

  it('a chamada das 10h mostra um cartão por destaque, na ordem, e diz o nome de cada um', () => {
    for (let dia = 0; dia < 15; dia++) {
      const e = montarEspetaculo(pedido({ tipo: 'parabens', dia, destaques: DESTAQUES }));
      conferir(e, `parabéns dia ${dia}`);
      const cartoes = e.deixas.flatMap(d => ('cena' in d && 'cartao' in d.cena ? [d.cena.cartao] : []));
      expect(cartoes).toEqual([0, 1, 2]);
      const dito = textos(e.deixas).join(' ');
      for (const d of DESTAQUES) expect(dito, `dia ${dia}: faltou ${d.nome}`).toContain(d.nome);
      expect(e.formacao).toBe('dupla');
    }
  });

  it('sem destaque, a chamada vira uma aparição comum', () => {
    const e = montarEspetaculo(pedido({ tipo: 'parabens', destaques: [] }));
    conferir(e, 'parabéns sem destaque');
    expect(e.deixas.some(d => 'cena' in d && 'cartao' in d.cena)).toBe(false);
  });

  it('uma aparição cabe em um minuto e meio; a chamada, em dois', () => {
    for (let indice = 0; indice < 40; indice++) {
      expect(montarEspetaculo(pedido({ indice })).duracao).toBeLessThan(90);
      expect(montarEspetaculo(pedido({ indice, lider: LIDER })).duracao).toBeLessThan(90);
    }
    for (const cerimonia of CERIMONIAS) {
      for (const final of FINAIS) {
        expect(montarEspetaculo(pedido({ tipo: 'parabens', destaques: DESTAQUES, forcar: { cerimonia, final } })).duracao, `${cerimonia}/${final}`).toBeLessThan(120);
      }
    }
  });
});

describe('a chamada dos destaques varia', () => {
  it('toda cerimônia com todo final sai inteira, com um cartão por destaque e o nome de cada um', () => {
    for (const cerimonia of CERIMONIAS) {
      for (const final of FINAIS) {
        const e = montarEspetaculo(pedido({ tipo: 'parabens', destaques: DESTAQUES, forcar: { cerimonia, final } }));
        conferir(e, `${cerimonia}/${final}`);
        expect(doResumo(e, 'cerimônia')).toBe(cerimonia);
        expect(doResumo(e, 'final')).toBe(final);
        expect(e.deixas.flatMap(d => ('cena' in d && 'cartao' in d.cena ? [d.cena.cartao] : []))).toEqual([0, 1, 2]);
        const dito = textos(e.deixas).join(' ');
        for (const d of DESTAQUES) expect(dito, `${cerimonia}/${final}: faltou ${d.nome}`).toContain(d.nome);
      }
    }
  });

  it('a de hoje nunca é a de ontem: muda a cerimônia e muda o final, e em cinco dias passam todos', () => {
    for (const cidade of ['birigui', 'marilia'] as const) {
      const dias = diasUteis(40).map(dia => montarEspetaculo(pedido({ tipo: 'parabens', cidade, dia, indice: 0, destaques: DESTAQUES })));
      for (let i = 1; i < dias.length; i++) {
        expect(doResumo(dias[i], 'cerimônia'), `${cidade}, dia útil ${i}`).not.toBe(doResumo(dias[i - 1], 'cerimônia'));
        expect(doResumo(dias[i], 'final'), `${cidade}, dia útil ${i}`).not.toBe(doResumo(dias[i - 1], 'final'));
        expect(doResumo(dias[i], 'entrada'), `${cidade}, dia útil ${i}`).not.toBe(doResumo(dias[i - 1], 'entrada'));
        expect(textos(dias[i].deixas)[0], `${cidade}, dia útil ${i}: a mesma abertura`).not.toBe(textos(dias[i - 1].deixas)[0]);
      }
      // A primeira semana: as cinco cerimônias e os cinco finais, um de cada.
      expect(new Set(dias.slice(0, 5).map(e => doResumo(e, 'cerimônia'))).size).toBe(CERIMONIAS.length);
      expect(new Set(dias.slice(0, 5).map(e => doResumo(e, 'final'))).size).toBe(FINAIS.length);
    }
  });

  it('chamada na hora duas vezes seguidas: nunca a mesma', () => {
    // O número da chamada do card (100 em diante) e o do «Ver só aqui» (um milhão em diante).
    for (const base of [100, 1_000_001]) {
      const chamadas = Array.from({ length: 30 }, (_, k) => montarEspetaculo(pedido({ tipo: 'parabens', indice: base + k, destaques: DESTAQUES })));
      for (let i = 1; i < chamadas.length; i++) {
        expect(doResumo(chamadas[i], 'cerimônia')).not.toBe(doResumo(chamadas[i - 1], 'cerimônia'));
        expect(doResumo(chamadas[i], 'final')).not.toBe(doResumo(chamadas[i - 1], 'final'));
        expect(chamadas[i].deixas).not.toEqual(chamadas[i - 1].deixas);
      }
    }
  });

  it('com muitos setores, só as cerimônias de passo apertado, e cabe em dois minutos e meio', () => {
    const muitos = Array.from({ length: 10 }, (_, i) => ({ setor: `Setor ${i + 1}`, nome: `Pessoa ${i + 1}`, foto: null }));
    for (const dia of diasUteis(10)) {
      const e = montarEspetaculo(pedido({ tipo: 'parabens', dia, destaques: muitos }));
      conferir(e, `dez destaques, dia ${dia}`);
      expect(['pergaminho', 'revezamento']).toContain(doResumo(e, 'cerimônia'));
      expect(e.duracao).toBeLessThan(150);
    }
  });

  it('o sino, o tambor e a corneta soam com o gesto: uma vez por cartão', () => {
    // Os sons da cerimônia: os que vêm depois da fanfarra da faixa (a entrada pode ter o tambor da marcha).
    const com = (cerimonia: (typeof CERIMONIAS)[number]) => {
      const sons = sonsDe(montarEspetaculo(pedido({ tipo: 'parabens', destaques: DESTAQUES, forcar: { cerimonia, final: 'confete', entrada: 'tapete', saida: 'marcha' } })).deixas);
      return sons.slice(sons.findIndex(s => s.som === 'fanfarra') + 1);
    };
    const sinos = com('sino').filter(s => s.som === 'sino');
    expect(sinos).toHaveLength(DESTAQUES.length);
    for (const s of sinos) { expect(s.dur).toBeGreaterThan(0.5); expect(typeof s.x).toBe('number'); }
    const tambores = com('suspense').filter(s => s.som === 'tambor');
    expect(tambores).toHaveLength(DESTAQUES.length);
    for (const s of tambores) expect(s.dur).toBeGreaterThan(1);
    expect(com('corneta').filter(s => s.som === 'corneta')).toHaveLength(DESTAQUES.length);
    // O final de palmas e confete tem as palmas.
    expect(com('pergaminho').some(s => s.som === 'palmas' && (s.dur ?? 0) > 1)).toBe(true);
  });
});

describe('as aparições variam', () => {
  it('as três do dia, dia após dia: nenhuma conversa repete antes de o baralho acabar, e nunca duas seguidas', () => {
    for (const cidade of ['birigui', 'marilia'] as const) {
      const fila = diasUteis(60).flatMap(dia => [1, 2, 3].map(indice => montarEspetaculo(pedido({ cidade, dia, indice }))));
      for (const formacao of ['dupla', 'solo'] as const) {
        const baralho = formacao === 'dupla' ? CONVERSAS.length : MONOLOGOS.length;
        const dela = fila.filter(e => (e.formacao === 'dupla') === (formacao === 'dupla'));
        const conversas = dela.map(e => doResumo(e, 'conversa'));
        // A primeira volta do baralho: todas as conversas, uma vez cada.
        const volta = conversas.slice(0, baralho);
        expect(new Set(volta).size, `${cidade}/${formacao}: repetiu dentro da volta`).toBe(volta.length);
        // E na fila inteira nada vem duas vezes seguidas: nem a conversa, nem a entrada, nem o número.
        for (let i = 1; i < dela.length; i++) {
          expect(conversas[i], `${cidade}/${formacao}: repetiu a conversa anterior (${i})`).not.toBe(conversas[i - 1]);
          expect(doResumo(dela[i], 'entrada'), `${cidade}/${formacao}: repetiu a entrada anterior (${i})`).not.toBe(doResumo(dela[i - 1], 'entrada'));
        }
        const numeros = dela.map(e => doResumo(e, 'número')).filter(nome => nome !== '—');
        for (let i = 1; i < numeros.length; i++) expect(numeros[i], `${cidade}/${formacao}: repetiu o número anterior (${i})`).not.toBe(numeros[i - 1]);
      }
      // Sete em cada dez são dos dois; o resto, um de cada vez.
      const duplas = fila.filter(e => e.formacao === 'dupla').length;
      expect(duplas).toBe(Math.round(fila.length * 0.7));
      expect(fila.filter(e => e.formacao === 'a').length).toBe(fila.filter(e => e.formacao === 'b').length);
    }
  });

  it('chamada na hora: cada uma é a carta seguinte, sem repetir a anterior', () => {
    for (const base of [100, 1_000_001]) {
      const fila = Array.from({ length: 120 }, (_, k) => montarEspetaculo(pedido({ indice: base + k })));
      const conversas = fila.filter(e => e.formacao === 'dupla').map(e => doResumo(e, 'conversa'));
      for (let i = 1; i < conversas.length; i++) expect(conversas[i]).not.toBe(conversas[i - 1]);
      expect(new Set(conversas).size).toBeGreaterThanOrEqual(Math.min(CONVERSAS.length, 60));
    }
  });

  it('em um mês, as duas cidades não veem a mesma coisa no mesmo dia', () => {
    let iguais = 0;
    for (const dia of diasUteis(20)) {
      for (const indice of [1, 2, 3]) {
        const b = montarEspetaculo(pedido({ cidade: 'birigui', dia, indice }));
        const m = montarEspetaculo(pedido({ cidade: 'marilia', dia, indice }));
        if (b.resumo.join('|') === m.resumo.join('|')) iguais++;
      }
    }
    expect(iguais).toBeLessThanOrEqual(1);
  });
});

describe('a hora e a Cobrança', () => {
  const todasAsFalas = (hora: number) => {
    const falas: string[] = [];
    for (let k = 0; k < 40; k++) {
      falas.push(...textos(montarEspetaculo(pedido({ indice: 100 + k, hora })).deixas));
      falas.push(...textos(montarEspetaculo(pedido({ tipo: 'parabens', indice: 100 + k, hora, destaques: DESTAQUES })).deixas));
      falas.push(...textos(montarEspetaculo(pedido({ indice: 100 + k, hora, lider: LIDER })).deixas));
    }
    return falas.join(' | ');
  };

  it('de manhã é bom dia, de tarde é boa tarde, de noite é boa noite', () => {
    // («um bom dia de trabalho» e «no meio da tarde» são falas de qualquer hora.)
    const manha = todasAsFalas(9);
    expect(manha).toMatch(/Bom dia/);
    expect(manha).toMatch(/boletim da manhã/);
    expect(manha).not.toMatch(/Boa tarde|Boa noite|boa tarde|boa noite|boletim da (tarde|noite)/);
    const tarde = todasAsFalas(15);
    expect(tarde).toMatch(/Boa tarde/);
    expect(tarde).toMatch(/boletim da tarde/);
    expect(tarde).not.toMatch(/Bom dia|Boa noite|boa noite|desejar um bom dia|boletim da (manhã|noite)/);
    const noite = todasAsFalas(20);
    expect(noite).toMatch(/Boa noite/);
    expect(noite).not.toMatch(/Bom dia|Boa tarde|boa tarde|desejar um bom dia|boletim da (manhã|tarde)/);
  });

  it('sem a hora, vale a da chamada das dez: bom dia', () => {
    const falas = Array.from({ length: 20 }, (_, k) => textos(montarEspetaculo(pedido({ tipo: 'parabens', dia: k, destaques: DESTAQUES })).deixas).join(' ')).join(' ');
    expect(falas).not.toMatch(/Boa tarde|Boa noite/);
  });

  it('a faixa diz «Cobrança», nas duas cidades', () => {
    for (const cidade of ['birigui', 'marilia'] as const) {
      const e = montarEspetaculo(pedido({ tipo: 'parabens', cidade, destaques: DESTAQUES }));
      expect(e.deixas.flatMap(d => ('cena' in d && 'letreiro' in d.cena && d.cena.letreiro ? [d.cena.letreiro] : []))).toEqual(['Cobrança']);
    }
  });
});

describe('o boletim de quem mais recebeu', () => {
  it('anuncia a pessoa com o cartão dela, sempre os dois, e sai inteiro', () => {
    for (const dia of diasUteis(15)) {
      for (const cidade of ['birigui', 'marilia'] as const) {
        const e = montarEspetaculo(pedido({ cidade, dia, indice: 3, lider: LIDER, hora: 16 }));
        conferir(e, `boletim ${cidade} dia ${dia}`);
        expect(e.formacao).toBe('dupla');
        expect(e.deixas.flatMap(d => ('cena' in d && 'cartao' in d.cena ? [d.cena.cartao] : []))).toEqual([0]);
        const dito = textos(e.deixas).join(' ');
        expect(dito).toContain(LIDER.nome);
        // O cartão sobe e some antes de eles saírem.
        expect(e.deixas.some(d => 'cena' in d && 'cartoes' in d.cena)).toBe(true);
      }
    }
  });

  it('todo boletim do banco de falas vai ao palco, e o de hoje não é o de ontem', () => {
    const ditos = new Set<string>();
    const fila = diasUteis(BOLETINS.length * 2).map(dia => montarEspetaculo(pedido({ dia, indice: 2, lider: LIDER })));
    fila.forEach((e, i) => {
      ditos.add(doResumo(e, 'boletim'));
      if (i > 0) expect(doResumo(e, 'boletim')).not.toBe(doResumo(fila[i - 1], 'boletim'));
    });
    expect(ditos.size).toBe(BOLETINS.length);
  });

  it('sem líder é uma aparição comum; sozinho não tem boletim', () => {
    expect(doResumo(montarEspetaculo(pedido({ indice: 2, lider: null })), 'boletim')).toBe('');
    const solo = montarEspetaculo(pedido({ indice: 2, lider: LIDER, forcar: { formacao: 'a' } }));
    conferir(solo, 'boletim forçado a solo');
    expect(solo.deixas.some(d => 'cena' in d && 'cartao' in d.cena)).toBe(false);
  });
});
