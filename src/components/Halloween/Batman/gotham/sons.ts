/**
 * sons.ts — o som da chuva do modo Batman, feito na hora (Web Audio), sem
 * arquivo: o áudio do filme não dá para usar, então a chuva é montada em
 * camadas — o chiado fino em estéreo (gotas longe), o corpo (gotas no chão e
 * nas marquises), o grave da cidade molhada, rajadas lentas e pingos soltos
 * perto. O volume vem de quem chama (`regente.ts`).
 */
import { contextoDeAudio } from './audio';

/** Os ruídos, gerados uma vez (gerar segundos de ruído é trabalho de CPU) e tocados com deslocamentos diferentes. */
const ruidos = new Map<string, AudioBuffer>();

/** Ruído rosa (o chiado da chuva) ou marrom (o grave da cidade molhada), em laço. */
function ruidoEmLaco(c: AudioContext, tipo: 'rosa' | 'marrom', segundos = 6) {
  const pronto = ruidos.get(tipo);
  if (pronto) {
    const f = c.createBufferSource();
    f.buffer = pronto; f.loop = true;
    f.start(c.currentTime, Math.random() * segundos);
    return f;
  }
  const buf = c.createBuffer(1, Math.round(c.sampleRate * segundos), c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, ultimo = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (tipo === 'rosa') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    } else { ultimo = (ultimo + 0.02 * w) / 1.02; d[i] = ultimo * 3.5; }
  }
  ruidos.set(tipo, buf);
  const f = c.createBufferSource();
  f.buffer = buf; f.loop = true;
  f.start(c.currentTime, Math.random() * segundos);
  return f;
}

/**
 * A chuva caindo na cidade, feita na hora: o chiado fino em estéreo (gotas
 * longe), o corpo (gotas no chão e nas marquises), o grave da cidade molhada,
 * rajadas lentas e pingos soltos perto, cada um de um lado.
 */
export function criarSomDeChuva(): { volume(v: number): void; parar(): void } | null {
  const c = contextoDeAudio();
  if (!c) return null;
  void c.resume();
  const saida = c.createGain();
  saida.gain.value = 0;
  saida.connect(c.destination);
  const fontes: AudioScheduledSourceNode[] = [];

  // Chiado, um de cada lado, com rajadas lentas.
  const rajada = c.createOscillator(); rajada.frequency.value = 0.07;
  const fundoRajada = c.createGain(); fundoRajada.gain.value = 0.06;
  rajada.connect(fundoRajada); rajada.start(); fontes.push(rajada);
  for (const lado of [-0.7, 0.7]) {
    const n = ruidoEmLaco(c, 'rosa'); fontes.push(n);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8500;
    const g = c.createGain(); g.gain.value = 0.22; fundoRajada.connect(g.gain);
    const p = c.createStereoPanner(); p.pan.value = lado;
    n.connect(hp).connect(lp).connect(g).connect(p).connect(saida);
  }
  // Corpo e grave.
  const corpo = ruidoEmLaco(c, 'rosa'); fontes.push(corpo);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6;
  const gc = c.createGain(); gc.gain.value = 0.2;
  corpo.connect(bp).connect(gc).connect(saida);
  const grave = ruidoEmLaco(c, 'marrom'); fontes.push(grave);
  const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 170;
  const gg = c.createGain(); gg.gain.value = 0.35;
  grave.connect(lp2).connect(gg).connect(saida);

  // Pingos perto: estalinhos curtos, agudos, em lugares diferentes.
  const pingo = c.createBuffer(1, Math.round(c.sampleRate * 0.03), c.sampleRate);
  const dp = pingo.getChannelData(0);
  for (let i = 0; i < dp.length; i++) dp[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.004));
  const agenda = window.setInterval(() => {
    const agora = c.currentTime;
    const n = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      const s = c.createBufferSource(); s.buffer = pingo;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 4500; f.Q.value = 3 + Math.random() * 4;
      const g = c.createGain(); g.gain.value = 0.03 + Math.random() * 0.1;
      const p = c.createStereoPanner(); p.pan.value = Math.random() * 2 - 1;
      s.connect(f).connect(g).connect(p).connect(saida);
      s.start(agora + Math.random() * 0.1);
    }
  }, 100);

  return {
    volume(v: number) { saida.gain.setTargetAtTime(Math.max(0, v), c.currentTime, 0.4); },
    parar() {
      window.clearInterval(agenda);
      saida.gain.setTargetAtTime(0, c.currentTime, 0.3);
      window.setTimeout(() => { for (const f of fontes) { try { f.stop(); } catch { /* já parou */ } } saida.disconnect(); }, 1500);
    },
  };
}
