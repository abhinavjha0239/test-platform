# LLM Integration Architecture

> **How the platform integrates with Large Language Model APIs for Applied AI challenges**

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [LLM Proxy Service](#3-llm-proxy-service)
4. [Supported Providers](#4-supported-providers)
5. [Security Model](#5-security-model)
6. [Request/Response Flow](#6-requestresponse-flow)
7. [Error Handling](#7-error-handling)
8. [Testing Infrastructure](#8-testing-infrastructure)
9. [Challenge Examples](#9-challenge-examples)

---

## 1. Overview

### Why a Proxy Architecture?

```mermaid
graph LR
    subgraph "❌ Direct Access (Insecure)"
        C1[Candidate Code] -->|API Key Exposed| LLM1[LLM API]
    end
    
    subgraph "✅ Proxy Architecture (Secure)"
        C2[Candidate Code] --> PROXY[Platform Proxy]
        PROXY -->|Platform Key| LLM2[LLM API]
    end
```

**Benefits:**
- 🔒 API keys never exposed to candidates
- 📊 Centralized usage tracking
- 💰 Cost control via quotas
- 🚀 Response caching for efficiency
- 🔍 Request/response logging for debugging

---

## 2. System Architecture

### High-Level Flow

```mermaid
sequenceDiagram
    participant C as Candidate Container
    participant P as LLM Proxy
    participant Q as Quota Manager
    participant CH as Cache
    participant L as LLM Provider
    
    C->>P: POST /v1/chat/completions
    P->>Q: Check quota (attempt_id)
    
    alt Quota Exceeded
        Q-->>P: DENY
        P-->>C: 429 Too Many Requests
    else Quota Available
        Q-->>P: ALLOW (tokens remaining: N)
        P->>CH: Check cache (prompt hash)
        
        alt Cache Hit
            CH-->>P: Cached response
            P-->>C: Return cached
        else Cache Miss
            P->>L: Forward request
            L-->>P: LLM response
            P->>CH: Store in cache
            P->>Q: Deduct tokens used
            P-->>C: Return response
        end
    end
```

### Component Diagram

```mermaid
graph TB
    subgraph "Grading Container Network"
        CAND[Candidate Container<br/>Network: internal]
        PROXY[LLM Proxy Sidecar<br/>Port: 8080]
    end
    
    subgraph "Platform Services"
        QUOTA[(Quota DB<br/>Redis)]
        CACHE[(Response Cache<br/>Redis)]
        LOG[(Request Log<br/>PostgreSQL)]
    end
    
    subgraph "External"
        OPENAI[OpenAI API]
        ANTHROPIC[Anthropic API]
        LOCAL[Local LLM<br/>vLLM/Ollama]
    end
    
    CAND -->|http://llm-proxy:8080| PROXY
    PROXY --> QUOTA
    PROXY --> CACHE
    PROXY --> LOG
    PROXY --> OPENAI
    PROXY --> ANTHROPIC
    PROXY --> LOCAL
```

---

## 3. LLM Proxy Service

### Endpoint Compatibility

The proxy mimics OpenAI's API format for universal compatibility:

| Endpoint | Description |
|----------|-------------|
| `POST /v1/chat/completions` | Chat completions (GPT-4, Claude, etc.) |
| `POST /v1/completions` | Legacy completions |
| `POST /v1/embeddings` | Text embeddings |
| `GET /v1/models` | List available models |

### Request Transformation

```mermaid
flowchart LR
    subgraph "Incoming Request"
        A[Candidate Request<br/>model: gpt-4]
    end
    
    subgraph "Proxy Processing"
        B[Validate Request]
        C[Check Quota]
        D[Route to Provider]
    end
    
    subgraph "Provider Mapping"
        E[OpenAI: gpt-4]
        F[Anthropic: claude-3]
        G[Local: llama-3]
    end
    
    A --> B --> C --> D
    D --> E
    D --> F
    D --> G
```

### Environment Variables for Candidates

Candidates access the LLM through these environment variables:

```bash
# Set by platform automatically
OPENAI_API_KEY="proxy-token-xxxxx"  # Not a real key, proxy auth token
OPENAI_BASE_URL="http://llm-proxy:8080/v1"

# Or for direct use
LLM_PROXY_URL="http://llm-proxy:8080"
LLM_ATTEMPT_ID="attempt-uuid"
```

---

## 4. Supported Providers

### Provider Matrix

```mermaid
graph TB
    subgraph "Tier 1: Production"
        OPENAI[OpenAI<br/>GPT-4, GPT-3.5]
        ANTHROPIC[Anthropic<br/>Claude 3]
    end
    
    subgraph "Tier 2: Cost-Effective"
        LOCAL[Local Models<br/>Llama 3, Mistral]
        GROQ[Groq<br/>Fast inference]
    end
    
    subgraph "Tier 3: Testing"
        MOCK[Mock LLM<br/>Deterministic]
        RECORD[Record/Replay<br/>Cached responses]
    end
```

### Model Mapping

| Challenge Requests | Actual Provider | Use Case |
|-------------------|-----------------|----------|
| `gpt-4` | OpenAI GPT-4 | Premium challenges |
| `gpt-3.5-turbo` | OpenAI or Local | Standard challenges |
| `claude-3-sonnet` | Anthropic | Alternative provider |
| `llama-3-70b` | Local vLLM | Cost-sensitive |
| `mock-deterministic` | Mock Service | Testing |

---

## 5. Security Model

### Defense Layers

```mermaid
graph TD
    subgraph "Layer 1: Network Isolation"
        N1[Candidate cannot reach internet]
        N2[Only proxy accessible]
        N3[Proxy authenticated per attempt]
    end
    
    subgraph "Layer 2: Request Validation"
        R1[Prompt size limits]
        R2[Blocked patterns]
        R3[Rate limiting]
    end
    
    subgraph "Layer 3: Response Filtering"
        F1[PII redaction]
        F2[Sensitive content filter]
        F3[Token count enforcement]
    end
    
    subgraph "Layer 4: Audit"
        A1[Full request logging]
        A2[Usage attribution]
        A3[Anomaly detection]
    end
    
    N1 --> R1 --> F1 --> A1
```

### Prompt Injection Defense

```mermaid
flowchart TD
    INPUT[Candidate Prompt] --> SCAN{Scan for Injection}
    
    SCAN -->|Clean| PROCESS[Process Normally]
    
    SCAN -->|Suspicious Patterns| FLAG[Flag for Review]
    FLAG --> SANITIZE[Sanitize Input]
    SANITIZE --> PROCESS
    
    SCAN -->|Definite Attack| BLOCK[Block Request]
    BLOCK --> LOG[Log Security Event]
    
    subgraph "Detection Patterns"
        P1[Ignore previous instructions]
        P2[System prompt extraction]
        P3[Role-play exploits]
        P4[Encoding attacks]
    end
```

### API Key Protection

```mermaid
graph LR
    subgraph "❌ Never Happens"
        K1[Real API Key] -.->|Never sent to| C1[Candidate Container]
    end
    
    subgraph "✅ Actual Flow"
        C2[Candidate Container] -->|Proxy Token| P[Proxy Service]
        P -->|Real API Key| L[LLM Provider]
    end
    
    subgraph "Key Storage"
        V[Vault / KMS] --> P
    end
```

---

## 6. Request/Response Flow

### Detailed Sequence

```mermaid
sequenceDiagram
    participant C as Candidate Code
    participant SDK as OpenAI SDK
    participant P as LLM Proxy
    participant V as Validator
    participant Q as Quota Service
    participant CH as Cache
    participant L as LLM API
    
    C->>SDK: client.chat.completions.create()
    SDK->>P: POST /v1/chat/completions
    
    P->>V: Validate request
    V->>V: Check prompt length
    V->>V: Scan for injection
    V-->>P: Validation result
    
    alt Invalid Request
        P-->>SDK: 400 Bad Request
        SDK-->>C: OpenAIError
    end
    
    P->>Q: Reserve tokens (estimate)
    Q-->>P: Reservation ID
    
    P->>CH: Lookup cache
    alt Cache Hit
        CH-->>P: Cached response
        P->>Q: Release reservation
    else Cache Miss
        P->>L: Forward to LLM
        L-->>P: LLM Response
        P->>CH: Store response
        P->>Q: Finalize token usage
    end
    
    P-->>SDK: Response
    SDK-->>C: ChatCompletion object
```

### Request Logging

Every request is logged with:

```mermaid
erDiagram
    LLM_REQUEST {
        uuid id PK
        uuid attempt_id FK
        timestamp created_at
        string model
        int prompt_tokens
        int completion_tokens
        float latency_ms
        boolean cache_hit
        string status
    }
    
    LLM_REQUEST_DETAIL {
        uuid id PK
        uuid request_id FK
        text prompt_hash
        text response_hash
        json metadata
    }
    
    LLM_REQUEST ||--o| LLM_REQUEST_DETAIL : has
```

---

## 7. Error Handling

### Error Categories

```mermaid
flowchart TD
    ERROR[Error Occurred] --> TYPE{Error Type?}
    
    TYPE -->|Quota| Q[429: Token Limit Exceeded]
    TYPE -->|Validation| V[400: Invalid Request]
    TYPE -->|Provider| P[502: Provider Error]
    TYPE -->|Timeout| T[504: Gateway Timeout]
    TYPE -->|Rate| R[429: Rate Limited]
    
    Q --> MSG1[Clear message with remaining quota]
    V --> MSG2[Validation details]
    P --> MSG3[Retry guidance]
    T --> MSG4[Timeout info]
    R --> MSG5[Backoff recommendation]
```

### Retry Strategy

```mermaid
stateDiagram-v2
    [*] --> Request
    Request --> Success: 200 OK
    Request --> Retry: 429/502/503/504
    Request --> Fail: 400/401/403
    
    Retry --> Wait: Attempt < Max
    Wait --> Request: Exponential backoff
    Retry --> Fail: Attempts exhausted
    
    Success --> [*]
    Fail --> [*]
```

---

## 8. Testing Infrastructure

### Mock LLM Service

For development and testing, a deterministic mock LLM is available:

```mermaid
graph LR
    subgraph "Test Mode"
        C[Candidate Code] --> MOCK[Mock LLM]
        MOCK --> RULES[Response Rules]
        RULES --> R1[Pattern matching]
        RULES --> R2[Canned responses]
        RULES --> R3[Simulated errors]
    end
```

### Record/Replay Mode

For reproducible testing:

```mermaid
sequenceDiagram
    participant T as Test Runner
    participant P as Proxy
    participant R as Recorder
    participant L as LLM
    
    Note over T,L: Recording Phase
    T->>P: Request 1
    P->>L: Forward
    L-->>P: Response 1
    P->>R: Store (hash → response)
    P-->>T: Response 1
    
    Note over T,L: Replay Phase
    T->>P: Request 1 (same)
    P->>R: Lookup hash
    R-->>P: Cached response
    P-->>T: Response 1 (instant)
```

---

## 9. Challenge Examples

### Example 1: Text Summarization

```mermaid
flowchart TD
    subgraph "Challenge: Summarize Article"
        INPUT[Long article text] --> CAND[Candidate System]
        CAND --> OUTPUT[Summary]
    end
    
    subgraph "Evaluation"
        OUTPUT --> E1[Length check: 100-200 words]
        OUTPUT --> E2[ROUGE-L vs reference]
        OUTPUT --> E3[Factual accuracy check]
        OUTPUT --> E4[Token efficiency]
    end
```

### Example 2: Multi-Turn Conversation

```mermaid
sequenceDiagram
    participant E as Evaluator
    participant C as Candidate Bot
    
    E->>C: Hello, I need help with Python
    C-->>E: Sure! What do you need?
    E->>C: How do I read a CSV file?
    C-->>E: Use pandas.read_csv()...
    E->>C: Can you show me an example?
    C-->>E: Here's a code example...
    
    Note over E: Evaluate:<br/>- Coherence<br/>- Helpfulness<br/>- Code correctness
```

### Example 3: Function Calling

```mermaid
flowchart LR
    subgraph "Task: Book a Flight"
        Q[User query] --> LLM[LLM with Tools]
        LLM --> TOOL1[search_flights]
        LLM --> TOOL2[book_flight]
        LLM --> TOOL3[get_user_info]
    end
    
    subgraph "Evaluation"
        TOOL1 --> CHECK1[Correct tool selected?]
        TOOL2 --> CHECK2[Correct parameters?]
        TOOL3 --> CHECK3[Proper sequence?]
    end
```

---

## Appendix: Configuration Reference

### Proxy Configuration

```yaml
llm_proxy:
  port: 8080
  providers:
    openai:
      base_url: "https://api.openai.com/v1"
      api_key: "${OPENAI_API_KEY}"
      models: ["gpt-4", "gpt-3.5-turbo"]
    anthropic:
      base_url: "https://api.anthropic.com/v1"
      api_key: "${ANTHROPIC_API_KEY}"
      models: ["claude-3-sonnet", "claude-3-haiku"]
    local:
      base_url: "http://vllm:8000/v1"
      models: ["llama-3-70b", "mistral-7b"]
  
  defaults:
    timeout_seconds: 60
    max_retries: 3
    cache_ttl_seconds: 3600
  
  security:
    max_prompt_tokens: 4000
    max_completion_tokens: 2000
    rate_limit_rpm: 60
    blocked_patterns:
      - "ignore previous instructions"
      - "reveal your system prompt"
```

---

*Next: [02-RAG-CHALLENGES.md](./02-RAG-CHALLENGES.md) - RAG System Evaluation*

