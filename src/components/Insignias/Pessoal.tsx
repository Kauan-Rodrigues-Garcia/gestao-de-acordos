/**
 * As insígnias do pessoal (só o super_admin): todo mundo que tem pelo menos
 * uma, com a placa de cada medalha no hover. Em ordem de pontos
 * (`pontuacao.ts`), com a conta no hover dos pontos. Pedaço próprio: só baixa quando
 * o super_admin abre a lista — não pesa nas medalhas do topo de ninguém.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
import { INSIGNIAS, TOTAL_INSIGNIAS, quantas } from './insignias';
import { explicar, ordenarPorPontos, pontos } from './pontuacao';
import { lerAlbunsDoPessoal, type Pessoal } from './banco';
import { MedalhaComPlaca } from './Estante';
import { prepararPlacas } from './placasSobDemanda';

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function DoPessoal() {
  const [dados, setDados] = useState<Pessoal | null>(null);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState('');
  const [versao, setVersao] = useState(0);

  // As placas do hover da lista: já baixando enquanto a lista carrega.
  useEffect(() => { prepararPlacas(); }, []);

  useEffect(() => {
    let vivo = true;
    setErro(false);
    lerAlbunsDoPessoal()
      .then(d => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [versao]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const todos = ordenarPorPontos(dados.albuns);
    if (!termo) return todos;
    return todos.filter(a =>
      `${a.nome} ${a.setor ?? ''} ${dados.empresas.get(a.usuario) ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo));
  }, [dados, busca]);

  if (erro) {
    return (
      <div className="space-y-2 py-6 text-center text-xs text-muted-foreground">
        <p>Não deu para ler as insígnias do pessoal.</p>
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setVersao(v => v + 1)}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!dados) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const completos = dados.albuns.filter(a => quantas(a) === TOTAL_INSIGNIAS).length;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={400} disableHoverableContent>
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Insígnias do pessoal</p>
          <p className="text-[11px] text-muted-foreground">
            {plural(dados.albuns.length, 'pessoa tem', 'pessoas têm')} pelo menos uma
            {completos > 0 && <> · <span className="font-semibold text-amber-600 dark:text-amber-400">{plural(completos, 'completou', 'completaram')} as {TOTAL_INSIGNIAS}</span></>}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {INSIGNIAS.map(ins => {
            const n = dados.albuns.filter(a => a.conquistas[ins.id]).length;
            return (
              <div key={ins.id} className="flex items-center justify-center gap-1.5 rounded-md bg-muted/40 py-1.5" title={`${ins.nome}: ${plural(n, 'pessoa', 'pessoas')}`}>
                <span className="ins-ponto ins-ponto-tem" style={{ ['--fita' as string]: ins.fita }} />
                <span className="text-xs font-semibold tabular-nums">{n}</span>
              </div>
            );
          })}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa, setor ou empresa" className="h-8 pl-8 text-xs" />
        </div>
        <ul className="-mx-1 max-h-[55vh] space-y-0.5 overflow-y-auto pr-1">
          {lista.map(a => {
            const linha = [a.setor, dados.empresas.get(a.usuario)].filter(Boolean).join(' · ');
            return (
              <li key={a.usuario} className="flex items-center justify-between gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    {a.foto && <AvatarImage src={a.foto} alt="" className="object-cover" />}
                    <AvatarFallback className="bg-primary text-[11px] font-bold text-primary-foreground">{iniciais(a.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{a.nome}</p>
                    {linha && <p className="truncate text-[11px] text-muted-foreground">{linha}</p>}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  {INSIGNIAS.map(ins => (
                    <MedalhaComPlaca key={ins.id} insignia={ins} conquista={a.conquistas[ins.id]} tam={20} />
                  ))}
                  <span className="ml-1 w-7 text-right text-xs font-semibold tabular-nums">{quantas(a)}/{TOTAL_INSIGNIAS}</span>
                  <span className="w-12 text-right text-xs font-bold tabular-nums text-primary" title={explicar(a)}>{pontos(a)} pts</span>
                </span>
              </li>
            );
          })}
          {lista.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Ninguém por aqui.</li>}
        </ul>
      </div>
    </TooltipProvider>
  );
}
