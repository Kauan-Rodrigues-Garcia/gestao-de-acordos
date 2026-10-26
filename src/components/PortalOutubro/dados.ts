/**
 * dados.ts — o retrato de outubro que o mural mostra. CONGELADO de propósito:
 * às 16h de sexta ninguém lê o banco (ver `fases.ts`).
 *
 * De onde veio cada coisa:
 *
 *   - o ranking: a pontuação das medalhas (`Insignias/pontuacao.ts`), lida do
 *     banco em 26/10/2026 com a autorização do Kauan. 174 pessoas têm pelo
 *     menos uma insígnia. No empate de pontos, a ordem é a do nome (o app
 *     desempata por quem completou antes: pode trocar a ordem DENTRO de um
 *     empate). Antes de sexta, ler de novo e trocar esta lista;
 *   - as gincanas: o que está escrito no próprio código e nas artes já feitas
 *     (a Bruxa do Pântano: `cartas/podio.ts`, 74 pessoas, golpe final do
 *     Eduardo Naia). Número que não se sabe fica `null` e não aparece —
 *     nada aqui é inventado.
 *
 * O prêmio das Lendas e a garrafa ainda não têm descrição: ficam «a definir».
 */
import type { IdInsignia } from '@/components/Insignias/insignias';

export interface Pessoa {
  posicao: number;
  nome: string;
  setor: string | null;
  insignias: number;
  pontos: number;
}

/**
 * Todo mundo com pelo menos uma insígnia, na ordem da pontuação de 26/10.
 * Cada linha: posição | nome | setor (vazio = sem setor) | insígnias | pontos.
 */
