/**
 * O jogo da máquina de fliperama.
 *
 * Física de jogo é onde bug se esconde: a bola atravessa o tijolo num quadro
 * lento, a raquete devolve sempre no mesmo ângulo e a partida vira infinita, a
 * vitória cai antes de o último bloco quebrar. Nada disso dá para ver olhando a
 * tela — mas tudo dá para provar chamando `avancar` com os números certos.
 */
import { describe, it, expect } from 'vitest';
import {
  ALTURA, ALTURA_RAQUETE, ANGULO_MIN, COLUNAS, DT_MAX, LARGURA, LARGURA_RAQUETE,
  LINHAS, RAIO_BOLA, VELOCIDADE_MAX, VIDAS_INICIAIS, Y_RAQUETE,
  avancar, devolverDaRaquete, eixoDoImpacto, montarTijolos, novoJogo,
  pontosDaLinha, tijolosVivos, velocidadeAtual,
  type EstadoJogo,
} from '../fliperama';

/** Um quadro de 60 fps. */
const QUADRO = 1 / 60;

/** Partida já em andamento, com a bola onde o teste precisar. */
function jogando(sobrepor: Partial<EstadoJogo> = {}): EstadoJogo {
  return { ...novoJogo(0), fase: 'jogando', ...sobrepor };
}

describe('montagem', () => {
  it('o campo começa cheio', () => {
    const t = montarTijolos();
    expect(t).toHaveLength(COLUNAS * LINHAS);
    expect(tijolosVivos(t)).toBe(COLUNAS * LINHAS);
  });

  it('nenhum tijolo escapa do campo', () => {
    for (const t of montarTijolos()) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x + t.l).toBeLessThanOrEqual(LARGURA);
    }
  });

  it('a linha de cima vale mais que a de baixo', () => {
    expect(pontosDaLinha(0)).toBeGreaterThan(pontosDaLinha(LINHAS - 1));
    expect(pontosDaLinha(LINHAS - 1)).toBeGreaterThan(0);
  });

  it('o jogo novo tem as três vidas e a bola parada', () => {
    const j = novoJogo();
    expect(j.fase).toBe('pronto');
    expect(j.vidas).toBe(VIDAS_INICIAIS);
    expect(j.bola.vx).toBe(0);
    expect(j.bola.vy).toBe(0);
  });
});

describe('antes do saque', () => {
  it('a raquete anda com o jogo parado, e a bola acompanha', () => {
    const j = avancar(novoJogo(), QUADRO, { alvoRaquete: 80 });
    expect(j.raqueteX).toBe(80);
    expect(j.bola.x).toBe(80);
    expect(j.fase).toBe('pronto');
  });

  it('a raquete não sai pela parede', () => {
    const esquerda = avancar(novoJogo(), QUADRO, { alvoRaquete: -500 });
    const direita  = avancar(novoJogo(), QUADRO, { alvoRaquete: 9999 });
    expect(esquerda.raqueteX).toBe(LARGURA_RAQUETE / 2);
    expect(direita.raqueteX).toBe(LARGURA - LARGURA_RAQUETE / 2);
  });

  it('acionar saca a bola para CIMA', () => {
    const j = avancar(novoJogo(), QUADRO, { acionar: true });
    expect(j.fase).toBe('jogando');
    expect(j.bola.vy).toBeLessThan(0);
    expect(j.bola.vx).not.toBe(0);
  });
});

