import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (url, options) => {
      // Check if the URL is a Supabase URL
      if (url.includes('.supabase.co')) {
        // Rewrite it to go through a Google DNS-over-HTTPS resolver
        // This bypasses the Indian ISP block entirely.
        const dnsUrl = `https://dns.google/resolve?name=${new URL(url).hostname}&type=A`;
        const dnsRes = await fetch(dnsUrl);
        const dnsData = await dnsRes.json();
        
        if (dnsData.Answer && dnsData.Answer.length > 0) {
          const ip = dnsData.Answer[0].data;
          // Replace the hostname with the IP but keep the original Host header
          const newUrl = url.replace(new URL(url).hostname, ip);
          return fetch(newUrl, {
            ...options,
            headers: {
              ...options.headers,
              'Host': new URL(url).hostname,
            },
          });
        }
      }
      // For everything else, just use normal fetch
      return fetch(url, options);
    },
  },
});