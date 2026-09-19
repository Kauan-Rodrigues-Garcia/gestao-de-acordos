/**
 * PlantaoElite.tsx — aba «Plantão Elite» do Painel Líder (BookPlay).
 *
 * O quadro da planilha «CONTROLE ELITE», montado do analítico: o recebimento
 * da dupla do dia, faixa a faixa (08:30 - 09:00 … 19:00 - 20:00), o acumulado,
 * o resumo do dia e o total do Receptivo.
 *
 * A folha na tela É a imagem que vai para o WhatsApp: sempre clara, nas cores
 * do Gestão (`COR_GESTAO`), qualquer que seja o tema. O botão «Copiar imagem»
 * fotografa exatamente o que está à vista.
 *
 * Quem decide a dupla é o banco: quem está numa dupla recebe a dela em
 * qualquer data; os demais, a dupla do dia (ímpar/par).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, ChevronLeft, ChevronRight, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getTodayISO } from '@/lib/index';
import { assinarSinal } from '@/lib/sinais';
import { COR_GESTAO } from '@/lib/relatorioGestao';
import { copiarImagemDoElemento } from '@/lib/copiarImagem';
import {
  buscarPlantaoElite, faixasApuradas, horaAgoraSaoPaulo, montarQuadroElite,
  outroDiaDePlantao, plantaoDoDia, primeiroNome, ultimoDiaDoPlantao,
  type LinhaQuadroElite, type RespostaPlantaoElite,
} from '@/services/plantaoElite/plantaoElite';

/** Cor do Gestão com `#` — a folha usa só estas, nunca as variáveis do tema. */
const cor = (k: keyof typeof COR_GESTAO) => `#${COR_GESTAO[k]}`;

/*
 * O tema do app pinta a borda de TODO elemento com `oklch` (`* { border-border }`)
 * e o html2canvas 1.4 não sabe ler `oklch` nem `color-mix`: a cópia morreria
 * com «unsupported color function». Esta regra fica fora de camada, então vence
 * a da base, e só vale dentro da folha.
 */
const CSS_FOLHA = `
.folha-elite, .folha-elite * {
  border-color: ${cor('bordaSuave')};
  outline-color: transparent;
}`;

const numero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** «sexta-feira, 19/09/2026». Meio-dia UTC: a data não anda com o fuso da máquina. */
function dataPorExtenso(data: string): string {
  const s = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${data}T12:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function horaDaChegada(iso: string, data: string): string {
  const d = new Date(iso);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d);
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  if (dia === data) return hora;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
}

const ROTULO_PLANTAO = { impar: 'Ímpar', par: 'Par' } as const;

interface Props {
  empresaId: string;
}

