#!/bin/bash
# Complete 30-Candidate Grader Test Runner
# This script handles the entire test workflow including service startup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
EC2_IP="${EC2_IP:-3.110.124.250}"
REDIS_PORT="${REDIS_PORT:-6379}"
CANDIDATE_COUNT="${CANDIDATE_COUNT:-30}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log_step() { echo -e "\n${BOLD}${BLUE}▶ $1${NC}"; }
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║          30 CANDIDATE GRADER LOAD TEST                        ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_prerequisites() {
    log_step "Checking prerequisites..."
    
    local missing=()
    
    # Check required commands
    command -v docker &>/dev/null || missing+=("docker")
    command -v redis-cli &>/dev/null || missing+=("redis-cli")
    command -v go &>/dev/null || missing+=("go")
    
    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi
    
    log_info "All prerequisites met"
}

start_redis() {
    log_step "Starting Redis..."
    
    if docker ps --format '{{.Names}}' | grep -q "redis-grading"; then
        log_info "Redis container already running"
    else
        # Stop any old container
        docker rm -f redis-grading 2>/dev/null || true
        
        # Start fresh Redis
        docker run -d --name redis-grading \
            -p ${REDIS_PORT}:6379 \
            redis:7-alpine
        
        sleep 2
        log_info "Redis started on port ${REDIS_PORT}"
    fi
    
    # Verify connection
    if redis-cli -p ${REDIS_PORT} ping | grep -q PONG; then
        log_info "Redis connection verified"
    else
        log_error "Redis not responding"
        exit 1
    fi
    
    export REDIS_URL="redis://localhost:${REDIS_PORT}"
}

start_grader() {
    log_step "Starting Go Grader..."
    
    cd "$PROJECT_ROOT/apps/grader-go"
    
    # Build if needed
    if [ ! -f "./bin/grader-go" ] || [ "./cmd/grader/main.go" -nt "./bin/grader-go" ]; then
        log_info "Building grader..."
        go build -o ./bin/grader-go ./cmd/grader/
    fi
    
    # Check if already running
    if pgrep -f "grader-go" > /dev/null; then
        log_warn "Grader already running - stopping it..."
        pkill -f "grader-go" || true
        sleep 2
    fi
    
    # Set environment
    export REDIS_URL="redis://localhost:${REDIS_PORT}"
    export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/exam_platform?sslmode=disable}"
    export GRADING_CONCURRENCY=20
    export SQL_CONTAINER_REMOTE_HOST="${EC2_IP}"
    export DOCKER_HOST="ssh://ec2-user@${EC2_IP}"
    
    # Start grader in background
    log_info "Starting grader with remote Docker at ${EC2_IP}..."
    ./bin/grader-go > /tmp/grader.log 2>&1 &
    GRADER_PID=$!
    
    sleep 3
    
    if ps -p $GRADER_PID > /dev/null; then
        log_info "Grader started (PID: $GRADER_PID)"
        echo $GRADER_PID > /tmp/grader.pid
    else
        log_error "Grader failed to start. Check /tmp/grader.log"
        tail -20 /tmp/grader.log
        exit 1
    fi
    
    cd "$SCRIPT_DIR"
}

run_test() {
    log_step "Running 30-Candidate Test..."
    
    cd "$PROJECT_ROOT"
    
    # Use TypeScript test if tsx available, else bash
    if command -v npx &>/dev/null && [ -f "scripts/spot/30-candidate-test.ts" ]; then
        log_info "Using TypeScript test runner..."
        REDIS_URL="redis://localhost:${REDIS_PORT}" \
        CANDIDATE_COUNT=${CANDIDATE_COUNT} \
            npx tsx scripts/spot/30-candidate-test.ts
    else
        log_info "Using Bash test runner..."
        REDIS_URL="redis://localhost:${REDIS_PORT}" \
        CANDIDATE_COUNT=${CANDIDATE_COUNT} \
            bash scripts/spot/30-candidate-test.sh
    fi
}

start_monitor() {
    log_step "Starting Monitor Dashboard..."
    
    cd "$SCRIPT_DIR"
    
    # Run monitor in current terminal
    REDIS_URL="redis://localhost:${REDIS_PORT}" \
        bash ./monitor-grading.sh
}

cleanup() {
    log_step "Cleaning up..."
    
    if [ -f /tmp/grader.pid ]; then
        local pid=$(cat /tmp/grader.pid)
        if ps -p $pid > /dev/null 2>&1; then
            log_info "Stopping grader (PID: $pid)..."
            kill $pid 2>/dev/null || true
        fi
        rm -f /tmp/grader.pid
    fi
    
    log_info "Cleanup complete"
}

show_usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  full       Run full test (start services + test + monitor)"
    echo "  test       Just run the test (assumes services running)"
    echo "  monitor    Start the monitoring dashboard only"
    echo "  start      Start Redis and Grader only"
    echo "  stop       Stop grader and cleanup"
    echo ""
    echo "Environment Variables:"
    echo "  EC2_IP           EC2 instance IP (default: 3.110.124.250)"
    echo "  REDIS_PORT       Local Redis port (default: 6379)"
    echo "  CANDIDATE_COUNT  Number of test candidates (default: 30)"
    echo "  DATABASE_URL     PostgreSQL connection string"
}

# Main entry
main() {
    print_banner
    
    case "${1:-full}" in
        full)
            check_prerequisites
            start_redis
            start_grader
            
            echo ""
            log_info "Services started. Opening monitor in new window..."
            log_info "The test will start in 5 seconds..."
            echo ""
            
            sleep 5
            run_test
            
            echo ""
            log_info "Test complete!"
            echo ""
            log_info "Monitor with: REDIS_URL=redis://localhost:${REDIS_PORT} $SCRIPT_DIR/monitor-grading.sh"
            log_info "Grader logs:  tail -f /tmp/grader.log"
            log_info "Stop with:    $0 stop"
            ;;
        
        test)
            run_test
            ;;
        
        monitor)
            start_monitor
            ;;
        
        start)
            check_prerequisites
            start_redis
            start_grader
            log_info "Services started!"
            log_info "Run test with: $0 test"
            ;;
        
        stop)
            cleanup
            ;;
        
        -h|--help|help)
            show_usage
            ;;
        
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Trap for cleanup on exit
trap cleanup EXIT

main "$@"
