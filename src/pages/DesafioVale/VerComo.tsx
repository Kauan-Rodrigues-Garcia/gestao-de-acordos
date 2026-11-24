/**
 * «Ver como» do Desafio do Vale (23/11/2026): o super_admin abre a gaveta
 * como um operador, um líder ou a gerência veem, num dia simulado, com um %
 * do setor simulado e com o fechamento confirmado ou não — para entender como
 * ficou e ir ajustando. Nada é gravado: a visão só troca o que a gaveta mostra
 * (`components/DesafioVale/visao.ts`).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useEmpresa } from '@/hooks/useEmpresa';
import { GavetaDesafioVale } from '@/components/DesafioVale/GavetaDesafioVale';
import { VisaoDoValeContext, type VisaoSimulada } from '@/components/DesafioVale/visao';
import type { EscolhaDeTema } from '@/components/DesafioVale/temasVale';
import type { AlcanceNoDesafio } from '@/hooks/useEquipeNoDesafio';
import type { DesafioVale, DetalheVale } from '@/services/desafioVale/desafioVale.service';
import { diasDoPeriodo, faixaDoSetor, faixasOrdenadas, pctCortado, reais } from '@/services/desafioVale/regras';
import { dataCurta, hojeEmSaoPaulo } from '@/services/desafioCobranca/regras';

const QUEM: { id: AlcanceNoDesafio; rotulo: string; texto: string }[] = [
  { id: 'nenhum', rotulo: 'Operador', texto: 'as médias e os cupons dele; sem a aba Equipes' },
  { id: 'setor', rotulo: 'Líder do setor', texto: 'a aba Equipes com o setor dele' },
  { id: 'todos_setores', rotulo: 'Gerência', texto: 'a aba Equipes escolhendo o setor' },
];

/**
 * Quem aparece na lista de pessoas de cada visão (pedido do usuário, 23/11):
 * operador só operador, líder só líder, gerência só gerência. É filtro da
 * LISTA de quem simular — não decide o que ninguém vê.
 */
const CARGO_DA_VISAO: Record<AlcanceNoDesafio, string[]> = {
  nenhum: ['operador'],
  // A Elite lidera e também faz as médias: aparece aqui e a gaveta mostra as duas coisas.
  setor: ['lider', 'elite'],
  todos_setores: ['gerencia'],
};
const NOME_DO_CARGO: Record<AlcanceNoDesafio, string> = { nenhum: 'operador', setor: 'líder', todos_setores: 'gerente' };

const campo = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const chip = (ativo: boolean) => cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
  ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent');

