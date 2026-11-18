/**
 * Tela cheia na TV (18/11/2026).
 *
 * Muitas TVs ficavam com a barra do navegador porque ninguém apertava F11. O
 * navegador NÃO deixa a página entrar em tela cheia sozinha — a API exige um
 * gesto (clique, toque, tecla). Então:
 *
 *  - a página tenta ao abrir (dá certo quando o navegador permite);
 *  - QUALQUER toque ou tecla na TV já põe em tela cheia, e de novo se sair;
 *  - enquanto não estiver, um aviso discreto no canto diz o que fazer.
 *
 * Tela cheia de verdade, sem ninguém tocar, é o atalho do Chrome em modo
 * quiosque (`atalhoDaTv`, botão «Baixar atalho da TV» na montagem). O aviso
 * do canto é `AvisoTelaCheia.tsx`.
 */
import { useEffect, useState } from 'react';

/** Já está ocupando a tela: pela API, pelo F11 ou pelo modo quiosque. */
export function estaEmTelaCheia(): boolean {
  if (typeof document === 'undefined') return true;
  if (document.fullscreenElement) return true;
  try {
    if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  } catch { /* navegador antigo */ }
  // F11 nem sempre aparece nas duas perguntas acima: a janela do tamanho da tela basta.
  return window.innerHeight >= window.screen.height - 2 && window.innerWidth >= window.screen.width - 2;
}

function entrarEmTelaCheia(): void {
  if (estaEmTelaCheia()) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* sem gesto: fica para o próximo toque */ });
}

export function useTelaCheia(): boolean {
  const [cheia, setCheia] = useState(estaEmTelaCheia);
  useEffect(() => {
    entrarEmTelaCheia();
    const aoGesto = (e: Event) => {
      // F11 e Esc são do próprio navegador: entrar junto desfaria o que a pessoa fez.
      if (e instanceof KeyboardEvent && (e.key === 'F11' || e.key === 'Escape')) return;
      entrarEmTelaCheia();
    };
    const atualizar = () => setCheia(estaEmTelaCheia());
    const gestos = ['pointerdown', 'keydown', 'touchend'] as const;
    gestos.forEach(g => window.addEventListener(g, aoGesto, true));
    document.addEventListener('fullscreenchange', atualizar);
    window.addEventListener('resize', atualizar);
    return () => {
      gestos.forEach(g => window.removeEventListener(g, aoGesto, true));
      document.removeEventListener('fullscreenchange', atualizar);
      window.removeEventListener('resize', atualizar);
    };
  }, []);
  return cheia;
}

/**
 * O atalho do PC da TV: abre o `/tv` no Chrome em modo quiosque (tela cheia
 * sem barra, sem F11; para sair, Alt+F4). Sem Chrome, usa o Edge. Posto na
 * pasta de inicialização do Windows, a TV volta sozinha quando o PC liga.
 *
 * Usa o perfil normal do navegador: o token do pareamento continua lá, e a TV
 * já pareada não pede código de novo. O quiosque só pega com o Chrome fechado
 * (se já houver uma janela aberta, ele abre uma aba comum nela).
 *
 * `--autoplay-policy`: vídeo COM som toca sem ninguém clicar (sem isso o
 * navegador só deixa tocar mudo).
 */
export function atalhoDaTv(origem: string): string {
  const url = `${origem}/#/tv`;
  return [
    '@echo off',
    'rem Gestao - TV em tela cheia (modo quiosque). Para sair: Alt+F4.',
    'rem Para abrir sozinho ao ligar o PC: Win+R, digite shell:startup e copie este arquivo para la.',
    `set "URL=${url}"`,
    'set "FLAGS=--kiosk --no-first-run --noerrdialogs --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required"',
    'set "NAV="',
    'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" >nul 2>&1 && set "NAV=chrome"',
    'if not defined NAV reg query "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" >nul 2>&1 && set "NAV=chrome"',
    'if defined NAV (',
    '  start "" chrome %FLAGS% "%URL%"',
    ') else (',
    '  start "" msedge %FLAGS% --edge-kiosk-type=fullscreen "%URL%"',
    ')',
    '',
  ].join('\r\n');
}

export function baixarAtalhoDaTv(): void {
  const blob = new Blob([atalhoDaTv(window.location.origin)], { type: 'application/x-bat' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'TV do Gestao.bat';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
