/**
 * PontoDaLegenda — a bolinha colorida das legendas de anel.
 *
 * ## Por que o halo mora DENTRO da caixa
 *
 * A bolinha era `ring-2 ring-offset-1`: o anel é `box-shadow`, e box-shadow
 * desenha 3px FORA do elemento. As legendas rolam por dentro
 * (`overflow-y-auto`, para o card não mudar de altura), e rolagem vertical
 * também corta na horizontal — então a metade esquerda do halo sumia, e a
 * bolinha aparecia cortada. Pedido de 16/09/2026, visto no Comercial, na
 * BookPlay e na PaguePlay (as duas usam `CardMetaDonut`).
 *
 * Aqui o halo é o fundo de uma caixa de 16px e o ponto fica no meio dela:
 * tudo cabe no espaço que o layout reserva, e nenhuma rolagem tem o que cortar.
 *
 * De quebra a cor do halo passa a valer. O `ringColor` do estilo antigo não
 * é propriedade CSS, e o anel saía na cor do texto.
 */
export function PontoDaLegenda({ cor }: { cor: string }) {
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: cor + '33' }}
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
    </span>
  );
}
