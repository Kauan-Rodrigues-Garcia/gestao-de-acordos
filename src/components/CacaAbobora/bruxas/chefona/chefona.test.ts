/**
 * chefona.test.ts — a Bruxa do Pântano (a bruxa do Minecraft), sem navegador.
 *
 * O que se protege: o modelo monta inteiro, com as peças certas para o tiro;
 * o tiro raspando ainda pega; as manobras deixam ela dentro da tela e só a
 * pérola some do tiro (no teleporte); o estrago cresce sem ficar preto; e toda
 * poção volta a página EXATAMENTE como estava — nenhum texto do React é
 * reescrito.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NUMERO_DA_PARTE, alvoDaParte, parteNoPonto } from '../arte';
import {
  ALTURA_MC, CORES_MC, DROPS, GARRAFA, LARGURA_MC, MODELO, PIXEL_MC, PRIMEIRO_BEBENDO_MC, PRIMEIRO_DOR_MC, PRIMEIRO_RINDO_MC,
  PRIMEIRO_SEGURANDO_MC, PRIMEIRO_TOTEM_MC, QUADROS_FLUTUANDO, QUADROS_MC, TEXELS_ALTURA, TEXELS_LARGURA, TOTEM,
  CORES_ESTRAGO, PEROLA, cabecaMC, comContorno, coresDaPocao, estagioDoDano, estragos, montarBruxaMC, montarTexels,
} from './arte';
import { glifoMC, larguraTextoMC } from './fonteMC';
import { ENCANTO, letrasComRuna, paraGalatico } from './galatico';
import {
  ATRIBUTO_TEXTO, CLASSE_VEU, FEITICOS, FILTROS_OFUSCANTE, FILTROS_VISAO, FILTRO_NEGATIVO, LISTA_FEITICOS, PASSO_VISAO_MS,
  alvosPorAtributo, deTrasParaFrente, disponivel, duracaoDoFeitico, embaralhar, encantoDa, escolherVariante, forcaDoFeitico,
  lancar, negativar, nivelDaPocao, nomeEstranho, quantosAlvos, sortearSumico, variantesDisponiveis, zerar,
} from './feiticos';
import {
  MANOBRAS, avancarCorpo, criarCorpo, escolherManobra, faseDaPerola, iniciarManobra, invulneravel, type Zona,
} from './movimento';
import { FOLGA_MIRA, parteComFolga } from './palcoChefona';
import { CINZA_DO_LIQUIDO_MC, VIDRO_MC } from './texturasMC';

/** Sorteio repetível (mulberry32), como em `../bruxas.test.ts`. */
function semente(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('o modelo da bruxa do Minecraft', () => {
  it('todo quadro monta com chapéu, cabeça, manto, ombros e pés', () => {
    for (let q = 0; q < QUADROS_MC.length; q++) {
      const presentes = new Set(montarTexels(q).partes);
      for (const p of ['chapeu', 'cabeca', 'tronco', 'bracoFrente', 'pernaFrente'] as const) {
        expect(presentes.has(NUMERO_DA_PARTE[p]), `q${q} ${p}`).toBe(true);
      }
    }
  });

  it('a grade da referência: 18 × 42, simétrica nas medidas (chapéu 2/4/6/8/10, rosto 8, ombros 16, manto 10)', () => {
    expect(MODELO).toHaveLength(TEXELS_ALTURA);
    for (const l of MODELO) expect(l).toHaveLength(TEXELS_LARGURA);
    const largura = (y: number) => MODELO[y].replace(/\./g, '').length;
    expect([1, 2, 4, 6, 8].map(largura)).toEqual([2, 4, 6, 8, 10]);
    expect(largura(14)).toBe(8);
    expect(largura(22)).toBe(16);
    expect(largura(30)).toBe(10);
  });

  it('como na referência: pedra verde no chapéu, olhos roxos, monocelha, nariz laranja, faixa verde, pés cinza e contorno', () => {
    const cores = new Set(montarTexels(0).cores);
    for (const c of [CORES_MC.pedra, CORES_MC.olhoRoxo, CORES_MC.monocelha, CORES_MC.nariz, CORES_MC.faixa, CORES_MC.peLuz, CORES_MC.contorno]) {
      expect(cores.has(c), c).toBe(true);
    }
  });

  it('o nariz mexe sozinho: os quadros de flutuar não são todos iguais', () => {
    const narizes = [0, 1].map(q => montarTexels(q).cores.findIndex(c => c === CORES_MC.nariz));
    expect(new Set(narizes).size).toBe(2);
  });

  it('a animação anda em texels inteiros: respira, pés, olhos fechados e o braço erguido', () => {
    const topo = (q: number) => Math.floor(montarTexels(q).cores.findIndex(c => c === CORES_MC.pedraLuz) / TEXELS_LARGURA);
    // Respirando, o chapéu desce exatamente um texel.
    expect(topo(3) - topo(0)).toBe(1);
    // Gargalhando, a cabeça sobe um texel.
    expect(topo(0) - topo(PRIMEIRO_RINDO_MC)).toBe(1);
    // Os quadros do ciclo de flutuar são todos diferentes.
    const quadros = Array.from({ length: QUADROS_FLUTUANDO }, (_, q) => montarTexels(q).cores.join());
    expect(new Set(quadros).size).toBe(QUADROS_FLUTUANDO);
    // Olhos fechados quando apanha e gargalhando.
    for (const q of [PRIMEIRO_DOR_MC, PRIMEIRO_RINDO_MC]) expect(montarTexels(q).cores).not.toContain(CORES_MC.olhoBranco);
    // O braço sobe ao lado do rosto para segurar a poção, beber e erguer o totem.
    const bracos = (q: number) => montarTexels(q).partes.filter(p => p === NUMERO_DA_PARTE.bracoFrente).length;
    for (const q of [PRIMEIRO_SEGURANDO_MC, PRIMEIRO_BEBENDO_MC, PRIMEIRO_TOTEM_MC]) expect(bracos(q)).toBeGreaterThan(bracos(0));
  });

  it('cada texel vira PIXEL_MC × PIXEL_MC pixels, e o tiro acha a peça', () => {
    const img = montarBruxaMC(0);
    expect(img.largura).toBe(TEXELS_LARGURA * PIXEL_MC);
    expect(img.altura).toBe(TEXELS_ALTURA * PIXEL_MC);
    expect([LARGURA_MC, ALTURA_MC]).toEqual([img.largura, img.altura]);
    const no = (x: number, y: number) => parteNoPonto(img, x * PIXEL_MC, y * PIXEL_MC);
    // O rosto é cabeça (o crítico); a pedra é chapéu; o ombro, o manto e o pé.
    expect(alvoDaParte('cabeca')).toBe('cabeca');
    expect(no(7, 15)).toBe(NUMERO_DA_PARTE.cabeca);
    expect(no(8, 6)).toBe(NUMERO_DA_PARTE.chapeu);
    expect(no(3, 22)).toBe(NUMERO_DA_PARTE.bracoFrente);
    expect(no(6, 31)).toBe(NUMERO_DA_PARTE.tronco);
    expect(no(7, 39)).toBe(NUMERO_DA_PARTE.pernaFrente);
    // Fora dela, nada.
    expect(parteNoPonto(img, 0, 0)).toBe(0);
  });

  it('o retrato da contagem é a cabeça com o chapéu', () => {
    const c = cabecaMC();
    expect(c.altura).toBe(21);
    expect(c.cores).toContain(CORES_MC.pedra);
    expect(c.cores).not.toContain(CORES_MC.ombroFundo);
  });

  it('o tiro que passa raspando ainda pega a peça mais perto, até FOLGA_MIRA', () => {
    const img = montarBruxaMC(0);
    // Logo acima da ponta do chapéu (texel 9, 1): fora do sprite.
    const x = 9 * PIXEL_MC, y = 1 * PIXEL_MC - FOLGA_MIRA;
    expect(parteNoPonto(img, x, y)).toBe(0);
    expect(parteComFolga(img, x, y)).toBe(NUMERO_DA_PARTE.chapeu);
    // Longe demais, continua furo.
    expect(parteComFolga(img, 0, 0)).toBe(0);
  });

  it('os drops do jogo: 16 × 16, toda letra com cor, e o contorno em volta', () => {
    expect(DROPS.map(d => d.nome)).toEqual([
      'Poção de Cura', 'Garrafa de Vidro', 'Pó de Glowstone', 'Pó de Redstone', 'Olho de Aranha', 'Açúcar', 'Pólvora', 'Graveto',
    ]);
    for (const d of [...DROPS, TOTEM, PEROLA]) {
      const c = comContorno(d);
      expect(c.linhas).toHaveLength(16);
      for (const l of c.linhas) {
        expect(l).toHaveLength(16);
        for (const ch of l) if (ch !== '.') expect(c.cores[ch], `${d.nome} «${ch}»`).toBeTruthy();
      }
      expect(c.linhas.join('')).toContain('o');
      expect(c.cores.o).toBe(CORES_MC.contorno);
    }
  });

  it('toda poção é a garrafa do jogo: o vidro igual, o líquido é a cor multiplicada pelo cinza', () => {
    expect(DROPS[0].linhas).toBe(GARRAFA);
    const verde = coresDaPocao('#4e9331'), vermelha = coresDaPocao('#f82423');
    for (const k of Object.keys(VIDRO_MC)) expect(verde[k]).toBe(vermelha[k]);
    for (const k of Object.keys(CINZA_DO_LIQUIDO_MC)) expect(verde[k]).not.toBe(vermelha[k]);
    // Onde o líquido é branco (255), a cor é a da poção, sem mudar.
    const branco = Object.entries(CINZA_DO_LIQUIDO_MC).find(([, g]) => g === 255)![0];
    expect(verde[branco]).toBe('#4e9331');
  });

  it('o Totem da Imortalidade do jogo, com os olhos de esmeralda', () => {
    expect(Object.values(TOTEM.cores)).toContain('#41e67f');
  });

});

describe('o dano: ela fica estragada (não preta)', () => {
  it('estágios pela vida: inteira, 1, 2 e 3', () => {
    expect([1, 0.8, 0.7, 0.5, 0.3, 0.2, 0].map(estagioDoDano)).toEqual([0, 0, 1, 2, 2, 3, 3]);
  });

  it('cada estágio estraga mais, e o tiro por peça não muda onde ainda há pano', () => {
    for (let q = 0; q < QUADROS_MC.length; q++) {
      const inteira = montarTexels(q);
      const mexidos = [0, 1, 2, 3].map(e => {
        const t = montarTexels(q, e);
        // Fora do contorno (que se refaz em volta do rasgo), cada texel continua da mesma peça.
        t.cores.forEach((c, i) => {
          if (c && c !== CORES_MC.contorno && inteira.cores[i] && inteira.cores[i] !== CORES_MC.contorno) expect(t.partes[i]).toBe(inteira.partes[i]);
        });
        return t.cores.filter((c, i) => c !== inteira.cores[i]).length;
      });
      expect(mexidos[0], `q${q}`).toBe(0);
      expect(mexidos[1], `q${q}`).toBeGreaterThan(0);
      expect(mexidos[2], `q${q}`).toBeGreaterThan(mexidos[1]);
      expect(mexidos[3], `q${q}`).toBeGreaterThan(mexidos[2]);
    }
  });

  it('nenhuma cor nova é preta: fuligem, linho, remendo, curativo e brasa', () => {
    const antes = new Set(montarTexels(0).cores);
    const novas = new Set(montarTexels(0, 3).cores.filter((c): c is string => !!c && !antes.has(c)));
    expect(novas.size).toBeGreaterThan(5);
    for (const c of novas) {
      const n = parseInt(c.slice(1), 16);
      // Nada perto do preto da rachadura antiga (#0e0b14).
      expect(Math.max((n >> 16) & 255, (n >> 8) & 255, n & 255), c).toBeGreaterThanOrEqual(0x30);
    }
    const doEstagio = (e: number) => new Set(montarTexels(0, e).cores);
    expect(doEstagio(2).has(CORES_ESTRAGO.linho[0])).toBe(true);
    expect(doEstagio(3).has(CORES_ESTRAGO.curativo[1])).toBe(true);
    expect(doEstagio(3).has(CORES_ESTRAGO.brasa[0])).toBe(true);
    // O pano rasga: a barra esfarrapada tem menos texel pintado.
    const pintados = (e: number) => montarTexels(0, e).cores.filter(Boolean).length;
    expect(pintados(3)).toBeLessThan(pintados(0));
  });

  it('o estrago só cresce e fica no mesmo lugar (não pisca)', () => {
    expect(estragos(3)).toBe(estragos(3));
    expect(estragos(0).size).toBe(0);
    for (const k of estragos(1).keys()) expect(estragos(2).has(k)).toBe(true);
    for (const k of estragos(2).keys()) expect(estragos(3).has(k)).toBe(true);
  });

});

describe('movimento da Bruxa do Pântano', () => {
  const Z: Zona = { x0: 30, x1: 600, y0: 60, y1: 200, chao: 330 };

  it('flutua dois minutos dentro da zona depois de entrar, sempre de pé', () => {
    const r = semente(7);
    const c = criarCorpo(Z, r);
    let entrou = false;
    for (let i = 0; i < 120 * 60; i++) {
      avancarCorpo(c, Z, 1 / 60, 70, r);
      expect(c.giro).toBe(0);
      if (c.x >= Z.x0 && c.x <= Z.x1) entrou = true;
      if (entrou) {
        expect(c.x).toBeGreaterThan(Z.x0 - 10);
        expect(c.x).toBeLessThan(Z.x1 + 10);
        expect(c.y).toBeGreaterThanOrEqual(Z.y0 - 0.001);
        expect(c.y).toBeLessThanOrEqual(Z.y1 + 0.001);
      }
    }
    expect(entrou).toBe(true);
  });

  for (const m of MANOBRAS) {
    it(`${m}: leva tiro (só a pérola some no teleporte), e volta ao voo de pé`, () => {
      const r = semente(3);
      const c = criarCorpo(Z, r);
      c.x = 300; c.y = 120;
      iniciarManobra(c, m, Z, r);
      let passos = 0;
      while (c.manobra && passos < 600) {
        if (m !== 'perola') expect(invulneravel(c)).toBe(false);
        avancarCorpo(c, Z, 1 / 60, 70, r);
        // Nunca abaixo do chão nem fora da tela pelos lados.
        expect(c.y).toBeLessThan(Z.chao - 30);
        expect(c.x).toBeGreaterThanOrEqual(Z.x0 - 1);
        expect(c.x).toBeLessThanOrEqual(Z.x1 + 1);
        passos++;
      }
      expect(c.manobra).toBeNull();
      expect(invulneravel(c)).toBe(false);
      expect(c.giro).toBe(0);
      expect(c.visivel).toBe(true);
    });
  }

  it('a pérola: mira com ela na mão, joga, ela voa, e o teleporte é onde caiu', () => {
    const r = semente(9);
    const c = criarCorpo(Z, r);
    c.x = 120; c.y = 120;
    iniciarManobra(c, 'perola', Z, r);
    const destino = { x: c.manobra!.x1, y: c.manobra!.y1 };
    expect(Math.abs(destino.x - 120)).toBeGreaterThan((Z.x1 - Z.x0) / 3);
    expect(faseDaPerola(c)).toEqual({ mirando: true, voo: null });
    const ordem: string[] = [];
    let intocavel = 0, voou = false;
    for (let i = 0; i < 600 && c.manobra; i++) {
      for (const e of avancarCorpo(c, Z, 1 / 60, 70, r)) ordem.push(e.tipo);
      const f = faseDaPerola(c);
      if (f?.voo != null) { voou = true; expect(c.x).toBe(120); }
      if (invulneravel(c)) intocavel++;
    }
    expect(voou).toBe(true);
    expect(ordem).toEqual(['lancou', 'some', 'aparece', 'fim']);
    // Intocável só no piscar do teleporte (uns 0,09 s de 1,5 s).
    expect(intocavel).toBeGreaterThan(0);
    expect(intocavel).toBeLessThan(10);
    expect([c.x, c.y]).toEqual([destino.x, destino.y]);
  });

  it('não repete a manobra anterior, e sem céu não levita', () => {
    const r = semente(11);
    const c = criarCorpo(Z, r);
    c.x = 300; c.y = Z.y0 + 5;
    for (let i = 0; i < 50; i++) {
      const m = escolherManobra(c, Z, r, 'velocidade');
      expect(m).not.toBe('velocidade');
      expect(m).not.toBe('levitacao');
    }
  });
});

describe('as poções', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  function tela(): HTMLElement {
    document.body.innerHTML = `
      <div id="tela">
        <a><span data-alvo-feitico="aba">Acordos</span></a>
        <a><span data-alvo-feitico="aba">Analítico</span></a>
        <b><span data-alvo-feitico="valor">R$ 48.312,90</span></b>
        <table><tbody>${[1, 2, 3, 4, 5, 6].map(i => `<tr data-alvo-feitico="linha"><td>${i}</td></tr>`).join('')}</tbody></table>
      </div>`;
    return document.getElementById('tela')!;
  }

  it('toda poção tem a cor do jogo, nome de poção e mais de um jeito de cair', () => {
    for (const f of LISTA_FEITICOS) {
      expect(FEITICOS[f].cor).toMatch(/^#[0-9a-f]{6}$/);
      expect(FEITICOS[f].corClara).toMatch(/^#[0-9a-f]{6}$/);
      expect(FEITICOS[f].variantes.length).toBeGreaterThan(1);
      expect(new Set(FEITICOS[f].variantes.map(v => v.id)).size).toBe(FEITICOS[f].variantes.length);
    }
    expect(FEITICOS.invisibilidade.titulo).toBe('Poção de Invisibilidade');
  });

  it('saíram Lentidão, Veneno, Fraqueza e Levitação (16/10/2026): ficam seis', () => {
    expect([...LISTA_FEITICOS].sort()).toEqual(['cegueira', 'dano', 'encantamento', 'estranha', 'invisibilidade', 'visao']);
  });

  it('as contas: negativo, nome do Minecraft e quantas linhas somem', () => {
    expect(negativar(' R$ 48.312,90 ')).toBe('-R$ 48.312,90');
    expect(negativar('-R$ 10,00')).toBe('-R$ 10,00');
    expect(nomeEstranho('Acordos')).toBe('Trocas com Aldeões');
    expect(nomeEstranho('Pix Automático')).toBe('Circuito de Redstone');
    expect(nomeEstranho('Metas')).toBe('Conquistas');
    expect(nomeEstranho('Zebra')).toBe('Arbez');
    expect(sortearSumico(0, semente(1))).toEqual([]);
    expect(sortearSumico(1, semente(1))).toEqual([0]);
    const s = sortearSumico(10, semente(1));
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s.length).toBeLessThan(10);
    expect(new Set(s).size).toBe(s.length);
  });

  for (const f of LISTA_FEITICOS) {
    for (const { id } of FEITICOS[f].variantes) {
      it(`${f} (${id}): cai na tela e desfaz deixando o HTML igual ao de antes`, () => {
        vi.useFakeTimers();
        const raiz = tela();
        const antes = raiz.outerHTML;
        const textoAntes = raiz.textContent;
        const alvos = alvosPorAtributo(() => raiz, () => raiz);
        expect(disponivel(f, alvos)).toBe(true);
        expect(variantesDisponiveis(f, alvos).map(v => v.id)).toContain(id);
        const l = lancar(f, alvos, semente(5), 1, id);
        expect(l.atingidos.length).toBeGreaterThan(0);
        // O texto do React nunca é reescrito: só atributo e classe por cima.
        expect(raiz.textContent).toBe(textoAntes);
        vi.advanceTimersByTime(PASSO_VISAO_MS * 3);
        l.desfazer();
        expect(raiz.outerHTML.replace(/ class=""/g, '').replace(/ style=""/g, '')).toBe(antes);
        // O véu da Cegueira sai junto.
        expect(document.querySelector(`.${CLASSE_VEU}`)).toBeNull();
      });
    }
  }

  it('a Cegueira põe o véu que segue o mouse (uma pintura por quadro)', () => {
    vi.useFakeTimers();
    const raiz = tela();
    const cego = lancar('cegueira', alvosPorAtributo(() => raiz, () => raiz));
    const veu = document.querySelector<HTMLElement>(`.${CLASSE_VEU}-cegueira`)!;
    expect(veu).not.toBeNull();
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 80 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 130, clientY: 90 }));
    vi.advanceTimersByTime(50);
    expect(veu.style.getPropertyValue('--bx-veu-x')).toBe('130px');
    expect(veu.style.getPropertyValue('--bx-veu-y')).toBe('90px');
    cego.desfazer();
    expect(document.querySelector(`.${CLASSE_VEU}`)).toBeNull();
  });

  it('a Escuridão pulsa e a lanterna anda sozinha, sem o mouse', () => {
    vi.useFakeTimers();
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const escuro = lancar('cegueira', alvos, semente(1), 1, 'escuridao');
    expect(document.querySelector(`.${CLASSE_VEU}-escuridao`)).not.toBeNull();
    escuro.desfazer();
    const lanterna = lancar('cegueira', alvos, semente(1), 1, 'lanterna');
    const veu = document.querySelector<HTMLElement>(`.${CLASSE_VEU}-cegueira`)!;
    const antes = veu.style.getPropertyValue('--bx-veu-x');
    vi.advanceTimersByTime(700);
    expect(veu.style.getPropertyValue('--bx-veu-x')).not.toBe(antes);
    lanterna.desfazer();
    expect(document.querySelector(`.${CLASSE_VEU}`)).toBeNull();
  });

  it('o jeito sorteado nunca repete o da última vez (quando há outro que caiba)', () => {
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const r = semente(9);
    for (const f of LISTA_FEITICOS) {
      let ultima: string | null = null;
      for (let i = 0; i < 20; i++) {
        const v = escolherVariante(f, alvos, ultima, r);
        expect(v).not.toBeNull();
        expect(v).not.toBe(ultima);
        ultima = v;
      }
    }
    expect(encantoDa('dano', 'zerado')).toBe('O dinheiro evaporou!');
    expect(encantoDa('dano', 'nao-existe')).toBe(encantoDa('dano'));
  });

  it('sem linhas, a Invisibilidade ainda pode sumir com os valores; com uma aba só, nada de trocar', () => {
    document.body.innerHTML = '<div id="t"><span data-alvo-feitico="aba">Metas</span><b data-alvo-feitico="valor">R$ 1,00</b></div>';
    const raiz = document.getElementById('t')!;
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    expect(variantesDisponiveis('invisibilidade', alvos).map(v => v.id)).toEqual(['valores']);
    expect(variantesDisponiveis('estranha', alvos).map(v => v.id)).toEqual(['minecraft', 'avesso']);
  });

  it('os jeitos da Poção de Dano: zerado e embaralhado', () => {
    expect(zerar(' R$ 48.312,90 ')).toBe('R$ 0,00');
    expect(zerar('72%')).toBe('0%');
    expect(zerar('1.234 acordos')).toBe('0 acordos');
    const e = embaralhar('R$ 48.312,90', semente(3));
    expect(e).not.toBe('R$ 48.312,90');
    // A pontuação fica no lugar e os dígitos são os mesmos.
    expect(e.replace(/\d/g, '#')).toBe('R$ ##.###,##');
    expect([...e.replace(/\D/g, '')].sort().join('')).toBe([...'4831290'].sort().join(''));
    // Sem dois dígitos diferentes, fica negativo.
    expect(embaralhar('R$ 11,11', semente(3))).toBe('-R$ 11,11');
  });

  it('os jeitos da Poção Estranha: avesso e abas trocadas', () => {
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const avesso = lancar('estranha', alvos, semente(1), 1, 'avesso');
    const nomes = () => [...raiz.querySelectorAll('[data-alvo-feitico="aba"]')].map(a => a.getAttribute(ATRIBUTO_TEXTO));
    expect(nomes()).toEqual([deTrasParaFrente('Acordos'), deTrasParaFrente('Analítico')]);
    avesso.desfazer();
    const trocadas = lancar('estranha', alvos, semente(1), 0.35, 'trocadas');
    expect(nomes()).toEqual(['Analítico', 'Acordos']);
    trocadas.desfazer();
  });

  it('a Invisibilidade some com os valores, ou deixa as linhas fantasmas piscando', () => {
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const valores = lancar('invisibilidade', alvos, semente(2), 1, 'valores');
    expect(raiz.querySelector('[data-alvo-feitico="valor"]')!.classList.contains('bx-enf-sumido')).toBe(true);
    valores.desfazer();
    const fantasma = lancar('invisibilidade', alvos, semente(2), 1, 'fantasma');
    const fantasmas = [...raiz.querySelectorAll<HTMLElement>('.bx-enf-fantasma')];
    expect(fantasmas.length).toBeGreaterThan(1);
    expect(new Set(fantasmas.map(el => el.style.getPropertyValue('--bx-enf-atraso'))).size).toBeGreaterThan(1);
    expect(raiz.querySelector('.bx-enf-sumido')).toBeNull();
    fantasma.desfazer();
  });

  it('a Visão Noturna em negativo fica parada; a ofuscante pulsa', () => {
    vi.useFakeTimers();
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const negativo = lancar('visao', alvos, semente(1), 1, 'negativo');
    expect(raiz.style.filter).toBe(FILTRO_NEGATIVO);
    vi.advanceTimersByTime(PASSO_VISAO_MS * 4);
    expect(raiz.style.filter).toBe(FILTRO_NEGATIVO);
    negativo.desfazer();
    const ofusca = lancar('visao', alvos, semente(1), 1, 'ofuscante');
    expect(raiz.style.filter).toBe(FILTROS_OFUSCANTE[0]);
    vi.advanceTimersByTime(PASSO_VISAO_MS * 1.5);
    expect(raiz.style.filter).toBe(FILTROS_OFUSCANTE[1]);
    ofusca.desfazer();
    expect(raiz.style.filter).toBe('');
  });

  it('o Encantamento «tudo» também põe os valores em runas', () => {
    const raiz = tela();
    const l = lancar('encantamento', alvosPorAtributo(() => raiz, () => raiz), semente(1), 1, 'tudo');
    expect(raiz.querySelector('[data-alvo-feitico="valor"]')!.classList.contains('bx-enf-galatico')).toBe(true);
    expect(raiz.querySelectorAll('.bx-enf-galatico')).toHaveLength(3);
    l.desfazer();
    expect(raiz.querySelector('.bx-enf-galatico')).toBeNull();
  });

  it('a Poção de Dano e a Estranha desenham o texto novo pelo atributo', () => {
    const raiz = tela();
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    lancar('dano', alvos);
    lancar('estranha', alvos);
    expect(raiz.querySelector('[data-alvo-feitico="valor"]')!.getAttribute(ATRIBUTO_TEXTO)).toBe('-R$ 48.312,90');
    const abas = [...raiz.querySelectorAll('[data-alvo-feitico="aba"]')].map(a => a.getAttribute(ATRIBUTO_TEXTO));
    expect(abas).toEqual(['Trocas com Aldeões', 'Mapa']);
  });

  it('a Visão Noturna pisca de tema em tema na raiz', () => {
    vi.useFakeTimers();
    const raiz = tela();
    const l = lancar('visao', alvosPorAtributo(() => raiz, () => raiz));
    expect(raiz.style.filter).toBe(FILTROS_VISAO[0]);
    vi.advanceTimersByTime(PASSO_VISAO_MS);
    expect(raiz.style.filter).toBe(FILTROS_VISAO[1]);
    l.desfazer();
    expect(raiz.style.filter).toBe('');
  });

  it('tela sem alvo: só as poções que pegam a tela toda', () => {
    document.body.innerHTML = '<div id="vazia"></div>';
    const raiz = document.getElementById('vazia')!;
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    expect(disponivel('dano', alvos)).toBe(false);
    expect(disponivel('estranha', alvos)).toBe(false);
    expect(disponivel('invisibilidade', alvos)).toBe(false);
    expect(disponivel('visao', alvos)).toBe(true);
    expect(disponivel('encantamento', alvos)).toBe(true);
    expect(disponivel('cegueira', alvos)).toBe(true);
    expect(escolherVariante('dano', alvos, null)).toBeNull();
  });
});

