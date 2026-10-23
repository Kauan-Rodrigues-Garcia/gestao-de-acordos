/**
 * useJanelaDaGuerra — a ponte entre a janela da corrida e o Cavalo da Guerra
 * na página (23/10/2026), igual para a corrida de verdade (`PalcoCavalos`) e
 * para o teste (`TesteCavalos`).
 *
 * A página da corrida é quem manda no tempo do filme (`naCorrida.js`): ela
 * avisa `guerra-chefe` quando a janela estoura e `guerra-volta` quando o chefe
 * acabou. Por garantia, se o `guerra-volta` não vier (a aba dormiu, o iframe
 * travou), o chefe sai sozinho um pouco depois da hora pelo estado do banco.
 */
import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import type { MensagemCavalos } from '../cavalos/JanelaCavalos';
import type { EstadoGuerra } from './tipos';

/** O que a página da corrida espera entre o chefe cair (ou fugir) e avisar a volta (`naCorrida.js`). */
const VOLTA_S = 9.5;
const FOLGA_S = 4;

export interface ChefeNaTela {
  rect: DOMRect;
  canvas: HTMLCanvasElement | null;
  numero?: number | string;
  dono?: string | null;
}

export function useJanelaDaGuerra(quadro: MutableRefObject<HTMLIFrameElement | null>, estado: EstadoGuerra | null, agoraMs: () => number) {
  const [chefe, setChefe] = useState<ChefeNaTela | null>(null);

  /** Trata as mensagens da guerra; devolve se era uma delas. */
  const tratar = useCallback((m: MensagemCavalos): boolean => {
    if (m.tipo === 'guerra-chefe') {
      const f = quadro.current, base = f?.getBoundingClientRect();
      const r = (m.rect ?? {}) as { left?: number; top?: number; width?: number; height?: number };
      const rect = new DOMRect((base?.left ?? 0) + (r.left ?? 0), (base?.top ?? 0) + (r.top ?? 0), r.width ?? 0, r.height ?? 0);
      let canvas: HTMLCanvasElement | null = null;
      try { canvas = (f?.contentDocument?.getElementById('cv') as HTMLCanvasElement | null) ?? null; } catch { /* sem a foto da pista, os cacos saem vazios */ }
      setChefe({ rect, canvas, numero: m.numero as number | undefined, dono: (m.dono as string | null | undefined) ?? null });
      return true;
    }
    if (m.tipo === 'guerra-volta') { setChefe(null); return true; }
    return false;
  }, [quadro]);

  const fim = estado?.caiu_em ?? estado?.expira_em ?? null;
  useEffect(() => {
    if (!chefe || !fim) return;
    const falta = Date.parse(fim) + (VOLTA_S + FOLGA_S) * 1000 - agoraMs();
    const id = window.setTimeout(() => setChefe(null), Math.max(0, falta));
    return () => window.clearTimeout(id);
  }, [chefe, fim, agoraMs]);

  return { chefe, tratar };
}
