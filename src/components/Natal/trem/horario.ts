/**
 * O horário do trenzinho — onde ele está agora, o mesmo para todo mundo.
 *
 * Como a música do Natal (`musica.ts`), o trem não guarda estado nem conversa
 * com ninguém: a posição sai do relógio. Uma volta completa é sempre igual:
 *
 *   estação (Dashboard, embarque) → ida pelas abas → fim da linha (Analítico)
 *   → volta pelas mesmas abas → estação de novo
 *
 * e as voltas se repetem a partir da hora em que a estação abre. Cada volta é
 * uma viagem, com os seus cinco passageiros sorteados (`passageiros.ts`).
 *
 * Quando roda vem da agenda (`agenda.ts`, Cleber, 04/11/2026): ligado ou
 * desligado, o horário (8h às 17h, em Brasília) e a primeira viagem, que
 * espera os cinco primeiros da fila. A volta que começou antes do fechamento
 * vai até o fim; depois o trem fica fechado na estação. Parado, `ondeEsta`
 * devolve a estação com `fechado` dizendo o porquê.
 *
 * O percurso é UM SÓ para todo mundo (`ROTA_DO_TREM`, Cleber, 05/11/2026:
 * mesmo tempo e mesmo sorteio para todos): quem chama estas funções passa
 * sempre ele. A regra do setor só decide em que abas cada um VÊ o trem
 * (`abasDaRegra`): quem é Cofen não vê Acordos nem Pix — nesse trecho o trem
 * está «no túnel» para ele, no mesmo relógio.
 *
 * O tempo é fixo em segundos, e não em pixels: cada pista da aba leva
 * `SEGUNDOS_POR_PISTA`, em qualquer tela — o trem entra e sai das abas no
 * mesmo instante para todo mundo (numa tela mais larga ele anda um tico mais
 * rápido). Entre uma aba e a outra, `FOLGA_ENTRE_ABAS_S` fora da tela.
 */
import { AGENDA_LIVRE, type AgendaDoTrem } from './agenda';
import { PISTAS_DA_ABA, type AbaDoTrem } from './rota';

export { ROTULO_ABA, ROTA_DO_TREM, abasDaRegra, type AbaDoTrem } from './rota';

/**
 * O botão de velocidade: 1 é o ritmo de partida; 1,5 deixa tudo uma vez e
 * meia mais rápido. Os tempos abaixo são divididos por ele.
 */
export const VELOCIDADE = 1;

/** Quanto o trem leva para cruzar uma pista, de fora a fora da tela (≈ 65 px/s numa tela de 1.200 px). */
export const SEGUNDOS_POR_PISTA = 24 / VELOCIDADE;
/** Fora da tela, entre uma aba e a outra (e o tempo das rampas de saída e chegada). */
const FOLGA_ENTRE_ABAS_S = 4 / VELOCIDADE;
/** Parado na estação: o sorteio, um passageiro de cada vez (`EMBARQUES`). */
export const PARADA_ESTACAO_S = 40 / VELOCIDADE;
/** Parado no fim da linha, virando para voltar. */
export const PARADA_FIM_S = 10 / VELOCIDADE;

/** A janela de cada aba, por trecho (ida ou volta): as pistas dela e a folga. */
export const tempoNaAba = (aba: AbaDoTrem) => PISTAS_DA_ABA[aba].length * SEGUNDOS_POR_PISTA + FOLGA_ENTRE_ABAS_S;

/** Uma volta inteira, em segundos. */
export function duracaoDaVolta(rota: readonly AbaDoTrem[]): number {
  const trechos = rota.reduce((s, aba) => s + tempoNaAba(aba), 0);
  return PARADA_ESTACAO_S + 2 * trechos + PARADA_FIM_S;
}

export type FaseDoTrem = 'estacao' | 'ida' | 'fim' | 'volta';

/** Por que o trem está parado na estação. */
export interface TremFechado {
  /** `carregando`: a agenda ainda não chegou; `esperando`: faltam os cinco primeiros da fila. */
  motivo: 'carregando' | 'desligado' | 'esperando' | 'fechado';
  /** Fechado pelo horário: quando a estação abre (ms). */
  abreEmMs: number | null;
}

