/**
 * A letra dos papéis do Natal (o bilhete da abertura, o ticket da estação):
 * serifada e macia. Desce só quando um deles vai aparecer.
 */
const FONTE_DO_NATAL = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,500;1,9..144,600&display=swap';

export function carregarFonteDoNatal() {
  if (document.getElementById('np-fonte-cartao')) return;
  const l = document.createElement('link');
  l.id = 'np-fonte-cartao';
  l.rel = 'stylesheet';
  l.href = FONTE_DO_NATAL;
  document.head.appendChild(l);
}
