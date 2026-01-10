# Applied AI Challenge Framework

> **Documentation for LLM, RAG, AI Agents, and Prompt Engineering Challenges**

---

## Overview

This folder contains detailed specifications for implementing Applied AI challenges on the exam platform. These challenges evaluate candidates on their ability to work with modern AI systems including Large Language Models (LLMs), Retrieval-Augmented Generation (RAG), autonomous agents, and prompt engineering.

---

## Document Index

| Document | Description |
|----------|-------------|
| [01-LLM-INTEGRATION.md](./01-LLM-INTEGRATION.md) | Architecture for LLM API integration, proxy setup, and security |
| [02-RAG-CHALLENGES.md](./02-RAG-CHALLENGES.md) | RAG system evaluation, retrieval metrics, and test design |
| [03-AI-AGENTS.md](./03-AI-AGENTS.md) | Agent testing methodology, tool evaluation, and scoring |
| [04-PROMPT-ENGINEERING.md](./04-PROMPT-ENGINEERING.md) | Prompt challenge types, evaluation criteria, and examples |
| [05-TOKEN-MANAGEMENT.md](./05-TOKEN-MANAGEMENT.md) | Token quotas, cost tracking, and resource allocation |

---

## Quick Start

```mermaid
graph LR
    A[Choose Challenge Type] --> B{Type?}
    B -->|LLM App| C[01-LLM-INTEGRATION]
    B -->|RAG System| D[02-RAG-CHALLENGES]
    B -->|AI Agent| E[03-AI-AGENTS]
    B -->|Prompting| F[04-PROMPT-ENGINEERING]
    
    C --> G[05-TOKEN-MANAGEMENT]
    D --> G
    E --> G
    F --> G
```

---

## Key Differences from Traditional ML Challenges

| Aspect | Traditional ML | Applied AI |
|--------|---------------|------------|
| **Model** | Candidate trains model | Uses pre-trained LLMs |
| **Evaluation** | Metric on predictions | Task completion + quality |
| **Resources** | GPU/Memory | API tokens |
| **Determinism** | Controllable | Stochastic (temperature) |
| **Cost** | Compute time | API costs |
| **Security** | Data isolation | Prompt injection defense |

---

## Architecture Overview

```mermaid
graph TB
    subgraph "Candidate Environment"
        CODE[Candidate Code]
        SDK[LangChain / LlamaIndex]
    end
    
    subgraph "Platform Layer"
        PROXY[LLM Proxy Service]
        QUOTA[Token Manager]
        CACHE[Response Cache]
        MONITOR[Usage Monitor]
    end
    
    subgraph "LLM Providers"
        OPENAI[OpenAI]
        ANTHROPIC[Anthropic]
        LOCAL[Local Models]
        MOCK[Mock LLM]
    end
    
    CODE --> SDK
    SDK --> PROXY
    PROXY --> QUOTA
    QUOTA --> CACHE
    CACHE --> OPENAI
    CACHE --> ANTHROPIC
    CACHE --> LOCAL
    
    PROXY --> MONITOR
    QUOTA --> MONITOR
```

---

## Grading Philosophy

### 1. Task Completion Over Implementation

We evaluate **what** the system achieves, not **how** it's implemented internally.

```mermaid
graph TD
    INPUT[Test Input] --> SYSTEM[Candidate System]
    SYSTEM --> OUTPUT[System Output]
    OUTPUT --> EVAL{Evaluation}
    
    EVAL --> Q1[Did it complete the task?]
    EVAL --> Q2[Is the output correct?]
    EVAL --> Q3[Is it efficient?]
    EVAL --> Q4[Is it robust?]
    
    Q1 --> SCORE[Final Score]
    Q2 --> SCORE
    Q3 --> SCORE
    Q4 --> SCORE
```

### 2. Multi-Dimensional Scoring

```mermaid
pie title Score Distribution
    "Correctness" : 40
    "Completeness" : 25
    "Efficiency" : 20
    "Robustness" : 15
```

### 3. Handling Non-Determinism

Since LLM outputs vary, we use:
- **Multiple evaluation runs** (3-5 per test case)
- **Semantic similarity** instead of exact match
- **Rubric-based scoring** for open-ended outputs
- **LLM-as-judge** for quality assessment

---

## Security Considerations

```mermaid
graph TB
    subgraph "Threat Vectors"
        T1[Prompt Injection]
        T2[API Key Theft]
        T3[Token Abuse]
        T4[Data Exfiltration]
    end
    
    subgraph "Mitigations"
        M1[Input Sanitization]
        M2[Key Never in Container]
        M3[Strict Quotas]
        M4[Network Isolation]
    end
    
    T1 -.->|Blocked by| M1
    T2 -.->|Blocked by| M2
    T3 -.->|Blocked by| M3
    T4 -.->|Blocked by| M4
```

---

## Getting Started for Challenge Authors

1. **Read the relevant documentation** based on challenge type
2. **Design test cases** following the patterns in each doc
3. **Set token budgets** using the Token Management guide
4. **Write evaluation scripts** using provided templates
5. **Test locally** with mock LLM before production

---

*Last Updated: January 5, 2026*

