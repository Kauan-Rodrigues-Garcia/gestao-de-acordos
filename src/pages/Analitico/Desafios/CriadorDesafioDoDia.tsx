/**
 * CriadorDesafioDoDia — a gerência lança o desafio de hoje em quatro perguntas.
 *
 *   1. Para quem?      o setor inteiro, uma equipe ou um operador
 *   2. Qual o desafio? valor, pagamentos ou % da meta diária — e o alvo
 *   3. Quando?         o dia, e o dia inteiro ou de um horário a outro
 *   4. Detalhes        nome, prêmio, recado e cor (tudo opcional)
 *
 * Ao lado, a prévia: a pílula exatamente como ela aparece na barra superior.
 *
 * Quem decide se pode gravar é a RLS de `desafios`: `desafios_configurar` em
 * qualquer setor, `desafios_configurar_setor` só no próprio. A tela só não
 * oferece o que a gravação recusaria.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, CalendarDays, Clock, Coins, Hash, Loader2, Percent, Rocket, Save, Search,
  Trash2, User, Users, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatBRL, parseBRL } from '@/lib/money';
import { getTodayISO } from '@/lib';
import { getMetasConfig } from '@/services/metas/metasConfig.service';
import {
  atualizarDesafio, buscarMetaDoMes, buscarPessoasParaCadastro, buscarRegraDoSetor,
  buscarSetoresDisponiveis, criarDesafio, excluirDesafio,
} from '@/services/desafios/desafios.service';
import {
  ROTULO_PUBLICO, metaDiariaDoMes, metaEfetiva, nomeSugerido, paraGravacao, rotuloHora,
  rotuloJanela, type DiarioDesafio, type MedidaDoDia, type PublicoDoDia,
} from '@/services/desafios/desafioDoDia';
import type { AcentoDesafio, Desafio, StatusDesafio } from '@/services/desafios/types';
import { PilulaVisual } from '@/components/DesafioDoDia/PilulaDesafioDoDia';
import { estiloDoDia } from '@/components/DesafioDoDia/estilo';
import { AvatarParticipante } from './AvatarParticipante';
import { ACENTOS_DISPONIVEIS } from './tema';
import type { SetorSimples } from './SetoresDoDesafio';

export interface CriadorDesafioDoDiaProps {
  desafio: Desafio | null;
  empresaId: string;
  autorId: string;
  autorNome: string;
  /** Setor fixo de quem só configura o próprio. `null` = escolhe. */
  restritoAoSetor: string | null;
  setores: SetorSimples[];
  podeExcluir: boolean;
  onVoltar: () => void;
  onSalvo: () => void;
}

const HORAS_INICIO = Array.from({ length: 24 }, (_, h) => h);
const HORAS_FIM = Array.from({ length: 24 }, (_, h) => h + 1);

const PUBLICOS: { valor: PublicoDoDia; Icone: typeof Users; dica: string }[] = [
  { valor: 'setor',    Icone: Building2, dica: 'Todo mundo somando para o mesmo número' },
  { valor: 'equipe',   Icone: Users,     dica: 'Só a equipe escolhida' },
  { valor: 'operador', Icone: User,      dica: 'Um desafio pessoal' },
];

const MEDIDAS: { valor: MedidaDoDia; Icone: typeof Coins; titulo: string; dica: string }[] = [
  { valor: 'valor',       Icone: Coins,   titulo: 'Valor recebido', dica: 'Atingir R$ X no dia' },
  { valor: 'quantidade',  Icone: Hash,    titulo: 'Pagamentos',     dica: 'Fazer N pagamentos entrarem' },
  { valor: 'meta_diaria', Icone: Percent, titulo: 'Meta diária',    dica: 'Bater X% da meta diária do Painel' },
];

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Opcao({
  ativo, onClick, Icone, titulo, dica,
}: { ativo: boolean; onClick: () => void; Icone: typeof Users; titulo: string; dica: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'flex flex-1 flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativo ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/40 hover:bg-muted/50',
      )}
    >
      <Icone className={cn('h-4 w-4', ativo ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
      <span className="text-sm font-medium text-foreground">{titulo}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{dica}</span>
    </button>
  );
}

