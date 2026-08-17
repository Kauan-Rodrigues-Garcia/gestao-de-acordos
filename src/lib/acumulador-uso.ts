/**
 * acumulador-uso.ts — a contabilidade do tempo de tela, sem React.
 *
 * ## Por que é um módulo à parte
 *
 * Está aqui a única lógica do monitoramento que produz NÚMERO: quantos segundos
 * creditar, a qual tela, e quando contar uma abertura. Errar isso não dá erro em
 * lugar nenhum — dá um painel gerencial com números plausíveis e falsos, que é o
 * pior resultado possível para uma tela feita para decidir sobre pessoas.
 *
 * Dentro do provider, essa lógica só seria exercitável montando a aplicação e
 * simulando eventos de janela. Aqui é entra-dado-sai-número, com o relógio
 * injetado.
 *
 * ## As regras
 *
 * 1. **Só conta tempo em foco.** Quem chama diz quando pausar e retomar; o
 *    acumulador não conhece `document`. Aba em segundo plano não conta — sem
 *    isso, quem deixa a planilha aberta o dia todo lidera qualquer ranking.
 * 2. **Pausar e retomar são idempotentes.** `blur` e `visibilitychange` chegam
 *    juntos ao minimizar a janela; sem isso o intervalo seria somado duas vezes.
 * 3. **Abaixo do mínimo nada sobe, e nada se perde.** Passagem rápida por uma
 *    tela não é uso. Mas o acumulado FICA guardado: quem entra 1s, sai da aba e
 *    volta por mais 5s tem os 6s creditados, não zerados.
 * 4. **A abertura acompanha o primeiro envio da tela.** Se a tela nunca alcançar
 *    o mínimo, nenhuma abertura é contada — nem os segundos.
 */

/** O que subir para `fn_uso_registrar`. */
export interface EnvioUso {
  tela: string;
  segundos: number;
  abertura: boolean;
}

/** Abaixo disto não é uso: é redirecionamento ou clique errado. */
export const MINIMO_PARA_CONTAR_MS = 2_000;

export class AcumuladorUso {
  private tela: string | null = null;
  private acumuladoMs = 0;
  /** Instante em que a janela atual começou. `null` = pausado. */
  private desde: number | null = null;
  private aberturaPendente = false;

  /** Relógio injetável — os testes não dependem de tempo real. */
  constructor(private readonly agora: () => number = () => Date.now()) {}

  get telaAtual(): string | null {
    return this.tela;
  }

  /** Está contando agora? Usado nos testes e para depuração. */
  get contando(): boolean {
    return this.desde !== null;
  }

  /** Fecha a janela aberta e soma ao acumulado. Chamar duas vezes não dobra. */
  pausar(): void {
    if (this.desde === null) return;
    this.acumuladoMs += Math.max(0, this.agora() - this.desde);
    this.desde = null;
  }

  /** Abre uma janela. Chamar duas vezes não reinicia a contagem em curso. */
  retomar(): void {
    if (this.desde !== null) return;
    if (this.tela === null) return;   // sem tela não há o que contar
    this.desde = this.agora();
  }

  /**
   * O que subir da tela ATUAL, zerando o que subiu.
   *
   * Devolve `null` quando ainda não há o que contar — e nesse caso o acumulado
   * permanece, para somar com o próximo trecho em vez de ser descartado.
   *
   * Não pausa nem retoma: quem chama decide. Chamar sem pausar credita só o que
   * já estava fechado, o que é o comportamento certo para a batida periódica
   * quando ela pausa e retoma em volta.
   */
  descarregar(): EnvioUso | null {
    if (this.tela === null) return null;
    if (this.acumuladoMs < MINIMO_PARA_CONTAR_MS) return null;

    const envio: EnvioUso = {
      tela: this.tela,
      // Arredonda para baixo: creditar segundo que não passou infla o ranking.
      segundos: Math.floor(this.acumuladoMs / 1000),
      abertura: this.aberturaPendente,
    };
    this.acumuladoMs = 0;
    this.aberturaPendente = false;
    return envio;
  }

  /**
   * Troca a tela em foco, devolvendo o que subir da anterior.
   *
   * Pausa antes de trocar: sem isso o tempo da tela anterior seria creditado à
   * nova. Trocar para a mesma tela é no-op — a rota pode reavaliar sem ter
   * mudado, e reiniciar ali perderia o acumulado e contaria uma abertura falsa.
   */
  trocarTela(nova: string | null): EnvioUso | null {
    if (nova === this.tela) return null;

    this.pausar();
    const pendente = this.descarregar();

    this.tela = nova;
    this.acumuladoMs = 0;
    // Tela nula (login, rota não medida) não gera abertura.
    this.aberturaPendente = nova !== null;
    if (nova !== null) this.retomar();

    return pendente;
  }
}