describe('paredes', () => {
  it('a lateral inverte e devolve a bola para dentro', () => {
    const j = avancar(jogando({ bola: { x: RAIO_BOLA + 1, y: 100, vx: -120, vy: 0 } }), QUADRO);
    expect(j.bola.vx).toBeGreaterThan(0);
    expect(j.bola.x).toBeGreaterThanOrEqual(RAIO_BOLA);
  });

  it('o teto inverte para baixo', () => {
    const j = avancar(jogando({ bola: { x: 120, y: RAIO_BOLA, vx: 0, vy: -120 } }), QUADRO);
    expect(j.bola.vy).toBeGreaterThan(0);
  });

  /**
   * O caso que a versão ingênua erra: uma bola parada DENTRO da parede
   * inverteria o sinal a cada quadro e ficaria tremendo lá dentro para sempre.
   * Reposicionar junto com inverter é o que resolve.
   */
  it('bola encravada na parede sai de lá em um quadro', () => {
    let j = jogando({ bola: { x: -10, y: 100, vx: -100, vy: 0 } });
    j = avancar(j, QUADRO);
    expect(j.bola.x).toBeGreaterThanOrEqual(RAIO_BOLA);
    j = avancar(j, QUADRO);
    expect(j.bola.x).toBeGreaterThan(RAIO_BOLA);
  });
});

describe('tijolos', () => {
  it('bater quebra um tijolo e pontua', () => {
    const base = novoJogo();
    const alvo = base.tijolos[0];
    const j = avancar(
      jogando({ bola: { x: alvo.x + alvo.l / 2, y: alvo.y + alvo.a + RAIO_BOLA - 1, vx: 0, vy: -100 } }),
      QUADRO,
    );
    expect(tijolosVivos(j.tijolos)).toBe(COLUNAS * LINHAS - 1);
    expect(j.pontos).toBe(pontosDaLinha(alvo.linha));
    expect(j.bola.vy).toBeGreaterThan(0);
  });

  /**
   * Dois tijolos encostados no mesmo quadro inverteriam o MESMO eixo duas
   * vezes, e a bola sairia seguindo em frente como se nada tivesse acontecido.
   */
  it('no máximo um tijolo por quadro', () => {
    const base = novoJogo();
    // Ponto em que dois tijolos vizinhos se encostam.
    const a = base.tijolos[0];
    const x = a.x + a.l + 1;
    const j = avancar(
      jogando({ bola: { x, y: a.y + a.a / 2, vx: 0, vy: -60 } }),
      QUADRO,
    );
    expect(tijolosVivos(j.tijolos)).toBe(COLUNAS * LINHAS - 1);
  });

  it('raspão na lateral inverte o eixo X, não o Y', () => {
    const t = { x: 100, y: 100, l: 26, a: 12, linha: 0, vivo: true };
    const raspando = { x: 100 - RAIO_BOLA + 1, y: 106, vx: 90, vy: 10 };
    expect(eixoDoImpacto(raspando, t)).toBe('x');
  });

  it('batida por baixo inverte o eixo Y', () => {
    const t = { x: 100, y: 100, l: 26, a: 12, linha: 0, vivo: true };
    const porBaixo = { x: 113, y: 112 + RAIO_BOLA - 1, vx: 0, vy: -90 };
    expect(eixoDoImpacto(porBaixo, t)).toBe('y');
  });

  it('limpar o campo é vitória, e vira recorde', () => {
    const base = novoJogo();
    const alvo = base.tijolos[7];
    const so_um = base.tijolos.map(t => (t === alvo ? t : { ...t, vivo: false }));

    const j = avancar(
      jogando({
        tijolos: so_um,
        pontos: 500,
        bola: { x: alvo.x + alvo.l / 2, y: alvo.y + alvo.a + RAIO_BOLA - 1, vx: 0, vy: -100 },
      }),
      QUADRO,
    );
    expect(j.fase).toBe('venceu');
    expect(j.recorde).toBe(500 + pontosDaLinha(alvo.linha));
  });
});

