/**
 * ListaPessoas — a lista de gente da aba Usuários.
 *
 * ## Por que existe como componente
 *
 * A tabela morava dentro de `AdminUsuarios.tsx`, que já passava de 1.600
 * linhas. Ao ganhar busca, seleção múltipla e transferência ela passaria de
 * 1.900 — e o arquivo deixaria de caber na cabeça de quem o abre.
 *
 * ## Por que não é mais um `<table>`
 *
 * Era uma tabela `table-fixed` com `min-w-[700px]`: em tela de notebook ela
 * rolava na horizontal, e as seis colunas de largura percentual espremiam o
 * nome — a única coluna que alguém realmente lê — para caber uma coluna
 * «Empresa» que repetia o mesmo valor em todas as linhas.
 *
 * Agora é uma lista em flex com larguras fixas por coluna. O alinhamento entre
 * linhas é o mesmo de uma tabela; a diferença é que as colunas secundárias
 * SOMEM em tela estreita em vez de empurrar a rolagem, e o nome fica com o
 * espaço que sobra.
 *
 * ## A régua de colunas
 *
 * `COL` é a fonte única das larguras. O cabeçalho e as linhas leem daqui —
 * mudar uma largura em dois lugares é como as colunas desalinham.
 */
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, ChevronDown, Edit, LogIn, Loader2, Shield, ArrowRightLeft,
  Users2, UserCircle2,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import type { Perfil, SituacaoUsuario } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/** `_cloneDe` marca quem aparece aqui por ser clone de OUTRO setor. */
export type PerfilComClone = Perfil & { _cloneDe?: string | null };

export interface GrupoDeSetor {
  id: string;
  nomeSetor: string;
  lista: PerfilComClone[];
}

/** Larguras das colunas — o cabeçalho e as linhas leem daqui. */
const COL = {
  cargo:    'w-[132px] shrink-0 hidden md:block',
  equipe:   'w-[150px] shrink-0 hidden xl:block',
  empresa:  'w-[132px] shrink-0 hidden lg:block',
  situacao: 'w-[128px] shrink-0 hidden sm:block',
  acoes:    'w-[104px] shrink-0',
};

const SITU_DOT: Record<SituacaoUsuario, string> = {
  ativo:     'bg-success',
  ferias:    'bg-warning',
  desligado: 'bg-destructive',
};
const SITU_LABEL: Record<SituacaoUsuario, string> = {
  ativo: 'Ativo', ferias: 'Férias', desligado: 'Desligado',
};

interface Props {
  grupos: GrupoDeSetor[];
  /** Vazio = nada recolhido. Guarda os FECHADOS para um setor novo nascer aberto. */
  recolhidos: Set<string>;
  onAlternarSetor: (sid: string) => void;
  /** Busca ativa força tudo aberto: esconder resultado é o oposto de buscar. */
  buscaAtiva: boolean;

  selecionados: Set<string>;
  onAlternarSelecao: (id: string) => void;
  onSelecionarGrupo: (ids: string[], marcar: boolean) => void;

  onlineIds: Set<string>;
  perfilAtualId?: string;
  impersonando: string | null;

  podeTransferir: boolean;
  podeGerenciarSituacao: boolean;
  podeImpersonar: boolean;
  /** Cada linha pergunta: esta pessoa, eu posso editar? */
  podeEditar: (u: PerfilComClone) => boolean;

  mostrarEmpresa: boolean;
  nomeEmpresa: (u: Perfil) => string;
  nomeEquipe: (u: Perfil) => string | null;

  onEditar: (u: Perfil) => void;
  onTransferir: (u: Perfil) => void;
  onSituacao: (u: Perfil, s: SituacaoUsuario) => void;
  onEntrarComo: (u: Perfil) => void;
  onVerFoto: (f: { url: string; nome: string }) => void;
}