const LISTA = `
1|Erika Eduarda|Receptivo|5|630
2|Ayslan Silva|Play 2|5|595
3|Nicole Pacheco|Receptivo|5|575
4|Lucas Nascimento|Receptivo|4|475
5|Marianne Freitas|Receptivo|4|475
6|Vitoria Grosso|Playmix|4|475
7|Debora Portela da Silva|Receptivo|4|465
8|Isabella Rocha|Play 2|4|465
9|Pedro Pugina Verdinasse|Receptivo|4|465
10|Joao Miguel|Play 2|4|460
11|Thamires Souza|Play 2|4|450
12|Igor Rocha|Play 2|3|405
13|Amanda Paulo|Receptivo|3|360
14|Fernanda Mata|Play 2|3|360
15|Heloisa Lima|Receptivo|3|360
16|Jose Victor Tavares|Receptivo|3|360
17|Otavio Cestini|Play 2|3|360
18|Eduardo Melo|Receptivo|3|355
19|Nanci Moreira|Receptivo|3|355
20|Poliana Shueter|Play 2|3|355
21|Wilson Junior|Playmix|3|350
22|Helton Paulino Roldon|Playmix|3|345
23|Maria C Silva|Play 2|3|345
24|Eduardo Naia|Play 3|2|290
25|Agatha Rocha|Receptivo|2|260
26|Matheus Costa|Receptivo|2|255
27|Ana Clara Da Silva Sena|Receptivo|2|240
28|Analimasilva|Play Mix Marília|2|240
29|Andressa Aires|Play 3|2|240
30|Breno Henrique Pereira Macarini|Play 3|2|240
31|Carolina Murai|Play 1|2|240
32|Daniela Reis|Play 2|2|240
33|Debora Renata Souza|Play 1|2|240
34|Emilly Oliveira|Play 2|2|240
35|Erica Carvalho|Play 1|2|240
36|Eriele Monteiro|Receptivo|2|240
37|Gabriela Farias|Play 1|2|240
38|Gustavo Nunes|Playmix|2|240
39|Isabeli Ferreira|Play 3|2|240
40|Joao Garcia|Playmix|2|240
41|Joao V Santos|Conecta Play|2|240
42|Juliana dos Santos Mello|Playmix|2|240
43|Juliana Spereira|Play 1|2|240
44|Laura|Playmix|2|240
45|Luana Marchi Polo|Play 1|2|240
46|Maria E Pereira|Playmix|2|240
47|Mario Mantovani|Playmix|2|240
48|Pedro Alves|Playmix|2|240
49|Poliana Varjao|Play Mix Marília|2|240
50|Quezia Vitoreli|Playmix|2|240
51|Rayane Estevan|Play 2|2|240
52|Thayna Izidro|Play 3|2|240
53|Thayra Ferreira Silva|Play 2|2|240
54|Elisandra Raquel|Play Mix Marília|2|235
55|Layra Carini|Receptivo|2|235
56|Leticia Andrade|Receptivo|2|235
57|Sophia Costa|Conecta Play|2|235
58|Alexia Silva|Play 2|2|230
59|Diemily Da Silva|Play 3|2|230
60|Isabele Barros|Play 2|2|230
61|Kauane Azevedo|Conecta Play|2|230
62|Brenda Ferreira|Play 5|2|225
63|Bruna Xavier|Play Mix Marília|2|225
64|Caio Shimite|Conecta Play|2|225
65|Cleber Junior||2|225
66|Gabriely Alves|Receptivo|2|225
67|Julia Caetano|Play 1|2|225
68|Leonardo Nunes Keppler|Play 2|2|225
69|Maria V Souza|Play 5|2|225
70|Sthefanny Moraes|Play 3|2|225
71|Aline Rodrigues|Play 2|1|120
72|Alisson Santana|Playmix|1|120
73|Amabelly Santos|Conecta Play|1|120
74|Amanda Alcasa|Play 5|1|120
75|Amanda D Silva|Play 2|1|120
76|Amanda Laisa|Play 3|1|120
77|Ana Dias|Play 1|1|120
78|Ana Gaiarin|Playmix|1|120
79|Ana Paula Rodrigues|Play 3|1|120
80|André Brandao|Play 3|1|120
81|André Honorato||1|120
82|Andreina Fratucci|Play 1|1|120
83|Andressa Santos|Play 3|1|120
84|Beatriz Reis|Play 3|1|120
85|Beatriz Rodrigues|Receptivo|1|120
86|Benjamin Ayala|Play 3|1|120
87|Bianca Oliveira|Play 5|1|120
88|Bianca Santelli Santos|Play 3|1|120
89|Bianca Santera|Play 3|1|120
90|Bruna Justimiano Ribeiro|Conecta Play|1|120
91|Camila Ribeiro|Play 1|1|120
92|Camilly Carvalho|Play 2|1|120
93|Camilly Pereira|Play 1|1|120
94|Caroline Valverde|Conecta Play|1|120
95|Daniele Andrade|Playmix|1|120
96|Debora Sobrinho|Conecta Play|1|120
97|Douglas Faria|Playmix|1|120
98|Elen Peralta Dos Santos|Play 3|1|120
99|Emily Jardim|Play 1|1|120
100|Fatima Tinareli|Playmix|1|120
101|Francieli Silva|Playmix|1|120
102|Gabriel Martin|Manutenção|1|120
103|Gabriela Gonçalves|Play 3|1|120
104|Gabrieli Oliveira|Play 3|1|120
105|Giovana Souza|Conecta Play|1|120
106|Giovanni Fagundes|Play 1|1|120
107|Hayla Teixeira|Receptivo|1|120
108|Heloisa Camilo|Receptivo|1|120
109|Igor Eduardo Da Cruz Theodoro|Play 3|1|120
110|Ingrid Nascimento|Play 2|1|120
111|Isabela Sobrinho|Play Mix Marília|1|120
112|Jacqueline Nascimento|Play 5|1|120
113|Jaqueline Barbosa|Play 1|1|120
114|Jaqueline Silva|Play Mix Marília|1|120
115|Jessica Lucena|Play 3|1|120
116|João Santos|Play Mix Marília|1|120
117|Joyce Rosseto|Play Mix Marília|1|120
118|Julia Barboza|Play 1|1|120
119|Juliana Bellinati|Playmix|1|120
120|Juliana Vitoria|Play 3|1|120
121|Karina Silva|Play 1|1|120
122|Karina Teixeira|Play Mix Marília|1|120
123|Kauan Rodrigues||1|120
124|Kaue Nadai|Conecta Play|1|120
125|Laiza Daniele|Play 1|1|120
126|Larissa Vieira|Play 2|1|120
127|Leticia Kerlia|Play 3|1|120
128|Leticia Peres|Play 2|1|120
129|Luana Barrios|Play 3|1|120
130|Lucila Silva|Playmix|1|120
131|Luiz Silva|Play 3|1|120
132|Marco Santos|Play 1|1|120
133|Maria Eduarda Da Silva Pereira|Play 3|1|120
134|Maria Segura|Play 2|1|120
135|Mariha Rodrigues|Play 2|1|120
136|Maryellen Araujo|Play Mix Marília|1|120
137|Matheus Gonçalves de Souza|Receptivo|1|120
138|Micaela Souza|Play 1|1|120
139|Mirella Arias|Conecta Play|1|120
140|Mirelly Marinho|Play Mix Marília|1|120
141|Noemi Santos|Play 3|1|120
142|Pamella Medeiros|Playmix|1|120
143|Paola Souza|Play 1|1|120
144|Pedro Souza|Play Mix Marília|1|120
145|Rafaela Lisboa|Play Mix Marília|1|120
146|Raiana Reis|Play 1|1|120
147|Raquel Priscila|Play 1|1|120
148|Rayssa Oliveira|Conecta Play|1|120
149|Renata Cardoso Silva|Play 3|1|120
150|Rodrigo Defalqui|Play 3|1|120
151|Rosane Piona|Play 2|1|120
152|Rosineide Mendes|Play 1|1|120
153|Samara Chamarelli|Treinamento|1|120
154|Sarah Inocencio|Playmix|1|120
155|Shakira Santos|Play 1|1|120
156|Silva Beatriz|Conecta Play|1|120
157|Silvia Alves|Play Mix Marília|1|120
158|Stefany Souza|Playmix|1|120
159|Stella Nascimento|Play 2|1|120
160|Stephanie Fagundes|Conecta Play|1|120
161|Tassiane Viana|Conecta Play|1|120
162|Thaina Couto|Play 2|1|120
163|Thais Mayara|Conecta Play|1|120
164|Thaís Rodrigues|Play Mix Marília|1|120
165|Thais Venturin|Play 1|1|120
166|Thalia Souza|Play 1|1|120
167|Thalita Angelo|Play 1|1|120
168|Thauany Moura|Conecta Play|1|120
169|Tiago Henrique|Playmix|1|120
170|Vinicius Manculi|Play 5|1|120
171|Daniel Fagundes|Play Mix Marília|1|115
172|Gabriela Santana|Play Mix Marília|1|115
173|Maria Oliveira|Play Mix Marília|1|115
174|Mirian Barbosa|Play 2|1|115
`;

