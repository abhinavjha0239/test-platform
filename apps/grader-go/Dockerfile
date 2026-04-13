# ============================================
# Exam Platform Grader (Go) - Production Dockerfile
# ============================================

# ---- Build Stage ----
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build tools
RUN apk add --no-cache git

# Copy Go module files (go.sum may not exist yet)
COPY apps/grader-go/go.* ./apps/grader-go/

WORKDIR /app/apps/grader-go

# Download dependencies
RUN go mod download

# Copy source code
COPY apps/grader-go ./

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /grader ./cmd/grader

# ---- Runtime Stage ----
FROM alpine:3.20

# Docker CLI is required to spawn grading containers
RUN apk add --no-cache ca-certificates docker-cli

WORKDIR /app

COPY --from=builder /grader /usr/local/bin/grader

ENV NODE_ENV=production

ENTRYPOINT ["grader"]
