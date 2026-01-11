#!/bin/sh
set -e

# Substitute environment variables in nginx config
envsubst '${DOMAIN}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Check if SSL certificates exist
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "SSL certificates not found. Starting nginx with HTTP only for initial setup..."
    
    # Create a temporary HTTP-only config for certificate generation
    cat > /etc/nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name _;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'Waiting for SSL certificate generation...';
            add_header Content-Type text/plain;
        }
    }
}
EOF
fi

exec "$@"


