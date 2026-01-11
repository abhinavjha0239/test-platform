# Grader System Documentation

This documentation covers the exam platform's code grading system, which is responsible for securely evaluating candidate submissions against public and hidden test cases.

## Table of Contents

1. [**Architecture Overview**](./01-ARCHITECTURE.md)
   - System components and their responsibilities
   - Grader modes comparison
   - Technology stack

2. [**Grading Flow**](./02-GRADING-FLOW.md)
   - End-to-end submission and grading process
   - Job queue mechanics (BullMQ)
   - Real-time result delivery

3. [**Security Model**](./03-SECURITY.md)
   - Threat model and attack vectors
   - Container isolation
   - Hidden test protection
   - Input validation and sanitization

4. [**Challenge Runners**](./04-CHALLENGE-RUNNERS.md)
   - Jest runner (legacy)
   - HTTP blackbox runner (recommended)
   - Playwright E2E runner
   - Multi-runtime support

5. [**Docker Graders**](./05-DOCKER-GRADERS.md)
   - Docker grader implementation
   - Docker blackbox grader
   - Docker Playwright grader
   - Container configuration

6. [**Configuration & Deployment**](./06-CONFIGURATION.md)
   - Environment variables
   - Production deployment checklist
   - Scaling considerations

7. [**Web3 & Blockchain Grading**](../WEB3-GRADING-SPECIFICATION.md) *(New)*
   - Solana/Anchor support specification
   - NEAR and Substrate considerations
   - Blockchain-specific security model
   - Attack vectors and mitigations
   - Edge cases and test design

---

## Quick Start

### Grader Modes

The platform supports three grader modes, set via `GRADER_MODE` environment variable:

| Mode | Security | Use Case |
|------|----------|----------|
| `docker` | ✅ High | **Production recommended** - Full container isolation |
| `sandboxed` | ⚠️ Medium | Development with basic isolation |
| `local` | ❌ None | Development only (blocked in production) |

### Running the Grader Worker

```bash
# Set environment variables
export GRADER_MODE=docker
export REDIS_URL=redis://localhost:6379
export DATABASE_URL=postgres://...

# Start the worker
npm run worker -w @exam-platform/api
```

### Challenge Runner Modes

Challenges can specify their runner configuration:

```typescript
// Legacy Jest runner (in-process)
runner: { mode: 'jest' }

// HTTP blackbox runner (two-container, recommended for APIs)
runner: {
  mode: 'http',
  runtime: 'node',
  candidate: { image: 'node:20-alpine', runCommand: 'node server.js', port: 3000 },
  tests: { framework: 'jest' }
}

// Playwright E2E runner (for React/UI challenges)
runner: {
  mode: 'playwright',
  runtime: 'react',
  candidate: { image: 'node:20-alpine', runCommand: 'npm start', port: 3000 },
  tests: { framework: 'playwright' }
}

// Blockchain runner (for Solana/Web3 challenges) - PLANNED
runner: {
  mode: 'blockchain',
  blockchain: { ecosystem: 'solana', framework: 'anchor' },
  candidate: { image: 'solana-grader', buildCommand: 'anchor build', validatorPort: 8899 },
  tests: { framework: 'mocha' }
}
```

---

## Key Security Features

1. **Container Isolation**: Candidate code runs in ephemeral Docker containers with:
   - Memory and CPU limits
   - Network disabled during test execution
   - Read-only filesystem
   - Non-root user execution

2. **Hidden Test Protection**: 
   - Public and hidden tests run in **separate containers/directories**
   - Hidden test code never reaches candidate container
   - Log sanitization removes hidden test references

3. **Input Validation**:
   - Path traversal prevention
   - Test file injection blocking
   - Blocked file patterns (`.test.js`, `package.json`, etc.)

4. **Resource Limits**:
   - Execution timeout enforcement
   - Memory limits
   - Process spawning limits