export interface PosicaoDoTrem {
  /** A viagem do dia, a partir de 0 (a primeira volta depois de abrir). */
  viagem: number;
  /** Quando esta viagem sai (ou saiu) da estação (ms). Parado, 0. */
  partidaMs: number;
  /** Parado na estação fora do horário, desligado ou esperando a fila; rodando, `null`. */
  fechado: TremFechado | null;
  fase: FaseDoTrem;
  /** Onde ele está. Na estação, o Dashboard; no fim da linha, a última aba. */
  aba: AbaDoTrem;
  /**
   * 0 a 1 ao longo do trilho DA ABA, sempre no sentido da ida (0 = onde a ida
   * entra na aba, 1 = onde ela sai). Na volta ele vai de 1 a 0.
   */
  progresso: number;
  /** Segundos desde que esta fase (ou este trecho de aba) começou. */
  noTrecho: number;
  /** Quanto dura esta fase (ou este trecho de aba). */
  duracaoDoTrecho: number;
  /** Primeira aba da ida (o trem sai parado) ou última da volta (chega parando). */
  partindo: boolean;
  chegando: boolean;
}

/** `t` em segundos dentro da volta (0 ≤ t < duração). */
function naVolta(t: number, rota: readonly AbaDoTrem[]): Omit<PosicaoDoTrem, 'viagem' | 'partidaMs' | 'fechado'> {
  const n = rota.length;
  if (t < PARADA_ESTACAO_S) {
    return { fase: 'estacao', aba: rota[0], progresso: 0, noTrecho: t, duracaoDoTrecho: PARADA_ESTACAO_S, partindo: false, chegando: false };
  }
  let resto = t - PARADA_ESTACAO_S;
  for (let i = 0; i < n; i++) {
    const d = tempoNaAba(rota[i]);
    if (resto < d) {
      return { fase: 'ida', aba: rota[i], progresso: resto / d, noTrecho: resto, duracaoDoTrecho: d, partindo: i === 0, chegando: i === n - 1 };
    }
    resto -= d;
  }
  if (resto < PARADA_FIM_S) {
    return { fase: 'fim', aba: rota[n - 1], progresso: 1, noTrecho: resto, duracaoDoTrecho: PARADA_FIM_S, partindo: false, chegando: false };
  }
  resto -= PARADA_FIM_S;
  for (let i = n - 1; i >= 0; i--) {
    const d = tempoNaAba(rota[i]);
    if (resto < d || i === 0) {
      const r = Math.min(resto, d);
      return { fase: 'volta', aba: rota[i], progresso: 1 - r / d, noTrecho: r, duracaoDoTrecho: d, partindo: i === n - 1, chegando: i === 0 };
    }
    resto -= d;
  }
  /* inalcançável: o laço de cima sempre devolve no i = 0 */
  return { fase: 'estacao', aba: rota[0], progresso: 0, noTrecho: 0, duracaoDoTrecho: PARADA_ESTACAO_S, partindo: false, chegando: false };
}

const BRASILIA_MS = 3 * 3_600_000;
const DIA_MS = 86_400_000;
/** A meia-noite de Brasília do dia de `ms` (sem horário de verão desde 2019). */
const meiaNoite = (ms: number) => Math.floor((ms - BRASILIA_MS) / DIA_MS) * DIA_MS + BRASILIA_MS;

type Ciclo =
  | { rodando: true; inicioDaVolta: number; viagem: number; fechaMs: number; amanhaMs: number }
  | { rodando: false; fechado: TremFechado };

/**
 * A volta de agora pela agenda: as voltas começam em `max(abertura, início)`,
 * uma atrás da outra, e só começa volta antes do fechamento.
 */
function cicloDoDia(agoraMs: number, rota: readonly AbaDoTrem[], agenda: AgendaDoTrem | null): Ciclo {
  if (!agenda) return { rodando: false, fechado: { motivo: 'carregando', abreEmMs: null } };
  if (!agenda.ativo) return { rodando: false, fechado: { motivo: 'desligado', abreEmMs: null } };
  if (agenda.inicioMs === null) return { rodando: false, fechado: { motivo: 'esperando', abreEmMs: null } };
  const volta = duracaoDaVolta(rota) * 1000;
  const dia = meiaNoite(agoraMs);
  const abre = dia + agenda.abreMin * 60_000;
  const fecha = dia + agenda.fechaMin * 60_000;
  const amanha = dia + DIA_MS + agenda.abreMin * 60_000;
  const comeco = Math.max(abre, agenda.inicioMs);
  if (agoraMs < comeco) return { rodando: false, fechado: { motivo: 'fechado', abreEmMs: comeco } };
  const viagem = Math.floor((agoraMs - comeco) / volta);
  const inicioDaVolta = comeco + viagem * volta;
  if (inicioDaVolta >= fecha) return { rodando: false, fechado: { motivo: 'fechado', abreEmMs: amanha } };
  return { rodando: true, inicioDaVolta, viagem, fechaMs: fecha, amanhaMs: amanha };
}

