/**
 * acumulador-uso.test.ts
 *
 * Cada teste aqui trava um jeito de o painel mostrar número plausível e falso.
 * Relógio injetado — nada depende de tempo real nem de `setTimeout`.
 */
import { describe, it, expect } from 'vitest';
import { AcumuladorUso, MINIMO_PARA_CONTAR_MS } from '../acumulador-uso';

/** Relógio de mentira: `avancar(ms)` move o tempo. */
function relogio(inicio = 1_000_000) {
  let t = inicio;
  return { agora: () => t, avancar: (ms: number) => { t += ms; } };
}

describe('contagem básica', () => {
  it('credita o tempo em foco à tela em foco', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(10_000);
    a.pausar();

    expect(a.descarregar()).toEqual({ tela: 'lider', segundos: 10, abertura: true });
  });

  it('a abertura acompanha o PRIMEIRO envio, e só ele', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(5_000); a.pausar();
    expect(a.descarregar()?.abertura).toBe(true);

    a.retomar();
    r.avancar(5_000); a.pausar();
    expect(a.descarregar()?.abertura).toBe(false);
  });

  it('arredonda para baixo — segundo que não passou não conta', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);
    a.trocarTela('lider');
    r.avancar(9_999); a.pausar();
    expect(a.descarregar()?.segundos).toBe(9);
  });
});

describe('só conta em foco', () => {
  /**
   * O ponto do arquivo: sem isto, quem deixa a planilha aberta o dia inteiro
   * lidera qualquer ranking sem ter usado nada.
   */
  it('tempo pausado não entra', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(3_000);
    a.pausar();
    r.avancar(600_000);      // dez minutos com a aba escondida
    a.retomar();
    r.avancar(2_000);
    a.pausar();

    expect(a.descarregar()?.segundos).toBe(5);
  });

  /**
   * Minimizar a janela dispara `blur` E `visibilitychange`. Sem idempotência o
   * mesmo intervalo entraria duas vezes, e o relatório mostraria o dobro.
   */
  it('pausar duas vezes não soma o intervalo em dobro', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(4_000);
    a.pausar();
    a.pausar();

    expect(a.descarregar()?.segundos).toBe(4);
  });

  it('retomar duas vezes não reinicia a janela em curso', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(3_000);
    a.retomar();             // já estava contando
    r.avancar(3_000);
    a.pausar();

    expect(a.descarregar()?.segundos).toBe(6);
  });

  it('retomar sem tela não começa a contar', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);
    a.retomar();
    expect(a.contando).toBe(false);
  });
});

describe('mínimo para contar', () => {
  it('passagem rápida não sobe nada', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('acordos/detalhe');
    r.avancar(400);          // redirecionamento
    a.pausar();

    expect(a.descarregar()).toBeNull();
  });

  /**
   * Abaixo do mínimo o acumulado FICA. Quem entra 1s, troca de aba do navegador
   * e volta por 5s usou 6s — não zero.
   */
  it('o que ficou abaixo do mínimo soma com o trecho seguinte', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(1_000); a.pausar();
    expect(a.descarregar()).toBeNull();

    a.retomar();
    r.avancar(5_000); a.pausar();
    expect(a.descarregar()?.segundos).toBe(6);
  });

  it('o limite é o documentado', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);
    a.trocarTela('lider');
    r.avancar(MINIMO_PARA_CONTAR_MS); a.pausar();
    expect(a.descarregar()).not.toBeNull();
  });

  it('um milissegundo abaixo do limite não sobe', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);
    a.trocarTela('lider');
    r.avancar(MINIMO_PARA_CONTAR_MS - 1); a.pausar();
    expect(a.descarregar()).toBeNull();
  });
});

describe('troca de tela', () => {
  /** Sem pausar antes de trocar, o tempo da anterior iria para a nova. */
  it('o tempo da tela anterior não vaza para a nova', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(8_000);
    const envio = a.trocarTela('analitico');

    expect(envio).toEqual({ tela: 'lider', segundos: 8, abertura: true });

    r.avancar(3_000); a.pausar();
    expect(a.descarregar()).toEqual({ tela: 'analitico', segundos: 3, abertura: true });
  });

  /**
   * A rota pode reavaliar sem ter mudado (re-render, mesma URL). Reiniciar ali
   * perderia o acumulado e contaria uma abertura que não houve.
   */
  it('trocar para a MESMA tela é no-op', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(5_000);
    expect(a.trocarTela('lider')).toBeNull();
    a.pausar();

    // Os 5s continuam lá, e a abertura ainda é a primeira.
    expect(a.descarregar()).toEqual({ tela: 'lider', segundos: 5, abertura: true });
  });

  it('sub-aba é outra tela e gera envio próprio', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider:time');
    r.avancar(6_000);
    const envio = a.trocarTela('lider:desempenho');

    expect(envio?.tela).toBe('lider:time');
    expect(envio?.segundos).toBe(6);
  });

  it('tela nula (login) não conta abertura nem tempo', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela(null);
    r.avancar(30_000);
    a.pausar();

    expect(a.contando).toBe(false);
    expect(a.descarregar()).toBeNull();
  });

  it('sair para tela nula ainda envia o que a anterior acumulou', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(7_000);
    expect(a.trocarTela(null)?.tela).toBe('lider');
    expect(a.telaAtual).toBeNull();
  });

  /** Trocar de tela abaixo do mínimo descarta — a anterior não era uso. */
  it('troca rápida entre telas não gera envio', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(300);
    expect(a.trocarTela('analitico')).toBeNull();
    r.avancar(300);
    expect(a.trocarTela('acordos')).toBeNull();
  });
});

describe('descarregar não mexe no relógio', () => {
  /**
   * A batida periódica pausa, descarrega e retoma. `descarregar` sozinho não
   * pode fechar a janela em curso, senão a batida perderia o trecho aberto.
   */
  it('descarregar sem pausar credita só o que já estava fechado', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(5_000);
    a.pausar();
    a.retomar();
    r.avancar(4_000);

    // A janela de 4s está ABERTA; só os 5s fechados sobem.
    expect(a.descarregar()?.segundos).toBe(5);
    expect(a.contando).toBe(true);

    a.pausar();
    expect(a.descarregar()?.segundos).toBe(4);
  });

  it('descarregar duas vezes não duplica', () => {
    const r = relogio();
    const a = new AcumuladorUso(r.agora);

    a.trocarTela('lider');
    r.avancar(5_000); a.pausar();

    expect(a.descarregar()?.segundos).toBe(5);
    expect(a.descarregar()).toBeNull();
  });

  it('sem tela não devolve nada', () => {
    const a = new AcumuladorUso(relogio().agora);
    expect(a.descarregar()).toBeNull();
  });
});

describe('relógio que anda para trás', () => {
  /**
   * Ajuste de horário do sistema e hibernação podem devolver um `Date.now()`
   * menor que o anterior. Sem o piso, o intervalo negativo subtrairia tempo já
   * creditado.
   */
  it('intervalo negativo não subtrai o que já foi contado', () => {
    let t = 1_000_000;
    const a = new AcumuladorUso(() => t);

    a.trocarTela('lider');
    t += 10_000;
    a.pausar();
    a.retomar();
    t -= 60_000;             // relógio voltou
    a.pausar();

    expect(a.descarregar()?.segundos).toBe(10);
  });
});
