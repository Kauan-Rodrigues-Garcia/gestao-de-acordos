-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4: um lugar só decide para que setor a linha conta
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## A armadilha que isto fecha
--
-- `mestre_equipes.destino` já é uma regra de TRÊS vias:
--
--   proprio ........ conta para o setor da carteira (o padrão)
--   outro_setor .... conta para `destino_setor_id`
--   somente_geral .. não conta para setor nenhum (entra só no total da empresa)
--
-- A tela `Mestre59Detalhe` deixa escolher as três desde que a coluna existe.
-- Mas só 5 das 17 funções que leem `mestre_equipes` honram `destino_setor_id`.
-- As outras filtram apenas `<> 'somente_geral'` — o que faz `outro_setor` passar
-- direto e cair no setor da CARTEIRA, que é justamente o setor de onde o
-- dinheiro deveria ter saído.
--
-- Resultado: quem usasse a opção veria o mesmo dinheiro num setor numa tela e
-- noutro setor em outra. Pior que o recurso não existir, porque parece que
-- funciona.
--
-- ## Por que ninguém percebeu
--
-- Porque ninguém usou ainda: medido em 14/09/2026, das 124 linhas de
-- `mestre_equipes` da BookPlay, 122 são `proprio`, 2 são `somente_geral`
-- (Retenção) e **nenhuma** tem `destino_setor_id`. A armadilha está armada e
-- alcançável pela tela, mas não disparou.
--
-- ## Esta função é inerte hoje, e dá para provar sem rodar nada
--
-- Com `destino` pertencendo a {proprio, somente_geral} em todas as linhas, o
-- `case` abaixo reduz algebricamente ao comportamento atual:
--
--   destino = 'proprio'        → p_setor_do_grupo   (igual ao de hoje)
--   destino = 'somente_geral'  → null               (igual ao filtro de hoje)
--   destino = 'outro_setor'    → não ocorre em nenhuma linha
--
-- Ou seja: ligar isto nas funções que faltam não muda um centavo do que está na
-- tela agora. O que muda é o dia em que alguém usar a opção.
--
-- A prova algébrica virou prova empírica em agosto + setembro/2026: 69.737
-- linhas comparadas pela regra velha e pela nova, **zero divergem**, e o «no
-- setor dele» deu R$ 13.149.666,99 dos dois lados.
--
-- ## IMMUTABLE de propósito
--
-- Só faz contas com os próprios argumentos — não lê tabela. Assim o Postgres
-- inlineia a chamada e ela não custa nada por linha, que é o que permite usá-la
-- dentro de funções que varrem dezenas de milhares de recebimentos.
--
-- ## Escrita: nenhuma
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '15s';

create or replace function public.fn_mestre_setor_resolvido(
  p_setor_do_grupo   uuid,
  p_destino          text,
  p_destino_setor_id uuid
)
returns uuid
language sql
immutable
parallel safe
as $function$
  select case coalesce(p_destino, 'proprio')
           when 'outro_setor'   then p_destino_setor_id
           when 'somente_geral' then null::uuid
           else p_setor_do_grupo
         end;
$function$;

comment on function public.fn_mestre_setor_resolvido(uuid, text, uuid) is
  'Para que setor uma linha do 59 conta, considerando o destino do subgrupo: '
  'proprio = setor da carteira, outro_setor = destino_setor_id, somente_geral = '
  'nenhum. Um lugar so decide, porque a regra estava repetida em 17 funcoes e '
  'so 5 a implementavam inteira. IMMUTABLE: o Postgres inlineia, custo zero por '
  'linha.';

grant execute on function public.fn_mestre_setor_resolvido(uuid, text, uuid) to authenticated;

commit;
