/**
 * O que o urso do iglu fala (Cleber, 05/11/2026: «diversas opções de falas,
 * aleatórias, como se ele tivesse falando mesmo com a pessoa, sem repetir as
 * frases por rodada que ele aparecer, só se acabar todas as opções»).
 *
 * Uma CONVERSA é uma ou mais falas seguidas: o balão mostra a primeira e o
 * urso continua sozinho, como quem conta uma história (um clique adianta).
 *
 * A rodada é cada vez que ele aparece (e, com ele lá dentro, cada vez que ele
 * entra). Cada rodada embaralha os seus baralhos: nada repete até o baralho
 * acabar, e quando acaba ele embaralha de novo sem começar pela última que
 * saiu. A primeira conversa da rodada é sempre um cumprimento, da hora do dia;
 * quem clica demais ouve, de vez em quando, uma das «insistências».
 *
 * `{nome}` é o primeiro nome de quem está olhando; sem nome, essas falas ficam
 * de fora.
 */

export type Conversa = readonly string[];
export type MomentoDoUrso = 'pescando' | 'fisgou' | 'iglu' | 'trem';

const QUALQUER_HORA: Conversa[] = [
  ['Ei! Oi! Você me assustou…'],
  ['Olha só quem apareceu!', 'Senta aí, mas fala baixinho.'],
  ['Oi, {nome}! Que bom te ver por aqui.'],
  ['Ah, é você! Pensei que fosse o boneco de neve de novo.'],
  ['Opa! Chega mais, o lago é grande.'],
];

const CUMPRIMENTOS = {
  manha: [
    ['Opa, bom dia! Chegou cedo, hein?'],
    ['Bom dia, {nome}! Café já tomou?'],
    ['Ah, bom dia! Desculpa a cara, acordei agora…'],
    ['Bom dia! Peixe de manhã é o mais esperto, sabia?'],
    ['Bom dia! Dormiu bem? Eu hibernei um pouquinho.'],
  ],
  tarde: [
    ['Boa tarde! Veio me fazer companhia?'],
    ['Boa tarde, {nome}! Senta aí, mas sem barulho.'],
    ['Opa! Boa tarde. Tá corrido o dia aí?'],
    ['Boa tarde! Almoçou?', 'Eu só almoço quando o peixe deixar.'],
    ['Boa tarde! Hora boa pra pescar e pra fechar acordo.'],
  ],
  noite: [
    ['Boa noite! Ainda trabalhando a essa hora?'],
    ['Boa noite, {nome}! Pescaria noturna é outra coisa.'],
    ['Ué, boa noite! Achei que você já tinha ido embora.'],
    ['Boa noite! Olha as estrelas refletindo no gelo…'],
  ],
} satisfies Record<string, Conversa[]>;

