/**
 * afastamento.ts — os motivos e as contas do «Afastar…» da aba Usuários, sem rede.
 *
 * Os tipos são os de `ausencias_tipos` (lib/ausencias.ts). Aqui fica só o que é
 * da aba Usuários: QUAIS deles aparecem, em que ordem, e se «tirar dos
 * rankings e quartis» nasce ligado — nasce em todos (Cleber, 28/10/2026); quem
 * lança pode desligar. Tirar dos rankings e quartis NÃO tira o dinheiro: o
 * recebimento segue na equipe cadastrada e no setor. Falta, abono e declaração continuam no banco para o Comercial,
 * mas são de um dia só — não são afastamento.
 *
 * As travas repetem as de `fn_usuarios_afastar` para avisar antes de mandar;
 * quem recusa de verdade é o banco.
 */
import { rotuloDoTipo } from '@/lib/ausencias';

export interface MotivoDeAfastamento {
  tipo: string;
  rotulo: string;
  /** Como «tirar dos rankings e quartis» nasce quando o motivo é escolhido. */
  foraPadrao: boolean;
  /** Férias sempre tiram dos rankings e quartis — o interruptor fica travado. */
  foraTravado?: boolean;
  /** Férias precisam de data de volta (regra de 01/09/2026). */
  exigeVolta?: boolean;
}

export const MOTIVOS_DE_AFASTAMENTO: readonly MotivoDeAfastamento[] = [
  { tipo: 'ferias',              rotulo: 'Férias',              foraPadrao: true,  foraTravado: true, exigeVolta: true },
  { tipo: 'atestado',            rotulo: 'Atestado',            foraPadrao: true },
  { tipo: 'licenca_maternidade', rotulo: 'Licença-maternidade', foraPadrao: true },
  { tipo: 'licenca_paternidade', rotulo: 'Licença-paternidade', foraPadrao: true },
  { tipo: 'inss',                rotulo: 'INSS',                foraPadrao: true },
  { tipo: 'licenca',             rotulo: 'Licença (luto, casamento)', foraPadrao: true },
  { tipo: 'banco_de_horas',      rotulo: 'Banco de horas',      foraPadrao: true },
  { tipo: 'suspensao',           rotulo: 'Suspensão',           foraPadrao: true },
  { tipo: 'outros',              rotulo: 'Outro motivo',        foraPadrao: true },
] as const;

export function motivoDoTipo(tipo: string): MotivoDeAfastamento | undefined {
  return MOTIVOS_DE_AFASTAMENTO.find(m => m.tipo === tipo);
}

export interface RascunhoAfastamento {
  tipo: string;
  /** `yyyy-MM-dd`. */
  inicio: string;
  /** `yyyy-MM-dd`. Ignorado quando `semVolta`. */
  fim: string;
  semVolta: boolean;
  foraDasContas: boolean;
  observacao: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** O que está errado no formulário, com a frase do banco — ou `null`. */
export function validarAfastamento(r: RascunhoAfastamento, hoje: string): string | null {
  const motivo = motivoDoTipo(r.tipo);
  if (!motivo) return 'Escolha o motivo do afastamento.';
  if (!ISO.test(r.inicio)) return 'Informe o primeiro dia do afastamento.';
  if (r.semVolta && motivo.exigeVolta) return 'Férias precisam de data de volta.';
  if (!r.semVolta) {
    if (!ISO.test(r.fim)) return 'Informe o último dia, ou marque «tempo indeterminado».';
    if (r.fim < r.inicio) return 'O último dia é anterior ao primeiro.';
    if (r.fim < hoje) return 'Este período já terminou. Afastamento é para hoje ou para a frente.';
  }
  if (r.tipo === 'outros' && r.observacao.trim() === '') return 'Em «Outro motivo», escreva qual é.';
  if (r.observacao.trim().length > 500) return 'O motivo passou de 500 caracteres.';
  return null;
}

/** «Tirar dos rankings e quartis» que vai para o banco: férias é sempre sim. */
export function foraDasContasEfetivo(r: Pick<RascunhoAfastamento, 'tipo' | 'foraDasContas'>): boolean {
  return motivoDoTipo(r.tipo)?.foraTravado ? true : r.foraDasContas;
}

function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * A frase da etiqueta: «Atestado até 05/11», «INSS · sem data de volta»,
 * «Férias a partir de 03/11». Rótulo do motivo da aba (com «Outro motivo»
 * trocado pelo texto que a pessoa escreveu, quando cabe).
 */
export function rotuloDoAfastamento(
  a: { tipo: string; inicio: string; fim: string | null; observacao?: string | null },
  hoje: string,
): string {
  const nome = a.tipo === 'outros' && a.observacao?.trim()
    ? a.observacao.trim().slice(0, 40)
    : motivoDoTipo(a.tipo)?.rotulo ?? rotuloDoTipo(a.tipo);
  if (a.inicio > hoje) return `${nome} a partir de ${diaMes(a.inicio)}`;
  return a.fim ? `${nome} até ${diaMes(a.fim)}` : `${nome} · sem data de volta`;
}

/** O afastamento que vale hoje ou o próximo, de uma lista da pessoa. */
export function afastamentoDaVez<T extends { inicio: string; fim: string | null }>(
  lista: readonly T[],
  hoje: string,
): T | null {
  const vivos = lista
    .filter(a => a.fim === null || a.fim >= hoje)
    .sort((x, y) => x.inicio.localeCompare(y.inicio));
  return vivos.find(a => a.inicio <= hoje) ?? vivos[0] ?? null;
}

/**
 * «Último acesso 20/10» ou «Nunca abriu o sistema». A frase do ponto de
 * atenção diz o dado, não acusa: quem lê decide o que aconteceu.
 */
export function rotuloDoUltimoUso(ultimoUso: string | null): string {
  return ultimoUso ? `último acesso ${diaMes(ultimoUso)}` : 'nunca abriu o sistema';
}
