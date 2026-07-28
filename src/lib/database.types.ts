export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      aceites_termo: {
        Row: {
          aceito_em: string
          id: string
          ip: string | null
          termo_id: string
          user_agent: string | null
          usuario_id: string
        }
        Insert: {
          aceito_em?: string
          id?: string
          ip?: string | null
          termo_id: string
          user_agent?: string | null
          usuario_id: string
        }
        Update: {
          aceito_em?: string
          id?: string
          ip?: string | null
          termo_id?: string
          user_agent?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aceites_termo_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos_uso"
            referencedColumns: ["id"]
          },
        ]
      }
      acordos: {
        Row: {
          acordo_grupo_id: string | null
          atualizado_em: string
          criado_em: string
          data_cadastro: string
          data_pagamento: string | null
          empresa_id: string
          estado_uf: string | null
          id: string
          instituicao: string | null
          nome_cliente: string
          nr_cliente: string
          numero_parcela: number | null
          observacoes: string | null
          operador_id: string
          pago_em: string | null
          parcelas: number | null
          setor_id: string | null
          status: 'verificar_pendente' | 'pago' | 'nao_pago'
          tag_ids: string[] | null
          tipo: 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico'
          tipo_vinculo: 'direto' | 'extra'
          usou_quarenta_pct: boolean
          valor: number
          valor_total: number | null
          vencimento: string
          vinculo_operador_id: string | null
          vinculo_operador_nome: string | null
          whatsapp: string | null
        }
        Insert: {
          acordo_grupo_id?: string | null
          atualizado_em?: string
          criado_em?: string
          data_cadastro?: string
          data_pagamento?: string | null
          empresa_id: string
          estado_uf?: string | null
          id?: string
          instituicao?: string | null
          nome_cliente: string
          nr_cliente: string
          numero_parcela?: number | null
          observacoes?: string | null
          operador_id: string
          pago_em?: string | null
          parcelas?: number | null
          setor_id?: string | null
          status?: 'verificar_pendente' | 'pago' | 'nao_pago'
          tag_ids?: string[] | null
          tipo: 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico'
          tipo_vinculo?: 'direto' | 'extra'
          usou_quarenta_pct?: boolean
          valor: number
          valor_total?: number | null
          vencimento: string
          vinculo_operador_id?: string | null
          vinculo_operador_nome?: string | null
          whatsapp?: string | null
        }
        Update: {
          acordo_grupo_id?: string | null
          atualizado_em?: string
          criado_em?: string
          data_cadastro?: string
          data_pagamento?: string | null
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          instituicao?: string | null
          nome_cliente?: string
          nr_cliente?: string
          numero_parcela?: number | null
          observacoes?: string | null
          operador_id?: string
          pago_em?: string | null
          parcelas?: number | null
          setor_id?: string | null
          status?: 'verificar_pendente' | 'pago' | 'nao_pago'
          tag_ids?: string[] | null
          tipo?: 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico'
          tipo_vinculo?: 'direto' | 'extra'
          usou_quarenta_pct?: boolean
          valor?: number
          valor_total?: number | null
          vencimento?: string
          vinculo_operador_id?: string | null
          vinculo_operador_nome?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_recebimentos: {
        Row: {
          acordo_id: string | null
          codigo: string
          data_pagamento: string
          empresa_id: string
          forma_detalhe: string | null
          forma_pagamento: string
          id: string
          importado_em: string
          importado_por_id: string | null
          instituicao: string | null
          lote_id: string
          mes_referencia: string
          nome_cliente: string | null
          operador_id: string | null
          operador_usuario: string
          pagamentos_detalhados: Json | null
          setor_id: string | null
          status_tabulacao: string
          total_ho: number
          valor_recebido: number
          visto: boolean
        }
        Insert: {
          acordo_id?: string | null
          codigo: string
          data_pagamento: string
          empresa_id: string
          forma_detalhe?: string | null
          forma_pagamento: string
          id?: string
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id: string
          mes_referencia: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario: string
          pagamentos_detalhados?: Json | null
          setor_id?: string | null
          status_tabulacao?: string
          total_ho?: number
          valor_recebido?: number
          visto?: boolean
        }
        Update: {
          acordo_id?: string | null
          codigo?: string
          data_pagamento?: string
          empresa_id?: string
          forma_detalhe?: string | null
          forma_pagamento?: string
          id?: string
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id?: string
          mes_referencia?: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario?: string
          pagamentos_detalhados?: Json | null
          setor_id?: string | null
          status_tabulacao?: string
          total_ho?: number
          valor_recebido?: number
          visto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "analitico_recebimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analitico_recebimentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      analitico_resumo_mensal: {
        Row: {
          atualizado_em: string | null
          empresa_id: string
          id: string
          mes: string
          periodo_fim: string | null
          periodo_inicio: string | null
          total_ho: number
          total_operadores: number
          total_pagamentos: number
          total_recebido: number
        }
        Insert: {
          atualizado_em?: string | null
          empresa_id: string
          id?: string
          mes: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          total_ho?: number
          total_operadores?: number
          total_pagamentos?: number
          total_recebido?: number
        }
        Update: {
          atualizado_em?: string | null
          empresa_id?: string
          id?: string
          mes?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          total_ho?: number
          total_operadores?: number
          total_pagamentos?: number
          total_recebido?: number
        }
        Relationships: [
          {
            foreignKeyName: "analitico_resumo_mensal_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_facil_mensagens: {
        Row: {
          atualizado_em: string
          categoria: string
          corpo: string
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          empresa_id: string
          id: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          categoria?: string
          corpo: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa_id: string
          id?: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          categoria?: string
          corpo?: string
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          empresa_id?: string
          id?: string
          titulo?: string
        }
        Relationships: []
      }
      campanha_facil_descontos: {
        Row: {
          annual: number
          atualizado_em: string
          bundle: number
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          interest: number
          nome: string
          overdue: number
          settlement: number
        }
        Insert: {
          annual?: number
          atualizado_em?: string
          bundle?: number
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          interest?: number
          nome: string
          overdue?: number
          settlement?: number
        }
        Update: {
          annual?: number
          atualizado_em?: string
          bundle?: number
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          interest?: number
          nome?: string
          overdue?: number
          settlement?: number
        }
        Relationships: []
      }
      campanha_facil_mensagens_ocultas: {
        Row: {
          criado_em: string
          empresa_id: string
          ocultado_por: string | null
          template_id: string
        }
        Insert: {
          criado_em?: string
          empresa_id: string
          ocultado_por?: string | null
          template_id: string
        }
        Update: {
          criado_em?: string
          empresa_id?: string
          ocultado_por?: string | null
          template_id?: string
        }
        Relationships: []
      }
      cargos_permissoes: {
        Row: {
          atualizado_em: string
          cargo: string
          criado_em: string
          descricao: string | null
          empresa_id: string
          id: string
          permissoes: Json
        }
        Insert: {
          atualizado_em?: string
          cargo: string
          criado_em?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          permissoes?: Json
        }
        Update: {
          atualizado_em?: string
          cargo?: string
          criado_em?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          permissoes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cargos_permissoes_2026_04_16_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      diario_recebimentos: {
        Row: {
          acordo_codigo: string | null
          chave_unica: string
          cliente_codigo: string | null
          data_pagamento: string | null
          dia_referencia: string
          empresa_id: string
          forma_pagamento: string
          id: string
          id_baixa: string | null
          import_index: number
          importado_em: string
          importado_por_id: string | null
          instituicao: string | null
          lote_id: string
          nome_cliente: string | null
          operador_id: string | null
          operador_usuario: string
          prox_contato: string | null
          setor_id: string | null
          tabulacao: string | null
          valor_recebido: number
          visto: boolean
        }
        Insert: {
          acordo_codigo?: string | null
          chave_unica: string
          cliente_codigo?: string | null
          data_pagamento?: string | null
          dia_referencia: string
          empresa_id: string
          forma_pagamento?: string
          id?: string
          id_baixa?: string | null
          import_index?: number
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario: string
          prox_contato?: string | null
          setor_id?: string | null
          tabulacao?: string | null
          valor_recebido?: number
          visto?: boolean
        }
        Update: {
          acordo_codigo?: string | null
          chave_unica?: string
          cliente_codigo?: string | null
          data_pagamento?: string | null
          dia_referencia?: string
          empresa_id?: string
          forma_pagamento?: string
          id?: string
          id_baixa?: string | null
          import_index?: number
          importado_em?: string
          importado_por_id?: string | null
          instituicao?: string | null
          lote_id?: string
          nome_cliente?: string | null
          operador_id?: string | null
          operador_usuario?: string
          prox_contato?: string | null
          setor_id?: string | null
          tabulacao?: string | null
          valor_recebido?: number
          visto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "diario_recebimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_recebimentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diario_recebimentos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      direto_extra_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          empresa_id: string
          escopo: string
          id: string
          referencia_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id: string
          escopo: string
          id?: string
          referencia_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          empresa_id?: string
          escopo?: string
          id?: string
          referencia_id?: string
        }
        Relationships: []
      }
      documentos_lgpd: {
        Row: {
          atualizado_em: string
          conteudo: string
          criado_em: string
          empresa_id: string | null
          id: string
          tipo: string
          titulo: string
          versao: string
        }
        Insert: {
          atualizado_em?: string
          conteudo: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          tipo: string
          titulo: string
          versao?: string
        }
        Update: {
          atualizado_em?: string
          conteudo?: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          tipo?: string
          titulo?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_lgpd_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          config: Json | null
          criado_em: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          config?: Json | null
          criado_em?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          config?: Json | null
          criado_em?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      equipes: {
        Row: {
          created_at: string | null
          empresa_id: string | null
          id: string
          nome: string
          setor_id: string | null
          treinamento: boolean | null
          treinamento_inicio: string | null
        }
        Insert: {
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          setor_id?: string | null
          treinamento?: boolean | null
          treinamento_inicio?: string | null
        }
        Update: {
          created_at?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          setor_id?: string | null
          treinamento?: boolean | null
          treinamento_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_operadores_clones: {
        Row: {
          conta_recebimento: boolean
          criado_em: string
          criado_por: string | null
          empresa_id: string
          equipe_id: string
          id: string
          operador_id: string
        }
        Insert: {
          conta_recebimento?: boolean
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          equipe_id: string
          id?: string
          operador_id: string
        }
        Update: {
          conta_recebimento?: boolean
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          equipe_id?: string
          id?: string
          operador_id?: string
        }
        Relationships: []
      }
      historico_acordos: {
        Row: {
          acordo_id: string
          campo_alterado: string
          criado_em: string
          empresa_id: string | null
          id: string
          usuario_id: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acordo_id: string
          campo_alterado: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          usuario_id: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acordo_id?: string
          campo_alterado?: string
          criado_em?: string
          empresa_id?: string | null
          id?: string
          usuario_id?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_acordos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_acordos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_deduplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_acordos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      lixeira_acordos: {
        Row: {
          acordo_id: string
          autorizado_por_id: string | null
          autorizado_por_nome: string | null
          dados_completos: Json | null
          empresa_id: string | null
          excluido_em: string | null
          expira_em: string | null
          id: string
          instituicao: string | null
          motivo: string | null
          nome_cliente: string | null
          nr_cliente: string | null
          observacoes: string | null
          operador_id: string | null
          operador_nome: string | null
          status: string | null
          tipo: string | null
          transferido_para_id: string | null
          transferido_para_nome: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          acordo_id: string
          autorizado_por_id?: string | null
          autorizado_por_nome?: string | null
          dados_completos?: Json | null
          empresa_id?: string | null
          excluido_em?: string | null
          expira_em?: string | null
          id?: string
          instituicao?: string | null
          motivo?: string | null
          nome_cliente?: string | null
          nr_cliente?: string | null
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          status?: string | null
          tipo?: string | null
          transferido_para_id?: string | null
          transferido_para_nome?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          acordo_id?: string
          autorizado_por_id?: string | null
          autorizado_por_nome?: string | null
          dados_completos?: Json | null
          empresa_id?: string | null
          excluido_em?: string | null
          expira_em?: string | null
          id?: string
          instituicao?: string | null
          motivo?: string | null
          nome_cliente?: string | null
          nr_cliente?: string | null
          observacoes?: string | null
          operador_id?: string | null
          operador_nome?: string | null
          status?: string | null
          tipo?: string | null
          transferido_para_id?: string | null
          transferido_para_nome?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: []
      }
      logs_sistema: {
        Row: {
          acao: string
          criado_em: string
          detalhes: Json | null
          empresa_id: string
          id: string
          registro_id: string | null
          tabela: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          detalhes?: Json | null
          empresa_id: string
          id?: string
          registro_id?: string | null
          tabela?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          detalhes?: Json | null
          empresa_id?: string
          id?: string
          registro_id?: string | null
          tabela?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_sistema_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_sistema_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_whatsapp: {
        Row: {
          acordo_id: string
          empresa_id: string | null
          enviado_em: string
          id: string
          mensagem: string
          usuario_id: string
        }
        Insert: {
          acordo_id: string
          empresa_id?: string | null
          enviado_em?: string
          id?: string
          mensagem: string
          usuario_id: string
        }
        Update: {
          acordo_id?: string
          empresa_id?: string | null
          enviado_em?: string
          id?: string
          mensagem?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_whatsapp_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_whatsapp_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_deduplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_whatsapp_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          ano: number
          created_at: string | null
          criado_por: string | null
          empresa_id: string
          id: string
          mes: number
          meta_acordos: number
          meta_proporcional: boolean
          meta_valor: number
          referencia_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ano: number
          created_at?: string | null
          criado_por?: string | null
          empresa_id: string
          id?: string
          mes: number
          meta_acordos?: number
          meta_proporcional?: boolean
          meta_valor?: number
          referencia_id: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          criado_por?: string | null
          empresa_id?: string
          id?: string
          mes?: number
          meta_acordos?: number
          meta_proporcional?: boolean
          meta_valor?: number
          referencia_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_config_mes: {
        Row: {
          ano: number
          atualizado_em: string
          atualizado_por: string | null
          contar_dia_atual: boolean
          criado_em: string
          empresa_id: string
          feriados: Json
          id: string
          mes: number
          quartis: Json
        }
        Insert: {
          ano: number
          atualizado_em?: string
          atualizado_por?: string | null
          contar_dia_atual?: boolean
          criado_em?: string
          empresa_id: string
          feriados?: Json
          id?: string
          mes: number
          quartis?: Json
        }
        Update: {
          ano?: number
          atualizado_em?: string
          atualizado_por?: string | null
          contar_dia_atual?: boolean
          criado_em?: string
          empresa_id?: string
          feriados?: Json
          id?: string
          mes?: number
          quartis?: Json
        }
        Relationships: []
      }
      metas_validacoes: {
        Row: {
          ano: number
          empresa_id: string
          id: string
          mes: number
          motivo_reabertura: string | null
          reaberto_em: string | null
          reaberto_por: string | null
          setor_id: string
          status: string
          validado_em: string | null
          validado_por: string | null
        }
        Insert: {
          ano: number
          empresa_id: string
          id?: string
          mes: number
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          setor_id: string
          status?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Update: {
          ano?: number
          empresa_id?: string
          id?: string
          mes?: number
          motivo_reabertura?: string | null
          reaberto_em?: string | null
          reaberto_por?: string | null
          setor_id?: string
          status?: string
          validado_em?: string | null
          validado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_validacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_validacoes_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_mensagem: {
        Row: {
          ativo: boolean
          conteudo: string
          criado_em: string
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          criado_em?: string
          empresa_id: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_mensagem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          criado_em: string
          empresa_id: string | null
          id: string
          lida: boolean
          mensagem: string
          titulo: string
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          empresa_id?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          titulo: string
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          empresa_id?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          titulo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      nr_registros: {
        Row: {
          acordo_id: string
          atualizado_em: string
          campo: string
          criado_em: string
          empresa_id: string
          id: string
          nr_value: string
          operador_id: string
          operador_nome: string | null
        }
        Insert: {
          acordo_id: string
          atualizado_em?: string
          campo?: string
          criado_em?: string
          empresa_id: string
          id?: string
          nr_value: string
          operador_id: string
          operador_nome?: string | null
        }
        Update: {
          acordo_id?: string
          atualizado_em?: string
          campo?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          nr_value?: string
          operador_id?: string
          operador_nome?: string | null
        }
        Relationships: []
      }
      ouvidoria_acessos: {
        Row: {
          concedido_por: string | null
          concedido_por_nome: string | null
          criado_em: string
          empresa_id: string
          id: string
          nivel: string
          usuario_id: string
        }
        Insert: {
          concedido_por?: string | null
          concedido_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          nivel?: string
          usuario_id: string
        }
        Update: {
          concedido_por?: string | null
          concedido_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          nivel?: string
          usuario_id?: string
        }
        Relationships: []
      }
      ouvidoria_atendimentos: {
        Row: {
          atualizado_em: string
          codigo: string | null
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          descricao: string | null
          email: string | null
          empresa_id: string
          estado_uf: string | null
          id: string
          iniciado_em: string
          link: string | null
          nome_cliente: string
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          resolvido_por_nome: string | null
          status: string
          tipo: string
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string | null
          email?: string | null
          empresa_id: string
          estado_uf?: string | null
          id?: string
          iniciado_em?: string
          link?: string | null
          nome_cliente: string
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resolvido_por_nome?: string | null
          status?: string
          tipo?: string
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string | null
          email?: string | null
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          iniciado_em?: string
          link?: string | null
          nome_cliente?: string
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          resolvido_por_nome?: string | null
          status?: string
          tipo?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      perfis: {
        Row: {
          arquivado: boolean
          ativo: boolean
          atualizado_em: string
          criado_em: string
          desligado_em: string | null
          email: string
          empresa_id: string
          equipe_id: string | null
          foto_url: string | null
          id: string
          lider_id: string | null
          nome: string
          perfil: string
          senha_alterada: boolean | null
          setor_id: string | null
          situacao: string
          tampermonkey_configured: boolean | null
          usuario: string | null
          viu_notificacao_chatplay: boolean | null
        }
        Insert: {
          arquivado?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          desligado_em?: string | null
          email: string
          empresa_id: string
          equipe_id?: string | null
          foto_url?: string | null
          id: string
          lider_id?: string | null
          nome: string
          perfil: string
          senha_alterada?: boolean | null
          setor_id?: string | null
          situacao?: string
          tampermonkey_configured?: boolean | null
          usuario?: string | null
          viu_notificacao_chatplay?: boolean | null
        }
        Update: {
          arquivado?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          desligado_em?: string | null
          email?: string
          empresa_id?: string
          equipe_id?: string | null
          foto_url?: string | null
          id?: string
          lider_id?: string | null
          nome?: string
          perfil?: string
          senha_alterada?: boolean | null
          setor_id?: string | null
          situacao?: string
          tampermonkey_configured?: boolean | null
          usuario?: string | null
          viu_notificacao_chatplay?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_itens: {
        Row: {
          ativo: boolean
          criado_em: string
          descricao: string | null
          disponivel_ate: string | null
          disponivel_de: string | null
          emoji: string | null
          exclusivo: boolean
          id: string
          nome: string
          ordem: number
          preco_moedas: number | null
          raridade: 'comum' | 'raro' | 'epico' | 'lendario' | 'exclusivo'
          tenant: string | null
          tipo: 'roupa' | 'comida' | 'movel' | 'trofeu' | 'colecionavel'
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          disponivel_ate?: string | null
          disponivel_de?: string | null
          emoji?: string | null
          exclusivo?: boolean
          id: string
          nome: string
          ordem?: number
          preco_moedas?: number | null
          raridade?: 'comum' | 'raro' | 'epico' | 'lendario' | 'exclusivo'
          tenant?: string | null
          tipo: 'roupa' | 'comida' | 'movel' | 'trofeu' | 'colecionavel'
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          descricao?: string | null
          disponivel_ate?: string | null
          disponivel_de?: string | null
          emoji?: string | null
          exclusivo?: boolean
          id?: string
          nome?: string
          ordem?: number
          preco_moedas?: number | null
          raridade?: 'comum' | 'raro' | 'epico' | 'lendario' | 'exclusivo'
          tenant?: string | null
          tipo?: 'roupa' | 'comida' | 'movel' | 'trofeu' | 'colecionavel'
        }
        Relationships: []
      }
      pet_nome_votos: {
        Row: {
          empresa_id: string | null
          nome_escolhido: 'Aura' | 'Lupi' | 'Albi'
          usuario_id: string
          votado_em: string
        }
        Insert: {
          empresa_id?: string | null
          nome_escolhido: 'Aura' | 'Lupi' | 'Albi'
          usuario_id: string
          votado_em?: string
        }
        Update: {
          empresa_id?: string | null
          nome_escolhido?: 'Aura' | 'Lupi' | 'Albi'
          usuario_id?: string
          votado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_nome_votos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_nome_votos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_automatico_acordos: {
        Row: {
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          avaliado_por_nome: string | null
          criado_em: string
          empresa_id: string
          id: string
          nr_cliente: string
          operador_id: string
          operador_nome: string | null
          pct_comissao: number | null
          setor_id: string | null
          status: string
          valor: number
        }
        Insert: {
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          nr_cliente: string
          operador_id: string
          operador_nome?: string | null
          pct_comissao?: number | null
          setor_id?: string | null
          status?: string
          valor: number
        }
        Update: {
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          nr_cliente?: string
          operador_id?: string
          operador_nome?: string | null
          pct_comissao?: number | null
          setor_id?: string | null
          status?: string
          valor?: number
        }
        Relationships: []
      }
      pix_automatico_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          atualizado_por_nome: string | null
          empresa_id: string
          id: string
          pct: number
          permite_registro_operador: boolean
          setor_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          empresa_id: string
          id?: string
          pct?: number
          permite_registro_operador?: boolean
          setor_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          atualizado_por_nome?: string | null
          empresa_id?: string
          id?: string
          pct?: number
          permite_registro_operador?: boolean
          setor_id?: string
        }
        Relationships: []
      }
      pix_automatico_nr_registro: {
        Row: {
          acordo_id: string | null
          atualizado_em: string
          avaliado_em: string | null
          avaliado_por: string | null
          avaliado_por_nome: string | null
          criado_em: string
          empresa_id: string
          id: string
          nr_cliente: string
          nr_normalizado: string
          operador_id: string | null
          operador_nome: string | null
          status: string
        }
        Insert: {
          acordo_id?: string | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          nr_cliente: string
          nr_normalizado: string
          operador_id?: string | null
          operador_nome?: string | null
          status?: string
        }
        Update: {
          acordo_id?: string | null
          atualizado_em?: string
          avaliado_em?: string | null
          avaliado_por?: string | null
          avaliado_por_nome?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          nr_cliente?: string
          nr_normalizado?: string
          operador_id?: string | null
          operador_nome?: string | null
          status?: string
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          atualizado_em: string
          criado_em: string
          codigo: string
          empresa_id: string
          estado_uf: string | null
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          codigo: string
          empresa_id: string
          estado_uf?: string | null
          id?: string
          nome: string
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          codigo?: string
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          nome: string | null
          perfil: string | null
          setor: string | null
          setores_permitidos: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          nome?: string | null
          perfil?: string | null
          setor?: string | null
          setores_permitidos?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string | null
          perfil?: string | null
          setor?: string | null
          setores_permitidos?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      relatorio_validacoes_dia: {
        Row: {
          dia_referencia: string
          empresa_id: string
          id: string
          origem: string
          qtd_registros_validados: number
          setor_id: string
          validado_em: string
          validado_por: string | null
          valor_validado: number
        }
        Insert: {
          dia_referencia: string
          empresa_id: string
          id?: string
          origem: string
          qtd_registros_validados?: number
          setor_id: string
          validado_em?: string
          validado_por?: string | null
          valor_validado?: number
        }
        Update: {
          dia_referencia?: string
          empresa_id?: string
          id?: string
          origem?: string
          qtd_registros_validados?: number
          setor_id?: string
          validado_em?: string
          validado_por?: string | null
          valor_validado?: number
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_validacoes_dia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relatorio_validacoes_dia_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          descricao: string | null
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "setores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          cor: string
          criado_em: string
          empresa_id: string
          id: string
          nome: string
        }
        Insert: {
          cor?: string
          criado_em?: string
          empresa_id: string
          id?: string
          nome: string
        }
        Update: {
          cor?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_uso: {
        Row: {
          ativo: boolean
          conteudo: string
          criado_em: string
          empresa_id: string
          id: string
          titulo: string
          versao: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          criado_em?: string
          empresa_id: string
          id?: string
          titulo: string
          versao: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          criado_em?: string
          empresa_id?: string
          id?: string
          titulo?: string
          versao?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_uso_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      acordos_deduplicados: {
        Row: {
          acordo_grupo_id: string | null
          atualizado_em: string | null
          criado_em: string | null
          data_cadastro: string | null
          data_pagamento: string | null
          empresa_id: string | null
          estado_uf: string | null
          id: string | null
          instituicao: string | null
          nome_cliente: string | null
          nr_cliente: string | null
          numero_parcela: number | null
          observacoes: string | null
          operador_id: string | null
          pago_em: string | null
          parcelas: number | null
          setor_id: string | null
          status: 'verificar_pendente' | 'pago' | 'nao_pago' | null
          tag_ids: string[] | null
          tipo: 'boleto' | 'pix' | 'cartao' | 'cartao_recorrente' | 'pix_automatico' | null
          tipo_vinculo: 'direto' | 'extra' | null
          usou_quarenta_pct: boolean | null
          valor: number | null
          valor_total: number | null
          vencimento: string | null
          vinculo_operador_id: string | null
          vinculo_operador_nome: string | null
          whatsapp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acordos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acordos_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_change_user_password: {
        Args: { p_new_password: string; p_user_id: string }
        Returns: undefined
      }
      buscar_email_por_usuario:
        | { Args: { p_usuario: string }; Returns: string }
        | {
            Args: { p_empresa_slug?: string; p_usuario: string }
            Returns: string
          }
      buscar_email_por_usuario_empresa: {
        Args: { p_empresa_slug?: string; p_usuario: string }
        Returns: string
      }
      fn_admin_delete_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      fn_analitico_atualizar_resumo: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: undefined
      }
      fn_analitico_dashboard_mes: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          dia: string
          operador_id: string
          forma_pagamento: string
          forma_detalhe: string
          status_tabulacao: string
          total: number
          total_ho: number
          qtd: number
        }[]
      }
      fn_analitico_destaques_dia: {
        Args: {
          p_empresa_id: string
          p_mes: string
          p_equipe_id?: string
          p_setor_id?: string
        }
        Returns: {
          dia: string
          operador_id: string
          operador_usuario: string
          operador_nome: string
          total_recebido: number
          total_pagamentos: number
        }[]
      }
      fn_analitico_resumo_por_operador: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          operador_id: string
          operador_usuario: string
          operador_nome: string
          total_recebido: number
          total_ho: number
          total_pagamentos: number
        }[]
      }
      fn_arquivar_desligados_anteriores: {
        Args: { p_empresa_id: string }
        Returns: number
      }
      fn_can_access_empresa: {
        Args: { target_empresa_id: string }
        Returns: boolean
      }
      fn_converter_para_extra: {
        Args: {
          p_acordo_id: string
          p_nome_cliente: string
          p_novo_direto_op_id: string
          p_novo_direto_op_nome: string
          p_parcelas?: number
          p_tipo: string
          p_valor: number
          p_vencimento: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      fn_diario_resumo_mensal: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: {
          operador_id: string | null
          operador_usuario: string
          operador_nome: string | null
          setor_geral: string | null
          dia_referencia: string
          fora_vinculo: boolean
          total_recebido: number
          total_pagamentos: number
        }[]
      }
      fn_direto_extra_ativo: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_get_perfil_usuario: { Args: { uid: string }; Returns: string }
      fn_get_setor_usuario: { Args: { uid: string }; Returns: string }
      fn_meta_esta_bloqueada: {
        Args: {
          p_tipo: string
          p_referencia_id: string
          p_empresa_id: string
          p_mes: number
          p_ano: number
        }
        Returns: boolean
      }
      fn_metas_esta_validada: {
        Args: { p_empresa_id: string; p_setor_id: string; p_mes: number; p_ano: number }
        Returns: boolean
      }
      fn_metas_reabrir_setor: {
        Args: {
          p_empresa_id: string
          p_setor_id: string
          p_mes: number
          p_ano: number
          p_motivo: string
        }
        Returns: { ok: boolean; erro: string | null }[]
      }
      fn_metas_upsert: {
        Args: { p_payloads: Json }
        Returns: { salvos: number; bloqueados: Json }[]
      }
      fn_metas_validar_setor: {
        Args: { p_empresa_id: string; p_setor_id: string; p_mes: number; p_ano: number }
        Returns: { ok: boolean; erro: string | null }[]
      }
      fn_pet_admin_ajustar_moedas: {
        Args: { p_usuario: string; p_delta: number; p_motivo: string }
        Returns: { ok: boolean; moedas_total: number }[]
      }
      fn_pet_discrepancias_validacao: {
        Args: { p_empresa_id: string; p_mes: number; p_ano: number }
        Returns: {
          setor_id: string
          setor_nome: string
          dia_referencia: string
          valor_validado: number
          valor_atual: number
          diferenca: number
          usuario_id: string | null
          usuario_nome: string | null
          moedas_creditadas: number | null
        }[]
      }
      fn_pet_admin_listar: {
        Args: Record<PropertyKey, never>
        Returns: {
          usuario_id: string
          nome: string
          cargo: string
          moedas: number
          moedas_ganhas_total: number
          moedas_gastas_total: number
          xp: number
          nivel: number
          streak: number
          qtd_itens: number
          roupa_equipada: string
          ultimo_dia_ativo: string | null
        }[]
      }
      fn_pet_comprar_item: {
        Args: { p_item_id: string }
        Returns: { ok: boolean; erro: string | null; moedas_total: number }[]
      }
      fn_pet_estado_get: {
        Args: Record<PropertyKey, never>
        Returns: {
          usuario_id: string
          moedas: number
          moedas_ganhas_total: number
          moedas_gastas_total: number
          xp: number
          nivel: number
          streak: number
          ultimo_dia_ativo: string | null
          roupa_equipada: string
          itens_desbloqueados: Json
          dormindo: boolean
          criado_em: string
          atualizado_em: string
        }
      }
      fn_pet_gastar_moedas: {
        Args: { p_valor: number; p_item?: string }
        Returns: { ok: boolean; moedas_total: number }[]
      }
      fn_pet_nome_resultado: {
        Args: Record<PropertyKey, never>
        Returns: {
          empresa_id: string
          empresa_slug: string
          nome_escolhido: string
          votos: number
        }[]
      }
      fn_pet_recompensa_disponivel: {
        Args: Record<PropertyKey, never>
        Returns: { valor_disponivel: number; moedas_disponivel: number }[]
      }
      fn_pet_resgatar_recompensa: {
        Args: Record<PropertyKey, never>
        Returns: { moedas_creditadas: number; valor_base: number; moedas_total: number }[]
      }
      fn_pet_salvar_visual: {
        Args: { p_roupa: string; p_dormindo: boolean }
        Returns: undefined
      }
      fn_relatorio_reabrir_setor: {
        Args: {
          p_empresa_id: string
          p_setor_id: string
          p_mes: number
          p_ano: number
          p_motivo: string
          p_origem?: string
        }
        Returns: { ok: boolean; erro: string | null; dias_removidos: number }[]
      }
      fn_relatorio_status_validacao: {
        Args: { p_empresa_id: string; p_setor_id: string; p_mes: number; p_ano: number }
        Returns: {
          origem: string
          dias_com_dado: number
          dias_validados: number
          valor_atual: number
          valor_validado: number
        }[]
      }
      fn_relatorio_validar_setor: {
        Args: {
          p_empresa_id: string
          p_setor_id: string
          p_mes: number
          p_ano: number
          p_origem?: string
        }
        Returns: { ok: boolean; erro: string | null; dias_validados: number }[]
      }
      fn_sincronizar_cartoes_pagos: {
        Args: { p_empresa_id: string; p_mes: string }
        Returns: number
      }
      fn_sync_par_vinculo: {
        Args: {
          p_acordo_id: string
          p_nome_cliente: string
          p_parcelas?: number
          p_status?: string
          p_tipo: string
          p_valor: number
          p_vencimento: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      fn_user_empresa_id: { Args: never; Returns: string }
      fn_user_has_any_role: { Args: { roles: string[] }; Returns: boolean }
      fn_user_is_super_admin: { Args: never; Returns: boolean }
      fn_user_perfil: { Args: never; Returns: string }
      fn_user_setor_id: { Args: never; Returns: string }
      fn_vincular_extra_ao_direto: {
        Args: {
          p_direto_id: string
          p_extra_op_id: string
          p_extra_op_nome: string
          p_nome_cliente: string
          p_parcelas?: number
          p_tipo: string
          p_valor: number
          p_vencimento: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      perfil_usuario:
        | "operador"
        | "lider"
        | "administrador"
        | "super_admin"
        | "elite"
        | "gerencia"
        | "diretoria"
      status_acordo:
        | "pendente"
        | "pago"
        | "verificar"
        | "vencido"
        | "cancelado"
        | "em_acompanhamento"
      tipo_acordo: "boleto" | "pix" | "cartao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      perfil_usuario: [
        "operador",
        "lider",
        "administrador",
        "super_admin",
        "elite",
        "gerencia",
        "diretoria",
      ],
      status_acordo: [
        "pendente",
        "pago",
        "verificar",
        "vencido",
        "cancelado",
        "em_acompanhamento",
      ],
      tipo_acordo: ["boleto", "pix", "cartao"],
    },
  },
} as const
