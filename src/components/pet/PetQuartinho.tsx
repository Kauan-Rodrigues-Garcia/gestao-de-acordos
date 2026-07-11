/**
 * PetQuartinho — painel que abre ao clicar no pet: cenário do quarto,
 * ações (alimentar/dormir), guarda-roupa e a LOJA MENSAL: vitrine que troca
 * todo mês (itens de petConfig.LOJA_MENSAL); o que for comprado fica no
 * inventário para sempre (itens_desbloqueados via fn_pet_gastar_moedas).
 * Comidas custam moedinhas e alimentam de verdade.
 */
import { useState, type ComponentType } from 'react';
import { motion } from 'framer-motion';
import { X, UtensilsCrossed, Moon, Sun, Shirt, Store, Home, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/money';
import type { PetSvgProps } from './PetAura';
import {
  ROUPAS_CATALOGO, COMIDAS_CATALOGO, itensLojaDoMes, roupaInfo,
  type PetHumor, type PetRoupa,
} from './petConfig';
import { CIDADES_CLIMA, descricaoClima, type ClimaAtual } from './usePetClima';

interface PetQuartinhoProps {
  petNome:        string;
  PetSvg:         ComponentType<PetSvgProps>;
  humor:          PetHumor;
  roupa:          PetRoupa;
  /** Cargos sem interação ainda: pet dormindo + mensagem "Em breve". */
  modoTeaser?:    boolean;
  /** Saldo atual de moedas (0 quando o banco ainda não tem a economia). */
  moedas?:          number;
  /** Inventário permanente (itens comprados na loja mensal). */
  itens?:           string[];
  /** Economia ativa no banco — sem ela a loja fica indisponível. */
  lojaAtiva?:       boolean;
  /** Recompensa do recebimento do dia ainda não resgatada. */
  recompensaMoedas?: number;
  recompensaValor?:  number;
  onResgatar?:       () => void;
  /** Gasta moedas no servidor (item → compra permanente). true se deu. */
  onComprar?:     (preco: number, item?: string) => Promise<boolean>;
  /** Alimenta o pet; recebe o nome da comida (memória p/ balõezinhos). */
  onAlimentar:    (nomeComida?: string) => void;
  onAlternarSono: () => void;
  onSetRoupa:     (r: PetRoupa) => void;
  /** Pet desativado (iconezinho fixo no canto) + botão para alternar. */
  minimizado?:           boolean;
  onAlternarMinimizado?: () => void;
  /** Clima real: janelinha do quarto + seletor de cidade na aba Quarto. */
  clima?:            ClimaAtual;
  cidadeClimaId?:    string;
  onSetCidadeClima?: (id: string) => void;
  onClose:        () => void;
}

type Aba = 'quarto' | 'loja' | 'roupas' | 'comidas';

/** 'yyyy-MM' de hoje (vitrine do mês corrente). */
function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Dias até a vitrine trocar (1º dia do próximo mês). */
function diasParaTrocarLoja(): number {
  const hoje = new Date();
  const proximo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((proximo.getTime() - hoje.getTime()) / 86_400_000));
}

