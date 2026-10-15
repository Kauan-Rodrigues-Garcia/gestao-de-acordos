/**
 * ComemoracaoOverlay — a comemoração explodindo na tela.
 *
 * Montado no `Layout`, vizinho do `AvisoNotificacaoHeader`: aparece em qualquer
 * página, que é o ponto — a meta é batida enquanto as pessoas trabalham, não
 * enquanto olham uma aba específica.
 *
 * Três decisões de convivência, porque isto passa por cima de gente atendendo:
 *   • o card NÃO bloqueia cliques (`pointer-events-none`, exceto os botões);
 *   • dá para silenciar, e a preferência fica no navegador de cada um;
 *   • uma comemoração por vez — duas sobrepostas seriam ilegíveis.
 *
 * E uma de exceção: a festa anima em TODOS os PCs, inclusive no modo leve e
 * com o "reduzir movimento" do sistema ligado (Cleber, 15/10/2026). Sem
 * animação o card só aparecia parado — e a comemoração é o movimento.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEquipesDoPerfil } from '@/hooks/useEquipesDoPerfil';
import { useEmpresa } from '@/hooks/useEmpresa';
import {
  useComemoracoes, useComemoracaoNoAr, useParabens, useMinhasEquipes,
} from '@/hooks/useComemoracoes';
import { tocarSomComemoracao, tocarArquivoDeSom, estaMudo, definirMudo } from '@/lib/som-comemoracao';
import { efeitoValido, somValido } from '@/pages/Comemoracoes/catalogo';
import { fraseValida } from '@/pages/Comemoracoes/frases';
import {
  alvoDosParabens, colegasQueCabem, sortearFraseDoAlvo, type ContextoParabens,
} from '@/pages/Comemoracoes/parabens';
import { buscarNomeDoAlvo, type AlvoTipo, type PessoaComemoracao } from '@/services/comemoracoes.service';
import { nomesDoCard } from '@/components/comemoracao2/design';
import { volumeComGanho } from '@/components/comemoracao2/musicasDoPlayer';
import { ouvirTeste, type ComemoracaoTeste } from '@/pages/Comemoracoes/testeLocal';
import { CardComemoracao } from './CardComemoracao';
import { EfeitoComemoracao } from './EfeitoComemoracao';
import {
  FilasParabens, PainelParabens, type ItemParabens, type PainelParabensProps,
} from './PainelParabens';
import { CenaV2 } from '@/components/comemoracao2/CenaV2';

/** O que a cena entrega ao painel de parabéns; a cor fica com cada cena. */
type PainelDaCena = Omit<PainelParabensProps, 'cor' | 'corTexto'>;

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'Alguém';
}

