/**
 * DialogUsuario — criar e editar uma pessoa.
 *
 * ## O que mudou em 06/09/2026
 *
 * A janela era uma coluna de rótulos e campos, todos com o mesmo peso: nome,
 * login, e-mail, cargo, setor e empresa em fila, a foto colada em cima e a
 * senha embaixo. Nada dizia quais daqueles campos ela ia mesmo gravar — e
 * metade deles não grava: setor e empresa são somente-leitura porque mudá-los
 * é TRANSFERÊNCIA, e o e-mail não muda depois de criado.
 *
 * Agora a janela tem três seções com assunto próprio (identidade, função e
 * lotação, acesso) e uma quarta separada para o que não se desfaz. O cabeçalho
 * mostra de quem é a ficha — foto, nome, cargo e presença — em vez de repetir
 * «Editar Usuário».
 *
 * ## Campo fechado aparece fechado, e diz por quê
 *
 * O que o cargo de quem edita não pode mexer não some da tela: vira leitura com
 * cadeado e um título que explica. Sumir o campo faz a pessoa procurar onde ele
 * foi parar; mostrá-lo trancado responde a pergunta antes dela.
 *
 * ## As chaves
 *
 * Cada campo tem a sua (`usuarios_editar_nome`, `_login`, `_foto`, `_cargo`,
 * `usuarios_redefinir_senha`, `usuarios_excluir`). Antes disso, nome/login/foto
 * abriam para quem abrisse a janela, cargo e senha exigiam
 * `usuarios_administrar`, e excluir não checava nada — regras no código, que
 * ninguém conseguia mudar sem mexer no código.
 *
 * ⚠️ Dois pontos do servidor ainda conferem CARGO em vez de chave —
 * `api/alterar-senha.ts` e `fn_admin_delete_user`. Ligar `usuarios_redefinir_senha`
 * ou `usuarios_excluir` para gerência abre o campo aqui e o servidor recusa. Isso
 * é dívida contra a doutrina do painel, não o desenho: está na auditoria de
 * 06/09/2026, e o conserto é migration.
 */
import { useMemo } from 'react';
import {
  Camera, Trash2, KeyRound, Save, Lock, ArrowRightLeft, Building2, Shield,
  AlertTriangle, Loader2, UserPlus, IdCard, Briefcase, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MIN_SENHA } from '@/services/senha.service';
import { PERFIL_LABELS, PERFIL_COLORS } from '@/lib/index';
import type { Perfil, PerfilUsuario, Setor, Empresa } from '@/lib/supabase';
import { cn } from '@/lib/utils';

export interface UserForm {
  nome:       string;
  email:      string;
  usuario:    string;
  senha:      string;
  perfil:     PerfilUsuario;
  setor_id:   string;
  empresa_id: string;
}

/** O que o cargo de quem está editando pode mexer nesta pessoa. */
export interface PodeNoUsuario {
  nome:     boolean;
  login:    boolean;
  foto:     boolean;
  cargo:    boolean;
  senha:    boolean;
  excluir:  boolean;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** `null` = criação. */
  editando: Perfil | null;
  form: UserForm;
  setForm: React.Dispatch<React.SetStateAction<UserForm>>;

  pode: PodeNoUsuario;
  isSuperAdmin: boolean;
  souEu: boolean;
  online: boolean;

  setoresDoForm: Setor[];
  setores: Setor[];
  empresas: Empresa[];
  empresaAtualNome?: string;

  /** Cargo que pertence à EMPRESA, não a um setor — o campo Setor sai da tela. */
  cargoEscopoEmpresa: boolean;
  /** Sem setor num cargo que precisa de um: aqui, e só aqui, o campo abre. */
  setorVazioParaPreencher: boolean;

  salvando: boolean;
  onSalvar: () => void;

  // Foto
  uploadando: boolean;
  onEscolherFoto: () => void;
  onRemoverFoto: () => void;

  // Senha
  novaSenha: string;
  setNovaSenha: (v: string) => void;
  salvandoSenha: boolean;
  onSalvarSenha: () => void;