const MESES_LOJA = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function PetQuartinho({
  petNome, PetSvg, humor, roupa, modoTeaser = false,
  moedas = 0, itens = [], lojaAtiva = false,
  recompensaMoedas = 0, recompensaValor = 0, onResgatar, onComprar,
  onAlimentar, onAlternarSono, onSetRoupa,
  minimizado = false, onAlternarMinimizado,
  clima, cidadeClimaId, onSetCidadeClima, onClose,
}: PetQuartinhoProps) {
  const [aba, setAba] = useState<Aba>('quarto');
  const [balao, setBalao] = useState<string | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);

  const mesAtual   = mesAtualISO();
  const vitrine    = itensLojaDoMes(mesAtual);
  const diasTroca  = diasParaTrocarLoja();

  // Janelinha do quarto reflete o clima real lá fora
  const emojiJanela = !clima ? '🌙'
    : clima.clima === 'tempestade' ? '⛈️'
    : clima.clima === 'chuva' ? '🌧️'
    : clima.clima === 'vento' ? '🍃'
    : clima.clima === 'frio' ? '❄️'
    : clima.clima === 'calor' ? '☀️'
    : clima.dia ? '☀️' : '🌙';

  function falar(msg: string, ms = 1900) {
    setBalao(msg);
    setTimeout(() => setBalao(null), ms);
  }

  async function comprarItemLoja(id: PetRoupa, preco: number, nome: string) {
    if (!onComprar || comprando) return;
    if (moedas < preco) { falar('moedas insuficientes 🥺'); return; }
    setComprando(id);
    const ok = await onComprar(preco, id);
    setComprando(null);
    if (ok) {
      falar(`${nome}! adorei 🥰`);
      onSetRoupa(id);         // já sai vestindo a novidade
    } else {
      falar('ops, não deu… tente de novo 😿');
    }
  }

  async function comprarComida(id: string, preco: number, nome: string) {
    if (!onComprar || comprando) return;
    if (humor === 'dormindo') { falar('shhh... 😴', 1500); return; }
    if (moedas < preco) { falar('moedas insuficientes 🥺'); return; }
    setComprando(id);
    const ok = await onComprar(preco);
    setComprando(null);
    if (ok) {
      onAlimentar(nome);
      falar('nham nham! 😋');
    } else {
      falar('ops, não deu… tente de novo 😿');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97 }}
      transition={{ type: 'tween', duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="mb-2 w-[330px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          🐾 {petNome}
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {humor === 'dormindo' ? 'dormindo'
              : humor === 'feliz' ? 'feliz'
              : humor === 'comemorando' ? 'comemorando 🎉'
              : humor === 'jogando' ? 'jogando 🎮'
              : 'de boa'}
          </span>
        </p>
        <div className="flex items-center gap-1.5">
          {!modoTeaser && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-400 text-[11px] font-bold px-2 py-0.5"
              title="Suas moedas"
            >
              🪙 {moedas.toLocaleString('pt-BR')}
            </span>
          )}
          {onAlternarMinimizado && (
            <Button
              variant="ghost" size="icon" className="w-7 h-7"
              title={minimizado
                ? 'Reativar o pet (volta a passear pela tela)'
                : 'Desativar o pet (vira um iconezinho parado no canto)'}
              onClick={onAlternarMinimizado}
            >
              {minimizado ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Cenário do quartinho */}
      <div className="relative h-52 overflow-hidden" style={{ background: '#f2e4cf' }}>
        {/* parede: janela + quadrinho */}
        <div className="absolute left-5 top-5 w-16 h-14 rounded-lg" style={{ background: '#bfd7e8', border: '5px solid #a8815c' }}>
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2" style={{ background: '#a8815c' }} />
          <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2" style={{ background: '#a8815c' }} />
          <span className="absolute right-1 top-0.5 text-[10px]">{emojiJanela}</span>
        </div>
        {/* prateleira de colecionáveis */}
        <div className="absolute right-4 top-6 w-[110px]">
          <div className="flex justify-around pb-1">
            {[0, 1, 2].map(i => (
              <div key={i} title="Colecionável — em breve"
                className="w-7 h-7 rounded-full border-2 border-dashed flex items-center justify-center text-[11px] font-bold"
                style={{ borderColor: '#c9a97b', color: '#c9a97b', background: '#faf3e6' }}>
                ?
              </div>
            ))}
          </div>
          <div className="h-2 rounded-sm" style={{ background: '#a8815c' }} />
        </div>
        {/* chão + tapete */}
        <div className="absolute inset-x-0 bottom-0 h-14" style={{ background: '#d9b98c' }} />
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-44 h-9 rounded-[50%]" style={{ background: '#a8c5b5' }} />
        {/* plantinha */}
        <span className="absolute left-4 bottom-9 text-2xl">🪴</span>

        {/* caminha no cantinho — clique coloca para dormir / acorda */}
        <button
          type="button"
          disabled={modoTeaser}
          onClick={modoTeaser ? undefined : onAlternarSono}
          title={modoTeaser ? undefined : humor === 'dormindo' ? 'Acordar' : 'Colocar para dormir'}
          aria-label={humor === 'dormindo' ? 'Acordar o pet' : 'Colocar o pet para dormir'}
          className={cn('absolute right-2 bottom-2 p-0 bg-transparent border-0', !modoTeaser && 'cursor-pointer')}
        >
          <svg width="126" height="72" viewBox="0 0 126 72" aria-hidden="true">
            {/* cabeceira + pezinho */}
            <rect x="112" y="6" width="12" height="60" rx="5" fill="#a8815c" />
            <rect x="2" y="40" width="10" height="26" rx="4" fill="#a8815c" />
            {/* estrado + colchão */}
            <rect x="4" y="38" width="116" height="20" rx="8" fill="#c9a97b" />
            <rect x="8" y="26" width="108" height="20" rx="10" fill="#f7f1e4" />
            {/* travesseiro */}
            <rect x="86" y="18" width="28" height="15" rx="7" fill="#e8ddf7" />
          </svg>
        </button>

        {/* balão de fala */}
        {balao && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 z-10 bg-white text-[#4a3b2a] text-xs font-semibold px-3 py-1.5 rounded-full shadow-md border border-black/5">
            {balao}
          </div>
        )}

        {/* o pet — dormindo, desliza até a caminha */}
        <div
          className={cn(
            'absolute text-black/70 transition-all duration-700 ease-in-out',
            humor === 'dormindo' ? 'left-[206px] bottom-7 w-28 h-28' : 'left-[93px] bottom-3 w-36 h-36',
          )}
        >
          <PetSvg humor={humor} roupa={roupa} className="w-full h-full" />
        </div>

        {/* cobertinha por cima do pet na caminha */}
        {humor === 'dormindo' && (
          <svg
            className="absolute right-2 bottom-2 pointer-events-none"
            width="126" height="72" viewBox="0 0 126 72" aria-hidden="true"
          >
            <path d="M8 34 C 26 26 48 30 64 32 C 84 34 100 28 116 36 L 116 46 C 116 52 112 56 107 56 L 17 56 C 11 56 8 48 8 34 Z" fill="#b8a5e3" />
            <path d="M12 44 C 34 40 76 43 112 46" stroke="#a690d6" strokeWidth="2" fill="none" opacity=".6" strokeLinecap="round" />
          </svg>
        )}
      </div>

      {/* Modo teaser: só a mensagem, sem ações/lojas */}
      {modoTeaser && (
        <div className="p-4 space-y-2 text-center">
          <p className="text-sm font-bold text-foreground">🐾 Em breve!</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Seu pet ganhará novas funcionalidades! Conforme você aumentar seus
            recebimentos e atingir metas, poderá cuidar dele, interagir,
            desbloquear itens e acompanhar sua evolução.
          </p>
          <p className="text-xs font-medium text-foreground">
            Continue recebendo e prepare-se para novas aventuras! 💰✨🐾
          </p>
        </div>
      )}

      {/* Ações rápidas + lojas (modo completo) */}
      {!modoTeaser && (<>
      {/* Recompensa do recebimento do dia — converte em moedas */}
      {recompensaMoedas > 0 && (
        <button
          type="button"
          onClick={onResgatar}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-amber-400/10 hover:bg-amber-400/20 transition-colors text-left"
        >
          <span className="text-xl shrink-0">🪙</span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-bold text-foreground">
              Pegar recompensa do dia
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {formatBRL(recompensaValor)} recebido{recompensaValor > 0 ? '' : 's'} · +{recompensaMoedas} moedas
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-amber-500 text-amber-950 text-[11px] font-bold px-2.5 py-1">
            +{recompensaMoedas}
          </span>
        </button>
      )}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={() => setAba('comidas')}>
          <UtensilsCrossed className="w-3.5 h-3.5" /> Alimentar
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={onAlternarSono}>
          {humor === 'dormindo'
            ? <><Sun className="w-3.5 h-3.5" /> Acordar</>
            : <><Moon className="w-3.5 h-3.5" /> Dormir</>}
        </Button>
      </div>

      {/* Abas */}
      <div className="flex border-b border-border">
        {([
          { id: 'quarto',  label: 'Quarto',  Icon: Home },
          { id: 'loja',    label: 'Loja',    Icon: Store },
          { id: 'roupas',  label: 'Roupas',  Icon: Shirt },
          { id: 'comidas', label: 'Comidas', Icon: UtensilsCrossed },
        ] as { id: Aba; label: string; Icon: typeof Home }[]).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
              aba === id ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground',
            )}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div className="p-3 min-h-[96px] max-h-64 overflow-y-auto">
        {aba === 'quarto' && (
          <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
            <p>
              Este é o cantinho do seu <strong className="text-foreground">{petNome}</strong>.
              Você tem <strong className="text-amber-600 dark:text-amber-400">🪙 {moedas.toLocaleString('pt-BR')} moedas</strong>.
            </p>
            <p>
              Ganhe moedas a cada recebimento do dia 💰 e gaste na{' '}
              <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => setAba('loja')}>
                Loja do mês
              </button>{' '}
              — a vitrine troca todo mês, mas o que você comprar é seu para sempre.
            </p>
            {/* clima real: o pet reage (guarda-chuva, picolé, cachecol…) */}
            {clima && onSetCidadeClima && (
              <div className="pt-1.5 border-t border-border/60 space-y-1.5">
                <p>
                  Lá fora: <strong className="text-foreground">{descricaoClima(clima.clima)}</strong>
                  {clima.temperatura != null && <> · {clima.temperatura}°C</>}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">Clima de:</span>
                  {CIDADES_CLIMA.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSetCidadeClima(c.id)}
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors',
                        c.id === cidadeClimaId
                          ? 'border-primary text-primary bg-primary/10'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {c.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Loja mensal: vitrine rotativa ── */}
        {aba === 'loja' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-foreground capitalize">
                🛍️ Loja de {MESES_LOJA[Number(mesAtual.split('-')[1]) - 1]}
              </p>
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                troca em {diasTroca} dia{diasTroca !== 1 ? 's' : ''}
              </span>
            </div>
            {!lojaAtiva && (
              <p className="text-[11px] text-muted-foreground text-center py-4">
                A lojinha está fechada no momento. Volte mais tarde! 🔒
              </p>
            )}
            {lojaAtiva && vitrine.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-4">
                Novidades chegando… a vitrine deste mês ainda está sendo montada! 📦
              </p>
            )}
            {lojaAtiva && (
              <div className="grid grid-cols-2 gap-2">
                {vitrine.map(item => {
                  const comprado = itens.includes(item.id);
                  const equipada = roupa === item.id;
                  const semSaldo = moedas < item.preco;
                  return (
                    <div key={item.id} className={cn(
                      'rounded-xl border p-2 text-center space-y-1',
                      equipada ? 'border-primary bg-primary/5' : 'border-border',
                    )}>
                      <p className="text-2xl leading-none">{item.emoji}</p>
                      <p className="text-[11px] font-medium text-foreground truncate">{item.nome}</p>
                      {comprado ? (
                        <Button
                          size="sm" variant={equipada ? 'default' : 'outline'}
                          className="h-6 w-full text-[10px]"
                          onClick={() => onSetRoupa(equipada ? 'nenhuma' : item.id)}
                        >
                          {equipada ? 'Remover' : 'Equipar'}
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="outline"
                          className={cn('h-6 w-full text-[10px] gap-1', !semSaldo && 'border-amber-400/60 text-amber-700 dark:text-amber-400 hover:bg-amber-400/10')}
                          disabled={semSaldo || comprando === item.id}
                          title={semSaldo ? `Faltam ${(item.preco - moedas).toLocaleString('pt-BR')} moedas` : undefined}
                          onClick={() => void comprarItemLoja(item.id, item.preco, item.nome)}
                        >
                          {comprando === item.id ? '…' : <>🪙 {item.preco.toLocaleString('pt-BR')}</>}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Guarda-roupa: grátis + tudo que já foi comprado (permanente) ── */}
        {aba === 'roupas' && (
          <div className="grid grid-cols-2 gap-2">
            {[
              ...ROUPAS_CATALOGO,
              ...itens.map(roupaInfo).filter((r): r is NonNullable<ReturnType<typeof roupaInfo>> => r !== null),
            ].map(r => {
              const equipada = roupa === r.id;
              return (
                <div key={r.id} className={cn('rounded-xl border p-2 text-center space-y-1', equipada ? 'border-primary bg-primary/5' : 'border-border')}>
                  <p className="text-2xl">{r.emoji}</p>
                  <p className="text-[11px] font-medium text-foreground truncate">{r.nome}</p>
                  <Button
                    size="sm" variant={equipada ? 'default' : 'outline'}
                    className="h-6 w-full text-[10px]"
                    onClick={() => onSetRoupa(equipada ? 'nenhuma' : r.id)}
                  >
                    {equipada ? 'Remover' : 'Equipar'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Comidas: consumíveis baratinhos ── */}
        {aba === 'comidas' && (
          <div className="grid grid-cols-3 gap-2">
            {COMIDAS_CATALOGO.map(c => (
              <div key={c.id} className="rounded-xl border border-border p-2 text-center space-y-1">
                <p className="text-2xl">{c.emoji}</p>
                <p className="text-[11px] font-medium text-foreground">{c.nome}</p>
                <Button
                  size="sm" variant="outline"
                  className="h-6 w-full text-[10px]"
                  disabled={!lojaAtiva || moedas < c.preco || comprando === c.id}
                  title={!lojaAtiva ? 'Indisponível no momento' : moedas < c.preco ? 'Moedas insuficientes' : undefined}
                  onClick={() => void comprarComida(c.id, c.preco, c.nome)}
                >
                  {comprando === c.id ? '…' : <>🪙 {c.preco}</>}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      </>)}
    </motion.div>
  );
}
