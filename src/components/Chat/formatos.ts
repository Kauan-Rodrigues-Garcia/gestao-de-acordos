/**
 * formatos.ts — como o chat escreve hora, data, tamanho e duração.
 *
 * Moravam em `comum.tsx` junto dos componentes. Continuam num lugar só, pelo
 * mesmo motivo de antes — a bolha e a versão expandida têm que escrever igual —,
 * mas fora do arquivo de componentes: um `.tsx` que exporta funções perde o
 * Fast Refresh inteiro.
 */

/**
 * Hora curta, do jeito que se lê de relance numa lista.
 *
 * Hoje mostra a hora; ontem, a palavra; nesta semana, o dia; antes disso, a
 * data. É a régua do WhatsApp e existe por um motivo: numa lista, «14:32» e
 * «23/07» respondem perguntas diferentes, e mostrar sempre a data completa
 * obriga a pessoa a calcular se aquilo foi agora ou no mês passado.
 */
export function horaCurta(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const agora = new Date();
  const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.floor((meiaNoite.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);

  if (dias <= 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias === 1) return 'ontem';
  if (dias < 7)  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function horaDoBalao(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** «Hoje», «Ontem» ou a data — o separador entre os dias da conversa. */
export function rotuloDoDia(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const dias = Math.floor(
    (new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()
     - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function diaDaMensagem(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** `83` → `1:23`. Segundo cheio: milissegundo num áudio de recado é ruído. */
export function duracaoCurta(segundos: number): string {
  if (!isFinite(segundos) || segundos < 0) return '0:00';
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
