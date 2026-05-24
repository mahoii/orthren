import { createServerClient } from "@supabase/ssr";
import type { Database, WaitlistSignup } from "./types";

// Future tables: users (id, email, practice_name, plan, created_at) and
// pa_records (id, user_id, patient_name_hash, cpt_code, payer, status, created_at).

export function createSupabaseServerClient() {
  return createServerClient<Database>(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // API route service-role access does not need browser auth cookies.
        }
      }
    }
  );
}

export async function insertSignup(
  email: string,
  name: string | null,
  practice_name: string | null
): Promise<{ data: WaitlistSignup | null; error: { code?: string; message: string } | null }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("waitlist_signups")
    .insert({ email, name: name || null, practice_name: practice_name || null, email_stage: 1 })
    .select()
    .single();

  return { data, error };
}

export async function getSignupCount(): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { count } = await supabase
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true });

  return count ?? 0;
}

export async function getSignupPosition(email: string): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("waitlist_signups")
    .select("created_at")
    .eq("email", email)
    .single();

  if (!data) return 0;

  const { count } = await supabase
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true })
    .lte("created_at", data.created_at);

  return count ?? 0;
}

export async function getAllSignups(): Promise<WaitlistSignup[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("waitlist_signups")
    .select("*")
    .neq("unsubscribed", true)
    .order("created_at", { ascending: true });

  return data ?? [];
}

export async function getSignupEmailsByStage(stage: number): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("waitlist_signups")
    .select("email")
    .eq("email_stage", stage)
    .neq("unsubscribed", true);

  return (data ?? []).map((signup) => signup.email);
}

export async function unsubscribeEmail(email: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.from("waitlist_signups").update({ unsubscribed: true }).eq("email", email);
}

export async function updateEmailStage(email: string, stage: number): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.from("waitlist_signups").update({ email_stage: stage }).eq("email", email);
}

export async function updateEmailStageForEmails(emails: string[], stage: number): Promise<void> {
  if (emails.length === 0) return;

  const supabase = createSupabaseServerClient();
  await supabase.from("waitlist_signups").update({ email_stage: stage }).in("email", emails);
}
