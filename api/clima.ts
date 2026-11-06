/**
 * Função serverless (Vercel): a previsão do tempo de Birigui e Marília, para o
 * Calendário do setor (pedido de 06/11/2026).
 *
 * ## Uma consulta para todo mundo
 *
 * A resposta sai com `Cache-Control: s-maxage=1800, stale-while-revalidate`:
 * quem guarda é a CDN da Vercel, não cada navegador. Todo mundo do sistema que
 * abre o calendário recebe a MESMA resposta guardada, e o provedor é chamado
 * no máximo umas duas vezes por hora, com as duas cidades na mesma rodada. Se
 * o provedor cair, a CDN continua entregando a última resposta boa (o `stale`)
 * enquanto tenta de novo.
 *
 * Não lê banco nem sessão: a previsão é pública, e conferir login aqui faria
 * cada pessoa ter a sua própria resposta e acabaria com o cache compartilhado.
 *
 * ## O provedor: MET Norway
 *
 * O instituto de meteorologia da Noruega (api.met.no) libera a previsão
 * mundial de graça, inclusive para uso comercial, sem chave. Pede em troca três
 * coisas, todas cumpridas aqui: um User-Agent que identifique o sistema, cache
 * (é o da CDN) e o crédito «Dados: MET Norway» (mostrado na caixa do tempo).
 * O Open-Meteo, que foi a primeira ideia, é grátis só para uso não comercial.
 *
 * ## O que devolve
 *
 *   GET /api/clima
 *   200 { fonte, geradoEm, cidades: { birigui: Previsao, marilia: Previsao } }
 *
 * Cada `Previsao` traz o agora (temperatura, sensação, condição, noite,
 * umidade, vento) e seis dias (hoje + cinco), já no vocabulário do app
 * (`limpo`, `chuva`, `tempestade`…). O espelho dos tipos no navegador mora em
 * `src/lib/clima.ts`. Uma cidade que falhar sai `null`; as duas falhando, 502.
 *
 * Em `npm run dev` roda pelo plugin `vite-plugins/dev-api.ts`.
 */