const PESCANDO: Conversa[] = [
  ['Psiu! Assim você espanta os peixes…'],
  ['Aqui faz −30 °C e mesmo assim tem gente cobrando.'],
  ['Esse lago tá mais parado que acordo sem pagamento.'],
  ['Pescar é igual cobrança: paciência e linha firme.'],
  ['O trenzinho passa e nem buzina pra mim…'],
  ['Já bati a meta de peixes do mês! 🐟', 'Tá, era um peixe só. Mas a meta era um.'],
  ['Shhh… acho que tá mordendo!', '…não, era o vento.'],
  ['Depois daqui é chocolate quente no iglu. ☕'],
  ['Sabe o que meu avô dizia?', '«Peixe grande não morde isca pequena.»', 'Ele nunca pegou nenhum, mas falava bonito.'],
  ['Você já tentou negociar com um peixe?', 'Eu ofereço minhoca à vista e ele quer parcelar.'],
  ['Esse gorro foi presente da minha mãe.', 'Ela tricotou em julho. Urso planeja o Natal cedo.'],
  ['Sabe aquele boneco de neve do Dashboard?', 'Dizem que ele joga basquete. Eu não acredito.'],
  ['Eu tenho uma planilha de peixes.', 'Coluna A: os que eu peguei. Coluna B: os que fugiram.', 'A coluna B tá bem maior.'],
  ['Se o peixe morder, você me avisa? Às vezes eu cochilo.'],
  ['Já pensou se peixe pagasse boleto?', 'Ia ser tudo débito em água corrente. 🐟'],
  ['Frio? Que frio? Isso aqui é primavera pra mim.'],
  ['Hoje o lago tá calmo.', 'Calmo até demais…'],
  ['Uma vez eu pesquei uma bota.', 'Virou vaso. Ficou lindo no iglu.'],
  ['Você tem cara de quem fecha muito acordo.', 'Acertei?'],
  ['Meu sonho é pescar um salmão do tamanho de uma meta batida.'],
  ['Não conta pra ninguém, mas eu converso com os peixes.', 'Eles não respondem. Mas eu converso.'],
  ['Ouviu isso?', 'Era o gelo estalando. Ou a minha barriga.'],
  ['Paciência é uma virtude.', 'Peixe frito também.'],
  ['O Papai Noel passou aqui ontem.', 'Pediu um peixe emprestado pras renas. Nunca devolveu.'],
  ['Se você ficar bem quietinho, dá pra ouvir a neve caindo.'],
  ['Meta do dia: um peixe e um cochilo.', 'O cochilo eu já bati.'],
  ['Você trabalha com o quê mesmo?', 'Acordos? Eu também! Faço acordo com os peixes todo dia.'],
  ['Sabia que urso polar tem a pele preta?', 'O pelo é que é branquinho. Tô sempre de casaco.'],
  ['Isca boa é segredo de família.', 'Tá bom, é sardinha. Não espalha.'],
  ['Às vezes eu acho que é o peixe que tá me pescando.'],
  ['Depois desse peixe eu vou tirar férias.', 'Faz três invernos que eu digo isso.'],
  ['Tá vendo a luz do iglu?', 'Deixei acesa pra não tropeçar na volta.'],
  ['Eu ia te oferecer um peixe…', 'Mas ainda não tenho nenhum.'],
  ['Se o chefe perguntar, eu tô em reunião.', 'Com o lago.'],
  ['Natal é a minha época favorita.', 'Todo mundo de cachecol. Até que enfim eu tô na moda.'],
  ['Quer uma dica de pescaria?', 'Nunca, jamais, conte pro peixe que você tá pescando.'],
  ['Esse lago já viu muita coisa…', 'Mas nunca viu um peixe meu. Ainda.'],
  ['Feliz Natal, {nome}! 🎄', 'E um ano novo cheio de peixes. Pra você também, se quiser.'],
  ['Feliz Natal! 🎄', 'Que o seu ano novo tenha mais acordo pago que peixe fugido.'],
  ['Tô pensando em abrir uma peixaria.', 'Só falta… os peixes.'],
  ['Uma rena me contou que esse Natal vai ser incrível.', 'Rena exagera muito, mas eu quero acreditar.'],
  ['O segredo é a paciência.', 'E o casaco. Principalmente o casaco.'],
  ['Se aparecer um pinguim por aqui, me avisa.', 'Pinguim mora no outro polo. Se aparecer, é golpe.'],
  ['Sabe o que combina com pescaria?', 'Silêncio.', '…foi uma indireta, tá?'],
  ['Hoje eu tô com sorte, sinto no pelo.'],
  ['Eu já pesquei com o meu tio.', 'Ele pegou três peixes. Eu peguei um resfriado.'],
  ['Essa vara de pescar tem nome: Esperança.', 'Combina, né?'],
  ['Já reparou como o gelo brilha quando bate o sol?', 'Parece purpurina de Natal.'],
  ['{nome}, você acredita em Papai Noel?', 'Eu acredito. Ele me deve um peixe.'],
  ['Às vezes eu penso em trocar a pescaria pelo trenzinho.', 'Mas aí quem cuida do lago?'],
  ['O chocolate quente lá dentro já deve ter esfriado…', 'Ou congelado. Aqui tudo congela.'],
  ['Tava pensando aqui…', 'Será que o peixe também tá com frio?', 'Vou levar ele pro iglu, por educação.'],
];

/**
 * Os duendes e o «monstro do Natal» (06/11/2026, pedido do Kauan): o Urso
 * conhece os duendes do chalé de Acordos e não gosta nada do Grinch. Entram
 * no meio das conversas de pescaria.
 */
