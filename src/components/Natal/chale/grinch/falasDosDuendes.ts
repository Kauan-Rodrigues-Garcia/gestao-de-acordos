/**
 * O que os duendes falam enquanto arrumam a bagunça do Grinch (06/11/2026).
 *
 * Três duendes, cada um com o seu jeito — o do martelo é o resmungão, o da
 * vassoura é o otimista e o da prancheta é o dedo-duro, que anota tudo para o
 * Urso do iglu (lá no Analítico). As falas saem de baralhos (`criarBaralho`,
 * o mesmo do urso): nada repete até acabar o monte.
 *
 * As frases são curtas de propósito: cabem num balão de três linhas.
 */
import { criarBaralho } from '../../iglu/falas';
import type { ItemDoChale } from './roteiro';

/** Chegando e vendo o estrago. */
const CHEGADA = [
  'Ô, de novo?!',
  'Lá vamos nós outra vez…',
  'Todo santo ano a mesma coisa!',
  'Pessoal, ferramenta na mão!',
  'Que cheiro de Grinch aqui…',
  'Gente, que estrago!',
  'Chamaram os duendes? Chegamos!',
  'Ninguém mexe em nada! Deixa com a gente.',
  'Eu sabia! Vi pegada verde na neve.',
  'Olha isso… parece que passou um furacão.',
  'Turno extra de Natal, bora!',
  'Respira fundo… e mãos à obra.',
] as const;

/** Reclamando do Grinch. */
const GRINCH = [
  'Esse verdinho não tem jeito!',
  'Todo Natal ele apronta.',
  'Ele odeia o Natal, mas ama uma bagunça.',
  'Coração dele é dois números menor, certeza.',
  'Achei pelo verde na árvore. Foi ele!',
  'Quem deixou a janela sem tranca?!',
  'Ano passado ele levou até o peru!',
  'Lá do Monte Crumpit ele vê tudo…',
  'Se ele gastasse essa energia trabalhando…',
  'Ele tem um cachorro, sabia? O Max. Coitado.',
  'Bagunçou e saiu rindo. Típico.',
  'Um dia o coração dele cresce. Um dia.',
  'Disfarçado de Papai Noel, acredita?',
  'Eu vi o gorro dele lá fora!',
  'Esse aí não fecha nem acordo de paz.',
  'Grinch, a gente sabe que foi você!',
  'Quebrou a janela de novo. De novo!',
  'Nem a meia do gato escapou.',
] as const;

/** Caguetando pro Urso do iglu (o urso fica sabendo — ver `noticiaDoGrinch.ts`). */
const URSO = [
  'Vou contar tudo pro Urso!',
  'Deixa o Urso ficar sabendo disso…',
  'Vou caguetar pro Urso, ele dá um jeito.',
  'Anotado! O Urso vai ler esse relatório.',
  'Mandei recado pro iglu do Urso.',
  'O Urso lá do Analítico vai ficar bravo.',
  'Urso, se tiver ouvindo: foi o Grinch!',
  'Quando o Urso souber, o Grinch tá ferrado.',
  'O Urso disse que ia pescar o Grinch.',
  'Relatório pro Urso: janela, árvore, presentes…',
  'O Urso tem um peixe guardado pra jogar nele.',
  'Vou pedir pro Urso fazer plantão aqui.',
  'Urso pescando e o Grinch aprontando…',
] as const;

