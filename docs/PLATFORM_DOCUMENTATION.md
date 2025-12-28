# 📚 Node/Express Exam Platform - Complete Documentation

> A secure, cheat-resistant online exam platform for evaluating programming skills with real-time proctoring and automated grading.

---

## 📋 Table of Contents

1. [Platform Overview](#platform-overview)
2. [Current Features](#current-features)
3. [Technical Architecture](#technical-architecture)
4. [User Roles & Permissions](#user-roles--permissions)
5. [Proposed Features for Enterprise/College Adoption](#proposed-features-for-enterprisecollege-adoption)
6. [API Reference](#api-reference)
7. [Deployment Guide](#deployment-guide)

---

## 🎯 Platform Overview

The Node/Express Exam Platform is a comprehensive solution for conducting secure online coding assessments. It's designed for:

- **Companies**: Technical hiring assessments, skill evaluations, and coding interviews
- **Colleges/Universities**: Programming exams, lab tests, and certification assessments
- **Training Institutes**: Course assessments and progress tracking

### Key Benefits

| For Organizations | For Candidates |
|-------------------|----------------|
| Prevent cheating with proctoring | Professional coding environment |
| Automated grading saves time | Real-time test feedback |
| Detailed integrity reports | Fair and transparent evaluation |
| Scalable for any batch size | Practice with public tests |

---

## ✅ Current Features

### 🔐 Authentication & Authorization

| Feature | Description |
|---------|-------------|
| **User Registration** | Email/password registration with validation |
| **JWT Authentication** | Secure token-based authentication |
| **Role-Based Access Control** | Three roles: ADMIN, CANDIDATE, REVIEWER |
| **Session Persistence** | Token stored locally, auto-validation on refresh |

### 👨‍💻 Exam Workspace (Monaco Editor)

The exam workspace provides a professional IDE-like experience:

- **Monaco Editor**: Same editor used in VS Code
  - Syntax highlighting for JavaScript/TypeScript
  - Auto-completion and IntelliSense
  - Dark theme optimized for coding
  - Tab-based file management
  
- **File Explorer**: Navigate project files with folder structure
- **Test Output Panel**: Real-time test execution feedback
- **Timer Display**: Countdown with warning colors when time is low
- **Auto-Save**: Files saved every 30 seconds automatically

### 🔒 Proctoring & Integrity

The platform implements multiple layers of cheat prevention:

```
┌─────────────────────────────────────────────────────┐
│                 PROCTORING FEATURES                 │
├─────────────────────────────────────────────────────┤
│ 📍 Tab/Window Tracking                              │
│    • Logs when candidate leaves the exam tab        │
│    • Tracks duration spent outside                  │
│    • Records return events                          │
├─────────────────────────────────────────────────────┤
│ 📺 Fullscreen Enforcement                           │
│    • Requires fullscreen mode to start              │
│    • Logs every fullscreen exit/entry               │
│    • Configurable per exam                          │
├─────────────────────────────────────────────────────┤
│ 📋 Paste Prevention                                 │
│    • Ctrl+V blocked in editor                       │
│    • Context menu paste disabled                    │
│    • Paste attempts logged (without content)        │
│    • Placeholder text inserted instead              │
├─────────────────────────────────────────────────────┤
│ ⏱️ Time Tracking                                    │
│    • Exam time limit enforcement                    │
│    • Auto-submit when time expires                  │
│    • Out-of-window time aggregation                 │
└─────────────────────────────────────────────────────┘
```

### ⚡ Grading System

The automated grading system runs in isolated Docker containers:

- **Public Tests**: Visible to candidates, instant feedback
- **Hidden Tests**: Server-only, prevents hardcoding solutions
- **Docker Isolation**: 
  - Network disabled (`--network none`)
  - Memory/CPU limits
  - Filesystem isolation
  - Time limits enforced

### 📊 Reporting & Analytics

#### Exam Reports
- Total attempts count
- Pass/fail statistics
- Average score calculation
- Individual attempt breakdown

#### Attempt Details
- Time spent on exam
- Score breakdown (public vs hidden tests)
- Grading logs with test output
- Complete proctoring event timeline

#### Admin Dashboard
- Total exams, attempts, candidates
- Recent activity feed
- Quick access to all reports

### 📧 Exam Invitations

- Generate unique invitation links
- Optional expiration time
- Track usage status
- Email-based targeting

### 🧪 Challenge Management

Challenges are reusable exam templates containing:
- **Starter Files**: Initial code provided to candidates
- **Public Tests**: Visible test cases
- **Hidden Tests**: Secret test cases for final grading
- **Dependencies**: NPM packages required
- **Node Version**: Configurable Node.js version

---

## 🏗️ Technical Architecture

```mermaid
graph TB
    subgraph "Frontend (Next.js 14)"
        A[Login/Register] --> B[Dashboard]
        B --> C[Exam Workspace]
        B --> D[Admin Panel]
        C --> E[Monaco Editor]
        C --> F[Proctoring Client]
    end
    
    subgraph "Backend (Express.js)"
        G[Auth API] --> H[JWT Middleware]
        I[Exam API] --> H
        J[Attempt API] --> H
        K[Proctor API] --> H
        L[Report API] --> H
    end
    
    subgraph "Database (PostgreSQL)"
        M[(Users)]
        N[(Exams)]
        O[(Challenges)]
        P[(Attempts)]
        Q[(Proctor Events)]
    end
    
    subgraph "Grading (Docker)"
        R[Job Queue]
        S[Docker Container]
        T[Test Runner]
    end
    
    C -->|API Calls| J
    F -->|Log Events| K
    J -->|Queue Job| R
    R --> S
    S --> T
```

### Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles |
| `challenges` | Exam templates (starter code, tests) |
| `exams` | Exam configurations linking challenges |
| `exam_attempts` | Candidate's exam sessions and results |
| `exam_invitations` | Invitation links for exams |
| `proctor_events` | Individual proctoring event logs |

---

## 👥 User Roles & Permissions

### ADMIN
- Full access to all features
- Create/manage exams and challenges
- View all reports and analytics
- Manage user accounts
- Access dashboard statistics

### REVIEWER
- View exam reports
- Access attempt details
- View proctoring timelines
- Cannot create or modify exams

### CANDIDATE
- View published exams only
- Start and submit attempts
- View own attempt history
- Cannot access admin features

---

## 🚀 Proposed Features for Enterprise/College Adoption

### Phase 1: Essential Features

#### 1. 🏢 Multi-Tenant Organization Support
```
Organizations
├── Company A
│   ├── HR Department (can create assessments)
│   ├── Engineering Team (reviewers)
│   └── Candidates (external applicants)
└── University B
    ├── CS Department
    │   ├── Faculty (admins)
    │   └── Students (candidates)
    └── IT Department
```

**Benefits:**
- Isolated data per organization
- Custom branding per tenant
- Separate billing/usage tracking
- Organization-level admin roles

#### 2. 👨‍🎓 Student/Candidate Batch Management
- **CSV/Excel Import**: Bulk upload students with email, name, roll number
- **Batch Creation**: Group candidates by class, batch, department
- **Auto-Invitation**: Send exam links to entire batches
- **Batch Statistics**: Performance analytics per group

#### 3. 📅 Exam Scheduling & Windows
```
┌───────────────────────────────────────────┐
│          EXAM SCHEDULING OPTIONS          │
├───────────────────────────────────────────┤
│ 📍 Fixed Window                           │
│    Start: Dec 25, 2024 10:00 AM           │
│    End:   Dec 25, 2024 12:00 PM           │
├───────────────────────────────────────────┤
│ 🔄 Flexible Window                        │
│    Available: Dec 25-27, 2024             │
│    Time Limit: 60 minutes from start      │
├───────────────────────────────────────────┤
│ 🔒 Proctored Session                      │
│    Scheduled with live supervision        │
│    Webcam required                        │
└───────────────────────────────────────────┘
```

#### 4. 📱 Mobile Responsiveness
- Responsive design for tablets
- Read-only mobile result viewing
- Push notifications for results

#### 5. 🔗 SSO Integration
- **Google Workspace** (for colleges)
- **Microsoft Azure AD** (for companies)
- **SAML 2.0** support
- **LDAP** integration

---

### Phase 2: Enhanced Features

#### 6. 📹 Advanced Proctoring
| Feature | Description |
|---------|-------------|
| **Webcam Recording** | Optional video recording during exam |
| **Face Detection** | Verify candidate identity |
| **Multiple Face Alert** | Detect if others are present |
| **Audio Monitoring** | Detect suspicious audio |
| **Screen Recording** | Capture candidate's screen |
| **AI Violation Detection** | Auto-flag suspicious behavior |

#### 7. 📊 Advanced Analytics Dashboard
```
┌─────────────────────────────────────────────┐
│           ANALYTICS DASHBOARD               │
├─────────────────────────────────────────────┤
│ 📈 Performance Trends                       │
│    • Batch-wise comparison                  │
│    • Topic-wise breakdown                   │
│    • Historical performance                 │
├─────────────────────────────────────────────┤
│ 🎯 Question Analytics                       │
│    • Difficulty analysis                    │
│    • Time spent per question                │
│    • Common mistakes                        │
├─────────────────────────────────────────────┤
│ 👥 Candidate Analytics                      │
│    • Individual progress tracking           │
│    • Skill gap identification               │
│    • Benchmark comparisons                  │
└─────────────────────────────────────────────┘
```

#### 8. 🎯 Question Bank System
- **Categorized Questions**: By topic, difficulty, type
- **Question Versioning**: Track changes over time
- **Random Selection**: Auto-generate exams from pool
- **Import/Export**: Share questions between exams

#### 9. 🏆 Gamification & Leaderboards
- Public/private leaderboards per exam
- Badges and achievements
- Streak tracking for practice
- Points system

#### 10. 📧 Notification System
- **Email Notifications**
  - Exam invitations
  - Result announcements
  - Deadline reminders
- **In-App Notifications**
  - New exams available
  - Grading completed
  - Admin alerts
- **SMS Notifications** (optional)
  - OTP verification
  - Urgent alerts

---

### Phase 3: Enterprise Features

#### 11. 🔗 LMS Integration
- **Moodle** integration
- **Canvas** integration
- **Blackboard** integration
- **Google Classroom** integration
- Grade sync back to LMS

#### 12. 💳 Payment & Subscription
| Tier | Features |
|------|----------|
| **Free** | 5 exams/month, 50 candidates |
| **Pro** | Unlimited exams, 500 candidates, basic proctoring |
| **Enterprise** | Unlimited everything, advanced proctoring, SSO |

#### 13. 📋 Certificate Generation
- Auto-generate certificates on passing
- Customizable templates
- QR code verification
- Digital signatures
- LinkedIn sharing

#### 14. 🌍 Multi-Language Support
- UI in multiple languages
- RTL support for Arabic/Hebrew
- Challenge descriptions in local languages

#### 15. 🔄 API for Custom Integrations
```javascript
// Example: Custom HRIS Integration
POST /api/v1/organizations/:orgId/candidates
{
  "email": "john@company.com",
  "name": "John Doe",
  "employeeId": "EMP-001",
  "department": "Engineering"
}

// Example: Webhook for Results
POST /webhooks/exam-completed
{
  "attemptId": "...",
  "candidateEmail": "...",
  "score": 85,
  "passed": true
}
```

---

### Phase 4: Advanced Capabilities

#### 16. 🤖 AI-Powered Features
| Feature | Description |
|---------|-------------|
| **Plagiarism Detection** | Compare solutions across candidates |
| **Code Quality Analysis** | Style, complexity, best practices |
| **Auto-Hint Generation** | AI hints for stuck candidates |
| **Difficulty Calibration** | Auto-adjust based on performance |
| **Smart Proctoring** | AI-based cheating detection |

#### 17. 💻 Additional Challenge Types
- **Multiple Choice Questions (MCQ)**
- **Free-form Text Answers**
- **SQL Challenges** (with database sandbox)
- **Frontend Challenges** (HTML/CSS/React)
- **System Design** (diagram-based)
- **Debugging Challenges** (fix broken code)

#### 18. 🎥 Live Interview Mode
- Scheduled 1-on-1 sessions
- Live code sharing
- Video/audio call integration
- Interviewer notes
- Recording for review

#### 19. 📱 Native Mobile Apps
- iOS app for candidates
- Android app for candidates
- Offline mode with sync
- Biometric login

#### 20. 🔐 Compliance & Security
- **GDPR** compliance
- **SOC 2** certification
- **Data Residency** options
- **Audit Logs** for all actions
- **2FA** for all users
- **IP Whitelisting** for corporate use

---

## 📡 API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login with credentials |
| `/api/auth/me` | GET | Get current user info |

### Exams

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/exams` | GET | List all exams |
| `/api/exams` | POST | Create new exam (Admin) |
| `/api/exams/:id` | GET | Get exam details |
| `/api/exams/:id` | PUT | Update exam (Admin) |
| `/api/exams/:id` | DELETE | Delete exam (Admin) |
| `/api/exams/:id/publish` | POST | Publish exam (Admin) |
| `/api/exams/:id/invite` | POST | Create invitation (Admin) |

### Attempts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/attempts` | GET | List user's attempts |
| `/api/attempts` | POST | Start new attempt |
| `/api/attempts/:id` | GET | Get attempt details |
| `/api/attempts/:id/files` | PUT | Save files (auto-save) |
| `/api/attempts/:id/run-tests` | POST | Run public tests |
| `/api/attempts/:id/submit` | POST | Submit for grading |

### Proctoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/proctor/event` | POST | Log proctoring event |
| `/api/proctor/events/:attemptId` | GET | Get events (Admin/Reviewer) |

### Reports

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/reports/dashboard` | GET | Dashboard stats (Admin) |
| `/api/reports/exam/:examId` | GET | Exam report (Admin/Reviewer) |
| `/api/reports/attempt/:attemptId` | GET | Attempt detail (Admin/Reviewer) |

### Challenges

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/challenges` | GET | List challenges (Admin) |
| `/api/challenges` | POST | Create challenge (Admin) |
| `/api/challenges/:id` | GET | Get challenge (Admin) |
| `/api/challenges/:id` | PUT | Update challenge (Admin) |
| `/api/challenges/:id` | DELETE | Delete challenge (Admin) |

---

## 🚀 Deployment Guide

### Prerequisites
- Node.js 20+
- Docker (for grading)
- PostgreSQL database

### Quick Start

```bash
# 1. Clone and install
git clone <repository-url>
cd exam-platform
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database credentials

# 3. Setup database
npm run db:push

# 4. Seed sample data
cd packages/database
npx tsx seed.ts
cd ../..

# 5. Start development servers
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-key

# Frontend URL (for invitation links)
FRONTEND_URL=http://localhost:3000

# API Port
API_PORT=3001
```

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@examplatform.com | admin123 |

---

## 📞 Contact & Support

For inquiries about enterprise deployment or customization:
- Email: [your-email@domain.com]
- Documentation: [Link to detailed docs]
- Issues: [GitHub Issues link]

---

© 2024 Node/Express Exam Platform. All rights reserved.
