# ============================================
# Exam Platform - Makefile
# ============================================
# Convenience commands for development and deployment
#
# Usage: make <target>
# ============================================

.PHONY: help dev build start stop restart logs clean deploy backup ssl-init sync-challenges migrate

# Default target
help:
	@echo "Exam Platform - Available Commands"
	@echo "==================================="
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development servers"
	@echo "  make build        - Build all packages"
	@echo ""
	@echo "Production:"
	@echo "  make deploy       - Deploy to production"
	@echo "  make deploy-build - Deploy with fresh build"
	@echo "  make start        - Start production services"
	@echo "  make stop         - Stop production services"
	@echo "  make restart      - Restart production services"
	@echo "  make logs         - View production logs"
	@echo ""
	@echo "Database:"
	@echo "  make migrate      - Run database migrations"
	@echo "  make sync-challenges - Sync challenges to database"
	@echo "  make backup       - Backup database"
	@echo ""
	@echo "SSL:"
	@echo "  make ssl-init DOMAIN=example.com EMAIL=admin@example.com"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Clean Docker resources"
	@echo "  make status       - Show service status"

# ============================================
# Development
# ============================================

dev:
	npm run dev

build:
	npm run build

# ============================================
# Production - Docker Compose
# ============================================

COMPOSE_FILE=docker-compose.prod.yml
ENV_FILE=.env.production

start:
	docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d

stop:
	docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) down

restart:
	docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) restart

logs:
	docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) logs -f

status:
	docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) ps

deploy:
	./scripts/deploy.sh

deploy-build:
	./scripts/deploy.sh --build

deploy-full:
	./scripts/deploy.sh --build --migrate

# ============================================
# Database
# ============================================

migrate:
	docker-compose -f $(COMPOSE_FILE) --env-file $(ENV_FILE) exec api \
		npm run db:migrate --workspace=@exam-platform/database

sync-challenges:
	./scripts/sync-challenges.sh

backup:
	./scripts/backup.sh

# ============================================
# SSL
# ============================================

ssl-init:
ifndef DOMAIN
	$(error DOMAIN is required. Usage: make ssl-init DOMAIN=example.com EMAIL=admin@example.com)
endif
ifndef EMAIL
	$(error EMAIL is required. Usage: make ssl-init DOMAIN=example.com EMAIL=admin@example.com)
endif
	./scripts/ssl-init.sh $(DOMAIN) $(EMAIL)

# ============================================
# Maintenance
# ============================================

clean:
	docker system prune -f
	docker volume prune -f

clean-all:
	docker system prune -a -f --volumes

# Pull grading images
pull-grading-images:
	docker pull node:20-alpine
	docker pull python:3.11-slim
	docker pull golang:1.21-alpine
	docker pull rust:1.75-slim
	docker pull mcr.microsoft.com/playwright:v1.40.0-jammy