  // Exclusão
  onPedirExclusao: () => void;
  excluindo: boolean;
}

/** Campo somente-leitura com o motivo à mão. */
function CampoTrancado({
  valor, motivo, Icone = Lock,
}: { valor: string; motivo: string; Icone?: typeof Lock }) {
  return (
    <>
      <div
        className="h-9 flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
        title={motivo}
      >
        <Icone className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span className="truncate">{valor}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{motivo}</p>
    </>
  );
}

/** Título de seção — o que dá à janela um esqueleto em vez de uma fila. */
function Secao({
  titulo, Icone, children,
}: { titulo: string; Icone: typeof Lock; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Icone className="w-3.5 h-3.5 text-primary shrink-0" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </h3>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  );
}

const SEM_PERMISSAO = 'Seu cargo não tem permissão para alterar este campo.';

export function DialogUsuario({
  aberto, onFechar, editando, form, setForm,
  pode, isSuperAdmin, souEu, online,
  setoresDoForm, setores, empresas, empresaAtualNome,
  cargoEscopoEmpresa, setorVazioParaPreencher,
  salvando, onSalvar,
  uploadando, onEscolherFoto, onRemoverFoto,
  novaSenha, setNovaSenha, salvandoSenha, onSalvarSenha,
  onPedirExclusao, excluindo,
}: Props) {
  const criando = !editando;
  const iniciais = useMemo(
    () => (form.nome || editando?.nome || '?').split(' ').map(n => n[0]).slice(0, 2).join(''),
    [form.nome, editando?.nome],
  );

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        {/* ── Cabeçalho: de quem é esta ficha ──────────────────────────────
            Era o texto «Editar Usuário», que quem abriu já sabia. A foto e o
            cargo respondem a pergunta que sobra: editar quem, e o que ele é. */}
        <DialogHeader className="space-y-0 border-b border-border bg-gradient-to-br from-muted/50 to-transparent px-5 py-4">
          {criando ? (
            <>
              <DialogTitle className="flex items-center gap-2 text-base">
                <UserPlus className="w-4 h-4 text-primary" /> Novo usuário
              </DialogTitle>
              <DialogDescription className="text-xs pt-1">
                A pessoa entra com o login e a senha que você definir aqui.
              </DialogDescription>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <Avatar className="w-12 h-12">
                  {editando.foto_url && <AvatarImage src={editando.foto_url} alt={editando.nome} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {iniciais}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background',
                    online ? 'bg-success' : 'bg-muted-foreground/30',
                  )}
                  title={online ? 'Online agora' : 'Offline'}
                />
              </div>
              <div className="min-w-0 text-left">
                <DialogTitle className="text-base truncate">{editando.nome}</DialogTitle>
                <DialogDescription className="flex items-center gap-1.5 pt-1">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border',
                    PERFIL_COLORS[editando.perfil] ?? 'bg-muted/10 text-muted-foreground border-border',
                  )}>
                    <Shield className="w-2.5 h-2.5" />
                    {PERFIL_LABELS[editando.perfil] ?? editando.perfil}
                  </span>
                  {souEu && (
                    <span className="text-[10px] bg-primary/15 text-primary border border-primary/30 rounded px-1 font-bold">
                      Você
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="px-5 py-4 space-y-5">
          {/* ── Identidade ── */}
          <Secao titulo="Identidade" Icone={IdCard}>
            {editando && (
              <div className="flex items-center gap-3">
                <Avatar className="w-14 h-14">
                  {editando.foto_url && <AvatarImage src={editando.foto_url} alt={editando.nome} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {iniciais}
                  </AvatarFallback>
                </Avatar>
                {pode.foto ? (
                  <div className="flex flex-col gap-1.5">
                    <Button
                      type="button" variant="outline" size="sm" className="h-8 gap-1.5"
                      disabled={uploadando} onClick={onEscolherFoto}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {uploadando ? 'Enviando...' : (editando.foto_url ? 'Trocar foto' : 'Adicionar foto')}
                    </Button>
                    {editando.foto_url && (
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-7 gap-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        onClick={onRemoverFoto}
                      >
                        <Trash2 className="w-3 h-3" /> Remover foto
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3 h-3 shrink-0" /> {SEM_PERMISSAO}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Nome {criando && '*'}</Label>
              {criando || pode.nome ? (
                <Input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome completo" className="h-9 text-sm"
                />
              ) : (
                <CampoTrancado valor={form.nome || '—'} motivo={SEM_PERMISSAO} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Login (usuário)</Label>
              {criando || pode.login ? (
                <>
                  <Input
                    value={form.usuario}
                    onChange={e => setForm(f => ({ ...f, usuario: e.target.value }))}
                    placeholder="kauan_teixeira" className="h-9 text-sm font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Usado para entrar sem e-mail. Opcional se usar e-mail.
                  </p>
                </>
              ) : (
                <CampoTrancado valor={form.usuario || '—'} motivo={SEM_PERMISSAO} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                E-mail{' '}
                {criando && <span className="text-muted-foreground font-normal">(opcional se definir login)</span>}
              </Label>
              {criando ? (
                <Input
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@empresa.com" className="h-9 text-sm font-mono"
                />
              ) : (
                /* Não é falta de permissão: o e-mail é a identidade no Auth e
                   não muda depois de criado, para ninguém. */
                <CampoTrancado
                  valor={form.email || '—'}
                  motivo="O e-mail é a identidade da conta no login e não muda depois de criada."
                />
              )}
            </div>

            {criando && (
              <div className="space-y-1.5">
                <Label className="text-xs">Senha *</Label>
                <Input
                  type="password" value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="••••••••" className="h-9 text-sm"
                />
              </div>
            )}
          </Secao>

          {/* ── Função e lotação ── */}
          <Secao titulo="Função e lotação" Icone={Briefcase}>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo {criando && '*'}</Label>
              {pode.cargo ? (
                <>
                  <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v as PerfilUsuario }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operador">Operador</SelectItem>
                      <SelectItem value="lider">Líder</SelectItem>
                      <SelectItem value="elite">Elite</SelectItem>
                      <SelectItem value="gerencia">Gerência</SelectItem>
                      <SelectItem value="diretoria">Diretoria</SelectItem>
                      <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
                      <SelectItem value="rh">RH</SelectItem>
                      <SelectItem value="administrador">Administrador</SelectItem>
                      {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    O cargo decide o que a pessoa enxerga e pode fazer. Quem define
                    isso por cargo é o painel de <strong>Permissões</strong>.
                  </p>
                </>
              ) : (
                <CampoTrancado
                  valor={PERFIL_LABELS[form.perfil] ?? form.perfil}
                  motivo={SEM_PERMISSAO}
                  Icone={Shield}
                />
              )}
            </div>

            {/* Setor: escolhido ao CRIAR, somente leitura ao editar.
                ─────────────────────────────────────────────────────────────
                Mudá-lo depois é uma TRANSFERÊNCIA: apaga tabulação ou muda o
                setor dela, libera NR, tira de equipe e clones, deixa fantasma
                na equipe de origem e precisa poder ser desfeita. A porta é o
                botão Transferir, na linha da pessoa. */}
            {/* Cúpula (diretoria/administrador/super_admin) pertence à EMPRESA,
                não a um setor — o campo sai da tela em vez de ficar desabilitado
                com um valor que o banco vai descartar. O gatilho
                `a_trg_perfis_escopo_empresa` zera setor_id/equipe_id na
                gravação, então mesmo um payload antigo não recria o vínculo. */}
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              {cargoEscopoEmpresa ? (
                <CampoTrancado
                  valor="Empresa inteira"
                  Icone={Building2}
                  motivo={`${PERFIL_LABELS[form.perfil] ?? form.perfil} não pertence a um setor: a visão é da empresa toda.`}
                />
              ) : setorVazioParaPreencher ? (
                /* Sem setor num cargo que precisa de um. Não é transferência —
                   não há de onde sair —, então o campo abre. Ver
                   `setorVazioParaPreencher`. */
                <>
                  <Select value={form.setor_id} onValueChange={v => setForm(f => ({ ...f, setor_id: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
                    <SelectContent>
                      {setoresDoForm.length === 0
                        ? <SelectItem value="__none__" disabled>Nenhum setor nesta empresa</SelectItem>
                        : setoresDoForm.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-warning flex items-start gap-1 leading-snug">
                    <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>
                      {PERFIL_LABELS[form.perfil] ?? form.perfil} pertence a um setor e está
                      sem nenhum — assim o Painel Líder e o Analítico dessa pessoa ficam zerados.
                    </span>
                  </p>
                </>
              ) : editando ? (
                <CampoTrancado
                  valor={setores.find(s => s.id === editando.setor_id)?.nome ?? 'Sem setor'}
                  Icone={ArrowRightLeft}
                  motivo="Mover de setor é uma transferência — use Transferir na linha da pessoa, na lista."
                />
              ) : (
                <Select value={form.setor_id} onValueChange={v => setForm(f => ({ ...f, setor_id: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um setor" /></SelectTrigger>
                  <SelectContent>
                    {setoresDoForm.length === 0
                      ? <SelectItem value="__none__" disabled>Nenhum setor nesta empresa</SelectItem>
                      : setoresDoForm.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Empresa</Label>
              {isSuperAdmin && criando ? (
                <Select
                  value={form.empresa_id}
                  onValueChange={v => setForm(f => ({
                    ...f, empresa_id: v, setor_id: setores.find(s => s.empresa_id === v)?.id ?? '',
                  }))}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <CampoTrancado
                  valor={
                    (editando && empresas.find(e => e.id === editando.empresa_id)?.nome)
                    ?? empresaAtualNome ?? 'Tenant atual'
                  }
                  Icone={Building2}
                  motivo="Mudar de empresa é uma transferência — use Transferir na linha da pessoa."
                />
              )}
            </div>
          </Secao>

          {/* ── Acesso ───────────────────────────────────────────────────────
              A senha atual não é exibida porque não existe para ser exibida: o
              Supabase guarda o hash bcrypt, que não volta a texto. O que dá
              para fazer é definir uma nova. */}
          {editando && pode.senha && (
            <Secao titulo="Acesso" Icone={KeyRound}>
              <div className="space-y-1.5">
                <Label className="text-xs">Nova senha</Label>
                <Input
                  type="text" value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Deixe em branco para manter a senha atual"
                  className="h-9 text-sm font-mono" autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Mínimo {MIN_SENHA} caracteres. A senha atual não pode ser consultada —
                  só substituída. Informe a nova a {editando.nome.split(' ')[0]}; o botão
                  de chave vai aparecer para ela definir uma própria.
                </p>
              </div>
              {novaSenha.length > 0 && (
                <Button
                  type="button" variant="secondary" size="sm" className="h-8 gap-1.5 w-full"
                  disabled={salvandoSenha || novaSenha.length < MIN_SENHA}
                  onClick={onSalvarSenha}
                >
                  {salvandoSenha
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <KeyRound className="w-3.5 h-3.5" />}
                  {salvandoSenha ? 'Salvando senha...' : 'Salvar nova senha'}
                </Button>
              )}
            </Secao>
          )}

          {/* ── O que não se desfaz ───────────────────────────────────────────
              Separado do resto de propósito: excluir apaga tabulação, e um botão
              destrutivo na mesma fila do «Salvar» é um clique de distância de um
              engano que não volta. */}
          {editando && pode.excluir && !souEu && (
            <section className="rounded-lg border border-destructive/30 bg-destructive/[0.04] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
                  Não tem volta
                </h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Excluir remove a conta e as tabulações da pessoa. Uma planilha com
                todas elas é baixada antes, e os NRs voltam a ficar livres.
              </p>
              <Button
                variant="outline" size="sm"
                className="gap-2 h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={onPedirExclusao} disabled={excluindo}
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir usuário
              </Button>
            </section>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onFechar} disabled={salvando}>
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={onSalvar} disabled={salvando} className="gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {salvando ? 'Salvando...' : criando ? 'Criar usuário' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
