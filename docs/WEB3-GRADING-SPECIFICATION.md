# Web3 & Blockchain Code Grading Specification

> **Comprehensive Guide for Grading Smart Contracts and Blockchain Programs**

This document provides a complete specification for extending the exam platform to support Web3 code assessment, with emphasis on Rust-based blockchain ecosystems (Solana, NEAR, Substrate, CosmWasm).

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | Jan 2026 | Addressed production review: IDL secrecy model, Agave toolchain, offline builds, program ID control, capability dropping |
| 1.0 | Jan 2026 | Initial specification |

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Ecosystem Overview](#ecosystem-overview)
3. [Architecture Design](#architecture-design)
4. [Solana/Anchor Implementation](#solanaanchor-implementation)
5. [NEAR Protocol Implementation](#near-protocol-implementation)
6. [Substrate/Ink! Implementation](#substrateink-implementation)
7. [CosmWasm Implementation](#cosmwasm-implementation)
8. [Ethereum/Foundry Implementation](#ethereumfoundry-implementation)
9. [Security Model](#security-model)
10. [Attack Vectors & Mitigations](#attack-vectors--mitigations)
11. [Edge Cases](#edge-cases)
12. [Test Design Principles](#test-design-principles)
13. [Offline Build Strategy](#offline-build-strategy)
14. [Resource Management](#resource-management)
15. [Implementation Checklist](#implementation-checklist)

---

## Executive Summary

### Current State

The exam platform currently supports:

| Runtime | Mode | Test Method |
|---------|------|-------------|
| Node.js (Express) | HTTP Black-box | Jest + Supertest |
| Python (FastAPI/Flask/Django) | HTTP Black-box | Jest + Supertest |
| Go (net/http, Gin) | HTTP Black-box | Jest + Supertest |
| Rust (Axum, Actix) | HTTP Black-box | Jest + Supertest |
| React (Vite) | Playwright E2E | Playwright |

### Web3 Requirements

Web3/blockchain code fundamentally differs from traditional web APIs:

| Aspect | Traditional API | Web3 Smart Contract |
|--------|-----------------|---------------------|
| **Execution** | HTTP server process | Blockchain VM (BPF, WASM) |
| **State** | In-memory/Database | On-chain accounts/storage |
| **Invocation** | HTTP requests | RPC + Transactions |
| **Testing** | Supertest/Axios | Blockchain simulator + SDK |
| **Build** | `npm build` / `cargo build` | `anchor build` / `cargo contract` |
| **Artifact** | Binary/Bundle | Bytecode (`.so`, `.wasm`) |

### Proposed Support Matrix

| Ecosystem | Language | Framework | Priority | Complexity |
|-----------|----------|-----------|----------|------------|
| **Solana** | Rust | Anchor | 🔴 High | Medium |
| **Solana** | Rust | Native | 🟡 Medium | High |
| **NEAR** | Rust | near-sdk | 🟡 Medium | Medium |
| **Substrate** | Rust | Ink! | 🟢 Low | High |
| **CosmWasm** | Rust | cosmwasm-std | 🟢 Low | Medium |
| **Ethereum** | Solidity | Foundry | 🟡 Medium | Low |

---

## Ecosystem Overview

### 1. Solana (Anchor Framework)

**Overview:**
Solana programs are compiled to BPF bytecode and executed by validators. Anchor is a framework that simplifies Solana development with IDL generation and TypeScript client generation.

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOLANA PROGRAM FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  programs/counter/src/lib.rs                                     │
│         │                                                        │
│         ▼ anchor build                                           │
│  target/deploy/counter.so (BPF bytecode)                        │
│         │                                                        │
│         ▼ solana-test-validator                                  │
│  ┌──────────────────────────────────────┐                       │
│  │      Local Validator (port 8899)      │                       │
│  │  ┌─────────────┐  ┌─────────────┐    │                       │
│  │  │   Program   │  │  Accounts   │    │                       │
│  │  │   (BPF)     │  │  (State)    │    │                       │
│  │  └─────────────┘  └─────────────┘    │                       │
│  └──────────────────────────────────────┘                       │
│         ▲                                                        │
│         │ RPC (JSON-RPC over HTTP)                              │
│         │                                                        │
│  ┌──────────────────────────────────────┐                       │
│  │     Test Client (TypeScript/Rust)     │                       │
│  │  - @coral-xyz/anchor                  │                       │
│  │  - sendTransaction()                  │                       │
│  │  - assert account state               │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Files:**
```
project/
├── Anchor.toml              # Project config
├── Cargo.toml               # Workspace manifest
├── programs/
│   └── my_program/
│       ├── Cargo.toml       # Program dependencies
│       └── src/
│           └── lib.rs       # Program logic (candidate writes this)
├── tests/
│   └── my_program.ts        # TypeScript tests (grader provides)
└── target/
    └── deploy/
        └── my_program.so    # Compiled BPF bytecode
```

**Dependencies:**
- Solana CLI (`solana-install`)
- Anchor CLI (`cargo install anchor-cli`)
- Node.js (for TypeScript tests)
- Rust toolchain with BPF target

---

### 2. NEAR Protocol

**Overview:**
NEAR contracts compile to WASM and execute in the NEAR VM. The `near-sdk-rs` provides macros for contract development.

```
┌─────────────────────────────────────────────────────────────────┐
│                      NEAR CONTRACT FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  src/lib.rs (with #[near_bindgen])                              │
│         │                                                        │
│         ▼ cargo build --target wasm32-unknown-unknown           │
│  target/wasm32-unknown-unknown/release/contract.wasm            │
│         │                                                        │
│         ▼ near sandbox                                           │
│  ┌──────────────────────────────────────┐                       │
│  │      NEAR Sandbox (port 3030)         │                       │
│  │  ┌─────────────┐  ┌─────────────┐    │                       │
│  │  │  Contract   │  │   Storage   │    │                       │
│  │  │   (WASM)    │  │   (Trie)    │    │                       │
│  │  └─────────────┘  └─────────────┘    │                       │
│  └──────────────────────────────────────┘                       │
│         ▲                                                        │
│         │ JSON-RPC                                               │
│  ┌──────────────────────────────────────┐                       │
│  │     Test Client (near-workspaces)     │                       │
│  │  - Deploy contract                    │                       │
│  │  - Call methods                       │                       │
│  │  - Assert state changes               │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Files:**
```
project/
├── Cargo.toml               # Contract manifest
├── src/
│   └── lib.rs               # Contract logic (candidate writes)
└── tests/
    └── integration.rs       # Rust integration tests
```

**Grading Approach for NEAR:**

NEAR's official guidance centers around [near-workspaces](https://docs.near.org/sdk/rust/testing/integration-tests) 
(Rust or TypeScript) with a managed Sandbox lifecycle. For two-container secrecy:

1. **Candidate Container**: Builds WASM, deploys to sandbox via RPC
2. **Test Container**: Connects to sandbox RPC, runs workspaces tests
3. **Key Difference**: near-workspaces can deploy contracts via RPC (not just from build artifacts),
   so the test container doesn't need access to candidate's source or target directory

```dockerfile
# NEAR grader image
FROM rust:1.77-slim-bookworm

RUN rustup target add wasm32-unknown-unknown
RUN npm install -g near-cli
RUN curl -sSfL https://github.com/near/sandbox/releases/download/v0.7.0/near-sandbox-linux-x64 \
    -o /usr/local/bin/near-sandbox && chmod +x /usr/local/bin/near-sandbox
```

---

### 3. Substrate/Ink!

**Overview:**
Ink! is Parity's smart contract language for Substrate chains. Contracts compile to WASM and run on Substrate's `pallet-contracts`.

```
┌─────────────────────────────────────────────────────────────────┐
│                      INK! CONTRACT FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  lib.rs (with #[ink::contract])                                 │
│         │                                                        │
│         ▼ cargo contract build                                   │
│  target/ink/contract.wasm + contract.json (metadata)            │
│         │                                                        │
│         ▼ substrate-contracts-node                               │
│  ┌──────────────────────────────────────┐                       │
│  │    Contracts Node (port 9944 WS)      │                       │
│  │  ┌─────────────┐  ┌─────────────┐    │                       │
│  │  │  Contract   │  │   Storage   │    │                       │
│  │  │   (WASM)    │  │   (Trie)    │    │                       │
│  │  └─────────────┘  └─────────────┘    │                       │
│  └──────────────────────────────────────┘                       │
│         ▲                                                        │
│         │ WebSocket RPC                                          │
│  ┌──────────────────────────────────────┐                       │
│  │   Test Client (@polkadot/api)         │                       │
│  │  - Instantiate contract               │                       │
│  │  - Send messages                      │                       │
│  │  - Query storage                      │                       │
│  └──────────────────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Practical Footgun:** ink! and `cargo-contract` require extra native toolchain dependencies
(C++ toolchain, binaryen, etc.). Your Docker image must include these:

```dockerfile
FROM rust:1.77-slim-bookworm

# ink! build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    pkg-config \
    libssl-dev \
    clang \
    cmake \
    binaryen \
    && rm -rf /var/lib/apt/lists/*

# cargo-contract
RUN cargo install cargo-contract --locked

# WASM target
RUN rustup target add wasm32-unknown-unknown

# substrate-contracts-node (for local testing)
RUN curl -sSfL https://github.com/paritytech/substrate-contracts-node/releases/latest/download/substrate-contracts-node-linux.tar.gz \
    | tar -xz -C /usr/local/bin/
```

---

### 4. CosmWasm

**Overview:**
CosmWasm contracts compile to WASM and run on Cosmos SDK chains with the `x/wasm` module.

> ⚠️ **Different Testing Model**: CosmWasm's primary testing approach is `cw-multi-test`, 
> which is an **in-process simulation** rather than a real blockchain node. This doesn't map 
> 1:1 to our validator RPC model.

**Recommended Approach:** For CosmWasm, consider a **single-container test runner** mode where:
1. Candidate source is mounted read-only
2. Tests use `cw-multi-test` for fast, deterministic execution
3. Hidden tests are still kept separate (different test files, run in sequence)

```rust
// Example cw-multi-test hidden test
#[test]
fn test_with_random_values() {
    let mut app = App::default();
    let code_id = app.store_code(contract_code());
    
    // Random values for anti-hardcoding
    let random_amount = rand::thread_rng().gen_range(1..1000000);
    
    let addr = app.instantiate_contract(code_id, ...);
    let res = app.execute_contract(addr, &ExecuteMsg::Deposit { amount: random_amount }, ...);
    
    // Verify state
    let query: BalanceResponse = app.wrap().query_wasm_smart(addr, &QueryMsg::Balance {}).unwrap();
    assert_eq!(query.balance, random_amount);
}
```

---

### 5. Ethereum / Foundry

**Overview:**
Foundry is a fast, portable Ethereum development toolkit. It's the simplest Web3 grading
target due to its all-in-one design and excellent testing support.

**Why Foundry is Great for Grading:**
1. **Single binary**: No complex toolchain setup
2. **Built-in fuzzing**: Excellent for anti-hardcoding (`forge test --fuzz-runs 1000`)
3. **Fast**: Pure Rust implementation, no JavaScript
4. **Deterministic**: Same tests, same results

**Docker Image:**
```dockerfile
FROM ghcr.io/foundry-rs/foundry:latest
# That's it! Foundry image includes forge, cast, anvil, chisel
WORKDIR /app
```

**Fuzzing for Anti-Hardcoding:**

Foundry's fuzz testing is excellent for preventing hardcoded solutions:

```solidity
// test-hidden/Hidden.t.sol
contract HiddenTest is Test {
    Counter counter;
    
    function setUp() public {
        counter = new Counter();
    }
    
    // Fuzz test: Foundry generates random inputs
    function testFuzz_Increment(uint256 times) public {
        vm.assume(times < 1000);  // Bound the input
        
        for (uint256 i = 0; i < times; i++) {
            counter.increment();
        }
        
        assertEq(counter.count(), times);
    }
}
```

**Grading Command:**
```bash
# Run with fuzzing for hidden tests
forge test --match-path test-hidden/*.sol --fuzz-runs 256 --json > results.json
```

---

## Architecture Design

### Runner Mode: `blockchain`

A new runner mode that handles blockchain-specific requirements:

```typescript
interface BlockchainRunner {
  mode: 'blockchain';
  
  // Blockchain-specific settings
  blockchain: {
    ecosystem: 'solana' | 'near' | 'substrate' | 'cosmwasm' | 'ethereum';
    framework?: 'anchor' | 'native' | 'ink' | 'foundry';
    network: 'localnet' | 'devnet';  // Always localnet for grading
  };
  
  // Candidate container (compiles and may run validator)
  candidate: {
    image: string;                    // e.g., 'projectserum/build:v0.29.0'
    workdir: string;
    generatedFiles?: Record<string, string>;
    buildCommand: string;             // e.g., 'anchor build'
    validatorCommand?: string;        // e.g., 'solana-test-validator'
    validatorPort: number;            // e.g., 8899
    healthCheck: {
      type: 'rpc' | 'http';
      endpoint: string;               // e.g., 'http://localhost:8899/health'
      method?: string;                // e.g., 'getHealth' for JSON-RPC
    };
    startupTimeoutMs: number;
  };
  
  // Test container
  tests: {
    framework: 'mocha' | 'jest' | 'cargo-test';
    image: string;
    installCommand: string;
    testCommand: string;
    timeoutMs: number;
    env?: Record<string, string>;
  };
}
```

### Two-Container Architecture

Similar to HTTP black-box mode, but with blockchain-specific communication:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     BLOCKCHAIN GRADING ARCHITECTURE                         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────┐                                   │
│  │     CONTAINER A: Validator/Node      │                                   │
│  │                                       │                                   │
│  │  1. Receive candidate Rust code       │                                   │
│  │  2. Build: anchor build               │                                   │
│  │  3. Start: solana-test-validator      │                                   │
│  │  4. Deploy program automatically      │                                   │
│  │                                       │                                   │
│  │  Exposed: RPC port (8899)             │                                   │
│  │  Mounted: /app (candidate workspace)  │                                   │
│  └───────────────────┬───────────────────┘                                   │
│                      │                                                       │
│                      │ JSON-RPC over HTTP (isolated network)                │
│                      │                                                       │
│  ┌───────────────────▼───────────────────┐                                   │
│  │     CONTAINER B: Test Runner          │                                   │
│  │                                       │                                   │
│  │  - Mocha/Jest test suite              │                                   │
│  │  - @coral-xyz/anchor client           │                                   │
│  │  - Connects to RPC_URL=validator:8899 │                                   │
│  │  - Executes transactions              │                                   │
│  │  - Verifies on-chain state            │                                   │
│  │                                       │                                   │
│  │  NO ACCESS TO:                        │                                   │
│  │  - Candidate source code              │                                   │
│  │  - Program bytecode                   │                                   │
│  │  - Validator internals                │                                   │
│  └───────────────────────────────────────┘                                   │
│                                                                             │
│  ┌───────────────────────────────────────┐                                   │
│  │     ISOLATED DOCKER NETWORK           │                                   │
│  │  - No external internet access        │                                   │
│  │  - Only validator ↔ test traffic      │                                   │
│  └───────────────────────────────────────┘                                   │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Grading Flow

```
1. SUBMISSION
   └── Candidate submits lib.rs (and any other .rs files)
       └── Files saved to database
           └── Job queued in Redis (BullMQ)

2. JOB PICKUP
   └── Grading worker picks up job
       └── Detects runner.mode = 'blockchain'
           └── Routes to blockchain grader

3. WORKSPACE SETUP
   ├── Candidate workspace: /tmp/grader_bc_cand_xxx/
   │   └── programs/my_program/src/lib.rs (candidate code)
   │   └── Anchor.toml (generated)
   │   └── Cargo.toml (generated)
   │
   └── Test workspace: /tmp/grader_bc_test_xxx/
       └── tests/my_program.ts (hidden tests)
       └── package.json
       └── tsconfig.json

4. BUILD PHASE (Container A)
   └── docker run validator-image
       └── anchor build
           └── Compile to BPF bytecode
               └── Generate IDL

5. VALIDATOR STARTUP (Container A, detached)
   └── solana-test-validator --bpf-program <program-id> target/deploy/program.so
       └── Validator starts on port 8899
           └── Program pre-deployed

6. HEALTH CHECK
   └── Poll validator RPC endpoint
       └── Wait for {"jsonrpc":"2.0","result":"ok"} or timeout

7. TEST EXECUTION (Container B)
   └── docker run test-image
       └── npm test (Mocha/Jest)
           └── Connect to RPC_URL
               └── Execute transactions
                   └── Verify account states

8. RESULT PARSING
   └── Parse Mocha/Jest JSON output
       └── Extract pass/fail counts
           └── Sanitize logs

9. CLEANUP
   └── Stop containers
       └── Remove network
           └── Delete temp directories

10. DATABASE UPDATE
    └── Save results
        └── Publish to Redis pub/sub
            └── WebSocket delivers to candidate
```

---

## Solana/Anchor Implementation

### Docker Image Requirements

> ⚠️ **Toolchain Note**: The Solana ecosystem is transitioning from `solana-labs/solana` to `anza-xyz/agave`. 
> This spec uses Agave as the maintained path. Pin specific versions as "tested combinations," not hard doctrine.

```dockerfile
# Dockerfile.solana-grader
FROM rust:1.77-slim-bookworm

# Build arguments for version pinning (update these as tested combos)
ARG SOLANA_VERSION=1.18.22
ARG ANCHOR_VERSION=0.30.1

# Install build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    libudev-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Solana CLI via Agave (the maintained fork)
# See: https://github.com/anza-xyz/agave
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v${SOLANA_VERSION}/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

# Verify Solana installation
RUN solana --version

# Install Anchor CLI via AVM (Anchor Version Manager)
RUN cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
RUN avm install ${ANCHOR_VERSION} && avm use ${ANCHOR_VERSION}

# Install Node.js 20 LTS (for TypeScript tests)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# OFFLINE BUILD SUPPORT: Pre-download and vendor common crates
# This enables fully offline builds with --offline flag
ENV CARGO_HOME=/opt/cargo
RUN mkdir -p /opt/cargo/registry

# Create a template project and fetch ALL dependencies we'll need
RUN mkdir -p /tmp/warmup/programs/template/src && \
    cd /tmp/warmup && \
    echo '[workspace]\nmembers = ["programs/*"]\nresolver = "2"' > Cargo.toml && \
    echo '[package]\nname = "template"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib", "lib"]\n\n[dependencies]\nanchor-lang = "'${ANCHOR_VERSION}'"' > programs/template/Cargo.toml && \
    echo 'use anchor_lang::prelude::*; declare_id!("11111111111111111111111111111111"); #[program] pub mod template {}' > programs/template/src/lib.rs && \
    cargo fetch && \
    cargo build --release 2>/dev/null || true && \
    rm -rf /tmp/warmup

# Create non-root user with proper home directory
RUN useradd -m -u 1000 -s /bin/bash grader && \
    mkdir -p /home/grader/.cargo && \
    chown -R grader:grader /home/grader

# Copy cargo registry to allow offline builds
RUN cp -r /opt/cargo/registry /home/grader/.cargo/ && \
    chown -R grader:grader /home/grader/.cargo

USER grader
ENV CARGO_HOME=/home/grader/.cargo
ENV PATH="/home/grader/.cargo/bin:${PATH}"

WORKDIR /app
```

### Version Compatibility Matrix

> Update this table as you test new version combinations.

| Solana CLI | Anchor CLI | Rust | Node.js | Status |
|------------|------------|------|---------|--------|
| 1.18.22 (Agave) | 0.30.1 | 1.77+ | 20.x | ✅ **Recommended** |
| 1.18.x (Agave) | 0.29.x | 1.75+ | 20.x | ✅ Supported |
| 1.17.x (Legacy) | 0.28.x | 1.70+ | 18.x | ⚠️ Deprecated |

**Migration Notes:**
- Agave (anza-xyz) is the community-maintained Solana validator client
- The `release.anza.xyz` installer replaces `release.solana.com`
- Anchor 0.30+ has breaking changes from 0.29; check your IDL compatibility

### Generated Files (Grader-Controlled)

**Anchor.toml:**
```toml
[features]
seeds = false
skip-lint = false

[programs.localnet]
{{PROGRAM_NAME}} = "{{PROGRAM_ID}}"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "/app/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

**Cargo.toml (Workspace):**
```toml
[workspace]
members = ["programs/*"]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1
```

**programs/{{name}}/Cargo.toml:**
```toml
[package]
name = "{{name}}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "{{name}}"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.30.1"
```

### Program ID Control

> ⚠️ **Critical for Grading**: The grader must ensure the candidate's program is deployed at a 
> **known, fixed program ID** that tests can connect to. Anchor is sensitive to program IDs
> (`declare_id!`, deploy keypair, `Anchor.toml` mapping).

**Strategy: Grader-Controlled Deploy Keypair**

The grader generates a fixed keypair for each challenge and:
1. Provides the matching `declare_id!()` in the starter code
2. Uses that keypair for deployment
3. Passes `PROGRAM_ID` to the test container

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PROGRAM ID CONTROL FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CHALLENGE CREATION (one-time)                                            │
│     ├── Generate keypair: solana-keygen new -o deploy-keypair.json          │
│     ├── Extract pubkey: Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS       │
│     └── Store securely (grader config, not in candidate workspace)          │
│                                                                              │
│  2. STARTER CODE                                                             │
│     └── declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");        │
│         ↑ Candidate sees this, cannot change (or build fails)               │
│                                                                              │
│  3. GRADER BUILD PHASE                                                       │
│     └── anchor build                                                         │
│         └── Validates declare_id! matches Anchor.toml                       │
│                                                                              │
│  4. GRADER DEPLOY PHASE                                                      │
│     └── solana program deploy --program-id deploy-keypair.json              │
│         └── Deploys to exactly Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS │
│                                                                              │
│  5. TEST PHASE                                                               │
│     └── PROGRAM_ID=Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS             │
│         └── Tests connect to known address                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Validation: Fail Fast on ID Mismatch**

If the candidate changes `declare_id!()`, the build should fail:

```typescript
// In grader build phase
async function validateProgramId(candidateDir: string, expectedId: string): Promise<boolean> {
  const libRs = await fs.readFile(path.join(candidateDir, 'programs/counter/src/lib.rs'), 'utf8');
  const match = libRs.match(/declare_id!\s*\(\s*"([^"]+)"\s*\)/);
  
  if (!match) {
    throw new Error('Missing declare_id! macro');
  }
  
  if (match[1] !== expectedId) {
    throw new Error(
      `Program ID mismatch: expected ${expectedId}, found ${match[1]}. ` +
      `Do not modify the declare_id! macro.`
    );
  }
  
  return true;
}
```

**Anchor.toml (Grader-Controlled):**
```toml
[programs.localnet]
counter = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"

[provider]
cluster = "localnet"
wallet = "/app/deploy-keypair.json"  # Grader-provided keypair
```

**Deploy Command:**
```bash
# Grader deploys with specific keypair to ensure deterministic address
anchor deploy --program-keypair /app/deploy-keypair.json
# OR for solana-test-validator:
solana-test-validator \
  --bpf-program Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS \
  target/deploy/counter.so
```

### Example Challenge: Counter Program

**Starter Code (lib.rs):**
```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // TODO: Initialize the counter to 0
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        // TODO: Increment the counter by 1
        Ok(())
    }

    pub fn decrement(ctx: Context<Decrement>) -> Result<()> {
        // TODO: Decrement the counter by 1 (but not below 0)
        Ok(())
    }

    pub fn set(ctx: Context<Set>, value: u64) -> Result<()> {
        // TODO: Set the counter to the given value
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
}

#[derive(Accounts)]
pub struct Decrement<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
}

#[derive(Accounts)]
pub struct Set<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
}

#[account]
pub struct Counter {
    pub count: u64,
}
```

### Critical: IDL Secrecy Model

> ⚠️ **IMPORTANT**: Tests must NOT use `anchor.workspace` or access `target/types/*`.
> 
> Using `anchor.workspace.Counter` requires the candidate's build artifacts (`target/idl/*.json`, 
> `target/types/*`) to exist in the test container. This violates the two-container secrecy model
> and allows candidates to shape IDL output or leak information via build scripts/macros.

**Solution**: Tests load a **grader-provided IDL** (the "known-good spec") and connect to a 
**known program ID**. The candidate's bytecode runs on the validator, but the test container 
never sees the candidate's source, build artifacts, or generated types.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     IDL SECRECY MODEL                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CANDIDATE CONTAINER                    TEST CONTAINER                       │
│  ┌────────────────────┐                ┌────────────────────┐               │
│  │ programs/src/lib.rs │                │ idl/counter.json   │ ← Grader     │
│  │ (candidate code)    │                │ (known-good IDL)   │   provides   │
│  │        │            │                │        │           │               │
│  │        ▼            │                │        ▼           │               │
│  │ anchor build        │                │ new Program(idl,   │               │
│  │        │            │                │   PROGRAM_ID,      │               │
│  │        ▼            │                │   provider)        │               │
│  │ target/deploy/*.so  │                │        │           │               │
│  │ target/idl/*.json   │ ✗ NOT SHARED  │        ▼           │               │
│  │ target/types/*      │ ─────────────▶│ RPC calls only     │               │
│  └────────────────────┘                └────────────────────┘               │
│         │                                       │                            │
│         ▼                                       ▼                            │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │              VALIDATOR (shared via RPC only)                 │            │
│  │  Program deployed at KNOWN_PROGRAM_ID                        │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Grader-Provided IDL (idl/counter.json):**

This is the "contract specification" that tests are written against. Candidates must implement
a program matching this interface.

```json
{
  "version": "0.1.0",
  "name": "counter",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "counter", "isMut": true, "isSigner": true },
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "increment",
      "accounts": [
        { "name": "counter", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "decrement",
      "accounts": [
        { "name": "counter", "isMut": true, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "set",
      "accounts": [
        { "name": "counter", "isMut": true, "isSigner": false }
      ],
      "args": [
        { "name": "value", "type": "u64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Counter",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "count", "type": "u64" }
        ]
      }
    }
  ]
}
```

**Public Tests (TypeScript) - Using Grader-Provided IDL:**
```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";

// Load grader-provided IDL (NOT from candidate's target/)
const idl: Idl = JSON.parse(fs.readFileSync("./idl/counter.json", "utf8"));

// Known program ID (grader controls this via deploy keypair)
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

describe("counter - public tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Create program from grader-provided IDL + known program ID
  // NO access to candidate's workspace or build artifacts
  const program = new Program(idl, PROGRAM_ID, provider);
  
  let counterKeypair: Keypair;

  beforeEach(() => {
    // Fresh keypair for each test
    counterKeypair = Keypair.generate();
  });

  it("initializes the counter", async () => {
    await program.methods
      .initialize()
      .accounts({
        counter: counterKeypair.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterKeypair])
      .rpc();

    const account = await program.account.counter.fetch(counterKeypair.publicKey);
    expect(account.count.toNumber()).to.equal(0);
  });

  it("increments the counter", async () => {
    // First initialize
    await program.methods
      .initialize()
      .accounts({
        counter: counterKeypair.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterKeypair])
      .rpc();

    // Then increment
    await program.methods
      .increment()
      .accounts({ counter: counterKeypair.publicKey })
      .rpc();

    const account = await program.account.counter.fetch(counterKeypair.publicKey);
    expect(account.count.toNumber()).to.equal(1);
  });
});
```

**Hidden Tests (TypeScript) - Using Grader-Provided IDL:**
```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program, Idl } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as fs from "fs";

// Load grader-provided IDL (NOT from candidate's target/)
const idl: Idl = JSON.parse(fs.readFileSync("./idl/counter.json", "utf8"));
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Reproducibility: log seed for deterministic replay of failures
const TEST_SEED = process.env.TEST_SEED || Date.now().toString();
console.log(`[Hidden Tests] Seed: ${TEST_SEED}`);
const seededRandom = (max: number) => {
  // Simple seeded PRNG for reproducibility
  const hash = TEST_SEED.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
  return Math.abs(hash % max);
};

describe("counter - hidden tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idl, PROGRAM_ID, provider);

  it("increments multiple times with random count", async () => {
    const counterKeypair = Keypair.generate();
    const randomIncrements = (seededRandom(10) + 5); // 5-14 increments

    await program.methods
      .initialize()
      .accounts({
        counter: counterKeypair.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterKeypair])
      .rpc();

    for (let i = 0; i < randomIncrements; i++) {
      await program.methods
        .increment()
        .accounts({ counter: counterKeypair.publicKey })
        .rpc();
    }

    const account = await program.account.counter.fetch(counterKeypair.publicKey);
    expect(account.count.toNumber()).to.equal(randomIncrements);
  });

  it("decrement does not go below zero", async () => {
    const counterKeypair = Keypair.generate();

    await program.methods
      .initialize()
      .accounts({
        counter: counterKeypair.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterKeypair])
      .rpc();

    // Try to decrement from 0 - should either error or stay at 0
    try {
      await program.methods
        .decrement()
        .accounts({ counter: counterKeypair.publicKey })
        .rpc();
    } catch (e) {
      // Acceptable: program rejects decrement below 0
    }

    const account = await program.account.counter.fetch(counterKeypair.publicKey);
    expect(account.count.toNumber()).to.equal(0);
  });

  it("set works with random value", async () => {
    const counterKeypair = Keypair.generate();
    const randomValue = seededRandom(1000000) + 1;

    await program.methods
      .initialize()
      .accounts({
        counter: counterKeypair.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counterKeypair])
      .rpc();

    await program.methods
      .set(new anchor.BN(randomValue))
      .accounts({ counter: counterKeypair.publicKey })
      .rpc();

    const account = await program.account.counter.fetch(counterKeypair.publicKey);
    expect(account.count.toNumber()).to.equal(randomValue);
  });
});
```

**Test Container Setup:**

The test container receives:
1. Grader-provided IDL files (`idl/*.json`)
2. Test files (`tests/*.ts`)
3. `package.json` with test dependencies
4. Environment variable `PROGRAM_ID` pointing to deployed program
5. RPC URL to connect to validator

It does **NOT** receive:
- Candidate source code
- Candidate build artifacts (`target/`)
- Candidate's generated types

---

## Security Model

### Threat Model

#### Unique Web3 Threats

| Threat | Description | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Private Key Extraction** | Candidate tries to steal validator keypairs | Critical | Ephemeral keys, no real funds |
| **RPC Abuse** | Flood validator with transactions | Medium | Rate limiting, resource limits |
| **Network Escape** | Reach external devnet/mainnet | Critical | `--internal` Docker network |
| **Test Code Access** | Read hidden test transactions | High | Separate containers, no logs |
| **State Pollution** | Manipulate shared accounts | Medium | Fresh validator per test run |
| **Bytecode Inspection** | Reverse-engineer expected behavior | Medium | Hidden tests use random values |
| **Timeout Exploitation** | Long-running programs DoS validator | Medium | CPU/memory limits, timeouts |
| **Syscall Abuse** | Malicious BPF syscalls | Low | Solana VM sandboxing |

#### Inherited Threats (from HTTP mode)

All threats from the standard grading system apply:
- Path traversal
- Test injection
- Resource exhaustion
- Information leakage

### Defense Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY LAYERS                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  LAYER 1: NETWORK ISOLATION                                              │
│  ├── Build phase: `--network none` (completely offline)                 │
│  ├── Runtime phase: `docker network create --internal` (no egress)      │
│  ├── Validator only reachable from test container via internal network  │
│  ├── No access to devnet/testnet/mainnet                                │
│  └── DNS resolution disabled (no external hostname resolution)          │
│                                                                          │
│  LAYER 2: FILESYSTEM ISOLATION                                           │
│  ├── Read-only root filesystem (`--read-only`)                          │
│  ├── Candidate code in separate mount from tests                         │
│  ├── No access to host filesystem                                        │
│  ├── tmpfs for builds with correct ownership (see below)                │
│  └── Blocked: Cargo.toml, Anchor.toml, test files                       │
│                                                                          │
│  LAYER 3: RESOURCE LIMITS                                                │
│  ├── Memory: 4GB build, 2GB runtime (BPF compilation is memory-heavy)  │
│  ├── CPU: 2 cores (parallel compilation)                                 │
│  ├── PIDs: 500 (more processes for validator)                           │
│  ├── Build timeout: 180 seconds                                          │
│  ├── Test timeout: 120 seconds                                           │
│  └── Disk: 2GB tmpfs for build, 500MB for runtime                       │
│                                                                          │
│  LAYER 4: LINUX SECURITY HARDENING                                       │
│  ├── Drop ALL capabilities (`--cap-drop=ALL`)                           │
│  ├── No new privileges (`--security-opt=no-new-privileges`)             │
│  ├── Non-root user (UID 1000)                                            │
│  ├── Read-only /proc (`--security-opt=proc:ro` where supported)         │
│  └── No setuid/setgid binaries                                           │
│                                                                          │
│  LAYER 5: VALIDATOR ISOLATION                                            │
│  ├── Ephemeral keypairs (regenerated each run)                          │
│  ├── No real SOL/tokens (localnet only)                                 │
│  ├── Fresh state per grading job                                         │
│  ├── Validator stdout/stderr not exposed to candidate                   │
│  ├── Program ID controlled by grader (see Program ID Control)           │
│  └── RPC error logs sanitized (see RPC Log Redaction)                   │
│                                                                          │
│  LAYER 6: TEST SECRECY                                                   │
│  ├── Hidden tests NEVER in candidate container                          │
│  ├── IDL provided by grader (not from candidate build artifacts)        │
│  ├── Transaction details not logged                                      │
│  ├── Random values with reproducible seeds in hidden tests              │
│  ├── Separate accounts per test (no state leakage)                      │
│  └── Sanitized error messages                                            │
│                                                                          │
│  LAYER 7: BPF VM SANDBOXING (Solana-provided)                           │
│  ├── No filesystem access from BPF                                       │
│  ├── No network access from BPF                                          │
│  ├── Limited syscalls (allowlist)                                        │
│  ├── Compute unit limits (200k per ix, ~1.4M per tx)                    │
│  └── Stack limit (4KB) / Heap limit (32KB)                              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Docker Security Configuration

```typescript
// Complete Docker run configuration for blockchain grading
const SECURITY_FLAGS = [
  // Filesystem isolation
  '--read-only',
  
  // Linux capability hardening
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges:true',
  
  // Resource limits
  '--memory', '4g',
  '--memory-swap', '4g',  // No swap
  '--cpus', '2',
  '--pids-limit', '500',
  
  // Non-root execution
  '--user', '1000:1000',
  
  // tmpfs mounts with correct ownership for non-root user
  // IMPORTANT: uid=1000,gid=1000 ensures non-root can write
  '--tmpfs', '/tmp:rw,nosuid,nodev,size=500m,uid=1000,gid=1000',
  '--tmpfs', '/home/grader/.cargo/registry:rw,size=1500m,uid=1000,gid=1000',
];

// Build phase: completely offline
const BUILD_ARGS = [
  ...SECURITY_FLAGS,
  '--network', 'none',  // NO network access during build
];

// Runtime phase: internal network only
const RUNTIME_ARGS = [
  ...SECURITY_FLAGS,
  '--network', networkName,  // Created with: docker network create --internal
];
```

### RPC Log Redaction

> ⚠️ **Critical**: Solana RPC error responses often include program logs in the client-visible 
> failure path. Even if validator stdout isn't exposed, error objects can leak information.

**Problem:** Transaction errors include program logs:
```json
{
  "error": {
    "code": -32002,
    "message": "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1",
    "data": {
      "logs": [
        "Program Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS invoke [1]",
        "Program log: Received value: 42",  // ← Leaks test input!
        "Program log: Expected value: 100", // ← Leaks expected value!
        "Program Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS consumed 5000 of 200000 compute units",
        "Program Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS failed: custom program error: 0x1"
      ]
    }
  }
}
```

**Solution:** Sanitize RPC error responses before returning to candidate:

```typescript
function sanitizeRpcError(error: any): string {
  // Remove program logs entirely from error objects
  if (error?.logs) {
    delete error.logs;
  }
  
  if (error?.data?.logs) {
    delete error.data.logs;
  }
  
  // Return generic error message
  const message = error?.message || String(error);
  
  return message
    // Remove specific values that might leak test data
    .replace(/value:\s*\d+/gi, 'value: [redacted]')
    .replace(/expected:\s*\d+/gi, 'expected: [redacted]')
    .replace(/received:\s*\d+/gi, 'received: [redacted]')
    // Remove internal paths
    .replace(/\/app\/[^\s]+/g, '[path]')
    .replace(/\/home\/grader\/[^\s]+/g, '[path]')
    // Truncate
    .substring(0, 500);
}

// In test result parsing
function parseTestResults(testOutput: string): TestResult {
  return {
    // ... parse pass/fail counts ...
    logs: sanitizeRpcError(testOutput),
  };
}
```

**Test-Side Prevention:**

Tests should catch errors gracefully and not expose details:

```typescript
it("rejects invalid amount", async () => {
  try {
    await program.methods.withdraw(new anchor.BN(0)).rpc();
    expect.fail("Should have rejected zero amount");
  } catch (e: any) {
    // DON'T log the full error (might contain program logs)
    // DO check for expected error type
    expect(e.message).to.include("custom program error");
    // Or check error code if using Anchor errors:
    // expect(e.error?.errorCode?.code).to.equal("InvalidAmount");
  }
});
```

### Blocked Files and Paths

```typescript
const BLOCKCHAIN_BLOCKED_PATHS = [
  // Standard blocks
  '__tests__', 'tests', 'test',
  'node_modules', 'target',
  
  // Anchor/Solana specific
  'anchor.toml',
  'migrations',
  '.anchor',
  'id.json',           // Wallet keypair
  'keypair.json',
  
  // Cargo/Rust
  'cargo.toml',
  'cargo.lock',
  
  // Test artifacts
  '.mocharc',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
  'yarn.lock',
];

const BLOCKCHAIN_BLOCKED_PATTERNS = [
  /\.test\.(ts|js|rs)$/i,
  /\.spec\.(ts|js|rs)$/i,
  /keypair.*\.json$/i,
  /\.so$/i,                    // Compiled programs
  /\.wasm$/i,                  // WASM artifacts
  /anchor\.toml$/i,
  /cargo\.(toml|lock)$/i,
];
```

---

## Attack Vectors & Mitigations

### 1. Test Oracle Attack

**Attack:** Candidate inspects transaction logs to determine what the hidden tests expect.

```rust
// Malicious code that logs incoming instructions
pub fn process_instruction(data: &[u8]) -> ProgramResult {
    msg!("Received data: {:?}", data);  // Leaks test inputs
    // ...
}
```

**Mitigation:**
- Validator logs are NOT exposed to candidate
- Test container runs separately
- Use `solana-test-validator --quiet` to reduce logs
- Sanitize any logs that are returned

### 2. State Pre-computation Attack

**Attack:** Candidate pre-computes expected account states based on known test patterns.

```rust
// Hardcoded response based on known test account
pub fn get_balance(ctx: Context<GetBalance>) -> Result<u64> {
    if ctx.accounts.user.key() == KNOWN_TEST_PUBKEY {
        return Ok(1000);  // Hardcoded answer
    }
    // ...
}
```

**Mitigation:**
- Hidden tests use **randomly generated keypairs** each run
- Account addresses are unpredictable
- Test values are randomized

```typescript
// Hidden test example with randomization
it("transfers random amount", async () => {
  const randomAmount = Math.floor(Math.random() * 1000000) + 1;
  const randomRecipient = anchor.web3.Keypair.generate();
  
  await program.methods
    .transfer(new anchor.BN(randomAmount))
    .accounts({
      from: sender.publicKey,
      to: randomRecipient.publicKey,
    })
    .rpc();
    
  // Verify with the random values
  const balance = await getBalance(randomRecipient.publicKey);
  expect(balance).to.equal(randomAmount);
});
```

### 3. Compute Unit Exhaustion

**Attack:** Candidate writes infinite loop to DoS the validator.

```rust
pub fn malicious(_ctx: Context<Malicious>) -> Result<()> {
    loop {
        // Infinite loop
    }
}
```

**Mitigation:**

Solana's BPF VM enforces compute unit (CU) budgets that halt execution when exhausted:

| Scope | Default Budget | Notes |
|-------|----------------|-------|
| Per instruction | 200,000 CU | Each top-level instruction in a transaction |
| Per transaction | ~1,400,000 CU | Unless explicitly requested via `ComputeBudgetInstruction` |
| Per account per block | Variable | Rate limiting per account |

**Behavior:** When a program exceeds its CU budget, the Solana runtime:
1. Immediately halts program execution
2. Fails the entire transaction with `ComputationalBudgetExceeded`
3. Consumes the transaction fee (disincentivizes abuse)
4. Does NOT affect other transactions or crash the validator

**Defense in Depth:**
- **Primary:** BPF compute limits (enforced by Solana runtime)
- **Secondary:** Docker `--cpus` limit (prevents validator process abuse)
- **Tertiary:** Grader timeout (180 seconds) as outer failsafe

```typescript
// Test containers should set reasonable compute budgets
import { ComputeBudgetProgram } from "@solana/web3.js";

const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  units: 400_000, // 2x default for complex operations
});

// Include in transaction if needed
await program.methods
  .complexOperation()
  .preInstructions([modifyComputeUnits])
  .rpc();
```

### 4. Cross-Program Invocation (CPI) Abuse

**Attack:** Candidate's program calls malicious external programs.

```rust
// Attempt to invoke arbitrary program
pub fn cpi_attack(ctx: Context<Attack>) -> Result<()> {
    let ix = Instruction {
        program_id: MALICIOUS_PROGRAM_ID,
        accounts: vec![],
        data: vec![],
    };
    invoke(&ix, &[])?;
    Ok(())
}
```

**Mitigation:**
- Localnet has **no external programs** deployed
- Only candidate's program and system programs exist
- CPI to unknown programs fails

### 5. Account Data Injection

**Attack:** Candidate tries to read other candidates' data or test fixtures.

**Mitigation:**
- Each grading job gets a **fresh validator**
- No persistent state between jobs
- Accounts are ephemeral

### 6. Anchor IDL Inspection

**Attack:** Candidate reads generated IDL to understand expected interface.

**Mitigation:**
- IDL is generated from **candidate's own code**
- Tests are written against a **known-good IDL** 
- Type mismatches cause test failures (not information leaks)

### 7. Build-Time Code Execution

**Attack:** Malicious build.rs runs arbitrary code during compilation.

```rust
// build.rs
fn main() {
    // Attempt to read test files
    std::fs::read_to_string("/app/tests/hidden.ts").ok();
    
    // Attempt network access
    std::net::TcpStream::connect("evil.com:80").ok();
}
```

**Mitigation:**
- Build runs in candidate container (no test files mounted)
- Network disabled during build (`--network none` for build phase)
- File access limited to candidate workspace
- Read-only root filesystem

```typescript
// Build phase uses isolated network
await dockerRunOnce({
  network: 'none',  // No network during build!
  image: 'solana-grader',
  command: 'anchor build',
  // ...
});

// Only enable network for validator runtime
await dockerRunDetached({
  network: networkName,  // Internal network for RPC
  // ...
});
```

### 8. Proc Macro Attacks

**Attack:** Custom derive macros execute at compile time.

```rust
// Malicious proc macro
#[proc_macro_derive(Exploit)]
pub fn exploit(_: TokenStream) -> TokenStream {
    // Read environment, files, etc.
    std::env::vars().for_each(|(k, v)| {
        eprintln!("{}: {}", k, v);
    });
    TokenStream::new()
}
```

**Mitigation:**
- Only allow **pre-approved dependencies** in Cargo.toml
- Grader controls Cargo.toml (candidate cannot modify)
- Dependency versions are pinned
- Consider cargo-vet or cargo-deny for supply chain security

### 9. Memory/Stack Exhaustion

**Attack:** Allocate huge arrays to crash validator.

```rust
pub fn exhaust_memory(_ctx: Context<Exhaust>) -> Result<()> {
    let huge: Vec<u8> = vec![0; 1024 * 1024 * 100]; // 100MB
    Ok(())
}
```

**Mitigation:**
- BPF heap limit (32KB default)
- BPF stack limit (4KB)
- Docker `--memory` limit
- Validator process limits

### 10. Log Spam Attack

**Attack:** Flood logs to find hidden test patterns.

```rust
pub fn spam_logs(_ctx: Context<Spam>) -> Result<()> {
    for i in 0..10000 {
        msg!("Log entry {}", i);
    }
    Ok(())
}
```

**Mitigation:**
- Validator logs not returned to candidate
- Log output truncated
- `msg!` has per-instruction limits in Solana

---

## Edge Cases

### 1. Build Failures

**Scenario:** Candidate code has syntax errors.

```rust
// Missing semicolon
pub fn broken() -> Result<()> {
    let x = 5  // <-- Error here
    Ok(())
}
```

**Handling:**
```typescript
try {
  await buildProgram();
} catch (error) {
  return {
    passed: 0,
    total: totalTests,
    logs: sanitizeBuildError(error.message),
    success: false,
  };
}

function sanitizeBuildError(log: string): string {
  return log
    // Keep Rust error messages but hide paths
    .replace(/\/app\/programs\/[^:]+:/g, '[source]:')
    .replace(/\/tmp\/[^:]+:/g, '[temp]:')
    // Remove ANSI colors
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Truncate
    .substring(0, 4000);
}
```

### 2. Validator Startup Failure

**Scenario:** Validator crashes on startup (e.g., invalid BPF bytecode).

**Handling:**
```typescript
async function waitForValidator(rpcUrl: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.result === 'ok') return true;
      }
    } catch (e) {
      // Validator not ready yet
    }
    
    await sleep(500);
  }
  
  return false;
}

// In grader
const validatorReady = await waitForValidator(rpcUrl, 60000);
if (!validatorReady) {
  const logs = await getValidatorLogs();
  return {
    passed: 0,
    total: totalTests,
    logs: 'Validator failed to start. Check your program for errors.\n\n' + 
          sanitizeValidatorLogs(logs),
    success: false,
  };
}
```

### 3. Transaction Failures

**Scenario:** Program logic causes transaction to fail.

**Handling:**
- Test framework (Mocha/Jest) catches errors
- Error messages sanitized before returning
- Distinguish between:
  - Program errors (candidate bug)
  - Instruction errors (test bug - shouldn't happen)
  - Network errors (infrastructure issue)

### 4. Account Size Mismatch

**Scenario:** Candidate's account struct doesn't match expected size.

```rust
// Expected by tests
#[account]
pub struct Counter {
    pub count: u64,        // 8 bytes
    pub owner: Pubkey,     // 32 bytes
}

// Candidate wrote
#[account]
pub struct Counter {
    pub count: u64,        // 8 bytes
    // Missing owner field!
}
```

**Handling:**
- Anchor's IDL type checking will catch this
- Test will fail with descriptive error
- Don't leak expected account structure in error

### 5. Program ID Mismatch

**Scenario:** Candidate changes `declare_id!` to a different value.

**Handling:**
- Grader controls `Anchor.toml` with correct program ID
- Build will use grader-specified ID
- Mismatch causes deployment to fail with clear error

### 6. Dependency Version Conflicts

**Scenario:** Candidate's code requires different Anchor version.

**Handling:**
- Grader locks `Cargo.toml` with pinned versions
- Challenge specifies compatible Anchor version
- Clear error message if version mismatch

### 7. Non-Deterministic Behavior

**Scenario:** Candidate uses randomness that causes flaky tests.

```rust
// Problematic: different result each run
pub fn get_value() -> Result<u64> {
    let random = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos() as u64;
    Ok(random % 100)
}
```

**Handling:**
- Tests should account for non-determinism where appropriate
- For deterministic requirements, tests verify specific behavior
- Clock-based values: use `Clock` sysvar which is controlled by validator

### 8. Large Program Size

**Scenario:** Candidate's compiled program exceeds size limit.

**Handling:**
- Solana enforces max program size (upgradeable: ~3MB, non-upgradeable: ~10KB)
- Build will fail with clear error
- Grader timeout prevents infinite compilation

### 9. Missing Accounts in Instruction

**Scenario:** Candidate forgets required account in context.

```rust
// Missing system_program
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    // pub system_program: Program<'info, System>,  // Oops!
}
```

**Handling:**
- Anchor generates helpful compile-time errors
- Test will fail at transaction construction
- Error message helps candidate fix issue

### 10. Reinitialization Vulnerability

**Scenario:** Candidate allows account to be reinitialized.

```rust
// Vulnerable: can be called multiple times
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let counter = &mut ctx.accounts.counter;
    counter.count = 0;  // Always resets!
    Ok(())
}
```

**Testing:**
```typescript
it("prevents double initialization", async () => {
  const counter = anchor.web3.Keypair.generate();
  
  // First init succeeds
  await program.methods.initialize()
    .accounts({ counter: counter.publicKey, ... })
    .signers([counter])
    .rpc();
  
  // Second init should fail
  try {
    await program.methods.initialize()
      .accounts({ counter: counter.publicKey, ... })
      .signers([counter])
      .rpc();
    expect.fail("Should have thrown");
  } catch (e) {
    expect(e.message).to.include("already in use");
  }
});
```

---

## Test Design Principles

### 1. Anti-Hardcoding

All hidden tests must use randomized values:

```typescript
// ❌ BAD: Candidate can hardcode response for "Alice"
it("creates user", async () => {
  await program.methods.createUser("Alice", 25).rpc();
  expect(account.name).to.equal("Alice");
});

// ✅ GOOD: Random name prevents hardcoding
it("creates user with random name", async () => {
  const randomName = `User_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const randomAge = Math.floor(Math.random() * 80) + 18;
  
  await program.methods.createUser(randomName, randomAge).rpc();
  
  const account = await program.account.user.fetch(userPda);
  expect(account.name).to.equal(randomName);
  expect(account.age).to.equal(randomAge);
});
```

### 2. Fresh Accounts Per Test

```typescript
describe("token transfer", () => {
  let sender: anchor.web3.Keypair;
  let recipient: anchor.web3.Keypair;
  
  beforeEach(async () => {
    // Fresh keypairs for each test
    sender = anchor.web3.Keypair.generate();
    recipient = anchor.web3.Keypair.generate();
    
    // Setup accounts...
  });
  
  it("transfers tokens", async () => {
    // Test with fresh accounts
  });
});
```

### 3. Verify Positive Before Negative

```typescript
// ❌ BAD: Might pass if program is completely broken
it("fails on zero amount", async () => {
  try {
    await program.methods.transfer(new anchor.BN(0)).rpc();
    expect.fail();
  } catch (e) {
    expect(e.message).to.include("ZeroAmount");
  }
});

// ✅ GOOD: First verify positive case works
it("fails on zero amount", async () => {
  // Prove the program works for valid input
  const validResult = await program.methods
    .transfer(new anchor.BN(100))
    .rpc();
  expect(validResult).to.exist;
  
  // Now test the error case
  try {
    await program.methods.transfer(new anchor.BN(0)).rpc();
    expect.fail("Should have thrown ZeroAmount error");
  } catch (e) {
    expect(e.message).to.include("ZeroAmount");
  }
});
```

### 4. Test State Changes, Not Transactions

```typescript
// ❌ BAD: Only checks transaction succeeded
it("deposits funds", async () => {
  const tx = await program.methods.deposit(amount).rpc();
  expect(tx).to.exist;  // Just checks tx was sent!
});

// ✅ GOOD: Verify actual state change
it("deposits funds", async () => {
  const balanceBefore = await getBalance(vault);
  
  await program.methods.deposit(new anchor.BN(amount)).rpc();
  
  const balanceAfter = await getBalance(vault);
  expect(balanceAfter - balanceBefore).to.equal(amount);
});
```

### 5. Error Message Matching

```typescript
// Test that specific error is thrown
it("prevents unauthorized access", async () => {
  try {
    await program.methods
      .adminOnly()
      .accounts({ admin: unauthorized.publicKey })
      .signers([unauthorized])
      .rpc();
    expect.fail("Should have thrown Unauthorized");
  } catch (e) {
    // Anchor error codes
    expect(e.error.errorCode.code).to.equal("Unauthorized");
  }
});
```

### 6. Time-Sensitive Tests

```typescript
// Use Clock sysvar for time-based logic
it("unlocks after lockup period", async () => {
  // Create locked account
  await program.methods.lock(new anchor.BN(1000)).rpc();
  
  // Advance validator time (localnet only)
  await advanceClockBy(86400);  // 1 day
  
  // Now unlock should work
  await program.methods.unlock().rpc();
  
  const account = await program.account.vault.fetch(vaultPda);
  expect(account.locked).to.be.false;
});

async function advanceClockBy(seconds: number) {
  const slot = await provider.connection.getSlot();
  // Warp to future slot (each slot ~400ms)
  const slotsToAdvance = Math.ceil(seconds * 2.5);
  await provider.connection.requestAirdrop(
    provider.wallet.publicKey,
    1  // Dummy transaction to advance slot
  );
  // Wait for slots to advance
}
```

### 7. Reproducibility with Seeds

> **Critical**: Hidden tests can randomize values, but should log a seed so failures can be 
> replayed deterministically. The seed is kept internal (not exposed to candidate).

```typescript
// At the top of hidden test file
const TEST_SEED = process.env.TEST_SEED || Date.now().toString();

// Log seed internally (grader captures this, not exposed to candidate)
console.log(`[INTERNAL] Test seed: ${TEST_SEED}`);

// Seeded PRNG for reproducible "random" values
function seededRandom(seed: string, index: number): number {
  // Simple hash-based PRNG
  const hash = (seed + index.toString()).split('').reduce(
    (a, b) => ((a << 5) - a) + b.charCodeAt(0), 0
  );
  return Math.abs(hash);
}

// Usage in tests
it("handles random values reproducibly", async () => {
  const amount = seededRandom(TEST_SEED, 1) % 1000000 + 1;
  const recipient = seededRandom(TEST_SEED, 2) % 1000000;
  
  // If this test fails, re-run with TEST_SEED=<logged-value> to reproduce
  await program.methods.transfer(new anchor.BN(amount)).rpc();
  // ...
});
```

**Grader Integration:**
```typescript
// In grader: generate and pass seed, capture in logs
const testSeed = Date.now().toString();
const result = await runTests({
  env: { TEST_SEED: testSeed },
  // ...
});

// Store seed with grading result (for debugging, not exposed)
await saveGradingMetadata(attemptId, { testSeed, ... });
```

**Why This Matters:**
- Random tests prevent hardcoding
- Seeded randomness allows reproducing failures
- Internal seed logging helps debug candidate issues without exposing test logic

---

## Offline Build Strategy

> ⚠️ **Critical**: Network is disabled during build (`--network none`), but `cargo build` / 
> `anchor build` will fail if dependencies aren't already cached. "Pre-download common crates" 
> in the Dockerfile is **not sufficient** for diverse challenges.

### The Problem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OFFLINE BUILD CHALLENGE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  cargo build --release                                                       │
│       │                                                                      │
│       ▼                                                                      │
│  Downloading crates from crates.io... ❌ BLOCKED (--network none)           │
│                                                                              │
│  Even with pre-warmed cache:                                                │
│  - Different Anchor versions need different crate versions                  │
│  - Challenges may use additional crates (spl-token, mpl-token-metadata)    │
│  - Transitive dependencies can be missing                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Solution Options

Choose **one** strategy based on your operational requirements:

#### Option 1: Fully Vendored Dependencies (Recommended for Exam Integrity)

Each challenge includes a vendored `vendor/` directory with all dependencies pre-downloaded.
Builds use `--offline --locked` flags.

**Pros:** Fully deterministic, zero network during grading
**Cons:** More setup per challenge, larger storage

```dockerfile
# In grader image
ENV CARGO_NET_OFFLINE=true
```

```toml
# Challenge's .cargo/config.toml (grader-generated)
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
```

**Challenge Setup Workflow:**
```bash
# When creating a challenge (one-time, with network)
cd challenge-workspace
cargo vendor vendor/
# Commit vendor/ to challenge definition or store in blob storage
```

**Grader Workflow:**
```bash
# Build phase (no network)
cargo build --release --offline --locked
```

#### Option 2: Pre-Populated Registry Cache (Simpler Setup)

Bake a complete cargo registry into the Docker image for all allowed dependencies.
Enforce `--locked` builds against challenge-provided `Cargo.lock`.

**Pros:** Simpler challenge authoring, shared cache
**Cons:** Image must be rebuilt when adding new allowed dependencies

```dockerfile
# Dockerfile: pre-populate registry with ALL allowed dependencies
RUN mkdir -p /tmp/cache-warmup && cd /tmp/cache-warmup && \
    # Create a Cargo.toml with ALL dependencies you allow
    cat > Cargo.toml << 'EOF'
[package]
name = "cache-warmup"
version = "0.1.0"
edition = "2021"

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
spl-token = "4.0"
spl-associated-token-account = "2.0"
mpl-token-metadata = "3.0"
# ... all allowed crates
EOF
    cargo fetch && \
    rm -rf /tmp/cache-warmup

# Copy registry to user home
RUN cp -r $CARGO_HOME/registry /home/grader/.cargo/
```

**Grader Workflow:**
```bash
# Cargo.lock is grader-generated with pinned versions
cargo build --release --locked
# --locked ensures Cargo.lock is respected, no resolution needed
```

#### Option 3: Internal Crates Mirror (Enterprise Scale)

Run an internal crates.io mirror (e.g., `cargo-cacher`, Artifactory) and allow network 
only to that mirror.

**Pros:** Most flexible, works with any dependencies
**Cons:** Additional infrastructure, harder to audit network access

```dockerfile
# Configure cargo to use internal mirror
ENV CARGO_REGISTRIES_INTERNAL_INDEX=sparse+https://crates-mirror.internal/
ENV CARGO_REGISTRIES_INTERNAL_TOKEN=...
```

```yaml
# Docker network allows only mirror access
networks:
  grader_build:
    driver: bridge
    internal: false
    # Firewall rules to allow only crates-mirror.internal
```

### Recommended Configuration

For exam platforms, we recommend **Option 1 (Vendored)** or **Option 2 (Pre-populated Cache)**:

```typescript
// Challenge runner configuration
interface BlockchainRunner {
  // ...
  build: {
    // Option 1: Vendored
    vendorPath?: string;  // Path to vendor/ in challenge assets
    
    // Option 2: Use image cache
    useImageCache: boolean;
    
    // Always use --locked for reproducibility
    locked: true;
    
    // Always offline
    offline: true;
  };
}
```

**Generated .cargo/config.toml:**
```toml
[build]
# Incremental compilation disabled for reproducibility
incremental = false

[net]
# No network access
offline = true

[term]
# Suppress interactive prompts
quiet = false

# If using vendored dependencies
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "/app/vendor"
```

### Validation: Catch Network Attempts

Even with `--network none`, validate that builds don't attempt network access:

```typescript
async function runOfflineBuild(candidateDir: string): Promise<BuildResult> {
  const result = await dockerRunOnce({
    network: 'none',
    command: 'cargo build --release --offline --locked 2>&1',
    // ...
  });
  
  // Check for network-related errors
  if (result.includes('Downloading') || 
      result.includes('Updating crates.io index') ||
      result.includes('failed to download')) {
    return {
      success: false,
      logs: 'Build requires dependencies not available offline. ' +
            'Please use only the provided dependencies.',
    };
  }
  
  return { success: true, logs: result };
}
```

---

## Resource Management

### Build Phase Resources

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Memory | 4 GB | Rust compilation is memory-intensive |
| CPU | 2 cores | Parallel compilation |
| Disk | 2 GB tmpfs | Cargo cache + build artifacts |
| Time | 180 seconds | Complex programs may take longer |
| Network | **None** (`--network none`) | Prevent fetching during build |

### Runtime Phase Resources

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Memory | 2 GB | Validator + program execution |
| CPU | 2 cores | Validator processing |
| Disk | 500 MB | Ledger storage |
| Time | 120 seconds | All tests must complete |
| Network | Internal only | RPC communication only |

### Test Phase Resources

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Memory | 1 GB | Node.js + Anchor client |
| CPU | 1 core | Test execution |
| Disk | 200 MB | node_modules |
| Time | 120 seconds | Test timeout |
| Network | Internal only | RPC to validator |

### Docker Configuration

```typescript
const BLOCKCHAIN_RESOURCE_CONFIG = {
  build: {
    memory: '4g',
    memorySwap: '4g',
    cpus: '2',
    pidsLimit: 500,
    network: 'none',
    timeout: 180000,
    tmpfs: [
      '/tmp:rw,nosuid,size=500m',
      '/root/.cargo:rw,size=1500m',
    ],
  },
  
  validator: {
    memory: '2g',
    memorySwap: '2g',
    cpus: '2',
    pidsLimit: 300,
    network: 'internal',
    timeout: 120000,
    tmpfs: [
      '/tmp:rw,nosuid,size=300m',
    ],
  },
  
  tests: {
    memory: '1g',
    memorySwap: '1g',
    cpus: '1',
    pidsLimit: 150,
    network: 'internal',
    timeout: 120000,
    tmpfs: [
      '/tmp:rw,nosuid,size=200m',
    ],
  },
};
```

---

## Solana Testing Modes

> When to use `solana-test-validator` vs `solana-program-test`:

| Mode | Use Case | Pros | Cons |
|------|----------|------|------|
| **solana-test-validator** | Integration tests, realistic environment | Full validator behavior, accurate fees/slots | Slower startup (~5s), more resources |
| **solana-program-test** | Unit tests, fast iteration | Sub-second execution, debuggable | Less realistic, in-process only |

**For Grading:** Use `solana-test-validator` for realistic integration testing. The startup 
overhead is acceptable for grading (happens once per submission), and you get accurate 
behavior including proper transaction ordering, compute limits, and error codes.

**For Local Development:** Candidates may want to use `solana-program-test` for faster 
iteration, but their code must work on a real validator for grading.

---

## Implementation Checklist

### Phase 1: Infrastructure

- [ ] Create Solana grader Docker image
  - [ ] Use Agave installer (`release.anza.xyz`) for Solana CLI
  - [ ] Pin tested version combo (Solana 1.18.22, Anchor 0.30.1, Rust 1.77)
  - [ ] Node.js 20+
  - [ ] Full offline cargo registry cache (not just pre-warm)
  - [ ] Non-root user with correct tmpfs ownership
  - [ ] Drop all Linux capabilities (`--cap-drop=ALL`)
  
- [ ] Add `blockchain` runner mode to schema
  - [ ] Update `ChallengeRunner` type
  - [ ] Add ecosystem/framework fields
  - [ ] Add validator configuration
  - [ ] Add `build.offline` and `build.locked` flags
  
- [ ] Implement `docker-blockchain-grader.ts`
  - [ ] Build phase with `--network none` (completely offline)
  - [ ] Validator startup with `--internal` Docker network
  - [ ] Health check (JSON-RPC `getHealth`)
  - [ ] Test execution with grader-provided IDL (not `anchor.workspace`)
  - [ ] Result parsing with RPC log redaction

### Phase 2: Security Hardening

- [ ] Path sanitization for Rust files
- [ ] Blocked file patterns (Cargo.toml, Anchor.toml, target/)
- [ ] Program ID validation (`declare_id!` must match grader config)
- [ ] Network isolation verification (`--network none` for build, `--internal` for runtime)
- [ ] Linux capability hardening (`--cap-drop=ALL`, `--security-opt=no-new-privileges`)
- [ ] tmpfs with correct uid/gid for non-root builds
- [ ] RPC error log redaction (sanitize program logs from error responses)
- [ ] Resource limit testing (4GB build, 2GB runtime, 180s timeout)

### Phase 3: Test Framework

- [ ] Grader-provided IDL loading (`new Program(idl, PROGRAM_ID, provider)`)
- [ ] Mocha/Jest test harness with JSON output
- [ ] Test seed logging for reproducibility (`TEST_SEED=...`)
- [ ] Result JSON parsing
- [ ] Error message sanitization (no program logs, no paths)
- [ ] Hidden test file isolation (separate container, no workspace access)

### Phase 4: Offline Build Strategy

- [ ] Choose offline strategy: vendored deps OR pre-populated cache
- [ ] Implement `--locked --offline` build enforcement
- [ ] Validate no network attempts in build logs
- [ ] Test with cold cache to verify completeness
- [ ] Document allowed dependencies per challenge

### Phase 5: Challenge Development

- [ ] Counter program (beginner) - with grader-provided IDL
- [ ] Token transfer (intermediate) - SPL token integration
- [ ] Escrow (advanced) - PDA derivation, multi-party
- [ ] AMM/DEX (expert) - math-heavy, liquidity pools

### Phase 6: Documentation

- [ ] Challenge authoring guide (IDL-first design)
- [ ] Test writing best practices (randomization, seeds, no `anchor.workspace`)
- [ ] Common error messages and troubleshooting
- [ ] Version compatibility matrix maintenance

---

## Appendix A: Sample Grader Implementation

```typescript
// docker-blockchain-grader.ts (simplified)

import { spawn } from 'child_process';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult, BlockchainRunner } from '@exam-platform/shared';

export async function runBlockchainGrader(job: GradingJob): Promise<GradingResult> {
  const runner = job.runner as BlockchainRunner;
  
  if (runner.blockchain.ecosystem !== 'solana') {
    throw new Error(`Unsupported ecosystem: ${runner.blockchain.ecosystem}`);
  }
  
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  
  const candidateDir = join(tmpdir(), `grader_bc_cand_${job.attemptId}_${timestamp}_${suffix}`);
  const testsDir = join(tmpdir(), `grader_bc_tests_${job.attemptId}_${timestamp}_${suffix}`);
  const networkName = `grader_bc_net_${timestamp}_${suffix}`;
  const validatorName = `grader_bc_val_${timestamp}_${suffix}`;
  
  try {
    // 1. Setup workspaces
    await setupCandidateWorkspace(candidateDir, job.files, runner);
    await setupTestWorkspace(testsDir, job.publicTests, job.hiddenTests, runner);
    
    // 2. Build program (no network)
    const buildResult = await buildProgram(candidateDir, runner);
    if (!buildResult.success) {
      return {
        publicScore: 0,
        hiddenScore: 0,
        totalPublic: countTests(job.publicTests),
        totalHidden: countTests(job.hiddenTests),
        logs: buildResult.logs,
        success: false,
      };
    }
    
    // 3. Create isolated network
    await dockerExec(['network', 'create', '--internal', networkName]);
    
    // 4. Start validator (detached)
    await startValidator(validatorName, networkName, candidateDir, runner);
    
    // 5. Wait for validator health
    const healthy = await waitForValidator(`http://validator:${runner.candidate.validatorPort}`, 60000);
    if (!healthy) {
      const logs = await getValidatorLogs(validatorName);
      return {
        publicScore: 0,
        hiddenScore: 0,
        totalPublic: countTests(job.publicTests),
        totalHidden: countTests(job.hiddenTests),
        logs: sanitizeValidatorLogs(logs),
        success: false,
      };
    }
    
    // 6. Run public tests
    const publicResult = await runTests(testsDir, networkName, 'public', runner);
    
    // 7. Run hidden tests
    const hiddenResult = await runTests(testsDir, networkName, 'hidden', runner);
    
    return {
      publicScore: publicResult.passed,
      hiddenScore: hiddenResult.passed,
      totalPublic: publicResult.total,
      totalHidden: hiddenResult.total,
      logs: publicResult.logs,
      success: publicResult.success && hiddenResult.success,
    };
    
  } finally {
    // Cleanup
    await dockerExec(['rm', '-f', validatorName]).catch(() => {});
    await dockerExec(['network', 'rm', networkName]).catch(() => {});
    await rm(candidateDir, { recursive: true, force: true }).catch(() => {});
    await rm(testsDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

---

## Appendix B: Error Message Catalog

| Error Code | User-Facing Message | Cause |
|------------|---------------------|-------|
| `BUILD_SYNTAX_ERROR` | "Syntax error in your program. Check line X." | Rust compilation failed |
| `BUILD_TYPE_ERROR` | "Type mismatch. Expected X, got Y." | Incorrect types |
| `BUILD_MISSING_IMPORT` | "Missing import: X" | use statement missing |
| `BUILD_TIMEOUT` | "Build took too long. Simplify your code." | >180s compilation |
| `VALIDATOR_CRASH` | "Program crashed on startup. Check your initialization." | BPF execution failed |
| `VALIDATOR_TIMEOUT` | "Program took too long to respond." | Infinite loop or slow |
| `TEST_ASSERTION` | "Test failed: expected X, got Y" | Logic error |
| `TEST_ERROR` | "Transaction failed: X" | Program returned error |
| `TEST_TIMEOUT` | "Tests took too long to complete." | >120s test execution |
| `ACCOUNT_MISMATCH` | "Account structure doesn't match expected." | Wrong account layout |
| `UNAUTHORIZED` | "Unauthorized access attempted." | Missing signer |

---

## Appendix C: Version Compatibility Matrix

| Solana CLI | Anchor CLI | Rust | Node.js | Status |
|------------|------------|------|---------|--------|
| 1.18.x | 0.29.x | 1.75+ | 20.x | ✅ Recommended |
| 1.17.x | 0.28.x | 1.70+ | 18.x | ⚠️ Supported |
| 1.16.x | 0.27.x | 1.68+ | 18.x | ❌ Deprecated |

---

*Document Version: 1.1 | Last Updated: January 2026*

---

## Appendix D: Review Feedback Addressed

This revision addresses the following production review feedback:

| Issue | Resolution |
|-------|------------|
| **Anchor `workspace` conflicts with secrecy** | Tests now load grader-provided IDL via `new Program(idl, PROGRAM_ID, provider)` |
| **Solana toolchain transition to Agave** | Updated to use `release.anza.xyz` installer, documented version matrix |
| **Compute unit limits need precision** | Added accurate CU budgets (200k/ix, ~1.4M/tx) and failure behavior |
| **Offline builds need real strategy** | Added dedicated section with 3 options: vendored, pre-populated cache, mirror |
| **Program ID control not explicit** | Added full Program ID Control section with validation and deploy keypair flow |
| **Linux capability hardening** | Added `--cap-drop=ALL`, `--security-opt=no-new-privileges` to security layers |
| **tmpfs ownership for non-root** | Documented `uid=1000,gid=1000` in tmpfs mount options |
| **RPC log redaction** | Added dedicated RPC Log Redaction section with sanitizer code |
| **Test reproducibility** | Added seed-based randomization with internal logging |
| **NEAR/Substrate/CosmWasm specifics** | Expanded ecosystem sections with testing approaches |
| **Foundry/Ethereum support** | Added Foundry section with fuzzing guidance |

