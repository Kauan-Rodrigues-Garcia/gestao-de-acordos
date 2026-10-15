/**
 * Estudio — onde a comemoração é montada.
 *
 * Duas colunas: as sete etapas à esquerda (uma aberta por vez), o palco à
 * direita com a prévia grande, o resumo de quem vai ver e os botões. O envio
 * passa pelas mesmas regras da 1.0 — inclusive a pergunta do clone — e grava
 * o card 2.0 na coluna `design`.
 */
import { useMemo, useState } from 'react';
import {
  CalendarClock, Clock, Eraser, Loader2, PartyPopper, Play, Users, Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  criarComemoracao, type Comemoracao,
} from '@/services/comemoracoes.service';
import { SONS } from '@/pages/Comemoracoes/catalogo';
import { validarAgendamento } from '@/pages/Comemoracoes/janela';
import { volumeEfetivo } from '@/pages/Comemoracoes/volume';
import { dispararTeste } from '@/pages/Comemoracoes/testeLocal';
import { ModalSetorClone } from '@/pages/Comemoracoes/ModalSetorClone';
import {
  homenageadosAmbiguos, setoresEscolhidosPara, TODOS_OS_SETORES,
  type EscolhaDeSetor, type MapasVinculo,
} from '@/pages/Comemoracoes/clones';
import {
  EFEITOS, FONTES, MODELOS, animTextoV1, efeitoV1, modeloDoDesign, type GifCard,
} from '@/components/comemoracao2/design';
import { papelDeParede } from '@/components/comemoracao2/papeisDeParede';
import { registrarGifUsado } from '@/services/gifs.service';
import { musicaDoPlayer, volumeComGanho } from '@/components/comemoracao2/musicasDoPlayer';
import { foraDoAlcance, setoresNoAlcance, type Alcance } from './alcance';
import { Etapa } from './Etapa';
import { SecaoQuem } from './SecaoQuem';
import { SecaoTexto } from './SecaoTexto';
import { SecaoEstilo, SecaoPapel } from './SecaoVisual';
import { SecaoGif } from './SecaoGif';
import { SecaoQuando, SecaoSom } from './SecaoSomQuando';
import { Palco } from './Palco';
import { FaixaMetaBatida } from './FaixaMetaBatida';
import {
  contarPlateia, pendencias, rascunhoInicial, rascunhoMetaBatida, type Rascunho,
} from './rascunho';
import type { DadosEstudio, MudarRascunho } from './tipos';

