/**
 * A letra do gibi: só a Bangers (títulos e números) — o texto usa a fonte do
 * app, para não baixar mais nada. Baixada uma vez, na primeira vez que o gibi
 * aparece; até chegar, vale a reserva do CSS (Impact).
 */
const ID = 'calendario-gibi-fontes';
const HREF = 'https://fonts.googleapis.com/css2?family=Bangers&display=swap';

export function carregarFontesGibi(): void {
  try {
    if (document.getElementById(ID)) return;
    const link = document.createElement('link');
    link.id = ID;
    link.rel = 'stylesheet';
    link.href = HREF;
    document.head.appendChild(link);
  } catch { /* sem a fonte, a reserva serve */ }
}
