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
      acordos: {
        Row: {
          acordo_grupo_id: string | null
          atualizado_em: string
          criado_em: string
          data_cadastro: string
          empresa_id: string
          estado_uf: string | null
          id: string
          instituicao: string | null
          nome_cliente: string
          nr_cliente: string
          numero_parcela: number | null
          observacoes: string | null
          operador_id: string
          operador_vinculado_id: string | null
          pago_em: string | null
          parcelas: number | null
          setor_id: string | null
          status: string
          tag_ids: string[] | null
          tipo: string
          tipo_receptivo: string | null
          tipo_vinculo: string
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
          empresa_id: string
          estado_uf?: string | null
          id?: string
          instituicao?: string | null
          nome_cliente: string
          nr_cliente: string
          numero_parcela?: number | null
          observacoes?: string | null
          operador_id: string
          operador_vinculado_id?: string | null
          pago_em?: string | null
          parcelas?: number | null
          setor_id?: string | null
          status: string
          tag_ids?: string[] | null
          tipo: string
          tipo_receptivo?: string | null
          tipo_vinculo?: string
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
          empresa_id?: string
          estado_uf?: string | null
          id?: string
          instituicao?: string | null
          nome_cliente?: string
          nr_cliente?: string
          numero_parcela?: number | null
          observacoes?: string | null
          operador_id?: string
          operador_vinculado_id?: string | null
          pago_em?: string | null
          parcelas?: number | null
          setor_id?: string | null
          status?: string
          tag_ids?: string[] | null
          tipo?: string
          tipo_receptivo?: string | null
          tipo_vinculo?: string
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
          empresa_id: string | null
          id: string
          registro_id: string | null
          tabela: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          detalhes?: Json | null
          empresa_id?: string | null
          id?: string
          registro_id?: string | null
          tabela?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          detalhes?: Json | null
          empresa_id?: string | null
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
          ativo: boolean
          atualizado_em: string
          criado_em: string
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
          usuario: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
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
          usuario?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
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
          usuario?: string | null
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
    }
    Views: {
      acordos_deduplicados: {
        Row: {
          acordo_grupo_id: string | null
          atualizado_em: string | null
          criado_em: string | null
          data_cadastro: string | null
          empresa_id: string | null
          estado_uf: string | null
          id: string | null
          instituicao: string | null
          nome_cliente: string | null
          nr_cliente: string | null
          numero_parcela: number | null
          observacoes: string | null
          operador_id: string | null
          operador_vinculado_id: string | null
          parcelas: number | null
          setor_id: string | null
          status: string | null
          tag_ids: string[] | null
          tipo: string | null
          tipo_receptivo: string | null
          tipo_vinculo: string | null
          valor: number | null
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
      fn_direto_extra_ativo: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: boolean
      }
      fn_get_perfil_usuario: { Args: { uid: string }; Returns: string }
      fn_get_setor_usuario: { Args: { uid: string }; Returns: string }
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
