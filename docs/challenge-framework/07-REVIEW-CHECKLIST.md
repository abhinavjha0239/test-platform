# Challenge Review Checklist (Pre-publish)

Use this checklist before publishing a challenge to candidates.

## 1) Correctness

- [ ] Problem statement is unambiguous (inputs/outputs, endpoints/UI requirements).
- [ ] Starter files compile/run in the intended runtime without extra setup.
- [ ] Public tests cover the basic “happy path”.
- [ ] Hidden tests cover edge cases and completeness.
- [ ] All requirements are testable via the runner mode selected.

## 2) No false positives

- [ ] A blank implementation fails at least one public test quickly.
- [ ] **No 404/400 trap**:
  - [ ] Any test expecting `404` first proves the endpoint exists (create + read).
  - [ ] Any test expecting `400` first proves the endpoint exists (valid request passes).
- [ ] List endpoints are not trivially satisfied by returning empty arrays (create then list).

## 3) Determinism (low-flake)

- [ ] Tests do not depend on execution order.
- [ ] No external network calls (internet is disabled during test execution).
- [ ] No sleep-based waits (`setTimeout`, `waitForTimeout`) — use expect-based waits.
- [ ] If randomized inputs are used, they only affect *inputs*, not unstable assertions.

## 4) Security / anti-cheat

- [ ] Hidden tests do not reveal:
  - [ ] solution strategy
  - [ ] exact expected values that give away answers
  - [ ] secret tokens/keys
- [ ] Public logs are helpful; hidden logs are minimal and sanitized.
- [ ] Dependency manifests are **grader-managed** via `runner.candidate.generatedFiles`.
- [ ] Candidate cannot modify test/config/dependency files (blocked paths).

## 5) Runner correctness

### For `runner.mode='http'` (backend)

- [ ] Candidate server binds `0.0.0.0` and reads port from `PORT`.
- [ ] `healthPath` exists and reliably returns 200 quickly.
- [ ] `startupTimeoutMs` is realistic.
- [ ] Install/build commands are realistic and do not require candidate-controlled manifests.

### For `runner.mode='playwright'` (frontend/full-stack)

- [ ] App binds `0.0.0.0:$PORT`.
- [ ] Tests use stable selectors (`data-testid` or ARIA roles).
- [ ] No brittle CSS selectors.
- [ ] No timing sleeps.
- [ ] JUnit report is produced (required by grader).

## 6) Performance

- [ ] Install time fits within the configured timeout.
- [ ] Test runtime fits within `timeoutMs`.
- [ ] Memory limit is realistic for the framework (Playwright needs more).

## 7) Candidate experience

- [ ] Public tests provide actionable messages.
- [ ] README explains how to run locally (optional).
- [ ] Difficulty is appropriate for allotted time.
- [ ] No “gotchas” that aren’t stated in the problem statement.


