/**
 * laboratorio.ts — o ensaio do lobby da Bruxa do Pântano, SÓ no localhost.
 *
 * Abre em http://localhost:8080/lab-bruxa-lobby.html (com o `npm run dev`).
 * Sem login e sem banco: o relógio é o desta tela, as pessoas que entram são
 * de mentira, e a luta é um ensaio (clicar na bruxa tira vida; o time também
 * bate sozinho). Serve para ver o convite, o lobby, a música subindo e
 * sumindo na morte. O build de produção não leva esta página.
 */
import { canvasDaImagem } from '../../pixels';
import { NOME_CHEFONA, QUADROS_FLUTUANDO, montarBruxaMC } from '../arte';
import { LobbyChefona, type Guerreiro } from './lobby';
import { CONTAGEM_LOBBY_S, PONTO_DA_BRUXA_S, mmss } from './trilha';

const FONTES = `
@font-face { font-family: 'Press Start 2P'; src: url('/fonts/press-start-2p.woff2') format('woff2'); font-display: swap; }
@font-face { font-family: 'Pixelify Sans'; src: url('/fonts/pixelify-sans.woff2') format('woff2'); font-weight: 400 700; font-display: swap; }`;

const CSS_LAB = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font-family: Inter, system-ui, sans-serif; background: #f4f5f9; color: #1d2433; overflow: hidden; }
.lab-app { display: grid; grid-template-columns: 220px 1fr; height: 100vh; }
.lab-menu { background: #fff; border-right: 1px solid #e3e6ee; padding: 18px 14px; display: grid; align-content: start; gap: 6px; }
.lab-menu b { font-size: 15px; margin-bottom: 12px; color: #2b59c3; }
.lab-menu span { padding: 8px 10px; border-radius: 8px; font-size: 13px; color: #556; }
.lab-menu span.on { background: #eef3ff; color: #2b59c3; font-weight: 600; }
.lab-main { padding: 120px 28px 28px; overflow: auto; }
.lab-main h1 { font-size: 20px; margin: 0 0 16px; }
.lab-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.lab-card { background: #fff; border: 1px solid #e3e6ee; border-radius: 14px; padding: 16px; }
.lab-card small { color: #778; font-size: 12px; }
.lab-card div { font-size: 22px; font-weight: 700; margin-top: 6px; }
@media (max-width: 760px) { .lab-app { grid-template-columns: 1fr; } .lab-menu { display: none; } }

.lab-ctl {
  position: fixed; left: 12px; bottom: 12px; z-index: 90; width: 300px; max-width: calc(100vw - 24px);
  background: #10131c; color: #e6e9f2; border-radius: 12px; font: 12px/1.4 ui-monospace, Consolas, monospace;
  box-shadow: 0 10px 30px rgb(0 0 0 / .35);
}
.lab-ctl summary { padding: 9px 12px; cursor: pointer; font-weight: 700; color: #ffd166; }
.lab-ctl-corpo { padding: 0 12px 12px; display: grid; gap: 8px; }
.lab-ctl-linha { display: flex; flex-wrap: wrap; gap: 5px; }
.lab-ctl button { font: inherit; padding: 4px 8px; border-radius: 6px; border: 1px solid #39405a; background: #1d2233; color: #e6e9f2; cursor: pointer; }
.lab-ctl button:hover { background: #2a3150; }
.lab-ctl button.on { background: #3c8527; border-color: #4aa232; }
.lab-ctl-leitura { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; background: #0a0c12; padding: 8px; border-radius: 8px; }
.lab-ctl-leitura b { color: #8fa3d6; font-weight: 400; }
.lab-ctl-leitura span.ok { color: #80ff20; }
.lab-ctl-leitura span.ruim { color: #ff6b6b; }

.lab-bruxa { position: fixed; z-index: 60; image-rendering: pixelated; cursor: crosshair; user-select: none; }
.lab-vida {
  position: fixed; top: 12px; left: 0; right: 0; margin-inline: auto; width: min(420px, calc(100vw - 24px)); z-index: 65;
  font-family: 'Pixelify Sans', monospace; color: #fff; text-align: center; text-shadow: 2px 2px 0 #000;
}
.lab-vida-barra { height: 12px; background: #1b1b1b; border: 2px solid #000; margin-top: 4px; }
.lab-vida-cheia { height: 100%; background: linear-gradient(#ff7ad9, #b040e0); transition: width .2s; }
.lab-dano { position: fixed; z-index: 66; pointer-events: none; font: 700 18px 'Pixelify Sans', monospace; color: #ffef5a; text-shadow: 2px 2px 0 #000; animation: lab-dano .7s ease-out forwards; }
@keyframes lab-dano { to { transform: translateY(-36px); opacity: 0; } }
.lab-conquista {
  position: fixed; top: 16px; right: 16px; z-index: 80; display: flex; gap: 10px; align-items: center;
  padding: 10px 14px; background: #212121; border: 2px solid #555; box-shadow: inset 0 0 0 2px #000;
  font-family: 'Pixelify Sans', monospace; color: #fff; animation: lab-conquista 4s ease-in-out forwards;
}
.lab-conquista small { display: block; color: #ffff55; font-size: 12px; }
@keyframes lab-conquista { 0% { transform: translateX(120%); } 10%, 85% { transform: none; } 100% { transform: translateX(120%); } }
`;

const estilo = document.createElement('style');
estilo.textContent = FONTES + CSS_LAB;
document.head.appendChild(estilo);

// ── O fundo de mentira (uma tela do sistema) ───────────────────────────────

const raiz = document.getElementById('lab')!;
raiz.innerHTML = `
<div class="lab-app">
  <nav class="lab-menu"><b>Gestão de Acordos</b>
    <span class="on">Dashboard</span><span>Acordos</span><span>Novo Acordo</span><span>Analítico</span><span>Chat</span>
  </nav>
  <main class="lab-main">
    <h1>Bom dia, Cleber 👋</h1>
    <div class="lab-cards">
      <div class="lab-card"><small>Recebido hoje</small><div>R$ 3.482,10</div></div>
      <div class="lab-card"><small>Meta do mês</small><div>62%</div></div>
      <div class="lab-card"><small>Acordos pendentes</small><div>14</div></div>
      <div class="lab-card"><small>Minha equipe</small><div>R$ 41.209,77</div></div>
    </div>
  </main>
</div>`;

// ── O relógio e as pessoas ─────────────────────────────────────────────────

const EU: Guerreiro = { id: 'eu', nome: 'Cleber Junior', setor: 'Play 3' };
const NOMES = [
  'Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Eduarda Alves', 'Felipe Costa', 'Gabriela Nunes',
  'Henrique Dias', 'Isabela Martins', 'João Pedro', 'Karina Lopes', 'Lucas Ferreira', 'Mariana Ribeiro',
  'Nathan Gomes', 'Olívia Castro', 'Paulo Henrique', 'Quésia Ramos', 'Rafael Moreira', 'Sabrina Teixeira',
  'Thiago Barbosa', 'Úrsula Pinto', 'Vitor Hugo', 'Wesley Araújo', 'Yasmin Cardoso', 'Andressa Aires',
  'Noemi Santos', 'Luana Barrios', 'Thayna Izidro', 'Tainara Fernanda', 'Gabrieli Oliveira',
];
const SETORES = ['Play 1', 'Play 2', 'Play 3', 'Play Mix', 'Receptivo', 'Marília Digital'];

let soltaEm = Date.now() + CONTAGEM_LOBBY_S * 1000;
const faltaS = () => (soltaEm - Date.now()) / 1000;
let guerreiros: Guerreiro[] = [];
let botsLigados = true;
let proximoBot = 0;

const lobby = new LobbyChefona(document.body, {
  faltaS,
  eu: EU,
  aoEntrar: () => { if (!guerreiros.some(g => g.id === EU.id)) guerreiros = [...guerreiros, EU]; lobby.atualizarGuerreiros(guerreiros); },
  aoSair: () => { guerreiros = guerreiros.filter(g => g.id !== EU.id); lobby.atualizarGuerreiros(guerreiros); },
});

function entraBot(): void {
  const livres = NOMES.filter(n => !guerreiros.some(g => g.nome === n));
  if (!livres.length) return;
  const nome = livres[Math.floor(Math.random() * livres.length)];
  guerreiros = [...guerreiros, { id: `bot-${nome}`, nome, setor: SETORES[Math.floor(Math.random() * SETORES.length)] }];
  lobby.atualizarGuerreiros(guerreiros);
}

/** Muita gente no começo (o aviso acabou de chegar), depois aos poucos. */
function intervaloBot(falta: number): number {
  const decorrido = CONTAGEM_LOBBY_S - falta;
  const base = decorrido < 20 ? 1500 : decorrido < 90 ? 5000 : 9000;
  return base * (0.5 + Math.random());
}

setInterval(() => {
  const falta = faltaS();
  if (!botsLigados || falta <= 0 || Date.now() < proximoBot) return;
  if (proximoBot) entraBot();
  proximoBot = Date.now() + intervaloBot(falta);
}, 250);

// ── A luta de ensaio ───────────────────────────────────────────────────────

const VIDA = 300;
const PRAZO_S = 120;
let vida = VIDA;
let luta: { bruxa: HTMLCanvasElement; barra: HTMLElement; raf: number; time: number; inicio: number } | null = null;
const quadros = Array.from({ length: QUADROS_FLUTUANDO }, (_, i) => canvasDaImagem(montarBruxaMC(i), false));

function somMC(nome: string, volume: number): void {
  const a = new Audio(`/sons/minecraft/${nome}.ogg`);
  a.volume = volume;
  void a.play().catch(() => {});
}

function comecarLuta(): void {
  if (luta) return;
  vida = VIDA;
  const bruxa = document.createElement('canvas');
  bruxa.className = 'lab-bruxa';
  const escala = 5;
  bruxa.width = quadros[0].width;
  bruxa.height = quadros[0].height;
  bruxa.style.width = `${bruxa.width * escala}px`;
  bruxa.style.height = `${bruxa.height * escala}px`;
  const barra = document.createElement('div');
  barra.className = 'lab-vida';
  barra.innerHTML = `${NOME_CHEFONA} <span></span><div class="lab-vida-barra"><div class="lab-vida-cheia" style="width:100%"></div></div>`;
  document.body.append(bruxa, barra);
  bruxa.addEventListener('pointerdown', e => {
    bater(12);
    somMC(`bruxa-dano-${1 + Math.floor(Math.random() * 3)}`, 0.5);
    const d = document.createElement('div');
    d.className = 'lab-dano';
    d.textContent = '-12';
    d.style.left = `${e.clientX}px`;
    d.style.top = `${e.clientY - 20}px`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 700);
  });
  const inicio = performance.now();
  // O time bate sozinho: ~4 de dano por segundo (os outros guerreiros).
  const time = window.setInterval(() => bater(guerreiros.length > 1 ? 4 : 0), 1000);
  const anda = () => {
    const t = (performance.now() - inicio) / 1000;
    const w = innerWidth, h = innerHeight;
    const x = w / 2 + Math.sin(t * 0.6) * w * 0.3 - (bruxa.width * escala) / 2;
    const y = h / 2 + Math.sin(t * 1.3) * h * 0.15 - (bruxa.height * escala) / 2;
    bruxa.style.left = `${x}px`;
    bruxa.style.top = `${y}px`;
    const g = bruxa.getContext('2d')!;
    g.clearRect(0, 0, bruxa.width, bruxa.height);
    g.drawImage(quadros[Math.floor(t / 0.15) % quadros.length], 0, 0);
    if (t > PRAZO_S) { acabarLuta(false); return; }
    if (luta) luta.raf = requestAnimationFrame(anda);
  };
  luta = { bruxa, barra, raf: requestAnimationFrame(anda), time, inicio };
  atualizarVida();
}

function bater(dano: number): void {
  if (!luta) return;
  vida = Math.max(0, vida - dano);
  atualizarVida();
  if (vida <= 0) acabarLuta(true);
}

function atualizarVida(): void {
  if (!luta) return;
  luta.barra.querySelector('span')!.textContent = `${vida}/${VIDA}`;
  (luta.barra.querySelector('.lab-vida-cheia') as HTMLElement).style.width = `${(vida / VIDA) * 100}%`;
}

function acabarLuta(morreu: boolean): void {
  if (!luta) return;
  // A música some primeiro (0,6 s), e o som da morte e a conquista entram limpos.
  lobby.encerrarLuta();
  cancelAnimationFrame(luta.raf);
  clearInterval(luta.time);
  luta.bruxa.remove();
  luta.barra.remove();
  luta = null;
  if (morreu) {
    somMC(`bruxa-morre-${1 + Math.floor(Math.random() * 3)}`, 0.7);
    setTimeout(() => {
      somMC('desafio', 0.6);
      const c = document.createElement('div');
      c.className = 'lab-conquista';
      c.innerHTML = '<span style="font-size:22px">🏆</span><div>Desafio concluído!<small>A Bruxa do Pântano caiu</small></div>';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }, 650);
  } else {
    somMC('bruxa-ri-1', 0.6);
  }
}

// Quando o relógio chega a zero, a bruxa nasce (para quem entrou ou não).
let lutouNestaRodada = false;
setInterval(() => {
  if (faltaS() <= 0 && !lutouNestaRodada) { lutouNestaRodada = true; comecarLuta(); }
}, 100);

// ── O painel do laboratório ────────────────────────────────────────────────

function reiniciar(falta = CONTAGEM_LOBBY_S): void {
  if (luta) { cancelAnimationFrame(luta.raf); clearInterval(luta.time); luta.bruxa.remove(); luta.barra.remove(); luta = null; }
  soltaEm = Date.now() + falta * 1000;
  guerreiros = [];
  proximoBot = 0;
  lutouNestaRodada = false;
  lobby.reiniciar();
}

/** Pula o relógio sem desmontar nada: a música pula junto (é o mesmo relógio). */
function pularPara(falta: number): void {
  soltaEm = Date.now() + falta * 1000;
}

const ctl = document.createElement('details');
ctl.className = 'lab-ctl';
ctl.open = true;
ctl.innerHTML = `
<summary>🧪 Laboratório do lobby</summary>
<div class="lab-ctl-corpo">
  <div>Rodada</div>
  <div class="lab-ctl-linha">
    <button data-a="reiniciar">↺ Recomeçar (3:00)</button>
  </div>
  <div>Pular o relógio para</div>
  <div class="lab-ctl-linha">
    <button data-p="150">2:30</button><button data-p="${PONTO_DA_BRUXA_S + 2}">música começa</button>
    <button data-p="60">1:00</button><button data-p="15">0:15</button><button data-p="4">0:04</button>
  </div>
  <div>Pessoas</div>
  <div class="lab-ctl-linha">
    <button data-a="bot">+1 entra</button><button data-a="bots" class="on">entrando sozinhas</button>
  </div>
  <div>Luta</div>
  <div class="lab-ctl-linha">
    <button data-a="matar">☠ Matar a bruxa</button><button data-a="fugir">Ela foge (prazo)</button>
  </div>
  <div class="lab-ctl-leitura">
    <b>falta</b><span data-l="falta"></span>
    <b>estado</b><span data-l="estado"></span>
    <b>música (deveria)</b><span data-l="alvo"></span>
    <b>música (está)</b><span data-l="pos"></span>
    <b>desvio</b><span data-l="desvio"></span>
    <b>volume</b><span data-l="vol"></span>
  </div>
</div>`;
document.body.appendChild(ctl);

ctl.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.dataset.p) pularPara(Number(b.dataset.p));
  switch (b.dataset.a) {
    case 'reiniciar': reiniciar(); break;
    case 'bot': entraBot(); break;
    case 'bots': botsLigados = !botsLigados; b.classList.toggle('on', botsLigados); break;
    case 'matar': if (luta) bater(vida); break;
    case 'fugir': acabarLuta(false); break;
  }
});

const leitura = (k: string) => ctl.querySelector<HTMLElement>(`[data-l="${k}"]`)!;
setInterval(() => {
  const falta = faltaS();
  const est = lobby.tocador.estado();
  leitura('falta').textContent = falta > 0 ? mmss(falta) : `luta +${mmss(-falta)}`;
  leitura('estado').textContent = lobby.situacao;
  leitura('alvo').textContent = est.alvo === null ? '—' : `${est.alvo.toFixed(2)} s (${mmss(est.alvo)})`;
  leitura('pos').textContent = est.tocando ? `${est.posicao.toFixed(2)} s` : 'parada';
  const d = est.tocando && est.alvo !== null ? Math.round((est.posicao - est.alvo) * 1000) : null;
  const desvio = leitura('desvio');
  desvio.textContent = d === null ? '—' : `${d > 0 ? '+' : ''}${d} ms`;
  desvio.className = d === null ? '' : Math.abs(d) <= 250 ? 'ok' : 'ruim';
  leitura('vol').textContent = est.mudo ? 'mudo' : `${(est.volume * 100).toFixed(1)}%`;
}, 200);
