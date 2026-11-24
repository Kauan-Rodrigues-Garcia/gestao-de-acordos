/**
 * arquivos.ts — as regras de arquivo do ticket, sem tela.
 *
 * Separadas de `anexos.tsx` para aquele arquivo exportar só componente (o
 * recarregamento rápido do Vite pede isso). As regras: 10 MB por arquivo
 * (super admin sem teto), print colado ganha nome com hora, e o anexo
 * gravado vira link assinado na hora de mostrar — o balde é privado.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { tetoDeUpload } from '@/lib/tetoDeUpload';
import {
  urlDoAnexoTicket, urlDoAnexoTicketEmCache, type AnexoTicket,
} from '@/services/tickets.service';

/** 10 MB — o mesmo teto do bucket (migration 20260819120000). */
export const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** O que a caixa de arquivo aceita. */
export const TIPOS_ACEITOS = 'image/*,audio/*,video/*,.pdf,.xlsx,.xls,.csv,.txt,.doc,.docx';

/**
 * Separa os arquivos que cabem dos que passam do teto, avisando cada recusa.
 * O super admin não tem teto no navegador — ver `lib/tetoDeUpload.ts`.
 */
export function arquivosQueCabem(lista: FileList | File[] | null, cargo: string | null | undefined): File[] {
  if (!lista) return [];
  const teto = tetoDeUpload(TAMANHO_MAXIMO, cargo);
  const bons: File[] = [];
  for (const f of Array.from(lista)) {
    if (f.size > teto) {
      toast.error(`"${f.name}" passa de 10 MB e não pode ser enviado.`);
      continue;
    }
    bons.push(f);
  }
  return bons;
}

/**
 * Print colado chega como «image.png». Ganha um nome com a hora, para a aba
 * «Arquivos» não ficar com cinco «image.png» iguais.
 */
export function arquivosColados(e: React.ClipboardEvent): File[] {
  const arquivos = Array.from(e.clipboardData?.files ?? []);
  if (!arquivos.length) return [];
  const hora = new Date().toLocaleTimeString('pt-BR').replace(/:/g, '-');
  return arquivos.map((f, i) => (
    f.type.startsWith('image/') && /^image\.\w+$/.test(f.name)
      ? new File([f], `print-${hora}${i ? `-${i + 1}` : ''}.${f.type.split('/')[1] || 'png'}`, { type: f.type })
      : f
  ));
}

/**
 * Prévia de arquivo ainda não enviado.
 *
 * `URL.createObjectURL` reserva memória até alguém revogar — sem a limpeza,
 * cada print anexado e removido ficaria pendurado pelo resto da sessão.
 */
export function usePrevias(arquivos: File[]): { arquivo: File; url: string | null }[] {
  const previas = useMemo(
    () => arquivos.map(f => ({ arquivo: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null })),
    [arquivos],
  );
  useEffect(() => () => { for (const p of previas) if (p.url) URL.revokeObjectURL(p.url); }, [previas]);
  return previas;
}

/** O link assinado do anexo, com o cache de 50 min de `tickets.service`. */
export function useUrlAssinada(url: string): { url: string | null; falhou: boolean } {
  const [assinada, setAssinada] = useState<string | null>(() => urlDoAnexoTicketEmCache(url));
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (assinada) return;
    let vivo = true;
    void urlDoAnexoTicket(url).then(u => {
      if (!vivo) return;
      if (u) setAssinada(u); else setFalhou(true);
    });
    return () => { vivo = false; };
  }, [url, assinada]);
  return { url: assinada, falhou };
}

export function ehImagem(a: AnexoTicket): boolean {
  return a.tipo.startsWith('image/');
}

export function tamanhoLegivel(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** ̀-ͯ: as marcas de acento que o NFD separa da letra. «Jose» acha «José». */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const ROTULO_CARGO: Record<string, string> = {
  super_admin: 'Super admin',
  administrador: 'Administrador',
  diretoria: 'Diretoria',
  gerencia: 'Gerência',
  lider: 'Líder',
  elite: 'Elite',
  ouvidoria: 'Ouvidoria',
  operador: 'Operador',
};

export function rotuloCargo(perfil: string | null): string {
  return perfil ? ROTULO_CARGO[perfil] ?? perfil : '';
}
