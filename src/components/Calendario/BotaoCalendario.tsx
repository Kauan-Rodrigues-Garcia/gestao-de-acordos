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
 * ## O botão do tempo, do lado (06/11/2026)
 *
 * O tempo é outra coisa, com botão próprio (`clima/BotaoClima`): o personagem
 * do tempo e a temperatura da cidade do setor, e o clique abre só o card do
 * tempo. Mora aqui só para nascer colado a este botão, na mesma barra. Ele
 * aparece para todo mundo que está logado, com ou sem calendário liberado: a
 * cidade é a do setor deste botão, senão a do cadastro (sem cidade, Birigui).
 * A cor é a do calendário do mês só quando ele está liberado para a operação
 * (`temaLiberado`); sem calendário liberado, a do tema padrão do mês.
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
import { BotaoClima } from './clima/BotaoClima';
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
  const { temSetor, setorId, eventosHoje, rascunhoParaPublicar, tema: temaDaCapa, temaLiberado } = useCalendarioHoje(empresaId, meuSetorId, ativo);
  const { resolvedTheme } = useTheme();
  const escuro = ehTemaEscuro(resolvedTheme);
  const hojeISO = getTodayISO();
  // Lido do navegador uma vez por dia e pessoa; depois, o estado manda.
  const [visto, setVisto] = useState<{ chave: string; sim: boolean } | null>(null);
  const chave = `${perfilId ?? ''}:${hojeISO}`;
  const jaViu = visto?.chave === chave ? visto.sim : lembreteVisto(perfilId, hojeISO);

  const tema = temaEfetivo(temaDaCapa, Number(hojeISO.slice(5, 7)));
  const paleta = useMemo(() => paletaGibi(tema, escuro), [tema, escuro]);
  // O tempo veste o calendário só quando ele está liberado para a operação;
  // senão, o tema padrão do mês (o «Automático»: Novembro Azul em novembro…).
  const temaDoTempo = temaEfetivo(temaLiberado, Number(hojeISO.slice(5, 7)));
  const paletaDoTempo = useMemo(() => paletaGibi(temaDoTempo, escuro), [temaDoTempo, escuro]);

  const mostrar = ativo && temSetor;
  const temClima = Boolean(perfilId);
  useEffect(() => { if (mostrar || temClima) carregarFontesGibi(); }, [mostrar, temClima]);

  const marcarVisto = () => {
    marcarLembreteVisto(perfilId, hojeISO);
    setVisto({ chave, sim: true });
  };

  // Sempre no mesmo lugar da árvore: o botão do tempo não se remonta quando o do mês aparece.
  return (
    <>
      {mostrar && (
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
      )}
      <BotaoClima setorId={setorId ?? meuSetorId} paleta={paletaDoTempo} hojeISO={hojeISO} ativo={temClima} />
    </>
  );
}