interface ReqLike {
  method?: string;
}
interface ResLike {
  status: (code: number) => ResLike;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export type CondicaoClima =
  | 'limpo' | 'poucas_nuvens' | 'nublado' | 'neblina'
  | 'garoa' | 'chuva' | 'chuva_forte' | 'tempestade';

export interface ClimaAgora {
  temp: number;
  sensacao: number;
  condicao: CondicaoClima;
  noite: boolean;
  /** Umidade relativa, %. */
  umidade: number | null;
  /** Vento, km/h. */
  vento: number | null;
}

export interface ClimaDia {
  /** YYYY-MM-DD, no horário de Brasília. */
  data: string;
  condicao: CondicaoClima;
  max: number;
  min: number;
  /** Chuva prevista no dia, mm. */
  chuvaMm: number;
}

export interface Previsao {
  agora: ClimaAgora;
  dias: ClimaDia[];
}

export type CidadeClima = 'birigui' | 'marilia';

export interface RespostaClima {
  fonte: 'MET Norway';
  geradoEm: string;
  cidades: Record<CidadeClima, Previsao | null>;
}

/** As coordenadas do centro de cada cidade (o MET aceita até 4 casas). */
export const COORDENADAS: Record<CidadeClima, { lat: number; lon: number }> = {
  birigui: { lat: -21.2889, lon: -50.34 },
  marilia: { lat: -22.2139, lon: -49.9458 },
};

const URL_MET = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
/** O MET recusa pedido sem identificação. Nome do sistema e o site, sem e-mail. */
const USER_AGENT = 'GestaoDeAcordos/1.0 https://gestaodeacordos.com.br';
/** Hoje + cinco. */
const DIAS = 6;
/** Brasília não tem horário de verão desde 2019: UTC-3 o ano todo. */
const FUSO_MS = -3 * 60 * 60 * 1000;

// ── O MET em tipos (só o que é lido) ─────────────────────────────────────────

interface PeriodoMet {
  summary?: { symbol_code?: string };
  details?: { precipitation_amount?: number; air_temperature_max?: number; air_temperature_min?: number };
}
interface PassoMet {
  time: string;
  data: {
    instant: { details: {
      air_temperature?: number;
      apparent_air_temperature?: number;
      relative_humidity?: number;
      wind_speed?: number;
    } };
    next_1_hours?: PeriodoMet;
    next_6_hours?: PeriodoMet;
  };
}
export interface RespostaMet {
  properties: { timeseries: PassoMet[] };
}

// ── Tradução ─────────────────────────────────────────────────────────────────

/** Da mais calma à mais forte: o dia mostra a pior que aparece nele. */
const PESO: Record<CondicaoClima, number> = {
  limpo: 0, poucas_nuvens: 1, nublado: 2, neblina: 3, garoa: 4, chuva: 5, chuva_forte: 6, tempestade: 7,
};

const CHUVOSAS: ReadonlySet<CondicaoClima> = new Set(['garoa', 'chuva', 'chuva_forte']);

/**
 * O `symbol_code` do MET (`partlycloudy_day`, `heavyrainshowers_night`,
 * `lightrainandthunder`…) no vocabulário do app. Neve e granizo, que não caem
 * por aqui, viram chuva.
 */
export function condicaoDoSimbolo(simbolo: string | undefined): CondicaoClima {
  const s = (simbolo ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 'tempestade';
  if (s.startsWith('heavy')) return 'chuva_forte';
  if (/rain|sleet|snow/.test(s)) return s.startsWith('light') ? 'garoa' : 'chuva';
  if (s === 'fog') return 'neblina';
  if (s === 'cloudy') return 'nublado';
  if (s === 'partlycloudy' || s === 'fair') return 'poucas_nuvens';
  return 'limpo';
}

function diaLocal(ms: number): string {
  return new Date(ms + FUSO_MS).toISOString().slice(0, 10);
}
function horaLocal(ms: number): number {
  return new Date(ms + FUSO_MS).getUTCHours();
}

function redondo(n: number): number {
  return Math.round(n);
}

/**
 * Do MET para a `Previsao` do app.
 *
 * Os passos vêm de hora em hora nos primeiros dias e de seis em seis depois.
 * Cada passo cobre o período seguinte (`next_1_hours`, senão `next_6_hours`),
 * e um período só entra uma vez — o de seis horas de um passo horário já está
 * contado nas horas dele. Máxima e mínima saem das temperaturas do dia (a do
 * instante e as de seis horas); a condição do dia é a mais forte que aparece,
 * mas chuva de menos de 1 mm no dia não pinta o dia de chuvoso.
 *
 * O dia de hoje só tem o que falta dele: o MET começa na hora corrente.
 */
export function previsaoDoMet(met: RespostaMet, agoraMs: number): Previsao | null {
  const passos = (met?.properties?.timeseries ?? [])
    .map(p => ({ p, ms: Date.parse(p.time) }))
    .filter(x => Number.isFinite(x.ms))
    .sort((a, b) => a.ms - b.ms);
  if (passos.length === 0) return null;

  // O agora: o passo da hora corrente (o último que já começou), ou o primeiro.
  const atual = [...passos].reverse().find(x => x.ms <= agoraMs) ?? passos[0];
  const inst = atual.p.data.instant.details;
  if (typeof inst.air_temperature !== 'number') return null;
  const simboloAgora = atual.p.data.next_1_hours?.summary?.symbol_code
    ?? atual.p.data.next_6_hours?.summary?.symbol_code;
  const hora = horaLocal(atual.ms);
  // O símbolo diz se é noite (`_night`); os sem sufixo (nublado, chuva…), a hora.
  let noite = hora < 6 || hora >= 18;
  if (simboloAgora?.endsWith('_night')) noite = true;
  else if (simboloAgora?.endsWith('_day')) noite = false;

  const agora: ClimaAgora = {
    temp: redondo(inst.air_temperature),
    sensacao: redondo(inst.apparent_air_temperature ?? inst.air_temperature),
    condicao: condicaoDoSimbolo(simboloAgora),
    noite,
    umidade: typeof inst.relative_humidity === 'number' ? redondo(inst.relative_humidity) : null,
    vento: typeof inst.wind_speed === 'number' ? redondo(inst.wind_speed * 3.6) : null,
  };

  // Os dias.
  const porDia = new Map<string, { max: number; min: number; chuva: number; condicoes: CondicaoClima[] }>();
  const doDia = (iso: string) => {
    let d = porDia.get(iso);
    if (!d) { d = { max: -Infinity, min: Infinity, chuva: 0, condicoes: [] }; porDia.set(iso, d); }
    return d;
  };
  let cobertoAte = -Infinity;
  for (const { p, ms } of passos) {
    const d = doDia(diaLocal(ms));
    const t = p.data.instant.details.air_temperature;
    if (typeof t === 'number') { d.max = Math.max(d.max, t); d.min = Math.min(d.min, t); }
    const seis = p.data.next_6_hours?.details;
    if (typeof seis?.air_temperature_max === 'number') d.max = Math.max(d.max, seis.air_temperature_max);
    if (typeof seis?.air_temperature_min === 'number') d.min = Math.min(d.min, seis.air_temperature_min);

    if (ms < cobertoAte) continue;
    const umaHora = p.data.next_1_hours;
    const periodo = umaHora ?? p.data.next_6_hours;
    if (!periodo) continue;
    cobertoAte = ms + (umaHora ? 1 : 6) * 60 * 60 * 1000;
    d.chuva += periodo.details?.precipitation_amount ?? 0;
    d.condicoes.push(condicaoDoSimbolo(periodo.summary?.symbol_code));
  }

  const dias: ClimaDia[] = [...porDia.entries()]
    .filter(([iso, d]) => iso >= diaLocal(agoraMs) && Number.isFinite(d.max) && d.condicoes.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, DIAS)
    .map(([data, d]) => {
      const pouca = d.chuva < 1;
      const contam = d.condicoes.filter(c => !(pouca && CHUVOSAS.has(c)));
      const condicao = (contam.length ? contam : ['nublado' as const])
        .reduce((a, b) => (PESO[b] > PESO[a] ? b : a));
      return { data, condicao, max: redondo(d.max), min: redondo(d.min), chuvaMm: Math.round(d.chuva * 10) / 10 };
    });

  return { agora, dias };
}

async function buscarCidade(cidade: CidadeClima): Promise<RespostaMet> {
  const { lat, lon } = COORDENADAS[cidade];
  const r = await fetch(`${URL_MET}?lat=${lat}&lon=${lon}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`MET ${r.status}`);
  return (await r.json()) as RespostaMet;
}

export default async function handler(req: ReqLike, res: ResLike): Promise<void> {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Use GET.' });
    return;
  }

  const agoraMs = Date.now();
  const cidades: CidadeClima[] = ['birigui', 'marilia'];
  const lidas = await Promise.allSettled(cidades.map(buscarCidade));
  const resultado = {} as Record<CidadeClima, Previsao | null>;
  cidades.forEach((c, i) => {
    const l = lidas[i];
    resultado[c] = l.status === 'fulfilled' ? previsaoDoMet(l.value, agoraMs) : null;
  });

  if (!resultado.birigui && !resultado.marilia) {
    // Sem guardar a falha: a CDN segue com a última boa e tenta de novo.
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Previsão indisponível agora.' });
    return;
  }

  // Uma cidade falhou: guarda pouco, para tentar de novo logo.
  const completa = Boolean(resultado.birigui && resultado.marilia);
  res.setHeader(
    'Cache-Control',
    completa
      ? 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600'
      : 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600',
  );
  const corpo: RespostaClima = { fonte: 'MET Norway', geradoEm: new Date(agoraMs).toISOString(), cidades: resultado };
  res.status(200).json(corpo);
}
