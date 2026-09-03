/**
 * UsuariosDoMesPainel.tsx — a aba Usuários de um mês FECHADO.
 *
 * ## Por que é uma tela separada, e não a de sempre com um filtro
 *
 * A tela de Usuários é de OPERAÇÃO: cria conta, troca senha, muda cargo,
 * transfere de setor, desliga. Nada disso faz sentido sobre um mês que já
 * acabou — e pior, alguns desses botões escrevem em `perfis`, que é o estado de
 * HOJE. Um formulário de edição aberto sobre a lista de agosto salvaria em
 * setembro sem avisar ninguém.
 *
 * Então o mês fechado tem tela própria, e ela é só de leitura. É o mesmo
 * contrato do retrato: depois que o mês fecha, ninguém reescreve.
 *
 * ## As tags
 *
 * Cada pessoa mostra o que aconteceu com ela DEPOIS daquele mês — mudou de
 * setor, de equipe, de cargo, foi desligada, foi excluída. Não é informação
 * guardada: é a diferença entre o retrato e o estado de hoje, calculada na
 * hora. Ver `usuariosDoMes.service`.
 *
 * É a parte que transforma a lista de «uma foto antiga» em «o que aconteceu com
 * o meu time»: olhando agosto dá para ver, pessoa por pessoa, para onde cada
 * uma foi.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Users, Building2, Layers, Search, ArrowRight, UserX, LogOut, Loader2, Camera,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { rotuloDoMes } from '@/lib/mesReferencia';
import {
  buscarUsuariosDoMes,
  type RetratoUsuarios, type UsuarioDoMes, type MudancaDesdeOMes,
} from '@/services/admin/usuariosDoMes.service';

type Secao = 'usuarios' | 'setores' | 'equipes';

interface Props {
  empresaId: string;
  mes: string;
}

export function UsuariosDoMesPainel({ empresaId, mes }: Props) {
  const [dados, setDados] = useState<RetratoUsuarios | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [secao, setSecao] = useState<Secao>('usuarios');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setDados(null);
    void buscarUsuariosDoMes(empresaId, mes).then(r => {
      if (cancelado) return;
      setDados(r);
      setCarregando(false);
    });
    return () => { cancelado = true; };
  }, [empresaId, mes]);

  const termo = busca.trim().toLowerCase();
  const usuarios = useMemo(() => {
    const lista = dados?.usuarios ?? [];
    if (!termo) return lista;
    return lista.filter(u =>
      u.nome.toLowerCase().includes(termo)
      || (u.usuario ?? '').toLowerCase().includes(termo)
      || (u.setor_nome ?? '').toLowerCase().includes(termo)
      || (u.equipe_nome ?? '').toLowerCase().includes(termo));
  }, [dados, termo]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando {rotuloDoMes(mes)}…
      </div>
    );
  }

  if (!dados) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center space-y-1">
          <Camera className="w-6 h-6 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-medium">Não há retrato de {rotuloDoMes(mes)}</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            A foto do mês passou a ser guardada em agosto de 2026. Meses
            anteriores a isso não têm como ser reconstruídos.
          </p>
        </CardContent>
      </Card>
    );
  }

  const comMudanca = dados.usuarios.filter(u => u.mudancas.length > 0).length;

  const SECOES: { chave: Secao; rotulo: string; icone: React.ReactNode; total: number }[] = [
    { chave: 'usuarios', rotulo: 'Usuários', icone: <Users className="w-3.5 h-3.5" />,     total: dados.usuarios.length },
    { chave: 'setores',  rotulo: 'Setores',  icone: <Building2 className="w-3.5 h-3.5" />, total: dados.setores.length },
    { chave: 'equipes',  rotulo: 'Equipes',  icone: <Layers className="w-3.5 h-3.5" />,    total: dados.equipes.length },
  ];

  return (
    <div className="space-y-3">
      {/* O aviso do topo: por que esta tela não tem botão de editar. */}
      <Card className="border-amber-500/30 bg-amber-500/[0.06]">
        <CardContent className="p-3 flex items-start gap-2">
          <Camera className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-0.5">
            <p className="text-xs font-semibold">
              {rotuloDoMes(mes)} — como estava no fim do mês
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Somente leitura: mês fechado não se edita. Cargos, setores e
              equipes são os daquele mês, e {comMudanca === 0
                ? 'ninguém mudou desde então'
                : `${comMudanca} ${comMudanca === 1 ? 'pessoa mudou' : 'pessoas mudaram'} desde então — as etiquetas dizem para onde foram`}.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-muted/40 p-0.5">
          {SECOES.map(s => (
            <button
              key={s.chave}
              type="button"
              onClick={() => setSecao(s.chave)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                secao === s.chave
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.icone} {s.rotulo}
              <span className="opacity-60">{s.total}</span>
            </button>
          ))}
        </div>

        {secao === 'usuarios' && (
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, login, setor ou equipe…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}
      </div>

      {secao === 'usuarios' && (
        usuarios.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Ninguém com esse termo em {rotuloDoMes(mes)}.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {usuarios.map(u => <CardPessoa key={u.id} u={u} />)}
          </div>
        )
      )}

      {secao === 'setores' && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {dados.setores.map(s => (
            <Card key={s.id} className={cn(s.extinto && 'border-dashed opacity-80')}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{s.nome}</span>
                  {s.alternativo && <Etiqueta tom="roxo">alternativo</Etiqueta>}
                  {!s.ativo && <Etiqueta tom="neutro">inativo</Etiqueta>}
                  {s.extinto && <Etiqueta tom="vermelho">não existe mais</Etiqueta>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {s.pessoas} {s.pessoas === 1 ? 'pessoa' : 'pessoas'} no mês
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {secao === 'equipes' && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {dados.equipes.map(e => (
            <Card key={e.id} className={cn(e.extinta && 'border-dashed opacity-80')}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{e.nome}</span>
                  {e.extinta && <Etiqueta tom="vermelho">não existe mais</Etiqueta>}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {e.setor_nome ?? 'sem setor'} · {e.pessoas}{' '}
                  {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
                </p>
                {e.nomeHoje && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 shrink-0" /> hoje se chama «{e.nomeHoje}»
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CardPessoa({ u }: { u: UsuarioDoMes }) {
  const saiu = u.mudancas.some(m => m.tipo === 'excluido');
  return (
    <Card className={cn(saiu && 'border-dashed opacity-90')}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{u.nome}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {u.usuario ? `@${u.usuario}` : u.email ?? '—'}
            </p>
          </div>
          <Etiqueta tom="neutro">{u.cargo}</Etiqueta>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {u.setor_nome ?? 'sem setor'} · {u.equipe_nome ?? 'sem equipe'}
          {u.situacao !== 'ativo' && ` · ${u.situacao}`}
        </p>

        {u.mudancas.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t border-border/60 pt-1.5">
            {u.mudancas.map((m, i) => <TagMudanca key={i} m={m} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** O que mudou depois do mês — a etiqueta que conta a história. */
function TagMudanca({ m }: { m: MudancaDesdeOMes }) {
  if (m.tipo === 'excluido') {
    return (
      <Etiqueta tom="vermelho">
        <UserX className="w-2.5 h-2.5" /> excluído depois
      </Etiqueta>
    );
  }
  if (m.tipo === 'desligado') {
    return (
      <Etiqueta tom="vermelho">
        <LogOut className="w-2.5 h-2.5" /> desligado depois
      </Etiqueta>
    );
  }
  const rotulo = { setor: 'setor', equipe: 'equipe', cargo: 'cargo', nome: 'nome' }[m.tipo];
  return (
    <Etiqueta tom="ambar">
      {rotulo}: {m.de} <ArrowRight className="w-2.5 h-2.5" /> {m.para}
    </Etiqueta>
  );
}

const TONS = {
  neutro:   'bg-muted text-muted-foreground border-border',
  ambar:    'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  vermelho: 'bg-destructive/10 text-destructive border-destructive/30',
  roxo:     'bg-primary/10 text-primary border-primary/30',
} as const;

function Etiqueta({
  tom, children,
}: { tom: keyof typeof TONS; children: React.ReactNode }) {
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium',
      TONS[tom],
    )}>
      {children}
    </span>
  );
}
