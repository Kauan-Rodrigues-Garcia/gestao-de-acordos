/**
 * carregarFontes.ts — as letras do card 2.0, baixadas só quando um card aparece.
 *
 * Não entram no `index.css`: o app inteiro pagaria quatro famílias a cada
 * abertura por causa de uma tela que aparece algumas vezes por dia. Aqui o
 * `<link>` é injetado uma vez, no primeiro card montado (estúdio ou festa), e o
 * navegador guarda o resto em cache.
 *
 * `display=swap`: se a fonte demorar, o texto aparece na letra reserva e troca
 * quando ela chega — a festa nunca espera a tipografia.
 */
const ID_LINK = 'comemoracao2-fontes';

const URL_FONTES =
  'https://fonts.googleapis.com/css2'
  + '?family=Anton'
  + '&family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800'
  + '&family=Fraunces:ital,opsz,wght@1,9..144,700'
  + '&family=Fredoka:wght@600;700'
  + '&display=swap';

export function carregarFontesDoCard(): void {
  try {
    if (typeof document === 'undefined' || document.getElementById(ID_LINK)) return;
    const link = document.createElement('link');
    link.id = ID_LINK;
    link.rel = 'stylesheet';
    link.href = URL_FONTES;
    document.head.appendChild(link);
  } catch {
    // Sem a fonte o card usa a reserva. Nunca derruba a tela.
  }
}