describe('a força e o Encantamento', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

  it('quanto mais rachada, mais fraca e mais curta (nível II → I)', () => {
    expect(forcaDoFeitico(1)).toBe(1);
    expect(forcaDoFeitico(0)).toBeCloseTo(0.35);
    expect(nivelDaPocao(1)).toBe('II');
    expect(nivelDaPocao(0.4)).toBe('I');
    expect(duracaoDoFeitico('dano', 1)).toBe(12_000);
    expect(duracaoDoFeitico('dano', 0.35)).toBeLessThan(12_000 * 0.65);
    expect(duracaoDoFeitico('visao', 0.35)).toBeGreaterThanOrEqual(3_000);
    expect(quantosAlvos(10, 1)).toBe(10);
    expect(quantosAlvos(10, 0.35)).toBe(4);
    expect(quantosAlvos(1, 0.35)).toBe(1);
    expect(sortearSumico(20, semente(2), 0.35).length).toBeLessThan(sortearSumico(20, semente(2), 1).length);
  });

  it('o Alfabeto Galáctico da mesa de encantamento: letra vira runa, acento cai, o resto fica', () => {
    expect(paraGalatico('Acordos')).toBe('ᔑᓵ𝙹∷↸𝙹ᓭ');
    expect(paraGalatico('Analítico 2')).toBe('ᔑリᔑꖎ╎ℸ̣╎ᓵ𝙹 2');
    expect(letrasComRuna(ENCANTO)).toHaveLength(11);
  });

  it('com força baixa a Poção de Dano pega menos valores', () => {
    document.body.innerHTML = `<div id="t">${[1, 2, 3, 4, 5, 6].map(i => `<b data-alvo-feitico="valor">R$ ${i},00</b>`).join('')}</div>`;
    const raiz = document.getElementById('t')!;
    const l = lancar('dano', alvosPorAtributo(() => raiz, () => raiz), semente(4), 0.35);
    expect(l.atingidos.length).toBe(3);
    l.desfazer();
  });

  it('Visão Noturna e Encantamento juntos: um acabar não apaga o outro', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="t" style="filter: blur(0px)"><span data-alvo-feitico="aba">Metas</span></div>';
    const raiz = document.getElementById('t')!;
    const alvos = alvosPorAtributo(() => raiz, () => raiz);
    const visao = lancar('visao', alvos, semente(1), 1, 'negativo');
    const enc = lancar('encantamento', alvos);
    expect(raiz.style.filter).toContain('url(#bx-distorcao)');
    expect(raiz.style.filter).toContain(FILTRO_NEGATIVO);
    enc.desfazer();
    expect(raiz.style.filter).toContain(FILTRO_NEGATIVO);
    expect(raiz.style.filter).not.toContain('url(#bx-distorcao)');
    visao.desfazer();
    expect(raiz.style.filter).toBe('blur(0px)');
    expect(document.getElementById('bx-distorcao')).toBeNull();
  });
});

describe('a letra do Minecraft (a da conquista)', () => {
  it('toda letra tem 8 linhas da mesma largura, com o acento composto nas minúsculas', () => {
    for (const ch of 'Desafio concluído! Quem Mandou Jogar Poção? áãâéêíóôõúçÁ0123456789') {
      const g = glifoMC(ch);
      expect(g, ch).toHaveLength(8);
      for (const l of g) expect(l.length, ch).toBe(g[0].length);
    }
    // O til do ã fica nas linhas de cima, o corpo é o do a.
    expect(glifoMC('ã').slice(2)).toEqual(glifoMC('a').slice(2));
    expect(glifoMC('ã')[0]).toContain('#');
    // A cedilha vai na perna.
    expect(glifoMC('ç')[7]).toContain('#');
  });

  it('a largura soma as letras e 1 pixel entre elas', () => {
    expect(larguraTextoMC('A')).toBe(5);
    expect(larguraTextoMC('Ai')).toBe(5 + 1 + 1);
    expect(larguraTextoMC('')).toBe(0);
  });
});
