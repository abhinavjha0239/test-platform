package grader

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

// TestRunResult holds the result of running a set of tests
type TestRunResult struct {
	Passed  int
	Total   int
	Logs    string
	Success bool
	Details []TestCaseResult
}

// TestCaseResult holds the result of a single test case
type TestCaseResult struct {
	Name     string
	Passed   bool
	Expected []map[string]any
	Actual   []map[string]any
	Error    string
}

// RunSQLGrader is the main entry point for SQL challenges
func RunSQLGrader(ctx context.Context, job types.GradingJob, gctx *GraderContext) (types.GradingResult, error) {
	runner := job.Runner
	if runner == nil || runner.Mode != "sql" {
		return failureResult("invalid SQL grader configuration"), nil
	}

	// Determine isolation mode
	isolation := "shared"
	if runner.SqlTests != nil && runner.SqlTests.Isolation != "" {
		isolation = runner.SqlTests.Isolation
	}

	var publicResult, hiddenResult TestRunResult

	// Get student query from files
	studentQuery := ""
	if q, ok := job.Files["query.sql"]; ok {
		studentQuery = q
	} else if q, ok := job.Files["solution.sql"]; ok {
		studentQuery = q
	} else {
		// Try to find any .sql file
		for name, content := range job.Files {
			if strings.HasSuffix(name, ".sql") {
				studentQuery = content
				break
			}
		}
	}

	if strings.TrimSpace(studentQuery) == "" {
		return failureResult("No SQL query submitted"), nil
	}

	// Run public tests
	if len(runner.PublicTests) > 0 {
		if isolation == "shared" {
			publicResult = runSharedPublicTests(ctx, studentQuery, runner, gctx)
		} else {
			publicResult = runIsolatedPublicTests(ctx, studentQuery, runner, job, gctx)
		}
	}

	// Run hidden tests (only on final submit, not preview)
	if !job.IsPreview && len(runner.HiddenTests) > 0 {
		if isolation == "shared" {
			hiddenResult = runSharedHiddenTests(ctx, studentQuery, runner, job, gctx)
		} else {
			hiddenResult = runIsolatedHiddenTests(ctx, studentQuery, runner, job, gctx)
		}
	}

	return types.GradingResult{
		PublicScore: publicResult.Passed,
		HiddenScore: hiddenResult.Passed,
		TotalPublic: publicResult.Total,
		TotalHidden: hiddenResult.Total,
		Logs:        publicResult.Logs,
		Success:     publicResult.Success && (job.IsPreview || hiddenResult.Success),
	}, nil
}

// runSharedPublicTests runs public tests on the shared read-only database
func runSharedPublicTests(ctx context.Context, studentQuery string, runner *types.ChallengeRunner, gctx *GraderContext) TestRunResult {
	if gctx.SQLPool == nil {
		return TestRunResult{Logs: "SQL pool not configured", Success: false}
	}

	passed := 0
	total := len(runner.PublicTests)
	var logs strings.Builder
	var details []TestCaseResult

	timeout := 5 * time.Second
	if runner.SqlTests != nil && runner.SqlTests.TimeoutMs > 0 {
		timeout = time.Duration(runner.SqlTests.TimeoutMs) * time.Millisecond
	}

	for _, test := range runner.PublicTests {
		testCtx, cancel := context.WithTimeout(ctx, timeout)
		result := runSingleSharedTest(testCtx, studentQuery, test, runner, gctx)
		cancel()

		details = append(details, result)

		if result.Passed {
			passed++
			logs.WriteString(fmt.Sprintf("✅ %s: Passed\n", test.Name))
		} else {
			if result.Error != "" {
				logs.WriteString(fmt.Sprintf("❌ %s: %s\n", test.Name, result.Error))
			} else {
				logs.WriteString(fmt.Sprintf("❌ %s: Wrong answer (expected %d rows, got %d rows)\n",
					test.Name, len(result.Expected), len(result.Actual)))
			}
		}
	}

	// Append JSON test details for frontend to parse
	type TestDetailJSON struct {
		Name     string           `json:"name"`
		Passed   bool             `json:"passed"`
		Expected []map[string]any `json:"expected,omitempty"`
		Actual   []map[string]any `json:"actual,omitempty"`
		Error    string           `json:"error,omitempty"`
	}
	jsonDetails := make([]TestDetailJSON, len(details))
	for i, d := range details {
		jsonDetails[i] = TestDetailJSON{
			Name:     d.Name,
			Passed:   d.Passed,
			Expected: d.Expected,
			Actual:   d.Actual,
			Error:    d.Error,
		}
	}
	if jsonBytes, err := json.Marshal(jsonDetails); err == nil {
		logs.WriteString("\n---JSON_TEST_DETAILS---\n")
		logs.Write(jsonBytes)
		logs.WriteString("\n---END_JSON_TEST_DETAILS---\n")
	}

	return TestRunResult{
		Passed:  passed,
		Total:   total,
		Logs:    logs.String(),
		Success: passed == total,
		Details: details,
	}
}

