/**
 * ensaio.ts — a Guerra na Corrida sem banco: o «Testar só na minha tela» do
 * super_admin e o laboratório. Espelha a conta da migration 20261023150000
 * (`fn_corrida_guerra_recalcular`) com as mesmas regras (`regras.ts`); o teste
 * (`ensaio.test.ts`) confere que a guerra e o chefe andam igual.
 *
 * O relógio é injetado (`agora`, em ms): o teste anda o tempo que quiser.
 */
import { alvoDaGuerra, curaDoRitmo, danoBruto, GUERRA, pressaoEfetiva, RITMO, ritmoDaLuta, vidaDoChefe, type LoteDeGolpes } from './regras';
import type { EstadoGuerra } from './tipos';

interface Golpes { cliques: number; dano: number; efetivo: number }

export class EnsaioGuerra {
  private comecou: number | null = null;
  private sobrou: number | null = null;
  private alvo = 0;
  private vidaMax = 0;
  private vida = 0;
  private curaTotal = 0;
  private curas = 0;
  private curaEm: number | null = null;
  private curaVida = 0;
  private ritmo = 1;
  private caiu: number | null = null;
  private pessoas = 0;
  private versao = 0;
  private readonly golpes = new Map<string, Golpes>();

  constructor(private readonly cavalos: number, private readonly presentes: number, private readonly agora: () => number = () => Date.now()) {}

  private de(quem: string): Golpes { let g = this.golpes.get(quem); if (!g) this.golpes.set(quem, g = { cliques: 0, dano: 0, efetivo: 0 }); return g; }
  private soltaEm(): number | null { return this.sobrou == null ? null : this.sobrou + GUERRA.filmeS * 1000; }

  atacar(quem: string, cliques: number): EstadoGuerra {
    if (this.comecou == null) { this.comecou = this.agora(); this.alvo = alvoDaGuerra(this.cavalos, this.presentes); }
    if (this.sobrou == null) this.de(quem).cliques += Math.min(GUERRA.maxCliquesPorEnvio, Math.max(0, Math.floor(cliques)));
    return this.recalcular();
  }
  golpear(quem: string, lote: LoteDeGolpes): EstadoGuerra {
    const solta = this.soltaEm(), agora = this.agora();
    if (solta == null || agora < solta || this.caiu != null || agora > solta + GUERRA.prazoS * 1000) return this.estado();
    const bruto = danoBruto(lote, this.vidaMax), mult = ritmoDaLuta((agora - solta) / 1000, Math.max(0, this.vida) / this.vidaMax);
    const g = this.de(quem); g.dano += bruto; g.efetivo += bruto * mult;
    return this.recalcular();
  }
  /** A mesma conta do banco (sem o «no máximo 1 vez por segundo»: aqui não há fila). */
  recalcular(): EstadoGuerra {
    const agora = this.agora();
    if (this.comecou != null && this.sobrou == null) {
      const pressao = [...this.golpes.values()].reduce((s, g) => s + g.cliques, 0);
      if (pressaoEfetiva(pressao, this.alvo, (agora - this.comecou) / 1000) >= this.alvo) {
        this.sobrou = agora;
        this.pessoas = Math.min(GUERRA.maxPessoas, Math.max(1, [...this.golpes.values()].filter(g => g.cliques > 0).length));
        this.vidaMax = vidaDoChefe(this.pessoas); this.vida = this.vidaMax;
      }
      this.versao++;
    }
    const solta = this.soltaEm();
    if (solta != null && this.caiu == null && agora >= solta) {
      const t = (agora - solta) / 1000, soma = [...this.golpes.values()].reduce((s, g) => s + g.efetivo, 0);
      let vida = this.vidaMax + this.curaTotal - soma;
      if (t < RITMO.minS && vida < RITMO.piso * this.vidaMax) { this.curaTotal += RITMO.piso * this.vidaMax - vida; vida = RITMO.piso * this.vidaMax; }
      let fracao = Math.max(0, vida) / this.vidaMax;
      const cura = curaDoRitmo(t, fracao, (agora - (this.curaEm ?? solta)) / 1000);
      if (cura > 0 && vida > 0) { this.curaTotal += cura * this.vidaMax; this.curas++; this.curaEm = agora; this.curaVida = Math.round(cura * this.vidaMax); vida += cura * this.vidaMax; fracao = vida / this.vidaMax; }
      if (vida <= 0) { vida = 0; this.caiu = agora; }
      this.vida = Math.round(vida * 10) / 10; this.ritmo = ritmoDaLuta(t, fracao); this.versao++;
    }
    return this.estado();
  }
  estado(): EstadoGuerra {
    const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
    const solta = this.soltaEm();
    const pressao = [...this.golpes.values()].reduce((s, g) => s + g.cliques, 0);
    return {
      corrida_id: 0, ligada: true, versao: this.versao, agora: iso(this.agora()),
      cavalos: this.cavalos, alvo: this.comecou == null ? null : this.alvo, comecou_em: iso(this.comecou), pressao,
      sobrou_em: iso(this.sobrou), solta_em: iso(solta), expira_em: solta == null ? null : iso(solta + GUERRA.prazoS * 1000),
      pessoas: this.pessoas, vida_max: this.vidaMax || null, vida: this.vidaMax ? this.vida : null,
      curas: this.curas, cura_em: iso(this.curaEm), cura_vida: this.curaVida, ritmo: this.ritmo, caiu_em: iso(this.caiu),
      atacando: [...this.golpes.values()].filter(g => g.cliques > 0).length,
      ranking: [...this.golpes.entries()].filter(([, g]) => g.dano > 0).sort((a, b) => b[1].dano - a[1].dano).slice(0, 8)
        .map(([quem, g]) => ({ usuario: quem, nome: quem, foto: null as string | null, dano: Math.round(g.dano) })),
    };
  }
}