const DUENDES_E_GRINCH: Conversa[] = [
  ['Sabe os duendes lá do chalé de Acordos?', 'Gente boa. Trabalham mais que eu.', 'Tá, isso não é difícil.'],
  ['Um duende passou aqui pedindo peixe.', 'Duende come peixe? Eu não sabia.', 'Agora eu sei. Comeu três.'],
  ['Os duendes me chamam de «chefe do gelo».', 'Eu nunca pedi. Mas gostei.'],
  ['Tem um bicho verde rondando o Natal…', 'O Grinch. Peludo, mal-humorado, com um gorro roubado.'],
  ['O Grinch odeia o Natal.', 'Eu odeio quem odeia o Natal.', '…é complicado, mas faz sentido.'],
  ['Se o Grinch aparecer aqui no lago…', 'Eu jogo um peixe nele. Um gelado.'],
  ['Dizem que o coração do Grinch é dois números menor.', 'O meu é tamanho urso. Cabe todo mundo.'],
  ['O Grinch mora no Monte Crumpit, sabia?', 'Com um cachorro chamado Max.', 'O Max é legal. O Grinch, nem tanto.'],
  ['Os duendes têm uma prancheta só pra anotar o que o Grinch apronta.', 'A lista já tá do tamanho do lago.'],
  ['Uma vez o Grinch tentou levar meu iglu.', 'Iglu é pesado, né? Desistiu na primeira parede.'],
  ['Natal sem Grinch é Natal tranquilo.', 'Mas aí os duendes ficam sem assunto.'],
  ['O duende do martelo é o mais resmungão.', 'O da vassoura canta o tempo todo.', 'E o da prancheta… esse me conta tudo.'],
  ['Prometi pros duendes:', 'se o Grinch passar por aqui, eu aviso. Com um rugido.'],
  ['Você sabia que duende tem medo de urso?', 'Brincadeira. Duende não tem medo de nada.', 'Só do Grinch quando tá com fome.'],
  ['Dizem que um dia o coração do Grinch vai crescer.', 'Eu tô torcendo. De longe. Com a vara de pescar na mão.'],
  ['O Grinch disfarçado de Papai Noel…', 'Quem cai nessa? Papai Noel é gordinho e simpático.', 'Tipo eu, só que sem pelo.'],
];

/**
 * A fofoca (06/11/2026): o Grinch invadiu o chalé de Acordos há pouco
 * (`noticiaDoGrinch.ts`) e os duendes vieram contar. O Urso puxa o assunto
 * logo depois do cumprimento — uma vez por rodada.
 */
const FOFOCA_DO_GRINCH: Conversa[] = [
  ['Você soube?', 'O Grinch quebrou a janela do chalé de Acordos!', 'Os duendes vieram correndo me contar.'],
  ['Os duendes me caguetaram tudo…', 'Árvore torta, presente amassado, meia no chão.', 'Esse Grinch não aprende.'],
  ['Chegou um duende aqui todo esbaforido:', '«Urso! O Grinch atacou de novo!»', 'Já tô de olho, viu?'],
  ['Recebi o relatório do duende da prancheta.', 'Quatro páginas. Frente e verso.', 'O Grinch aprontou feio no chalé.'],
  ['Sabe o que os duendes me pediram?', 'Pra eu fazer plantão no chalé de Acordos.', 'Mas e os meus peixes?'],
  ['O Grinch bagunçou o chalé e fugiu pela janela.', 'Se ele passar por aqui, vai levar um peixe na cara.'],
  ['Os duendes já arrumaram tudo lá em Acordos.', 'Rápidos, eles. Eu ainda tava passando o café.'],
  ['Ouvi dizer que o gato do chalé fugiu de medo do Grinch.', 'Coitadinho. Aqui no iglu ele é bem-vindo.'],
];

const FISGOU: Conversa[] = [
  ['PEGUEI! PEGUEI!'],
  ['Olha o tamanho desse! 🐟', '…tá, de perto ele é menor.'],
  ['Viu isso?! Você viu, né?!', 'Fala que viu!'],
  ['Esse vai direto pro forno.', 'Brincadeira, vai pro aquário.'],
  ['Meta batida! Hoje tem janta.'],
  ['Até que enfim! Já tava criando raiz aqui.'],
  ['Ele lutou bravamente.', 'Eu lutei mais.'],
  ['Isso é o que eu chamo de acordo fechado! 🤝'],
  ['Vou mostrar pra minha mãe!'],
  ['Tchau, tchau! Vou preparar o jantar. 🍲'],
  ['Valeu pela companhia, {nome}! Você dá sorte.'],
  ['Esse peixe pagou à vista! 💸'],
  ['Viu? Paciência funciona.', 'De vez em quando.'],
];

/**
 * O trem passando pelo iglu com ele pescando (Cleber, 05/11/2026): ele dá
 * tchauzinho e fala sozinho, sem ninguém clicar — uma por passagem.
 */
