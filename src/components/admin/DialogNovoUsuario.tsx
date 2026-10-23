/**
 * DialogNovoUsuario — o cadastro de uma pessoa (Usuários, «Novo usuário»).
 *
 * ## O que mudou em 23/10/2026
 *
 * O cadastro era a mesma janela estreita da edição, e o setor saía da EMPRESA
 * escolhida: PaguePlay listava os setores da empresa PaguePlay, e não os de
 * Marília — a regra antiga. Mas BookPlay e PaguePlay são só a marca, e quem diz
 * a marca é a cidade do setor (`lib/marca.ts`): Birigui é BookPlay, Marília é
 * PaguePlay, o Play Night e o Conecta Play incluídos, venham da empresa que
 * vierem. É o mesmo agrupamento da transferência (`gruposDeDestino`).
 *
 * Agora a janela é larga e tem três passos: quem é a pessoa, o que ela faz e
 * onde vai trabalhar. Onde trabalhar é escolher a marca e, dentro dela, o
 * setor — cada um com a regra de negócio dele (Nosso produto ou Cofen), que é
 * o que muda o que a pessoa vê. O rodapé resume o que vai ser gravado.
 *
 * ## A empresa vem do setor
 *
 * A empresa gravada é a do SETOR escolhido (`empresaDoDestino`), não a da tela:
 * na lista da cobrança os setores das duas empresas aparecem juntos, e a FK
 * composta `perfis_setor_da_empresa_fkey` recusa setor de outra empresa. Quem
 * pode criar em qual empresa continua sendo o servidor (`/api/criar-usuario`).
 *
 * A cúpula (diretoria, administrador, super admin) pertence à empresa, não a um
 * setor: para ela o passo 3 mostra a empresa em vez da marca e do setor.
 *
 * A edição continua no `DialogUsuario`: lá o setor não muda (é transferência).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  UserPlus, IdCard, Briefcase, MapPin, Eye, EyeOff, Wand2, Search, Check, Building2,
  Lock, Bot, Shield, Loader2, X, Save, Sparkles,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MIN_SENHA } from '@/services/senha.service';
import { PERFIL_LABELS } from '@/lib/index';
import { useCadastroDeCargos } from '@/hooks/useCargos';
import { pareceLoginDeIa } from '@/lib/vendas';
import { CARGO_DO_NUCLEO, aoTrocarCargo, aoTrocarSetor } from '@/lib/cargoDoNucleo';
import { grupoDoSetor, gruposDeDestino } from '@/lib/empresasDaTransferencia';
import { ROTULO_REGRA, ehRegraDoSetor } from '@/lib/regraDoSetor';
import type { PerfilUsuario, Setor, Empresa } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { opcoesDoCadastro, type UserForm } from './DialogUsuario';

interface Props {
  aberto: boolean;
  onFechar: () => void;
  form: UserForm;
  setForm: React.Dispatch<React.SetStateAction<UserForm>>;

  /** Quem cria pode escolher o cargo (`usuarios_editar_cargo`)? Sem ela, nasce operador. */
  podeCargo: boolean;
  isSuperAdmin: boolean;
  /** Os setores ativos que quem cria enxerga — os das duas empresas, na cobrança. */
  setores: Setor[];
  /** As cidades (`rh_celulas`) dos setores: é por elas que se sabe a marca. */
  cidades: { id: string; nome: string }[];
  empresas: Empresa[];
  empresaAtualNome?: string;
  /** O setor de quem está criando: a janela abre na marca dele. */
  setorDeQuemCria?: string | null;

  mostrarRobo?: boolean;
  cargoEscopoEmpresa: boolean;
  setorNucleoId?: string | null;

  salvando: boolean;
  onSalvar: () => void;
}

/** O tom de cada marca no seletor: o azul da BookPlay, o verde da PaguePlay. */
const TOM_DA_MARCA: Record<string, { ativo: string; bolinha: string; setor: string }> = {
  'marca:bookplay': {
    ativo: 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40',
    bolinha: 'bg-blue-500',
    setor: 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40',
  },
  'marca:pagueplay': {
    ativo: 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40',
    bolinha: 'bg-emerald-500',
    setor: 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40',
  },
};
const TOM_NEUTRO = {
  ativo: 'border-primary bg-primary/10 ring-1 ring-primary/40',
  bolinha: 'bg-muted-foreground/60',
  setor: 'border-primary bg-primary/10 ring-1 ring-primary/40',
};

/** «Ana Clara Souza» → «ana_souza»: primeiro e último nome, sem acento. */
function sugerirLogin(nome: string): string {
  const partes = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
  if (partes.length < 2) return '';
  return `${partes[0]}_${partes[partes.length - 1]}`;
}

