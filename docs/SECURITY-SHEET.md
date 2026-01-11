# Security & Isolation - Quick Reference

## 🛡️ Container Isolation Matrix

| Protection | Implementation | Threat Mitigated |
|------------|----------------|------------------|
| **Network Isolation** | `--network internal` | Data exfiltration, API calls |
| **Read-Only FS** | `--read-only` | Persistent malware, file tampering |
| **Memory Limit** | `--memory 512m` | Fork bombs, memory exhaustion |
| **CPU Limit** | `--cpus 1` | Crypto mining, DoS |
| **PID Limit** | `--pids-limit 200` | Process bombs |
| **Non-Root User** | `--user 1000:1000` | Privilege escalation |
| **No Swap** | `--memory-swap 512m` | Memory limit bypass |
| **Controlled /tmp** | `--tmpfs /tmp:noexec` | Executable uploads |

## 🔐 Test Security

```
┌────────────────────────────────────────────────────────────────┐
│                    PUBLIC TESTS                                 │
│  • Visible to candidate                                        │
│  • Fixed values for debugging                                  │
│  • Run on "Run Tests" button                                   │
│  • Results: detailed error messages                            │
└────────────────────────────────────────────────────────────────┘
                              │
                              │ Submit
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    HIDDEN TESTS                                 │
│  • NEVER visible to candidate                                  │
│  • Randomized values (Date.now(), Math.random())              │
│  • Run ONLY on final submit                                    │
│  • Results: pass/fail count only                               │
└────────────────────────────────────────────────────────────────┘
```

## 📁 File Access Control

### Blocked Patterns (Cannot Submit)

```
❌ package.json       - Dependency manipulation
❌ package-lock.json  - Dependency manipulation
❌ *.test.js          - Test file tampering
❌ *.spec.js          - Test file tampering
❌ jest.config.*      - Test config tampering
❌ node_modules/      - Module injection
❌ .env               - Environment secrets
❌ Dockerfile         - Container escape
```

### Allowed Extensions

```
✅ .js, .jsx, .ts, .tsx   - JavaScript/TypeScript
✅ .py                     - Python
✅ .go                     - Go
✅ .rs                     - Rust
✅ .css, .html             - Frontend assets
✅ .json (except package*) - Data files
✅ .md                     - Documentation
```

## 🕐 Timing & Limits

| Metric | Value | Purpose |
|--------|-------|---------|
| Container startup | 30s max | Health check timeout |
| Test execution | 30s/test | Prevent infinite loops |
| Total grading | 120s max | Overall timeout |
| Health check interval | 400ms | Server readiness |
| Health check retries | 30 | Startup tolerance |

## 🔄 Grading Flow Security

```
1. Job Queued (Redis)
   └── Authenticated user only
       └── Valid attempt ID
           └── Exam not expired

2. Workspace Creation
   └── Temp directory with unique ID
       └── Path traversal blocked
           └── File content sanitized

3. Container Launch
   └── Pre-defined image only
       └── No host mounts
           └── Isolated network

4. Test Execution
   └── Separate test container
       └── HTTP-only communication
           └── No shared filesystem

5. Result Collection
   └── JSON parsing only
       └── Log sanitization
           └── No stack traces exposed

6. Cleanup
   └── Container force-removed
       └── Network deleted
           └── Temp files purged
```

## 📊 Proctoring Events

| Event | Trigger | Severity |
|-------|---------|----------|
| `TAB_LEAVE` | document.hidden = true | ⚠️ Warning |
| `TAB_RETURN` | document.hidden = false | ℹ️ Info |
| `FOCUS_LOST` | window.blur | ⚠️ Warning |
| `COPY_DETECTED` | Ctrl+C / Cmd+C | 🔴 High |
| `PASTE_DETECTED` | Ctrl+V / Cmd+V | 🔴 High |
| `DEVTOOLS_OPEN` | F12 / Right-click | 🔴 High |

## ✅ Compliance Checklist

- [x] Code never leaves isolated container
- [x] No internet access during grading
- [x] Hidden tests never exposed
- [x] Randomized test values
- [x] Session isolation (one device)
- [x] Automatic timer enforcement
- [x] Tamper-resistant file submission
- [x] Real-time proctor event logging
- [x] Audit trail for all submissions

---

*For detailed documentation, see [GRADING-SYSTEM-OVERVIEW.md](./GRADING-SYSTEM-OVERVIEW.md)*