function dataHoraCurta(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function Estudio({
  r, mudar, substituir, dados, alcance, empresaId, usuarioId, comemoracoes, agoraCorrigido,
  nomeDoMes, aoEnviar, onMusicasMudaram,
}: {
  r: Rascunho;
  mudar: MudarRascunho;
  substituir: (r: Rascunho) => void;
  dados: DadosEstudio;
  /** Líder/elite: só o próprio setor. `dados` já chega filtrado. */
  alcance: Alcance;
  empresaId: string;
  usuarioId: string;
  comemoracoes: Comemoracao[];
  agoraCorrigido: () => number;
  nomeDoMes: string;
  aoEnviar: () => Promise<void>;
  onMusicasMudaram: () => void;
}) {
  const [aberta, setAberta] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [ambiguos, setAmbiguos] = useState<EscolhaDeSetor[]>([]);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  const erroAgendamento = useMemo(() => {
    if (!r.agendar) return null;
    const d = new Date(r.quando);
    if (Number.isNaN(d.getTime())) return 'Escolha a data e a hora.';
    return validarAgendamento(d.toISOString(), agoraCorrigido());
  }, [r.agendar, r.quando, agoraCorrigido]);

  const fora = foraDoAlcance(r, dados, alcance);
  const falta = fora ? [...pendencias(r, erroAgendamento), fora] : pendencias(r, erroAgendamento);
  const plateia = contarPlateia(r, dados.pessoas, dados.equipes);
  const volume = volumeEfetivo(r.volume, r.alvoTipo);
  const mapas: MapasVinculo = useMemo(
    () => ({ perfis: dados.pessoas, clones: dados.clones, equipes: dados.equipes }),
    [dados.pessoas, dados.clones, dados.equipes],
  );

  /** GIFs das últimas comemorações 2.0, sem repetir. */
  const gifsRecentes = useMemo(() => {
    const vistos = new Set<string>();
    const lista: GifCard[] = [];
    for (const c of comemoracoes) {
      const g = c.design?.gif;
      if (g && !vistos.has(g.id)) { vistos.add(g.id); lista.push(g); }
    }
    return lista;
  }, [comemoracoes]);

  // Música do player escolhida (ganha de uma música enviada e do catálogo).
  const doPlayer = musicaDoPlayer(r.design.somFaixa);

  function testar() {
    dispararTeste({
      titulo:       r.titulo.trim() || 'META BATIDA!',
      mensagem:     r.mensagem.trim() || null,
      homenageados: r.alvoTipo === 'operadores' ? r.escolhidos : [],
      efeito:       efeitoV1(r.design.efeito),
      som:          r.som,
      gifUrl:       null,
      somUrl:       doPlayer?.url ?? r.musica?.url ?? null,
      somInicioS:   Number(r.design.somInicioS ?? r.musica?.inicio_s ?? 0),
      layout:       {},
      animTexto:    animTextoV1(r.design.entrada),
      // O ensaio toca o arquivo com este volume: a música do player já vai com o ganho dela.
      volume:       doPlayer ? volumeComGanho(volume, doPlayer.ganho) : volume,
      duracaoS:     r.duracaoS,
      design:       r.design,
      // O convite do parabéns fala como na festa de verdade.
      alvoTipo:     r.alvoTipo,
      nomeAlvo:     r.alvoTipo === 'equipe' ? dados.equipes.find((e) => e.id === r.equipeId)?.nome ?? null
        : r.alvoTipo === 'setor' ? dados.setores.find((s) => s.id === r.setorId)?.nome ?? null
        : null,
    });
  }

  /** Quem trabalha em dois setores gera a pergunta antes de criar. */
  function aoClicarEnviar() {
    if (r.alvoTipo !== 'operadores') { void comemorar(); return; }
    // Para o líder restrito, só os setores dele contam: o clone que também
    // trabalha em outro setor é comemorado aqui, e a pergunta nem aparece.
    const pend = homenageadosAmbiguos(r.escolhidos.map((p) => p.id), mapas)
      .map((a) => ({ ...a, setores: setoresNoAlcance(a.setores, alcance) }))
      .filter((a) => a.setores.length > 1);
    if (pend.length === 0) { void comemorar(); return; }
    setRespostas(Object.fromEntries(pend.map((a) => [a.operadorId, TODOS_OS_SETORES])));
    setAmbiguos(pend);
  }

  async function comemorar(escolhas: Record<string, string> = {}) {
    if (falta.length) { toast.error(falta[0]); return; }
    const operadorIds = r.escolhidos.map((p) => p.id);
    setEnviando(true);
    try {
      const { ok, erro } = await criarComemoracao({
        empresaId, criadoPor: usuarioId,
        titulo: r.titulo, mensagem: r.mensagem || null,
        efeito: efeitoV1(r.design.efeito),
        som: r.som,
        duracaoS: r.duracaoS,
        operadorIds,
        iniciaEm: r.agendar ? new Date(r.quando).toISOString() : undefined,
        // Música do player vai no `design`; a coluna da música enviada fica vazia.
        somMidiaId: doPlayer ? null : r.musica?.id ?? null,
        animTexto: animTextoV1(r.design.entrada),
        volume,
        alvoTipo: r.alvoTipo,
        equipeId: r.alvoTipo === 'equipe' ? r.equipeId : null,
        setorId:  r.alvoTipo === 'setor'  ? r.setorId  : null,
        somenteEquipe: r.alvoTipo !== 'setor' && r.somenteEquipe,
        setoresPorOperador: r.alvoTipo === 'operadores'
          ? Object.fromEntries(operadorIds.map((id) => [
              id, setoresNoAlcance(setoresEscolhidosPara(id, escolhas[id], mapas), alcance),
            ]))
          : undefined,
        design: r.design,
      });
      if (!ok) { toast.error(erro ?? 'Não foi possível enviar a comemoração.'); return; }
      // Entra em "Usados recentemente" para todo mundo.
      if (r.design.comMidia && r.design.gif) void registrarGifUsado(r.design.gif);
      toast.success(r.agendar ? 'Comemoração agendada.' : 'Comemoração no ar!');
      setAmbiguos([]);
      setRespostas({});
      // O visual fica para a próxima; quem e o quê recomeçam.
      mudar({ escolhidos: [], mensagem: '', agendar: false });
      setAberta(1);
      await aoEnviar();
    } finally {
      setEnviando(false);
    }
  }

  // ── Resumos das etapas fechadas ────────────────────────────────────────────
  const resumoQuem =
    r.alvoTipo === 'equipe' ? (dados.equipes.find((e) => e.id === r.equipeId)?.nome ?? 'Escolha a equipe')
    : r.alvoTipo === 'setor' ? `${dados.setores.find((s) => s.id === r.setorId)?.nome ?? 'Escolha o setor'} · empresa inteira vê`
    : r.escolhidos.length ? r.escolhidos.map((p) => p.nome.split(' ')[0]).join(', ')
    : 'Ninguém escolhido';
  const alvoIncompleto =
    (r.alvoTipo === 'operadores' && !r.escolhidos.length)
    || (r.alvoTipo === 'equipe' && !r.equipeId) || (r.alvoTipo === 'setor' && !r.setorId);
  const modelo = modeloDoDesign(r.design);
  const resumoEstilo = [
    modelo ? MODELOS.find((m) => m.id === modelo)?.nome : 'Personalizado',
    FONTES.find((f) => f.id === r.design.fonte)?.nome,
    EFEITOS.find((e) => e.id === r.design.efeito)?.nome,
  ].join(' · ');
  const resumoGif = !r.design.comMidia ? 'Sem imagem (só texto)' : r.design.gif ? (r.design.gif.titulo || 'GIF escolhido') : 'Troféu (sem GIF)';
  const resumoSom = `${doPlayer?.nome ?? r.musica?.nome ?? SONS.find((s) => s.id === r.som)?.nome ?? '—'} · ${volume}%`;
  const resumoQuando = `${r.agendar ? dataHoraCurta(r.quando) : 'Agora'} · ${r.duracaoS}s na tela`;

  const etapa = (n: number) => ({ numero: n, aberta: aberta === n, onAbrir: () => setAberta(aberta === n ? 0 : n) });

  return (
    <div className="space-y-4">
      <FaixaMetaBatida
        empresaId={empresaId}
        pessoas={dados.pessoas}
        comemoracoes={comemoracoes}
        nomeDoMes={nomeDoMes}
        onUsar={(op) => {
          substituir(rascunhoMetaBatida(r, op, nomeDoMes));
          setAberta(2);
          toast.success(`Festa de ${op.nome.split(' ')[0]} montada. Ajuste o que quiser e envie.`);
        }}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Montagem</p>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => { substituir(rascunhoInicial()); setAberta(1); }}>
              <Eraser className="h-3 w-3" /> Recomeçar
            </Button>
          </div>

          <Etapa {...etapa(1)} titulo="Quem bateu a meta" resumo={resumoQuem} alerta={alvoIncompleto}>
            <SecaoQuem r={r} mudar={mudar} dados={dados} />
          </Etapa>
          <Etapa {...etapa(2)} titulo="Texto" resumo={r.titulo || 'Sem título'} alerta={!r.titulo.trim()}>
            <SecaoTexto r={r} mudar={mudar} nomeDoMes={nomeDoMes} />
          </Etapa>
          <Etapa {...etapa(3)} titulo="Papel de parede" resumo={papelDeParede(r.design.papel).nome}>
            <SecaoPapel r={r} mudar={mudar} />
          </Etapa>
          <Etapa {...etapa(4)} titulo="Estilo e animação" resumo={resumoEstilo}>
            <SecaoEstilo r={r} mudar={mudar} />
          </Etapa>
          <Etapa {...etapa(5)} titulo="GIF" resumo={resumoGif}>
            <SecaoGif r={r} mudar={mudar} empresaId={empresaId} usuarioId={usuarioId} recentes={gifsRecentes} />
          </Etapa>
          <Etapa {...etapa(6)} titulo="Som" resumo={resumoSom}>
            <SecaoSom r={r} mudar={mudar} musicas={dados.musicas}
              empresaId={empresaId} usuarioId={usuarioId} onMusicasMudaram={onMusicasMudaram} />
          </Etapa>
          <Etapa {...etapa(7)} titulo="Quando" resumo={resumoQuando} alerta={!!erroAgendamento}>
            <SecaoQuando r={r} mudar={mudar} erroAgendamento={erroAgendamento} />
          </Etapa>
        </div>

        <div className="space-y-3 lg:sticky lg:top-2">
          <Palco r={r} mudar={mudar} />

          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {plateia > 0
                  ? <>Aparece para <strong className="text-foreground">cerca de {plateia} {plateia === 1 ? 'pessoa' : 'pessoas'}</strong>{r.alvoTipo === 'setor' && ' (empresa inteira)'}</>
                  : 'Escolha para quem é'}
              </span>
              <span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" />{volume}%</span>
              <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{r.duracaoS}s</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />{r.agendar ? dataHoraCurta(r.quando) : 'Agora'}
              </span>
            </div>

            {falta.length > 0 && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{falta.join(' ')}</p>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="gap-2" onClick={testar} title="Aparece só na sua tela. Ninguém mais vê.">
                <Play className="h-4 w-4" /> Testar na minha tela
              </Button>
              <Button className={cn('flex-1 gap-2')} disabled={enviando || falta.length > 0} onClick={aoClicarEnviar}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" />
                  : r.agendar ? <CalendarClock className="h-4 w-4" /> : <PartyPopper className="h-4 w-4" />}
                {r.agendar ? 'Agendar comemoração' : 'Comemorar agora'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ModalSetorClone
        ambiguos={ambiguos}
        respostas={respostas}
        nomeDaPessoa={(id) => dados.pessoas.find((p) => p.id === id)?.nome ?? 'Operador'}
        nomeDoSetor={(id) => dados.setores.find((s) => s.id === id)?.nome ?? 'Setor'}
        agendando={r.agendar}
        confirmando={enviando}
        onResponder={(operadorId, escolha) => setRespostas((a) => ({ ...a, [operadorId]: escolha }))}
        onConfirmar={() => void comemorar(respostas)}
        onCancelar={() => setAmbiguos([])}
      />
    </div>
  );
}
