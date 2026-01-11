/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ['@exam-platform/shared'],
    
    // Enable standalone output for Docker deployment
    output: 'standalone',
    
    // Rewrites for local development (in production, nginx handles routing)
    async rewrites() {
        // In production, API routing is handled by nginx reverse proxy
        if (process.env.NODE_ENV === 'production') {
            return [];
        }
        
        // Development: proxy API requests to local API server
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        return [
            {
                source: '/api/:path*',
                destination: `${apiUrl}/api/:path*`,
            },
            {
                source: '/socket.io/:path*',
                destination: `${apiUrl}/socket.io/:path*`,
            },
        ];
    },
    
    // Optimize images
    images: {
        unoptimized: true, // For standalone deployment
    },
};

module.exports = nextConfig;
