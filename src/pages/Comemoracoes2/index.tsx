/**
 * pages/Comemoracoes2 — a aba Comemorações refeita (2.0).
 *
 * Pedido do Cleber em 15/10/2026: refazer do zero, com o card virando um
 * cartão com papel de parede, GIFs buscados no GIPHY e um estúdio mais fácil
 * de ler. É a versão oficial desde 15/10/2026: a aba Comemorações abre aqui
 * para quem tem `comemoracoes_gerenciar`, os mesmos cargos de antes. O editor
 * 1.0 está em `arquivo-morto/comemoracoes-1.0`.
 *
 * O que NÃO mudou de propósito: quem pode criar, para quem a festa vai, o
 * disparo agendado, o volume e a pergunta do clone — são regras de negócio já
 * validadas, e vivem nos mesmos módulos da 1.0.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { Loader2, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEmpresa } from '@/hooks/useEmpresa';
import { useCargoPermissoes } from '@/hooks/useCargoPermissoes';
import { useComemoracoes } from '@/hooks/useComemoracoes';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { mesAtual, rotuloDoMes } from '@/lib/mesReferencia';
import { drenarExpurgo, listarMidias } from '@/services/comemoracaoMidias.service';
import type { Comemoracao } from '@/services/comemoracoes.service';
import { estadoDe } from '@/pages/Comemoracoes/janela';
import type { CloneVinculo } from '@/pages/Comemoracoes/clones';
import {
  alcanceDoCriador, comemoracoesNoAlcance, dadosNoAlcance, musicasNoAlcance,
} from './alcance';
import { Estudio } from './Estudio';
import { Historico } from './Historico';
import { rascunhoDeComemoracao, rascunhoInicial, type Rascunho } from './rascunho';
import type { DadosEstudio, MudarRascunho, PessoaEstudio } from './tipos';

/** O histórico olha 30 dias para trás; o overlay continua lendo só 24 h. */
const HISTORICO_MS = 30 * 24 * 3_600_000;

type Aba = 'criar' | 'historico';

