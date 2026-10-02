import { createClient, EmailOtpType, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

// Captured before createClient, which clears the auth params from the URL hash.
export const authRedirectParams = new URLSearchParams(window.location.hash.slice(1));

const EMAIL_LINK_TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'email_change', 'magiclink', 'invite'];
const searchParams = new URLSearchParams(window.location.search);
const linkType = searchParams.get('type');

// Links in our email templates point at the app itself with ?token_hash=...&type=...
export const emailLink =
  searchParams.get('token_hash') && EMAIL_LINK_TYPES.includes(linkType as EmailOtpType)
    ? { tokenHash: searchParams.get('token_hash') as string, type: linkType as EmailOtpType }
    : null;

if (emailLink) {
  window.history.replaceState(null, '', window.location.pathname);
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;
