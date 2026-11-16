/**
 * O token da TV para o Desafio Cobrança. A página da TV (`TvPalco`) avisa aqui
 * qual é o token dela; sem token, é a prévia do editor (pessoa logada).
 */
let token: string | null = null;
export function avisarTokenDaTv(t: string | null) { token = t; }
export function tokenDaTv(): string | null { return token; }