/** Trabalhando, conforme o que está arrumando. */
const TRABALHO: Record<ItemDoChale, readonly string[]> = {
  janela: ['Vidro novo, agora reforçado!', 'Essa janela já é a terceira do mês…', 'Tranca dupla nela!', 'Cuidado com os caquinhos!'],
  poltrona: ['Upa! Poltrona de pé.', 'Ainda tá balançando? Tá!', 'A manta tava no chão, credo.'],
  relogio: ['Cuco torto não canta!', 'Acertei a hora. Meia-noite em ponto!', 'Pêndulo no lugar. Tique-taque.'],
  tv: ['Fora do ar?! Uma batidinha resolve.', 'Mexe na antena aí… isso, parou!', 'Tava passando o especial de Natal!', 'Quem dá tapa em TV de tubo?!'],
  tapete: ['Desembola esse tapete…', 'Tapete esticadinho.', 'Varrendo a neve que entrou…'],
  meias: ['Cada meia no seu gancho.', 'Essa meia é do líder, cuidado!', 'Meia furada? Remendo de duende!'],
  velas: ['Vela de pé e acesa de novo.', 'Quase pegou fogo no festão!', 'Fósforo, alguém?'],
  guirlanda: ['Guirlanda reta, como manda o Natal.', 'Um laço novo e ninguém percebe.', 'Tá torta? Agora não tá.'],
  bola: ['Achei a bolinha debaixo do tapete!', 'Bola de volta no teto.', 'Ufa, não quebrou!'],
  presentes: ['Desamassa… desamassa…', 'Laço novo, papel novo!', 'Esse aqui tava escrito «Para o Urso».', 'Presente de acordo fechado, cuidado!'],
  arvore: ['Segura a árvore aí!', 'Estrela no topo de novo.', 'Árvore em pé, Natal salvo!', 'Que ninguém derrube mais!'],
};

/** Falando do Natal (e do Gestão) no meio do serviço. */
const NATAL = [
  'Cada acordo fechado, um presente na árvore.',
  'Natal é casa arrumada e acordo pago!',
  'Bora, que acordo não fecha sozinho.',
  'Papai Noel chega e isso aqui brilhando.',
  'Já fecharam acordo hoje? Isso dá sorte!',
  'Quem bate a meta ganha meia cheia.',
  'Esse chalé é o mais bonito do Gestão.',
  'Depois daqui tem chocolate quente.',
  'Nada de desanimar: é Natal!',
  'Duende trabalha, mas também canta. 🎶',
] as const;

/** Terminou. */
const FIM = [
  'Prontinho! Como se nada tivesse acontecido.',
  'Ficou melhor que antes!',
  'Missão cumprida, pessoal!',
  'Arrumado! Bom trabalho, equipe.',
  'Se ele voltar, a gente volta também.',
  'Bora, que ainda tem o chalé do vizinho.',
  'Tudo no lugar. Feliz Natal! 🎄',
  'E o Urso já tá sabendo de tudo.',
] as const;

export type MomentoDoDuende = 'chegada' | 'trabalho' | 'fim';

/** Uma rodada de falas para os três duendes: cada um puxa mais para o seu assunto. */
export function criarFalasDosDuendes(sorte: () => number = Math.random) {
  const chegada = criarBaralho(CHEGADA, sorte);
  const grinch = criarBaralho(GRINCH, sorte);
  const urso = criarBaralho(URSO, sorte);
  const natal = criarBaralho(NATAL, sorte);
  const fim = criarBaralho(FIM, sorte);
  const trabalho = Object.fromEntries(
    (Object.keys(TRABALHO) as ItemDoChale[]).map(k => [k, criarBaralho(TRABALHO[k], sorte)]),
  ) as Record<ItemDoChale, ReturnType<typeof criarBaralho<string>>>;

  return {
    /**
     * `quem`: 0 = martelo (resmungão: Grinch), 1 = vassoura (otimista: Natal),
     * 2 = prancheta (dedo-duro: Urso).
     */
    fala(quem: 0 | 1 | 2, momento: MomentoDoDuende, item?: ItemDoChale): string {
      if (momento === 'chegada') return chegada.tirar();
      if (momento === 'fim') return fim.tirar();
      const r = sorte();
      if (item && r < 0.38) return trabalho[item].tirar();
      const assunto = quem === 0 ? (r < 0.8 ? grinch : natal) : quem === 1 ? (r < 0.75 ? natal : grinch) : (r < 0.8 ? urso : grinch);
      return assunto.tirar();
    },
  };
}

/** Só para os testes. */
export const REPERTORIO_DUENDES = { CHEGADA, GRINCH, URSO, TRABALHO, NATAL, FIM };

/** Quebra a fala em linhas que cabem no balão (sem cortar palavra). */
export function quebrarFala(texto: string, porLinha = 22): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of texto.split(' ')) {
    if (!atual) atual = p;
    else if ((atual + ' ' + p).length <= porLinha) atual += ' ' + p;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  return linhas;
}
