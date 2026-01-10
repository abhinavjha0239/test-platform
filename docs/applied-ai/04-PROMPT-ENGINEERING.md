# Prompt Engineering Challenges

> **Evaluation Framework for Prompt Design and LLM Interaction Skills**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Challenge Categories](#2-challenge-categories)
3. [Evaluation Criteria](#3-evaluation-criteria)
4. [Test Design Patterns](#4-test-design-patterns)
5. [Scoring Methodology](#5-scoring-methodology)
6. [Challenge Templates](#6-challenge-templates)
7. [Anti-Gaming Measures](#7-anti-gaming-measures)
8. [Grading Pipeline](#8-grading-pipeline)

---

## 1. Overview

### What is Prompt Engineering?

```mermaid
graph LR
    TASK[Task/Goal] --> PROMPT[Prompt Design]
    PROMPT --> LLM[Large Language Model]
    LLM --> OUTPUT[Model Output]
    OUTPUT --> EVAL{Evaluation}
    
    EVAL -->|Iterate| PROMPT
    EVAL -->|Success| DONE[Final Prompt]
```

### Why Test Prompt Engineering?

```mermaid
mindmap
  root((Prompt Engineering))
    Critical Skill
      LLM outputs depend on prompts
      10x performance difference possible
      Production AI requires good prompts
    Testable
      Objective metrics possible
      Reproducible evaluation
      Clear success criteria
    Differentiation
      Beyond basic AI knowledge
      Practical skill assessment
      Industry-relevant
```

---

## 2. Challenge Categories

### Category Overview

```mermaid
graph TB
    subgraph "Beginner"
        B1[Zero-Shot Prompting]
        B2[Output Formatting]
        B3[Role Assignment]
    end
    
    subgraph "Intermediate"
        I1[Few-Shot Learning]
        I2[Chain-of-Thought]
        I3[Structured Extraction]
    end
    
    subgraph "Advanced"
        A1[Complex Reasoning]
        A2[Multi-Step Tasks]
        A3[Prompt Optimization]
    end
    
    subgraph "Expert"
        E1[Prompt Injection Defense]
        E2[Adversarial Robustness]
        E3[System Prompt Design]
    end
    
    B1 --> I1 --> A1 --> E1
```

### Challenge Type Matrix

| Type | Description | Key Skill | Difficulty |
|------|-------------|-----------|------------|
| **Zero-Shot** | Single prompt, no examples | Clarity, instruction design | ⭐ |
| **Few-Shot** | Prompt with examples | Example selection, formatting | ⭐⭐ |
| **Chain-of-Thought** | Step-by-step reasoning | Reasoning scaffolding | ⭐⭐ |
| **Output Control** | Specific format required | Format specification | ⭐⭐ |
| **Extraction** | Pull structured data | Schema design | ⭐⭐⭐ |
| **Adversarial** | Handle edge cases | Robustness | ⭐⭐⭐ |
| **Injection Defense** | Prevent attacks | Security awareness | ⭐⭐⭐⭐ |
| **System Design** | Full prompt system | Architecture | ⭐⭐⭐⭐⭐ |

---

## 3. Evaluation Criteria

### Multi-Dimensional Assessment

```mermaid
graph TD
    subgraph "Correctness (40%)"
        C1[Task completed successfully?]
        C2[Output matches requirements?]
        C3[Accurate information?]
    end
    
    subgraph "Robustness (25%)"
        R1[Works across variations?]
        R2[Handles edge cases?]
        R3[Consistent outputs?]
    end
    
    subgraph "Efficiency (20%)"
        E1[Token usage minimal?]
        E2[No unnecessary verbosity?]
        E3[Clear and concise?]
    end
    
    subgraph "Quality (15%)"
        Q1[Output readability?]
        Q2[Format compliance?]
        Q3[Professional tone?]
    end
```

### Evaluation Signals

```mermaid
flowchart LR
    subgraph "Objective Metrics"
        O1[Exact match rate]
        O2[Token efficiency]
        O3[Format compliance]
        O4[Success rate across inputs]
    end
    
    subgraph "Semantic Metrics"
        S1[BERTScore/Similarity]
        S2[Factual accuracy]
        S3[Completeness]
    end
    
    subgraph "LLM-as-Judge"
        L1[Output quality rating]
        L2[Instruction following]
        L3[Reasoning quality]
    end
    
    O1 --> FINAL[Final Score]
    S1 --> FINAL
    L1 --> FINAL
```

---

## 4. Test Design Patterns

### Pattern 1: Format Compliance

```mermaid
flowchart TD
    PROMPT[Candidate Prompt] --> LLM[LLM]
    LLM --> OUTPUT[Model Output]
    
    OUTPUT --> CHECK1{Is JSON valid?}
    CHECK1 -->|No| FAIL1[Format: 0 pts]
    CHECK1 -->|Yes| CHECK2{Has required fields?}
    
    CHECK2 -->|No| FAIL2[Fields: 0 pts]
    CHECK2 -->|Yes| CHECK3{Correct types?}
    
    CHECK3 -->|No| PARTIAL[Partial credit]
    CHECK3 -->|Yes| PASS[Full credit]
```

**Test Case Example:**
```yaml
task: "Extract product information as JSON"
input: "The iPhone 15 Pro costs $999 and has 256GB storage"
expected_format:
  type: "object"
  properties:
    name: {type: "string"}
    price: {type: "number"}
    storage: {type: "string"}
  required: ["name", "price", "storage"]

evaluation:
  - json_valid: 20%
  - schema_compliant: 30%
  - values_correct: 50%
```

### Pattern 2: Consistency Testing

```mermaid
sequenceDiagram
    participant E as Evaluator
    participant P as Candidate Prompt
    participant L as LLM
    
    Note over E,L: Same semantic input, different phrasing
    
    E->>P: Input variant 1: "Summarize this article"
    P->>L: [Prompt + Input]
    L-->>E: Output 1
    
    E->>P: Input variant 2: "Give me a summary of the text"
    P->>L: [Prompt + Input]
    L-->>E: Output 2
    
    E->>P: Input variant 3: "TL;DR this piece"
    P->>L: [Prompt + Input]
    L-->>E: Output 3
    
    E->>E: Compare outputs for consistency
    Note over E: Good prompt → Similar outputs<br/>Poor prompt → Varying outputs
```

### Pattern 3: Edge Case Handling

```mermaid
flowchart TD
    subgraph "Edge Case Types"
        EC1[Empty input]
        EC2[Very long input]
        EC3[Special characters]
        EC4[Ambiguous request]
        EC5[Out-of-domain query]
        EC6[Contradictory information]
    end
    
    subgraph "Expected Behaviors"
        B1[Graceful handling]
        B2[Appropriate truncation/summary]
        B3[Correct escaping]
        B4[Ask for clarification OR make reasonable choice]
        B5[Acknowledge limitations]
        B6[Flag contradiction]
    end
    
    EC1 --> B1
    EC2 --> B2
    EC3 --> B3
    EC4 --> B4
    EC5 --> B5
    EC6 --> B6
```

### Pattern 4: Adversarial Testing

```mermaid
flowchart TD
    subgraph "Attack Types"
        A1[Prompt injection: Ignore above]
        A2[Jailbreak attempts]
        A3[Role confusion]
        A4[Delimiter escape]
    end
    
    subgraph "Defense Expected"
        D1[Maintain original behavior]
        D2[Refuse harmful requests]
        D3[Stay in assigned role]
        D4[Treat as content, not instruction]
    end
    
    A1 -->|Good prompt| D1
    A2 -->|Good prompt| D2
    A3 -->|Good prompt| D3
    A4 -->|Good prompt| D4
    
    A1 -->|Poor prompt| VULN[Vulnerable: Points deducted]
```

---

## 5. Scoring Methodology

### Per-Test-Case Scoring

```mermaid
flowchart TD
    OUTPUT[LLM Output] --> STAGE1[Stage 1: Format Check]
    
    STAGE1 -->|Fail| ZERO[0 points for case]
    STAGE1 -->|Pass| STAGE2[Stage 2: Content Check]
    
    STAGE2 --> CORRECT{Correct answer?}
    CORRECT -->|Yes| FULL[Base: 100%]
    CORRECT -->|Partial| PART[Base: 50-80%]
    CORRECT -->|No| LOW[Base: 0-30%]
    
    FULL --> MODIFIERS
    PART --> MODIFIERS
    LOW --> MODIFIERS
    
    subgraph MODIFIERS[Score Modifiers]
        M1[Token efficiency bonus: +5%]
        M2[Robust to variations: +10%]
        M3[Extra verbose: -5%]
        M4[Inconsistent: -15%]
    end
    
    MODIFIERS --> FINAL[Final Case Score]
```

### Aggregate Scoring

```mermaid
graph TD
    subgraph "Test Suite"
        T1[Test 1: Basic] --> W1[Weight: 10%]
        T2[Test 2: Standard] --> W2[Weight: 20%]
        T3[Test 3: Standard] --> W3[Weight: 20%]
        T4[Test 4: Edge case] --> W4[Weight: 15%]
        T5[Test 5: Edge case] --> W5[Weight: 15%]
        T6[Test 6: Adversarial] --> W6[Weight: 20%]
    end
    
    W1 --> SUM[Weighted Sum]
    W2 --> SUM
    W3 --> SUM
    W4 --> SUM
    W5 --> SUM
    W6 --> SUM
    
    SUM --> NORMALIZE[Normalize to 100]
```

### Efficiency Scoring

```mermaid
graph LR
    subgraph "Token Usage"
        PROMPT_TOKENS[Prompt Tokens]
        OUTPUT_TOKENS[Avg Output Tokens]
        TOTAL[Total per Request]
    end
    
    subgraph "Efficiency Brackets"
        E1["< 200 tokens: Excellent (+10%)"]
        E2["200-500 tokens: Good (+5%)"]
        E3["500-1000 tokens: Acceptable (0%)"]
        E4["> 1000 tokens: Verbose (-5%)"]
    end
    
    TOTAL --> E1
    TOTAL --> E2
    TOTAL --> E3
    TOTAL --> E4
```

---

## 6. Challenge Templates

### Template 1: Classification Prompt

```mermaid
flowchart TD
    subgraph "Challenge"
        GOAL[Classify customer feedback sentiment]
        INPUT[Customer review text]
        OUTPUT[positive / negative / neutral]
    end
    
    subgraph "Test Cases"
        TC1[Clear positive: ⭐⭐⭐⭐⭐ review]
        TC2[Clear negative: Complaint]
        TC3[Mixed: Some good, some bad]
        TC4[Sarcasm: Looks positive, is negative]
        TC5[Edge: Very short or empty]
    end
    
    subgraph "Scoring"
        S1[Accuracy on clear cases: 40%]
        S2[Accuracy on mixed: 25%]
        S3[Handling sarcasm: 20%]
        S4[Edge case handling: 15%]
    end
```

### Template 2: Information Extraction

```mermaid
flowchart TD
    subgraph "Challenge"
        GOAL[Extract meeting details from email]
        INPUT[Email text]
        OUTPUT[JSON: date, time, attendees, agenda]
    end
    
    subgraph "Difficulty Levels"
        L1[Easy: All info explicit]
        L2[Medium: Some info implicit]
        L3[Hard: Multiple meetings mentioned]
        L4[Expert: Conflicting info]
    end
    
    subgraph "Evaluation"
        E1[JSON validity: Required]
        E2[Field accuracy: Per-field scoring]
        E3[Missing data handling: null vs omit]
    end
```

### Template 3: Chain-of-Thought Math

```mermaid
flowchart TD
    subgraph "Challenge"
        GOAL[Solve word problems step-by-step]
        INPUT[Math word problem]
        OUTPUT[Step-by-step solution + answer]
    end
    
    subgraph "Evaluation Points"
        E1[Final answer correct: 50%]
        E2[Steps are logical: 25%]
        E3[Math operations correct: 15%]
        E4[Formatting clear: 10%]
    end
    
    subgraph "Anti-Cheating"
        A1[Random numbers in hidden tests]
        A2[Same structure, different values]
        A3[Cannot memorize answers]
    end
```

### Template 4: System Prompt Design

```mermaid
flowchart TD
    subgraph "Challenge"
        GOAL[Design a system prompt for a customer service bot]
        REQUIREMENTS[Must: Be helpful, Stay on topic, Refuse harmful, Escalate when needed]
    end
    
    subgraph "Test Scenarios"
        S1[Normal query → Helpful response]
        S2[Off-topic → Redirect politely]
        S3[Harmful request → Refuse]
        S4[Complex issue → Escalate]
        S5[Prompt injection → Resist]
    end
    
    subgraph "Scoring"
        SC1[Functionality: 40%]
        SC2[Tone/Brand: 20%]
        SC3[Safety: 25%]
        SC4[Robustness: 15%]
    end
```

### Template 5: Few-Shot Learning

```mermaid
flowchart TD
    subgraph "Challenge"
        GOAL[Create few-shot prompt for code review]
        CONSTRAINT[Maximum 3 examples allowed]
        INPUT[Code snippet to review]
        OUTPUT[Review comments]
    end
    
    subgraph "Evaluation"
        E1[Review quality on test cases]
        E2[Generalization beyond examples]
        E3[Example selection quality]
        E4[Token efficiency]
    end
```

---

## 7. Anti-Gaming Measures

### Preventing Memorization

```mermaid
flowchart TD
    subgraph "Public Tests"
        PT1[Fixed test cases]
        PT2[Visible to candidate]
        PT3[For debugging]
    end
    
    subgraph "Hidden Tests"
        HT1[Different values]
        HT2[Same patterns]
        HT3[Randomized each run]
    end
    
    subgraph "Measures"
        M1[Hidden tests use random seeds]
        M2[Values generated at runtime]
        M3[Same structure, different data]
        M4[Prompt must be general, not specific]
    end
    
    PT1 --> M4
    HT1 --> M1
    HT2 --> M2
    HT3 --> M3
```

### Detecting Overfitting to Public Tests

```mermaid
flowchart TD
    SUBMIT[Candidate Prompt] --> PUBLIC[Run Public Tests]
    PUBLIC --> PSCORE[Public Score]
    
    SUBMIT --> HIDDEN[Run Hidden Tests]
    HIDDEN --> HSCORE[Hidden Score]
    
    PSCORE --> COMPARE{Compare Scores}
    HSCORE --> COMPARE
    
    COMPARE -->|Similar| OK[Normal: Prompt generalizes]
    COMPARE -->|Public >> Hidden| FLAG[Flag: Possible overfitting]
    
    FLAG --> REVIEW[Manual review if needed]
```

### Variation Testing

```mermaid
graph TD
    subgraph "Input Variations"
        V1[Original phrasing]
        V2[Synonym substitution]
        V3[Reordered sentences]
        V4[Added noise/typos]
        V5[Different format same content]
    end
    
    V1 --> TEST[Test with candidate prompt]
    V2 --> TEST
    V3 --> TEST
    V4 --> TEST
    V5 --> TEST
    
    TEST --> CONSISTENCY{Consistent outputs?}
    CONSISTENCY -->|Yes| ROBUST[Robust prompt: Bonus]
    CONSISTENCY -->|No| BRITTLE[Brittle prompt: Penalty]
```

---

## 8. Grading Pipeline

### Execution Flow

```mermaid
flowchart TD
    SUBMIT[Candidate Submits Prompt] --> VALIDATE[Validate Prompt]
    
    VALIDATE --> VALID{Valid format?}
    VALID -->|No| REJECT[Reject submission]
    VALID -->|Yes| PREPARE[Prepare test inputs]
    
    PREPARE --> EXECUTE[Execute Tests]
    
    subgraph EXECUTE[Execute Tests]
        direction TB
        E1[Load test case]
        E2[Insert into prompt template]
        E3[Call LLM via proxy]
        E4[Capture output]
        E5[Record metrics]
    end
    
    EXECUTE --> EVALUATE[Evaluate Outputs]
    
    subgraph EVALUATE[Evaluate Outputs]
        V1[Format validation]
        V2[Content comparison]
        V3[Semantic similarity]
        V4[LLM-as-judge optional]
    end
    
    EVALUATE --> SCORE[Calculate Score]
    SCORE --> REPORT[Generate Report]
```

### LLM Calls Architecture

```mermaid
sequenceDiagram
    participant G as Grader
    participant P as LLM Proxy
    participant L as LLM
    
    G->>P: Configure quota for attempt
    P-->>G: Quota set
    
    loop For each test case
        G->>G: Format: candidate_prompt + test_input
        G->>P: POST /v1/chat/completions
        P->>L: Forward request
        L-->>P: Response
        P-->>G: Response + usage stats
        G->>G: Evaluate output
    end
    
    G->>P: Get total usage
    P-->>G: Token count
    
    G->>G: Factor usage into score
```

### Output Report

```mermaid
graph TD
    subgraph "Report Structure"
        R1[Overall Score]
        R2[Per-Category Breakdown]
        R3[Per-Test Details]
        R4[Token Usage Summary]
        R5[Improvement Suggestions]
    end
    
    R1 --> D1[85/100]
    R2 --> D2[Correctness: 38/40, Robustness: 20/25, ...]
    R3 --> D3[Test 1: Pass, Test 2: Partial, ...]
    R4 --> D4[Avg 342 tokens/request]
    R5 --> D5[Consider more specific output format...]
```

---

## Appendix: Sample Challenge Spec

```yaml
challenge:
  id: sentiment-classification-v1
  name: "Customer Feedback Classifier"
  difficulty: intermediate
  time_limit: 30_minutes
  
  description: |
    Design a prompt that classifies customer feedback into:
    - positive
    - negative  
    - neutral
    
    Your prompt will receive customer review text and must output
    ONLY the classification label (one word, lowercase).

  constraints:
    max_prompt_tokens: 500
    max_output_tokens: 10
    few_shot_examples_allowed: 3

  test_cases:
    public:
      - input: "This product is amazing! Best purchase ever!"
        expected: "positive"
      - input: "Terrible quality. Waste of money."
        expected: "negative"
      - input: "It's okay. Does what it's supposed to."
        expected: "neutral"
    
    hidden:
      - input: "Wow, just wow. NOT impressed at all."  # Sarcasm
        expected: "negative"
      - input: "I guess it works..."
        expected: "neutral"
      # ... more cases with random variations

  scoring:
    accuracy:
      weight: 0.5
      public_cases: 0.3
      hidden_cases: 0.7
    
    robustness:
      weight: 0.25
      variation_tests: 5
      
    efficiency:
      weight: 0.15
      optimal_tokens: 200
      
    consistency:
      weight: 0.10
      runs_per_case: 3

  evaluation:
    exact_match: true
    case_sensitive: false
    trim_whitespace: true
```

---

*Previous: [03-AI-AGENTS.md](./03-AI-AGENTS.md)*  
*Next: [05-TOKEN-MANAGEMENT.md](./05-TOKEN-MANAGEMENT.md) - Token Quota Management*

