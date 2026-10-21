/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/supabase-proxy/:path*',
        destination: 'https://kotjmhoelfpzqicvbpby.supabase.co/:path*',
      },
    ];
  },
};

export default nextConfig;