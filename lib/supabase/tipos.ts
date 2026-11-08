// GENERADO por tools/tipos/generar.py desde las migraciones — NO EDITAR A MANO.
// Mismo formato que «supabase gen types typescript». Se regenera con las pruebas de la
// base de datos (tools/probar-migraciones/probar.sh) y el CI avisa si no está al día.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      almacenamientos: {
        Row: {
          id: string
          codigo: string
          cliente_id: string
          almacen_id: string
          fecha_entrada: string
          fecha_salida: string
          num_trailers: number
          descripcion: string | null
          referencia_cliente: string | null
          num_repartos: number
          sitio_entrega_id: string | null
          distancia_entrega_km: number | null
          importe_almacenaje: number | null
          importe_reparto: number | null
          importe_total: number | null
          iva_pct: number | null
          requiere_pago_previo: boolean
          estado: Database["public"]["Enums"]["estado_almacenamiento"]
          anotaciones: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          pagado_en: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          cliente_id: string
          almacen_id: string
          fecha_entrada: string
          fecha_salida: string
          num_trailers?: number
          descripcion?: string | null
          referencia_cliente?: string | null
          num_repartos?: number
          sitio_entrega_id?: string | null
          distancia_entrega_km?: number | null
          importe_almacenaje?: number | null
          importe_reparto?: number | null
          importe_total?: never
          iva_pct?: number | null
          requiere_pago_previo?: boolean
          estado?: Database["public"]["Enums"]["estado_almacenamiento"]
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          pagado_en?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          cliente_id?: string
          almacen_id?: string
          fecha_entrada?: string
          fecha_salida?: string
          num_trailers?: number
          descripcion?: string | null
          referencia_cliente?: string | null
          num_repartos?: number
          sitio_entrega_id?: string | null
          distancia_entrega_km?: number | null
          importe_almacenaje?: number | null
          importe_reparto?: number | null
          importe_total?: never
          iva_pct?: number | null
          requiere_pago_previo?: boolean
          estado?: Database["public"]["Enums"]["estado_almacenamiento"]
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          pagado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "almacenamientos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almacenamientos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almacenamientos_sitio_entrega_id_fkey"
            columns: ["sitio_entrega_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          id: number
          tabla: string
          registro_id: string
          accion: string
          quien: string | null
          quien_email: string | null
          quien_origen: string
          cuando: string
          cambios: Json
        }
        Insert: {
          id?: number
          tabla: string
          registro_id: string
          accion: string
          quien?: string | null
          quien_email?: string | null
          quien_origen?: string
          cuando?: string
          cambios?: Json
        }
        Update: {
          id?: number
          tabla?: string
          registro_id?: string
          accion?: string
          quien?: string | null
          quien_email?: string | null
          quien_origen?: string
          cuando?: string
          cambios?: Json
        }
        Relationships: [
        ]
      }
      avisos: {
        Row: {
          id: string
          para: string
          cliente_id: string | null
          transportista_id: string | null
          tipo: string
          nivel: string
          titulo: string
          texto: string | null
          enlace: string | null
          envio_id: string | null
          creado_en: string
        }
        Insert: {
          id?: string
          para: string
          cliente_id?: string | null
          transportista_id?: string | null
          tipo: string
          nivel?: string
          titulo: string
          texto?: string | null
          enlace?: string | null
          envio_id?: string | null
          creado_en?: string
        }
        Update: {
          id?: string
          para?: string
          cliente_id?: string | null
          transportista_id?: string | null
          tipo?: string
          nivel?: string
          titulo?: string
          texto?: string | null
          enlace?: string | null
          envio_id?: string | null
          creado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_vistos: {
        Row: {
          usuario_id: string
          visto_en: string
        }
        Insert: {
          usuario_id: string
          visto_en?: string
        }
        Update: {
          usuario_id?: string
          visto_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_vistos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          id: string
          codigo: string
          razon_social: string
          cif: string
          direccion: string | null
          poblacion: string | null
          codigo_postal: string | null
          provincia: string | null
          pais_codigo_iso: string
          iva_pct: number
          retencion_pct: number
          recargo_equivalencia_pct: number
          holded_forma_pago_ref: string | null
          cuenta_contable: string | null
          moneda: string
          tags: string[]
          plazo_pago_dias: number
          factor_tarifa_pct: number
          recargo_pago_tarde_pct: number
          permite_contraoferta: boolean
          discrecion_comercial: boolean
          riesgo_cesce_euros: number | null
          riesgo_cesce_plazo_dias: number | null
          riesgo_manual_euros: number | null
          tipo_camion_defecto: Database["public"]["Enums"]["tipo_camion"] | null
          forma_carga_defecto: Database["public"]["Enums"]["forma_carga"] | null
          requiere_plataforma_elevadora_defecto: boolean
          tipo_mercancia_defecto: string | null
          descripcion_mercancia_defecto: string | null
          urgencia_defecto_dias: number | null
          estado: Database["public"]["Enums"]["estado_cuenta"]
          verificado: boolean
          verificado_en: string | null
          verificado_nota: string | null
          anotaciones: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          sitio_principal_id: string | null
          requiere_pin: boolean
          nombre_comercial: string | null
          nombre_visible: string | null
          factor_fijado_a_mano: boolean
          alta_por: string | null
          exento_pago_previo_primer_envio: boolean
          riesgo_efectivo_euros: number | null
          sector: string | null
          texto_busqueda: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          razon_social: string
          cif: string
          direccion?: string | null
          poblacion?: string | null
          codigo_postal?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          iva_pct?: number
          retencion_pct?: number
          recargo_equivalencia_pct?: number
          holded_forma_pago_ref?: string | null
          cuenta_contable?: string | null
          moneda?: string
          tags?: string[]
          plazo_pago_dias?: number
          factor_tarifa_pct?: number
          recargo_pago_tarde_pct?: number
          permite_contraoferta?: boolean
          discrecion_comercial?: boolean
          riesgo_cesce_euros?: number | null
          riesgo_cesce_plazo_dias?: number | null
          riesgo_manual_euros?: number | null
          tipo_camion_defecto?: Database["public"]["Enums"]["tipo_camion"] | null
          forma_carga_defecto?: Database["public"]["Enums"]["forma_carga"] | null
          requiere_plataforma_elevadora_defecto?: boolean
          tipo_mercancia_defecto?: string | null
          descripcion_mercancia_defecto?: string | null
          urgencia_defecto_dias?: number | null
          estado?: Database["public"]["Enums"]["estado_cuenta"]
          verificado?: boolean
          verificado_en?: string | null
          verificado_nota?: string | null
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          sitio_principal_id?: string | null
          requiere_pin?: boolean
          nombre_comercial?: string | null
          nombre_visible?: never
          factor_fijado_a_mano?: boolean
          alta_por?: string | null
          exento_pago_previo_primer_envio?: boolean
          riesgo_efectivo_euros?: never
          sector?: string | null
          texto_busqueda?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          razon_social?: string
          cif?: string
          direccion?: string | null
          poblacion?: string | null
          codigo_postal?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          iva_pct?: number
          retencion_pct?: number
          recargo_equivalencia_pct?: number
          holded_forma_pago_ref?: string | null
          cuenta_contable?: string | null
          moneda?: string
          tags?: string[]
          plazo_pago_dias?: number
          factor_tarifa_pct?: number
          recargo_pago_tarde_pct?: number
          permite_contraoferta?: boolean
          discrecion_comercial?: boolean
          riesgo_cesce_euros?: number | null
          riesgo_cesce_plazo_dias?: number | null
          riesgo_manual_euros?: number | null
          tipo_camion_defecto?: Database["public"]["Enums"]["tipo_camion"] | null
          forma_carga_defecto?: Database["public"]["Enums"]["forma_carga"] | null
          requiere_plataforma_elevadora_defecto?: boolean
          tipo_mercancia_defecto?: string | null
          descripcion_mercancia_defecto?: string | null
          urgencia_defecto_dias?: number | null
          estado?: Database["public"]["Enums"]["estado_cuenta"]
          verificado?: boolean
          verificado_en?: string | null
          verificado_nota?: string | null
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          sitio_principal_id?: string | null
          requiere_pin?: boolean
          nombre_comercial?: string | null
          nombre_visible?: never
          factor_fijado_a_mano?: boolean
          alta_por?: string | null
          exento_pago_previo_primer_envio?: boolean
          riesgo_efectivo_euros?: never
          sector?: string | null
          texto_busqueda?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_alta_por_fkey"
            columns: ["alta_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_sitio_defecto_id_fkey"
            columns: ["sitio_principal_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
        ]
      }
      cmr_enlaces: {
        Row: {
          id: string
          envio_id: string
          token: string
          caduca_en: string
          revocado: boolean
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          envio_id: string
          token?: string
          caduca_en?: string
          revocado?: boolean
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          envio_id?: string
          token?: string
          caduca_en?: string
          revocado?: boolean
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cmr_enlaces_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: true
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
        ]
      }
      cmr_reservas: {
        Row: {
          id: string
          envio_id: string
          parada_id: string | null
          rol: string
          texto: string
          incidencia_id: string | null
          creado_en: string
        }
        Insert: {
          id?: string
          envio_id: string
          parada_id?: string | null
          rol: string
          texto: string
          incidencia_id?: string | null
          creado_en?: string
        }
        Update: {
          id?: string
          envio_id?: string
          parada_id?: string | null
          rol?: string
          texto?: string
          incidencia_id?: string | null
          creado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "cmr_reservas_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cmr_reservas_incidencia_id_fkey"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
        ]
      }
      conductores: {
        Row: {
          id: string
          codigo: string
          transportista_id: string | null
          nombre: string
          documento: string | null
          documento_pais: string | null
          telefono: string | null
          activo: boolean
          anotaciones: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          idioma: string
        }
        Insert: {
          id?: string
          codigo?: string
          transportista_id?: string | null
          nombre: string
          documento?: string | null
          documento_pais?: string | null
          telefono?: string | null
          activo?: boolean
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          idioma?: string
        }
        Update: {
          id?: string
          codigo?: string
          transportista_id?: string | null
          nombre?: string
          documento?: string | null
          documento_pais?: string | null
          telefono?: string | null
          activo?: boolean
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          idioma?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_conductores_transportista"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      conexion_minutos: {
        Row: {
          usuario_id: string
          dia: string
          minutos: number
          ultimo: string
        }
        Insert: {
          usuario_id: string
          dia: string
          minutos?: number
          ultimo?: string
        }
        Update: {
          usuario_id?: string
          dia?: string
          minutos?: number
          ultimo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conexion_minutos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_precio: {
        Row: {
          id: number
          usuario_id: string | null
          cliente_id: string | null
          envio_id: string | null
          origen: string
          cuando: string
        }
        Insert: {
          id?: number
          usuario_id?: string | null
          cliente_id?: string | null
          envio_id?: string | null
          origen?: string
          cuando?: string
        }
        Update: {
          id?: number
          usuario_id?: string | null
          cliente_id?: string | null
          envio_id?: string | null
          origen?: string
          cuando?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_precio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_precio_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_precio_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contactos: {
        Row: {
          id: string
          codigo: string
          cliente_id: string | null
          transportista_id: string | null
          nombre: string | null
          funcion: Database["public"]["Enums"]["funcion_contacto"]
          telefono: string | null
          email: string | null
          es_principal: boolean
          anotaciones: string | null
          usuario_id: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          sitio_id: string | null
          idioma: string
          recibe_avisos: boolean
          cargo: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          cliente_id?: string | null
          transportista_id?: string | null
          nombre?: string | null
          funcion?: Database["public"]["Enums"]["funcion_contacto"]
          telefono?: string | null
          email?: string | null
          es_principal?: boolean
          anotaciones?: string | null
          usuario_id?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          sitio_id?: string | null
          idioma?: string
          recibe_avisos?: boolean
          cargo?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          cliente_id?: string | null
          transportista_id?: string | null
          nombre?: string | null
          funcion?: Database["public"]["Enums"]["funcion_contacto"]
          telefono?: string | null
          email?: string | null
          es_principal?: boolean
          anotaciones?: string | null
          usuario_id?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          sitio_id?: string | null
          idioma?: string
          recibe_avisos?: boolean
          cargo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_sitio_id_fkey"
            columns: ["sitio_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contactos_usuario"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      contraoferta_intentos: {
        Row: {
          id: number
          envio_id: string
          usuario_id: string | null
          importe: number | null
          cuando: string
        }
        Insert: {
          id?: number
          envio_id: string
          usuario_id?: string | null
          importe?: number | null
          cuando?: string
        }
        Update: {
          id?: number
          envio_id?: string
          usuario_id?: string | null
          importe?: number | null
          cuando?: string
        }
        Relationships: [
          {
            foreignKeyName: "contraoferta_intentos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contraoferta_intentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      datos_de_prueba_peticiones: {
        Row: {
          id: number
          estado: string
          escala: number
          clave_cuentas: string | null
          cuentas_reales: Json | null
          jobid: number | null
          resultado: Json | null
          error: string | null
          creada_en: string
          empezada_en: string | null
          terminada_en: string | null
        }
        Insert: {
          id?: number
          estado?: string
          escala?: number
          clave_cuentas?: string | null
          cuentas_reales?: Json | null
          jobid?: number | null
          resultado?: Json | null
          error?: string | null
          creada_en?: string
          empezada_en?: string | null
          terminada_en?: string | null
        }
        Update: {
          id?: number
          estado?: string
          escala?: number
          clave_cuentas?: string | null
          cuentas_reales?: Json | null
          jobid?: number | null
          resultado?: Json | null
          error?: string | null
          creada_en?: string
          empezada_en?: string | null
          terminada_en?: string | null
        }
        Relationships: [
        ]
      }
      distancias_cp: {
        Row: {
          id: string
          pais_codigo_iso_origen: string
          codigo_postal_origen: string
          pais_codigo_iso_destino: string
          codigo_postal_destino: string
          km: number
          minutos: number | null
          proveedor: string
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          pais_codigo_iso_origen: string
          codigo_postal_origen: string
          pais_codigo_iso_destino: string
          codigo_postal_destino: string
          km: number
          minutos?: number | null
          proveedor?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          pais_codigo_iso_origen?: string
          codigo_postal_origen?: string
          pais_codigo_iso_destino?: string
          codigo_postal_destino?: string
          km?: number
          minutos?: number | null
          proveedor?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
        ]
      }
      distancias_sitios: {
        Row: {
          id: string
          sitio_origen_id: string
          version_origen: number
          sitio_destino_id: string
          version_destino: number
          km: number
          minutos: number | null
          proveedor: string
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          sitio_origen_id: string
          version_origen: number
          sitio_destino_id: string
          version_destino: number
          km: number
          minutos?: number | null
          proveedor?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          sitio_origen_id?: string
          version_origen?: number
          sitio_destino_id?: string
          version_destino?: number
          km?: number
          minutos?: number | null
          proveedor?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distancias_sitios_sitio_destino_id_fkey"
            columns: ["sitio_destino_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distancias_sitios_sitio_origen_id_fkey"
            columns: ["sitio_origen_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          id: string
          tipo: string
          envio_id: string | null
          incidencia_id: string | null
          almacenamiento_id: string | null
          transportista_id: string | null
          storage_bucket: string
          storage_ruta: string
          nombre_archivo: string
          tipo_mime: string | null
          tamano_bytes: number | null
          sha256: string | null
          visible_cliente: boolean
          borrado: boolean
          borrado_en: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          penalizacion_id: string | null
          operador_id: string | null
          usuario_id: string | null
          es_recurso: boolean
          recurso_titulo: string | null
          recurso_descripcion: string | null
        }
        Insert: {
          id?: string
          tipo: string
          envio_id?: string | null
          incidencia_id?: string | null
          almacenamiento_id?: string | null
          transportista_id?: string | null
          storage_bucket?: string
          storage_ruta: string
          nombre_archivo: string
          tipo_mime?: string | null
          tamano_bytes?: number | null
          sha256?: string | null
          visible_cliente?: boolean
          borrado?: boolean
          borrado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          penalizacion_id?: string | null
          operador_id?: string | null
          usuario_id?: string | null
          es_recurso?: boolean
          recurso_titulo?: string | null
          recurso_descripcion?: string | null
        }
        Update: {
          id?: string
          tipo?: string
          envio_id?: string | null
          incidencia_id?: string | null
          almacenamiento_id?: string | null
          transportista_id?: string | null
          storage_bucket?: string
          storage_ruta?: string
          nombre_archivo?: string
          tipo_mime?: string | null
          tamano_bytes?: number | null
          sha256?: string | null
          visible_cliente?: boolean
          borrado?: boolean
          borrado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          penalizacion_id?: string | null
          operador_id?: string | null
          usuario_id?: string | null
          es_recurso?: boolean
          recurso_titulo?: string | null
          recurso_descripcion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_almacenamiento_id_fkey"
            columns: ["almacenamiento_id"]
            isOneToOne: false
            referencedRelation: "almacenamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_incidencia_id_fkey"
            columns: ["incidencia_id"]
            isOneToOne: false
            referencedRelation: "incidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_penalizacion_id_fkey"
            columns: ["penalizacion_id"]
            isOneToOne: false
            referencedRelation: "penalizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_hitos: {
        Row: {
          id: number
          envio_id: string
          hito: Database["public"]["Enums"]["tipo_hito"]
          cuando: string
          quien: string | null
          quien_origen: string
          parada_id: string | null
          oferta_id: string | null
          datos: Json
        }
        Insert: {
          id?: number
          envio_id: string
          hito: Database["public"]["Enums"]["tipo_hito"]
          cuando?: string
          quien?: string | null
          quien_origen?: string
          parada_id?: string | null
          oferta_id?: string | null
          datos?: Json
        }
        Update: {
          id?: number
          envio_id?: string
          hito?: Database["public"]["Enums"]["tipo_hito"]
          cuando?: string
          quien?: string | null
          quien_origen?: string
          parada_id?: string | null
          oferta_id?: string | null
          datos?: Json
        }
        Relationships: [
          {
            foreignKeyName: "envio_hitos_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_ofertas: {
        Row: {
          id: string
          envio_id: string
          transportista_id: string | null
          canal: string
          token: string
          precio_ofertado: number
          banda_pct: number
          banda_euros: number | null
          pronto_pago: boolean
          estado: string
          enviada_en: string
          caduca_en: string
          abierta_en: string | null
          aperturas: number
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          envio_id: string
          transportista_id?: string | null
          canal: string
          token?: string
          precio_ofertado: number
          banda_pct?: number
          banda_euros?: never
          pronto_pago?: boolean
          estado?: string
          enviada_en?: string
          caduca_en: string
          abierta_en?: string | null
          aperturas?: number
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          envio_id?: string
          transportista_id?: string | null
          canal?: string
          token?: string
          precio_ofertado?: number
          banda_pct?: number
          banda_euros?: never
          pronto_pago?: boolean
          estado?: string
          enviada_en?: string
          caduca_en?: string
          abierta_en?: string | null
          aperturas?: number
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_ofertas_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_ofertas_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_parada_pines: {
        Row: {
          id: string
          parada_id: string
          envio_id: string
          pin: string
          exigido: boolean
          enviado_en: string | null
          enviado_a: string | null
          intentos_fallidos: number
          bloqueado: boolean
          validado_en: string | null
          validado_por: string | null
          validado_modo: string | null
          validado_nota: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          parada_id: string
          envio_id: string
          pin: string
          exigido?: boolean
          enviado_en?: string | null
          enviado_a?: string | null
          intentos_fallidos?: number
          bloqueado?: boolean
          validado_en?: string | null
          validado_por?: string | null
          validado_modo?: string | null
          validado_nota?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          parada_id?: string
          envio_id?: string
          pin?: string
          exigido?: boolean
          enviado_en?: string | null
          enviado_a?: string | null
          intentos_fallidos?: number
          bloqueado?: boolean
          validado_en?: string | null
          validado_por?: string | null
          validado_modo?: string | null
          validado_nota?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_parada_pines_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_parada_pines_parada_id_fkey"
            columns: ["parada_id"]
            isOneToOne: true
            referencedRelation: "envio_paradas"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_paradas: {
        Row: {
          id: string
          envio_id: string
          orden: number
          tipo: string
          sitio_id: string | null
          nombre_empresa: string | null
          direccion: string | null
          codigo_postal: string | null
          poblacion: string | null
          provincia: string | null
          pais_codigo_iso: string
          lat: number | null
          lon: number | null
          fecha_desde: string | null
          fecha_hasta: string | null
          realizado_en: string | null
          referencia: string | null
          anotaciones: string | null
          distancia_siguiente_km: number | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          envio_id: string
          orden: number
          tipo: string
          sitio_id?: string | null
          nombre_empresa?: string | null
          direccion?: string | null
          codigo_postal?: string | null
          poblacion?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          lat?: number | null
          lon?: number | null
          fecha_desde?: string | null
          fecha_hasta?: string | null
          realizado_en?: string | null
          referencia?: string | null
          anotaciones?: string | null
          distancia_siguiente_km?: number | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          envio_id?: string
          orden?: number
          tipo?: string
          sitio_id?: string | null
          nombre_empresa?: string | null
          direccion?: string | null
          codigo_postal?: string | null
          poblacion?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          lat?: number | null
          lon?: number | null
          fecha_desde?: string | null
          fecha_hasta?: string | null
          realizado_en?: string | null
          referencia?: string | null
          anotaciones?: string | null
          distancia_siguiente_km?: number | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envio_paradas_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_paradas_sitio_id_fkey"
            columns: ["sitio_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
        ]
      }
      envio_reservas: {
        Row: {
          id: string
          envio_id: string
          oferta_id: string | null
          desde: string
          hasta: string
          estado: string
          transportista_id: string | null
          usuario_id: string | null
          precio_aceptado: number | null
          precio_propuesto: number | null
          cerrada_en: string | null
          motivo_cierre: string | null
          ip: string | null
          navegador: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          pronto_pago: boolean
        }
        Insert: {
          id?: string
          envio_id: string
          oferta_id?: string | null
          desde?: string
          hasta: string
          estado?: string
          transportista_id?: string | null
          usuario_id?: string | null
          precio_aceptado?: number | null
          precio_propuesto?: number | null
          cerrada_en?: string | null
          motivo_cierre?: string | null
          ip?: string | null
          navegador?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          pronto_pago?: boolean
        }
        Update: {
          id?: string
          envio_id?: string
          oferta_id?: string | null
          desde?: string
          hasta?: string
          estado?: string
          transportista_id?: string | null
          usuario_id?: string | null
          precio_aceptado?: number | null
          precio_propuesto?: number | null
          cerrada_en?: string | null
          motivo_cierre?: string | null
          ip?: string | null
          navegador?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          pronto_pago?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "envio_reservas_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: true
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_reservas_oferta_id_fkey"
            columns: ["oferta_id"]
            isOneToOne: false
            referencedRelation: "envio_ofertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_reservas_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envio_reservas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      envios: {
        Row: {
          id: string
          referencia_gx: string
          token_publico: string
          referencia_cliente: string | null
          cliente_id: string
          estado: Database["public"]["Enums"]["estado_envio"]
          estado_asignacion: Database["public"]["Enums"]["estado_asignacion"]
          transportista_id: string | null
          vehiculo_camion_id: string | null
          vehiculo_remolque_id: string | null
          conductor_id: string | null
          matricula_camion: string | null
          matricula_remolque: string | null
          conductor_nombre: string | null
          conductor_telefono: string | null
          transportista_nima: string | null
          fecha_carga_desde: string | null
          fecha_carga_hasta: string | null
          fecha_carga_real: string | null
          fecha_entrega_estimada: string | null
          descripcion_mercancia: string | null
          toneladas: number | null
          metros_lineales: number | null
          tipo_carga: Database["public"]["Enums"]["tipo_carga"] | null
          paletizado: boolean
          carga_lateral: boolean
          carga_techo: boolean
          carga_trasera: boolean
          carga_lateral_bajo: boolean
          requiere_plataforma_elevadora: boolean
          requiere_nima: boolean
          adr: boolean
          importe_cliente: number | null
          importe_transportista: number | null
          moneda: string
          margen_euros: number | null
          factor_tarifa_pct: number | null
          iva_pct: number | null
          retencion_pct: number | null
          plazo_pago_dias: number | null
          precio_fijado_a_mano: boolean
          codigo_postal_origen: string | null
          poblacion_origen: string | null
          codigo_postal_destino: string | null
          poblacion_destino: string | null
          num_paradas: number
          distancia_total_km: number | null
          holded_pedido_venta: string | null
          holded_pedido_compra: string | null
          publicado_en_bolsa_en: string | null
          discrecion_comercial: boolean
          anotaciones_cliente: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          confirmado_en: string | null
          primera_oferta_en: string | null
          asignado_en: string | null
          cargado_en: string | null
          entregado_en: string | null
          cancelado_en: string | null
          operador_id: string | null
          precio_acordado_operador: number | null
          es_manual: boolean | null
          facturado_venta: boolean
          facturado_compra: boolean
          valoracion_transportista: number | null
          valoracion_comentario: string | null
          estado_solicitud: string | null
          precio_caduca_en: string | null
          condiciones_aceptadas_en: string | null
          num_bultos: number | null
          embalaje: string | null
          volumen_m3: number | null
          negociacion_pct: number | null
          valoracion_cliente: number | null
          valoracion_cliente_comentario: string | null
          valoracion_cliente_en: string | null
          estado_pago_previo: string
          pago_motivo: string | null
          pago_metodo: string | null
          pagado_en: string | null
          pago_resuelto_por: string | null
          pago_exento_motivo: string | null
          stripe_pago_ref: string | null
          importe_contraoferta_cliente: number | null
          contraoferta_cliente_en: string | null
          importe_cliente_inicial: number | null
          requiere_revision_precio: boolean
          cambio_cliente: Json | null
          cambio_cliente_en: string | null
          estado_cambio_cliente: string | null
          cambio_cliente_nota: string | null
          cancelado_en_nombre_cliente: boolean
          pago_pendiente_en: string | null
          precio_calculado_en: string | null
          estado_revision_precio: string | null
          fecha_revision_precio: string | null
          importe_revision_anterior: number | null
          importe_revision_nuevo: number | null
          revision_precio_en: string | null
          revision_precio_recordada: boolean
          cancelacion_sin_coste: boolean
          texto_busqueda: string | null
          stripe_cobro_sin_aplicar: string | null
          fecha_carga_prevista: string | null
          parada_actual: number | null
          seguimiento_automatico: boolean
          ancla_paso: number | null
          ancla_hora: string | null
          fecha_efectiva: string | null
        }
        Insert: {
          id?: string
          referencia_gx?: string
          token_publico?: string
          referencia_cliente?: string | null
          cliente_id: string
          estado?: Database["public"]["Enums"]["estado_envio"]
          estado_asignacion?: Database["public"]["Enums"]["estado_asignacion"]
          transportista_id?: string | null
          vehiculo_camion_id?: string | null
          vehiculo_remolque_id?: string | null
          conductor_id?: string | null
          matricula_camion?: string | null
          matricula_remolque?: string | null
          conductor_nombre?: string | null
          conductor_telefono?: string | null
          transportista_nima?: string | null
          fecha_carga_desde?: string | null
          fecha_carga_hasta?: string | null
          fecha_carga_real?: string | null
          fecha_entrega_estimada?: string | null
          descripcion_mercancia?: string | null
          toneladas?: number | null
          metros_lineales?: number | null
          tipo_carga?: never
          paletizado?: boolean
          carga_lateral?: boolean
          carga_techo?: boolean
          carga_trasera?: boolean
          carga_lateral_bajo?: boolean
          requiere_plataforma_elevadora?: boolean
          requiere_nima?: boolean
          adr?: boolean
          importe_cliente?: number | null
          importe_transportista?: number | null
          moneda?: string
          margen_euros?: never
          factor_tarifa_pct?: number | null
          iva_pct?: number | null
          retencion_pct?: number | null
          plazo_pago_dias?: number | null
          precio_fijado_a_mano?: boolean
          codigo_postal_origen?: string | null
          poblacion_origen?: string | null
          codigo_postal_destino?: string | null
          poblacion_destino?: string | null
          num_paradas?: number
          distancia_total_km?: number | null
          holded_pedido_venta?: string | null
          holded_pedido_compra?: string | null
          publicado_en_bolsa_en?: string | null
          discrecion_comercial?: boolean
          anotaciones_cliente?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          confirmado_en?: string | null
          primera_oferta_en?: string | null
          asignado_en?: string | null
          cargado_en?: string | null
          entregado_en?: string | null
          cancelado_en?: string | null
          operador_id?: string | null
          precio_acordado_operador?: number | null
          es_manual?: never
          facturado_venta?: boolean
          facturado_compra?: boolean
          valoracion_transportista?: number | null
          valoracion_comentario?: string | null
          estado_solicitud?: string | null
          precio_caduca_en?: string | null
          condiciones_aceptadas_en?: string | null
          num_bultos?: number | null
          embalaje?: string | null
          volumen_m3?: number | null
          negociacion_pct?: number | null
          valoracion_cliente?: number | null
          valoracion_cliente_comentario?: string | null
          valoracion_cliente_en?: string | null
          estado_pago_previo?: string
          pago_motivo?: string | null
          pago_metodo?: string | null
          pagado_en?: string | null
          pago_resuelto_por?: string | null
          pago_exento_motivo?: string | null
          stripe_pago_ref?: string | null
          importe_contraoferta_cliente?: number | null
          contraoferta_cliente_en?: string | null
          importe_cliente_inicial?: number | null
          requiere_revision_precio?: boolean
          cambio_cliente?: Json | null
          cambio_cliente_en?: string | null
          estado_cambio_cliente?: string | null
          cambio_cliente_nota?: string | null
          cancelado_en_nombre_cliente?: boolean
          pago_pendiente_en?: string | null
          precio_calculado_en?: string | null
          estado_revision_precio?: string | null
          fecha_revision_precio?: string | null
          importe_revision_anterior?: number | null
          importe_revision_nuevo?: number | null
          revision_precio_en?: string | null
          revision_precio_recordada?: boolean
          cancelacion_sin_coste?: boolean
          texto_busqueda?: string | null
          stripe_cobro_sin_aplicar?: string | null
          fecha_carga_prevista?: string | null
          parada_actual?: number | null
          seguimiento_automatico?: boolean
          ancla_paso?: number | null
          ancla_hora?: string | null
          fecha_efectiva?: string | null
        }
        Update: {
          id?: string
          referencia_gx?: string
          token_publico?: string
          referencia_cliente?: string | null
          cliente_id?: string
          estado?: Database["public"]["Enums"]["estado_envio"]
          estado_asignacion?: Database["public"]["Enums"]["estado_asignacion"]
          transportista_id?: string | null
          vehiculo_camion_id?: string | null
          vehiculo_remolque_id?: string | null
          conductor_id?: string | null
          matricula_camion?: string | null
          matricula_remolque?: string | null
          conductor_nombre?: string | null
          conductor_telefono?: string | null
          transportista_nima?: string | null
          fecha_carga_desde?: string | null
          fecha_carga_hasta?: string | null
          fecha_carga_real?: string | null
          fecha_entrega_estimada?: string | null
          descripcion_mercancia?: string | null
          toneladas?: number | null
          metros_lineales?: number | null
          tipo_carga?: never
          paletizado?: boolean
          carga_lateral?: boolean
          carga_techo?: boolean
          carga_trasera?: boolean
          carga_lateral_bajo?: boolean
          requiere_plataforma_elevadora?: boolean
          requiere_nima?: boolean
          adr?: boolean
          importe_cliente?: number | null
          importe_transportista?: number | null
          moneda?: string
          margen_euros?: never
          factor_tarifa_pct?: number | null
          iva_pct?: number | null
          retencion_pct?: number | null
          plazo_pago_dias?: number | null
          precio_fijado_a_mano?: boolean
          codigo_postal_origen?: string | null
          poblacion_origen?: string | null
          codigo_postal_destino?: string | null
          poblacion_destino?: string | null
          num_paradas?: number
          distancia_total_km?: number | null
          holded_pedido_venta?: string | null
          holded_pedido_compra?: string | null
          publicado_en_bolsa_en?: string | null
          discrecion_comercial?: boolean
          anotaciones_cliente?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          confirmado_en?: string | null
          primera_oferta_en?: string | null
          asignado_en?: string | null
          cargado_en?: string | null
          entregado_en?: string | null
          cancelado_en?: string | null
          operador_id?: string | null
          precio_acordado_operador?: number | null
          es_manual?: never
          facturado_venta?: boolean
          facturado_compra?: boolean
          valoracion_transportista?: number | null
          valoracion_comentario?: string | null
          estado_solicitud?: string | null
          precio_caduca_en?: string | null
          condiciones_aceptadas_en?: string | null
          num_bultos?: number | null
          embalaje?: string | null
          volumen_m3?: number | null
          negociacion_pct?: number | null
          valoracion_cliente?: number | null
          valoracion_cliente_comentario?: string | null
          valoracion_cliente_en?: string | null
          estado_pago_previo?: string
          pago_motivo?: string | null
          pago_metodo?: string | null
          pagado_en?: string | null
          pago_resuelto_por?: string | null
          pago_exento_motivo?: string | null
          stripe_pago_ref?: string | null
          importe_contraoferta_cliente?: number | null
          contraoferta_cliente_en?: string | null
          importe_cliente_inicial?: number | null
          requiere_revision_precio?: boolean
          cambio_cliente?: Json | null
          cambio_cliente_en?: string | null
          estado_cambio_cliente?: string | null
          cambio_cliente_nota?: string | null
          cancelado_en_nombre_cliente?: boolean
          pago_pendiente_en?: string | null
          precio_calculado_en?: string | null
          estado_revision_precio?: string | null
          fecha_revision_precio?: string | null
          importe_revision_anterior?: number | null
          importe_revision_nuevo?: number | null
          revision_precio_en?: string | null
          revision_precio_recordada?: boolean
          cancelacion_sin_coste?: boolean
          texto_busqueda?: string | null
          stripe_cobro_sin_aplicar?: string | null
          fecha_carga_prevista?: string | null
          parada_actual?: number | null
          seguimiento_automatico?: boolean
          ancla_paso?: number | null
          ancla_hora?: string | null
          fecha_efectiva?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "envios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_conductor_id_fkey"
            columns: ["conductor_id"]
            isOneToOne: false
            referencedRelation: "conductores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_vehiculo_remolque_id_fkey"
            columns: ["vehiculo_remolque_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_vehiculo_tractora_id_fkey"
            columns: ["vehiculo_camion_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      festivos: {
        Row: {
          id: string
          fecha: string
          pais_codigo_iso: string
          region: string | null
          poblacion: string | null
          nombre: string
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          repetir: string
          dias_desde_pascua: number | null
          vigente_hasta: string | null
        }
        Insert: {
          id?: string
          fecha: string
          pais_codigo_iso?: string
          region?: string | null
          poblacion?: string | null
          nombre: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          repetir?: string
          dias_desde_pascua?: number | null
          vigente_hasta?: string | null
        }
        Update: {
          id?: string
          fecha?: string
          pais_codigo_iso?: string
          region?: string | null
          poblacion?: string | null
          nombre?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          repetir?: string
          dias_desde_pascua?: number | null
          vigente_hasta?: string | null
        }
        Relationships: [
        ]
      }
      firmas_cmr: {
        Row: {
          id: string
          envio_id: string
          parada_id: string | null
          rol: string
          nombre: string
          documento: string
          documento_pais: string
          documento_validado: boolean
          email: string | null
          firmado_en: string
          ip: string | null
          navegador: string | null
          firma_storage_ruta: string
          sha256_documento: string | null
        }
        Insert: {
          id?: string
          envio_id: string
          parada_id?: string | null
          rol: string
          nombre: string
          documento: string
          documento_pais?: string
          documento_validado?: boolean
          email?: string | null
          firmado_en?: string
          ip?: string | null
          navegador?: string | null
          firma_storage_ruta: string
          sha256_documento?: string | null
        }
        Update: {
          id?: string
          envio_id?: string
          parada_id?: string | null
          rol?: string
          nombre?: string
          documento?: string
          documento_pais?: string
          documento_validado?: boolean
          email?: string | null
          firmado_en?: string
          ip?: string | null
          navegador?: string | null
          firma_storage_ruta?: string
          sha256_documento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firmas_cmr_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias: {
        Row: {
          id: string
          codigo: string
          tipo_id: string
          cliente_id: string | null
          envio_id: string | null
          almacenamiento_id: string | null
          transportista_id: string | null
          titulo: string
          detalle: string | null
          estado: Database["public"]["Enums"]["estado_incidencia"]
          prioridad: Database["public"]["Enums"]["prioridad_incidencia"]
          resuelto_en: string | null
          resolucion: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          tipo_id: string
          cliente_id?: string | null
          envio_id?: string | null
          almacenamiento_id?: string | null
          transportista_id?: string | null
          titulo: string
          detalle?: string | null
          estado?: Database["public"]["Enums"]["estado_incidencia"]
          prioridad?: Database["public"]["Enums"]["prioridad_incidencia"]
          resuelto_en?: string | null
          resolucion?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          tipo_id?: string
          cliente_id?: string | null
          envio_id?: string | null
          almacenamiento_id?: string | null
          transportista_id?: string | null
          titulo?: string
          detalle?: string | null
          estado?: Database["public"]["Enums"]["estado_incidencia"]
          prioridad?: Database["public"]["Enums"]["prioridad_incidencia"]
          resuelto_en?: string | null
          resolucion?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_incidencias_almacenamiento"
            columns: ["almacenamiento_id"]
            isOneToOne: false
            referencedRelation: "almacenamientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_incidencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      intentos_carga_publica: {
        Row: {
          id: number
          envio_id: string
          reserva_id: string | null
          cuando: string
          motivo: string
          ip: string | null
        }
        Insert: {
          id?: number
          envio_id: string
          reserva_id?: string | null
          cuando?: string
          motivo: string
          ip?: string | null
        }
        Update: {
          id?: number
          envio_id?: string
          reserva_id?: string | null
          cuando?: string
          motivo?: string
          ip?: string | null
        }
        Relationships: [
        ]
      }
      notas_internas: {
        Row: {
          id: string
          tabla: string
          campo: string
          registro_id: string
          texto: string
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          tabla: string
          campo?: string
          registro_id: string
          texto: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          tabla?: string
          campo?: string
          registro_id?: string
          texto?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
        ]
      }
      operadores: {
        Row: {
          id: string
          cliente_id: string
          razon_social: string
          cif: string
          telefono: string | null
          email: string | null
          persona_contacto: string | null
          web: string | null
          url_logo: string | null
          anotaciones: string | null
          borrado: boolean
          borrado_en: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          cliente_id: string
          razon_social: string
          cif: string
          telefono?: string | null
          email?: string | null
          persona_contacto?: string | null
          web?: string | null
          url_logo?: string | null
          anotaciones?: string | null
          borrado?: boolean
          borrado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          cliente_id?: string
          razon_social?: string
          cif?: string
          telefono?: string | null
          email?: string | null
          persona_contacto?: string | null
          web?: string | null
          url_logo?: string | null
          anotaciones?: string | null
          borrado?: boolean
          borrado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operadores_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          id: string
          clave: string
          valor: Json
          descripcion: string
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          clave: string
          valor: Json
          descripcion: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          clave?: string
          valor?: Json
          descripcion?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
        ]
      }
      penalizaciones: {
        Row: {
          id: string
          codigo: string
          envio_id: string
          tipo_id: string
          descripcion: string | null
          importe_cliente: number | null
          importe_transportista: number | null
          estado: Database["public"]["Enums"]["estado_penalizacion"]
          generada_auto: boolean
          editada_a_mano: boolean
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          envio_id: string
          tipo_id: string
          descripcion?: string | null
          importe_cliente?: number | null
          importe_transportista?: number | null
          estado?: Database["public"]["Enums"]["estado_penalizacion"]
          generada_auto?: boolean
          editada_a_mano?: boolean
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          envio_id?: string
          tipo_id?: string
          descripcion?: string | null
          importe_cliente?: number | null
          importe_transportista?: number | null
          estado?: Database["public"]["Enums"]["estado_penalizacion"]
          generada_auto?: boolean
          editada_a_mano?: boolean
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "penalizaciones_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalizaciones_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_penalizacion"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_intentos: {
        Row: {
          id: number
          parada_id: string
          envio_id: string
          cuando: string
          acierto: boolean
          motivo: string
          ip: string | null
          navegador: string | null
        }
        Insert: {
          id?: number
          parada_id: string
          envio_id: string
          cuando?: string
          acierto: boolean
          motivo: string
          ip?: string | null
          navegador?: string | null
        }
        Update: {
          id?: number
          parada_id?: string
          envio_id?: string
          cuando?: string
          acierto?: boolean
          motivo?: string
          ip?: string | null
          navegador?: string | null
        }
        Relationships: [
        ]
      }
      recargos_tipo_sitio: {
        Row: {
          tipo: Database["public"]["Enums"]["tipo_sitio"]
          porcentaje: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          tipo: Database["public"]["Enums"]["tipo_sitio"]
          porcentaje: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          tipo?: Database["public"]["Enums"]["tipo_sitio"]
          porcentaje?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
        ]
      }
      restricciones_servicio: {
        Row: {
          id: string
          nombre: string
          pais_codigo_iso: string
          prefijos_cp: string[] | null
          aplica_a: string
          tipo_carga: Database["public"]["Enums"]["tipo_carga"] | null
          efecto: string
          mensaje: string
          activa: boolean
          vigente_desde: string
          vigente_hasta: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          nombre: string
          pais_codigo_iso: string
          prefijos_cp?: string[] | null
          aplica_a?: string
          tipo_carga?: Database["public"]["Enums"]["tipo_carga"] | null
          efecto?: string
          mensaje: string
          activa?: boolean
          vigente_desde?: string
          vigente_hasta?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          nombre?: string
          pais_codigo_iso?: string
          prefijos_cp?: string[] | null
          aplica_a?: string
          tipo_carga?: Database["public"]["Enums"]["tipo_carga"] | null
          efecto?: string
          mensaje?: string
          activa?: boolean
          vigente_desde?: string
          vigente_hasta?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
        ]
      }
      sitio_horarios: {
        Row: {
          id: string
          sitio_id: string
          dia_semana: number
          abre: string
          cierra: string
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          temporada: string
        }
        Insert: {
          id?: string
          sitio_id: string
          dia_semana: number
          abre: string
          cierra: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          temporada?: string
        }
        Update: {
          id?: string
          sitio_id?: string
          dia_semana?: number
          abre?: string
          cierra?: string
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          temporada?: string
        }
        Relationships: [
          {
            foreignKeyName: "sitio_horarios_sitio_id_fkey"
            columns: ["sitio_id"]
            isOneToOne: false
            referencedRelation: "sitios"
            referencedColumns: ["id"]
          },
        ]
      }
      sitios: {
        Row: {
          id: string
          codigo: string
          nombre_empresa: string
          cif: string | null
          tipo: Database["public"]["Enums"]["tipo_sitio"]
          direccion: string | null
          codigo_postal: string | null
          poblacion: string | null
          provincia: string | null
          pais_codigo_iso: string
          lat: number | null
          lon: number | null
          horarios: string | null
          url_google_maps: string | null
          anotaciones: string | null
          es_almacen_dynamo: boolean
          disponible: boolean
          cliente_id: string | null
          borrado: boolean
          borrado_en: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          version_geo: number
          requiere_pin: boolean
          requiere_cita: boolean
          tiene_medios_carga: boolean
          emails_avisos: string[]
          precio_almacenamiento_semana: number | null
          precio_reparto: number | null
          verano_activo: boolean
          verano_desde: string | null
          verano_hasta: string | null
          horarios_verano: string | null
          texto_busqueda: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          nombre_empresa: string
          cif?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sitio"]
          direccion?: string | null
          codigo_postal?: string | null
          poblacion?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          lat?: number | null
          lon?: number | null
          horarios?: string | null
          url_google_maps?: string | null
          anotaciones?: string | null
          es_almacen_dynamo?: boolean
          disponible?: boolean
          cliente_id?: string | null
          borrado?: boolean
          borrado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          version_geo?: number
          requiere_pin?: boolean
          requiere_cita?: boolean
          tiene_medios_carga?: boolean
          emails_avisos?: string[]
          precio_almacenamiento_semana?: number | null
          precio_reparto?: number | null
          verano_activo?: boolean
          verano_desde?: string | null
          verano_hasta?: string | null
          horarios_verano?: string | null
          texto_busqueda?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          nombre_empresa?: string
          cif?: string | null
          tipo?: Database["public"]["Enums"]["tipo_sitio"]
          direccion?: string | null
          codigo_postal?: string | null
          poblacion?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          lat?: number | null
          lon?: number | null
          horarios?: string | null
          url_google_maps?: string | null
          anotaciones?: string | null
          es_almacen_dynamo?: boolean
          disponible?: boolean
          cliente_id?: string | null
          borrado?: boolean
          borrado_en?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          version_geo?: number
          requiere_pin?: boolean
          requiere_cita?: boolean
          tiene_medios_carga?: boolean
          emails_avisos?: string[]
          precio_almacenamiento_semana?: number | null
          precio_reparto?: number | null
          verano_activo?: boolean
          verano_desde?: string | null
          verano_hasta?: string | null
          horarios_verano?: string | null
          texto_busqueda?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sitios_cliente"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_incidencia: {
        Row: {
          id: string
          clave: string
          nombre: string
          activo: boolean
          orden: number
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          clave: string
          nombre: string
          activo?: boolean
          orden?: number
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          clave?: string
          nombre?: string
          activo?: boolean
          orden?: number
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
        ]
      }
      tipos_penalizacion: {
        Row: {
          id: string
          clave: string
          nombre: string
          activo: boolean
          orden: number
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          clave: string
          nombre: string
          activo?: boolean
          orden?: number
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          clave?: string
          nombre?: string
          activo?: boolean
          orden?: number
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
        ]
      }
      transportistas: {
        Row: {
          id: string
          codigo: string
          razon_social: string
          cif: string
          direccion: string | null
          poblacion: string | null
          codigo_postal: string | null
          provincia: string | null
          pais_codigo_iso: string
          iva_pct: number
          retencion_pct: number
          holded_forma_pago_ref: string | null
          cuenta_contable: string | null
          moneda: string
          tags: string[]
          plazo_pago_dias: number
          nima: string | null
          codigo_bolsa: string | null
          tiene_almacen: boolean
          tipo_camion_defecto: Database["public"]["Enums"]["tipo_camion"] | null
          seguro_cmr_compania: string | null
          seguro_cmr_poliza: string | null
          seguro_cmr_vence: string | null
          estado_operativo: Database["public"]["Enums"]["estado_operativo_transportista"]
          valoracion_dynamo: number | null
          valoracion_dynamo_votos: number
          anotaciones_incidencias: string | null
          anotaciones: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          nombre_comercial: string | null
          nombre_visible: string | null
          bolsa: string | null
          pronto_pago: boolean
          valoracion_clientes: number | null
          valoracion_clientes_votos: number
          texto_busqueda: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          razon_social: string
          cif: string
          direccion?: string | null
          poblacion?: string | null
          codigo_postal?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          iva_pct?: number
          retencion_pct?: number
          holded_forma_pago_ref?: string | null
          cuenta_contable?: string | null
          moneda?: string
          tags?: string[]
          plazo_pago_dias?: number
          nima?: string | null
          codigo_bolsa?: string | null
          tiene_almacen?: boolean
          tipo_camion_defecto?: Database["public"]["Enums"]["tipo_camion"] | null
          seguro_cmr_compania?: string | null
          seguro_cmr_poliza?: string | null
          seguro_cmr_vence?: string | null
          estado_operativo?: Database["public"]["Enums"]["estado_operativo_transportista"]
          valoracion_dynamo?: number | null
          valoracion_dynamo_votos?: number
          anotaciones_incidencias?: string | null
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          nombre_comercial?: string | null
          nombre_visible?: never
          bolsa?: string | null
          pronto_pago?: boolean
          valoracion_clientes?: number | null
          valoracion_clientes_votos?: number
          texto_busqueda?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          razon_social?: string
          cif?: string
          direccion?: string | null
          poblacion?: string | null
          codigo_postal?: string | null
          provincia?: string | null
          pais_codigo_iso?: string
          iva_pct?: number
          retencion_pct?: number
          holded_forma_pago_ref?: string | null
          cuenta_contable?: string | null
          moneda?: string
          tags?: string[]
          plazo_pago_dias?: number
          nima?: string | null
          codigo_bolsa?: string | null
          tiene_almacen?: boolean
          tipo_camion_defecto?: Database["public"]["Enums"]["tipo_camion"] | null
          seguro_cmr_compania?: string | null
          seguro_cmr_poliza?: string | null
          seguro_cmr_vence?: string | null
          estado_operativo?: Database["public"]["Enums"]["estado_operativo_transportista"]
          valoracion_dynamo?: number | null
          valoracion_dynamo_votos?: number
          anotaciones_incidencias?: string | null
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          nombre_comercial?: string | null
          nombre_visible?: never
          bolsa?: string | null
          pronto_pago?: boolean
          valoracion_clientes?: number | null
          valoracion_clientes_votos?: number
          texto_busqueda?: string | null
        }
        Relationships: [
        ]
      }
      usuarios: {
        Row: {
          id: string
          email: string
          nombre: string | null
          documento: string | null
          telefono: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          estado: Database["public"]["Enums"]["estado_cuenta"]
          cliente_id: string | null
          transportista_id: string | null
          limite_consultas_precio_diario: number | null
          limite_envios_diario: number | null
          ultima_conexion: string | null
          anotaciones: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          idioma: string
          cargo: string | null
          exento_autosuspension: boolean
          autosuspension_desde_en: string | null
          suspendida_en: string | null
          suspension_motivo: string | null
          emails_copia_avisos: string[]
        }
        Insert: {
          id: string
          email: string
          nombre?: string | null
          documento?: string | null
          telefono?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          estado?: Database["public"]["Enums"]["estado_cuenta"]
          cliente_id?: string | null
          transportista_id?: string | null
          limite_consultas_precio_diario?: number | null
          limite_envios_diario?: number | null
          ultima_conexion?: string | null
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          idioma?: string
          cargo?: string | null
          exento_autosuspension?: boolean
          autosuspension_desde_en?: string | null
          suspendida_en?: string | null
          suspension_motivo?: string | null
          emails_copia_avisos?: string[]
        }
        Update: {
          id?: string
          email?: string
          nombre?: string | null
          documento?: string | null
          telefono?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          estado?: Database["public"]["Enums"]["estado_cuenta"]
          cliente_id?: string | null
          transportista_id?: string | null
          limite_consultas_precio_diario?: number | null
          limite_envios_diario?: number | null
          ultima_conexion?: string | null
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
          idioma?: string
          cargo?: string | null
          exento_autosuspension?: boolean
          autosuspension_desde_en?: string | null
          suspendida_en?: string | null
          suspension_motivo?: string | null
          emails_copia_avisos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          id: string
          codigo: string
          transportista_id: string | null
          matricula: string
          tipo: Database["public"]["Enums"]["tipo_vehiculo"]
          itv_vence: string | null
          seguro_vence: string | null
          tarjeta_transporte_vence: string | null
          adr: boolean
          tiene_plataforma_elevadora: boolean
          activo: boolean
          anotaciones: string | null
          creado_en: string
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
        }
        Insert: {
          id?: string
          codigo?: string
          transportista_id?: string | null
          matricula: string
          tipo: Database["public"]["Enums"]["tipo_vehiculo"]
          itv_vence?: string | null
          seguro_vence?: string | null
          tarjeta_transporte_vence?: string | null
          adr?: boolean
          tiene_plataforma_elevadora?: boolean
          activo?: boolean
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Update: {
          id?: string
          codigo?: string
          transportista_id?: string | null
          matricula?: string
          tipo?: Database["public"]["Enums"]["tipo_vehiculo"]
          itv_vence?: string | null
          seguro_vence?: string | null
          tarjeta_transporte_vence?: string | null
          adr?: boolean
          tiene_plataforma_elevadora?: boolean
          activo?: boolean
          anotaciones?: string | null
          creado_en?: string
          creado_por?: string | null
          modificado_en?: string | null
          modificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vehiculos_transportista"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_distancias_caducadas: {
        Row: {
          id: string | null
          origen: string | null
          destino: string | null
          km: number | null
          consultado_en: string | null
          motivo: string | null
        }
        Relationships: [
        ]
      }
      v_envios_con_paradas: {
        Row: {
          id: string | null
          referencia_gx: string | null
          token_publico: string | null
          referencia_cliente: string | null
          cliente_id: string | null
          estado: Database["public"]["Enums"]["estado_envio"] | null
          estado_asignacion: Database["public"]["Enums"]["estado_asignacion"] | null
          transportista_id: string | null
          vehiculo_camion_id: string | null
          vehiculo_remolque_id: string | null
          conductor_id: string | null
          matricula_camion: string | null
          matricula_remolque: string | null
          conductor_nombre: string | null
          conductor_telefono: string | null
          transportista_nima: string | null
          fecha_carga_desde: string | null
          fecha_carga_hasta: string | null
          fecha_carga_real: string | null
          fecha_entrega_estimada: string | null
          descripcion_mercancia: string | null
          toneladas: number | null
          metros_lineales: number | null
          tipo_carga: Database["public"]["Enums"]["tipo_carga"] | null
          paletizado: boolean | null
          carga_lateral: boolean | null
          carga_techo: boolean | null
          carga_trasera: boolean | null
          carga_lateral_bajo: boolean | null
          requiere_plataforma_elevadora: boolean | null
          requiere_nima: boolean | null
          adr: boolean | null
          importe_cliente: number | null
          importe_transportista: number | null
          moneda: string | null
          margen_euros: number | null
          factor_tarifa_pct: number | null
          iva_pct: number | null
          retencion_pct: number | null
          plazo_pago_dias: number | null
          precio_fijado_a_mano: boolean | null
          codigo_postal_origen: string | null
          poblacion_origen: string | null
          codigo_postal_destino: string | null
          poblacion_destino: string | null
          num_paradas: number | null
          distancia_total_km: number | null
          holded_pedido_venta: string | null
          holded_pedido_compra: string | null
          publicado_en_bolsa_en: string | null
          discrecion_comercial: boolean | null
          anotaciones_cliente: string | null
          creado_en: string | null
          creado_por: string | null
          modificado_en: string | null
          modificado_por: string | null
          confirmado_en: string | null
          primera_oferta_en: string | null
          asignado_en: string | null
          cargado_en: string | null
          entregado_en: string | null
          cancelado_en: string | null
          operador_id: string | null
          precio_acordado_operador: number | null
          es_manual: boolean | null
          facturado_venta: boolean | null
          facturado_compra: boolean | null
          paradas: Json | null
        }
        Relationships: [
        ]
      }
      v_holded_pedido_compra: {
        Row: {
          "ESTADO VIAJE": string | null
          "EN HOLDED?": string | null
          "FACTURADO?": string | null
          "ALB REC?": string | null
          "PLAZO PAGO": number | null
          "Num Pedido (referencia_gx_carga)": string | null
          "Formato de numeraci\u00f3n": string | null
          "Fecha dd/mm/yyyy": string | null
          "Fecha de vencimiento dd/mm/yyyy": string | null
          Descripción: string | null
          "Nombre del contacto": string | null
          NIF: string | null
          Dirección: string | null
          Población: string | null
          "C\u00f3digo postal": string | null
          Provincia: string | null
          País: string | null
          Concepto: string | null
          "Descripci\u00f3n del producto": string | null
          SKU: string | null
          "Precio unidad": number | null
          Unidades: number | null
          "Unidades recibidas": number | null
          Descuento: number | null
          "IVA %": number | null
          "Retenci\u00f3n %": number | null
          "Rec. de eq. %": number | null
          Operación: string | null
          "Forma de pago (ID)": string | null
          "Tags separados por -": string | null
          "Nombre canal de venta": string | null
          "Cuenta canal de venta": string | null
          Moneda: string | null
          "Cambio de moneda": number | null
        }
        Relationships: [
        ]
      }
      v_holded_pedido_venta: {
        Row: {
          "ESTADO VIAJE": string | null
          "EN HOLDED?": string | null
          "FACTURADO?": string | null
          "ALB REC?": string | null
          "PLAZO PAGO": number | null
          "Num Pedido (referencia_gx_carga)": string | null
          "Formato de numeraci\u00f3n": string | null
          "Fecha dd/mm/yyyy": string | null
          "Fecha de vencimiento dd/mm/yyyy": string | null
          Descripción: string | null
          "Nombre del contacto": string | null
          NIF: string | null
          Dirección: string | null
          Población: string | null
          "C\u00f3digo postal": string | null
          Provincia: string | null
          País: string | null
          Concepto: string | null
          "Descripci\u00f3n del producto": string | null
          SKU: string | null
          "Precio unidad": number | null
          Unidades: number | null
          "Descuento %": number | null
          "IVA %": number | null
          "Retenci\u00f3n %": number | null
          "Rec. de eq. %": number | null
          Operación: string | null
          "Forma de pago (ID)": string | null
          "Tags separados por -": string | null
          "Nombre canal de venta": string | null
          "Cuenta canal de venta": string | null
          Moneda: string | null
          "Cambio de moneda": number | null
        }
        Relationships: [
        ]
      }
      v_lineas_pedido: {
        Row: {
          envio_id: string | null
          orden: number | null
          concepto: Database["public"]["Enums"]["tipo_concepto"] | null
          descripcion: string | null
          precio_venta: number | null
          precio_compra: number | null
        }
        Relationships: [
        ]
      }
      v_restricciones_vigentes: {
        Row: {
          nombre: string | null
          pais_codigo_iso: string | null
          prefijos_cp: string[] | null
          aplica_a: string | null
          tipo_carga: string | null
          efecto: string | null
          mensaje: string | null
          vigente_desde: string | null
        }
        Relationships: [
        ]
      }
      v_tablas_sin_rastro: {
        Row: {
          tabla: string | null
        }
        Relationships: [
        ]
      }
      v_tablas_sin_rls: {
        Row: {
          tabla: string | null
        }
        Relationships: [
        ]
      }
      v_wtransnet: {
        Row: {
          "ESTADO VIAJE": string | null
          CLIENTE: string | null
          "REF.": string | null
          Referencia: string | null
          "Fecha disponibilidad": string | null
          "Pa\u00eds origen": string | null
          "CP origen": string | null
          "Localidad origen": string | null
          "Pa\u00eds destino": string | null
          "CP destino": string | null
          "Localidad destino": string | null
          "Tipo Bolsa": string | null
          "Tipo Vehiculo": string | null
          Especialidad: string | null
          Peso: number | null
          Largo: number | null
          Adr: string | null
          Paletizado: string | null
          "Intercambio Palets": string | null
          "Localizador GPS": string | null
          Arriba: string | null
          Lateral: string | null
          Detrás: string | null
          "Sirve Frigorifico": string | null
          "Sirve Lateral Bajo": string | null
          "Misma Especialidad": string | null
          "Comentarios P\u00fablicos": string | null
          Precio: number | null
          "Activar Serv. Alerta": string | null
        }
        Relationships: [
        ]
      }
    }
    Functions: {
      aceptar_oferta_publica: { Args: { p_reserva: string | null; p_cif: string | null; p_precio?: number | null; p_pronto_pago?: boolean | null; p_matricula_camion?: string | null; p_matricula_remolque?: string | null; p_conductor_nombre?: string | null; p_telefono?: string | null; p_ip?: string | null }; Returns: Json }
      aceptar_reserva: { Args: { p_reserva: string | null; p_transportista: string | null; p_usuario?: string | null; p_precio?: number | null }; Returns: Json }
      activar_rastro: { Args: { p_tabla: string | null }; Returns: undefined }
      almacenes_dynamo_tarifa: { Args: Record<PropertyKey, never>; Returns: { id: string; nombre: string; direccion: string; codigo_postal: string; poblacion: string; provincia: string; disponible: boolean; semana: number; reparto: number }[] }
      alta_transportista_publica: { Args: { p_reserva: string | null; p_bolsa: string | null; p_codigo_bolsa: string | null; p_pais: string | null; p_cif: string | null; p_telefono: string | null; p_precio?: number | null; p_pronto_pago?: boolean | null; p_ip?: string | null }; Returns: Json }
      altas_pendientes: { Args: Record<PropertyKey, never>; Returns: { id: string; email: string; nombre: string; telefono: string; documento: string; solicitada_en: string; confirmado_email: boolean; datos: Json }[] }
      ampliar_plazo_pago: { Args: { p_envio: string | null }; Returns: Json }
      anonimizar_conductor: { Args: { p_conductor: string | null }; Returns: Json }
      anonimizar_contacto: { Args: { p_contacto: string | null }; Returns: Json }
      anonimizar_usuario: { Args: { p_usuario: string | null }; Returns: Json }
      anotar_reservas_cmr_publico: { Args: { p_token: string | null; p_parada: string | null; p_rol: string | null; p_texto: string | null }; Returns: Json }
      archivos_sueltos: { Args: { p_horas?: number | null }; Returns: { ruta: string; creado: string; bytes: number }[] }
      asignar_transportista: { Args: { p_envio: string | null; p_transportista: string | null; p_importe_transportista?: number | null; p_matricula_camion?: string | null; p_matricula_remolque?: string | null; p_conductor_nombre?: string | null; p_conductor_telefono?: string | null; p_fecha_carga_prevista?: string | null }; Returns: Json }
      autores_mis_envios: { Args: Record<PropertyKey, never>; Returns: { envio_id: string; creado_por: string; creado_email: string; modificado_por: string; modificado_en: string }[] }
      autosuspender_cuentas: { Args: Record<PropertyKey, never>; Returns: number }
      autosuspension_candidatos: { Args: Record<PropertyKey, never>; Returns: { usuario_id: string; email: string; motivo: string }[] }
      autosuspension_en_curso: { Args: { o: Database["public"]["Tables"]["usuarios"]["Row"] | null; n: Database["public"]["Tables"]["usuarios"]["Row"] | null }; Returns: boolean }
      autosuspension_motivos: { Args: { p_usuario?: string | null }; Returns: { usuario_id: string; email: string; motivo: string }[] }
      autosuspension_revisar: { Args: { p_usuario: string | null }; Returns: undefined }
      avanzar_estados_envios: { Args: Record<PropertyKey, never>; Returns: number }
      baja_propia_en_curso: { Args: { o: Database["public"]["Tables"]["usuarios"]["Row"] | null; n: Database["public"]["Tables"]["usuarios"]["Row"] | null }; Returns: boolean }
      buscar_clientes: { Args: { p_q: string | null; p_limite?: number | null; p_incluir?: string | null }; Returns: { id: string; nombre: string; cif: string; principal_id: string; iva_pct: number; estado: string }[] }
      buscar_envios: { Args: { p_q: string | null; p_limite?: number | null }; Returns: string[] }
      buscar_envios_pagina: { Args: { p_q?: string | null; p_desde?: string | null; p_hasta?: string | null; p_pagina?: number | null; p_por_pagina?: number | null; p_cliente?: string | null; p_transportista?: string | null; p_operador?: string | null; p_creado_por?: string | null; p_estado?: string | null }; Returns: { id: string; total: number }[] }
      buscar_persona: { Args: { p_texto: string | null }; Returns: { tipo: string; id: string; nombre: string; email: string; telefono: string; documento: string; empresa: string; estado: string }[] }
      buscar_transportistas: { Args: { p_q: string | null; p_limite?: number | null; p_incluir?: string | null }; Returns: { id: string; nombre: string; cif: string; estado: string; nima: string; telefono: string; email: string }[] }
      caducar_pagos_pendientes: { Args: Record<PropertyKey, never>; Returns: number }
      caducar_reservas: { Args: { p_envio: string | null }; Returns: undefined }
      cambiar_ruta_envio: { Args: { p_envio: string | null; p_paradas: Json | null }; Returns: undefined }
      cancelacion_cuenta: { Args: { p_transportista: string | null; p_cuando: string | null; p_fecha_carga: string | null }; Returns: boolean }
      cancelar_envio: { Args: { p_envio: string | null; p_motivo?: string | null; p_en_nombre_cliente?: boolean | null }; Returns: Json }
      cancelar_mi_envio: { Args: { p_envio: string | null; p_motivo?: string | null }; Returns: Json }
      carga_aceptada_publica: { Args: { p_reserva: string | null }; Returns: Json }
      cerrar_aceptacion: { Args: { p_reserva: string | null; p_transportista: string | null; p_usuario: string | null; p_precio: number | null }; Returns: Json }
      cliente_del_usuario: { Args: Record<PropertyKey, never>; Returns: string }
      cliente_texto_busqueda: { Args: { k: Database["public"]["Tables"]["clientes"]["Row"] | null }; Returns: string }
      clientes_pagina: { Args: { p_q?: string | null; p_estado?: string | null; p_pagina?: number | null; p_por_pagina?: number | null }; Returns: { id: string; total: number }[] }
      cmr_envio_de_token: { Args: { p_token: string | null }; Returns: string }
      cmr_publico: { Args: { p_token: string | null }; Returns: Json }
      cmr_ruta_permitida: { Args: { p_name: string | null }; Returns: boolean }
      cmr_subida_permitida: { Args: { p_name: string | null }; Returns: boolean }
      cmr_trazo_visible: { Args: { p_name: string | null }; Returns: boolean }
      completar_carga_publica: { Args: { p_reserva: string | null; p_matricula_camion: string | null; p_matricula_remolque: string | null; p_conductor_nombre: string | null; p_telefono: string | null; p_fecha_carga_prevista?: string | null }; Returns: Json }
      comprobar_cobertura: { Args: { p_paradas: Json | null; p_tipo_carga?: Database["public"]["Enums"]["tipo_carga"] | null }; Returns: { orden: number; punto: string; efecto: string; mensaje: string }[] }
      conductor_conocido: { Args: { p_transportista: string | null; p_nombre: string | null }; Returns: { nombre: string; telefono: string; conductor_id: string }[] }
      conductor_de_camion: { Args: { p_transportista: string | null; p_matricula: string | null }; Returns: { nombre: string; telefono: string }[] }
      conexiones_usuarios: { Args: Record<PropertyKey, never>; Returns: { id: string; ultima_conexion: string; email_confirmado: boolean }[] }
      contacto_transportista_oculto: { Args: { p_estado: Database["public"]["Enums"]["estado_envio"] | null; p_entrega: string | null }; Returns: boolean }
      contadores_panel: { Args: { p_cliente?: string | null; p_transportista?: string | null }; Returns: Json }
      contraofertar_precio_solicitud: { Args: { p_envio: string | null; p_importe: number | null }; Returns: Json }
      corte_cancelacion: { Args: { p_fecha_carga: string | null; p_pais?: string | null; p_region?: string | null }; Returns: string }
      crear_aviso: { Args: { p_para: string | null; p_cliente: string | null; p_transportista: string | null; p_tipo: string | null; p_nivel: string | null; p_titulo: string | null; p_texto: string | null; p_enlace: string | null; p_envio: string | null }; Returns: undefined }
      crear_envio: { Args: { p_datos: Json | null; p_paradas: Json | null }; Returns: { id: string; referencia_gx: string }[] }
      crear_envio_manual: { Args: { p_datos: Json | null; p_paradas: Json | null }; Returns: { id: string; referencia_gx: string }[] }
      crear_solicitud_envio: { Args: { p_datos: Json | null; p_paradas: Json | null }; Returns: { id: string; referencia_gx: string }[] }
      cuadro_mando: { Args: { p_desde: string | null; p_hasta: string | null; p_comp_desde?: string | null; p_comp_hasta?: string | null }; Returns: Json }
      cuadro_mando_sectores: { Args: { p_desde: string | null; p_hasta: string | null }; Returns: { sector: string; clientes: number; realizados: number; facturacion: number; margen: number }[] }
      cuenta_mis_envios_sin_asignar: { Args: Record<PropertyKey, never>; Returns: number }
      dar_baja_mi_flota: { Args: { p_tipo: string | null; p_id: string | null }; Returns: undefined }
      darme_de_baja: { Args: { p_motivo?: string | null }; Returns: Json }
      datos_cmr_envio: { Args: { p_envio: string | null }; Returns: Json }
      datos_dynamo: { Args: Record<PropertyKey, never>; Returns: Json }
      datos_orden_manual: { Args: { p_envio: string | null }; Returns: Json }
      datos_orden_publica: { Args: { p_reserva: string | null }; Returns: Json }
      datos_orden_transportista: { Args: { p_envio: string | null }; Returns: Json }
      deshacer_cancelacion: { Args: { p_envio: string | null }; Returns: string }
      dias_habiles_antes: { Args: { p_fecha: string | null; p_n: number | null }; Returns: string }
      dias_ventana_carga: { Args: { p_desde: string | null; p_hasta: string | null }; Returns: number }
      diccionario_datos: { Args: Record<PropertyKey, never>; Returns: { tabla: string; orden: number; columna: string; tipo: string; no_nulo: boolean; descripcion: string; tabla_descripcion: string }[] }
      documento_es_valido: { Args: { p_doc: string | null }; Returns: boolean }
      domingo_de_pascua: { Args: { p_anio: number | null }; Returns: string }
      duracion_sesion: { Args: Record<PropertyKey, never>; Returns: Json }
      email_dynamo: { Args: Record<PropertyKey, never>; Returns: string }
      emails_validos: { Args: { p: string[] | null }; Returns: boolean }
      en_temporada: { Args: { p_fecha: string | null; p_desde: string | null; p_hasta: string | null }; Returns: boolean }
      enlace_carga_caduca_en: { Args: { p_envio: string | null }; Returns: string }
      enlace_carga_vigente: { Args: { p_envio: string | null }; Returns: boolean }
      enlace_cmr_publico: { Args: { p_reserva: string | null }; Returns: string }
      envio_asignandose: { Args: { p_envio: string | null }; Returns: boolean }
      envio_del_cliente: { Args: { p_envio: string | null }; Returns: boolean }
      envio_del_transportista: { Args: { p_envio: string | null }; Returns: boolean }
      envio_en_pestana: { Args: { e: Database["public"]["Tables"]["envios"]["Row"] | null; p_pestana: string | null }; Returns: boolean }
      envio_texto_busqueda: { Args: { e: Database["public"]["Tables"]["envios"]["Row"] | null }; Returns: string }
      envio_texto_propio: { Args: { e: Database["public"]["Tables"]["envios"]["Row"] | null; p_quien: string | null }; Returns: string }
      envios_hechos_de: { Args: { p_campo: string | null; p_ids: string[] | null }; Returns: { id: string; envios: number }[] }
      envios_lista_ambito: { Args: { p_cliente: string | null; p_transportista: string | null }; Returns: { v_cli: string; v_tra: string; v_ok: boolean } }
      envios_pagina: { Args: { p_pestana: string | null; p_pagina?: number | null; p_por_pagina?: number | null; p_cliente?: string | null; p_transportista?: string | null; p_operador?: string | null; p_creado_por?: string | null; p_estado?: string | null; p_desde?: string | null; p_hasta?: string | null }; Returns: { id: string; total: number }[] }
      envios_pestanas: { Args: { p_cliente?: string | null; p_transportista?: string | null }; Returns: { pestana: string; total: number }[] }
      envios_por_empresa: { Args: { p_campo: string | null }; Returns: { id: string; envios: number }[] }
      envios_que_cuentan: { Args: { p_cliente: string | null }; Returns: number }
      es_admin_master: { Args: Record<PropertyKey, never>; Returns: boolean }
      es_consola_supabase: { Args: Record<PropertyKey, never>; Returns: boolean }
      es_dia_habil: { Args: { p_fecha: string | null; p_pais?: string | null; p_region?: string | null }; Returns: boolean }
      es_equipo_dynamo: { Args: Record<PropertyKey, never>; Returns: boolean }
      es_servidor: { Args: Record<PropertyKey, never>; Returns: boolean }
      es_solo_lectura: { Args: Record<PropertyKey, never>; Returns: boolean }
      etapas_envio: { Args: { p_envio: string | null }; Returns: { paso: number; estado: Database["public"]["Enums"]["estado_envio"]; parada: number; tipo_parada: string; poblacion: string; hora: string; km: number; km_estimado: boolean; hecha: boolean; actual: boolean; marcada: boolean }[] }
      euros_texto: { Args: { p: number | null }; Returns: string }
      exportar_datos_usuario: { Args: { p_usuario?: string | null }; Returns: Json }
      factor_automatico: { Args: { p_cliente: string | null }; Returns: number }
      fecha_ddmmyyyy: { Args: { p: string | null }; Returns: string }
      fecha_hora_texto: { Args: { p: string | null }; Returns: string }
      fecha_texto: { Args: { p: string | null }; Returns: string }
      festivo_cae_en: { Args: { p_fecha: string | null; p_desde: string | null; p_repetir: string | null; p_dias_pascua: number | null; p_hasta: string | null }; Returns: boolean }
      festivos_entre: { Args: { p_desde: string | null; p_hasta: string | null; p_pais?: string | null; p_region?: string | null }; Returns: { fecha: string; nombre: string; region: string }[] }
      firmar_cmr_publico: { Args: { p_token: string | null; p_parada: string | null; p_rol: string | null; p_nombre: string | null; p_documento: string | null; p_pais: string | null; p_validado: boolean | null; p_email: string | null; p_ruta: string | null; p_ip: string | null; p_navegador: string | null; p_sha256: string | null }; Returns: Json }
      firmas_envio: { Args: { p_envio: string | null }; Returns: { rol: string; parada_id: string; nombre: string; documento: string; documento_pais: string; documento_validado: boolean; firmado_en: string; firma_storage_ruta: string }[] }
      flota_sugerencia: { Args: { p_transportista: string | null; p_matricula?: string | null; p_conductor_nombre?: string | null }; Returns: Json }
      flota_sugerencia_publica: { Args: { p_reserva: string | null; p_matricula?: string | null; p_conductor_nombre?: string | null }; Returns: Json }
      fuera_de_cobertura: { Args: { p_pais: string | null }; Returns: string }
      funciones_api: { Args: Record<PropertyKey, never>; Returns: { grupo: string; funcion: string; argumentos: string; devuelve: string; sin_sesion: boolean; descripcion: string }[] }
      guardar_horario: { Args: { p_sitio: string | null; p_tramos: Json | null; p_temporada?: string | null }; Returns: undefined }
      guardar_horario_verano: { Args: { p_sitio: string | null; p_activo: boolean | null; p_desde: string | null; p_hasta: string | null; p_tramos: Json | null }; Returns: undefined }
      guardar_km_cp: { Args: { p_pais_codigo_iso_origen: string | null; p_codigo_postal_origen: string | null; p_pais_codigo_iso_destino: string | null; p_codigo_postal_destino: string | null; p_km: number | null; p_minutos?: number | null; p_proveedor?: string | null }; Returns: string }
      guardar_km_sitios: { Args: { p_origen: string | null; p_destino: string | null; p_km: number | null; p_minutos?: number | null; p_proveedor?: string | null }; Returns: string }
      guardar_mi_conductor: { Args: { p_id: string | null; p_nombre: string | null; p_documento: string | null; p_documento_pais: string | null; p_telefono: string | null }; Returns: string }
      guardar_mi_vehiculo: { Args: { p_id: string | null; p_matricula: string | null; p_tipo: Database["public"]["Enums"]["tipo_vehiculo"] | null; p_itv_vence: string | null; p_seguro_vence: string | null; p_tarjeta_transporte_vence: string | null; p_adr: boolean | null; p_plataforma_elevadora: boolean | null }; Returns: string }
      guardar_mis_datos_transporte: { Args: { p_nima: string | null; p_seguro_compania: string | null; p_seguro_poliza: string | null; p_seguro_vence: string | null }; Returns: undefined }
      guardar_nota_interna: { Args: { p_tabla: string | null; p_campo: string | null; p_id: string | null; p_texto: string | null }; Returns: undefined }
      guia_automatizaciones: { Args: Record<PropertyKey, never>; Returns: string }
      historial_campos_cliente: { Args: Record<PropertyKey, never>; Returns: string[] }
      historial_campos_internos: { Args: { p_tabla: string | null }; Returns: string[] }
      historial_registro: { Args: { p_tabla: string | null; p_id: string | null }; Returns: { cuando: string; accion: string; campos: string[]; cambios: Json; quien_nombre: string; quien_email: string; quien_tipo: string }[] }
      hito_visible_fuera: { Args: { p: Database["public"]["Enums"]["tipo_hito"] | null }; Returns: boolean }
      holded_operacion: { Args: { p_pais: string | null }; Returns: string }
      horario_del_dia: { Args: { p_sitio: string | null; p_fecha: string | null }; Returns: { abre: string; cierra: string; temporada: string }[] }
      horario_sitio_texto: { Args: { p_sitio: string | null; p_fecha: string | null }; Returns: string }
      horario_texto: { Args: { p_sitio: string | null; p_temporada?: string | null }; Returns: string }
      km_cp: { Args: { p_pais_codigo_iso_origen: string | null; p_codigo_postal_origen: string | null; p_pais_codigo_iso_destino: string | null; p_codigo_postal_destino: string | null; p_max_edad?: string | null }; Returns: number }
      km_sitios: { Args: { p_origen: string | null; p_destino: string | null; p_max_edad?: string | null }; Returns: number }
      latido: { Args: Record<PropertyKey, never>; Returns: undefined }
      liberar_reserva_publica: { Args: { p_reserva: string | null; p_motivo: string | null }; Returns: Json }
      mantenimiento_activo: { Args: Record<PropertyKey, never>; Returns: boolean }
      marcar_avisos_vistos: { Args: Record<PropertyKey, never>; Returns: undefined }
      marcar_estado_envio: { Args: { p_envio: string | null; p_estado: Database["public"]["Enums"]["estado_envio"] | null; p_fecha_carga_real?: string | null; p_parada?: number | null; p_hora?: string | null }; Returns: Json }
      marcar_etapa_envio: { Args: { p_envio: string | null; p_paso: number | null; p_hora?: string | null }; Returns: Json }
      marcar_exportados: { Args: { p_fichero: string | null; p_refs: string[] | null; p_valor?: boolean | null }; Returns: number }
      marcar_facturados: { Args: { p_lado: string | null; p_refs: string[] | null; p_valor?: boolean | null }; Returns: number }
      marcar_mi_envio_manual: { Args: { p_envio: string | null; p_estado: string | null; p_precio?: number | null }; Returns: undefined }
      marcar_mi_viaje: { Args: { p_envio: string | null; p_estado: string | null }; Returns: undefined }
      marcar_pago_envio: { Args: { p_envio: string | null; p_accion: string | null; p_motivo?: string | null }; Returns: Json }
      marcar_pin_enviado: { Args: { p_parada: string | null; p_destino: string | null }; Returns: undefined }
      marcar_sitio_principal: { Args: { p_cliente: string | null; p_sitio: string | null }; Returns: undefined }
      metricas_usuarios: { Args: Record<PropertyKey, never>; Returns: { id: string; consultas: number; min_dia: number; min_semana: number; ultimo_latido: string }[] }
      mi_cambio_envio: { Args: { p_envio: string | null }; Returns: { cambio: Json; estado: string; en: string; nota: string; modificable: boolean; con_camion: boolean }[] }
      mi_cobertura_credito: { Args: Record<PropertyKey, never>; Returns: string }
      mi_contraoferta: { Args: { p_envio: string | null }; Returns: { permitida: boolean; propuesta: number; propuesta_en: string; precio_inicial: number }[] }
      mi_empresa: { Args: Record<PropertyKey, never>; Returns: { id: string; codigo: string; razon_social: string; nombre_comercial: string; cif: string; direccion: string; poblacion: string; codigo_postal: string; provincia: string; pais_codigo_iso: string; plazo_pago_dias: number; discrecion_comercial: boolean; tipo_camion_defecto: Database["public"]["Enums"]["tipo_camion"]; forma_carga_defecto: Database["public"]["Enums"]["forma_carga"]; requiere_plataforma_elevadora_defecto: boolean; estado: Database["public"]["Enums"]["estado_cuenta"]; iva_pct: number }[] }
      mi_empresa_transportista: { Args: Record<PropertyKey, never>; Returns: { id: string; codigo: string; razon_social: string; nombre_comercial: string; cif: string; direccion: string; poblacion: string; codigo_postal: string; provincia: string; pais_codigo_iso: string; plazo_pago_dias: number; nima: string; bolsa: string; codigo_bolsa: string; seguro_cmr_compania: string; seguro_cmr_poliza: string; seguro_cmr_vence: string }[] }
      mi_enlace_cmr: { Args: { p_envio: string | null }; Returns: string }
      mi_valoracion_envio: { Args: { p_envio: string | null }; Returns: { puede: boolean; nota: number; comentario: string; valorado_en: string; editable: boolean }[] }
      mis_avisos: { Args: { p_cliente?: string | null; p_transportista?: string | null }; Returns: { id: string; tipo: string; nivel: string; titulo: string; texto: string; enlace: string; creado_en: string; nuevo: boolean }[] }
      mis_envios: { Args: Record<PropertyKey, never>; Returns: { id: string; referencia_gx: string; referencia_cliente: string; estado: Database["public"]["Enums"]["estado_envio"]; estado_asignacion: Database["public"]["Enums"]["estado_asignacion"]; es_manual: boolean; operador_id: string; precio_acordado_operador: number; fecha_carga_desde: string; fecha_carga_hasta: string; fecha_carga_real: string; fecha_entrega_estimada: string; descripcion_mercancia: string; toneladas: number; metros_lineales: number; tipo_carga: Database["public"]["Enums"]["tipo_carga"]; paletizado: boolean; carga_lateral: boolean; carga_techo: boolean; carga_trasera: boolean; requiere_plataforma_elevadora: boolean; requiere_nima: boolean; adr: boolean; codigo_postal_origen: string; poblacion_origen: string; codigo_postal_destino: string; poblacion_destino: string; num_paradas: number; importe_cliente: number; moneda: string; iva_pct: number; anotaciones_cliente: string; discrecion_comercial: boolean; matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string; creado_en: string; modificado_en: string; confirmado_en: string; asignado_en: string; cargado_en: string; entregado_en: string; cancelado_en: string; paradas: Json; estado_solicitud: string; precio_caduca_en: string; condiciones_aceptadas_en: string }[] }
      mis_envios_por_ids: { Args: { p_ids: string[] | null }; Returns: { id: string; referencia_gx: string; referencia_cliente: string; estado: Database["public"]["Enums"]["estado_envio"]; estado_asignacion: Database["public"]["Enums"]["estado_asignacion"]; es_manual: boolean; operador_id: string; precio_acordado_operador: number; fecha_carga_desde: string; fecha_carga_hasta: string; fecha_carga_real: string; fecha_entrega_estimada: string; descripcion_mercancia: string; toneladas: number; metros_lineales: number; tipo_carga: Database["public"]["Enums"]["tipo_carga"]; paletizado: boolean; carga_lateral: boolean; carga_techo: boolean; carga_trasera: boolean; requiere_plataforma_elevadora: boolean; requiere_nima: boolean; adr: boolean; codigo_postal_origen: string; poblacion_origen: string; codigo_postal_destino: string; poblacion_destino: string; num_paradas: number; importe_cliente: number; moneda: string; iva_pct: number; anotaciones_cliente: string; discrecion_comercial: boolean; matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string; creado_en: string; modificado_en: string; confirmado_en: string; asignado_en: string; cargado_en: string; entregado_en: string; cancelado_en: string; paradas: Json; estado_solicitud: string; precio_caduca_en: string; condiciones_aceptadas_en: string }[] }
      mis_hitos: { Args: { p_envio: string | null }; Returns: { id: number; hito: Database["public"]["Enums"]["tipo_hito"]; cuando: string }[] }
      mis_ofertas: { Args: Record<PropertyKey, never>; Returns: { id: string; envio_id: string; referencia_gx: string; token: string; canal: string; precio_ofertado: number; precio_minimo: number; precio_maximo: number; pronto_pago: boolean; caduca_en: string; fecha_carga_desde: string; fecha_carga_hasta: string; metros_lineales: number; toneladas: number; poblacion_origen: string; poblacion_destino: string }[] }
      mis_penalizaciones: { Args: Record<PropertyKey, never>; Returns: { id: string; codigo: string; envio_id: string; referencia_gx: string; tipo: string; descripcion: string; importe_cliente: number; estado: Database["public"]["Enums"]["estado_penalizacion"]; creado_en: string }[] }
      mis_penalizaciones_transportista: { Args: Record<PropertyKey, never>; Returns: { id: string; codigo: string; envio_id: string; referencia_gx: string; tipo: string; descripcion: string; importe_transportista: number; estado: Database["public"]["Enums"]["estado_penalizacion"]; creado_en: string }[] }
      mis_viajes: { Args: Record<PropertyKey, never>; Returns: { id: string; referencia_gx: string; estado: Database["public"]["Enums"]["estado_envio"]; fecha_carga_desde: string; fecha_carga_hasta: string; fecha_carga_real: string; fecha_entrega_estimada: string; descripcion_mercancia: string; toneladas: number; metros_lineales: number; tipo_carga: Database["public"]["Enums"]["tipo_carga"]; paletizado: boolean; carga_lateral: boolean; carga_techo: boolean; carga_trasera: boolean; requiere_plataforma_elevadora: boolean; requiere_nima: boolean; adr: boolean; importe_transportista: number; moneda: string; matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string; asignado_en: string; cargado_en: string; entregado_en: string; paradas: Json; discrecion_comercial: boolean; codigo_postal_origen: string; poblacion_origen: string; codigo_postal_destino: string; poblacion_destino: string; creado_en: string }[] }
      mis_viajes_por_ids: { Args: { p_ids: string[] | null }; Returns: { id: string; referencia_gx: string; estado: Database["public"]["Enums"]["estado_envio"]; fecha_carga_desde: string; fecha_carga_hasta: string; fecha_carga_real: string; fecha_entrega_estimada: string; descripcion_mercancia: string; toneladas: number; metros_lineales: number; tipo_carga: Database["public"]["Enums"]["tipo_carga"]; paletizado: boolean; carga_lateral: boolean; carga_techo: boolean; carga_trasera: boolean; requiere_plataforma_elevadora: boolean; requiere_nima: boolean; adr: boolean; importe_transportista: number; moneda: string; matricula_camion: string; matricula_remolque: string; conductor_nombre: string; conductor_telefono: string; asignado_en: string; cargado_en: string; entregado_en: string; paradas: Json; discrecion_comercial: boolean; codigo_postal_origen: string; poblacion_origen: string; codigo_postal_destino: string; poblacion_destino: string; creado_en: string }[] }
      negociacion_bloqueada: { Args: { p_envio: string | null; p_transportista?: string | null }; Returns: string }
      negociacion_publica: { Args: { p_token: string | null }; Returns: boolean }
      normalizar_cp: { Args: { p: string | null }; Returns: string }
      normalizar_id_fiscal: { Args: { p: string | null }; Returns: string }
      normalizar_matricula: { Args: { p: string | null }; Returns: string }
      oferta_de_token: { Args: { p_token: string | null }; Returns: { envio_id: string; oferta_id: string; oferta_activa: boolean } }
      oferta_publica: { Args: { p_token: string | null }; Returns: Json }
      ofertar_envio: { Args: { p_envio: string | null; p_transportista: string | null; p_canal: string | null; p_precio: number | null; p_banda_pct?: number | null; p_pronto_pago?: boolean | null }; Returns: string }
      orden_carga_json: { Args: { p_envio: string | null }; Returns: Json }
      otras_cargas_publicas: { Args: { p_token: string | null }; Returns: Json }
      pago_envio_importes: { Args: { p_envio: string | null }; Returns: { base: number; iva: number; total: number }[] }
      pago_envio_stripe: { Args: { p_envio: string | null; p_pago: string | null; p_centimos: number | null }; Returns: Json }
      pago_limite: { Args: { p_desde: string | null }; Returns: string }
      pago_previo_motivo: { Args: { p_cliente: string | null; p_envio: string | null }; Returns: string }
      pagos_envio: { Args: { p_envio?: string | null }; Returns: { envio_id: string; referencia_gx: string; referencia_cliente: string; estado: string; estado_pago_previo: string; pago_motivo: string; pago_metodo: string; pagado_en: string; base: number; iva: number; total: number; pago_limite: string; precio_provisional: boolean }[] }
      pais_nombre: { Args: { p: string | null }; Returns: string }
      paradas_json: { Args: { p_envio: string | null }; Returns: Json }
      paradas_viaje_json: { Args: { p_envio: string | null }; Returns: Json }
      parametro: { Args: { p_clave: string | null }; Returns: Json }
      parametro_num: { Args: { p_clave: string | null; p_defecto: number | null }; Returns: number }
      patrones_busqueda: { Args: { p_q: string | null }; Returns: string[] }
      pausar_seguimiento_envio: { Args: { p_envio: string | null; p_pausar: boolean | null }; Returns: Json }
      pedir_cambio_envio: { Args: { p_envio: string | null; p_desde?: string | null; p_hasta?: string | null; p_detalle?: string | null }; Returns: Json }
      pin_aleatorio: { Args: { p_cifras: number | null }; Returns: string }
      poner_datos_cmr: { Args: { p_envio: string | null; p_bultos: number | null; p_embalaje: string | null; p_volumen: number | null }; Returns: undefined }
      poner_horario_por_defecto: { Args: { p_sitio: string | null }; Returns: undefined }
      precio_por_revisar: { Args: { p: string | null }; Returns: boolean }
      preparar_pines_envio: { Args: { p_envio: string | null }; Returns: number }
      primera_carga_posible: { Args: { p_envio: string | null }; Returns: string }
      primera_fecha_carga: { Args: { p_fija: boolean | null; p_instante?: string | null; p_al_pagar?: boolean | null }; Returns: string }
      pronto_pago_descuento: { Args: { p_importe: number | null }; Returns: number }
      pronto_pago_estado: { Args: Record<PropertyKey, never>; Returns: Json }
      pronto_pago_estado_interno: { Args: Record<PropertyKey, never>; Returns: Json }
      proponer_precio_solicitud: { Args: { p_envio: string | null; p_importe: number | null; p_importe_transportista?: number | null }; Returns: undefined }
      puede_ver_envio: { Args: { p_envio: string | null }; Returns: boolean }
      purgar_datos_personales: { Args: Record<PropertyKey, never>; Returns: Json }
      quitar_transportista: { Args: { p_envio: string | null }; Returns: Json }
      regenerar_pin_parada: { Args: { p_parada: string | null }; Returns: string }
      registrar_cambio_email: { Args: { p_usuario: string | null; p_antes: string | null; p_despues: string | null }; Returns: undefined }
      registrar_hito: { Args: { p_envio: string | null; p_hito: Database["public"]["Enums"]["tipo_hito"] | null; p_parada?: string | null; p_oferta?: string | null; p_datos?: Json | null; p_origen?: string | null }; Returns: undefined }
      reglas_precio_envio: { Args: Record<PropertyKey, never>; Returns: Json }
      renumerar_paradas: { Args: { p_envio: string | null }; Returns: undefined }
      reservar_envio_publico: { Args: { p_token: string | null; p_ip?: string | null; p_navegador?: string | null }; Returns: Json }
      reservas_cmr_publico: { Args: { p_token: string | null }; Returns: { rol: string; parada_id: string; texto: string; creado_en: string }[] }
      resolver_cambio_envio: { Args: { p_envio: string | null; p_acepta: boolean | null; p_nota?: string | null }; Returns: Json }
      resolver_contraoferta: { Args: { p_reserva: string | null; p_acepta: boolean | null }; Returns: Json }
      resolver_contraoferta_cliente: { Args: { p_envio: string | null; p_acepta: boolean | null }; Returns: Json }
      responder_precio_solicitud: { Args: { p_envio: string | null; p_acepta: boolean | null; p_precio_visto?: number | null }; Returns: string }
      restriccion_punto: { Args: { p_pais: string | null; p_cp: string | null; p_tipo_parada?: string | null; p_tipo_carga?: Database["public"]["Enums"]["tipo_carga"] | null; p_fecha?: string | null }; Returns: { nombre: string; efecto: string; mensaje: string }[] }
      restricciones_ruta: { Args: { p_envio: string | null }; Returns: { orden: number; punto: string; tipo: string; nombre: string; efecto: string; mensaje: string }[] }
      revisar_precio_envio: { Args: { p_envio: string | null; p_nuevo: number | null }; Returns: Json }
      revisar_precios_programados: { Args: Record<PropertyKey, never>; Returns: number }
      revocar_oferta: { Args: { p_oferta: string | null }; Returns: Json }
      riesgos_clientes: { Args: Record<PropertyKey, never>; Returns: { cliente_id: string; nombre: string; cif: string; riesgo_cesce: number; plazo_cesce: number; riesgo_manual: number; riesgo_efectivo: number; manda: string; envios: number; asumido_base: number; asumido: number; disponible: number; ultimo_envio: string }[] }
      riesgos_pagina: { Args: { p_q?: string | null; p_filtro?: string | null; p_pagina?: number | null; p_por_pagina?: number | null }; Returns: { cliente_id: string; nombre: string; cif: string; riesgo_cesce: number; plazo_cesce: number; riesgo_manual: number; riesgo_efectivo: number; manda: string; envios: number; asumido_base: number; asumido: number; disponible: number; ultimo_envio: string; total: number }[] }
      riesgos_totales: { Args: Record<PropertyKey, never>; Returns: { limite: number; asumido: number; pasados: number }[] }
      seguimiento_apertura: { Args: { p_sitio: string | null; p_t: string | null }; Returns: string }
      seguimiento_aplicar: { Args: { p_envio: string | null; p_a_mano?: boolean | null }; Returns: number }
      seguimiento_calcular: { Args: { p_envio: string | null }; Returns: { paso: number; estado: Database["public"]["Enums"]["estado_envio"]; parada: number; parada_id: string; tipo_parada: string; poblacion: string; hora: string; km: number; km_estimado: boolean }[] }
      seguimiento_conducir: { Args: { t: string | null; jornada: string | null; tramo: number | null; dia: number | null; p_horas: number | null; p_inicio?: string | null }; Returns: { t: string; jornada: string; tramo: number; dia: number } }
      seguimiento_envios: { Args: { p_ids: string[] | null }; Returns: { envio_id: string; parada_actual: number; tipo_parada: string; paradas: number; primera_carga_en: string; asignando: boolean; fecha_carga_prevista: string; automatico: boolean }[] }
      seguimiento_paso: { Args: { p_estado: Database["public"]["Enums"]["estado_envio"] | null; p_parada: number | null; p_paradas: number | null }; Returns: number }
      sitio_principal: { Args: { p_cliente: string | null }; Returns: string }
      sitio_texto_busqueda: { Args: { s: Database["public"]["Tables"]["sitios"]["Row"] | null }; Returns: string }
      sitios_pagina: { Args: { p_q?: string | null; p_cliente?: string | null; p_pagina?: number | null; p_por_pagina?: number | null }; Returns: { id: string; total: number }[] }
      sn: { Args: { p: boolean | null }; Returns: string }
      sumar_dias_habiles: { Args: { p_fecha: string | null; p_n: number | null }; Returns: string }
      tarifa_almacen: { Args: { p_almacen: string | null }; Returns: { semana: number; reparto: number }[] }
      tel_dynamo: { Args: Record<PropertyKey, never>; Returns: string }
      transportista_del_usuario: { Args: Record<PropertyKey, never>; Returns: string }
      transportista_texto_busqueda: { Args: { t: Database["public"]["Tables"]["transportistas"]["Row"] | null }; Returns: string }
      transportistas_flota: { Args: { p_ids: string[] | null }; Returns: { transportista_id: string; tractoras: number; rigidos: number; remolques: number; adr: boolean; matriculas: string[] }[] }
      transportistas_pagina: { Args: { p_q?: string | null; p_estado?: string | null; p_adr?: string | null; p_pagina?: number | null; p_por_pagina?: number | null }; Returns: { id: string; total: number }[] }
      unaccent_simple: { Args: { t: string | null }; Returns: string }
      uso_envios_usuarios: { Args: Record<PropertyKey, never>; Returns: { usuario_id: string; envios: number; cancelados: number; cancelados_ult10: number }[] }
      usuarios_conteos: { Args: Record<PropertyKey, never>; Returns: { total: number; activa: number; pendiente: number; suspendida: number; suspendida_auto: number; invitacion: number }[] }
      usuarios_pagina: { Args: { p_q?: string | null; p_rol?: string | null; p_estado?: string | null; p_pagina?: number | null; p_por_pagina?: number | null }; Returns: { id: string; empresa: string; total: number }[] }
      validar_pin_manual: { Args: { p_parada: string | null; p_nota: string | null }; Returns: Json }
      validar_pin_parada: { Args: { p_parada: string | null; p_pin: string | null; p_ip?: string | null; p_navegador?: string | null }; Returns: Json }
      validar_restricciones_envio: { Args: { p_envio: string | null }; Returns: undefined }
      validar_ruta_envio: { Args: { p_envio: string | null }; Returns: undefined }
      valorar_mi_envio: { Args: { p_envio: string | null; p_nota: number | null; p_comentario?: string | null }; Returns: undefined }
      ve_todo: { Args: Record<PropertyKey, never>; Returns: boolean }
      ventana_texto: { Args: { p_desde: string | null; p_hasta: string | null }; Returns: string }
      ver_revision_precio_envio: { Args: { p_envio: string | null }; Returns: { precio_calculado_en: string; estado_revision_precio: string; fecha_revision_precio: string; importe_revision_anterior: number; importe_revision_nuevo: number; revision_precio_en: string; margen_pct: number }[] }
      verano_sitios_fechas: { Args: Record<PropertyKey, never>; Returns: Json }
    }
    Enums: {
      estado_almacenamiento: "pendiente_confirmar" | "confirmado" | "en_almacen" | "finalizado" | "cancelado"
      estado_asignacion: "sin_asignar" | "ofertada" | "reservada" | "confirmada"
      estado_cuenta: "activa" | "suspendida" | "pendiente_verificacion"
      estado_envio: "borrador" | "programado" | "hacia_la_carga" | "cargando" | "en_ruta" | "entregado" | "cancelado"
      estado_incidencia: "abierto" | "en_curso" | "resuelto" | "cancelado"
      estado_operativo_transportista: "activo" | "no_ofertar" | "suspendido"
      estado_penalizacion: "pendiente_confirmar" | "confirmada" | "cancelada"
      forma_carga: "paletizada_lateral" | "no_paletizada_lateral" | "no_paletizada_techo"
      funcion_contacto: "trafico" | "contabilidad" | "conductor" | "general"
      prioridad_incidencia: "baja" | "media" | "alta" | "critica"
      rol_usuario: "admin" | "empleado" | "cliente" | "transportista" | "admin_lectura" | "empleado_lectura"
      tipo_camion: "trailer_tauliner" | "rigido_plataforma"
      tipo_carga: "completa" | "grupaje"
      tipo_concepto: "porte" | "almacenaje" | "paralizacion" | "penalizacion" | "otros"
      tipo_hito: "creado" | "confirmado" | "publicado_bolsa" | "transportista_asignado" | "transportista_quitado" | "matricula_asignada" | "hacia_la_carga" | "cargando" | "descargando" | "cargado" | "descargado" | "etapa_corregida" | "entregado" | "cancelado" | "cancelacion_deshecha" | "ofertado" | "enlace_abierto" | "reservado" | "reserva_caducada" | "reserva_liberada" | "contraoferta_propuesta" | "contraoferta_resuelta" | "orden_carga_enviada" | "cmr_firmado" | "pin_enviado" | "pin_validado" | "pin_validado_manual" | "pin_fuera_de_orden" | "pin_bloqueado" | "incidencia" | "ruta_cambiada" | "fecha_carga_movida"
      tipo_sitio: "almacen_nave" | "obra_zona_amplia" | "obra_zona_urbana" | "finca"
      tipo_vehiculo: "tractora" | "remolque" | "rigido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type T = Database["public"]
export type Tabla<N extends keyof T["Tables"]> = T["Tables"][N]["Row"]
export type Vista<N extends keyof T["Views"]> = T["Views"][N]["Row"]
export type Enum<N extends keyof T["Enums"]> = T["Enums"][N]
export type Funcion<N extends keyof T["Functions"]> = T["Functions"][N]["Returns"]
export type TablaInsert<N extends keyof T["Tables"]> = T["Tables"][N]["Insert"]
export type TablaUpdate<N extends keyof T["Tables"]> = T["Tables"][N]["Update"]
