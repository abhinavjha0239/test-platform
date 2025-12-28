# Node/Express Exam Platform

A secure, cheat-resistant online exam platform for evaluating Node.js and Express.js skills.

## Features

- 🎯 **Fair Evaluation**: Hidden tests with randomized inputs prevent hardcoding
- 🔒 **Cheat Resistance**: Tab/focus tracking, fullscreen monitoring, paste disabled
- ⚡ **Fast Grading**: Docker-isolated test execution with results in seconds
- 📊 **Detailed Reports**: Score breakdown, integrity summary, and proctoring events

## Tech Stack

- **Frontend**: Next.js 14, React, Monaco Editor, Zustand
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (Supabase) + Drizzle ORM
- **Grading**: Docker containers with network isolation

## Project Structure

```
exam-platform/
├── apps/
│   ├── web/         # Next.js frontend
│   └── api/         # Express.js backend
├── packages/
│   ├── database/    # Drizzle schema & migrations
│   └── shared/      # Shared types & validation
├── challenges/      # Exam challenges (starter code + tests)
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for grading)
- PostgreSQL (or use Supabase)

### Setup

1. **Clone and install dependencies:**
   ```bash
   cd exam-platform
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Push database schema:**
   ```bash
   npm run db:push
   ```

4. **Seed sample data:**
   ```bash
   cd packages/database
   npx tsx seed.ts
   ```

5. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - Frontend: http://localhost:3000
   - API: http://localhost:3001

### Default Credentials

- **Admin**: admin@examplatform.com / admin123

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login |
| `/api/exams` | GET/POST | List/Create exams |
| `/api/attempts` | POST | Start exam attempt |
| `/api/attempts/:id/submit` | POST | Submit for grading |
| `/api/proctor/event` | POST | Log proctoring event |
| `/api/reports/exam/:id` | GET | Exam report |

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Supabase (optional)
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# JWT
JWT_SECRET=your-secret-key

# Ports
API_PORT=3001
```

## Proctoring Features

The platform logs (without storing clipboard content):
- **Tab exits**: When candidate switches to another tab/app
- **Fullscreen exits**: When candidate exits fullscreen mode
- **Paste attempts**: When paste is attempted (content replaced with placeholder)
- **Time out-of-window**: Total seconds spent outside the exam window

## Grading System

Tests run in Docker containers with:
- `--network none`: No internet access
- Memory/CPU limits
- Time limits
- Isolated filesystem

## License

MIT