describe('raquete', () => {
  it('perto do meio a bola sobe quase reta', () => {
    const { vx, vy } = devolverDaRaquete(120, 120, 100);
    expect(Math.abs(vx)).toBeLessThan(Math.abs(vy) / 3);
    expect(vy).toBeLessThan(0);
  });

  /**
   * O empate que a simulação de partida inteira encontrou: raquete exatamente
   * sob a bola devolve na vertical, a bola sobe e desce na mesma coluna, limpa
   * aquela coluna e nunca mais toca em nada. A partida fica sem fim.
   *
   * Quem joga com o mouse acompanhando a bola cai nisso sem querer, então não
   * é caso de laboratório.
   */
  it('a devolução nunca é perfeitamente vertical', () => {
    for (const v of [-30, 0, 30]) {
      const { vx } = devolverDaRaquete(120, 120, 100, v);
      expect(Math.abs(vx)).toBeGreaterThan(0);
      expect(Math.abs(vx)).toBeGreaterThanOrEqual(Math.sin(ANGULO_MIN) * 100 - 1e-9);
    }
  });

  it('no centro exato, a bola segue para o lado em que já ia', () => {
    expect(devolverDaRaquete(120, 120, 100, -50).vx).toBeLessThan(0);
    expect(devolverDaRaquete(120, 120, 100,  50).vx).toBeGreaterThan(0);
  });

  it('na ponta a bola sai deitada, e para o lado da batida', () => {
    const direita  = devolverDaRaquete(120 + LARGURA_RAQUETE / 2, 120, 100);
    const esquerda = devolverDaRaquete(120 - LARGURA_RAQUETE / 2, 120, 100);
    expect(direita.vx).toBeGreaterThan(0);
    expect(esquerda.vx).toBeLessThan(0);
    expect(Math.abs(direita.vx)).toBeGreaterThan(Math.abs(direita.vy));
  });

  /** Passando de 60° a bola fica rasante e a partida vira espera. */
  it('o ângulo nunca passa de 60 graus, nem batendo fora da raquete', () => {
    for (const bolaX of [0, 60, 120, 180, 240, -900, 900]) {
      const { vx, vy } = devolverDaRaquete(bolaX, 120, 100);
      const graus = Math.abs(Math.atan2(vx, -vy)) * (180 / Math.PI);
      expect(graus).toBeLessThanOrEqual(60.0001);
      expect(vy).toBeLessThan(0);          // sempre para cima
    }
  });

  it('a devolução preserva a velocidade escalar', () => {
    const { vx, vy } = devolverDaRaquete(140, 120, 137);
    expect(Math.hypot(vx, vy)).toBeCloseTo(137, 5);
  });

  it('rebater acelera a bola, até o teto', () => {
    expect(velocidadeAtual(0)).toBeLessThan(velocidadeAtual(5));
    expect(velocidadeAtual(10_000)).toBe(VELOCIDADE_MAX);
  });

  it('a bola subindo NÃO é rebatida pela raquete', () => {
    const j = avancar(
      jogando({ raqueteX: 120, bola: { x: 120, y: Y_RAQUETE + 1, vx: 0, vy: -100 } }),
      QUADRO,
    );
    expect(j.rebatidas).toBe(0);
  });

  it('a bola descendo em cima da raquete volta para cima', () => {
    const j = avancar(
      jogando({ raqueteX: 120, bola: { x: 120, y: Y_RAQUETE - RAIO_BOLA, vx: 0, vy: 100 } }),
      QUADRO,
    );
    expect(j.rebatidas).toBe(1);
    expect(j.bola.vy).toBeLessThan(0);
    expect(j.bola.y).toBeLessThan(Y_RAQUETE);
  });
});