// runSingleSharedTest executes a single test on the shared database
func runSingleSharedTest(ctx context.Context, studentQuery string, test types.SqlPublicTest, runner *types.ChallengeRunner, gctx *GraderContext) TestCaseResult {
	result := TestCaseResult{Name: test.Name}

	conn, err := gctx.SQLPool.Acquire(ctx)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to acquire connection: %v", err)
		return result
	}
	defer conn.Release()

	// Execute in read-only transaction
	tx, err := conn.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		result.Error = fmt.Sprintf("Failed to begin transaction: %v", err)
		return result
	}
	defer tx.Rollback(ctx)

	// Execute student query
	rows, err := tx.Query(ctx, studentQuery)
	if err != nil {
		result.Error = fmt.Sprintf("Query error: %v", err)
		return result
	}

	actual, err := collectRows(rows)
	if err != nil {
		result.Error = fmt.Sprintf("Failed to collect results: %v", err)
		return result
	}
	result.Actual = actual

	// Compare with expected
	expected := test.ExpectedResult
	result.Expected = expected

	orderSensitive := false
	if runner.SqlTests != nil {
		orderSensitive = runner.SqlTests.OrderSensitive
	}

	result.Passed = compareResults(actual, expected, orderSensitive)
	return result
}

// runSharedHiddenTests runs hidden tests on the shared database with reference query comparison
// Uses SQLHiddenPool if available (allows for different/more test data), otherwise falls back to SQLPool
func runSharedHiddenTests(ctx context.Context, studentQuery string, runner *types.ChallengeRunner, job types.GradingJob, gctx *GraderContext) TestRunResult {
	// Use hidden pool if available, otherwise fall back to public pool
	pool := gctx.SQLHiddenPool
	if pool == nil {
		pool = gctx.SQLPool
	}
	if pool == nil {
		return TestRunResult{Logs: "SQL pool not configured", Success: false}
	}

	passed := 0
	total := len(runner.HiddenTests)
	var logs strings.Builder

	timeout := 5 * time.Second
	if runner.SqlTests != nil && runner.SqlTests.TimeoutMs > 0 {
		timeout = time.Duration(runner.SqlTests.TimeoutMs) * time.Millisecond
	}

	for _, test := range runner.HiddenTests {
		testCtx, cancel := context.WithTimeout(ctx, timeout)

		conn, err := pool.Acquire(testCtx)
		if err != nil {
			cancel()
			logs.WriteString(fmt.Sprintf("❌ %s: Connection error\n", test.Name))
			continue
		}

		tx, err := conn.BeginTx(testCtx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
		if err != nil {
			conn.Release()
			cancel()
			logs.WriteString(fmt.Sprintf("❌ %s: Transaction error\n", test.Name))
			continue
		}

		// Execute student query
		studentRows, err := tx.Query(testCtx, studentQuery)
		if err != nil {
			tx.Rollback(testCtx)
			conn.Release()
			cancel()
			logs.WriteString(fmt.Sprintf("❌ %s: Query error\n", test.Name))
			continue
		}
		studentResult, _ := collectRows(studentRows)

		// Execute reference query
		refRows, err := tx.Query(testCtx, test.ReferenceQuery)
		if err != nil {
			tx.Rollback(testCtx)
			conn.Release()
			cancel()
			logs.WriteString(fmt.Sprintf("❌ %s: Reference query error\n", test.Name))
			continue
		}
		refResult, _ := collectRows(refRows)

		tx.Rollback(testCtx)
		conn.Release()
		cancel()

		// Compare
		orderSensitive := false
		if runner.SqlTests != nil {
			orderSensitive = runner.SqlTests.OrderSensitive
		}

		if compareResults(studentResult, refResult, orderSensitive) {
			passed++
			logs.WriteString(fmt.Sprintf("✅ %s: Passed\n", test.Name))
		} else {
			logs.WriteString(fmt.Sprintf("❌ %s: Wrong answer\n", test.Name))
		}
	}

	return TestRunResult{
		Passed:  passed,
		Total:   total,
		Logs:    logs.String(),
		Success: passed == total,
	}
}

// runIsolatedPublicTests runs public tests in isolated containers with setupScript
func runIsolatedPublicTests(ctx context.Context, studentQuery string, runner *types.ChallengeRunner, job types.GradingJob, gctx *GraderContext) TestRunResult {
	// If no container pool or no setupScript, fallback to shared mode
	if gctx.SQLContainerPool == nil {
		slog.Debug("SQLContainerPool is nil, falling back to shared")
		return runSharedPublicTests(ctx, studentQuery, runner, gctx)
	}
	if runner.Database == nil {
		slog.Debug("runner.Database is nil, falling back to shared")
		return runSharedPublicTests(ctx, studentQuery, runner, gctx)
	}
	if runner.Database.SetupScript == "" {
		slog.Debug("empty setupScript, falling back to shared")
		return runSharedPublicTests(ctx, studentQuery, runner, gctx)
	}

	slog.Debug("starting isolated public tests")

	passed := 0
	total := len(runner.PublicTests)
	var logs strings.Builder
	var details []TestCaseResult

	timeout := 10 * time.Second
	if runner.SqlTests != nil && runner.SqlTests.TimeoutMs > 0 {
		timeout = time.Duration(runner.SqlTests.TimeoutMs) * time.Millisecond
	}

	// Acquire a container for this grading session
	container, err := gctx.SQLContainerPool.Acquire(ctx, job.ChallengeID)
	if err != nil {
		return TestRunResult{
			Logs:    fmt.Sprintf("Failed to acquire container: %v", err),
			Success: false,
		}
	}
	defer gctx.SQLContainerPool.Release(ctx, container)

	// Run the setupScript to create tables and insert data
	setupCtx, setupCancel := context.WithTimeout(ctx, 30*time.Second)
	defer setupCancel()

	if err := execSQLOnContainer(setupCtx, container, runner.Database.SetupScript); err != nil {
		return TestRunResult{
			Logs:    fmt.Sprintf("Setup script failed: %v", err),
			Success: false,
		}
	}
	logs.WriteString("✅ Database setup complete\n\n")

	// Run each public test
	for _, test := range runner.PublicTests {
		// Determine which query to run
		queryToRun := studentQuery
		if test.FileName != "" {
			if content, ok := job.Files[test.FileName]; ok {
				queryToRun = content
			} else {
				// File not found
				logs.WriteString(fmt.Sprintf("❌ %s: File '%s' not found\n", test.Name, test.FileName))
				details = append(details, TestCaseResult{
					Name:   test.Name,
					Passed: false,
					Error:  fmt.Sprintf("File '%s' not found in submission", test.FileName),
				})
				continue
			}
		}

		testCtx, cancel := context.WithTimeout(ctx, timeout)
		result := runTestOnContainer(testCtx, container, queryToRun, test, runner)
		cancel()

		details = append(details, result)

		if result.Passed {
			passed++
			logs.WriteString(fmt.Sprintf("✅ %s: Passed\n", test.Name))
		} else {
			if result.Error != "" {
				logs.WriteString(fmt.Sprintf("❌ %s: %s\n", test.Name, result.Error))
			} else {
				logs.WriteString(fmt.Sprintf("❌ %s: Wrong answer (expected %d rows, got %d rows)\n",
					test.Name, len(result.Expected), len(result.Actual)))
			}
		}
	}

	// Append JSON test details for frontend
	type TestDetailJSON struct {
		Name     string           `json:"name"`
		Passed   bool             `json:"passed"`
		Expected []map[string]any `json:"expected,omitempty"`
		Actual   []map[string]any `json:"actual,omitempty"`
		Error    string           `json:"error,omitempty"`
	}
	jsonDetails := make([]TestDetailJSON, len(details))
	for i, d := range details {
		jsonDetails[i] = TestDetailJSON{
			Name:     d.Name,
			Passed:   d.Passed,
			Expected: d.Expected,
			Actual:   d.Actual,
			Error:    d.Error,
		}
	}
	if jsonBytes, err := json.Marshal(jsonDetails); err == nil {
		logs.WriteString("\n---JSON_TEST_DETAILS---\n")
		logs.Write(jsonBytes)
		logs.WriteString("\n---END_JSON_TEST_DETAILS---\n")
	}

	return TestRunResult{
		Passed:  passed,
		Total:   total,
		Logs:    logs.String(),
		Success: passed == total,
		Details: details,
	}
}

// execSQLOnContainer executes SQL on the container
func execSQLOnContainer(ctx context.Context, container *SQLContainer, sqlScript string) error {
	if container.Pool == nil {
		return fmt.Errorf("container pool not initialized")
	}

	slog.Debug("executing setup script", "length", len(sqlScript))

	// Split script into statements respecting string literals
	statements := splitSQLStatements(sqlScript)
	for i, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}

		slog.Debug("executing SQL statement", "index", i+1, "statement", stmt)
		_, err := container.Pool.Exec(ctx, stmt)
		if err != nil {
			slog.Debug("SQL statement failed", "index", i+1, "error", err)
			return fmt.Errorf("setup script statement %d failed: %w", i+1, err)
		}
	}

	// Verify tables were created
	rows, err := container.Pool.Query(ctx, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
	if err != nil {
		slog.Debug("failed to list tables", "error", err)
	} else {
		defer rows.Close()
		var tables []string
		for rows.Next() {
			var t string
			rows.Scan(&t)
			tables = append(tables, t)
		}
		slog.Debug("tables in public schema", "tables", tables)
	}

	return nil
}