export function PlantaoElite({ empresaId }: Props) {
  const hoje = getTodayISO();
  const [data, setData] = useState(hoje);
  const [resposta, setResposta] = useState<RespostaPlantaoElite | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const folhaRef = useRef<HTMLDivElement>(null);
  /** A última busca pedida: resposta de busca antiga não sobrescreve a nova. */
  const pedido = useRef(0);
  /** A data de entrada já foi acertada para o plantão da pessoa? Uma vez só. */
  const diaAcertado = useRef(false);

  const carregar = useCallback(async (silencioso = false) => {
    const meu = ++pedido.current;
    if (!silencioso) setCarregando(true);
    try {
      const r = await buscarPlantaoElite(empresaId, data);
      if (meu !== pedido.current) return;
      setResposta(r);
      setErro(null);

      // Quem é da dupla e abriu a aba em dia da outra dupla cai no último dia
      // do próprio plantão — o quadro de hoje seria o de um dia sem plantão.
      if (!diaAcertado.current) {
        diaAcertado.current = true;
        if (r.sou_da_dupla && plantaoDoDia(data) !== r.plantao) {
          setData(ultimoDiaDoPlantao(data, r.plantao));
        }
      }
    } catch (e) {
      if (meu !== pedido.current) return;
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o plantão.');
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [empresaId, data]);

  useEffect(() => { void carregar(); }, [carregar]);

  // O robô do 59 sobe o analítico de hora em hora: o sinal do banco avisa, e o
  // quadro relê em silêncio (o portão do sinal já espaça as releituras).
  useEffect(() => {
    const reler = () => { void carregar(true); };
    return assinarSinal('analitico', empresaId, { onMudou: reler, onReconectado: reler });
  }, [empresaId, carregar]);

  const quadro = useMemo(() => (resposta
    ? montarQuadroElite(resposta, faixasApuradas(data, hoje, horaAgoraSaoPaulo()))
    : null), [resposta, data, hoje]);

  // A dupla da pessoa manda na navegação: as setas pulam os dias da outra.
  const plantaoFixo = resposta?.sou_da_dupla ? resposta.plantao : null;
  const anterior = outroDiaDePlantao(data, -1, plantaoFixo);
  const seguinte = outroDiaDePlantao(data, 1, plantaoFixo);
  const diaDeEntrada = plantaoFixo ? ultimoDiaDoPlantao(hoje, plantaoFixo) : hoje;
  const foraDoPlantao = !!resposta && plantaoDoDia(data) !== resposta.plantao;

  const copiar = async () => {
    if (!folhaRef.current || !resposta) return;
    setCopiando(true);
    try {
      const nomes = resposta.membros.map(m => primeiroNome(m.nome)).join('-');
      const r = await copiarImagemDoElemento(folhaRef.current, `plantao-elite-${data}-${nomes}.png`);
      if (r === 'copiado') toast.success('Imagem copiada. É só colar no WhatsApp.');
      else toast.success('O navegador não deixou copiar: a imagem foi baixada.');
    } catch (e) {
      toast.error(`Não foi possível gerar a imagem: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
    } finally {
      setCopiando(false);
    }
  };

  const maiorHora = quadro
    ? Math.max(0, ...quadro.linhas.map(l => l.totalHora), quadro.depois?.totalHora ?? 0)
    : 0;

  return (
    <div className="space-y-4">
      <style>{CSS_FOLHA}</style>

      {/* ── Barra: data, recarregar, copiar ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-xl px-2 py-1.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setData(anterior)}
            title={plantaoFixo ? 'Plantão anterior' : 'Dia anterior'} aria-label={plantaoFixo ? 'Plantão anterior' : 'Dia anterior'}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <label className="flex items-center gap-1.5 text-sm font-semibold px-1">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="date"
              value={data}
              max={hoje}
              onChange={e => { if (e.target.value) setData(e.target.value > hoje ? hoje : e.target.value); }}
              className="bg-transparent text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label="Dia do plantão"
            />
          </label>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setData(seguinte)}
            disabled={seguinte > hoje}
            title={plantaoFixo ? 'Próximo plantão' : 'Próximo dia'} aria-label={plantaoFixo ? 'Próximo plantão' : 'Próximo dia'}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          {data !== diaDeEntrada && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-primary" onClick={() => setData(diaDeEntrada)}>
              {plantaoFixo ? 'Último plantão' : 'Hoje'}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void carregar()}
            disabled={carregando} title="Recarregar" aria-label="Recarregar">
            <RefreshCw className={cn('w-3.5 h-3.5', carregando && 'animate-spin')} />
          </Button>
        </div>

        <Button onClick={() => void copiar()} disabled={copiando || carregando || !quadro || !quadro.membros.length} className="gap-2">
          {copiando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
          Copiar imagem
        </Button>
      </div>

      {erro && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-center justify-between gap-3">
          <span>{erro}</span>
          <Button size="sm" variant="link" className="text-destructive h-auto p-0" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!quadro && carregando && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Lendo o plantão…
        </div>
      )}

      {quadro && resposta && quadro.membros.length === 0 && (
        <div className="p-6 rounded-xl border border-dashed border-border text-sm text-muted-foreground text-center">
          Nenhuma dupla cadastrada para o plantão {ROTULO_PLANTAO[resposta.plantao].toLowerCase()}.
          O cadastro fica na tabela <code>elite_plantao</code>.
        </div>
      )}

      {/* ── A folha: o que aparece aqui é o que vai na imagem ─────────────── */}
      {quadro && resposta && quadro.membros.length > 0 && (
        <div
          ref={folhaRef}
          className={cn('folha-elite w-full max-w-[760px] rounded-2xl p-5 sm:p-6 transition-opacity', carregando && 'opacity-60')}
          style={{ background: cor('fundo'), color: cor('texto'), border: `1px solid ${cor('borda')}` }}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: cor('primario') }}>
                Plantão Elite · {resposta.setor?.nome ?? 'Receptivo'}
              </div>
              <div className="mt-1 text-xl font-bold leading-tight">
                Plantão {ROTULO_PLANTAO[resposta.plantao]} — {quadro.membros.map(m => primeiroNome(m.nome)).join(' & ')}
              </div>
              <div className="mt-0.5 text-sm" style={{ color: cor('fraco') }}>
                {dataPorExtenso(data)}
                {foraDoPlantao && (
                  <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold align-middle"
                    style={{ background: cor('alertaFundo'), color: cor('alerta') }}>
                    fora do dia do plantão
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: cor('fraco') }}>
                Total do plantão
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: cor('primario') }}>
                {moeda.format(quadro.totalPlantao)}
              </div>
            </div>
          </div>

          {/* Faixas. No celular a tabela rola dentro da folha. */}
          <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px] tabular-nums" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: cor('suave'), color: cor('fraco') }}>
                <th className="text-left font-semibold text-[11px] uppercase tracking-wide py-2 pl-3 rounded-l-lg">Hora</th>
                {quadro.membros.map(m => (
                  <th key={m.id} className="text-right font-semibold text-[11px] uppercase tracking-wide py-2 px-2">
                    {primeiroNome(m.nome)} (R$)
                  </th>
                ))}
                <th className="text-left font-semibold text-[11px] uppercase tracking-wide py-2 px-2 w-[28%]">Na hora (R$)</th>
                <th className="text-right font-semibold text-[11px] uppercase tracking-wide py-2 pr-3 rounded-r-lg">Acumulado (R$)</th>
              </tr>
            </thead>
            <tbody>
              {quadro.linhas.map(l => (
                <LinhaFaixa key={l.faixa} linha={l} maiorHora={maiorHora} />
              ))}
              {quadro.depois && <LinhaFaixa linha={quadro.depois} maiorHora={maiorHora} destaque />}
            </tbody>
          </table>
          </div>

          {/* Resumo do dia */}
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: cor('fraco') }}>
            Resumo do dia
          </div>
          <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${quadro.membros.length + 1}, minmax(0, 1fr))` }}>
            {quadro.membros.map((m, i) => (
              <div key={m.id} className="rounded-xl px-3 py-2.5" style={{ background: cor('cartao'), border: `1px solid ${cor('bordaSuave')}` }}>
                <div className="text-xs font-semibold truncate">{primeiroNome(m.nome)}</div>
                <div className="mt-1 text-base font-bold tabular-nums">{moeda.format(quadro.porMembro[i].total)}</div>
                <div className="text-[11px] tabular-nums" style={{ color: cor('fraco') }}>
                  Média do dia {moeda.format(quadro.porMembro[i].media)}
                </div>
              </div>
            ))}
            <div className="rounded-xl px-3 py-2.5" style={{ background: cor('realce'), border: `1px solid ${cor('primarioClaro')}` }}>
              <div className="text-xs font-semibold truncate" style={{ color: cor('primarioEscuro') }}>
                Total do {resposta.setor?.nome ?? 'Receptivo'} no dia
              </div>
              <div className="mt-1 text-base font-bold tabular-nums" style={{ color: cor('primarioEscuro') }}>
                {resposta.setor ? moeda.format(resposta.setor.total) : '—'}
              </div>
              <div className="text-[11px]" style={{ color: cor('fraco') }}>
                {resposta.setor ? `${resposta.setor.qtd} pagamento${resposta.setor.qtd === 1 ? '' : 's'}` : 'sem setor'}
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="mt-4 pt-3 flex items-center justify-between gap-3 flex-wrap text-[11px]"
            style={{ color: cor('tenue'), borderTop: `1px solid ${cor('bordaSuave')}` }}>
            <span className="font-semibold" style={{ color: cor('primarioEscuro') }}>Gestão</span>
            <span>
              Faixa pela hora em que o pagamento chegou ao analítico
              {resposta.ultima_chegada ? ` · atualizado às ${horaDaChegada(resposta.ultima_chegada, data)}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaFaixa({ linha, maiorHora, destaque = false }: {
  linha: LinhaQuadroElite;
  maiorHora: number;
  destaque?: boolean;
}) {
  const traco = <span style={{ color: cor('tenue') }}>—</span>;
  const valor = (v: number) => (linha.aberta
    ? traco
    : <span style={{ color: v === 0 ? cor('tenue') : cor('texto') }}>{numero.format(v)}</span>);
  const largura = maiorHora > 0 && !linha.aberta ? Math.max(0, (linha.totalHora / maiorHora) * 100) : 0;

  return (
    <tr style={destaque ? { background: cor('alertaFundo') } : undefined}>
      <td className="py-1.5 pl-3 whitespace-nowrap font-medium"
        style={{ color: destaque ? cor('alerta') : cor('fraco'), borderBottom: `1px solid ${cor('bordaSuave')}` }}>
        {linha.faixa}
      </td>
      {linha.valores.map((v, i) => (
        <td key={i} className="py-1.5 px-2 text-right" style={{ borderBottom: `1px solid ${cor('bordaSuave')}` }}>
          {valor(v)}
        </td>
      ))}
      {/* A barra dá a forma do dia de relance: qual hora pagou, qual secou. */}
      <td className="py-1.5 px-2" style={{ borderBottom: `1px solid ${cor('bordaSuave')}` }}>
        <div className="relative h-5 flex items-center">
          {largura > 0 && (
            <div className="absolute left-0 top-0.5 bottom-0.5 rounded"
              style={{ width: `${largura}%`, background: cor('primarioClaro') }} />
          )}
          <span className="relative pl-1.5 font-semibold">
            {linha.aberta ? traco : (
              <span style={{ color: linha.totalHora === 0 ? cor('tenue') : cor('primarioEscuro') }}>
                {numero.format(linha.totalHora)}
              </span>
            )}
          </span>
        </div>
      </td>
      <td className="py-1.5 pr-3 text-right font-semibold" style={{ borderBottom: `1px solid ${cor('bordaSuave')}` }}>
        {linha.aberta ? traco : numero.format(linha.acumulado)}
      </td>
    </tr>
  );
}
