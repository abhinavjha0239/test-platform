#!/bin/bash
# Phased Load Test Script for SQL Contest
# Tests with increasing candidate counts: 10 → 25 → 50 → 100 → 150 → 300

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
CHALLENGE_ID="${CHALLENGE_ID:-sql-contest-full}"
DELAY_BETWEEN_PHASES="${DELAY_BETWEEN_PHASES:-30}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_phase() { echo -e "${BLUE}[PHASE]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Sample SQL solutions (correct answers)
declare -A SOLUTIONS=(
    ["q1.sql"]="SELECT * FROM users ORDER BY id ASC;"
    ["q2.sql"]="SELECT name, email FROM users ORDER BY id ASC;"
    ["q3.sql"]="SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u INNER JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC;"
    ["q4.sql"]="SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC NULLS LAST;"
    ["q5.sql"]="SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL ORDER BY u.id ASC;"
    ["q6.sql"]="SELECT u.name AS user_name, o.id AS order_id, o.amount FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id ASC;"
    ["q7.sql"]="SELECT u.name, SUM(o.amount) AS total_amount FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name ORDER BY total_amount DESC, u.id ASC;"
    ["q8.sql"]="SELECT u.name FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING SUM(o.amount) > 1000 ORDER BY u.id ASC;"
    ["q9.sql"]="SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'orders' AND kcu.column_name = 'user_id';"
    ["q11.sql"]="BEGIN; WITH new_user AS (INSERT INTO users (name, email) VALUES ('Raj', 'raj@test.com') RETURNING id, name), new_order AS (INSERT INTO orders (user_id, amount) SELECT id, 999 FROM new_user RETURNING id, user_id, amount) SELECT u.id AS user_id, u.name AS user_name, o.id AS order_id, o.amount FROM new_user u JOIN new_order o ON o.user_id = u.id; COMMIT;"
    ["q12.sql"]="BEGIN; INSERT INTO users (name, email) VALUES ('Temp', 'temp@test.com'); ROLLBACK; SELECT COUNT(*)::INT AS temp_user_count FROM users WHERE email = 'temp@test.com';"
    ["q13.sql"]="BEGIN; DELETE FROM orders WHERE user_id = 2; DELETE FROM users WHERE id = 2; COMMIT; SELECT (SELECT COUNT(*) FROM users)::INT AS remaining_users, (SELECT COUNT(*) FROM orders)::INT AS remaining_orders;"
)

# Function to simulate a single candidate submission
simulate_candidate() {
    local candidate_id=$1
    local submission_type=$2  # "run" or "submit"
    
    # Pick random file to submit
    local files=("q1.sql" "q2.sql" "q3.sql" "q4.sql" "q5.sql" "q6.sql" "q7.sql" "q8.sql")
    local random_file=${files[$RANDOM % ${#files[@]}]}
    local query="${SOLUTIONS[$random_file]}"
    
    # Build JSON payload
    local payload=$(cat <<EOF
{
    "challengeId": "${CHALLENGE_ID}",
    "candidateId": "load-test-candidate-${candidate_id}",
    "files": {
        "${random_file}": "${query}"
    },
    "type": "${submission_type}"
}
EOF
)
    
    # Submit to grading API
    curl -s -X POST "${API_URL}/api/grade" \
        -H "Content-Type: application/json" \
        -d "${payload}" \
        --max-time 30 > /dev/null 2>&1 &
}

# Function to run a phase of the load test
run_phase() {
    local concurrent=$1
    local phase_name=$2
    
    log_phase "===== Phase: ${phase_name} (${concurrent} concurrent candidates) ====="
    
    local start_time=$(date +%s)
    
    # Submit all candidates concurrently
    for i in $(seq 1 $concurrent); do
        simulate_candidate "${phase_name}_${i}" "run" &
        
        # Small delay to avoid overwhelming
        if (( i % 10 == 0 )); then
            sleep 0.1
        fi
    done
    
    # Wait for all background jobs
    wait
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log_info "Phase ${phase_name} completed in ${duration}s"
    
    # Check container count on remote (if DOCKER_HOST set)
    if [ -n "${DOCKER_HOST}" ]; then
        local container_count=$(docker ps -q | wc -l | tr -d ' ')
        log_info "Active containers: ${container_count}"
    fi
    
    # Check grading queue status
    log_info "Checking grading queue..."
    sleep 3
    
    return 0
}

# Main test execution
main() {
    echo ""
    echo "============================================="
    echo "  SQL Contest Phased Load Test"
    echo "============================================="
    echo "API URL: ${API_URL}"
    echo "Challenge: ${CHALLENGE_ID}"
    echo "Phases: 10 → 25 → 50 → 100 → 150 → 300"
    echo "============================================="
    echo ""
    
    # Check if API is reachable
    log_info "Checking API connectivity..."
    if ! curl -s "${API_URL}/health" > /dev/null 2>&1; then
        log_warn "API health check failed, continuing anyway..."
    else
        log_info "API is reachable"
    fi
    
    # Phase 1: 10 candidates (warmup)
    run_phase 10 "warmup"
    log_info "Waiting ${DELAY_BETWEEN_PHASES}s before next phase..."
    sleep ${DELAY_BETWEEN_PHASES}
    
    # Phase 2: 25 candidates
    run_phase 25 "light"
    log_info "Waiting ${DELAY_BETWEEN_PHASES}s before next phase..."
    sleep ${DELAY_BETWEEN_PHASES}
    
    # Phase 3: 50 candidates
    run_phase 50 "medium"
    log_info "Waiting ${DELAY_BETWEEN_PHASES}s before next phase..."
    sleep ${DELAY_BETWEEN_PHASES}
    
    # Phase 4: 100 candidates
    run_phase 100 "load"
    log_info "Waiting ${DELAY_BETWEEN_PHASES}s before next phase..."
    sleep ${DELAY_BETWEEN_PHASES}
    
    # Phase 5: 150 candidates
    run_phase 150 "stress"
    log_info "Waiting ${DELAY_BETWEEN_PHASES}s before next phase..."
    sleep ${DELAY_BETWEEN_PHASES}
    
    # Phase 6: 300 candidates (full load)
    run_phase 300 "full"
    
    echo ""
    echo "============================================="
    echo -e "${GREEN}  LOAD TEST COMPLETE${NC}"
    echo "============================================="
    echo ""
    
    log_info "Monitor grading completion with: redis-cli XLEN grading:jobs"
    log_info "Check grader logs for any errors"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --challenge)
            CHALLENGE_ID="$2"
            shift 2
            ;;
        --phase-delay)
            DELAY_BETWEEN_PHASES="$2"
            shift 2
            ;;
        --skip-to)
            SKIP_TO="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

main
