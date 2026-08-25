/**
 * identificadorLogin.ts — o que a pessoa digitou no campo de login?
 *
 * Arquivo próprio, e não uma função dentro de `useAuth.tsx`, pelo padrão da
 * casa: é lógica pura, tem teste próprio, e exportar função de um arquivo de
 * hook/componente quebra o hot reload do Vite.
 *
 * ## Por que a pergunta não é "tem arroba?"
 *
 * Era, e estava errado. `signIn` tratava qualquer identificador com `@` como
 * endereço de e-mail e o mandava direto ao GoTrue. Isso presume que arroba só
 * aparece em e-mail — e no cadastro real existe `camila@ribeiro`, um nome de
 * usuário com arroba no meio. Ela digitava o próprio login e o sistema procurava
 * uma caixa postal chamada `camila@ribeiro`, que nunca existiu. Não entrava.
 *
 * A pergunta certa é outra: **dá para enviar e-mail para isto?** Se dá, é
 * endereço e vai direto. Se não dá, é nome de usuário e passa pela busca.
 */

/**
 * Isto é um endereço de e-mail para o qual daria para ENVIAR mensagem?
 *
 * O critério é o domínio ter ponto e terminar em letras — `gmail.com`,
 * `interno.sistema`, `empresa.com.br`. É deliberadamente frouxo: não valida
 * e-mail de verdade (RFC 5322 é um pântano e não é isso que se decide aqui),
 * só separa "endereço" de "apelido com arroba".
 *
 * Os domínios internos do sistema passam — `login@interno.sistema` tem ponto —,
 * então quem já entrava digitando o e-mail continua entrando pelo mesmo
 * caminho, sem uma consulta a mais.
 *
 *   `fulano@gmail.com`      → true  (vai direto ao GoTrue)
 *   `fulano@interno.sistema`→ true  (idem)
 *   `camila@ribeiro`        → false (é nome de usuário: passa pela busca)
 *   `camila_ribeiro`        → false (idem, como sempre foi)
 */
export function pareceEmailEntregavel(identificador: string): boolean {
  const texto = identificador.trim();
  // Um arroba só, com algo antes e depois; e o depois precisa de ponto com
  // letras na ponta. `\s` fora porque espaço no meio nunca é endereço.
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)*\.[a-z]{2,}$/i.test(texto);
}