export const PESSOAL: readonly Pessoa[] = LISTA.trim().split('\n').map(linha => {
  const [posicao, nome, setor, insignias, pontos] = linha.split('|');
  return { posicao: Number(posicao), nome, setor: setor || null, insignias: Number(insignias), pontos: Number(pontos) };
});

/** O ranking do mural: só o top 10 (pedido de 26/10). */
export const TOP10 = PESSOAL.slice(0, 10);

/** As Lendas: as três com as cinco insígnias. */
export const LENDAS = PESSOAL.filter(p => p.insignias === 5);

/** Quem deu golpe final num chefe (o que o banco disse em 26/10). */
export const GOLPE_FINAL = new Set(['Erika Eduarda', 'Igor Rocha', 'Eduardo Naia']);

export const DATA_DO_RETRATO = '26/10/2026';

// ── As gincanas ─────────────────────────────────────────────────────────────

export interface Gincana {
  id: IdInsignia;
  titulo: string;
  /** Uma frase sobre ela. */
  frase: string;
  /** Fatos certos; o que não se sabe fica de fora. */
  fatos: string[];
}

export const GINCANAS: readonly Gincana[] = [
  {
    id: 'zumbi',
    titulo: 'Caça aos Zumbis',
    frase: 'Os zumbis invadiram o Gestão, e cada um que caía virava insígnia.',
    fatos: ['Desde 07/10'],
  },
  {
    id: 'reiDoPop',
    titulo: 'O Rei do Pop',
    frase: 'Dançou, deu moonwalk, comeu gente — e caiu com todo mundo atirando junto.',
    fatos: ['O primeiro chefe do mês'],
  },
  {
    id: 'bruxas',
    titulo: 'Caça às Bruxas',
    frase: 'As vassouras cruzaram a tela, e a caça mudou de alvo.',
    fatos: [],
  },
  {
    id: 'pantano',
    titulo: 'A Bruxa do Pântano',
    frase: 'Jogou poção, embaralhou a tela e se escondeu atrás do totem. Não adiantou.',
    fatos: ['Caiu em 16/10', '74 caçadores', 'Golpe final: Eduardo Naia'],
  },
  {
    id: 'guerra',
    titulo: 'O Cavalo da Guerra',
    frase: 'A corrida virou guerra, a janela estourou e ele brigou na página do Gestão.',
    fatos: ['Desde 23/10'],
  },
];

// ── Os prêmios ──────────────────────────────────────────────────────────────

/**
 * O prêmio das Lendas (pedido de 26/10): as três clicam, e quando as três
 * clicarem ele aparece e é sorteado numa roleta. Entendido como: UM prêmio,
 * sorteado ENTRE as três. Descrição a definir.
 */
export const PREMIO_DAS_LENDAS = { titulo: 'Prêmio das Lendas', descricao: 'A definir' };

/** A garrafa do sorteio geral. Descrição a definir. */
export const GARRAFA = { titulo: 'A Garrafa', descricao: 'A definir' };

/**
 * Quem concorre à garrafa — decisão do Kauan / Cleber, ainda aberta.
 * Por enquanto: quem tem insígnia, um bilhete por insígnia (a sugestão de
 * 26/10). Trocar para `'iguais'` dá um bilhete para cada.
 */
export const REGRA_DA_GARRAFA: 'bilhete-por-insignia' | 'iguais' = 'bilhete-por-insignia';

export function bilhetes(p: Pick<Pessoa, 'insignias'>): number {
  return REGRA_DA_GARRAFA === 'iguais' ? 1 : p.insignias;
}
