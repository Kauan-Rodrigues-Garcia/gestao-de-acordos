/** O que a lista de módulos pergunta a cada card: casa com a busca? quais chaves são dele? */
import type { BlocoDeAba } from '@/lib/permissoes-abas';
import type { PermissaoMeta } from '@/lib/permissoes-catalogo';

/** O módulo tem algo que casa com a busca — nome, descrição ou permissão. */
export function blocoCasa(bloco: BlocoDeAba, filtro: string): boolean {
  if (!filtro) return true;
  const casa = (p: PermissaoMeta) =>
    p.label.toLowerCase().includes(filtro) || p.descricao.toLowerCase().includes(filtro);
  return bloco.rotulo.toLowerCase().includes(filtro)
    || bloco.descricao.toLowerCase().includes(filtro)
    || casa(bloco.interruptor)
    || bloco.niveis.some(casa)
    || bloco.secoes.some(s => s.permissoes.some(casa));
}

/** Todas as chaves do módulo: a da aba, os alcances e as opções de dentro. */
export function chavesDoBloco(bloco: BlocoDeAba): string[] {
  return [
    bloco.interruptor.key,
    ...bloco.niveis.map(n => n.key),
    ...bloco.secoes.flatMap(s => s.permissoes.map(p => p.key)),
  ];
}
