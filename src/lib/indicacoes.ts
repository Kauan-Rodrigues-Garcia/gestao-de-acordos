/**
 * indicacoes.ts — transformar o que a pessoa colou em linhas gravaveis.
 *
 * ## Por que colar importa mais do que digitar
 *
 * «Cadastro manual: instituição, gestora, telefone, data. Vários por vez.» Quem
 * volta de uma visita volta com oito nomes, não com um — e quase sempre já os
 * tem numa planilha ou num bloco de notas. Uma tela que só aceitasse digitar
 * transformaria a tarefa em oito idas ao formulário, e o que não é barato de
 * registrar não é registrado.
 *
 * Então a entrada principal é colar. O Excel copia com TAB entre colunas; um
 * bloco de notas costuma vir com `;`. Os dois são aceitos, e a decisão de qual
 * separador vale é POR LINHA — planilha e anotação à mão se misturam na mesma
 * colagem mais vezes do que se imagina.
 *
 * ## A ordem das colunas é fixa, e a tela avisa qual é
 *
 * `instituição · gestora · telefone · data`. Adivinhar por conteúdo (isto
 * parece telefone, aquilo parece data) erraria em «Colégio 24 de Maio» e em
 * gestora chamada «Fátima 2». Ordem fixa é chata e é previsível — e a tela
 * mostra o cabeçalho junto do campo, então ninguém precisa lembrar.
 *
 * ## A data aceita os dois formatos que existem por aqui
 *
 * `dd/mm/aaaa` é o que sai da planilha em pt-BR; `aaaa-mm-dd` é o que sai de
 * export. Sem data, vale hoje — que é o caso comum de quem acabou de voltar da
 * visita.
 */

/** Uma linha pronta para o banco. */
export interface ItemIndicacao {
  instituicao: string;
  gestora: string | null;
  telefone: string | null;
  /** 'yyyy-MM-dd'. Vazio na colagem vira o dia de hoje. */
  data_indicacao: string;
  observacao: string | null;
}

export interface ResultadoColagem {
  itens: ItemIndicacao[];
  /**
   * Linhas ignoradas por não terem instituição, com o número da linha colada.
   * Aparecem na tela porque «colei 12 e entraram 9» sem explicação é pior do
   * que o erro original.
   */
  ignoradas: { linha: number; conteudo: string }[];
  /**
   * Instituições repetidas DENTRO da própria colagem, já normalizadas.
   *
   * O banco também recusa, mas avisar antes evita a ida e volta — e aqui dá
   * para mostrar as duas linhas que colidiram.
   */
  repetidasNaColagem: string[];
}

/**
 * O nome que serve de chave.
 *
 * Minúsculas, sem espaço sobrando e sem espaço duplo interno. Mesma intenção do
 * índice único do banco (`LOWER(BTRIM(instituicao))`) — com o espaço duplo a
 * mais, porque «Colégio  São José» colado de planilha é comum e o banco o
 * trataria como outra escola.
 *
 * ⚠️ Isto é MAIS estrito que o índice: o cliente pode acusar repetição que o
 * banco aceitaria. É o lado seguro de errar — o aviso é «confira», não uma
 * recusa.
 */
export function chaveDaInstituicao(nome: string): string {
  return String(nome ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** `dd/mm/aaaa` ou `aaaa-mm-dd` → `aaaa-mm-dd`. Qualquer outra coisa é null. */
export function dataDoTexto(texto: string | null | undefined): string | null {
  const s = String(texto ?? '').trim();
  if (s === '') return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return ehDataReal(+iso[1], +iso[2], +iso[3]) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;

  const br = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(s);
  if (br) {
    const dia = +br[1];
    const mes = +br[2];
    // «24» vira 2024, não 0024. Ano de dois dígitos aparece em planilha velha.
    const ano = br[3].length === 2 ? 2000 + +br[3] : +br[3];
    if (!ehDataReal(ano, mes, dia)) return null;
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return null;
}

/** 31/02 não existe, e `new Date` a aceitaria virando 03/03. */
function ehDataReal(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimoDia;
}

function limpo(valor: string | undefined): string | null {
  const s = String(valor ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Quebra uma linha em campos.
 *
 * TAB vence quando existe: é o separador do Excel, e um nome de instituição
 * pode legitimamente conter `;` («Colégio Santa Rita; Unidade II»). Onde não há
 * TAB, `;` é o que sobra.
 */
function campos(linha: string): string[] {
  return (linha.includes('\t') ? linha.split('\t') : linha.split(';')).map(c => c.trim());
}

/**
 * O texto colado vira itens.
 *
 * `hoje` entra por parâmetro em vez de `new Date()` lá dentro: função que lê o
 * relógio não tem teste estável, e «sem data vale hoje» é justamente o caso que
 * precisa de teste.
 */
export function parseColagem(texto: string, hoje: string): ResultadoColagem {
  const itens: ItemIndicacao[] = [];
  const ignoradas: ResultadoColagem['ignoradas'] = [];
  const vistas = new Map<string, number>();
  const repetidas = new Set<string>();

  const linhas = String(texto ?? '').split(/\r?\n/);

  linhas.forEach((bruta, i) => {
    if (bruta.trim() === '') return;

    const c = campos(bruta);
    const instituicao = (c[0] ?? '').trim();

    if (instituicao === '') {
      ignoradas.push({ linha: i + 1, conteudo: bruta.trim() });
      return;
    }

    const chave = chaveDaInstituicao(instituicao);
    if (vistas.has(chave)) repetidas.add(instituicao);
    else vistas.set(chave, i + 1);

    itens.push({
      instituicao,
      gestora:        limpo(c[1]),
      telefone:       limpo(c[2]),
      // Data ilegível não vira erro: vira hoje, e a pessoa corrige na grade
      // antes de gravar. Recusar a linha inteira por causa de «12/13/2026`
      // perderia o nome da escola, que é o que importa.
      data_indicacao: dataDoTexto(c[3]) ?? hoje,
      observacao:     limpo(c[4]),
    });
  });

  return { itens, ignoradas, repetidasNaColagem: [...repetidas] };
}

/** Uma linha em branco para a grade — a tela sempre tem uma esperando. */
export function itemVazio(hoje: string): ItemIndicacao {
  return {
    instituicao: '', gestora: null, telefone: null,
    data_indicacao: hoje, observacao: null,
  };
}

/**
 * O que está pronto para ir ao banco.
 *
 * Linha sem instituição some — na grade ela é só o espaço em branco que espera
 * ser preenchido, não um erro a reclamar.
 */
export function prontosParaGravar(itens: readonly ItemIndicacao[]): ItemIndicacao[] {
  return itens
    .filter(i => i.instituicao.trim() !== '')
    .map(i => ({ ...i, instituicao: i.instituicao.trim() }));
}

/** Repetidas dentro da grade, para a tela marcar antes de mandar. */
export function repetidasNaGrade(itens: readonly ItemIndicacao[]): Set<number> {
  const vistas = new Map<string, number>();
  const marcadas = new Set<number>();

  itens.forEach((item, i) => {
    const nome = item.instituicao.trim();
    if (nome === '') return;
    const chave = chaveDaInstituicao(nome);
    const antes = vistas.get(chave);
    if (antes !== undefined) {
      // As DUAS são marcadas: dizer só «a segunda repete» faz procurar a
      // primeira à mão numa lista de trinta.
      marcadas.add(antes);
      marcadas.add(i);
    } else {
      vistas.set(chave, i);
    }
  });

  return marcadas;
}