export default function Comemoracoes2() {
  const { perfil, equipesLideradas } = useAuth();
  const { empresa } = useEmpresa();
  const { temPermissao } = useCargoPermissoes();

  const empresaId = empresa?.id ?? perfil?.empresa_id ?? null;
  const usuarioId = perfil?.id ?? null;
  const podeCriar = temPermissao('comemoracoes_gerenciar');
  const habilitado = podeCriar && !!empresaId;

  const { comemoracoes, loading, dbAtiva, erro, recarregar, agoraCorrigido } =
    useComemoracoes(empresaId, habilitado, HISTORICO_MS);

  const [aba, setAba] = useState<Aba>('criar');
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoInicial());
  const [dados, setDados] = useState<DadosEstudio>({ pessoas: [], equipes: [], setores: [], clones: [], musicas: null });

  const mudar: MudarRascunho = useCallback((mudanca) => {
    setRascunho((atual) => ({ ...atual, ...(typeof mudanca === 'function' ? mudanca(atual) : mudanca) }));
  }, []);

  const recarregarMusicas = useCallback(async () => {
    if (!empresaId) return;
    const musicas = await listarMidias(empresaId);
    setDados((d) => ({ ...d, musicas }));
  }, [empresaId]);

  // Pessoas, equipes, setores e clones: uma leitura por abertura da aba.
  useEffect(() => {
    if (!habilitado || !empresaId) return;
    let vivo = true;
    void (async () => {
      const [pe, eq, st, cl, musicas] = await Promise.all([
        supabase.from('perfis')
          .select('id, nome, foto_url, setor_id, equipe_id, ativo, situacao, arquivado')
          .eq('empresa_id', empresaId).order('nome'),
        supabase.from('equipes').select('id, nome, setor_id').eq('empresa_id', empresaId).order('nome'),
        supabase.from('setores').select('id, nome').eq('ativo', true).order('nome'),
        supabase.from('equipe_operadores_clones').select('operador_id, equipe_id').eq('empresa_id', empresaId),
        listarMidias(empresaId),
      ]);
      if (!vivo) return;
      // Desligado e arquivado não são homenageados nem plateia.
      const pessoas: PessoaEstudio[] = (pe.data ?? [])
        .filter((p) => p.ativo !== false && !p.arquivado && p.situacao !== 'desligado')
        .map((p) => ({ id: p.id, nome: p.nome, foto_url: p.foto_url, setor_id: p.setor_id, equipe_id: p.equipe_id }));
      setDados({
        pessoas,
        equipes: (eq.data ?? []) as DadosEstudio['equipes'],
        setores: (st.data ?? []) as DadosEstudio['setores'],
        clones:  (cl.data ?? []) as CloneVinculo[],
        musicas,
      });
    })();
    return () => { vivo = false; };
  }, [habilitado, empresaId]);

  // Fila de expurgo do Storage — mesma passada que a aba 1.0 faz ao abrir.
  useEffect(() => {
    if (!habilitado || !empresaId) return;
    void (async () => {
      const { removidos } = await drenarExpurgo(empresaId);
      if (removidos > 0) logger.info(`[Comemoracoes2] expurgo: ${removidos} arquivo(s) fora do bucket`);
    })();
  }, [habilitado, empresaId]);

  // Líder e elite só enxergam e montam festa do próprio setor (`alcance.ts`).
  const alcance = useMemo(() => alcanceDoCriador({
    cargo: perfil?.perfil, setorId: perfil?.setor_id, equipesLideradas, equipes: dados.equipes,
  }), [perfil?.perfil, perfil?.setor_id, equipesLideradas, dados.equipes]);

  const dadosVisiveis = useMemo(() => {
    // Músicas: quem tem setor vê as do próprio setor; quem não tem vê todas.
    const setoresMusica = alcance.restrito
      ? alcance.setores
      : new Set(perfil?.setor_id ? [perfil.setor_id] : []);
    return dadosNoAlcance({ ...dados, musicas: musicasNoAlcance(dados.musicas, setoresMusica, usuarioId) }, alcance);
  }, [dados, alcance, perfil?.setor_id, usuarioId]);

  const comemoracoesVisiveis = useMemo(
    () => comemoracoesNoAlcance(comemoracoes, alcance, usuarioId),
    [comemoracoes, alcance, usuarioId],
  );

  const agora = agoraCorrigido();
  const ativas = useMemo(
    () => comemoracoesVisiveis.filter((c) => estadoDe(c, agora) !== 'finalizada').length,
    [comemoracoesVisiveis, agora],
  );
  const nomeDoMes = rotuloDoMes(mesAtual()).split(' ')[0];

  function duplicar(c: Comemoracao) {
    setRascunho(rascunhoDeComemoracao(c, dados.musicas ?? []));
    setAba('criar');
  }

  if (!podeCriar) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 py-16 text-center text-muted-foreground">
        <ShieldAlert className="h-8 w-8 opacity-50" />
        <p className="text-sm">Comemorações são criadas por líderes e acima.</p>
      </div>
    );
  }

  // As prévias animam mesmo no modo leve e com "reduzir movimento": é aqui que
  // se escolhe a entrada e o efeito, e uma prévia parada não mostra nenhum.
  return (
    <MotionConfig reducedMotion="never">
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md"
            style={{ background: 'linear-gradient(135deg,#F8C846 0%,#D9861A 100%)' }}>
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Comemorações</h1>
            <p className="text-xs text-muted-foreground">Monte o card e mande para a tela de quem bateu a meta.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" title="Atualizar" aria-label="Atualizar"
            onClick={() => void recarregar()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {!dbAtiva && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          A tabela de comemorações não existe neste banco.
        </p>
      )}
      {erro && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>
      )}

      <div role="tablist" aria-label="Seções" className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
        {([['criar', 'Criar'], ['historico', 'Agenda e histórico']] as const).map(([id, nome]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              aba === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}>
            {nome}
            {id === 'historico' && ativas > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{ativas}</span>
            )}
          </button>
        ))}
      </div>

      {aba === 'criar' && empresaId && usuarioId && (
        <Estudio
          r={rascunho}
          mudar={mudar}
          substituir={setRascunho}
          dados={dadosVisiveis}
          alcance={alcance}
          empresaId={empresaId}
          usuarioId={usuarioId}
          comemoracoes={comemoracoesVisiveis}
          agoraCorrigido={agoraCorrigido}
          nomeDoMes={nomeDoMes}
          aoEnviar={recarregar}
          onMusicasMudaram={() => void recarregarMusicas()}
        />
      )}

      {aba === 'historico' && usuarioId && (
        <Historico
          comemoracoes={comemoracoesVisiveis}
          usuarioId={usuarioId}
          agoraCorrigido={agoraCorrigido}
          carregando={loading}
          onDuplicar={duplicar}
          onMudou={recarregar}
        />
      )}
    </div>
    </MotionConfig>
  );
}
