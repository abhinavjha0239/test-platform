#!/bin/bash
# 30 Candidate Load Test with Real-Time Monitoring
# Tests grader for 30 concurrent candidate submissions

set -e

# Configuration - adjust these for your setup
EC2_IP="${EC2_IP:-3.110.124.250}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
API_URL="${API_URL:-http://localhost:3001}"
CANDIDATE_COUNT="${CANDIDATE_COUNT:-30}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $(date '+%H:%M:%S') $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $(date '+%H:%M:%S') $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $(date '+%H:%M:%S') $1"; }
log_phase() { echo -e "${BLUE}[PHASE]${NC} $(date '+%H:%M:%S') $1"; }
log_monitor() { echo -e "${CYAN}[MONITOR]${NC} $(date '+%H:%M:%S') $1"; }

print_header() {
    echo ""
    echo "=============================================="
    echo "  30 CANDIDATE GRADER LOAD TEST"
    echo "=============================================="
    echo "  EC2 Instance: ${EC2_IP}"
    echo "  Redis URL:    ${REDIS_URL}"
    echo "  API URL:      ${API_URL}"
    echo "  Candidates:   ${CANDIDATE_COUNT}"
    echo "=============================================="
    echo ""
}

# Check prerequisites
check_prereqs() {
    log_info "Checking prerequisites..."
    
    # Check if redis-cli is available
    if ! command -v redis-cli &> /dev/null; then
        log_error "redis-cli not found. Install redis-tools."
        exit 1
    fi
    
    # Check Redis connection
    if redis-cli -u "${REDIS_URL}" ping 2>/dev/null | grep -q PONG; then
        log_info "✅ Redis connected"
    else
        log_error "Cannot connect to Redis at ${REDIS_URL}"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Get grading stats from Redis
get_grading_stats() {
    local stats=$(redis-cli -u "${REDIS_URL}" HGETALL grading:stats 2>/dev/null)
    local queued=$(echo "$stats" | grep -A1 "queued" | tail -1 || echo "0")
    local active=$(echo "$stats" | grep -A1 "active" | tail -1 || echo "0")
    local completed=$(echo "$stats" | grep -A1 "completed" | tail -1 || echo "0")
    local failed=$(echo "$stats" | grep -A1 "failed" | tail -1 || echo "0")
    local retrying=$(echo "$stats" | grep -A1 "retrying" | tail -1 || echo "0")
    
    echo "queued:${queued:-0} active:${active:-0} completed:${completed:-0} failed:${failed:-0} retrying:${retrying:-0}"
}

# Get queue lengths
get_queue_lengths() {
    local high=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:high 2>/dev/null || echo "0")
    local low=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:low 2>/dev/null || echo "0")
    local dlq=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:dlq 2>/dev/null || echo "0")
    local retry=$(redis-cli -u "${REDIS_URL}" ZCARD grading:jobs:retry 2>/dev/null || echo "0")
    
    echo "high:${high} low:${low} dlq:${dlq} retry:${retry}"
}

# Submit grading jobs directly to Redis
submit_jobs() {
    local count=$1
    local phase=$2
    
    log_phase "Submitting ${count} grading jobs (phase: ${phase})..."
    
    local start_time=$(date +%s)
    
    for i in $(seq 1 $count); do
        local attempt_id="load-test-${phase}-${i}-$(date +%s%N)"
        local job_id="grading_${attempt_id}_${RANDOM}"
        local created_at=$(date +%s%3N)
        
        # SQL challenge payload
        local payload=$(cat <<EOF
{
    "attemptId": "${attempt_id}",
    "candidateId": "load-test-candidate-${i}",
    "challengeId": "sql-contest-test",
    "code": "SELECT * FROM users ORDER BY id ASC;",
    "files": {
        "q1.sql": "SELECT * FROM users ORDER BY id ASC;",
        "q2.sql": "SELECT name, email FROM users ORDER BY id ASC;"
    },
    "runner": {
        "mode": "sql",
        "runtime": "postgresql",
        "database": {
            "setupScript": "DROP TABLE IF EXISTS orders; DROP TABLE IF EXISTS users; CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE); CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), amount INT); INSERT INTO users (name, email) VALUES ('Aman', 'aman@test.com'), ('Riya', 'riya@test.com'), ('Kunal', 'kunal@test.com'), ('Sneha', 'sneha@test.com'); INSERT INTO orders (user_id, amount) VALUES (1, 500), (1, 1500), (2, 700);"
        },
        "sqlTests": {
            "isolation": "container",
            "timeoutMs": 15000
        },
        "publicTests": [
            {
                "name": "Q1: Fetch all users",
                "fileName": "q1.sql",
                "expectedResult": [
                    {"id": 1, "name": "Aman", "email": "aman@test.com"},
                    {"id": 2, "name": "Riya", "email": "riya@test.com"},
                    {"id": 3, "name": "Kunal", "email": "kunal@test.com"},
                    {"id": 4, "name": "Sneha", "email": "sneha@test.com"}
                ]
            }
        ],
        "hiddenTests": []
    },
    "isSubmit": false,
    "isPreview": false
}
EOF
)
        
        # Escape the payload for redis-cli
        local escaped_payload=$(echo "$payload" | tr -d '\n' | sed 's/"/\\"/g')
        
        # Add to Redis stream
        redis-cli -u "${REDIS_URL}" XADD grading:jobs:high '*' \
            jobId "${job_id}" \
            attemptId "${attempt_id}" \
            isPreview "0" \
            createdAt "${created_at}" \
            payload "${payload}" > /dev/null 2>&1 &
        
        # Small delay every 5 jobs to prevent overwhelming
        if (( i % 5 == 0 )); then
            sleep 0.1
        fi
    done
    
    # Wait for all background jobs to complete
    wait
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_info "✅ ${count} jobs submitted in ${duration}s"
}

