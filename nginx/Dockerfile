# ============================================
# Nginx with Certbot for SSL
# ============================================

FROM nginx:alpine

# Install certbot
RUN apk add --no-cache certbot certbot-nginx

# Create directories
RUN mkdir -p /var/www/certbot
RUN mkdir -p /etc/letsencrypt

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf.template

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]