describe('vidas', () => {
  it('cair tira uma vida e volta para o saque, com a velocidade zerada', () => {
    const j = avancar(
      jogando({ rebatidas: 20, bola: { x: 120, y: ALTURA + 20, vx: 30, vy: 100 } }),
      QUADRO,
    );
    expect(j.vidas).toBe(VIDAS_INICIAIS - 1);
    expect(j.fase).toBe('pronto');
    expect(j.rebatidas).toBe(0);
    expect(j.bola.vx).toBe(0);
  });

  it('cair na última vida acaba o jogo e guarda o recorde', () => {
    const j = avancar(
      jogando({ vidas: 1, pontos: 320, bola: { x: 120, y: ALTURA + 20, vx: 0, vy: 100 } }),
      QUADRO,
    );
    expect(j.fase).toBe('fim');
    expect(j.vidas).toBe(0);
    expect(j.recorde).toBe(320);
  });

  it('acionar depois do fim recomeça, e o recorde sobrevive', () => {
    const acabado = avancar(
      jogando({ vidas: 1, pontos: 320, bola: { x: 120, y: ALTURA + 20, vx: 0, vy: 100 } }),
      QUADRO,
    );
    const novo = avancar(acabado, QUADRO, { acionar: true });
    expect(novo.fase).toBe('pronto');
    expect(novo.pontos).toBe(0);
    expect(novo.vidas).toBe(VIDAS_INICIAIS);
    expect(novo.recorde).toBe(320);
    expect(tijolosVivos(novo.tijolos)).toBe(COLUNAS * LINHAS);
  });

  it('sem acionar, o fim de jogo fica parado', () => {
    const acabado = jogando({ fase: 'fim', vidas: 0 });
    const depois = avancar(acabado, QUADRO);
    expect(depois.fase).toBe('fim');
  });
});

describe('passo de integração', () => {
  /**
   * Uma aba que ficou 4 segundos em segundo plano volta com `dt = 4`. Sem
   * teto, a bola andaria centenas de pixels de uma vez e atravessaria parede,
   * tijolo e chão sem tocar em nada.
   */
  it('um quadro gigantesco não teleporta a bola', () => {
    const antes = jogando({ bola: { x: 120, y: 160, vx: 0, vy: -VELOCIDADE_MAX } });
    const depois = avancar(antes, 4, {});
    const andou = Math.abs(depois.bola.y - antes.bola.y);
    expect(andou).toBeLessThanOrEqual(VELOCIDADE_MAX * DT_MAX + 0.001);
  });

  it('dt negativo não faz a bola andar para trás', () => {
    const antes = jogando({ bola: { x: 120, y: 160, vx: 50, vy: -50 } });
    const depois = avancar(antes, -5, {});
    expect(depois.bola.x).toBe(antes.bola.x);
    expect(depois.bola.y).toBe(antes.bola.y);
  });
});

describe('uma partida inteira', () => {
  /**
   * O teste que só a pureza permite: 30 segundos de jogo em milissegundos, sem
   * canvas, sem relógio e sem tela. A raquete segue a bola, então a partida
   * termina em vitória — e o que se prova é que ela TERMINA, em vez de travar
   * num estado de onde nada mais sai.
   */
  it('com a raquete perseguindo a bola, o campo é limpo e o jogo acaba', () => {
    let j = avancar(novoJogo(), QUADRO, { acionar: true });

    for (let i = 0; i < 60 * 120; i++) {
      j = avancar(j, QUADRO, {
        alvoRaquete: j.bola.x,
        acionar: j.fase === 'pronto',
      });
      if (j.fase === 'venceu' || j.fase === 'fim') break;
    }

    expect(j.fase).toBe('venceu');
    expect(tijolosVivos(j.tijolos)).toBe(0);
    expect(j.pontos).toBeGreaterThan(0);
  });

  it('a bola nunca escapa do campo pelos lados', () => {
    let j = avancar(novoJogo(), QUADRO, { acionar: true });
    for (let i = 0; i < 60 * 60; i++) {
      j = avancar(j, QUADRO, { alvoRaquete: j.bola.x, acionar: j.fase === 'pronto' });
      expect(j.bola.x).toBeGreaterThanOrEqual(-1);
      expect(j.bola.x).toBeLessThanOrEqual(LARGURA + 1);
      expect(j.bola.y).toBeGreaterThanOrEqual(-1);
      if (j.fase === 'venceu' || j.fase === 'fim') break;
    }
  });
});

describe('constantes coerentes', () => {
  it('a raquete cabe no campo e fica acima do chão', () => {
    expect(LARGURA_RAQUETE).toBeLessThan(LARGURA);
    expect(Y_RAQUETE + ALTURA_RAQUETE).toBeLessThan(ALTURA);
  });
});
