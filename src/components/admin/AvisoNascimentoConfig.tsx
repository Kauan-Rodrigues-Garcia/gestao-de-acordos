/**
 * AvisoNascimentoConfig.tsx — o aviso de nascimento em Configurações › Eventos e gincanas.
 *
 * Administrador e super_admin acompanham quem viu e leem os recadinhos. Enviar a
 * foto, liberar e recolher são do super_admin. O banco confere tudo de novo
 * (migration 20261118150000).
 */
import { Suspense, lazy, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Baby, ChevronDown, Copy, Eye, ImageUp, Loader2, Send, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { copiarTexto } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import {
  enviarFoto, liberarAviso, lerPainel, mensagemDoErro, urlDaFoto, type AvisoNoPainel,
} from '@/components/AvisoNascimento/banco';

const TelaNascimento = lazy(() => import('@/components/AvisoNascimento/TelaNascimento'));
const quando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  : '—');

function Aviso({ a }: { a: AvisoNoPainel }) {
  const superAdmin = a.posso_liberar;
  const cliente = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'recados' | 'faltam' | 'viram'>('recados');
  const [confirmar, setConfirmar] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);

  const noAr = !!a.liberado_em && !a.encerrado_em;
  const publico = a.pessoas.filter(p => p.no_publico);
  const viram = publico.filter(p => p.viu_em);
  const faltam = publico.filter(p => !p.viu_em);
  const recados = a.pessoas.filter(p => p.recado).sort((x, y) => (y.recado_em ?? '').localeCompare(x.recado_em ?? ''));
  const reler = () => cliente.invalidateQueries({ queryKey: ['aviso-nascimento'] });

  async function acao(fazer: () => Promise<unknown>, ok: string) {
    setOcupado(true);
    try { await fazer(); toast.success(ok); await reler(); }
    catch (e) { toast.error(mensagemDoErro(e)); }
    setOcupado(false);
    setConfirmar(null);
  }
  async function verPrevia() {
    if (!a.foto_caminho) return;
    try { setPrevia(await urlDaFoto(a.foto_caminho)); }
    catch (e) { toast.error(mensagemDoErro(e)); }
  }
  const lista = aba === 'faltam' ? faltam : viram;

  return (
    <Card className={cn('border-border', noAr && 'border-success/40')}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Baby className="h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Aviso de nascimento — {a.setor_nome}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {viram.length} de {publico.length} abriram · {recados.length} {recados.length === 1 ? 'recadinho' : 'recadinhos'}
              </span>
            </span>
            <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-xs font-semibold', noAr ? 'text-success' : 'text-muted-foreground')}>
              {noAr ? `No ar desde ${quando(a.liberado_em)}` : a.encerrado_em ? 'Recolhido' : 'Não liberado'}
            </span>
            {a.foto_caminho && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void verPrevia()}><Eye className="h-3.5 w-3.5" /> Ver prévia</Button>}
            {superAdmin && (
              <Button size="sm" variant={noAr ? 'outline' : 'default'} className="gap-1.5" disabled={ocupado || (!noAr && !a.foto_caminho)}
                title={!noAr && !a.foto_caminho ? 'Envie a foto antes de liberar' : undefined} onClick={() => setConfirmar(!noAr)}>
                {noAr ? <Undo2 className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />} {noAr ? 'Recolher' : `Liberar para ${a.setor_nome}`}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {aberto && <CardContent className="space-y-4">
        {superAdmin && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">{a.foto_caminho ? 'Foto enviada. Ela fica em pasta privada.' : 'Falta a foto. Ela fica em pasta privada, longe do código.'}</span>
            <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void acao(() => enviarFoto(a.id, f), 'Foto salva');
            }} />
            <Button size="sm" variant="outline" className="gap-1.5" disabled={ocupado} onClick={() => entrada.current?.click()}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />} {a.foto_caminho ? 'Trocar foto' : 'Enviar foto'}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="O que ver">
            {([['recados', `Recadinhos (${recados.length})`], ['faltam', `Ainda não abriram (${faltam.length})`], ['viram', `Abriram (${viram.length})`]] as const).map(([v, r]) => (
              <button key={v} type="button" aria-pressed={aba === v} onClick={() => setAba(v)}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground', aba === v && 'bg-background text-foreground shadow-sm')}>{r}</button>
            ))}
          </div>
          {aba === 'recados' && recados.length > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-xs"
              onClick={() => void copiarTexto(recados.map(p => `${p.nome ?? 'Sem nome'}: ${p.recado}`).join('\n\n'), 'Recadinhos copiados', 'Não foi possível copiar.')}>
              <Copy className="h-3.5 w-3.5" /> Copiar todos
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
          {aba === 'recados' ? (recados.length === 0
            ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum recadinho ainda.</p>
            : recados.map(p => (
              <div key={p.id} className="border-t border-border px-3 py-2.5 text-sm first:border-t-0">
                <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{p.nome ?? 'Sem nome'}</span><span className="shrink-0 text-xs text-muted-foreground">{quando(p.recado_em)}</span></div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-muted-foreground">{p.recado}</p>
              </div>
            ))) : (lista.length === 0
            ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">Ninguém aqui.</p>
            : lista.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs first:border-t-0">
                <span className="min-w-0 truncate font-medium">{p.nome ?? 'Sem nome'}</span><span className="shrink-0 text-muted-foreground">{p.viu_em ? quando(p.viu_em) : p.cargo}</span>
              </div>
            )))}
        </div>
      </CardContent>}

      <AlertDialog open={confirmar !== null} onOpenChange={o => { if (!o && !ocupado) setConfirmar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar ? `Liberar para ${a.setor_nome}?` : 'Recolher o aviso?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar
                ? `A cegonha leva o livro para as ${publico.length} pessoas ativas de ${a.setor_nome}: agora para quem está logado, e ao entrar para as demais. Nenhum outro setor recebe.`
                : 'O card para de abrir e ninguém mais escreve. Quem abriu e os recadinhos continuam guardados.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado} onClick={e => {
              e.preventDefault();
              void acao(() => liberarAviso(a.id, !!confirmar), confirmar ? 'Aviso liberado' : 'Aviso recolhido');
            }}>{ocupado ? 'Salvando…' : confirmar ? 'Liberar agora' : 'Recolher'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previa && (
        <Suspense fallback={null}>
          <TelaNascimento previa conteudo={a.conteudo} fotoUrl={previa} podeRecado meuRecado={null}
            onRecado={async () => { /* prévia não grava */ }} onAdiar={() => setPrevia(null)} onFim={() => setPrevia(null)} />
        </Suspense>
      )}
    </Card>
  );
}

export default function AvisoNascimentoConfig({ mostrarVazio = false }: {
  /** Em «Eventos e gincanas» o card é a página inteira: vazio, diz por quê. */
  mostrarVazio?: boolean;
} = {}) {
  // Quem decide é o banco: sem acesso, sem migration ou sem aviso, o card não aparece.
  const { data, isLoading } = useQuery({ queryKey: ['aviso-nascimento'], queryFn: lerPainel, refetchInterval: 60_000, staleTime: 30_000, retry: false });
  if (!data?.length) {
    if (!mostrarVazio || isLoading) return null;
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nenhum aviso de nascimento cadastrado agora.
      </p>
    );
  }
  return <>{data.map(a => <Aviso key={a.id} a={a} />)}</>;
}
