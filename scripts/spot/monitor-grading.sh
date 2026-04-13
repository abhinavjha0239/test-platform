#!/bin/bash
# Real-Time Grading Monitor Dashboard
# Shows live stats for grading queue and worker performance

REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
REFRESH_INTERVAL="${REFRESH_INTERVAL:-1}"

# ANSI colors and cursor control
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'
BOLD='\033[1m'

# Track for rate calculations
PREV_COMPLETED=0
PREV_TIME=$(date +%s)
START_TIME=$(date +%s)
START_COMPLETED=0

# Clear screen and hide cursor
clear_screen() {
    printf "\033[2J\033[H"
}

# Draw the dashboard
draw_dashboard() {
    local now=$(date '+%Y-%m-%d %H:%M:%S')
    local uptime=$(($(date +%s) - START_TIME))
    
    # Get all stats from Redis
    local stats=$(redis-cli -u "${REDIS_URL}" HGETALL grading:stats 2>/dev/null)
    local high_len=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:high 2>/dev/null || echo "0")
    local low_len=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:low 2>/dev/null || echo "0")
    local dlq_len=$(redis-cli -u "${REDIS_URL}" XLEN grading:jobs:dlq 2>/dev/null || echo "0")
    local retry_len=$(redis-cli -u "${REDIS_URL}" ZCARD grading:jobs:retry 2>/dev/null || echo "0")
    
    # Parse stats
    local queued=$(echo "$stats" | grep -A1 "^queued$" | tail -1)
    local active=$(echo "$stats" | grep -A1 "^active$" | tail -1)
    local completed=$(echo "$stats" | grep -A1 "^completed$" | tail -1)
    local failed=$(echo "$stats" | grep -A1 "^failed$" | tail -1)
    local retrying=$(echo "$stats" | grep -A1 "^retrying$" | tail -1)
    
    queued=${queued:-0}
    active=${active:-0}
    completed=${completed:-0}
    failed=${failed:-0}
    retrying=${retrying:-0}
    
    # Initialize start completed on first run
    if [ $START_COMPLETED -eq 0 ] && [ $completed -gt 0 ]; then
        START_COMPLETED=$completed
    fi
    
    # Calculate rates
    local current_time=$(date +%s)
    local time_diff=$((current_time - PREV_TIME))
    local completed_diff=$((completed - PREV_COMPLETED))
    local rate=0
    
    if [ $time_diff -gt 0 ] && [ $PREV_COMPLETED -gt 0 ]; then
        rate=$(awk "BEGIN {printf \"%.2f\", ${completed_diff}/${time_diff}}")
    fi
    
    # Calculate overall average
    local avg_rate=0
    if [ $uptime -gt 5 ]; then
        local total_completed=$((completed - START_COMPLETED))
        avg_rate=$(awk "BEGIN {printf \"%.2f\", ${total_completed}/${uptime}}")
    fi
    
    # Update tracking vars
    PREV_COMPLETED=$completed
    PREV_TIME=$current_time
    
    # Success rate
    local total=$((completed + failed))
    local success_rate="N/A"
    if [ $total -gt 0 ]; then
        success_rate=$(awk "BEGIN {printf \"%.1f%%\", (${completed}/${total})*100}")
    fi
    
    # Draw dashboard
    clear_screen
    
    echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║${NC}           ${WHITE}GRADING SYSTEM MONITOR${NC}                               ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╠════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}${CYAN}║${NC} Time: ${now}              Uptime: ${uptime}s             ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╠════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}${CYAN}║${NC}                                                                ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}QUEUE STATUS${NC}                                                  ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ┌────────────────────────────────────────────────────────┐   ${BOLD}${CYAN}║${NC}"
    printf  "${BOLD}${CYAN}║${NC}  │  High Priority:  ${YELLOW}%-8s${NC}  Low Priority:  ${BLUE}%-8s${NC}  │   ${BOLD}${CYAN}║${NC}\n" "$high_len" "$low_len"
    printf  "${BOLD}${CYAN}║${NC}  │  Dead Letter:    ${RED}%-8s${NC}  Retry Queue:   ${YELLOW}%-8s${NC}  │   ${BOLD}${CYAN}║${NC}\n" "$dlq_len" "$retry_len"
    echo -e "${BOLD}${CYAN}║${NC}  └────────────────────────────────────────────────────────┘   ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}                                                                ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}JOB STATISTICS${NC}                                                 ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ┌────────────────────────────────────────────────────────┐   ${BOLD}${CYAN}║${NC}"
    printf  "${BOLD}${CYAN}║${NC}  │  Queued:     ${WHITE}%-12s${NC}  Active:      ${GREEN}%-10s${NC}  │   ${BOLD}${CYAN}║${NC}\n" "$queued" "$active"
    printf  "${BOLD}${CYAN}║${NC}  │  Completed:  ${GREEN}%-12s${NC}  Failed:      ${RED}%-10s${NC}  │   ${BOLD}${CYAN}║${NC}\n" "$completed" "$failed"
    printf  "${BOLD}${CYAN}║${NC}  │  Retrying:   ${YELLOW}%-12s${NC}  Success:     %-10s  │   ${BOLD}${CYAN}║${NC}\n" "$retrying" "$success_rate"
    echo -e "${BOLD}${CYAN}║${NC}  └────────────────────────────────────────────────────────┘   ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}                                                                ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}THROUGHPUT${NC}                                                     ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  ┌────────────────────────────────────────────────────────┐   ${BOLD}${CYAN}║${NC}"
    printf  "${BOLD}${CYAN}║${NC}  │  Current Rate:   ${GREEN}%-10s${NC} jobs/sec                  │   ${BOLD}${CYAN}║${NC}\n" "$rate"
    printf  "${BOLD}${CYAN}║${NC}  │  Average Rate:   ${BLUE}%-10s${NC} jobs/sec                  │   ${BOLD}${CYAN}║${NC}\n" "$avg_rate"
    echo -e "${BOLD}${CYAN}║${NC}  └────────────────────────────────────────────────────────┘   ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}                                                                ${BOLD}${CYAN}║${NC}"
    
    # Visual progress bar for active jobs
    local bar_width=50
    local filled=0
    if [ $active -gt 0 ]; then
        filled=$((active > bar_width ? bar_width : active))
    fi
    local empty=$((bar_width - filled))
    local bar=$(printf "%${filled}s" | tr ' ' '█')$(printf "%${empty}s" | tr ' ' '░')
    
    echo -e "${BOLD}${CYAN}║${NC}  ${BOLD}ACTIVE WORKERS${NC}                                                 ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  [${GREEN}${bar}${NC}]         ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}║${NC}                                                                ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╠════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BOLD}${CYAN}║${NC}  Press ${BOLD}Ctrl+C${NC} to exit                                           ${BOLD}${CYAN}║${NC}"
    echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    
    # Show recent failures if any
    if [ "$dlq_len" -gt "0" ]; then
        echo ""
        echo -e "${RED}Recent DLQ Entries:${NC}"
        redis-cli -u "${REDIS_URL}" XRANGE grading:jobs:dlq - + COUNT 3 2>/dev/null | head -20
    fi
}

# Main loop
main() {
    # Test Redis connection
    if ! redis-cli -u "${REDIS_URL}" ping 2>/dev/null | grep -q PONG; then
        echo -e "${RED}Error: Cannot connect to Redis at ${REDIS_URL}${NC}"
        exit 1
    fi
    
    # Hide cursor
    printf "\033[?25l"
    
    # Trap to restore cursor on exit
    trap 'printf "\033[?25h"; echo; exit 0' INT TERM
    
    while true; do
        draw_dashboard
        sleep "${REFRESH_INTERVAL}"
    done
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--refresh)
            REFRESH_INTERVAL="$2"
            shift 2
            ;;
        --redis)
            REDIS_URL="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -r, --refresh N    Refresh interval in seconds (default: 1)"
            echo "  --redis URL        Redis URL (default: redis://localhost:6379)"
            echo "  -h, --help         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

main
