/**
 * laboratorio.ts — as cartas da Bruxa do Pântano com gente de mentira, SÓ no
 * localhost.
 *
 * Abre em http://localhost:8080/lab-cartas.html (com o `npm run dev`). Sem
 * login e sem banco: os nomes, os números e as «fotos» (desenhadas aqui) são
 * inventados. `?so=N` mostra só a carta N, grande; `&zoom=2&px=0.5&py=0.2`
 * testa o recorte da foto. O build de produção não leva esta página.
 */
import { ENQUADRAMENTO_PADRAO, desenharCarta, nomeDoArquivo, prepararFontes, type DadosDaCarta, type Enquadramento } from './carta';

const NOMES = [
  'Ana Beatriz Moreira', 'Kauan Oliveira', 'Juliana Prado', 'Rafael Augusto Lima', 'Camila Rocha',
  'Thiago Fernandes', 'Larissa Gomes dos Santos', 'Pedro Henrique', 'Bianca Cristina Albuquerque', 'Lucas Martins',
  'Érica Conceição', 'João Victor Souza', 'Mariana Lopes', 'Gabriel Nunes', 'Fernanda Dias',
  'Ângela Ribeiro', 'Diego Carvalho', 'Patrícia Melo', 'Vinícius Araújo', 'Letícia Barbosa',
  'Matheus Pires', 'Sabrina Teixeira', 'André Luiz Costa', 'Natália Freitas', 'Caio Mendes',
];
const SETORES = ['Receptivo', 'Conecta Play', 'Ativo', null, 'Cobrança'];
const PARTICIPANTES = NOMES.length;

/** Uma «foto» de mentira: fundo, ombros e cabeça (para ver o enquadramento). */
function fotoDeMentira(i: number): Promise<HTMLImageElement> {
  const cv = document.createElement('canvas');
  cv.width = 600;
  cv.height = 800;
  const c = cv.getContext('2d')!;
  const fundo = c.createLinearGradient(0, 0, 600, 800);
  fundo.addColorStop(0, ['#6d8fb3', '#c9a27e', '#8fb39a', '#b38fa8', '#9aa0a6'][i % 5]);
  fundo.addColorStop(1, '#2a2f3a');
  c.fillStyle = fundo;
  c.fillRect(0, 0, 600, 800);
  c.fillStyle = ['#2b3a55', '#5a2b2b', '#2b4a35', '#3a2b55', '#333'][i % 5];
  c.beginPath();
  c.ellipse(300, 820, 260, 260, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = ['#e0b896', '#8d5a3b', '#f1cfb3', '#c58c63', '#a8734f'][i % 5];
  c.beginPath();
  c.ellipse(300, 380, 120, 150, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#1b1410';
  c.beginPath();
  c.ellipse(300, 290, 130, 80, 0, Math.PI, Math.PI * 2);
  c.fill();
  const img = new Image();
  img.src = cv.toDataURL('image/png');
  return img.decode().then(() => img);
}

async function montar(): Promise<void> {
  document.body.style.cssText = 'margin:0;background:#11151c;font-family:system-ui;color:#ccd';
  await prepararFontes();
  const raiz = document.getElementById('lab')!;
  raiz.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;padding:24px';
  const q = new URLSearchParams(location.search);
  const so = q.get('so');
  const enq: Enquadramento = q.has('zoom')
    ? { zoom: Number(q.get('zoom')), px: Number(q.get('px') ?? 0.5), py: Number(q.get('py') ?? 0.3) }
    : ENQUADRAMENTO_PADRAO;
  for (let i = 0; i < PARTICIPANTES; i++) {
    if (so && Number(so) !== i + 1) continue;
    const dados: DadosDaCarta = {
      posicao: i + 1,
      nome: NOMES[i],
      setor: SETORES[i % SETORES.length],
      dano: Math.round(1480 / (1 + i * 0.32)),
      acertos: Math.round(420 / (1 + i * 0.3)),
      criticos: Math.round(96 / (1 + i * 0.4)),
      vidaMax: 9150,
      participantes: PARTICIPANTES,
      golpeFinal: i === 3,
      quando: new Date('2026-10-17T16:42:00'),
    };
    const foto = i === 3 || i === 14 ? null : await fotoDeMentira(i);
    const cv = desenharCarta(dados, foto, enq);
    cv.style.width = so ? '1080px' : '320px';
    cv.dataset.posicao = String(i + 1);
    const caixa = document.createElement('figure');
    caixa.style.cssText = 'margin:0;display:grid;gap:6px;font-size:12px';
    const legenda = document.createElement('figcaption');
    legenda.textContent = nomeDoArquivo(dados);
    caixa.append(cv, legenda);
    raiz.append(caixa);
  }
  document.body.dataset.pronto = '1';
}

void montar();
