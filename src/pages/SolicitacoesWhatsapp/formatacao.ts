/**
 * formatacao.ts — helpers de exibição da aba de Solicitações de WhatsApp.
 *
 * Vivem fora dos arquivos de componente porque são usados por mais de um deles
 * (o chat e o card), e misturar export de função com export de componente
 * quebra o fast refresh do Vite.
 */

/** "Maria Aparecida da Silva" → "Maria". O chat trata as pessoas pelo 1º nome. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Usuário';
}

/** Iniciais para o avatar sem foto: "Ana Paula" → "AP". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

// ── Tempo de espera ──────────────────────────────────────────────────────────

/** A partir daqui o card fica âmbar. */
export const ESPERA_ATENCAO = 2 * 3_600_000;        // 2 horas
/** A partir daqui fica vermelho. */
export const ESPERA_CRITICA = 24 * 3_600_000;       // 1 dia

export type NivelEspera = 'normal' | 'atencao' | 'critico';

/** Só o que o cálculo precisa — aceita a solicitação inteira sem exigir o tipo. */
interface Esperavel {
  status:        string;
  criado_em:     string;
  finalizado_em: string | null;
  atualizado_em?: string;
}

/**
 * Há quanto tempo o pedido espera, em ms.
 *
 * O relógio corre desde a abertura e **só para quando o pedido é marcado feito**
 * — decisão do usuário: um chamado assumido rápido mas parado há três dias
 * precisa continuar acendendo o alarme. `em_andamento` e `falta_info` seguem
 * contando.
 *
 * `feito` sem carimbo `finalizado_em` (dado antigo) cai em `atualizado_em`; sem
 * nenhum dos dois o número congelaria em "agora" e cresceria para sempre.
 */
export function esperaMs(s: Esperavel, agora: number): number {
  const inicio = new Date(s.criado_em).getTime();
  if (!Number.isFinite(inicio)) return 0;

  let fim = agora;
  if (s.status === 'feito') {
    const carimbo = s.finalizado_em ?? s.atualizado_em ?? null;
    const t = carimbo ? new Date(carimbo).getTime() : NaN;
    if (Number.isFinite(t)) fim = t;
  }
  return Math.max(0, fim - inicio);
}

/** "45m", "01:30h", "2d 05h". Abaixo de um minuto vira "<1m". */
export function formatarEspera(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1)  return '<1m';
  if (min < 60) return `${min}m`;

  const horas = Math.floor(min / 60);
  if (horas < 24) {
    return `${String(horas).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}h`;
  }
  return `${Math.floor(horas / 24)}d ${String(horas % 24).padStart(2, '0')}h`;
}

export function nivelEspera(ms: number): NivelEspera {
  if (ms >= ESPERA_CRITICA) return 'critico';
  if (ms >= ESPERA_ATENCAO) return 'atencao';
  return 'normal';
}

// ── Busca ────────────────────────────────────────────────────────────────────

/** Marcas de acento que o NFD separa da letra base (U+0300–U+036F). */
const ACENTOS = new RegExp('[\u0300-\u036f]', 'g');

function semAcento(v: string): string {
  return v.normalize('NFD').replace(ACENTOS, '').toLowerCase();
}
function soDigitos(v: string): string {
  return v.replace(/\D/g, '');
}

/** Só os campos que a busca varre. */
interface Buscavel {
  codigo_cliente: string;
  nome_cliente:   string | null;
  whatsapp:       string;
}

/**
 * O pedido combina com o que foi digitado? Varre código, nome e WhatsApp.
 *
 * Texto ignora acento e caixa. Quando o termo tem dígitos, código e telefone são
 * comparados **sem máscara** dos dois lados — quem digita "99390-8420" ou
 * "(83) 99390" acha o mesmo cadastro guardado como "83993908420". Os dois campos
 * são testados separados para o fim de um não emendar no começo do outro.
 */
export function combinaBusca(s: Buscavel, termo: string): boolean {
  const t = semAcento(termo.trim());
  if (!t) return true;

  const alvo = semAcento(`${s.codigo_cliente} ${s.nome_cliente ?? ''} ${s.whatsapp}`);
  if (alvo.includes(t)) return true;

  const digitos = soDigitos(t);
  if (!digitos) return false;
  return soDigitos(s.codigo_cliente).includes(digitos)
      || soDigitos(s.whatsapp).includes(digitos);
}
