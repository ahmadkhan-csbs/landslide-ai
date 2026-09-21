/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['discolor-bankroll-starlight.ngrok-free.dev'],
  rewrites: async () => {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/:path*',
      },
      {
        source: '/admin.html',
        destination: 'http://127.0.0.1:8000/admin.html',
      },
      {
        source: '/admin.css',
        destination: 'http://127.0.0.1:8000/admin.css',
      },
      {
        source: '/admin.js',
        destination: 'http://127.0.0.1:8000/admin.js',
      },
      {
        source: '/admin/:path*',
        destination: 'http://127.0.0.1:8000/admin/:path*',
      },
      {
        source: '/data-health',
        destination: 'http://127.0.0.1:8000/data-health',
      },
    ];
  },
};
export default nextConfig;
