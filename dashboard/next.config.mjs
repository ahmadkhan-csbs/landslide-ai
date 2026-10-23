/** @type {import('next').NextConfig} */
const backendUrl =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://landslide-ai-1.onrender.com'
    : 'http://127.0.0.1:8000');

const nextConfig = {
  allowedDevOrigins: ['discolor-bankroll-starlight.ngrok-free.dev'],
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
      {
        source: '/admin.html',
        destination: `${backendUrl}/admin.html`,
      },
      {
        source: '/admin.css',
        destination: `${backendUrl}/admin.css`,
      },
      {
        source: '/admin.js',
        destination: `${backendUrl}/admin.js`,
      },
      {
        source: '/admin/:path*',
        destination: `${backendUrl}/admin/:path*`,
      },
      {
        source: '/data-health',
        destination: `${backendUrl}/data-health`,
      },
    ];
  },
};
export default nextConfig;