# Monitor progress in real-time
monitor_progress() {
    local expected=$1
    local timeout=${2:-120}  # Default 2 minute timeout
    
    log_monitor "Starting real-time monitoring (timeout: ${timeout}s)..."
    echo ""
    
    local start_time=$(date +%s)
    local last_completed=0
    local stable_count=0
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        # Get current stats
        local stats=$(get_grading_stats)
        local queues=$(get_queue_lengths)
        
        # Parse stats
        local completed=$(echo "$stats" | grep -oP 'completed:\K[0-9]+')
        local active=$(echo "$stats" | grep -oP 'active:\K[0-9]+')
        local queued=$(echo "$stats" | grep -oP 'queued:\K[0-9]+')
        local failed=$(echo "$stats" | grep -oP 'failed:\K[0-9]+')
        
        local high_q=$(echo "$queues" | grep -oP 'high:\K[0-9]+')
        local dlq=$(echo "$queues" | grep -oP 'dlq:\K[0-9]+')
        
        # Calculate throughput
        local throughput="0"
        if [ $elapsed -gt 0 ]; then
            throughput=$(awk "BEGIN {printf \"%.1f\", ${completed:-0}/${elapsed}}")
        fi
        
        # Print status line
        printf "\r[%3ds] Queue: %-4s Active: %-3s Done: %-4s Failed: %-3s | Throughput: %s jobs/s    " \
            "$elapsed" "${high_q:-0}" "${active:-0}" "${completed:-0}" "${failed:-0}" "$throughput"
        
        # Check if stable (no change for 5 iterations)
        if [ "${completed:-0}" -eq "$last_completed" ] && [ "${high_q:-0}" -eq "0" ] && [ "${active:-0}" -eq "0" ]; then
            ((stable_count++))
        else
            stable_count=0
            last_completed=${completed:-0}
        fi
        
        # Exit conditions
        if [ $stable_count -ge 5 ]; then
            echo ""
            log_info "Queue stable - all jobs processed"
            break
        fi
        
        if [ $elapsed -ge $timeout ]; then
            echo ""
            log_warn "Timeout reached (${timeout}s)"
            break
        fi
        
        sleep 1
    done
    
    echo ""
}

# Print final results
print_results() {
    echo ""
    echo "=============================================="
    echo "  TEST RESULTS"
    echo "=============================================="
    
    local stats=$(get_grading_stats)
    local queues=$(get_queue_lengths)
    
    echo "Grading Stats:"
    echo "  $stats" | tr ' ' '\n' | sed 's/^/    /'
    
    echo ""
    echo "Queue Status:"
    echo "  $queues" | tr ' ' '\n' | sed 's/^/    /'
    
    # Check for DLQ entries
    local dlq_count=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:dlq 2>/dev/null || echo "0")
    if [ "$dlq_count" -gt "0" ]; then
        echo ""
        log_warn "There are ${dlq_count} jobs in the Dead Letter Queue!"
        echo "View with: redis-cli -u ${REDIS_URL} XRANGE grading:jobs:dlq - + COUNT 5"
    fi
    
    echo ""
    echo "=============================================="
}

# Reset stats before test (optional)
reset_stats() {
    log_info "Resetting grading stats..."
    redis-cli -u "${REDIS_URL}" DEL grading:stats > /dev/null 2>&1 || true
    log_info "Stats reset"
}

# Main execution
main() {
    print_header
    check_prereqs
    
    # Optional: Reset stats for clean test
    read -p "Reset grading stats before test? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        reset_stats
    fi
    
    echo ""
    log_phase "Starting 30-candidate test..."
    echo ""
    
    # Phase 1: Warmup with 5 candidates
    submit_jobs 5 "warmup"
    monitor_progress 5 30
    
    sleep 3
    
    # Phase 2: Main test with 30 candidates
    log_phase "Starting main test phase with ${CANDIDATE_COUNT} candidates..."
    submit_jobs ${CANDIDATE_COUNT} "main"
    monitor_progress ${CANDIDATE_COUNT} 180
    
    print_results
    
    echo ""
    log_info "Test complete!"
    echo ""
    echo "Additional monitoring commands:"
    echo "  Watch queue:   redis-cli -u ${REDIS_URL} XLEN grading:jobs:high"
    echo "  Watch stats:   redis-cli -u ${REDIS_URL} HGETALL grading:stats"
    echo "  View failures: redis-cli -u ${REDIS_URL} XRANGE grading:jobs:dlq - + COUNT 10"
    echo ""
}

# Parse arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [--reset] [--count N]"
        echo ""
        echo "Options:"
        echo "  --reset      Reset stats before test"
        echo "  --count N    Number of candidates (default: 30)"
        exit 0
        ;;
    --reset)
        reset_stats
        shift
        ;;
esac

main
