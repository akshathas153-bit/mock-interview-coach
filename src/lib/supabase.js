import { createSmartClient } from 'supadns-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// createSmartClient automatically handles DNS-over-HTTPS fallback 
// to bypass ISP blocks in India.
export const supabase = createSmartClient(supabaseUrl, supabaseAnonKey);