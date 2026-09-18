/**
 * indicacoes.ts — transformar o que a pessoa colou em contatos e linhas gravaveis.
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
 * ## Um contato, vários telefones
 *
 * A gestora de uma escola não aponta um contato só — aponta cinco. Quem
 * preenche a planilha escreve a primeira linha completa (instituição, gestora,
 * telefone) e os outros números embaixo, sem repetir a escola. Cada telefone é
 * UMA indicação e um ponto no ranking; escola e gestora dizem de onde vieram.
 *
 * A planilha manda isso de dois jeitos, e os dois valem:
 *   - vários números na MESMA célula (Alt+Enter no Excel). O Excel copia essa
 *     célula entre aspas, com a quebra de linha dentro — partir o texto em
 *     `\n` sem olhar as aspas fazia de cada número uma escola nova;
 *   - linhas de baixo com a instituição em branco (célula mesclada, ou só o
 *     número). Célula vazia vale o que está acima, que é como a pessoa lê a
 *     própria planilha.
 *
 * ## A ordem das colunas é fixa, e a tela avisa qual é
 *
 * `instituição · gestora · telefone · data`. Adivinhar por conteúdo (isto
 * parece telefone, aquilo parece data) erraria em «Colégio 24 de Maio» e em
 * gestora chamada «Fátima 2». Ordem fixa é chata e é previsível — e a tela
 * mostra o cabeçalho junto do campo, então ninguém precisa lembrar.
 *
 * A única leitura por conteúdo é a da linha que só tem números: nela TODA
 * célula preenchida é dígito e pontuação de telefone, com oito dígitos ou
 * mais. Nenhum nome de escola passa nesse filtro.
 *
 * ## A data aceita os dois formatos que existem por aqui
 *
 * `dd/mm/aaaa` é o que sai da planilha em pt-BR; `aaaa-mm-dd` é o que sai de
 * export. Sem data, vale hoje — que é o caso comum de quem acabou de voltar da
 * visita.
 */

/** Uma linha pronta para o banco — um telefone, uma indicação. */
export interface ItemIndicacao {
  instituicao: string;
  gestora: string | null;
  telefone: string | null;
  /** 'yyyy-MM-dd'. Vazio na colagem vira o dia de hoje. */
  data_indicacao: string;
  observacao: string | null;
}

/** Um contato da grade: de onde veio (escola e gestora) e os números que apontou. */
export interface ContatoIndicacao {
  instituicao: string;
  gestora: string | null;
  /**
   * Cada número preenchido vira UMA indicação. `''` é o campo esperando — a
   * grade sempre mostra ao menos um.
   */
  telefones: string[];
  data_indicacao: string;
  observacao: string | null;
}

export interface ResultadoColagem {
  contatos: ContatoIndicacao[];
  /**
   * Linhas que ficaram de fora por não terem instituição nem contato acima de
   * onde herdá-la, com o número da linha colada. Aparecem na tela porque
   * «colei 12 e entraram 9» sem explicação é pior do que o erro original.
   */
  ignoradas: { linha: number; conteudo: string }[];
}

/**
 * O nome que serve de chave.
 *
 * Minúsculas, sem espaço sobrando e sem espaço duplo interno. Mesma intenção do
 * índice do banco (`LOWER(BTRIM(instituicao))`) — com o espaço duplo a mais,
 * porque «Colégio  São José» colado de planilha é comum e o banco o trataria
 * como outra escola.
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

/**
 * O número que serve de chave: só os dígitos.
 *
 * «(18) 93505-6541», «18 935056541» e «+55 18 93505-6541» são o mesmo contato.
 * Zero à esquerda (o de interurbano) e o 55 do país saem. É a MESMA regra de
 * `fn_indicacao_telefone_chave` no banco (migration 20260918130000) — se uma
 * mudar, a outra muda junto, ou a grade passa a acusar o que o banco aceita.
 */