const TREM: Conversa[] = [
  ['Piuí! 👋', 'Boa viagem, pessoal!'],
  ['Ei, maquinista! Buzina pra mim! 📣'],
  ['Lá vai o trenzinho! 🚂', 'Um dia eu ainda pego carona.'],
  ['Tchau, tchau! 👋', 'Manda um cartão-postal da estação!'],
  ['Olha o trem!', 'Shhh… vai espantar meus peixes. 🐟'],
  ['Quem foi sorteado hoje? 🎟️', 'Sortudos!'],
  ['Piuííí! 🎄', 'Esse trem passa mais que peixe na minha vara.'],
  ['Ô de bordo! 👋', 'Guarda um lugar pra mim na próxima!'],
  ['Devagar aí, maquinista!', 'Tem urso pescando aqui.'],
  ['Tchauzinho! 👋', 'Leva um peixe pra estação? Não? Tá bom.'],
  ['Oi, {nome}! Você tá no trem? 👀', 'Não? Ah, então tchau pro trem.'],
  ['Feliz viagem! 🎁', 'Eu fico aqui cuidando do lago.'],
];

const INSISTENCIA: Conversa[] = [
  ['Você gosta mesmo de conversar, hein?'],
  ['Tá, tá… mais uma história e depois silêncio, combinado?'],
  ['Cada clique seu é um peixe que foge.', 'Só pra você saber.'],
  ['Tô começando a achar que você veio pelo urso, não pelo Analítico.'],
  ['Ei, o trabalho não vai se fazer sozinho, viu? 😄'],
  ['Já tô ficando sem assunto…', 'Mentira. Urso nunca fica sem assunto.'],
  ['Se continuar assim, vou cobrar a hora da conversa.'],
  ['Você é sempre falante assim ou é o frio?'],
  ['{nome}, eu adoro a sua visita.', 'Mas os peixes estão reclamando.'],
];

const IGLU: Conversa[] = [
  ['Zzz… o urso está lá dentro, quentinho.'],
  ['A luz está acesa: ele está em casa.'],
  ['Dizem que ele só sai pra pescar de vez em quando…'],
  ['Toc, toc…', 'Ninguém atende. Deve estar cochilando.'],
  ['Lá de dentro vem um cheirinho de chocolate quente. ☕'],
  ['Dá pra ouvir um ronco baixinho… 💤'],
  ['Tem uma plaquinha na porta: «Volto quando o peixe morder».'],
  ['Psiu… não acorda o urso.'],
  ['O urso saiu?', 'Não… só tá enrolado no cobertor.'],
  ['Tem alguém cantarolando música de Natal lá dentro. 🎶'],
  ['A janelinha piscou.', 'Acho que ele te viu.'],
  ['Quem sabe, voltando mais tarde, você pega ele pescando…'],
  ['O tapete da porta diz «Bem-vindo».', 'Mas a porta tá trancada.'],
  ['Lá dentro, uma voz sonolenta: «Já vou… já vou…»', '…ele não veio.'],
  ['Tem um bilhete dos duendes preso na porta:', '«Urso, o Grinch atacou de novo. Ass.: Os duendes.»'],
  ['Pegadas verdes na neve, perto do iglu…', 'Tomara que não seja quem eu tô pensando.'],
];

/**
 * O limite (06/11/2026, pedido do Kauan): «um limitador nas falas do urso,
 * para a pessoa não ficar clicando sempre». Depois de `LIMITE_DE_CONVERSAS`
 * conversas puxadas por clique na mesma rodada, ele se despede uma vez
 * (`CANSOU`) e fica quieto até a rodada recomeçar — quando ele sai ou entra
 * no iglu, ou depois de `SILENCIO_MS` (ver `IgluDoUrso`). O tchauzinho para o
 * trem não conta: é ele que puxa.
 */
export const LIMITE_DE_CONVERSAS = 10;
/** Calado, ele volta a conversar depois disso, mesmo sem sair do lugar. */
export const SILENCIO_MS = 8 * 60_000;

const CANSOU: Conversa[] = [
  ['Ufa… chega de papo por hoje!', 'Os peixes tão reclamando do barulho. Volta mais tarde? 🎣'],
  ['Tá bom, tá bom… acabou o meu estoque de assunto.', 'Agora é silêncio e pescaria. Combinado?'],
  ['Dez conversas! Isso é mais do que eu falo num inverno inteiro.', 'Vou ficar quietinho agora, tá?'],
  ['{nome}, eu adoro a conversa…', 'Mas urso também precisa se concentrar.', 'Depois a gente continua!'],
  ['Shhh… agora é hora do peixe.', 'Me chama mais tarde, que eu conto mais história.'],
];

const CANSOU_IGLU: Conversa[] = [
  ['Lá de dentro: «Chega de bater na porta! Tô descansando!»'],
  ['Apareceu uma plaquinha na porta: «Não perturbe. Ass.: o Urso.»'],
  ['Silêncio total… o urso cansou de atender.', 'Melhor voltar mais tarde.'],
];