// runTestOnContainer runs a single test against the container
func runTestOnContainer(ctx context.Context, container *SQLContainer, studentQuery string, test types.SqlPublicTest, runner *types.ChallengeRunner) TestCaseResult {
	result := TestCaseResult{Name: test.Name}

	if container.Pool == nil {
		result.Error = "Container pool not initialized"
		return result
	}

	// Check if this is a multi-statement query (transaction-based)
	trimmedQuery := strings.TrimSpace(studentQuery)
	isMultiStatement := strings.Contains(strings.ToUpper(trimmedQuery), "BEGIN") ||
		strings.Contains(trimmedQuery, ";") && len(splitSQLStatements(trimmedQuery)) > 1

	var actual []map[string]any
	var err error

	if isMultiStatement {
		// Handle multi-statement SQL (e.g., BEGIN; INSERT...; SELECT...; COMMIT;)
		actual, err = executeMultiStatementSQL(ctx, container, trimmedQuery)
		if err != nil {
			result.Error = fmt.Sprintf("Query error: %v", err)
			return result
		}
	} else {
		// Execute single statement query
		rows, err := container.Pool.Query(ctx, studentQuery)
		if err != nil {
			result.Error = fmt.Sprintf("Query error: %v", err)
			return result
		}

		actual, err = collectRows(rows)
		if err != nil {
			result.Error = fmt.Sprintf("Failed to collect results: %v", err)
			return result
		}
	}

	result.Actual = actual
	result.Expected = test.ExpectedResult

	// Compare results
	orderSensitive := runner.SqlTests != nil && runner.SqlTests.OrderSensitive
	result.Passed = compareResults(actual, result.Expected, orderSensitive)
	return result
}