export function ListaPessoas({
  grupos, recolhidos, onAlternarSetor, buscaAtiva,
  selecionados, onAlternarSelecao, onSelecionarGrupo,
  onlineIds, perfilAtualId, impersonando,
  podeTransferir, podeGerenciarSituacao, podeImpersonar, podeEditar,
  mostrarEmpresa, nomeEmpresa, nomeEquipe,
  onEditar, onTransferir, onSituacao, onEntrarComo, onVerFoto,
}: Props) {
  return (
    <div className="space-y-3">
      {/* ── Régua de colunas ──────────────────────────────────────────────
          Fica fora dos cartões e sticky: com nove setores abertos, rolar
          perdia de vista o que cada coluna era. */}
      <div className={cn(
        'sticky top-0 z-10 -mx-1 px-1 py-1.5',
        'bg-background/85 backdrop-blur-sm',
        'flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider',
        'text-muted-foreground/70',
      )}>
        {podeTransferir && <span className="w-4 shrink-0" aria-hidden />}
        {/* `pl-12` = 48px = avatar (w-9, 36px) + o `gap-3` (12px) que vem
            depois dele na linha. É o que põe este rótulo exatamente sobre o
            nome, em vez de quase. */}
        <span className="flex-1 min-w-0 pl-12">Pessoa</span>
        <span className={COL.cargo}>Cargo</span>
        <span className={COL.equipe}>Equipe</span>
        {mostrarEmpresa && <span className={COL.empresa}>Empresa</span>}
        <span className={COL.situacao}>Situação</span>
        <span className={cn(COL.acoes, 'text-right')}>Ações</span>
      </div>

      {grupos.map(grupo => {
        const fechado = !buscaAtiva && recolhidos.has(grupo.id);
        // Clones não entram na seleção: eles são geridos no setor de origem.
        const selecionaveis = grupo.lista.filter(u => !u._cloneDe).map(u => u.id);
        const todosMarcados = selecionaveis.length > 0
          && selecionaveis.every(id => selecionados.has(id));

        return (
          <section key={grupo.id}>
            {/* ── Faixa do setor ──────────────────────────────────────────
                Deixou de ser um texto solto com um chevron: é uma faixa com
                fundo próprio, porque ela separa BLOCOS e precisa ter o peso
                visual de uma separação. */}
            <div className={cn(
              'flex items-center gap-2 rounded-t-xl border border-b-0 border-border',
              'bg-gradient-to-r from-muted/60 to-muted/20 px-3 py-2',
              fechado && 'rounded-b-xl border-b',
            )}>
              <button
                type="button"
                onClick={() => onAlternarSetor(grupo.id)}
                aria-expanded={!fechado}
                disabled={buscaAtiva}
                className="flex items-center gap-2 flex-1 min-w-0 text-left group/setor disabled:cursor-default"
              >
                <ChevronDown className={cn(
                  'w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200',
                  fechado && '-rotate-90',
                )} />
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground truncate group-hover/setor:text-primary transition-colors">
                  {grupo.nomeSetor}
                </span>
                <span className="text-[10px] font-medium text-muted-foreground bg-background/80 border border-border rounded-full px-2 py-0.5 shrink-0">
                  {grupo.lista.length}
                </span>
              </button>

              {podeTransferir && selecionaveis.length > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer shrink-0 px-1">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={() => onSelecionarGrupo(selecionaveis, !todosMarcados)}
                    className="h-3.5 w-3.5 accent-primary cursor-pointer"
                  />
                  Todos
                </label>
              )}
            </div>

            <AnimatePresence initial={false}>
              {!fechado && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="rounded-b-xl border border-border bg-card divide-y divide-border/50">
                    {grupo.lista.map(u => (
                      <LinhaPessoa
                        key={u._cloneDe ? `clone-${u.id}-${grupo.id}` : u.id}
                        u={u}
                        online={onlineIds.has(u.id)}
                        souEu={u.id === perfilAtualId}
                        selecionado={selecionados.has(u.id)}
                        impersonando={impersonando === u.id}
                        podeTransferir={podeTransferir}
                        podeGerenciarSituacao={podeGerenciarSituacao}
                        podeImpersonar={podeImpersonar}
                        podeEditar={podeEditar(u)}
                        mostrarEmpresa={mostrarEmpresa}
                        nomeEmpresa={nomeEmpresa(u)}
                        nomeEquipe={nomeEquipe(u)}
                        onAlternarSelecao={onAlternarSelecao}
                        onEditar={onEditar}
                        onTransferir={onTransferir}
                        onSituacao={onSituacao}
                        onEntrarComo={onEntrarComo}
                        onVerFoto={onVerFoto}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

// ─── Uma pessoa ─────────────────────────────────────────────────────────────

interface LinhaProps {
  u: PerfilComClone;
  online: boolean;
  souEu: boolean;
  selecionado: boolean;
  impersonando: boolean;
  podeTransferir: boolean;
  podeGerenciarSituacao: boolean;
  podeImpersonar: boolean;
  podeEditar: boolean;
  mostrarEmpresa: boolean;
  nomeEmpresa: string;
  nomeEquipe: string | null;
  onAlternarSelecao: (id: string) => void;
  onEditar: (u: Perfil) => void;
  onTransferir: (u: Perfil) => void;
  onSituacao: (u: Perfil, s: SituacaoUsuario) => void;
  onEntrarComo: (u: Perfil) => void;
  onVerFoto: (f: { url: string; nome: string }) => void;
}

function LinhaPessoa({
  u, online, souEu, selecionado, impersonando,
  podeTransferir, podeGerenciarSituacao, podeImpersonar, podeEditar,
  mostrarEmpresa, nomeEmpresa, nomeEquipe,
  onAlternarSelecao, onEditar, onTransferir, onSituacao, onEntrarComo, onVerFoto,
}: LinhaProps) {
  const ehClone = !!u._cloneDe;
  const situacao = u.situacao ?? 'ativo';
  const iniciais = u.nome.split(' ').map(n => n[0]).slice(0, 2).join('');

  return (
    <div className={cn(
      'group/linha flex items-center gap-3 px-3 py-2.5 transition-colors',
      selecionado ? 'bg-primary/[0.07]' : 'hover:bg-accent/40',
    )}>
      {/* Seleção — clone não entra: ele é gerido no setor de origem. */}
      {podeTransferir && (
        ehClone ? <span className="w-4 shrink-0" aria-hidden /> : (
          <input
            type="checkbox"
            checked={selecionado}
            onChange={() => onAlternarSelecao(u.id)}
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
            aria-label={`Selecionar ${u.nome}`}
          />
        )
      )}

      {/* ── Pessoa ──────────────────────────────────────────────────────
          O «● Online» escrito embaixo do nome saiu: a bolinha no avatar já
          diz isso, e dizer duas vezes custava a linha onde o login mora. */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => { if (u.foto_url) onVerFoto({ url: u.foto_url, nome: u.nome }); }}
            title={u.foto_url ? 'Ver foto em tamanho maior' : undefined}
            className={cn('block rounded-full transition-transform', u.foto_url && 'hover:scale-105')}
          >
            <Avatar className="w-9 h-9">
              {u.foto_url && <AvatarImage src={u.foto_url} alt={u.nome} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {iniciais}
              </AvatarFallback>
            </Avatar>
          </button>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
              online ? 'bg-success' : 'bg-muted-foreground/30',
            )}
            title={online ? 'Online agora' : 'Offline'}
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-medium text-foreground text-sm truncate">{u.nome}</p>
            {souEu && (
              <span className="text-[9px] bg-primary/15 text-primary border border-primary/30 rounded px-1 py-0 font-bold shrink-0">
                Você
              </span>
            )}
            {ehClone && (
              <span
                className="text-[9px] bg-warning/15 text-warning border border-warning/30 rounded px-1 py-0 font-semibold whitespace-nowrap shrink-0"
                title={`Operador clonado do setor ${u._cloneDe}`}
              >
                clone de {u._cloneDe}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono truncate" title={u.email}>
            {u.usuario || u.email}
          </p>
        </div>
      </div>

      {/* ── Cargo ── */}
      <div className={COL.cargo}>
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium border',
          PERFIL_COLORS[u.perfil] ?? 'bg-muted/10 text-muted-foreground border-border',
        )}>
          <Shield className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{PERFIL_LABELS[u.perfil] ?? u.perfil}</span>
        </span>
      </div>

      {/* ── Equipe ──────────────────────────────────────────────────────
          Coluna nova. Antes, saber a equipe de alguém exigia abrir OUTRA aba
          e escolher o setor de novo. */}
      <div className={cn(COL.equipe, 'text-xs text-muted-foreground')}>
        {nomeEquipe ? (
          <span className="flex items-center gap-1.5 truncate" title={nomeEquipe}>
            <Users2 className="w-3 h-3 shrink-0 opacity-70" />
            <span className="truncate">{nomeEquipe}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </div>

      {/* ── Empresa: só quando há mais de uma para distinguir ── */}
      {mostrarEmpresa && (
        <div className={cn(COL.empresa, 'text-xs text-muted-foreground')}>
          <span className="flex items-center gap-1.5 truncate" title={nomeEmpresa}>
            <Building2 className="w-3 h-3 shrink-0 opacity-70" />
            <span className="truncate">{nomeEmpresa}</span>
          </span>
        </div>
      )}

      {/* ── Situação ── */}
      <div className={COL.situacao}>
        {podeGerenciarSituacao && !ehClone ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1',
                'text-[11px] font-medium transition-colors hover:bg-accent hover:border-primary/40',
              )}>
                <span className={cn('inline-flex w-2 h-2 rounded-full shrink-0', SITU_DOT[situacao])} />
                {SITU_LABEL[situacao]}
                {/* A data responde «até quando», que é a pergunta seguinte. */}
                {situacao === 'ferias' && u.ferias_ate && (
                  <span className="tabular-nums text-muted-foreground">
                    até {u.ferias_ate.slice(8, 10)}/{u.ferias_ate.slice(5, 7)}
                  </span>
                )}
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(['ativo', 'ferias', 'desligado'] as SituacaoUsuario[]).map(s => (
                <DropdownMenuItem key={s} className="gap-2 text-xs" onClick={() => onSituacao(u, s)}>
                  <span className={cn('inline-flex w-2 h-2 rounded-full', SITU_DOT[s])} />
                  {SITU_LABEL[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn('inline-flex w-2 h-2 rounded-full shrink-0', SITU_DOT[situacao])} />
            {SITU_LABEL[situacao]}
          </span>
        )}
      </div>

      {/* ── Ações ───────────────────────────────────────────────────────
          Ícones sempre presentes, mas apagados até o ponteiro chegar na
          linha. `focus-within` mantém o teclado no jogo — esconder no
          `:hover` sozinho tornaria os botões inalcançáveis sem mouse. */}
      <div className={cn(
        COL.acoes,
        'flex items-center justify-end gap-0.5',
        'opacity-60 group-hover/linha:opacity-100 focus-within:opacity-100 transition-opacity',
      )}>
        {ehClone ? (
          <span className="text-[10px] text-muted-foreground italic pr-1" title="Este é um clone: edite a pessoa no setor de origem">
            no setor de origem
          </span>
        ) : (
          <>
            {podeImpersonar && !souEu && (
              <Button
                variant="ghost" size="icon"
                className="w-7 h-7 text-warning hover:text-warning hover:bg-warning/10"
                title="Entrar como este usuário (impersonação — super admin)"
                disabled={impersonando}
                onClick={() => onEntrarComo(u)}
              >
                {impersonando
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <LogIn className="w-3.5 h-3.5" />}
              </Button>
            )}
            {podeTransferir && (
              <Button
                variant="ghost" size="icon"
                className="w-7 h-7 hover:text-primary hover:bg-primary/10"
                title="Transferir de setor ou empresa"
                onClick={() => onTransferir(u)}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </Button>
            )}
            {podeEditar && (
              <Button
                variant="ghost" size="icon"
                className="w-7 h-7 hover:text-primary hover:bg-primary/10"
                title="Editar usuário (dados, foto e senha)"
                onClick={() => onEditar(u)}
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Vazio da lista — separado para a página não repetir o desenho. */
export function ListaPessoasVazia({ busca }: { busca: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">
      <UserCircle2 className="w-7 h-7 opacity-50" />
      {busca
        ? <p>Ninguém encontrado para <strong className="text-foreground">{busca}</strong>.</p>
        : <p>Nenhum usuário encontrado.</p>}
    </div>
  );
}
