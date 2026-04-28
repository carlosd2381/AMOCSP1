export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      brands: {
        Row: {
          id: string
          name: string
          slug: string
          theme_config: Json
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          theme_config?: Json
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          theme_config?: Json
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_catalog_services: {
        Row: {
          id: string
          brand_id: string
          name: string
          name_es: string | null
          description: string
          description_es: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          brand_id: string
          name: string
          name_es?: string | null
          description?: string
          description_es?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          name?: string
          name_es?: string | null
          description?: string
          description_es?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_service_pricing_tiers: {
        Row: {
          id: string
          brand_id: string
          service_id: string
          catalog_key: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          hours: number
          cost: number
          price: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          brand_id: string
          service_id: string
          catalog_key?: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          hours: number
          cost?: number
          price?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          service_id?: string
          catalog_key?: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          hours?: number
          cost?: number
          price?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_package_presets: {
        Row: {
          id: string
          brand_id: string
          catalog_key: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          name: string
          description: string
          is_active: boolean
          package_hourly_price: number | null
          hourly_price_by_hour: Json | null
          components: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          brand_id: string
          catalog_key?: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          name: string
          description?: string
          is_active?: boolean
          package_hourly_price?: number | null
          hourly_price_by_hour?: Json | null
          components?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          catalog_key?: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          name?: string
          description?: string
          is_active?: boolean
          package_hourly_price?: number | null
          hourly_price_by_hour?: Json | null
          components?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_pricing_input_profiles: {
        Row: {
          id: string
          brand_id: string
          catalog_key: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          admin_percent: number
          sales_percent: number
          planner_percent: number
          profit_percent: number
          payment_fee_percent: number
          tax_percent: number
          include_tax_in_sell_price: boolean
          updated_at: string
        }
        Insert: {
          id: string
          brand_id: string
          catalog_key?: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          admin_percent?: number
          sales_percent?: number
          planner_percent?: number
          profit_percent?: number
          payment_fee_percent?: number
          tax_percent?: number
          include_tax_in_sell_price?: boolean
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          catalog_key?: 'INT_USD_ENG' | 'MEX_MXN_ESP'
          admin_percent?: number
          sales_percent?: number
          planner_percent?: number
          profit_percent?: number
          payment_fee_percent?: number
          tax_percent?: number
          include_tax_in_sell_price?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          role: string
          avatar_url: string | null
          brand_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          role?: string
          avatar_url?: string | null
          brand_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          role?: string
          avatar_url?: string | null
          brand_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          brand_id: string
          name: string
          email: string
          phone: string | null
          type: 'couple' | 'corporate'
          address: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          name: string
          email: string
          phone?: string | null
          type: 'couple' | 'corporate'
          address?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          name?: string
          email?: string
          phone?: string | null
          type?: 'couple' | 'corporate'
          address?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          client_id: string
          brand_id: string
          status: 'new' | 'contacted' | 'proposal' | 'contract' | 'booked' | 'lost'
          event_date: string | null
          inquiry_notes: string | null
          source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          client_id: string
          brand_id: string
          status?: 'new' | 'contacted' | 'proposal' | 'contract' | 'booked' | 'lost'
          event_date?: string | null
          inquiry_notes?: string | null
          source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          brand_id?: string
          status?: 'new' | 'contacted' | 'proposal' | 'contract' | 'booked' | 'lost'
          event_date?: string | null
          inquiry_notes?: string | null
          source?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      address_book_contacts: {
        Row: {
          id: string
          brand_id: string
          display_name: string
          email: string | null
          phone: string | null
          company: string | null
          job_title: string | null
          notes: string | null
          tags: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          display_name: string
          email?: string | null
          phone?: string | null
          company?: string | null
          job_title?: string | null
          notes?: string | null
          tags?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          display_name?: string
          email?: string | null
          phone?: string | null
          company?: string | null
          job_title?: string | null
          notes?: string | null
          tags?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      venue_profiles: {
        Row: {
          id: string
          brand_id: string
          name: string
          resort_group: string | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          state_province: string | null
          postal_code: string | null
          country: string | null
          phone: string | null
          email: string | null
          website: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          name: string
          resort_group?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          state_province?: string | null
          postal_code?: string | null
          country?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          name?: string
          resort_group?: string | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          state_province?: string | null
          postal_code?: string | null
          country?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_venue_assignments: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          venue_profile_id: string
          location_kind: 'ceremony' | 'reception' | 'bridal_session' | 'other'
          location_label: string | null
          sort_order: number
          status: 'shortlisted' | 'reserved' | 'contracted' | 'coordinator_pending' | 'coordinator_assigned'
          reserved_on: string | null
          coordinator_eta_weeks: number | null
          coordinator_assigned_on: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          venue_profile_id: string
          location_kind?: 'ceremony' | 'reception' | 'bridal_session' | 'other'
          location_label?: string | null
          sort_order?: number
          status?: 'shortlisted' | 'reserved' | 'contracted' | 'coordinator_pending' | 'coordinator_assigned'
          reserved_on?: string | null
          coordinator_eta_weeks?: number | null
          coordinator_assigned_on?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          venue_profile_id?: string
          location_kind?: 'ceremony' | 'reception' | 'bridal_session' | 'other'
          location_label?: string | null
          sort_order?: number
          status?: 'shortlisted' | 'reserved' | 'contracted' | 'coordinator_pending' | 'coordinator_assigned'
          reserved_on?: string | null
          coordinator_eta_weeks?: number | null
          coordinator_assigned_on?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      venue_team_contacts: {
        Row: {
          id: string
          venue_profile_id: string
          contact_id: string
          role: 'planner' | 'coordinator'
          sort_order: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          venue_profile_id: string
          contact_id: string
          role: 'planner' | 'coordinator'
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          venue_profile_id?: string
          contact_id?: string
          role?: 'planner' | 'coordinator'
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_contacts: {
        Row: {
          id: string
          lead_id: string
          event_id: string | null
          brand_id: string
          contact_id: string
          role: 'bride' | 'groom' | 'parent' | 'venue_coordinator' | 'wedding_planner' | 'vendor' | 'other' | 'primary_client' | 'planner'
          source: 'manual' | 'import' | 'portal'
          sort_order: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          event_id?: string | null
          brand_id: string
          contact_id: string
          role: 'bride' | 'groom' | 'parent' | 'venue_coordinator' | 'wedding_planner' | 'vendor' | 'other' | 'primary_client' | 'planner'
          source?: 'manual' | 'import' | 'portal'
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          event_id?: string | null
          brand_id?: string
          contact_id?: string
          role?: 'bride' | 'groom' | 'parent' | 'venue_coordinator' | 'wedding_planner' | 'vendor' | 'other' | 'primary_client' | 'planner'
          source?: 'manual' | 'import' | 'portal'
          sort_order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_tasks: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          title: string
          details: string | null
          due_at: string | null
          status: 'open' | 'in_progress' | 'done'
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          title: string
          details?: string | null
          due_at?: string | null
          status?: 'open' | 'in_progress' | 'done'
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          title?: string
          details?: string | null
          due_at?: string | null
          status?: 'open' | 'in_progress' | 'done'
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_internal_notes: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          body: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          body: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          body?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_payables: {
        Row: {
          id: string
          lead_id: string
          event_id: string | null
          brand_id: string
          title: string
          category: string | null
          amount: number
          currency: string
          due_date: string | null
          paid_at: string | null
          status: 'planned' | 'scheduled' | 'paid' | 'cancelled'
          source: 'manual' | 'package_component' | 'commission' | 'adjustment'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          event_id?: string | null
          brand_id: string
          title: string
          category?: string | null
          amount?: number
          currency?: string
          due_date?: string | null
          paid_at?: string | null
          status?: 'planned' | 'scheduled' | 'paid' | 'cancelled'
          source?: 'manual' | 'package_component' | 'commission' | 'adjustment'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          event_id?: string | null
          brand_id?: string
          title?: string
          category?: string | null
          amount?: number
          currency?: string
          due_date?: string | null
          paid_at?: string | null
          status?: 'planned' | 'scheduled' | 'paid' | 'cancelled'
          source?: 'manual' | 'package_component' | 'commission' | 'adjustment'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_messages: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          channel: 'email' | 'whatsapp' | 'instagram' | 'phone' | 'internal'
          direction: 'inbound' | 'outbound'
          subject: string | null
          body: string
          occurred_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          channel: 'email' | 'whatsapp' | 'instagram' | 'phone' | 'internal'
          direction: 'inbound' | 'outbound'
          subject?: string | null
          body: string
          occurred_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          channel?: 'email' | 'whatsapp' | 'instagram' | 'phone' | 'internal'
          direction?: 'inbound' | 'outbound'
          subject?: string | null
          body?: string
          occurred_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      lead_files: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          category: 'contracts' | 'timelines' | 'shot_lists'
          title: string
          file_url: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          category: 'contracts' | 'timelines' | 'shot_lists'
          title: string
          file_url: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          category?: 'contracts' | 'timelines' | 'shot_lists'
          title?: string
          file_url?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          title: string
          start_time: string | null
          end_time: string | null
          location: Json
          shoot_type: 'photo' | 'video' | 'drone' | 'hybrid'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          title: string
          start_time?: string | null
          end_time?: string | null
          location?: Json
          shoot_type: 'photo' | 'video' | 'drone' | 'hybrid'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          title?: string
          start_time?: string | null
          end_time?: string | null
          location?: Json
          shoot_type?: 'photo' | 'video' | 'drone' | 'hybrid'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      questionnaires: {
        Row: {
          id: string
          event_id: string
          brand_id: string
          client_email: string
          answers: Json
          status: 'draft' | 'submitted'
          submitted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          brand_id: string
          client_email: string
          answers?: Json
          status?: 'draft' | 'submitted'
          submitted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          brand_id?: string
          client_email?: string
          answers?: Json
          status?: 'draft' | 'submitted'
          submitted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          id: string
          lead_id: string
          brand_id: string
          line_items: Json
          subtotal: number
          taxes: Json
          total_amount: number
          status: 'draft' | 'sent' | 'accepted' | 'rejected'
          valid_until: string | null
          currency: string
          payment_schedule: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          brand_id: string
          line_items?: Json
          subtotal?: number
          taxes?: Json
          total_amount?: number
          status?: 'draft' | 'sent' | 'accepted' | 'rejected'
          valid_until?: string | null
          currency?: string
          payment_schedule?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          brand_id?: string
          line_items?: Json
          subtotal?: number
          taxes?: Json
          total_amount?: number
          status?: 'draft' | 'sent' | 'accepted' | 'rejected'
          valid_until?: string | null
          currency?: string
          payment_schedule?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          id: string
          event_id: string
          brand_id: string
          body_html: string
          signed_at: string | null
          signature_img: string | null
          pdf_url: string | null
          variables: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          brand_id: string
          body_html: string
          signed_at?: string | null
          signature_img?: string | null
          pdf_url?: string | null
          variables?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          brand_id?: string
          body_html?: string
          signed_at?: string | null
          signature_img?: string | null
          pdf_url?: string | null
          variables?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          id: string
          event_id: string
          proposal_id: string | null
          brand_id: string
          invoice_number: string
          stripe_pi_id: string | null
          line_items: Json
          subtotal: number
          taxes: Json
          total_amount: number
          amount_due: number
          status: 'unpaid' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid'
          due_date: string | null
          issued_at: string | null
          currency: string
          payments: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          proposal_id?: string | null
          brand_id: string
          invoice_number: string
          stripe_pi_id?: string | null
          line_items?: Json
          subtotal?: number
          taxes?: Json
          total_amount?: number
          amount_due?: number
          status?: 'unpaid' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid'
          due_date?: string | null
          issued_at?: string | null
          currency?: string
          payments?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          proposal_id?: string | null
          brand_id?: string
          invoice_number?: string
          stripe_pi_id?: string | null
          line_items?: Json
          subtotal?: number
          taxes?: Json
          total_amount?: number
          amount_due?: number
          status?: 'unpaid' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid'
          due_date?: string | null
          issued_at?: string | null
          currency?: string
          payments?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      galleries: {
        Row: {
          id: string
          event_id: string
          brand_id: string
          title: string
          password: string | null
          cover_img: string | null
          status: 'draft' | 'published' | 'archived'
          sharing_settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          brand_id: string
          title: string
          password?: string | null
          cover_img?: string | null
          status?: 'draft' | 'published' | 'archived'
          sharing_settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          brand_id?: string
          title?: string
          password?: string | null
          cover_img?: string | null
          status?: 'draft' | 'published' | 'archived'
          sharing_settings?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          event_id: string
          brand_id: string
          client_email: string
          rating_overall: number | null
          rating_staff: number | null
          rating_media: number | null
          comments: string | null
          testimonial: string | null
          status: 'draft' | 'submitted' | 'published'
          submitted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          brand_id: string
          client_email: string
          rating_overall?: number | null
          rating_staff?: number | null
          rating_media?: number | null
          comments?: string | null
          testimonial?: string | null
          status?: 'draft' | 'submitted' | 'published'
          submitted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          brand_id?: string
          client_email?: string
          rating_overall?: number | null
          rating_staff?: number | null
          rating_media?: number | null
          comments?: string | null
          testimonial?: string | null
          status?: 'draft' | 'submitted' | 'published'
          submitted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_items: {
        Row: {
          id: string
          gallery_id: string
          brand_id: string
          url: string
          type: 'image' | 'video'
          metadata: Json
          is_favorite: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          gallery_id: string
          brand_id: string
          url: string
          type: 'image' | 'video'
          metadata?: Json
          is_favorite?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          gallery_id?: string
          brand_id?: string
          url?: string
          type?: 'image' | 'video'
          metadata?: Json
          is_favorite?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          id: string
          invoice_id: string
          brand_id: string
          provider: string
          provider_reference: string | null
          amount: number
          fee: number
          currency: string
          status: string
          is_withheld: boolean
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          brand_id: string
          provider: string
          provider_reference?: string | null
          amount: number
          fee?: number
          currency?: string
          status?: string
          is_withheld?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          brand_id?: string
          provider?: string
          provider_reference?: string | null
          amount?: number
          fee?: number
          currency?: string
          status?: string
          is_withheld?: boolean
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhooks_log: {
        Row: {
          id: string
          provider: string
          event_type: string
          status_code: number | null
          payload: Json
          processed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          provider: string
          event_type: string
          status_code?: number | null
          payload: Json
          processed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          provider?: string
          event_type?: string
          status_code?: number | null
          payload?: Json
          processed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          actor_id: string | null
          brand_id: string | null
          action: string
          table_name: string
          record_id: string | null
          changes: Json
          created_at: string
        }
        Insert: {
          id?: string
          actor_id?: string | null
          brand_id?: string | null
          action: string
          table_name: string
          record_id?: string | null
          changes?: Json
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string | null
          brand_id?: string | null
          action?: string
          table_name?: string
          record_id?: string | null
          changes?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
