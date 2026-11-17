// Quem aparece no vídeo «Entre Metas e Risadas» e em que ordem.
//
// As fotos vêm de Downloads\Video fechamento (uma pasta por setor), copiadas
// para public/fechamento/fotos/<setor>-<nome>.jpg com no máximo 1400 px.
//
// `foco` é o ponto da foto que fica no centro quando ela é cortada (x e y de 0
// a 100, como o object-position do CSS). Ajuste aqui se alguém sair com a
// cabeça cortada.

export type Pessoa = { nome: string; foto: string; foco?: [number, number] };

export type Setor = {
  id: string;
  nome: string;
  /** «Gênero do filme» que aparece na claquete — só brincadeira. */
  genero: string;
  /** Cor de destaque do capítulo. */
  cor: string;
  pessoas: Pessoa[];
};

const p = (setor: string, arquivo: string, nome: string, foco?: [number, number]): Pessoa => ({
  nome,
  foto: `fechamento/fotos/${setor}-${arquivo}.jpg`,
  foco,
});

export const SETORES: Setor[] = [
  {
    id: 'estrategia',
    nome: 'Estratégia',
    genero: 'Suspense: sempre um passo à frente',
    cor: '#f5c451',
    pessoas: [
      p('estrategia', 'alexandre', 'Alexandre'),
      p('estrategia', 'aline', 'Aline'),
      p('estrategia', 'bruno', 'Bruno'),
      p('estrategia', 'fabio', 'Fábio'),
      p('estrategia', 'guilherme', 'Guilherme'),
      p('estrategia', 'igor', 'Igor'),
      p('estrategia', 'luiz', 'Luiz'),
      p('estrategia', 'paulo', 'Paulo'),
      p('estrategia', 'rafael', 'Rafael'),
    ],
  },
  {
    id: 'play1',
    nome: 'Play 1',
    genero: 'Ação: meta dada é meta batida',
    cor: '#ff6b5a',
    pessoas: [
      p('play1', 'ariana', 'Ariana'),
      p('play1', 'cleiton', 'Cleiton'),
      p('play1', 'paola', 'Paola'),
      p('play1', 'rhaissa', 'Rhaissa'),
      p('play1', 'thais', 'Thais'),
    ],
  },
  {
    id: 'play2',
    nome: 'Play 2',
    genero: 'Aventura: cada ligação, uma jornada',
    cor: '#4fd1c5',
    pessoas: [
      p('play2', 'bianca', 'Bianca'),
      p('play2', 'ederlandia', 'Ederlandia'),
      p('play2', 'kimberli', 'Kimberli'),
      p('play2', 'luciano', 'Luciano'),
      p('play2', 'mateus', 'Mateus'),
    ],
  },
  {
    id: 'play3',
    nome: 'Play 3',
    genero: 'Épico: em três atos e com final feliz',
    cor: '#a3e36a',
    pessoas: [
      p('play3', 'alisson', 'Alisson'),
      p('play3', 'ana-paula', 'Ana Paula'),
      p('play3', 'bianca-santelli', 'Bianca Santelli'),
      p('play3', 'jaque', 'Jaque'),
      p('play3', 'renata', 'Renata'),
      p('play3', 'sarah', 'Sarah'),
    ],
  },
  {
    id: 'playmix',
    nome: 'Play Mix',
    genero: 'Musical: cada um no seu tom',
    cor: '#ff8fd0',
    pessoas: [
      p('playmix', 'danieli', 'Danieli'),
      p('playmix', 'douglas', 'Douglas'),
      p('playmix', 'ellen', 'Ellen'),
      p('playmix', 'jenifer', 'Jenifer'),
      p('playmix', 'vanessa', 'Vanessa'),
    ],
  },
  {
    id: 'receptivo',
    nome: 'Receptivo',
    genero: 'Comédia: atende sorrindo, até no 0800',
    cor: '#ffa94d',
    pessoas: [
      p('receptivo', 'beatriz', 'Beatriz'),
      p('receptivo', 'karolaine', 'Karolaine'),
      p('receptivo', 'luan', 'Luan'),
      p('receptivo', 'luciana', 'Luciana'),
    ],
  },
  {
    id: 'treinamento',
    nome: 'Treinamento',
    genero: 'Escola de cinema: onde as estrelas nascem',
    cor: '#7cc4ff',
    pessoas: [p('treinamento', 'samara', 'Samara'), p('treinamento', 'vanessa', 'Vanessa')],
  },
  {
    id: 'manutencao',
    nome: 'Cob. Manutenção',
    genero: 'Thriller: nenhum acordo fica para trás',
    cor: '#c9a7ff',
    pessoas: [p('manutencao', 'luiz', 'Luiz'), p('manutencao', 'manu', 'Manu')],
  },
  {
    id: 'geral',
    nome: 'Geral',
    genero: 'Direção e produção: os bastidores',
    cor: '#f5c451',
    pessoas: [
      p('geral', 'cleber', 'Cleber'),
      p('geral', 'izamara', 'Izamara'),
      p('geral', 'jessica', 'Jéssica'),
      p('geral', 'kaua', 'Kauan'),
    ],
  },
];

export const TODAS = SETORES.flatMap((s) => s.pessoas.map((pessoa) => ({ ...pessoa, setor: s })));
