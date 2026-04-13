package types

type GradingJob struct {
	AttemptID        string            `json:"attemptId"`
	ChallengeID      string            `json:"challengeId,omitempty"`
	DependenciesHash string            `json:"dependenciesHash,omitempty"`
	Files            map[string]string `json:"files"`
	PublicTests      string            `json:"publicTests"`
	HiddenTests      string            `json:"hiddenTests"`
	Dependencies     map[string]string `json:"dependencies"`
	NodeVersion      string            `json:"nodeVersion"`
	TimeLimit        int               `json:"timeLimit"`
	MemoryLimit      int               `json:"memoryLimit"`
	Runner           *ChallengeRunner  `json:"runner,omitempty"`
	IsPreview        bool              `json:"isPreview,omitempty"`
}

type GradingResult struct {
	PublicScore int    `json:"publicScore"`
	HiddenScore int    `json:"hiddenScore"`
	TotalPublic int    `json:"totalPublic"`
	TotalHidden int    `json:"totalHidden"`
	Logs        string `json:"logs"`
	Success     bool   `json:"success"`
	Error       string `json:"error,omitempty"`
}

type ChallengeRunner struct {
	Mode      string        `json:"mode"`
	Runtime   string        `json:"runtime,omitempty"`
	Candidate CandidateSpec `json:"candidate,omitempty"`
	Tests     TestSpec      `json:"tests,omitempty"`

	// SQL-specific fields (when Mode == "sql")
	Database    *SqlDatabaseSpec  `json:"database,omitempty"`
	SampleData  *SqlSampleData    `json:"sampleData,omitempty"`
	SqlTests    *SqlTestConfig    `json:"sqlTests,omitempty"`
	PublicTests []SqlPublicTest   `json:"publicTests,omitempty"`
	HiddenTests []SqlHiddenTest   `json:"hiddenTests,omitempty"`
}

type CandidateSpec struct {
	Image            string            `json:"image"`
	Workdir          string            `json:"workdir"`
	GeneratedFiles   map[string]string `json:"generatedFiles,omitempty"`
	InstallCommand   string            `json:"installCommand,omitempty"`
	RunCommand       string            `json:"runCommand"`
	Port             int               `json:"port"`
	HealthPath       string            `json:"healthPath"`
	Env              map[string]string `json:"env,omitempty"`
	StartupTimeoutMs int               `json:"startupTimeoutMs"`
}

type TestSpec struct {
	Framework      string            `json:"framework"`
	Image          string            `json:"image,omitempty"`
	InstallCommand string            `json:"installCommand,omitempty"`
	TestCommand    string            `json:"testCommand,omitempty"`
	Env            map[string]string `json:"env,omitempty"`
	TimeoutMs      int               `json:"timeoutMs"`
}

// ============ SQL Challenge Types ============

// SqlDatabaseSpec defines database setup for SQL challenges
type SqlDatabaseSpec struct {
	SetupScript       string `json:"setupScript"`       // CREATE TABLE + INSERT statements (Public)
	HiddenSetupScript string `json:"hiddenSetupScript"` // Setup script for hidden tests (Different data)
	ResetScript       string `json:"resetScript,omitempty"` // Reset script for container reuse
	Image             string `json:"image,omitempty"`       // Pre-baked Docker image name
}

// SqlSampleData contains sample data shown to student in exam UI
type SqlSampleData struct {
	Tables map[string]SqlTableSample `json:"tables"`
}

// SqlTableSample represents a single table's schema and sample rows
type SqlTableSample struct {
	Columns   []SqlColumn      `json:"columns"`
	Rows      []map[string]any `json:"rows"`
	Truncated bool             `json:"truncated"`
}

// SqlColumn describes a database column
type SqlColumn struct {
	Name string `json:"name"`
	Type string `json:"type"` // "INT", "VARCHAR(255)", "TIMESTAMP"
}

// SqlTestConfig holds test execution settings
type SqlTestConfig struct {
	Isolation            string `json:"isolation"`            // "shared" or "isolated"
	OrderSensitive       bool   `json:"orderSensitive"`       // Row order matters
	ColumnOrderSensitive bool   `json:"columnOrderSensitive"` // Column order matters
	TimeoutMs            int    `json:"timeoutMs"`
}

// SqlPublicTest defines a visible test case
type SqlPublicTest struct {
	Name                  string           `json:"name"`
	FileName              string           `json:"fileName,omitempty"`              // Specific file to run (e.g., "q1.sql")
	ExpectedResult        []map[string]any `json:"expectedResult,omitempty"`        // For SELECT
	ValidationQuery       string           `json:"validationQuery,omitempty"`       // For mutations
	ExpectedAfterMutation []map[string]any `json:"expectedAfterMutation,omitempty"` // Expected state after mutation
}

// SqlHiddenTest defines a hidden test case with optional random data
type SqlHiddenTest struct {
	Name           string            `json:"name"`
	FileName       string            `json:"fileName,omitempty"` // Specific file to run
	DataGenerator  *SqlDataGenerator `json:"dataGenerator,omitempty"` // Random data config
	ReferenceQuery string            `json:"referenceQuery"`          // Correct query for comparison
	ValidationQuery string            `json:"validationQuery,omitempty"`
}

// SqlDataGenerator configures random data generation for anti-cheat
type SqlDataGenerator struct {
	Table   string            `json:"table"`   // Target table name
	Count   int               `json:"count"`   // Number of rows to generate
	Columns map[string]string `json:"columns"` // column -> generator expression
}