/** Uma senha provisória fácil de ditar: sem 0/O nem 1/l. */
function gerarSenha(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const sorteio = (de: string, n: number) => {
    const bytes = crypto.getRandomValues(new Uint32Array(n));
    return Array.from(bytes, b => de[b % de.length]).join('');
  };
  return `${sorteio(letras, 1).toUpperCase()}${sorteio(letras, 4)}${sorteio(numeros, 3)}`;
}

/** Cabeçalho de um passo: número, título e o que ele decide. */
function Passo({
  numero, titulo, dica, Icone, children, className,
}: {
  numero: number; titulo: string; dica: string; Icone: typeof Lock;
  children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card p-4 space-y-3.5', className)}>
      <header className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {numero}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icone className="h-3.5 w-3.5 text-primary" /> {titulo}
          </h3>
          <p className="text-[11px] leading-snug text-muted-foreground">{dica}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function DialogNovoUsuario({
  aberto, onFechar, form, setForm,
  podeCargo, isSuperAdmin,
  setores, cidades, empresas, empresaAtualNome, setorDeQuemCria = null,
  mostrarRobo = false, cargoEscopoEmpresa, setorNucleoId = null,
  salvando, onSalvar,
}: Props) {
  const [verSenha, setVerSenha] = useState(false);
  const [grupoAberto, setGrupoAberto] = useState('');
  const [busca, setBusca] = useState('');

  const grupos = useMemo(
    () => gruposDeDestino(setores, cidades, empresas),
    [setores, cidades, empresas],
  );

  // Abre sempre limpo, na marca de quem cria (ou na primeira).
  useEffect(() => {
    if (!aberto) return;
    setVerSenha(false);
    setBusca('');
    setGrupoAberto('');
  }, [aberto]);
  useEffect(() => {
    if (!aberto || grupoAberto || grupos.length === 0) return;
    setGrupoAberto(
      grupoDoSetor(grupos, form.setor_id)
      ?? grupoDoSetor(grupos, setorDeQuemCria)
      ?? grupos[0].chave,
    );
  }, [aberto, grupoAberto, grupos, form.setor_id, setorDeQuemCria]);

  const grupo = grupos.find(g => g.chave === grupoAberto) ?? null;
  const tom = TOM_DA_MARCA[grupoAberto] ?? TOM_NEUTRO;
  const termo = busca.trim().toLowerCase();
  const setoresDoGrupo = (grupo?.setores ?? [])
    .filter(s => !termo || s.nome.toLowerCase().includes(termo));

  const cadastro = useCadastroDeCargos();
  const opcoesDeCargo = useMemo(
    () => opcoesDoCadastro(cadastro).filter(o => {
      if (o.soSuperAdmin && !isSuperAdmin) return false;
      if (o.valor === form.perfil) return true;
      if (!o.ativo) return false;
      // O setor ainda está em aberto: escolher Assistente ADM leva ao Núcleo.
      return o.valor !== CARGO_DO_NUCLEO || setorNucleoId !== null;
    }),
    [cadastro, isSuperAdmin, form.perfil, setorNucleoId],
  );
  const rotuloDoCargo = opcoesDeCargo.find(o => o.valor === form.perfil)?.rotulo
    ?? PERFIL_LABELS[form.perfil] ?? form.perfil;

  const trocarCargo = (cargo: PerfilUsuario) =>
    setForm(f => aoTrocarCargo(f, cargo, { setorNucleoId, setores: setores.filter(s => s.empresa_id === f.empresa_id) }));

  /** Escolher o setor escolhe também a empresa: é onde o setor mora. */
  const escolherSetor = (s: Setor) =>
    setForm(f => ({ ...aoTrocarSetor(f, s.id, { setorNucleoId }), empresa_id: s.empresa_id || f.empresa_id }));

  /*
   * O Núcleo é por empresa, e a empresa só se sabe depois do setor. Quando o
   * Núcleo da empresa do setor chega, a regra dele é aplicada de novo — escolher
   * o Núcleo põe o cargo em Assistente ADM (`aoTrocarSetor`).
   */
  useEffect(() => {
    if (!aberto || !setorNucleoId) return;
    setForm(f => (f.setor_id === setorNucleoId ? aoTrocarSetor(f, f.setor_id, { setorNucleoId }) : f));
  }, [aberto, setorNucleoId, setForm]);

  const setorTravadoNoNucleo = form.perfil === CARGO_DO_NUCLEO && setorNucleoId !== null;
  const setorEscolhido = setores.find(s => s.id === form.setor_id) ?? null;
  const grupoDoEscolhido = grupos.find(g => g.setores.some(s => s.id === form.setor_id)) ?? null;
  const regraDoEscolhido = setorEscolhido && ehRegraDoSetor(setorEscolhido.regra)
    ? ROTULO_REGRA[setorEscolhido.regra] : null;

  const loginSugerido = !form.usuario.trim() ? sugerirLogin(form.nome) : '';
  const senhaCurta = form.senha.length > 0 && form.senha.length < MIN_SENHA;
  const empresaDaCupula = empresas.find(e => e.id === form.empresa_id)?.nome ?? empresaAtualNome ?? '—';

  const onde = cargoEscopoEmpresa
    ? `${empresaDaCupula} · empresa inteira`
    : setorEscolhido
      ? [setorEscolhido.nome, grupoDoEscolhido?.rotulo, regraDoEscolhido && `regra ${regraDoEscolhido}`]
          .filter(Boolean).join(' · ')
      : null;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-0 border-b border-border bg-gradient-to-br from-primary/[0.07] to-transparent px-6 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <UserPlus className="h-4 w-4 text-primary" />
            </span>
            Novo usuário
          </DialogTitle>
          <DialogDescription className="pt-1.5 text-xs">
            Três passos: quem é a pessoa, o que ela faz e onde vai trabalhar. Ela entra com o
            login e a senha que você definir aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-muted/20 p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-4">
            {/* ── 1. Quem é ── */}
            <Passo numero={1} titulo="Quem é" dica="Nome e como a pessoa vai entrar no sistema." Icone={IdCard}>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome completo *</Label>
                <Input
                  value={form.nome} autoFocus
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex.: Ana Clara Souza" className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Login (usuário)</Label>
                <Input
                  value={form.usuario}
                  onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
                  placeholder="ana_souza" className="h-9 text-sm font-mono"
                />
                {loginSugerido ? (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, usuario: loginSugerido }))}
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
                  >
                    <Sparkles className="h-3 w-3" /> Usar <code className="font-mono">{loginSugerido}</code>
                  </button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Para entrar sem e-mail. Opcional se usar e-mail.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">
                  E-mail <span className="font-normal text-muted-foreground">(opcional se definir login)</span>
                </Label>
                <Input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@empresa.com" className="h-9 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Senha *</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={verSenha ? 'text' : 'password'} value={form.senha} autoComplete="new-password"
                      onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                      placeholder="••••••••" className={cn('h-9 pr-9 text-sm', verSenha && 'font-mono')}
                    />
                    <button
                      type="button" onClick={() => setVerSenha(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={verSenha ? 'Esconder senha' : 'Mostrar senha'}
                    >
                      {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="h-9 gap-1.5"
                    onClick={() => { setForm(f => ({ ...f, senha: gerarSenha() })); setVerSenha(true); }}
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Gerar
                  </Button>
                </div>
                <p className={cn('text-[11px]', senhaCurta ? 'text-destructive' : 'text-muted-foreground')}>
                  Mínimo {MIN_SENHA} caracteres. Passe a senha para a pessoa — ela pode trocar depois.
                </p>
              </div>
            </Passo>

            {/* ── 2. O que faz ── */}
            <Passo numero={2} titulo="O que faz" dica="O cargo decide o que a pessoa enxerga e pode fazer." Icone={Briefcase}>
              <div className="space-y-1.5">
                <Label className="text-xs">Cargo *</Label>
                {podeCargo ? (
                  <Select value={form.perfil} onValueChange={v => trocarCargo(v as PerfilUsuario)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {opcoesDeCargo.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                    <Shield className="h-3.5 w-3.5 opacity-70" /> {rotuloDoCargo}
                    <Lock className="ml-auto h-3 w-3 opacity-60" />
                  </div>
                )}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {podeCargo
                    ? <>O que cada cargo pode fazer é definido no painel de <strong>Permissões</strong>.</>
                    : 'Seu cargo não pode escolher cargo: a pessoa nasce com este.'}
                </p>
              </div>

              {podeCargo && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <input
                    type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    checked={form.menor_aprendiz}
                    onChange={e => setForm(f => ({ ...f, menor_aprendiz: e.target.checked }))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">Menor aprendiz</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      Marcação de controle. Não muda meta nem recebimento.
                    </span>
                  </span>
                </label>
              )}

              {mostrarRobo && podeCargo && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <input
                    type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    checked={form.robo}
                    onChange={e => setForm(f => ({ ...f, robo: e.target.checked }))}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Bot className="h-3.5 w-3.5" aria-hidden /> Este login é de automação
                    </span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">
                      As vendas continuam somando no setor; ele só sai do placar por cabeça.
                    </span>
                    {!form.robo && pareceLoginDeIa(form.usuario) && (
                      <span className="mt-1 block text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                        O login começa com <code className="rounded bg-muted px-1">ia_</code>. É só uma pista — confirme antes de marcar.
                      </span>
                    )}
                  </span>
                </label>
              )}
            </Passo>
          </div>

          {/* ── 3. Onde vai trabalhar ── */}
          <Passo
            numero={3} titulo="Onde vai trabalhar" Icone={MapPin}
            dica={cargoEscopoEmpresa
              ? `${rotuloDoCargo} não pertence a um setor: a visão é da empresa toda.`
              : 'Escolha a marca e o setor. A marca vem da cidade do setor: Birigui é BookPlay, Marília é PaguePlay.'}
            className="flex min-h-0 flex-col"
          >
            {cargoEscopoEmpresa ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Empresa</Label>
                {isSuperAdmin ? (
                  <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v, setor_id: '' }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                    <SelectContent>
                      {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 opacity-70" /> {empresaDaCupula}
                    <Lock className="ml-auto h-3 w-3 opacity-60" />
                  </div>
                )}
              </div>
            ) : setorTravadoNoNucleo ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {setores.find(s => s.id === setorNucleoId)?.nome ?? 'Núcleo de Inteligência e Gestão'}
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Assistente ADM é o cargo do Núcleo de Inteligência e Gestão: o setor é sempre ele.
                  </p>
                </div>
              </div>
            ) : grupos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum setor ativo que você possa escolher.
              </p>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                {/* A marca */}
                <div className={cn('grid gap-2', grupos.length > 1 && 'sm:grid-cols-2')}>
                  {grupos.map(g => {
                    const t = TOM_DA_MARCA[g.chave] ?? TOM_NEUTRO;
                    const [marca, cidade] = g.rotulo.split(' · ');
                    const ativo = g.chave === grupoAberto;
                    const temEscolhido = g.setores.some(s => s.id === form.setor_id);
                    return (
                      <button
                        key={g.chave} type="button"
                        onClick={() => { setGrupoAberto(g.chave); setBusca(''); }}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent',
                          ativo ? t.ativo : 'border-border',
                        )}
                      >
                        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', t.bolinha)} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{marca}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {cidade ?? ''}{cidade ? ' · ' : ''}{g.setores.length} {g.setores.length === 1 ? 'setor' : 'setores'}
                          </span>
                        </span>
                        {temEscolhido && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>

                {/* O setor */}
                {(grupo?.setores.length ?? 0) > 8 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={busca} onChange={e => setBusca(e.target.value)}
                      placeholder="Buscar setor" className="h-8 pl-8 text-sm"
                    />
                  </div>
                )}
                <div className="grid max-h-[340px] min-h-0 gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="radiogroup" aria-label="Setor">
                  {setoresDoGrupo.length === 0 && (
                    <p className="col-span-full py-4 text-center text-xs text-muted-foreground">Nenhum setor com esse nome.</p>
                  )}
                  {setoresDoGrupo.map(s => {
                    const escolhido = s.id === form.setor_id;
                    const regra = ehRegraDoSetor(s.regra) ? s.regra : null;
                    return (
                      <button
                        key={s.id} type="button" role="radio" aria-checked={escolhido}
                        onClick={() => escolherSetor(s)}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:bg-accent',
                          escolhido ? tom.setor : 'border-border',
                        )}
                      >
                        <span className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          escolhido ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                        )}>
                          {escolhido && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.nome}</span>
                          <span className="flex items-center gap-1 pt-0.5">
                            {regra && (
                              <span className={cn(
                                'rounded px-1.5 py-px text-[10px] font-medium',
                                regra === 'cofen'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                  : 'bg-muted text-muted-foreground',
                              )}>
                                {ROTULO_REGRA[regra]}
                              </span>
                            )}
                            {s.id === setorNucleoId && (
                              <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">Núcleo</span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  A regra do setor (Nosso produto ou Cofen) decide o que a pessoa vê. Mudar de setor depois é
                  uma transferência.
                </p>
              </div>
            )}
          </Passo>
        </div>

        <DialogFooter className="flex-col gap-3 border-t border-border bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <p className="min-w-0 text-xs text-muted-foreground">
            {form.nome.trim()
              ? <><strong className="text-foreground">{form.nome.trim()}</strong> · {rotuloDoCargo}{onde ? <> · {onde}</> : <span className="text-warning"> · escolha o setor</span>}</>
              : 'Preencha o nome para começar.'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>
              <X className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={onSalvar} disabled={salvando} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {salvando ? 'Criando...' : 'Criar usuário'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