// executeMultiStatementSQL handles transaction-based SQL with multiple statements
func executeMultiStatementSQL(ctx context.Context, container *SQLContainer, sql string) ([]map[string]any, error) {
	statements := splitSQLStatements(sql)
	var lastSelectResult []map[string]any

	for _, stmt := range statements {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}

		upperStmt := strings.ToUpper(stmt)

		// Skip BEGIN/COMMIT/ROLLBACK - pgx handles transactions differently
		if upperStmt == "BEGIN" || upperStmt == "COMMIT" || upperStmt == "ROLLBACK" {
			continue
		}

		// Check if this is a SELECT or CTE with SELECT (returns rows)
		isSelect := strings.HasPrefix(upperStmt, "SELECT") ||
			(strings.HasPrefix(upperStmt, "WITH") && strings.Contains(upperStmt, "SELECT"))

		if isSelect {
			rows, err := container.Pool.Query(ctx, stmt)
			if err != nil {
				return nil, fmt.Errorf("SELECT error: %v", err)
			}
			lastSelectResult, err = collectRows(rows)
			if err != nil {
				return nil, fmt.Errorf("failed to collect SELECT results: %v", err)
			}
		} else {
			// Execute non-SELECT statements (INSERT, UPDATE, DELETE, etc.)
			_, err := container.Pool.Exec(ctx, stmt)
			if err != nil {
				return nil, fmt.Errorf("statement error: %v", err)
			}
		}
	}

	return lastSelectResult, nil
}

