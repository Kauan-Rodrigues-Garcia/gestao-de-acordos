/**
 * A agenda do trenzinho (Cleber, 04/11/2026): quando ele roda e quando fica
 * fechado na estação.
 *
 *   - ligado ou desligado — desligado, o trem fica na estação «em manutenção»;
 *   - o horário — das 8h às 17h, em Brasília. Passou das 17h, a viagem que
 *     estiver acontecendo termina, e o trem fica fechado com a placa «abre às
 *     8:00»;
 *   - a primeira viagem — o trem só sai pela primeira vez quando os cinco
 *     primeiros entram na fila, e leva esses cinco. Daí em diante segue o
 *     ciclo todo dia. `inicioMs` é quando o quinto entrou.
 *
 * Mora no banco (migration 20261104200100, `fn_natal_trem_estado`), igual para
 * todo mundo, e é relida a cada `RELEITURA_MS` — o horário em si sai do
 * relógio (`horario.ts`), como sempre.
 *
 * Só relê com alguém olhando (`lib/atencao.ts`, auditoria de RAM de
 * 09/11/2026: eram 22 mil leituras por dia, a maioria de abas escondidas ou
 * de janela atrás do ERP). Quem volta a olhar com a agenda vencida relê na
 * hora; de lado, a volta forçada de 5 min também põe em dia.
 *
 * Só no `npm run dev`, sem a função no banco, vale `AGENDA_DO_DEV`: o que o
 * painel de Configurações gravou neste navegador, ou o trem rodando o dia
 * inteiro.
 */
import { useSyncExternalStore } from 'react';
import { ninguemOlhando, ouvirVolta } from '@/lib/atencao';
import { rpcSemTipo } from '@/lib/supabaseSemTipo';
import { EPOCA } from '../musica';

/** Quantas pessoas a primeira viagem espera na fila. */
export const PRIMEIROS_DA_FILA = 5;

export interface AgendaDoTrem {
  ativo: boolean;
  /** Minutos desde a meia-noite de Brasília. */
  abreMin: number;
  fechaMin: number;
  /** Quando o quinto da fila entrou (ms); `null`: o trem ainda espera os cinco primeiros. */
  inicioMs: number | null;
  /** Quantos estão na fila — uma só, de todo mundo (um trem só para o sistema inteiro). */
  inscritos: number;
}

/** O dev sem banco, e o laboratório: rodando o dia inteiro, desde sempre. */
export const AGENDA_LIVRE: AgendaDoTrem = { ativo: true, abreMin: 0, fechaMin: 24 * 60, inicioMs: EPOCA, inscritos: PRIMEIROS_DA_FILA };

const RELEITURA_MS = 60_000;
const CHAVE_DEV = 'natal:trem:agenda-dev';

const semFuncao = (msg: string) => /fn_natal_trem|could not find|does not exist/i.test(msg);

/** «08:00» → 480. */
export const minutosDe = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
/** 480 → «08:00». */
export const horaDe = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// ── O dev sem banco ──────────────────────────────────────────────────────────

function lerDoDev(): AgendaDoTrem {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_DEV) ?? 'null') as Partial<AgendaDoTrem> | null;
    return v ? { ...AGENDA_LIVRE, ...v } : AGENDA_LIVRE;
  } catch { return AGENDA_LIVRE; }
}

// ── A loja ───────────────────────────────────────────────────────────────────

let agenda: AgendaDoTrem | null = null;
let doDev = false;
/** O laboratório mandou: não relê do banco. */
let fixada = false;
let relogio = 0;
let pararVolta: () => void = () => {};
/** Quando a última leitura começou (a volta não relê o que acabou de chegar). */
let lidaEm = 0;
let pedindo: Promise<void> | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => { for (const f of ouvintes) f(); };

interface EstadoDoBanco { ativo: boolean; abre: string; fecha: string; inicio: string | null; inscritos: number }

/** Relê a agenda agora (depois de entrar na fila, ou de salvar nas Configurações). */
export function recarregarAgenda(): Promise<void> {
  if (fixada) return Promise.resolve();
  pedindo ??= (async (): Promise<void> => {
    lidaEm = Date.now();
    try {
      const { data, error } = await rpcSemTipo<EstadoDoBanco>('fn_natal_trem_estado', {});
      if (error) {
        if (import.meta.env.DEV && semFuncao(error.message)) { doDev = true; agenda = lerDoDev(); }
        else console.warn('[trem de Natal] agenda:', error.message);
        return;
      }
      if (!data) return;
      agenda = {
        ativo: data.ativo,
        abreMin: minutosDe(data.abre),
        fechaMin: minutosDe(data.fecha),
        inicioMs: data.inicio ? Date.parse(data.inicio) : null,
        inscritos: data.inscritos ?? 0,
      };
    } finally {
      pedindo = null;
      avisar();
    }
  })();
  return pedindo;
}

/** A leitura venceu? Folga de 1 s: o relógio de 60 s não perde a vez por milissegundos. */
const vencida = () => Date.now() - lidaEm >= RELEITURA_MS - 1_000;

/** A volta do relógio: só com alguém olhando. Ninguém olhando, fica devendo. */
export function relerNoRelogio(): void {
  if (ninguemOlhando() || !vencida()) return;
  void recarregarAgenda();
}

/**
 * A volta da pessoa (`ouvirVolta`): paga o que ficou devendo. Sem perguntar
 * pela atenção de propósito — de lado, a revisita de 5 min chega com ninguém
 * olhando, e é ela que mantém a tela do monitor do lado em dia.
 */
export function relerNaVolta(): void {
  if (!vencida()) return;
  void recarregarAgenda();
}

function assinar(f: () => void) {
  ouvintes.add(f);
  if (ouvintes.size === 1) {
    void recarregarAgenda();
    relogio = window.setInterval(relerNoRelogio, RELEITURA_MS);
    pararVolta = ouvirVolta(relerNaVolta);
  }
  return () => {
    ouvintes.delete(f);
    if (ouvintes.size === 0) {
      window.clearInterval(relogio);
      pararVolta();
      pararVolta = () => {};
    }
  };
}

/** A agenda de agora (`null` enquanto a primeira leitura não chegou). */
export function useAgendaDoTrem(): AgendaDoTrem | null {
  return useSyncExternalStore(assinar, agendaAgora, (): AgendaDoTrem | null => null);
}

/** Fora do React (o laço de quadros da camada). */
export function agendaAgora(): AgendaDoTrem | null { return agenda; }

/** O dev sem a função no banco está usando a agenda deste navegador. */
export const agendaEhDoDev = () => doDev;

/** Só no dev sem banco: grava a agenda deste navegador (o painel de Configurações usa). */
export function gravarAgendaDoDev(parcial: Partial<AgendaDoTrem>) {
  if (!import.meta.env.DEV) return;
  agenda = { ...(agenda ?? lerDoDev()), ...parcial };
  try { localStorage.setItem(CHAVE_DEV, JSON.stringify(agenda)); } catch { /* modo privado */ }
  avisar();
}

/** Só o laboratório (`lab-trem.html`, sem banco): a agenda que ele mandar. */
export function definirAgendaParaLaboratorio(a: AgendaDoTrem) {
  fixada = true;
  agenda = a;
  avisar();
}
