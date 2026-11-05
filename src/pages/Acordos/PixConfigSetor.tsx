/**
 * PixConfigSetor — a configuração do setor em foco (líder+ com a chave):
 * % de comissão, meta da comissão dobrada e o registro manual pelos
 * operadores. Os campos são estado daqui, e não da tela inteira.
 *
 * ## Regra do Jornada (05/11/2026)
 *
 * Duas escolhas por setor, gravadas em `pix_automatico_config` (migration
 * 20261105150000):
 *
 *   • Comissão: percentual do valor (como sempre) ou VALOR FIXO por Pix
 *     aprovado. Vale para as próximas aprovações; a aprovada fica travada.
 *   • Meta do Pix: em R$ (como sempre) ou em QUANTIDADE de acordos.
 */
import { useEffect, useState } from 'react';
import { Building2, DollarSign, Hash, Percent, RefreshCw, Save, Target, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { setPermiteRegistroOperador, upsertConfigPix } from '@/services/pix_automatico.service';
import { useEstadoLembrado } from '@/hooks/useEstadoLembrado';
import { fmtPct, SO_MEMORIA } from './pixTelaComum';
import { formatCurrency, parseCurrencyInput } from '@/lib/index';
import { cn } from '@/lib/utils';
import type { ComissaoModoPix, MetaModoPix } from '@/services/pix_automatico.service';
import type { PixTela } from './usePixAutomatico';

/** O texto digitado e o valor gravado de quando ele foi digitado. */
interface Rascunho { base: string; texto: string }

export function PixConfigSetor({ pix }: { pix: PixTela }) {
  const {
    empresa, perfil, setores, setorConfig, pctSetorConfig, metaDobraSetorConfig,
    registroLigadoSetorConfig, carregar, chaveAba,
    metaModoSetorConfig, comissaoModoSetorConfig, valorFixoSetorConfig, regraJornadaDisponivel,
  } = pix;

  // ── Regra do Jornada: comissão fixa e meta em quantidade ──────────────────
  const [modoComissao, setModoComissao] = useState<ComissaoModoPix>(comissaoModoSetorConfig);
  const [fixoInput, setFixoInput] = useState('');
  const [confirmandoFixo, setConfirmandoFixo] = useState<number | null>(null);
  const [salvandoRegra, setSalvandoRegra] = useState(false);
  // Trocou de setor ou o gravado mudou: o editor volta ao que está no banco.
  useEffect(() => {
    setModoComissao(comissaoModoSetorConfig);
    setFixoInput(valorFixoSetorConfig != null
      ? Number(valorFixoSetorConfig).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '');
  }, [setorConfig, comissaoModoSetorConfig, valorFixoSetorConfig]);
  /*
   * O que foi digitado sobrevive a trocar de sub-aba (04/11/2026), como quando
   * estes campos moravam na tela. O rascunho guarda também o valor GRAVADO de
   * quando foi digitado: se o gravado mudou (salvou, ou outro líder mudou), o
   * rascunho é velho e o campo volta a mostrar o do banco — é o que o efeito
   * de antes fazia a cada mudança do valor gravado.
   */
  const pctGravado  = String(pctSetorConfig).replace('.', ',');
  const metaGravada = String(metaDobraSetorConfig);
  const [rascunhoPct, setRascunhoPct] = useEstadoLembrado<Rascunho | null>(
    `${chaveAba}|config|${setorConfig}|pct`, null, SO_MEMORIA,
  );
  const [rascunhoMeta, setRascunhoMeta] = useEstadoLembrado<Rascunho | null>(
    `${chaveAba}|config|${setorConfig}|meta-dobra`, null, SO_MEMORIA,
  );
  const pctInput = rascunhoPct?.base === pctGravado ? rascunhoPct.texto : pctGravado;
  const metaDobraInput = rascunhoMeta?.base === metaGravada ? rascunhoMeta.texto : metaGravada;
  const setPctInput = (texto: string) => setRascunhoPct({ base: pctGravado, texto });
  const setMetaDobraInput = (texto: string) => setRascunhoMeta({ base: metaGravada, texto });
  const [salvandoPct, setSalvandoPct] = useState(false);
  // Meta de acordos da comissão dobrada — era 18 fixo no código
  const [salvandoMetaDobra, setSalvandoMetaDobra] = useState(false);
  const [confirmandoPct, setConfirmandoPct] = useState<number | null>(null);
  const [salvandoToggle, setSalvandoToggle] = useState(false);

  /** Passo 1: valida o % digitado e abre a confirmação. */
  function pedirConfirmacaoPct() {
    if (!setorConfig) return;
    const pct = parseFloat(pctInput.replace(',', '.'));
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Percentual inválido (0 a 100)'); return; }
    // Voltar do valor fixo para o percentual é mudança mesmo com o % igual.
    if (pct === pctSetorConfig && comissaoModoSetorConfig === 'percentual') {
      toast.info('O percentual não mudou.');
      return;
    }
    setConfirmandoPct(pct);
  }

  /** Valor fixo por Pix: valida e abre a confirmação. */
  function pedirConfirmacaoFixo() {
    if (!setorConfig) return;
    const valor = fixoInput.trim() ? parseCurrencyInput(fixoInput) : NaN;
    if (!Number.isFinite(valor) || valor < 0 || valor > 100000) {
      toast.error('Valor fixo inválido (R$ 0,00 a R$ 100.000,00).');
      return;
    }
    if (comissaoModoSetorConfig === 'fixo' && valor === Number(valorFixoSetorConfig)) {
      toast.info('O valor fixo não mudou.');
      return;
    }
    setConfirmandoFixo(valor);
  }

  /** Grava a comissão em valor fixo por Pix (confirmada). */
  async function salvarFixoConfirmado() {
    const valor = confirmandoFixo;
    setConfirmandoFixo(null);
    if (!empresa?.id || !perfil?.id || !setorConfig || valor == null) return;
    setSalvandoRegra(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorConfig,
        pct: pctSetorConfig,
        comissaoModo: 'fixo',
        comissaoValorFixo: valor,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar o valor fixo: ' + error); return; }
      toast.success(`Comissão do setor: ${formatCurrency(valor)} por Pix aprovado. Vale para novas aprovações.`);
      await carregar();
    } finally {
      setSalvandoRegra(false);
    }
  }

  /** Meta do Pix em R$ ou em quantidade — não mexe em dinheiro, grava direto. */
  async function salvarMetaModo(modo: MetaModoPix) {
    if (!empresa?.id || !perfil?.id || !setorConfig || modo === metaModoSetorConfig) return;
    setSalvandoRegra(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorConfig,
        pct: pctSetorConfig,
        metaModo: modo,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar o tipo de meta: ' + error); return; }
      toast.success(modo === 'quantidade'
        ? 'Meta do Pix agora em quantidade de acordos.'
        : 'Meta do Pix agora em valor (R$).');
      await carregar();
    } finally {
      setSalvandoRegra(false);
    }
  }

  /** Passo 2: usuário confirmou no diálogo — grava o % do setor. */
  async function salvarPctConfirmado() {
    const pct = confirmandoPct;
    setConfirmandoPct(null);
    if (!empresa?.id || !perfil?.id || !setorConfig || pct == null) return;
    setSalvandoPct(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorConfig,
        pct,
        // Confirmar o % é escolher a comissão percentual. A coluna só viaja com
        // a migration 20261105150000 aplicada; antes dela, todo setor já é %.
        ...(regraJornadaDisponivel ? { comissaoModo: 'percentual' as const } : {}),
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar percentual: ' + error); return; }
      toast.success(`Percentual do setor atualizado para ${fmtPct(pct)}. Vale para novas aprovações.`);
      await carregar();
    } finally {
      setSalvandoPct(false);
    }
  }

  /**
   * Grava a meta de acordos da dobra do setor em edição.
   *
   * Separada do percentual de propósito: são dois números com consequências
   * diferentes, e o do percentual tem diálogo de confirmação porque reescreve
   * o que os operadores vão receber. A meta só muda um requisito daqui pra
   * frente — não mexe em comissão já aprovada.
   */
  async function salvarMetaDobra() {
    if (!empresa?.id || !perfil?.id || !setorConfig) return;
    const meta = parseInt(metaDobraInput.replace(/\D/g, ''), 10);
    if (!Number.isFinite(meta) || meta <= 0) {
      toast.error('A meta precisa ser um número maior que zero.');
      return;
    }
    if (meta === metaDobraSetorConfig) { toast.info('A meta não mudou.'); return; }

    setSalvandoMetaDobra(true);
    try {
      const { ok, error } = await upsertConfigPix({
        empresaId: empresa.id,
        setorId: setorConfig,
        // O percentual vigente viaja junto: `upsertConfigPix` é upsert, e sem
        // ele a linha nasceria com o default de 0,25 quando o setor ainda não
        // tem config gravada.
        pct: pctSetorConfig,
        metaAcordosDobra: meta,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao salvar a meta: ' + error); return; }
      toast.success(`Meta da comissão dobrada: ${meta} acordos no mês.`);
      await carregar();
    } finally {
      setSalvandoMetaDobra(false);
    }
  }

  /** Liga/desliga o registro manual de operadores no setor em edição. */
  async function alternarRegistroSetor(ligar: boolean) {
    if (!empresa?.id || !perfil?.id || !setorConfig) return;
    setSalvandoToggle(true);
    try {
      const { ok, error } = await setPermiteRegistroOperador({
        empresaId: empresa.id,
        setorId: setorConfig,
        permite: ligar,
        atualizadoPor: perfil.id,
        atualizadoPorNome: perfil.nome ?? perfil.email ?? '—',
      });
      if (!ok) { toast.error('Erro ao alterar registro manual: ' + error); return; }
      toast.success(ligar
        ? 'Registro manual LIGADO — operadores do setor podem adicionar acordos.'
        : 'Registro manual DESLIGADO — operadores do setor apenas visualizam.');
      await carregar();
    } finally {
      setSalvandoToggle(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-card px-3 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-primary" />
          {setores.find(s => s.id === setorConfig)?.nome ?? 'Meu setor'}
        </span>
        <div className="flex items-center gap-1.5">
          {modoComissao === 'fixo'
            ? <DollarSign className="w-3.5 h-3.5 text-primary shrink-0" />
            : <Percent className="w-3.5 h-3.5 text-primary shrink-0" />}
          <span className="text-[11px] text-muted-foreground shrink-0">Comissão do setor:</span>
          {regraJornadaDisponivel && (
            <Alternador
              valor={modoComissao}
              opcoes={[
                { valor: 'percentual', rotulo: '%', titulo: 'Percentual do valor do Pix' },
                { valor: 'fixo', rotulo: 'R$ fixo', titulo: 'Valor fixo por Pix aprovado' },
              ]}
              onTrocar={v => setModoComissao(v)}
              desabilitado={salvandoRegra || salvandoPct}
              rotuloGrupo="Tipo de comissão"
            />
          )}
          {modoComissao === 'fixo' ? (
            <>
              <Input value={fixoInput} onChange={e => setFixoInput(e.target.value)} aria-label="Comissão fixa por Pix (R$)"
                placeholder="0,00" className="h-7 w-20 text-xs text-center font-mono" />
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary"
                onClick={pedirConfirmacaoFixo} disabled={salvandoRegra} title="Confirmar o valor fixo por Pix">
                {salvandoRegra ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Confirmar
              </Button>
            </>
          ) : (
            <>
              <Input value={pctInput} onChange={e => setPctInput(e.target.value)} aria-label="Comissão do setor (%)"
                className="h-7 w-16 text-xs text-center font-mono" />
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary"
                onClick={pedirConfirmacaoPct} disabled={salvandoPct} title="Confirmar novo percentual do setor">
                {salvandoPct ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Confirmar
              </Button>
            </>
          )}
        </div>

        {/* Meta do Pix em R$ ou em quantidade (regra do Jornada). */}
        {regraJornadaDisponivel && (
          <div className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[11px] text-muted-foreground shrink-0">Meta do Pix:</span>
            <Alternador
              valor={metaModoSetorConfig}
              opcoes={[
                { valor: 'valor', rotulo: 'R$', titulo: 'Meta em valor (R$)' },
                { valor: 'quantidade', rotulo: 'Qtd.', titulo: 'Meta em quantidade de acordos', icone: <Hash className="w-3 h-3" /> },
              ]}
              onTrocar={v => void salvarMetaModo(v)}
              desabilitado={salvandoRegra}
              rotuloGrupo="Tipo de meta do Pix"
            />
          </div>
        )}

        {/* Meta da comissão dobrada. Era 18 fixo no código; agora é por
            setor. Sem diálogo de confirmação, ao contrário do percentual:
            mudar a meta não reescreve comissão já aprovada, só muda um
            requisito daqui pra frente. */}
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-[11px] text-muted-foreground shrink-0">
            Acordos p/ dobrar:
          </span>
          <Input
            value={metaDobraInput}
            onChange={e => setMetaDobraInput(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            aria-label="Acordos para dobrar"
            className="h-7 w-14 text-xs text-center font-mono"
            title="Quantos acordos Pix o operador precisa fechar no mês"
          />
          <Button size="sm" variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300"
            onClick={salvarMetaDobra} disabled={salvandoMetaDobra}
            title="Salvar a meta de acordos do setor">
            {salvandoMetaDobra ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={registroLigadoSetorConfig} disabled={salvandoToggle}
            onCheckedChange={alternarRegistroSetor}
            aria-label="Registro manual pelos operadores" />
          <span className="text-[11px] text-muted-foreground">
            Registro manual pelos operadores:{' '}
            <strong className={registroLigadoSetorConfig ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-700 dark:text-amber-500'}>
              {registroLigadoSetorConfig ? 'ligado' : 'desligado'}
            </strong>
          </span>
        </div>
      </div>

      {/* Confirmação do valor fixo por Pix */}
      <AlertDialog open={confirmandoFixo != null} onOpenChange={aberto => { if (!aberto) setConfirmandoFixo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Comissão em valor fixo?</AlertDialogTitle>
            <AlertDialogDescription>
              O setor <strong>{setores.find(s => s.id === setorConfig)?.nome ?? 'atual'}</strong> passa a pagar{' '}
              <strong>{confirmandoFixo != null ? formatCurrency(confirmandoFixo) : ''}</strong> por Pix aprovado,
              em vez de percentual. Vale para as próximas aprovações — acordos já aprovados não mudam.
              O bônus por período (pontos de %) não se aplica a valor fixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvarFixoConfirmado}>Sim, alterar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de alteração do % */}
      <AlertDialog open={confirmandoPct != null} onOpenChange={aberto => { if (!aberto) setConfirmandoPct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar comissão do setor?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar a comissão do setor{' '}
              <strong>{setores.find(s => s.id === setorConfig)?.nome ?? 'atual'}</strong>{' '}
              de <strong>{fmtPct(pctSetorConfig)}</strong> para{' '}
              <strong>{confirmandoPct != null ? fmtPct(confirmandoPct) : ''}</strong>?
              A mudança vale apenas para este setor e para as próximas aprovações —
              acordos já aprovados não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvarPctConfirmado}>Sim, alterar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Duas opções lado a lado — a escolhida em destaque. */
function Alternador<T extends string>({
  valor, opcoes, onTrocar, desabilitado, rotuloGrupo,
}: {
  valor: T;
  opcoes: { valor: T; rotulo: string; titulo: string; icone?: React.ReactNode }[];
  onTrocar: (v: T) => void;
  desabilitado?: boolean;
  rotuloGrupo: string;
}) {
  return (
    <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label={rotuloGrupo}>
      {opcoes.map(o => (
        <button
          key={o.valor}
          type="button"
          title={o.titulo}
          aria-pressed={valor === o.valor}
          disabled={desabilitado}
          onClick={() => onTrocar(o.valor)}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors',
            valor === o.valor
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icone}{o.rotulo}
        </button>
      ))}
    </div>
  );
}