/** A partir de quantas conversas na mesma rodada ele pode reclamar da insistência. */
export const INSISTENTE_DEPOIS = 7;
/** A chance de uma insistência, depois disso. */
export const CHANCE_DE_INSISTENCIA = 0.3;

/** Um baralho: tira sem repetir até acabar; aí embaralha de novo, sem começar pela última. */
export function criarBaralho<T>(itens: readonly T[], sorte: () => number = Math.random) {
  let monte: T[] = [];
  let ultima: T | undefined;
  const embaralhar = () => {
    const m = [...itens];
    for (let i = m.length - 1; i > 0; i--) {
      const j = Math.floor(sorte() * (i + 1));
      [m[i], m[j]] = [m[j], m[i]];
    }
    if (m.length > 1 && m[0] === ultima) [m[0], m[m.length - 1]] = [m[m.length - 1], m[0]];
    return m;
  };
  return {
    tirar(): T {
      if (!monte.length) monte = embaralhar();
      ultima = monte.shift() as T;
      return ultima;
    },
  };
}

export function periodoDoDia(hora: number): keyof typeof CUMPRIMENTOS {
  if (hora >= 5 && hora < 12) return 'manha';
  if (hora >= 12 && hora < 18) return 'tarde';
  return 'noite';
}

/**
 * Uma rodada de conversa. `nome`: o primeiro nome de quem olha (ou `null`);
 * `hora`: a hora do dia, para o cumprimento. `fofoca`: o Grinch invadiu o
 * chalé há pouco — a segunda conversa da rodada é sobre isso.
 */
export function criarRodada(nome: string | null, hora: number, sorte: () => number = Math.random, fofoca = false) {
  const cabe = (c: Conversa) => nome !== null || !c.some(f => f.includes('{nome}'));
  const preencher = (c: Conversa): string[] => c.map(f => (nome ? f.split('{nome}').join(nome) : f));
  const baralho = (lista: Conversa[]) => criarBaralho(lista.filter(cabe), sorte);

  const cumprimentos = baralho([...CUMPRIMENTOS[periodoDoDia(hora)], ...QUALQUER_HORA]);
  const pescando = baralho([...PESCANDO, ...DUENDES_E_GRINCH]);
  const fofocas = baralho(FOFOCA_DO_GRINCH);
  const cansou = baralho(CANSOU);
  const cansouIglu = baralho(CANSOU_IGLU);
  let cliques = 0;
  const fisgou = baralho(FISGOU);
  const insistencia = baralho(INSISTENCIA);
  const iglu = baralho(IGLU);
  const trem = baralho(TREM);
  let conversas = 0;

  const rodada = {
    /** A próxima conversa, para o momento do urso. */
    proxima(momento: MomentoDoUrso): string[] {
      if (momento === 'iglu') return preencher(iglu.tirar());
      // O tchauzinho para o trem não conta como conversa (nem como cumprimento).
      if (momento === 'trem') return preencher(trem.tirar());
      conversas++;
      if (momento === 'fisgou') return preencher(fisgou.tirar());
      if (conversas === 1) return preencher(cumprimentos.tirar());
      if (conversas === 2 && fofoca) return preencher(fofocas.tirar());
      if (conversas > INSISTENTE_DEPOIS && sorte() < CHANCE_DE_INSISTENCIA) return preencher(insistencia.tirar());
      return preencher(pescando.tirar());
    },
    /**
     * A conversa puxada por CLIQUE, com o limite: as primeiras
     * `LIMITE_DE_CONVERSAS` saem normalmente; a seguinte é a despedida; depois,
     * `null` — ele não responde mais nesta rodada.
     */
    conversar(momento: Exclude<MomentoDoUrso, 'trem'>): string[] | null {
      cliques++;
      if (cliques <= LIMITE_DE_CONVERSAS) return rodada.proxima(momento);
      if (cliques === LIMITE_DE_CONVERSAS + 1) return preencher((momento === 'iglu' ? cansouIglu : cansou).tirar());
      return null;
    },
    /** Já se despediu nesta rodada. */
    get calado() { return cliques > LIMITE_DE_CONVERSAS; },
  };
  return rodada;
}

/** Só para os testes: o tamanho dos baralhos. */
export const REPERTORIO = { PESCANDO, FISGOU, INSISTENCIA, IGLU, TREM, CUMPRIMENTOS, QUALQUER_HORA, DUENDES_E_GRINCH, FOFOCA_DO_GRINCH, CANSOU, CANSOU_IGLU };