function diaSeguinte(iso: string) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function VerComo({ d, atual }: { d: DetalheVale; atual: DesafioVale | null | undefined }) {
  const { empresa } = useEmpresa();
  const setores = useMemo(() => [...d.todos_setores].sort((a, b) => Number(b.participa) - Number(a.participa)), [d.todos_setores]);
  const [quem, setQuem] = useState<AlcanceNoDesafio>('nenhum');
  const [setorId, setSetorId] = useState<string>(setores[0]?.setor_id ?? '');
  const [pessoaId, setPessoaId] = useState<string>('');
  const [hoje, setHoje] = useState<string>(hojeEmSaoPaulo());
  const [pctTexto, setPctTexto] = useState<string>('');
  const [fechado, setFechado] = useState<'real' | 'aberto' | 'fechado'>('real');
  const [aberta, setAberta] = useState(false);
  const [versao, setVersao] = useState(0);
  // Dados fictícios: «como se já batessem, já tivessem cupons».
  const [comAbertura, setComAbertura] = useState(true);
  const [tema, setTema] = useState<EscolhaDeTema>('auto');
  const [ficLigado, setFicLigado] = useState(false);
  const [ficMedias, setFicMedias] = useState(9.4);
  const [ficAprovados, setFicAprovados] = useState(7);
  const [ficPendentes, setFicPendentes] = useState(2);

  // A gerência não é de um setor só: a lista traz as gerentes da empresa toda.
  const daEmpresaToda = quem === 'todos_setores';
  const pessoas = useQuery({
    queryKey: ['desafio-vale-ver-como', empresa?.id ?? null, quem, daEmpresaToda ? null : setorId],
    enabled: !!empresa?.id && (daEmpresaToda || !!setorId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase.from('perfis')
        .select('id, nome, perfil, setor_id, ativo, arquivado')
        .eq('empresa_id', empresa!.id).in('perfil', CARGO_DA_VISAO[quem]);
      if (!daEmpresaToda) q = q.eq('setor_id', setorId);
      const { data, error } = await q.order('nome');
      if (error) throw new Error(error.message);
      type P = { id: string; nome: string; perfil: string | null; setor_id: string | null; ativo: boolean | null; arquivado: boolean | null };
      return ((data as P[] | null) ?? []).filter(p => p.ativo !== false && !p.arquivado);
    },
  });

  const setor = setores.find(s => s.setor_id === setorId) ?? null;
  const pessoa = pessoas.data?.find(p => p.id === pessoaId) ?? null;
  const pctSim = pctTexto.trim() === '' ? undefined : Number(pctTexto.replace(',', '.').replace('%', ''));
  const pctValido = pctSim === undefined || Number.isFinite(pctSim);
  const pctMostrado = pctSim ?? setor?.pct ?? null;
  const faixa = faixaDoSetor(pctMostrado, d.faixas);
  const dias = diasDoPeriodo(d.inicio, d.fim);

  const visao: VisaoSimulada = {
    pessoa: pessoa ? { id: pessoa.id, nome: pessoa.nome, setor_id: pessoa.setor_id ?? setorId, cargo: pessoa.perfil } : null,
    setorId,
    alcance: quem,
    hoje,
    pct: pctValido ? pctSim : undefined,
    fechado: fechado === 'real' ? undefined : fechado === 'fechado',
    setores: d.todos_setores,
    abertura: comAbertura,
    tema,
    ficticio: ficLigado ? { medias: ficMedias, aprovados: ficAprovados, pendentes: ficPendentes } : null,
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Eye className="h-4 w-4" aria-hidden /> Ver como</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Abre a gaveta como outra pessoa vê, num dia e num % de setor que você escolhe. Só para conferir: nada é gravado e ninguém é avisado.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Quem</p>
            <div className="flex flex-wrap gap-1.5">
              {QUEM.map(q => (
                <button key={q.id} type="button" className={chip(quem === q.id)} onClick={() => { setQuem(q.id); setPessoaId(''); }}>{q.rotulo}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{QUEM.find(q => q.id === quem)?.texto}</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{daEmpresaToda ? 'Setor que abre na aba Equipes (sem gerente escolhido)' : 'Setor'}</span>
            <select className={campo} value={setorId} onChange={e => { setSetorId(e.target.value); setPessoaId(''); }}>
              {setores.map(s => (
                <option key={s.setor_id} value={s.setor_id}>{s.nome}{s.participa ? '' : ' (não participa)'}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {quem === 'nenhum' ? 'Operador' : quem === 'setor' ? 'Líder (opcional: as médias dele na 1ª aba)' : 'Gerente (opcional), de qualquer setor'}
            </span>
            <select className={campo} value={pessoaId} onChange={e => setPessoaId(e.target.value)} disabled={!pessoas.data}>
              <option value="">
                {pessoas.isLoading ? 'Carregando…'
                  : pessoas.data?.length === 0 ? `Nenhum ${NOME_DO_CARGO[quem]} ${daEmpresaToda ? 'na empresa' : 'neste setor'}`
                    : '— escolha —'}
              </option>
              {(pessoas.data ?? []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome}{daEmpresaToda ? ` · ${setores.find(s => s.setor_id === p.setor_id)?.nome ?? 'sem setor no desafio'}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Dia</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={chip(hoje === dias[0])} onClick={() => setHoje(dias[0])}>1º dia</button>
              <button type="button" className={chip(hoje === hojeEmSaoPaulo())} onClick={() => setHoje(hojeEmSaoPaulo())}>Hoje</button>
              <button type="button" className={chip(hoje === d.fim)} onClick={() => setHoje(d.fim)}>Último dia</button>
              <button type="button" className={chip(hoje === diaSeguinte(d.fim))} onClick={() => setHoje(diaSeguinte(d.fim))}>Depois do fim ({dataCurta(diaSeguinte(d.fim))})</button>
              <Input type="date" className="h-8 w-40" value={hoje} onChange={e => e.target.value && setHoje(e.target.value)} aria-label="Dia simulado" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">% do setor no mês</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={chip(pctTexto === '')} onClick={() => setPctTexto('')}>
                Real ({setor?.pct != null ? `${pctCortado(setor.pct)}%${setor.origem === 'projecao' ? ' proj.' : ''}` : 'sem %'})
              </button>
              {faixasOrdenadas(d.faixas).map(f => {
                const v = f.pct > 0 ? f.pct + 2 : Math.max(0, (faixasOrdenadas(d.faixas).slice(-2)[0]?.pct ?? 90) - 5);
                return (
                  <button key={f.pct} type="button" className={chip(pctTexto === String(v))} onClick={() => setPctTexto(String(v))}>
                    {v}% → {reais(f.valor)}
                  </button>
                );
              })}
              <Input className="h-8 w-24" placeholder="outro %" value={pctTexto} onChange={e => setPctTexto(e.target.value)} aria-label="% simulado" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {pctMostrado === null ? 'Setor sem % — quem bate as médias leva o piso.' : `Com ${pctCortado(pctMostrado)}%, quem bate as médias leva ${reais(faixa?.valor ?? 0)}.`}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Fechamento</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(fechado === 'real')} onClick={() => setFechado('real')}>Como está ({d.fechado_em ? 'confirmado' : 'aberto'})</button>
              <button type="button" className={chip(fechado === 'aberto')} onClick={() => setFechado('aberto')}>Aberto (provisório)</button>
              <button type="button" className={chip(fechado === 'fechado')} onClick={() => setFechado('fechado')}>Confirmado (final)</button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Tema da gaveta</p>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['auto', 'Automático (o seu)'],
            ['natal-claro', 'Natal claro (tema claro)'],
            ['natal-escuro', 'Noite de Natal (tema escuro)'],
            ['sem-natal', 'Sem Natal (Campanha)'],
          ] as [EscolhaDeTema, string][]).map(([id, rotulo]) => (
            <button key={id} type="button" className={chip(tema === id)} onClick={() => setTema(id)}>{rotulo}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Sozinho, cada pessoa vê pelo Gestão dela: Natal ligado no claro → Natal claro; no escuro → Noite de Natal; sem Natal → Campanha.
        </p>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm font-medium">
        <Switch checked={comAbertura} onCheckedChange={setComAbertura} aria-label="Começar pela abertura" />
        Começar pela abertura <span className="font-normal text-muted-foreground">— a arte da campanha, como cada pessoa vê na 1ª vez</span>
      </label>

      <div className="mt-4 rounded-lg border border-dashed border-border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={ficLigado} onCheckedChange={setFicLigado} aria-label="Usar dados fictícios" />
          Dados fictícios <span className="font-normal text-muted-foreground">— como se já tivessem batido e já tivessem cupons</span>
        </label>
        {ficLigado && (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Médias feitas (de {d.medias.toLocaleString('pt-BR')})</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 4.5, 8.7, 9, 9.4, 12].map(m => (
                  <button key={m} type="button" className={chip(ficMedias === m)} onClick={() => setFicMedias(m)}>
                    {m.toLocaleString('pt-BR')}{m >= d.medias ? ' ✓' : ''}
                  </button>
                ))}
                <Input className="h-8 w-20" inputMode="decimal" value={String(ficMedias).replace('.', ',')} aria-label="Médias fictícias"
                  onChange={e => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v >= 0) setFicMedias(v); }} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Pix aprovados ({d.cupom_pix} = 1 cupom)</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 2, 3, 7, 12].map(n => (
                  <button key={n} type="button" className={chip(ficAprovados === n)} onClick={() => setFicAprovados(n)}>
                    {n} → {Math.floor(n / Math.max(1, d.cupom_pix))} cupom{Math.floor(n / Math.max(1, d.cupom_pix)) === 1 ? '' : 's'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Pix esperando o líder</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[0, 1, 2, 5].map(n => (
                  <button key={n} type="button" className={chip(ficPendentes === n)} onClick={() => setFicPendentes(n)}>{n}</button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground lg:col-span-3">
              Com pessoa escolhida, usa a média diária real dela e troca só o quanto ela fez. Na aba Equipes aparece um time fictício
              (duas equipes, gente que bateu, que está perto e que está longe). Nada disso vai para o banco.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => { setVersao(v => v + 1); setAberta(true); }} disabled={!atual || !pctValido || (quem === 'nenhum' && !pessoa && !ficLigado)}>
          <Eye className="mr-1.5 h-4 w-4" aria-hidden /> Abrir a gaveta nesta visão
        </Button>
        {quem === 'nenhum' && !pessoa && !ficLigado && <span className="text-xs text-muted-foreground">Escolha o operador para ver como ele vê.</span>}
        {!pctValido && <span className="text-xs text-destructive">O % precisa ser um número, ex.: 97,5</span>}
      </div>

      {atual && (
        <VisaoDoValeContext.Provider value={visao}>
          <GavetaDesafioVale key={versao} d={atual} aberta={aberta} onFechar={() => setAberta(false)} />
        </VisaoDoValeContext.Provider>
      )}
    </section>
  );
}
