# Universal Exam & Grading Platform

> **A production-grade, cheat-resistant assessment ecosystem for Web, AI/ML, Web3, and Cloud Engineering.**

Designed for high-stakes technical evaluations, this platform provides secure, isolated, and deterministic grading across diverse technology stacks. It leverages a spot-instance architecture for cost-effective horizontal scaling and supports complex challenge types from full-stack web apps to deep learning model training.

---

## 🚀 Key Capabilities

### 1. Multi-Paradigm Grading Engine
Support for diverse technical domains with specialized runner modes:

- **Web Development**:
  - **Backend**: Node.js, Python (FastAPI/Django), Go, Rust, Java.
  - **Frontend**: React (Vite/CRA), Vue.js with Playwright E2E testing.
  - **Database**: PostgreSQL, MongoDB with isolated or shared instances.

- **AI/ML & Data Science**:
  - **Training**: PyTorch, TensorFlow, Scikit-learn with GPU support.
  - **Inference**: Model deployment and API testing.
  - **Computer Vision**: OpenCV, image processing challenges.
  - **Jupyter**: Notebook execution and cell-based grading.

- **Web3 & Blockchain**:
  - **Solana**: Anchor framework, native Rust, BPF bytecode analysis.
  - **Ethereum**: Solidity smart contracts via Foundry.
  - **NEAR/Substrate**: WASM-based contract evaluation.

- **DevOps & Cloud**:
  - **Docker**: Container orchestration and Dockerfile linting.
  - **Kubernetes**: Manifest validation and cluster simulation.
  - **CI/CD**: GitHub Actions workflow analysis.

### 2. Enterprise-Grade Architecture
Built for reliability and scale:

- **Spot-Instance Native**: Auto-scaling worker fleet on AWS Spot Instances (90% cost savings).
- **Event-Driven Core**: Redis Streams for reliable job queuing and processing.
- **Fault Tolerance**: Automatic retries, dead-letter queues, and graceful interruption handling.
- **Real-Time Feedback**: WebSocket-based progress streaming to candidates.

### 3. Advanced Security & Integrity
Defense-in-depth security model:

- **Network Isolation**: Containers run with `--network none` (internal-only).
- **Filesystem Lockdown**: Read-only root FS, ephemeral tmpfs, no host access.
- **Hidden Tests**: Randomized test values in a separate, unmounted container.
- **Proctoring Suite**: Fullscreen enforcement, tab-switch tracking, copy-paste disabled.

---

## 🛠 Tech Stack

- **Frontend**: Next.js 14, React, Monaco Editor, Tailwind CSS, Zustand
- **Backend**: Express.js, TypeScript, Node.js
- **Database**: PostgreSQL (Supabase/RDS) + Drizzle ORM
- **Infrastructure**: Docker, Redis (Streams/PubSub), AWS EC2 (Spot)

---

## 📂 Project Structure

```
exam-platform/
├── apps/
│   ├── web/           # Next.js candidate & admin dashboard
│   ├── api/           # Central API gateway & orchestration
│   └── grader-go/     # High-performance grading worker (Go)
├── packages/
│   ├── database/      # Shared Drizzle schema & migrations
│   ├── shared/        # Shared Zod types & utilities
│   └── logger/        # Structured logging
├── challenges/        # Challenge definitions & test suites
├── docs/              # Comprehensive architecture documentation
└── docker-compose.yml # Local development orchestration
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 20+
- Docker (Desktop or Engine)
- PostgreSQL (or Supabase)
- Redis

### Setup

1. **Clone and Install:**
   ```bash
   git clone https://github.com/your-org/exam-platform.git
   npm install
   ```

2. **Environment Configuration:**
   ```bash
   cp .env.example .env
   # Update DATABASE_URL and REDIS_URL in .env
   ```

3. **Database Setup:**
   ```bash
   npm run db:push    # Push schema
   npm run db:seed    # Seed initial exams
   ```

4. **Start Services:**
   ```bash
   docker-compose up -d redis postgres  # Start infra
   npm run dev                          # Start apps
   ```

   - **Web**: http://localhost:3000
   - **API**: http://localhost:3001

---

## 📖 Documentation

Detailed specifications available in `/docs`:
- [Grading System Overview](docs/GRADING-SYSTEM-OVERVIEW.md)
- [Spot Scalable Grader Architecture](docs/grader/07-SPOT-SCALABLE-GRADER-PRD.md)
- [ML/AI Grading Spec](docs/ML-AI-GRADING-SPECIFICATION.md)
- [Web3 Grading Spec](docs/WEB3-GRADING-SPECIFICATION.md)

---

## 🛡 License

MIT © 2026 Exam Platform Team
