# Token Quota Management

> **Resource Allocation and Cost Control for LLM-Based Challenges**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Quota Architecture](#2-quota-architecture)
3. [Allocation Strategies](#3-allocation-strategies)
4. [Enforcement Mechanisms](#4-enforcement-mechanisms)
5. [Cost Tracking](#5-cost-tracking)
6. [Challenge Configuration](#6-challenge-configuration)
7. [Monitoring & Alerts](#7-monitoring--alerts)

---

## 1. Overview

### Why Token Management?

```mermaid
graph LR
    subgraph "Without Limits"
        A[Candidate Code] -->|Unlimited calls| B[LLM API]
        B --> C[💸 Unbounded Costs]
        B --> D[⚠️ Abuse Risk]
    end
    
    subgraph "With Token Management"
        E[Candidate Code] --> F[Quota Manager]
        F -->|Controlled| G[LLM API]
        G --> H[✅ Predictable Costs]
        G --> I[✅ Fair Usage]
    end
```

### Key Objectives

```mermaid
mindmap
  root((Token Management))
    Cost Control
      Predictable budgets
      Per-challenge limits
      Overage prevention
    Fairness
      Equal resources
      No advantage from spending
      Consistent evaluation
    Security
      Abuse prevention
      Rate limiting
      Usage monitoring
    Efficiency
      Encourage optimization
      Reward conciseness
      Penalize waste
```

---

## 2. Quota Architecture

### System Components

```mermaid
graph TB
    subgraph "Quota Service"
        ALLOC[Allocator]
        TRACK[Tracker]
        ENFORCE[Enforcer]
        REPORT[Reporter]
    end
    
    subgraph "Storage"
        REDIS[(Redis<br/>Real-time counters)]
        PG[(PostgreSQL<br/>Usage history)]
    end
    
    subgraph "Integration Points"
        PROXY[LLM Proxy]
        WORKER[Grading Worker]
        API[API Server]
    end
    
    PROXY --> TRACK
    TRACK --> REDIS
    TRACK --> ENFORCE
    ENFORCE --> PROXY
    REPORT --> PG
    WORKER --> ALLOC
    API --> REPORT
```

### Quota Hierarchy

```mermaid
graph TD
    ORG[Organization Quota<br/>Monthly budget: $10,000]
    
    ORG --> EXAM1[Exam Pool A<br/>$2,000 allocated]
    ORG --> EXAM2[Exam Pool B<br/>$3,000 allocated]
    
    EXAM1 --> CHAL1[Challenge 1<br/>5,000 tokens/attempt]
    EXAM1 --> CHAL2[Challenge 2<br/>10,000 tokens/attempt]
    
    EXAM2 --> CHAL3[Challenge 3<br/>15,000 tokens/attempt]
    
    CHAL1 --> ATT1[Attempt 1]
    CHAL1 --> ATT2[Attempt 2]
    CHAL1 --> ATT3[Attempt N]
```

---

## 3. Allocation Strategies

### Token Budget Calculation

```mermaid
flowchart TD
    CHAL[Challenge Type] --> ESTIMATE{Estimate needs}
    
    ESTIMATE --> BASE[Base tokens for task]
    ESTIMATE --> BUFFER[Buffer for retries: +20%]
    ESTIMATE --> EVAL[Evaluation overhead: +10%]
    
    BASE --> TOTAL[Total Budget]
    BUFFER --> TOTAL
    EVAL --> TOTAL
    
    TOTAL --> SPLIT{Split allocation}
    SPLIT --> PROMPT[Prompt tokens: 60%]
    SPLIT --> COMPLETION[Completion tokens: 40%]
```

### Recommended Budgets by Challenge Type

```mermaid
graph LR
    subgraph "Challenge Types"
        T1[Simple Classification]
        T2[RAG QA]
        T3[AI Agent]
        T4[Multi-turn Conversation]
    end
    
    subgraph "Token Budgets"
        B1[2,000 - 5,000]
        B2[5,000 - 15,000]
        B3[10,000 - 30,000]
        B4[15,000 - 50,000]
    end
    
    T1 --> B1
    T2 --> B2
    T3 --> B3
    T4 --> B4
```

### Budget Breakdown Example

```mermaid
pie title "RAG Challenge: 10,000 Token Budget"
    "Retrieval queries" : 1500
    "Context in prompts" : 4000
    "Generation" : 3000
    "Evaluation/Judge" : 1000
    "Buffer" : 500
```

---

## 4. Enforcement Mechanisms

### Request Flow

```mermaid
sequenceDiagram
    participant C as Candidate
    participant P as Proxy
    participant Q as Quota Service
    participant L as LLM
    
    C->>P: LLM Request
    P->>Q: Check quota (attempt_id)
    
    alt Quota Available
        Q-->>P: ALLOW (remaining: N)
        P->>Q: Reserve tokens (estimate)
        P->>L: Forward request
        L-->>P: Response
        P->>Q: Finalize (actual usage)
        P-->>C: Response
    else Quota Exceeded
        Q-->>P: DENY
        P-->>C: 429 Quota Exceeded
    end
```

### Soft vs Hard Limits

```mermaid
graph TD
    subgraph "Soft Limit (Warning)"
        S1[80% used] --> S2[Warning in logs]
        S2 --> S3[Continue allowing]
    end
    
    subgraph "Hard Limit (Block)"
        H1[100% used] --> H2[Block new requests]
        H2 --> H3[Return 429 error]
    end
    
    subgraph "Grace Period"
        G1[100-110%] --> G2[Allow completion of current request]
        G2 --> G3[Then block]
    end
```

### Rate Limiting

```mermaid
flowchart TD
    REQ[Request] --> RL{Rate limit check}
    
    RL -->|Under limit| PROCESS[Process request]
    RL -->|Over limit| QUEUE{Queue available?}
    
    QUEUE -->|Yes| WAIT[Queue request]
    WAIT --> PROCESS
    
    QUEUE -->|No| REJECT[429 Too Many Requests]
    
    subgraph "Rate Limits"
        R1[Per second: 5 requests]
        R2[Per minute: 60 requests]
        R3[Concurrent: 3 requests]
    end
```

---

## 5. Cost Tracking

### Cost Calculation

```mermaid
flowchart LR
    subgraph "Usage"
        U1[Prompt tokens]
        U2[Completion tokens]
    end
    
    subgraph "Rates (per 1K tokens)"
        R1[GPT-4: $0.03 / $0.06]
        R2[GPT-3.5: $0.001 / $0.002]
        R3[Claude: $0.008 / $0.024]
    end
    
    subgraph "Cost"
        C1[prompt_tokens * rate]
        C2[completion_tokens * rate]
        C3[Total cost]
    end
    
    U1 --> C1
    U2 --> C2
    R1 --> C1
    R1 --> C2
    C1 --> C3
    C2 --> C3
```

### Usage Attribution

```mermaid
erDiagram
    ORGANIZATION ||--o{ EXAM : has
    EXAM ||--o{ CHALLENGE : contains
    CHALLENGE ||--o{ ATTEMPT : attempted_in
    ATTEMPT ||--o{ LLM_USAGE : generates
    
    LLM_USAGE {
        uuid id PK
        uuid attempt_id FK
        string model
        int prompt_tokens
        int completion_tokens
        float cost_usd
        timestamp created_at
    }
```

---

## 6. Challenge Configuration

### Configuration Schema

```yaml
challenge:
  id: rag-qa-v1
  name: "Document QA System"
  
  token_config:
    # Total budget for the attempt
    total_budget: 10000
    
    # Per-request limits
    max_prompt_tokens: 4000
    max_completion_tokens: 2000
    
    # Rate limits
    requests_per_minute: 30
    concurrent_requests: 2
    
    # Model restrictions
    allowed_models:
      - gpt-3.5-turbo
      - gpt-4
    default_model: gpt-3.5-turbo
    
    # Efficiency scoring
    efficiency_bonus:
      threshold: 5000  # If under this, bonus points
      bonus_percent: 10
    
    efficiency_penalty:
      threshold: 9000  # If over this, penalty
      penalty_percent: 5
```

### Model Tiering

```mermaid
graph TD
    subgraph "Tier 1: Standard"
        M1[gpt-3.5-turbo]
        M2[claude-3-haiku]
        COST1[Low cost]
    end
    
    subgraph "Tier 2: Advanced"
        M3[gpt-4]
        M4[claude-3-sonnet]
        COST2[Medium cost]
    end
    
    subgraph "Tier 3: Premium"
        M5[gpt-4-turbo]
        M6[claude-3-opus]
        COST3[High cost]
    end
    
    CHAL1[Basic challenges] --> M1
    CHAL2[Standard challenges] --> M3
    CHAL3[Complex challenges] --> M5
```

---

## 7. Monitoring & Alerts

### Real-time Dashboard

```mermaid
graph TB
    subgraph "Metrics"
        M1[Tokens used / Budget]
        M2[Requests / minute]
        M3[Cost accumulation]
        M4[Error rate]
    end
    
    subgraph "Visualizations"
        V1[Progress bar]
        V2[Time series graph]
        V3[Cost ticker]
        V4[Error log]
    end
    
    M1 --> V1
    M2 --> V2
    M3 --> V3
    M4 --> V4
```

### Alert Thresholds

```mermaid
flowchart TD
    USAGE[Current Usage] --> CHECK{Check thresholds}
    
    CHECK -->|50%| INFO[ℹ️ Info: Halfway]
    CHECK -->|80%| WARN[⚠️ Warning: Nearing limit]
    CHECK -->|95%| CRIT[🔴 Critical: Almost exhausted]
    CHECK -->|100%| BLOCK[🛑 Blocked: Quota exceeded]
    
    WARN --> NOTIFY[Notify candidate]
    CRIT --> NOTIFY
    BLOCK --> TERMINATE[Terminate pending requests]
```

### Anomaly Detection

```mermaid
flowchart TD
    PATTERN[Usage Pattern] --> ANALYZE{Anomaly check}
    
    ANALYZE -->|Normal| OK[Continue monitoring]
    
    ANALYZE -->|Spike| SPIKE[Sudden usage increase]
    SPIKE --> INVESTIGATE[Flag for review]
    
    ANALYZE -->|Loop| LOOP[Repetitive identical calls]
    LOOP --> THROTTLE[Apply throttling]
    
    ANALYZE -->|Abuse| ABUSE[Suspected abuse pattern]
    ABUSE --> SUSPEND[Suspend and alert admin]
```

---

## Appendix: Error Messages

| Code | Message | Candidate Action |
|------|---------|------------------|
| `429` | "Token quota exceeded" | Optimize prompts, reduce calls |
| `429` | "Rate limit exceeded" | Add delays between requests |
| `400` | "Prompt too long" | Shorten prompt |
| `400` | "Model not allowed" | Use allowed model |

---

## Appendix: Sample Usage Report

```json
{
  "attempt_id": "uuid-xxx",
  "challenge_id": "rag-qa-v1",
  "token_budget": 10000,
  "usage_summary": {
    "total_tokens": 7823,
    "prompt_tokens": 5102,
    "completion_tokens": 2721,
    "requests": 12,
    "cache_hits": 3
  },
  "cost": {
    "model": "gpt-3.5-turbo",
    "prompt_cost": 0.0051,
    "completion_cost": 0.0054,
    "total_usd": 0.0105
  },
  "efficiency": {
    "tokens_per_request": 652,
    "under_budget_percent": 21.8,
    "efficiency_bonus_applied": true
  }
}
```

---

*Previous: [04-PROMPT-ENGINEERING.md](./04-PROMPT-ENGINEERING.md)*  
*Back to: [README.md](./README.md)*

