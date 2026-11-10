/**
 * senhaForte.ts — a régua da senha que a PRÓPRIA pessoa cria (10/11/2026).
 *
 * ## Por que existe
 *
 * A auditoria de segurança de 10/11/2026 achou 236 contas ativas ainda com a
 * senha inicial dos scripts de criação — a sequência mais óbvia que há —, e o
 * login é o nome da pessoa (tem de ser: é por ele que o relatório do Mundial
 * encontra o operador). Nome conhecido + senha óbvia = qualquer um entra.
 *
 * O login não muda. Então é a senha que tem de deixar de ser adivinhável:
 *
 *   • 6 a 72 caracteres (o tamanho de sempre — a régua não ficou mais comprida,
 *     ficou sem as óbvias);
 *   • ao menos uma letra e um número;
 *   • nada de sequência ou palavra manjada («a123456», «senha1»…);
 *   • sem o próprio nome ou login dentro.
 *
 * A mesma régua (tamanho + letra + número) está ligada no painel do Supabase
 * (Authentication → Policies), que é quem recusa de verdade: a troca vai do
 * navegador direto ao GoTrue. Aqui é a mensagem clara antes de ir à rede.
 */

export const MIN_SENHA_FORTE = 6;
export const MAX_SENHA = 72;

/** Trechos que tornam a senha adivinhável, em minúsculas. */
const MANJADAS = [
  '123456', '654321', '234567', '012345', 'abcdef', 'qwerty', 'asdfgh',
  'senha', 'password', 'mundial', 'bookplay', 'pagueplay', 'gestao',
];

export interface DonoDaSenha {
  usuario?: string | null;
  nome?: string | null;
}

const semAcento = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pedaços do login e do nome com 4 letras ou mais («maria_silva» → maria, silva). */
function pedacosDoDono(dono: DonoDaSenha): string[] {
  return [dono.usuario, dono.nome]
    .flatMap(v => semAcento(v ?? '').split(/[^a-z0-9]+/))
    .filter(p => p.length >= 4);
}

/**
 * `null` quando a senha serve; senão, a frase que explica o que falta.
 */
export function problemaDaSenha(senha: string, dono: DonoDaSenha = {}): string | null {
  if (senha.length < MIN_SENHA_FORTE) {
    return `A senha precisa ter ao menos ${MIN_SENHA_FORTE} caracteres.`;
  }
  if (senha.length > MAX_SENHA) {
    return `A senha pode ter no máximo ${MAX_SENHA} caracteres.`;
  }
  if (!/[a-zA-ZÀ-ÿ]/.test(senha) || !/[0-9]/.test(senha)) {
    return 'A senha precisa ter ao menos uma letra e um número.';
  }
  const baixa = semAcento(senha);
  if (new Set(baixa).size < 4) {
    return 'A senha repete demais os mesmos caracteres.';
  }
  if (MANJADAS.some(m => baixa.includes(m))) {
    return 'Essa senha é fácil demais de adivinhar. Evite sequências como 123456 e palavras como «senha».';
  }
  if (pedacosDoDono(dono).some(p => baixa.includes(p))) {
    return 'A senha não pode conter o seu nome nem o seu login.';
  }
  return null;
}