// splitSQLStatements splits SQL by semicolons, respecting string literals
func splitSQLStatements(sql string) []string {
	var statements []string
	var current strings.Builder
	inString := false
	stringChar := rune(0)

	for i, ch := range sql {
		if !inString && (ch == '\'' || ch == '"') {
			inString = true
			stringChar = ch
			current.WriteRune(ch)
		} else if inString && ch == stringChar {
			// Check for escaped quote
			if i+1 < len(sql) && rune(sql[i+1]) == stringChar {
				current.WriteRune(ch)
			} else {
				inString = false
				current.WriteRune(ch)
			}
		} else if !inString && ch == ';' {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
		} else {
			current.WriteRune(ch)
		}
	}

	// Don't forget the last statement (may not end with semicolon)
	if stmt := strings.TrimSpace(current.String()); stmt != "" {
		statements = append(statements, stmt)
	}

	return statements
}

// runIsolatedHiddenTests runs hidden tests in isolated containers with random data
// Uses ONE container for ALL tests - resets state between each test
func runIsolatedHiddenTests(ctx context.Context, studentQuery string, runner *types.ChallengeRunner, job types.GradingJob, gctx *GraderContext) TestRunResult {
	if gctx.SQLContainerPool == nil {
		// Fallback to shared mode if container pool not configured
		return runSharedHiddenTests(ctx, studentQuery, runner, job, gctx)
	}

	passed := 0
	total := len(runner.HiddenTests)
	var logs strings.Builder

	// Acquire ONE container for ALL hidden tests
	studentContainer, err := gctx.SQLContainerPool.Acquire(ctx, job.ChallengeID)
	if err != nil {
		return TestRunResult{
			Logs:    fmt.Sprintf("❌ Container acquisition failed: %v\n", err),
			Success: false,
		}
	}
	defer gctx.SQLContainerPool.Release(ctx, studentContainer)

	// Determine setup script (same for all tests)
	setupScript := runner.Database.SetupScript
	if runner.Database.HiddenSetupScript != "" {
		setupScript = runner.Database.HiddenSetupScript
	}

	for _, test := range runner.HiddenTests {
		// Reset container state for this test (drop all tables, re-run setup)
		resetSQL := `
			DO $$ DECLARE
				r RECORD;
			BEGIN
				FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE 'pg_%') LOOP
					EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
				END LOOP;
			END $$;
		`
		if err := execSQL(ctx, studentContainer, resetSQL); err != nil {
			logs.WriteString(fmt.Sprintf("❌ %s: Container reset failed\n", test.Name))
			continue
		}

		// Run setup on student container
		if err := execSQLOnContainer(ctx, studentContainer, setupScript); err != nil {
			logs.WriteString(fmt.Sprintf("❌ %s: Student container setup failed: %v\n", test.Name, err))
			continue
		}

		// Get connection from hidden pool and run setup there too
		// Use Acquire() instead of AcquireForChallenge() since we're running setup in a transaction
		// and don't need challenge-specific schema (tables are created fresh each test)
		hiddenPool := gctx.SQLHiddenPool
		if hiddenPool == nil {
			hiddenPool = gctx.SQLPool
		}
		if hiddenPool == nil {
			logs.WriteString(fmt.Sprintf("❌ %s: No SQL pool configured for hidden tests\n", test.Name))
			continue
		}
		hiddenConn, err := hiddenPool.Acquire(ctx)
		if err != nil {
			logs.WriteString(fmt.Sprintf("❌ %s: Hidden pool connection failed: %v\n", test.Name, err))
			continue
		}

		// Run setup on hidden pool (in a transaction we'll rollback after)
		tx, err := hiddenConn.Begin(ctx)
		if err != nil {
			logs.WriteString(fmt.Sprintf("❌ %s: Hidden pool transaction failed\n", test.Name))
			hiddenConn.Release()
			continue
		}

		// Execute setup in transaction
		if _, err := tx.Exec(ctx, setupScript); err != nil {
			logs.WriteString(fmt.Sprintf("❌ %s: Hidden pool setup failed: %v\n", test.Name, err))
			tx.Rollback(ctx)
			hiddenConn.Release()
			continue
		}

		// If dataGenerator configured, inject random data (same seed for both)
		if test.DataGenerator != nil {
			seed := hashSeed(job.AttemptID + test.Name)
			randomSQL := generateRandomInserts(seed, test.DataGenerator)

			if err := execSQL(ctx, studentContainer, randomSQL); err != nil {
				logs.WriteString(fmt.Sprintf("❌ %s: Data injection failed\n", test.Name))
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}
			// Same random data on hidden pool
			if _, err := tx.Exec(ctx, randomSQL); err != nil {
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}
		}

		// Determine which query to run
		queryToRun := studentQuery
		if test.FileName != "" {
			if content, ok := job.Files[test.FileName]; ok {
				queryToRun = content
			} else {
				logs.WriteString(fmt.Sprintf("❌ %s: File '%s' not found\n", test.Name, test.FileName))
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}
		}

		var studentResult []map[string]any
		var refResult []map[string]any

		// Check if we need mutation validation
		validationQuery := test.ValidationQuery
		if validationQuery == "" && test.DataGenerator != nil {
			validationQuery = fmt.Sprintf("SELECT * FROM %s ORDER BY 1", test.DataGenerator.Table)
		}

		if validationQuery != "" {
			// Mutation Mode: Exec then Validate
			if err := execSQL(ctx, studentContainer, queryToRun); err != nil {
				logs.WriteString(fmt.Sprintf("❌ %s: Student query failed: %v\n", test.Name, err))
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}
			// Run reference mutation on hidden pool
			if _, err := tx.Exec(ctx, test.ReferenceQuery); err != nil {
				logs.WriteString(fmt.Sprintf("❌ %s: Reference query failed\n", test.Name))
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}

			studentResult = queryRowsFromContainer(ctx, studentContainer, validationQuery)
			// Get reference result from hidden pool transaction
			refRows, err := tx.Query(ctx, validationQuery)
			if err == nil {
				refResult, _ = collectRows(refRows)
			}
		} else {
			// Selection Mode: Query and Collect
			sRows, err := studentContainer.Pool.Query(ctx, queryToRun)
			if err != nil {
				logs.WriteString(fmt.Sprintf("❌ %s: Student query error: %v\n", test.Name, err))
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}
			studentResult, _ = collectRows(sRows)

			// Run reference query on hidden pool (server-side, NOT in student container)
			rRows, err := tx.Query(ctx, test.ReferenceQuery)
			if err != nil {
				logs.WriteString(fmt.Sprintf("❌ %s: Reference query error: %v\n", test.Name, err))
				tx.Rollback(ctx)
				hiddenConn.Release()
				continue
			}
			refResult, _ = collectRows(rRows)
		}

		// Rollback transaction to clean up hidden pool state (we don't want to persist)
		tx.Rollback(ctx)
		hiddenConn.Release()

		// Compare
		orderSensitive := false
		if runner.SqlTests != nil {
			orderSensitive = runner.SqlTests.OrderSensitive
		}

		if compareResults(studentResult, refResult, orderSensitive) {
			passed++
			logs.WriteString(fmt.Sprintf("✅ %s: Passed\n", test.Name))
		} else {
			logs.WriteString(fmt.Sprintf("❌ %s: Wrong answer\n", test.Name))
		}
	}

	return TestRunResult{
		Passed:  passed,
		Total:   total,
		Logs:    logs.String(),
		Success: passed == total,
	}
}

