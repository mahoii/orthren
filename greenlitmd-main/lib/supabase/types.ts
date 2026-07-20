export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      waitlist_signups: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          name: string | null;
          practice_name: string | null;
          unsubscribed: boolean | null;
          email_stage: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          phone?: string | null;
          name?: string | null;
          practice_name?: string | null;
          unsubscribed?: boolean | null;
          email_stage?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          phone?: string | null;
          name?: string | null;
          practice_name?: string | null;
          unsubscribed?: boolean | null;
          email_stage?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          owner_user_id: string;
          stripe_customer_id: string | null;
          last_acknowledged_surgeon_count: number;
          last_acknowledged_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_user_id: string;
          stripe_customer_id?: string | null;
          last_acknowledged_surgeon_count?: number;
          last_acknowledged_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_user_id?: string;
          stripe_customer_id?: string | null;
          last_acknowledged_surgeon_count?: number;
          last_acknowledged_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: "owner" | "coordinator" | "front_desk";
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role: "owner" | "coordinator" | "front_desk";
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string;
          role?: "owner" | "coordinator" | "front_desk";
          created_at?: string;
        };
        Relationships: [];
      };
      surgeons: {
        Row: {
          id: string;
          org_id: string;
          full_name: string;
          npi: string | null;
          active: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          full_name: string;
          npi?: string | null;
          active?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          full_name?: string;
          npi?: string | null;
          active?: boolean | null;
          created_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: "owner" | "coordinator" | "front_desk";
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role: "owner" | "coordinator" | "front_desk";
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: "owner" | "coordinator" | "front_desk";
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      pa_cases: {
        Row: {
          id: string;
          org_id: string;
          surgeon_id: string;
          created_by_user_id: string;
          cpt_code: string;
          payer: string | null;
          pa_strength: number | null;
          patient_name_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          surgeon_id: string;
          created_by_user_id: string;
          cpt_code: string;
          payer?: string | null;
          pa_strength?: number | null;
          patient_name_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          surgeon_id?: string;
          created_by_user_id?: string;
          cpt_code?: string;
          payer?: string | null;
          pa_strength?: number | null;
          patient_name_hash?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type WaitlistSignup = Database["public"]["Tables"]["waitlist_signups"]["Row"];
export type WaitlistSignupInsert = Database["public"]["Tables"]["waitlist_signups"]["Insert"];
export type WaitlistSignupUpdate = Database["public"]["Tables"]["waitlist_signups"]["Update"];

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type Membership = Database["public"]["Tables"]["memberships"]["Row"];
export type MembershipRole = Membership["role"];
export type Surgeon = Database["public"]["Tables"]["surgeons"]["Row"];
export type Invitation = Database["public"]["Tables"]["invitations"]["Row"];
export type PaCase = Database["public"]["Tables"]["pa_cases"]["Row"];
export type PaCaseInsert = Database["public"]["Tables"]["pa_cases"]["Insert"];