export function ondeEsta(agoraMs: number, rota: readonly AbaDoTrem[], agenda: AgendaDoTrem | null = AGENDA_LIVRE): PosicaoDoTrem {
  const c = cicloDoDia(agoraMs, rota, agenda);
  if ('fechado' in c) {
    return {
      viagem: -1, partidaMs: 0, fechado: c.fechado,
      fase: 'estacao', aba: rota[0], progresso: 0, noTrecho: 0, duracaoDoTrecho: PARADA_ESTACAO_S, partindo: false, chegando: false,
    };
  }
  return {
    viagem: c.viagem,
    partidaMs: c.inicioDaVolta + PARADA_ESTACAO_S * 1000,
    fechado: null,
    ...naVolta((agoraMs - c.inicioDaVolta) / 1000, rota),
  };
}

/**
 * Quando (ms) começa a próxima volta — o trem chegando à estação para o
 * sorteio. Fechado pelo horário, a abertura; desligado ou esperando a fila, `null`.
 */
export function proximaVoltaEm(agoraMs: number, rota: readonly AbaDoTrem[], agenda: AgendaDoTrem | null = AGENDA_LIVRE): number | null {
  const c = cicloDoDia(agoraMs, rota, agenda);
  if ('fechado' in c) return c.fechado.abreEmMs;
  const proxima = c.inicioDaVolta + duracaoDaVolta(rota) * 1000;
  return proxima < c.fechaMs ? proxima : c.amanhaMs;
}

/** Quanto falta (s) para o trem estar de volta à estação (começo da próxima volta); `null` se não há próxima. */
export function segundosAteAEstacao(agoraMs: number, rota: readonly AbaDoTrem[], agenda: AgendaDoTrem | null = AGENDA_LIVRE): number | null {
  const em = proximaVoltaEm(agoraMs, rota, agenda);
  return em === null ? null : Math.max(0, (em - agoraMs) / 1000);
}

/*
 * O sorteio na estação, de surpresa, um de cada vez: o passageiro `i` começa a
 * ser sorteado em `SORTEIO_INICIO_S + i * SORTEIO_PASSO_S` segundos depois de o
 * trem parar, aparece `SORTEANDO_S` depois e embarca `REVELADO_S` depois disso.
 * O último embarca a 3 s da partida.
 */
export const SORTEIO_INICIO_S = 4;
export const SORTEIO_PASSO_S = 7;
export const SORTEANDO_S = 2.5;
export const REVELADO_S = 2.5;

/** Em que pé está o sorteio, `t` segundos depois de o trem parar, com `n` sorteados. */
export function etapaDoSorteio(t: number, n: number): { indice: number; etapa: 'sorteando' | 'revelado' } | null {
  const i = Math.floor((t - SORTEIO_INICIO_S) / SORTEIO_PASSO_S);
  if (i < 0 || i >= n) return null;
  const dentro = t - SORTEIO_INICIO_S - i * SORTEIO_PASSO_S;
  if (dentro < SORTEANDO_S) return { indice: i, etapa: 'sorteando' };
  if (dentro < SORTEANDO_S + REVELADO_S) return { indice: i, etapa: 'revelado' };
  return null;
}

/** Quantos já embarcaram, `t` segundos depois de o trem parar na estação. */
export const quantosABordo = (t: number, n = 5) =>
  Math.max(0, Math.min(n, Math.floor((t - SORTEIO_INICIO_S - SORTEANDO_S - REVELADO_S) / SORTEIO_PASSO_S) + 1));

/** «m:ss». */
export const relogioCurto = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * A chave do sorteio de uma viagem: o minuto da partida. Não depende da
 * velocidade nem das abas, então o banco confere sem saber do horário
 * (`fn_natal_trem_passageiros` só aceita minutos perto de agora). Parado, `null`.
 */
export const chaveDoSorteio = (pos: PosicaoDoTrem): number | null =>
  pos.fechado ? null : Math.floor(pos.partidaMs / 60_000);

/**
 * Quanto falta (s) para o trem ENTRAR na aba `aba`, a partir de agora. `0`
 * se ele já está nela. `null` se a aba não está na rota.
 */
export function chegaNaAbaEm(agoraMs: number, rota: readonly AbaDoTrem[], aba: AbaDoTrem, agenda: AgendaDoTrem | null = AGENDA_LIVRE): number | null {
  if (!rota.includes(aba)) return null;
  const agora = ondeEsta(agoraMs, rota, agenda);
  // Parado (fechado, desligado, esperando a fila): não chega em lugar nenhum por ora.
  if (agora.fechado) return null;
  if (agora.aba === aba) return 0;
  // Anda de segundo em segundo até a próxima entrada: a volta tem poucos
  // minutos, e isto roda uma vez por segundo, não por quadro.
  const volta = duracaoDaVolta(rota);
  for (let s = 1; s <= volta; s++) {
    const p = ondeEsta(agoraMs + s * 1000, rota, agenda);
    if (p.fechado) return null;
    if (p.aba === aba) return s;
  }
  return null;
}