export function chaveDoTelefone(telefone: string | null | undefined): string | null {
  let d = String(telefone ?? '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (/^55[0-9]{10,11}$/.test(d)) d = d.slice(2);
  return d === '' ? null : d;
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

function limpo(valor: string | null | undefined): string | null {
  const s = String(valor ?? '').trim();
  return s === '' ? null : s;
}

/** Célula com Alt+Enter no nome da escola ou da gestora vira uma linha só. */
function umaLinha(valor: string | undefined): string {
  return String(valor ?? '').replace(/\s*\n\s*/g, ' ').trim();
}

/** Só dígitos e pontuação de telefone, com oito dígitos ou mais — e não uma data. */
function pareceTelefone(texto: string): boolean {
  const s = texto.trim();
  if (!/^[0-9\s()+./,;-]+$/.test(s)) return false;
  if (dataDoTexto(s) !== null) return false;
  return s.replace(/[^0-9]/g, '').length >= 8;
}

/**
 * Os números de uma célula.
 *
 * Quebra de linha sempre separa — é o Alt+Enter do Excel. Barra, vírgula e
 * ponto e vírgula só separam quando TODOS os pedaços têm cara de telefone:
 * «(18) 3505-6541 / ramal 2» é um número com anotação, não dois contatos.
 */
export function telefonesDaCelula(celula: string | null | undefined): string[] {
  const numeros: string[] = [];
  for (const linha of String(celula ?? '').split(/\r?\n/)) {
    const s = linha.trim();
    if (s === '') continue;
    const pedacos = s.split(/[/,;]/).map(p => p.trim()).filter(p => p !== '');
    if (pedacos.length > 1 && pedacos.every(pareceTelefone)) numeros.push(...pedacos);
    else numeros.push(s);
  }
  return numeros;
}

/** Uma linha da planilha, já em campos. `linha` é a física onde ela começa. */
interface Registro {
  campos: string[];
  linha: number;
  bruto: string;
}

/**
 * Onde fecham as aspas que abrem em `abre`, ou -1 se não forem aspas de célula.
 *
 * Só conta como célula citada a que FECHA antes de um TAB, de uma quebra ou do
 * fim — «"Tia Nena" Escola» é um nome com aspas, não uma célula do Excel.
 */
function fechaAspas(s: string, abre: number): number {
  let k = abre + 1;
  for (;;) {
    const q = s.indexOf('"', k);
    if (q === -1) return -1;
    // Aspas dobradas são aspas de verdade dentro da célula.
    if (s[q + 1] === '"') { k = q + 2; continue; }
    const depois = s[q + 1];
    return depois === undefined || depois === '\t' || depois === '\n' ? q : -1;
  }
}

/**
 * O texto em registros e campos, respeitando as aspas do Excel.
 *
 * O Excel põe entre aspas a célula que tem quebra de linha e dobra as aspas de
 * dentro. Sem isto, os cinco números de uma célula viravam cinco linhas — e a
 * primeira coluna de cada uma, uma escola que não existe.
 *
 * Linha sem TAB é do bloco de notas: parte em `;`. TAB vence quando existe
 * porque um nome de instituição pode ter `;` («Colégio Santa Rita; Unidade II»).
 */
function registros(texto: string): Registro[] {
  const s = String(texto ?? '').replace(/\r\n?/g, '\n');
  const saida: Registro[] = [];
  let i = 0;
  let linha = 1;

  while (i < s.length) {
    const inicio = i;
    const linhaDoRegistro = linha;
    const campos: string[] = [];
    let campo = '';
    let temTab = false;
    let comecoDoCampo = true;

    while (i < s.length) {
      const ch = s[i];
      if (comecoDoCampo && ch === '"') {
        const fim = fechaAspas(s, i);
        if (fim !== -1) {
          const dentro = s.slice(i + 1, fim);
          campo += dentro.replace(/""/g, '"');
          linha += dentro.split('\n').length - 1;
          i = fim + 1;
          comecoDoCampo = false;
          continue;
        }
      }
      comecoDoCampo = false;
      if (ch === '\t') {
        campos.push(campo);
        campo = '';
        temTab = true;
        comecoDoCampo = true;
        i++;
        continue;
      }
      if (ch === '\n') break;
      campo += ch;
      i++;
    }
    campos.push(campo);

    const bruto = s.slice(inicio, i);
    if (i < s.length) { i++; linha++; }
    saida.push({ campos: temTab ? campos : campos[0].split(';'), linha: linhaDoRegistro, bruto });
  }
  return saida;
}

/**
 * Mesmo contato — escola, gestora, data e observação iguais — é UM na grade,
 * com os números somados. A planilha que repete a escola em toda linha chega
 * igual à que mescla a célula.
 */
function chaveDoContato(c: ContatoIndicacao): string {
  return [
    chaveDaInstituicao(c.instituicao),
    chaveDaInstituicao(c.gestora ?? ''),
    c.data_indicacao,
    c.observacao ?? '',
  ].join(' ');
}

function juntar(contatos: ContatoIndicacao[], novo: ContatoIndicacao): ContatoIndicacao {
  const chave = chaveDoContato(novo);
  const igual = contatos.find(c => chaveDoContato(c) === chave);
  if (igual) {
    igual.telefones.push(...novo.telefones);
    return igual;
  }
  contatos.push(novo);
  return novo;
}

/**
 * O texto colado vira contatos.
 *
 * `hoje` entra por parâmetro em vez de `new Date()` lá dentro: função que lê o
 * relógio não tem teste estável, e «sem data vale hoje» é justamente o caso que
 * precisa de teste.
 */
export function parseColagem(texto: string, hoje: string): ResultadoColagem {
  const contatos: ContatoIndicacao[] = [];
  const ignoradas: ResultadoColagem['ignoradas'] = [];
  let anterior: ContatoIndicacao | null = null;

  for (const r of registros(texto)) {
    const c = r.campos.map(x => x.trim());
    const cheios = c.filter(x => x !== '');
    if (cheios.length === 0) continue;

    // Linha só de números: são mais telefones do contato de cima.
    if (cheios.every(pareceTelefone)) {
      if (anterior) anterior.telefones.push(...cheios.flatMap(telefonesDaCelula));
      else ignoradas.push({ linha: r.linha, conteudo: r.bruto.trim() });
      continue;
    }

    const instituicao = umaLinha(c[0]);
    let novo: ContatoIndicacao;

    if (instituicao === '') {
      // Célula mesclada, ou a escola escrita só na primeira linha: vale a de
      // cima. Precisa trazer gestora ou telefone — sem os dois, não há o que
      // indicar.
      const gestora = umaLinha(c[1]);
      if (!anterior || (gestora === '' && (c[2] ?? '') === '')) {
        ignoradas.push({ linha: r.linha, conteudo: r.bruto.trim() });
        continue;
      }
      novo = {
        instituicao:    anterior.instituicao,
        gestora:        gestora === '' ? anterior.gestora : gestora,
        telefones:      telefonesDaCelula(c[2]),
        data_indicacao: dataDoTexto(c[3]) ?? anterior.data_indicacao,
        observacao:     limpo(c[4]) ?? anterior.observacao,
      };
    } else {
      novo = {
        instituicao,
        gestora:        limpo(umaLinha(c[1])),
        telefones:      telefonesDaCelula(c[2]),
        // Data ilegível não vira erro: vira hoje, e a pessoa corrige na grade
        // antes de gravar. Recusar a linha inteira por causa de «12/13/2026»
        // perderia o nome da escola, que é o que importa.
        data_indicacao: dataDoTexto(c[3]) ?? hoje,
        observacao:     limpo(c[4]),
      };
    }

    anterior = juntar(contatos, novo);
  }

  return { contatos, ignoradas };
}

/**
 * Números colados num campo de telefone: uma célula com Alt+Enter, ou uma
 * coluna inteira do Excel.
 */
export function telefonesColados(texto: string): string[] {
  return registros(texto).flatMap(r => r.campos).flatMap(telefonesDaCelula);
}

/** Um contato em branco para a grade — a tela sempre tem um esperando. */
export function contatoVazio(hoje: string): ContatoIndicacao {
  return {
    instituicao: '', gestora: null, telefones: [''],
    data_indicacao: hoje, observacao: null,
  };
}

/**
 * O que está pronto para ir ao banco: uma linha por telefone.
 *
 * Contato sem instituição some — na grade ele é só o espaço em branco que
 * espera ser preenchido, não um erro a reclamar. Contato sem número nenhum
 * vira uma linha sem telefone: a escola ainda é uma indicação.
 */
export function prontosParaGravar(contatos: readonly ContatoIndicacao[]): ItemIndicacao[] {
  const itens: ItemIndicacao[] = [];
  for (const c of contatos) {
    const instituicao = c.instituicao.trim();
    if (instituicao === '') continue;

    const base = {
      instituicao,
      gestora:        limpo(c.gestora),
      data_indicacao: c.data_indicacao,
      observacao:     limpo(c.observacao),
    };
    const telefones = c.telefones.map(t => t.trim()).filter(t => t !== '');
    if (telefones.length === 0) itens.push({ ...base, telefone: null });
    else for (const telefone of telefones) itens.push({ ...base, telefone });
  }
  return itens;
}

/**
 * Repetidas dentro da grade, para a tela marcar antes de mandar.
 *
 * A marca é `contato:telefone` (`'2:0'`), ou `contato:*` para o contato sem
 * número. Mesma regra do banco:
 *   - com número, repete quem tem o MESMO número, em qualquer escola — as duas
 *     pontas são marcadas, porque dizer só «a segunda repete» faz procurar a
 *     primeira à mão numa lista de trinta;
 *   - sem número, a indicação é a própria escola, e repete qualquer outra linha
 *     dela. Aí só a sem número é marcada: os números da escola são legítimos.
 */
export function repetidasNaGrade(contatos: readonly ContatoIndicacao[]): Set<string> {
  const marcadas = new Set<string>();
  const porTelefone = new Map<string, string>();
  const linhasDaEscola = new Map<string, number>();
  const semNumero: { escola: string; marca: string }[] = [];

  contatos.forEach((c, ci) => {
    const escola = chaveDaInstituicao(c.instituicao);
    if (escola === '') return;

    let linhas = 0;
    c.telefones.forEach((t, ti) => {
      if (t.trim() === '') return;
      linhas++;
      const marca = `${ci}:${ti}`;
      const chave = chaveDoTelefone(t);
      // «não tem» no campo de telefone: o banco o grava, mas sem dígito a
      // chave é a escola.
      if (chave === null) { semNumero.push({ escola, marca }); return; }
      const antes = porTelefone.get(chave);
      if (antes !== undefined) {
        marcadas.add(antes);
        marcadas.add(marca);
      } else {
        porTelefone.set(chave, marca);
      }
    });

    if (linhas === 0) {
      linhas = 1;
      semNumero.push({ escola, marca: `${ci}:*` });
    }
    linhasDaEscola.set(escola, (linhasDaEscola.get(escola) ?? 0) + linhas);
  });

  for (const { escola, marca } of semNumero) {
    if ((linhasDaEscola.get(escola) ?? 0) > 1) marcadas.add(marca);
  }
  return marcadas;
}

/**
 * A lista gravada em blocos de contato: os números da mesma escola e gestora
 * juntos, na ordem em que o primeiro apareceu.
 */
export function agruparPorContato<T extends { instituicao: string; gestora: string | null }>(
  itens: readonly T[],
): T[][] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDaInstituicao(item.instituicao) + ' ' + chaveDaInstituicao(item.gestora ?? '');
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(item);
    else grupos.set(chave, [item]);
  }
  return [...grupos.values()];
}
