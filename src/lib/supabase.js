import { createClient } from '@supabase/supabase-js';

// In the browser, use the relative proxy path to bypass ISP blocks.
// On the server, use the real URL.
const supabaseUrl = typeof window !== 'undefined' 
  ? `${window.location.origin}/supabase-proxy`
  : process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);