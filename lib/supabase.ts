import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export type WaitlistSignup = {
  id: number;
  email: string;
  phone: string | null;
  practice_name: string | null;
  created_at: string;
  email_stage: number;
};

export async function insertSignup(
  email: string,
  phone: string | null,
  practice_name: string | null
): Promise<{ data: WaitlistSignup | null; error: { code?: string; message: string } | null }> {
  const { data, error } = await supabase
    .from("waitlist_signups")
    .insert({ email, phone: phone || null, practice_name: practice_name || null, email_stage: 1 })
    .select()
    .single();

  return { data, error };
}

export async function getSignupCount(): Promise<number> {
  const { count } = await supabase
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true });

  return count ?? 0;
}

export async function getSignupPosition(email: string): Promise<number> {
  const { data } = await supabase
    .from("waitlist_signups")
    .select("id")
    .eq("email", email)
    .single();

  if (!data) return 0;

  const { count } = await supabase
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true })
    .lte("id", data.id);

  return count ?? 0;
}

export async function getAllSignups(): Promise<WaitlistSignup[]> {
  const { data } = await supabase
    .from("waitlist_signups")
    .select("*")
    .order("created_at", { ascending: true });

  return data ?? [];
}

export async function deleteSignupByEmail(email: string): Promise<void> {
  await supabase.from("waitlist_signups").delete().eq("email", email);
}

export async function updateEmailStage(email: string, stage: number): Promise<void> {
  await supabase.from("waitlist_signups").update({ email_stage: stage }).eq("email", email);
}