export function ComemoracaoOverlay() {
  const { perfil }  = useAuth();
  const { todas: equipesDaPessoa } = useEquipesDoPerfil();
  const { empresa } = useEmpresa();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  const setorId   = perfil?.setor_id ?? null;

  const { comemoracoes, agoraCorrigido } = useComemoracoes(empresaId, !!usuarioId);
  // Inclui as equipes em que sou clone: quem trabalha em dois times comemora
  // com os dois.
  const minhasEquipesBase = useMinhasEquipes(usuarioId, perfil?.equipe_id ?? null);
  // As que lidero entram também: comemoração da equipe é para o líder dela.
  const minhasEquipes = useMemo(
    () => [...new Set([...minhasEquipesBase, ...equipesDaPessoa])],
    [minhasEquipesBase, equipesDaPessoa],
  );
  const { atual, fechar } = useComemoracaoNoAr({
    comemoracoes,
    meuSetorId:   setorId,
    meuUsuarioId: usuarioId,
    minhasEquipes,
    agoraCorrigido,
  });

  const [mudo, setMudo] = useState(() => estaMudo());
  /** Evita tocar duas vezes a mesma comemoração se o efeito reexecutar. */
  const tocadoRef = useRef<string | null>(null);
  /**
   * Como parar a música que está tocando.
   *
   * Sem isto, fechar o card no × ou trocar de comemoração deixava a música
   * seguindo sozinha até o arquivo acabar — dez minutos de rádio em cima de
   * quem está atendendo.
   */
  const pararSomRef = useRef<(() => void) | null>(null);

  const pararSom = useCallback(() => {
    pararSomRef.current?.();
    pararSomRef.current = null;
  }, []);

  /**
   * Ensaio local do botão "Testar" — nunca vem do banco, nunca vai para os
   * outros. Ver `testeLocal.ts`.
   */
  const [teste, setTeste] = useState<ComemoracaoTeste | null>(null);
  const timerTesteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => ouvirTeste((c) => {
    if (timerTesteRef.current) clearTimeout(timerTesteRef.current);
    pararSom();
    setTeste(c);
    // Ensaio ignora o mudo: quem clicou em Testar pediu para ver E ouvir.
    if (c.somUrl) {
      pararSomRef.current = tocarArquivoDeSom(c.somUrl, true, {
        inicio: c.somInicioS, duracao: c.duracaoS, volume: c.volume,
      });
    } else {
      tocarSomComemoracao(somValido(c.som), true, c.volume ?? 100);
    }
    timerTesteRef.current = setTimeout(() => setTeste(null), c.duracaoS * 1000);
  }), [pararSom]);

  useEffect(() => () => {
    if (timerTesteRef.current) clearTimeout(timerTesteRef.current);
    pararSomRef.current?.();
  }, []);

  /**
   * Parabéns do ensaio: colegas de mentira chegando no mural e o meu clique,
   * tudo só nesta tela. Sem isto, quem monta só veria o mural numa festa de
   * verdade (pedido do Cleber, 15/10/2026).
   */
  const [itensTeste, setItensTeste] = useState<ItemParabens[]>([]);
  const [jaDeiTeste, setJaDeiTeste] = useState(false);
  const alvoTeste = teste ? alvoDosParabens(teste.alvoTipo, teste.homenageados.length) : 'individual';

  useEffect(() => {
    setItensTeste([]);
    setJaDeiTeste(false);
    if (!teste) return;
    const timers = colegasQueCabem(teste.duracaoS).map((c) => setTimeout(() => {
      setItensTeste((atual) => [{
        chave: `ensaio:${c.nome}`, nome: c.nome, foto: null,
        frase: sortearFraseDoAlvo(alvoTeste),
      }, ...atual]);
    }, c.aposMs));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [teste, alvoTeste]);

  const darParabensTeste = useCallback(() => {
    setJaDeiTeste(true);
    setItensTeste((atual) => [{
      chave: 'ensaio:eu', nome: primeiroNome(perfil?.nome), foto: perfil?.foto_url ?? null,
      frase: sortearFraseDoAlvo(alvoTeste), meu: true,
    }, ...atual]);
  }, [perfil?.nome, perfil?.foto_url, alvoTeste]);

  useEffect(() => {
    if (!atual) { tocadoRef.current = null; return; }
    if (tocadoRef.current === atual.id) return;
    tocadoRef.current = atual.id;

    pararSom();
    // O som enviado pelo líder tem precedência sobre o do catálogo, e toca a
    // partir do ponto escolhido PELO TEMPO DA COMEMORAÇÃO.
    // `?? 100` porque uma comemoração criada antes da 20260801a não tem a
    // coluna: ela deve soar exatamente como soava.
    const volume = atual.volume ?? 100;

    if (atual.som_url) {
      pararSomRef.current = tocarArquivoDeSom(atual.som_url, false, {
        inicio: atual.som_inicio_s, duracao: atual.duracao_s,
        volume: volumeComGanho(volume, atual.som_ganho ?? 1),
      });
    } else {
      tocarSomComemoracao(somValido(atual.som), false, volume);
    }
  }, [atual, pararSom]);

  // Card saiu da tela (acabou, foi fechado, ou o ensaio terminou): a música
  // para junto. O `esmaecer` do player evita o corte seco.
  useEffect(() => {
    if (!atual && !teste) pararSom();
  }, [atual, teste, pararSom]);

  /**
   * Silenciar precisa CALAR o que já está tocando, não só gravar a preferência.
   *
   * Antes só gravava: quem clicava no meio de uma música de 30 s continuava
   * ouvindo até o fim, que é justo quando alguém está em ligação e clica.
   *
   * Dessilenciar NÃO religa a música do meio: quem calou no meio da festa
   * queria silêncio, e o som voltando sozinho seria pior que o problema.
   */
  function alternarMudo() {
    const novo = !mudo;
    setMudo(novo);
    definirMudo(novo);
    if (novo) pararSom();
  }

  // ── Parabéns ───────────────────────────────────────────────────────────────
  // Só para comemoração de verdade: no ensaio não há a quem parabenizar, e
  // gravar parabéns de teste sujaria o histórico.
  const { parabens, jaParabenizei, enviando, enviarParabens } = useParabens({
    comemoracaoId: atual?.id ?? null,
    empresaId,
    usuarioId,
  });

  /**
   * Ninguém parabeniza a si mesmo.
   *
   * Sem isto o homenageado veria um botão para se aplaudir, e o próprio nome
   * subiria entre os balões dos colegas.
   */
  const souHomenageado = !!usuarioId && !!atual?.homenageados.some((p) => p.id === usuarioId);
  const podeParabenizar = !!atual && !!usuarioId && !souHomenageado;

  // Nome da equipe/setor festejado, para o convite falar dele.
  const [nomeAlvo, setNomeAlvo] = useState<string | null>(null);
  const alvoId = atual?.alvo_tipo === 'equipe' ? atual.equipe_id : atual?.alvo_tipo === 'setor' ? atual.setor_id : null;
  const alvoTipoAtual = atual?.alvo_tipo;
  useEffect(() => {
    setNomeAlvo(null);
    if (!alvoId || (alvoTipoAtual !== 'equipe' && alvoTipoAtual !== 'setor')) return;
    let vivo = true;
    void buscarNomeDoAlvo(alvoTipoAtual, alvoId).then((n) => { if (vivo) setNomeAlvo(n); });
    return () => { vivo = false; };
  }, [alvoId, alvoTipoAtual]);

  function contexto(
    alvoTipo: AlvoTipo | undefined, homenageados: PessoaComemoracao[], nome: string | null,
    equipeId: string | null, setorAlvo: string | null, ehTeste: boolean,
  ): ContextoParabens {
    const alvo = alvoDosParabens(alvoTipo, homenageados.length);
    const doMeuTime = !ehTeste && (
      alvo === 'equipe' ? !!equipeId && minhasEquipes.includes(equipeId)
      : alvo === 'setor' ? !!setorAlvo && setorAlvo === setorId
      : false);
    return {
      alvo,
      nome: alvo === 'individual' || alvo === 'grupo' ? nomesDoCard(homenageados) : (nome ?? ''),
      doMeuTime,
    };
  }

  // Mais novo primeiro: é o que entra em destaque no mural.
  const itensReais: ItemParabens[] = useMemo(() => [...parabens].reverse().map((p) => ({
    chave: p.usuario_id,
    nome:  primeiroNome(p.pessoa?.nome),
    foto:  p.pessoa?.foto_url ?? null,
    frase: fraseValida(p.frase),
    meu:   p.usuario_id === usuarioId,
  })), [parabens, usuarioId]);

  // O ensaio tem precedência: quem clicou em Testar quer ver o ensaio, não uma
  // comemoração de verdade que entrou no meio.
  const emCena = teste
    ? {
        chave:    'teste',
        titulo:   teste.titulo,
        mensagem: teste.mensagem,
        homenageados: teste.homenageados,
        gifUrl:   teste.gifUrl,
        layout:   teste.layout,
        animTexto: teste.animTexto,
        efeito:   efeitoValido(teste.efeito),
        duracaoS: teste.duracaoS,
        design:   teste.design ?? null,
        fechar:   () => setTeste(null),
        ehTeste:  true,
        painel: ((): PainelDaCena => {
          const ctx = contexto(teste.alvoTipo, teste.homenageados, teste.nomeAlvo ?? null, null, null, true);
          return {
            ctx, souHomenageado: false, pode: true, jaDei: jaDeiTeste, enviando: false,
            onDar: darParabensTeste, itens: itensTeste,
          };
        })(),
      }
    : atual
      ? {
          chave:    atual.id,
          titulo:   atual.titulo,
          mensagem: atual.mensagem,
          homenageados: atual.homenageados,
          gifUrl:   atual.gif_url,
          layout:   atual.layout,
          animTexto: atual.anim_texto,
          efeito:   efeitoValido(atual.efeito),
          duracaoS: atual.duracao_s,
          design:   atual.design ?? null,
          fechar,
          ehTeste:  false,
          painel: ((): PainelDaCena => {
            const ctx = contexto(atual.alvo_tipo, atual.homenageados, nomeAlvo, atual.equipe_id, atual.setor_id, false);
            return {
              ctx, souHomenageado, pode: podeParabenizar, jaDei: jaParabenizei, enviando,
              onDar: () => void enviarParabens(sortearFraseDoAlvo(ctx.alvo)), itens: itensReais,
            };
          })(),
        }
      : null;

  return (
    <MotionConfig reducedMotion="never">
    <AnimatePresence>
      {/* Comemoração 2.0: card sólido com papel de parede. A 1.0 segue abaixo. */}
      {emCena?.design && (
        <CenaV2
          key={emCena.chave}
          titulo={emCena.titulo}
          mensagem={emCena.mensagem}
          homenageados={emCena.homenageados}
          design={emCena.design}
          duracaoS={emCena.duracaoS}
          ehTeste={emCena.ehTeste}
          onFechar={emCena.fechar}
          mudo={mudo}
          onAlternarMudo={alternarMudo}
          parabens={emCena.painel}
        />
      )}
      {emCena && !emCena.design && (
        <motion.div
          key={emCena.chave}
          // O container inteiro ignora o mouse: sem isto a comemoração de um
          // minuto travaria quem está tabulando embaixo dela.
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-4"
          initial={{ opacity: 0, y: -60, scale: 0.9 }}
          animate={{ opacity: 1, y: 0,   scale: 1 }}
          exit={{    opacity: 0, y: -40, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          role="status"
          aria-live="polite"
        >
          <EfeitoComemoracao efeito={emCena.efeito} id={emCena.chave} />

          {/* Sem caixa colorida, o card precisa de largura para o texto
              respirar sobre a tela de trabalho. */}
          <div className="relative w-full max-w-xl">
            <FilasParabens itens={emCena.painel.itens} cor="#FBBF24" />

            {emCena.ehTeste && (
              // Deixa claro que ninguém mais está vendo isto.
              <span className="pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg">
                Teste · só você vê
              </span>
            )}

            <CardComemoracao
              titulo={emCena.titulo}
              mensagem={emCena.mensagem}
              homenageados={emCena.homenageados}
              gifUrl={emCena.gifUrl}
              layout={emCena.layout}
              animTexto={emCena.animTexto}
              tempoTotalS={emCena.duracaoS}
              onFechar={emCena.fechar}
            />

            <button
              type="button"
              onClick={alternarMudo}
              aria-label={mudo ? 'Ligar o som das comemorações' : 'Silenciar as comemorações'}
              title={mudo ? 'Som desligado' : 'Silenciar comemorações'}
              className="pointer-events-auto absolute left-0 top-0 z-20 rounded-full bg-black/40 p-1 text-white/90 transition-colors hover:bg-black/70"
            >
              {mudo ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {/* Convite e mural de parabéns — o mesmo da 2.0, no dourado da 1.0. */}
            <div className="mt-3">
              <PainelParabens {...emCena.painel} cor="#FBBF24" corTexto="#16110A" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </MotionConfig>
  );
}