function numeroDoCampo(texto: string, medida: MedidaDoDia): number {
  if (medida === 'valor') return parseBRL(texto);
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export function CriadorDesafioDoDia({
  desafio, empresaId, autorId, autorNome, restritoAoSetor, setores, podeExcluir, onVoltar, onSalvo,
}: CriadorDesafioDoDiaProps) {
  const inicial = desafio?.regra.diario ?? null;
  const [setorId, setSetorId] = useState<string>(
    restritoAoSetor ?? desafio?.setorId ?? setores[0]?.id ?? '',
  );
  const [publico, setPublico] = useState<PublicoDoDia>(inicial?.publico ?? 'setor');
  const [alvoId, setAlvoId] = useState<string>(inicial && inicial.publico !== 'setor' ? inicial.alvoId : '');
  const [medida, setMedida] = useState<MedidaDoDia>(inicial?.medida ?? 'valor');
  const [metaTexto, setMetaTexto] = useState<string>(
    inicial ? (inicial.medida === 'valor' ? String(inicial.meta).replace('.', ',') : String(inicial.meta)) : '',
  );
  const [dia, setDia] = useState<string>(desafio?.dataInicio ?? getTodayISO());
  const [comHorario, setComHorario] = useState<boolean>(inicial?.horaInicio != null);
  const [horaInicio, setHoraInicio] = useState<number>(inicial?.horaInicio ?? 14);
  const [horaFim, setHoraFim] = useState<number>(inicial?.horaFim ?? 17);
  const [nome, setNome] = useState<string>(desafio?.nome ?? '');
  const [nomeEditado, setNomeEditado] = useState<boolean>(!!desafio);
  const [premio, setPremio] = useState<string>(desafio?.premio ?? '');
  const [recado, setRecado] = useState<string>(desafio?.descricao ?? '');
  const [acento, setAcento] = useState<AcentoDesafio>(desafio?.visual.acento ?? 'ambar');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState<StatusDesafio | 'excluir' | null>(null);

  // ── O que a tela precisa saber ────────────────────────────────────────────
  const { data: setoresDisponiveis = [] } = useQuery({
    queryKey: ['desafio-setores-disponiveis'],
    queryFn: buscarSetoresDisponiveis,
    staleTime: 5 * 60 * 1000,
  });
  const { data: pessoas = [], isPending: carregandoPessoas } = useQuery({
    queryKey: ['desafio-pessoas-cadastro', empresaId],
    queryFn: () => buscarPessoasParaCadastro(empresaId),
    staleTime: 5 * 60 * 1000,
  });
  const { data: regraSetor } = useQuery({
    queryKey: ['setor-regra', setorId],
    enabled: !!setorId,
    queryFn: () => buscarRegraDoSetor(setorId),
    staleTime: 10 * 60 * 1000,
  });

  const setorNome = setores.find(s => s.id === setorId)?.nome
    ?? setoresDisponiveis.find(s => s.id === setorId)?.nome ?? 'Setor';
  const equipes = useMemo(
    () => setoresDisponiveis.find(s => s.id === setorId)?.equipes ?? [],
    [setoresDisponiveis, setorId],
  );
  const operadores = useMemo(
    () => pessoas
      // Super admin já vem fora do quadro (`fn_desafio_pessoas_multi`).
      .filter(p => p.setores.includes(setorId) && p.situacao !== 'desligado')
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [pessoas, setorId],
  );
  const operadoresFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? operadores.filter(p => p.nome.toLowerCase().includes(q)) : operadores;
  }, [operadores, busca]);

  const alvoEfetivo = publico === 'setor' ? setorId : alvoId;
  const alvoNome = publico === 'setor'
    ? setorNome
    : publico === 'equipe'
      ? equipes.find(e => e.id === alvoId)?.nome ?? ''
      : operadores.find(p => p.id === alvoId)?.nome ?? inicial?.alvoNome ?? '';

  // Trocar o setor ou o público invalida o alvo escolhido.
  useEffect(() => {
    if (publico === 'setor') return;
    const lista = publico === 'equipe' ? equipes.map(e => e.id) : operadores.map(p => p.id);
    if (alvoId && lista.length && !lista.includes(alvoId)) setAlvoId('');
  }, [publico, equipes, operadores, alvoId]);

  useEffect(() => {
    if (!nomeEditado) setNome(nomeSugerido(alvoNome));
  }, [alvoNome, nomeEditado]);

  // A meta do mês do alvo — para «% da meta diária» e para sugerir o valor.
  const [ano, mes] = dia.split('-').map(Number);
  const { data: metaMes = null } = useQuery({
    queryKey: ['desafio-dia-meta-mes', empresaId, publico, alvoEfetivo, ano, mes],
    enabled: !!alvoEfetivo,
    queryFn: () => buscarMetaDoMes({ empresaId, tipo: publico, referenciaId: alvoEfetivo, diaISO: dia }),
    staleTime: 5 * 60 * 1000,
  });
  const { data: configMes } = useQuery({
    queryKey: ['metas-config', empresaId, mes, ano],
    queryFn: () => getMetasConfig(empresaId, mes, ano),
    staleTime: 10 * 60 * 1000,
  });
  const metaDiaria = metaDiariaDoMes(metaMes, dia, configMes?.data?.feriados ?? []);

  const meta = numeroDoCampo(metaTexto, medida);
  const diario: DiarioDesafio = {
    versao: 1,
    publico,
    alvoId: alvoEfetivo,
    alvoNome,
    medida,
    meta,
    horaInicio: comHorario ? horaInicio : null,
    horaFim: comHorario ? horaFim : null,
  };
  const alvoEmUnidade = metaEfetiva(diario, metaDiaria);

  // ── Validação ─────────────────────────────────────────────────────────────
  const problemas: string[] = [];
  if (!setorId) problemas.push('Escolha o setor.');
  if (regraSetor === 'cofen') problemas.push('O desafio do dia ainda não mede setor da regra Cofen.');
  if (publico !== 'setor' && !alvoId) problemas.push(publico === 'equipe' ? 'Escolha a equipe.' : 'Escolha o operador.');
  if (!(meta > 0)) problemas.push('Defina o alvo do desafio.');
  if (medida === 'meta_diaria' && alvoEfetivo && metaMes === null) {
    problemas.push(`${alvoNome || 'O alvo'} não tem meta do mês cadastrada na aba Metas.`);
  }
  if (comHorario && horaFim <= horaInicio) problemas.push('O horário final precisa ser depois do inicial.');
  if (dia < getTodayISO() && !desafio) problemas.push('Escolha hoje ou um dia futuro.');
  if (nome.trim().length < 2) problemas.push('Dê um nome ao desafio.');

  async function salvar(status: StatusDesafio) {
    if (problemas.length) { toast.error(problemas[0]); return; }
    setSalvando(status);
    const dados = paraGravacao({
      nome, premio, recado, dia, setorId, diario,
      acento, status, metaCalculada: alvoEmUnidade,
    });
    const r = desafio
      ? await atualizarDesafio({ desafioId: desafio.id, empresaId, autorId, dados })
      : await criarDesafio({ empresaId, autorId, autorNome, dados });
    setSalvando(null);
    if (r.error) { toast.error(r.error); return; }
    toast.success(status === 'ativo' ? 'Desafio lançado! Ele já aparece na barra de quem participa.' : 'Rascunho salvo.');
    onSalvo();
  }

  async function excluir() {
    if (!desafio) return;
    if (!window.confirm(`Excluir o desafio «${desafio.nome}»? Isso não pode ser desfeito.`)) return;
    setSalvando('excluir');
    const r = await excluirDesafio({ desafio, autorId });
    setSalvando(null);
    if (r.error) { toast.error(r.error); return; }
    toast.success('Desafio excluído.');
    onSalvo();
  }

  const unidade = medida === 'valor' ? 'R$' : medida === 'quantidade' ? 'pagamentos' : '%';
  const atalhos: { rotulo: string; valor: string }[] = medida === 'valor'
    ? [
        ...(metaDiaria ? [{ rotulo: `Meta diária · ${formatBRL(metaDiaria).replace(/,\d{2}$/, '')}`, valor: metaDiaria.toFixed(2).replace('.', ',') }] : []),
        { rotulo: 'R$ 5 mil', valor: '5000' }, { rotulo: 'R$ 10 mil', valor: '10000' },
        { rotulo: 'R$ 20 mil', valor: '20000' }, { rotulo: 'R$ 50 mil', valor: '50000' },
      ]
    : medida === 'quantidade'
      ? [{ rotulo: '10', valor: '10' }, { rotulo: '20', valor: '20' }, { rotulo: '50', valor: '50' }, { rotulo: '100', valor: '100' }]
      : [{ rotulo: '100%', valor: '100' }, { rotulo: '120%', valor: '120' }, { rotulo: '150%', valor: '150' }, { rotulo: '200%', valor: '200' }];

  const previa = {
    realizado: 0,
    meta: alvoEmUnidade,
    falta: alvoEmUnidade ?? 0,
    progresso: 0,
    bateu: false,
    porQuantidade: medida === 'quantidade',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onVoltar} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {desafio && podeExcluir && (
          <Button variant="ghost" size="sm" onClick={excluir} disabled={!!salvando} className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{desafio ? 'Editar desafio do dia' : 'Novo desafio do dia'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Um alvo para hoje. Quem participa vê na barra superior quanto falta, e a contagem diminui a cada pagamento que entra.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="space-y-4">
          {/* ── 1. Para quem ─────────────────────────────────────────────── */}
          <Passo n={1} titulo="Para quem?">
            {!restritoAoSetor && setores.length > 0 && (
              <div className="mb-4 max-w-xs space-y-1.5">
                <Label className="text-xs">Setor</Label>
                <Select value={setorId} onValueChange={v => { setSetorId(v); setAlvoId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                  <SelectContent>
                    {setores.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              {PUBLICOS.map(p => (
                <Opcao
                  key={p.valor} ativo={publico === p.valor}
                  onClick={() => { setPublico(p.valor); setAlvoId(''); }}
                  Icone={p.Icone}
                  titulo={p.valor === 'setor' ? `${setorNome} inteiro` : ROTULO_PUBLICO[p.valor]}
                  dica={p.dica}
                />
              ))}
            </div>

            {publico === 'equipe' && (
              <div className="mt-4 flex flex-wrap gap-2">
                {equipes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma equipe neste setor.</p>}
                {equipes.map(e => (
                  <button
                    key={e.id} type="button" onClick={() => setAlvoId(e.id)} aria-pressed={alvoId === e.id}
                    className={cn('rounded-full border px-3 py-1.5 text-sm transition-colors',
                      alvoId === e.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
                  >
                    {e.nome}
                  </button>
                ))}
              </div>
            )}

            {publico === 'operador' && (
              <div className="mt-4 space-y-2">
                <div className="relative max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar operador" className="h-9 pl-8" />
                </div>
                <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {carregandoPessoas && <p className="text-xs text-muted-foreground">Carregando…</p>}
                  {!carregandoPessoas && operadoresFiltrados.length === 0 && <p className="text-xs text-muted-foreground">Ninguém encontrado neste setor.</p>}
                  {operadoresFiltrados.map(p => (
                    <button
                      key={p.id} type="button" onClick={() => setAlvoId(p.id)} aria-pressed={alvoId === p.id}
                      className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
                        alvoId === p.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted')}
                    >
                      <AvatarParticipante nome={p.nome} fotoUrl={p.fotoUrl} className="h-7 w-7" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">{p.nome}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{p.equipeNome}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {regraSetor === 'cofen' && (
              <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-foreground">
                Este setor é da regra Cofen. Lá o «hoje» do Painel vem do diário e da conciliação, que não têm hora — o desafio do dia ainda não mede esse caso.
              </p>
            )}
          </Passo>

          {/* ── 2. Qual o desafio ────────────────────────────────────────── */}
          <Passo n={2} titulo="Qual é o desafio?">
            <div className="flex flex-col gap-2 sm:flex-row">
              {MEDIDAS.map(m => (
                <Opcao key={m.valor} ativo={medida === m.valor} onClick={() => { setMedida(m.valor); setMetaTexto(''); }}
                  Icone={m.Icone} titulo={m.titulo} dica={m.dica} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="meta-dia" className="text-xs">
                  {medida === 'valor' ? 'Valor a atingir' : medida === 'quantidade' ? 'Quantos pagamentos' : 'Quanto da meta diária'}
                </Label>
                <div className="relative">
                  {medida === 'valor' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>}
                  <Input
                    id="meta-dia" inputMode="decimal" value={metaTexto}
                    onChange={e => setMetaTexto(e.target.value)}
                    placeholder={medida === 'valor' ? '10.000,00' : medida === 'quantidade' ? '30' : '120'}
                    className={cn('h-11 w-48 text-lg font-semibold tabular-nums', medida === 'valor' && 'pl-9', medida === 'meta_diaria' && 'pr-8')}
                  />
                  {medida === 'meta_diaria' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {atalhos.map(a => (
                  <button key={a.rotulo} type="button" onClick={() => setMetaTexto(a.valor)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                    {a.rotulo}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {medida === 'meta_diaria' ? (
                metaMes === null
                  ? 'A meta diária sai da meta do mês cadastrada na aba Metas, dividida pelos dias úteis.'
                  : <>Meta do mês {formatBRL(metaMes)} ÷ dias úteis = meta diária de <b className="text-foreground">{formatBRL(metaDiaria ?? 0)}</b>.
                      {alvoEmUnidade !== null && <> O alvo de hoje fica em <b className="text-foreground">{formatBRL(alvoEmUnidade)}</b>.</>}</>
              ) : medida === 'quantidade'
                ? 'Conta cada pagamento que entrar no dia, de qualquer valor.'
                : 'Conta o valor recebido, o mesmo número do Painel do Líder.'}
            </p>
            <span className="sr-only">Unidade: {unidade}</span>
          </Passo>

          {/* ── 3. Quando ────────────────────────────────────────────────── */}
          <Passo n={3} titulo="Quando?">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dia-desafio" className="text-xs">Dia</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="dia-desafio" type="date" value={dia} min={desafio ? undefined : getTodayISO()}
                    onChange={e => setDia(e.target.value || getTodayISO())} className="h-9 w-44 pl-8" />
                </div>
              </div>
              <div className="flex rounded-lg border border-border p-0.5">
                {[{ v: false, r: 'Dia inteiro' }, { v: true, r: 'Horário' }].map(o => (
                  <button key={o.r} type="button" onClick={() => setComHorario(o.v)} aria-pressed={comHorario === o.v}
                    className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
                      comHorario === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                    {o.r}
                  </button>
                ))}
              </div>
              {comHorario && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <Select value={String(horaInicio)} onValueChange={v => setHoraInicio(Number(v))}>
                    <SelectTrigger className="h-9 w-24" aria-label="Hora de início"><SelectValue /></SelectTrigger>
                    <SelectContent>{HORAS_INICIO.map(h => <SelectItem key={h} value={String(h)}>{rotuloHora(h)}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">às</span>
                  <Select value={String(horaFim)} onValueChange={v => setHoraFim(Number(v))}>
                    <SelectTrigger className="h-9 w-24" aria-label="Hora de fim"><SelectValue /></SelectTrigger>
                    <SelectContent>{HORAS_FIM.map(h => <SelectItem key={h} value={String(h)}>{rotuloHora(h)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {comHorario && (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                O relatório não traz a hora do pagamento: conta o que chega ao sistema nessa janela. O robô do 59 passa no minuto 07 de cada
                hora, então o resultado fecha às {rotuloHora(horaFim % 24)}07.
              </p>
            )}
          </Passo>

          {/* ── 4. Detalhes ──────────────────────────────────────────────── */}
          <Passo n={4} titulo="Detalhes (opcional)">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome-dia" className="text-xs">Nome</Label>
                <Input id="nome-dia" value={nome} onChange={e => { setNome(e.target.value); setNomeEditado(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="premio-dia" className="text-xs">Prêmio</Label>
                <Input id="premio-dia" value={premio} onChange={e => setPremio(e.target.value)} placeholder="Ex.: café da manhã para a equipe" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="recado-dia" className="text-xs">Recado para a operação</Label>
                <Textarea id="recado-dia" rows={2} value={recado} onChange={e => setRecado(e.target.value)} placeholder="Ex.: bora fechar o dia com tudo!" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Cor</Label>
                <div className="flex flex-wrap gap-2">
                  {ACENTOS_DISPONIVEIS.map(a => (
                    <button key={a.valor} type="button" onClick={() => setAcento(a.valor)} aria-pressed={acento === a.valor} title={a.rotulo}
                      className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110', a.amostra,
                        acento === a.valor && 'ring-2 ring-foreground')}>
                      <span className="sr-only">{a.rotulo}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Passo>
        </div>

        {/* ── Prévia ──────────────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Como aparece na barra</p>
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-3 py-5">
              <PilulaVisual
                estilo={estiloDoDia(acento)}
                situacao="valendo"
                andamento={previa}
                rotuloTempo={comHorario ? `até ${rotuloHora(horaFim)}` : 'hoje'}
              />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Para</dt><dd className="truncate text-right font-medium text-foreground">{alvoNome || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Alvo</dt>
                <dd className="text-right font-medium text-foreground">
                  {alvoEmUnidade === null ? '—' : medida === 'quantidade' ? `${alvoEmUnidade} pagamentos` : formatBRL(alvoEmUnidade)}
                </dd>
              </div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Quando</dt>
                <dd className="text-right font-medium text-foreground">{dia === getTodayISO() ? 'Hoje' : dia.split('-').reverse().join('/')}, {rotuloJanela(diario)}</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Só quem está {publico === 'setor' ? `no ${setorNome}` : publico === 'equipe' ? 'na equipe' : 'no desafio'} vê a barra.
              O número é o mesmo do Painel do Líder (Analítico: relatórios 58 e 59).
            </p>
          </div>

          {problemas.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {problemas.map(p => <li key={p}>• {p}</li>)}
            </ul>
          )}

          <div className="flex flex-col gap-2">
            <Button size="lg" className="gap-2" disabled={!!salvando || problemas.length > 0} onClick={() => salvar('ativo')}>
              {salvando === 'ativo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              {desafio?.status === 'ativo' ? 'Salvar e manter no ar' : 'Lançar desafio'}
            </Button>
            <Button variant="outline" className="gap-2" disabled={!!salvando || problemas.length > 0} onClick={() => salvar('rascunho')}>
              {salvando === 'rascunho' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar como rascunho
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
