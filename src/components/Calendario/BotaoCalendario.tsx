/**
 * O botão do Calendário no topo do app, ao lado do menu.
 *
 * Diz, sem abrir, o que interessa no dia: o mês e o que está marcado para hoje
 * no setor («Hoje: Banco de horas · até às 19:00»). O clique abre o painel por
 * cima da tela — não há aba nem rota.
 *
 * ## Quando há algo hoje (pedido de 06/10/2026)
 *
 * «Quando tiver na data, exemplo banco de horas dia 12, o Outubro fica
 * piscando e desce um lembrete do lado.» O botão ganha um anel na segunda cor
 * do tema e o lembrete aparece colado a ele (`LembreteDoDia`). Os dois somem
 * quando a pessoa abre o calendário ou dispensa o lembrete, e não voltam no
 * mesmo dia. Movimento só o mínimo (03/11/2026): o anel chama três vezes e
 * fica parado, e o lembrete desce de leve — nada em laço.
 *
 * ## Em gibi (30/10/2026)
 *
 * O botão veste o tema do mês, como o calendário: a cor do acento, o desenho
 * do tema e o nome do mês em letra de gibi, com a contagem do dia num selo.
 *
 * Para quem monta o calendário, um ponto âmbar avisa que o mês corrente está
 * em rascunho, com coisa lançada, esperando ir para a operação.
 *
 * Fica fora do pacote do painel: o que este arquivo importa é leve, e o painel
 * só baixa no primeiro clique (`PainelSobDemanda`, no Layout).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { getTodayISO } from '@/lib/index';
import { ehTemaEscuro } from '@/lib/temas';
import { temaEfetivo } from '@/lib/calendarioSetor';
import { paletaGibi } from '@/lib/calendarioGibi';
import { lembreteVisto, marcarLembreteVisto } from '@/lib/calendarioLembrete';
import { useCalendarioHoje } from '@/hooks/useCalendarioHoje';
import { BotaoDoMes } from './gibi/BotaoDoMes';
import { carregarFontesGibi } from './gibi/fontes';

interface Props {
  empresaId: string | null | undefined;
  perfilId: string | null | undefined;
  meuSetorId: string | null;
  /** A pessoa tem a chave `ver_calendario` neste produto. */
  ativo: boolean;
  onAbrir: () => void;
}

export function BotaoCalendario({ empresaId, perfilId, meuSetorId, ativo, onAbrir }: Props) {
  const { temSetor, eventosHoje, rascunhoParaPublicar, tema: temaDaCapa } = useCalendarioHoje(empresaId, meuSetorId, ativo);
  const { resolvedTheme } = useTheme();
  const escuro = ehTemaEscuro(resolvedTheme);
  const hojeISO = getTodayISO();
  // Lido do navegador uma vez por dia e pessoa; depois, o estado manda.
  const [visto, setVisto] = useState<{ chave: string; sim: boolean } | null>(null);
  const chave = `${perfilId ?? ''}:${hojeISO}`;
  const jaViu = visto?.chave === chave ? visto.sim : lembreteVisto(perfilId, hojeISO);

  const tema = temaEfetivo(temaDaCapa, Number(hojeISO.slice(5, 7)));
  const paleta = useMemo(() => paletaGibi(tema, escuro), [tema, escuro]);

  const mostrar = ativo && temSetor;
  useEffect(() => { if (mostrar) carregarFontesGibi(); }, [mostrar]);

  if (!mostrar) return null;

  const marcarVisto = () => {
    marcarLembreteVisto(perfilId, hojeISO);
    setVisto({ chave, sim: true });
  };

  return (
    <BotaoDoMes
      tema={tema}
      paleta={paleta}
      hojeISO={hojeISO}
      eventosHoje={eventosHoje}
      chamando={eventosHoje.length > 0 && !jaViu}
      rascunhoParaPublicar={rascunhoParaPublicar}
      onAbrir={() => { marcarVisto(); onAbrir(); }}
      onDispensar={marcarVisto}
    />
  );
}