// collectRows converts pgx.Rows to []map[string]any
func collectRows(rows pgx.Rows) ([]map[string]any, error) {
	defer rows.Close()

	fieldDescriptions := rows.FieldDescriptions()
	var result []map[string]any

	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			return nil, err
		}

		row := make(map[string]any)
		for i, fd := range fieldDescriptions {
			row[string(fd.Name)] = canonicalizeValue(values[i])
		}
		result = append(result, row)
	}

	return result, rows.Err()
}

// hashSeed creates deterministic seed from string
func hashSeed(input string) int64 {
	h := sha256.Sum256([]byte(input))
	return int64(h[0])<<56 | int64(h[1])<<48 | int64(h[2])<<40 | int64(h[3])<<32 |
		int64(h[4])<<24 | int64(h[5])<<16 | int64(h[6])<<8 | int64(h[7])
}

// Placeholder functions for container operations - will be implemented in sql_container_pool.go
func execSQL(ctx context.Context, container *SQLContainer, query string) error {
	if container == nil || container.Pool == nil {
		return fmt.Errorf("container not available")
	}
	_, err := container.Pool.Exec(ctx, query)
	return err
}

func queryRowsFromContainer(ctx context.Context, container *SQLContainer, query string) []map[string]any {
	if container == nil || container.Pool == nil {
		return nil
	}
	rows, err := container.Pool.Query(ctx, query)
	if err != nil {
		return nil
	}
	result, _ := collectRows(rows)
	return result
}
