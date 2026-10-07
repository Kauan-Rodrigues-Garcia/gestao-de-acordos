/**
 * Campanhas de WhatsApp — a parte pura: o link que abre a conversa, a contagem
 * e a forma de mostrar o número. Migration 20261007150000.
 */

export type StatusContato = 'pendente' | 'enviado' | 'nao_enviado';

export interface Contato {
  id: string;
  envio_id: string;
  ordem: number;
  nome: string;
  contrato: string | null;
  empresa_cliente: string | null;
  telefone: string | null;
  whatsapp: string | null;
  mensagem: string;
  mensagem_editada: string | null;
  pendencias: string[];
  status: StatusContato;
  enviado_em: string | null;
}

/** Onde a conversa abre. O navegador não sabe qual está conectado: a pessoa escolhe, e fica lembrado. */
export type ModoAbrir = 'web' | 'app';

/** A mensagem que sai: a editada pela pessoa, se houver. */
export function textoDoContato(c: Pick<Contato, 'mensagem' | 'mensagem_editada'>): string {
  return c.mensagem_editada ?? c.mensagem;
}

/**
 * O link que abre a conversa com a mensagem pronta.
 *
 * • `web`: o WhatsApp Web direto na conversa — sem a página intermediária do
 *   wa.me, que pede para escolher onde abrir a cada contato.
 * • `app`: o protocolo `whatsapp://`, que o WhatsApp do computador atende.
 */
export function linkWhatsApp(numero: string, texto: string, modo: ModoAbrir): string {
  const q = `phone=${encodeURIComponent(numero)}&text=${encodeURIComponent(texto)}`;
  return modo === 'app' ? `whatsapp://send?${q}` : `https://web.whatsapp.com/send?${q}`;
}

/** «(18) 99999-9999» a partir dos dígitos com o 55. */
export function telefoneLegivel(whatsapp: string | null, telefone: string | null): string {
  const d = String(whatsapp ?? '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(telefone ?? '').trim();
}

export interface Contagem { total: number; pendentes: number; enviados: number; naoEnviados: number }

export function contar(contatos: readonly Pick<Contato, 'status'>[]): Contagem {
  let enviados = 0, naoEnviados = 0;
  for (const c of contatos) {
    if (c.status === 'enviado') enviados++;
    else if (c.status === 'nao_enviado') naoEnviados++;
  }
  return { total: contatos.length, pendentes: contatos.length - enviados - naoEnviados, enviados, naoEnviados };
}

/** O próximo a enviar: o primeiro pendente com número, na ordem da campanha. */
export function proximoPendente<T extends Pick<Contato, 'status' | 'whatsapp'>>(contatos: readonly T[]): T | null {
  return contatos.find(c => c.status === 'pendente' && !!c.whatsapp) ?? null;
}

export type Filtro = 'pendentes' | 'enviados' | 'nao_enviados' | 'todos';

const SEM_ACENTO = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O filtro da lista: pela situação e pela busca (nome, contrato ou número). */
export function filtrar<T extends Contato>(contatos: readonly T[], filtro: Filtro, busca: string): T[] {
  const b = SEM_ACENTO(busca.trim());
  const digitos = busca.replace(/\D/g, '');
  return contatos.filter((c) => {
    if (filtro === 'pendentes' && c.status !== 'pendente') return false;
    if (filtro === 'enviados' && c.status !== 'enviado') return false;
    if (filtro === 'nao_enviados' && c.status !== 'nao_enviado') return false;
    if (!b) return true;
    return SEM_ACENTO(c.nome).includes(b)
      || SEM_ACENTO(c.contrato ?? '').includes(b)
      || (digitos.length >= 4 && String(c.whatsapp ?? c.telefone ?? '').replace(/\D/g, '').includes(digitos));
  });
}
