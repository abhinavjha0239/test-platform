package grader

import (
	"fmt"
	"math/rand"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

// Generator pattern matching
var generatorPatterns = map[string]*regexp.Regexp{
	"RANDOM_INT":     regexp.MustCompile(`RANDOM_INT\((\d+),\s*(\d+)\)`),
	"RANDOM_STRING":  regexp.MustCompile(`RANDOM_STRING\((\d+)\)`),
	"RANDOM_NAME":    regexp.MustCompile(`RANDOM_NAME\(\)`),
	"RANDOM_EMAIL":   regexp.MustCompile(`RANDOM_EMAIL\(\)`),
	"RANDOM_DATE":    regexp.MustCompile(`RANDOM_DATE\('([^']+)',\s*'([^']+)'\)`),
	"RANDOM_BOOL":    regexp.MustCompile(`RANDOM_BOOL\(\)`),
	"RANDOM_FLOAT":   regexp.MustCompile(`RANDOM_FLOAT\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)`),
	"RANDOM_PHONE":   regexp.MustCompile(`RANDOM_PHONE\(\)`),
	"RANDOM_UUID":    regexp.MustCompile(`RANDOM_UUID\(\)`),
	"RANDOM_CHOICE":  regexp.MustCompile(`RANDOM_CHOICE\(([^)]+)\)`),
	"SEQUENCE":       regexp.MustCompile(`SEQUENCE\((\d+)\)`),
}

// Sample names for random generation
var sampleNames = []string{
	"Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry",
	"Ivy", "Jack", "Kate", "Leo", "Mia", "Noah", "Olivia", "Peter",
	"Quinn", "Ryan", "Sophia", "Thomas", "Uma", "Victor", "Wendy", "Xavier",
}

var sampleLastNames = []string{
	"Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
	"Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
}

var sampleDomains = []string{
	"test.com", "example.com", "mail.com", "demo.org", "sample.net",
}

// generateRandomInserts creates INSERT statements with random data
func generateRandomInserts(seed int64, gen *types.SqlDataGenerator) string {
	rng := rand.New(rand.NewSource(seed))

	// Sort column names for deterministic output
	cols := make([]string, 0, len(gen.Columns))
	for col := range gen.Columns {
		cols = append(cols, col)
	}
	sort.Strings(cols)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("INSERT INTO %s (", gen.Table))
	sb.WriteString(strings.Join(cols, ", "))
	sb.WriteString(") VALUES\n")

	// Track sequence counters per column
	sequences := make(map[string]int)

	// Generate rows
	for i := 0; i < gen.Count; i++ {
		if i > 0 {
			sb.WriteString(",\n")
		}
		sb.WriteString("(")
		values := make([]string, len(cols))
		for j, col := range cols {
			values[j] = generateValue(rng, gen.Columns[col], sequences, col, i)
		}
		sb.WriteString(strings.Join(values, ", "))
		sb.WriteString(")")
	}
	sb.WriteString(";")

	return sb.String()
}

// generateValue generates a single random value based on expression
func generateValue(rng *rand.Rand, expr string, sequences map[string]int, colName string, rowIndex int) string {
	expr = strings.TrimSpace(expr)

	// RANDOM_INT(min, max)
	if m := generatorPatterns["RANDOM_INT"].FindStringSubmatch(expr); m != nil {
		min, _ := strconv.Atoi(m[1])
		max, _ := strconv.Atoi(m[2])
		return strconv.Itoa(min + rng.Intn(max-min+1))
	}

	// RANDOM_FLOAT(min, max)
	if m := generatorPatterns["RANDOM_FLOAT"].FindStringSubmatch(expr); m != nil {
		min, _ := strconv.ParseFloat(m[1], 64)
		max, _ := strconv.ParseFloat(m[2], 64)
		val := min + rng.Float64()*(max-min)
		return fmt.Sprintf("%.2f", val)
	}

	// RANDOM_STRING(length)
	if m := generatorPatterns["RANDOM_STRING"].FindStringSubmatch(expr); m != nil {
		length, _ := strconv.Atoi(m[1])
		return fmt.Sprintf("'%s'", randomString(rng, length))
	}

	// RANDOM_NAME()
	if generatorPatterns["RANDOM_NAME"].MatchString(expr) {
		firstName := sampleNames[rng.Intn(len(sampleNames))]
		lastName := sampleLastNames[rng.Intn(len(sampleLastNames))]
		return fmt.Sprintf("'%s %s'", firstName, lastName)
	}

	// RANDOM_EMAIL()
	if generatorPatterns["RANDOM_EMAIL"].MatchString(expr) {
		name := strings.ToLower(sampleNames[rng.Intn(len(sampleNames))])
		domain := sampleDomains[rng.Intn(len(sampleDomains))]
		return fmt.Sprintf("'%s%d@%s'", name, rng.Intn(10000), domain)
	}

	// RANDOM_BOOL()
	if generatorPatterns["RANDOM_BOOL"].MatchString(expr) {
		if rng.Intn(2) == 0 {
			return "FALSE"
		}
		return "TRUE"
	}

	// RANDOM_DATE('start', 'end')
	if m := generatorPatterns["RANDOM_DATE"].FindStringSubmatch(expr); m != nil {
		start, err1 := time.Parse("2006-01-02", m[1])
		end, err2 := time.Parse("2006-01-02", m[2])
		if err1 == nil && err2 == nil {
			diff := end.Sub(start)
			randomDate := start.Add(time.Duration(rng.Int63n(int64(diff))))
			return fmt.Sprintf("'%s'", randomDate.Format("2006-01-02"))
		}
	}

	// RANDOM_PHONE()
	if generatorPatterns["RANDOM_PHONE"].MatchString(expr) {
		return fmt.Sprintf("'+1%03d%03d%04d'",
			rng.Intn(900)+100,
			rng.Intn(900)+100,
			rng.Intn(10000))
	}

	// RANDOM_UUID()
	if generatorPatterns["RANDOM_UUID"].MatchString(expr) {
		return fmt.Sprintf("'%08x-%04x-%04x-%04x-%012x'",
			rng.Uint32(),
			rng.Uint32()&0xFFFF,
			(rng.Uint32()&0x0FFF)|0x4000,
			(rng.Uint32()&0x3FFF)|0x8000,
			rng.Uint64()&0xFFFFFFFFFFFF)
	}

	// RANDOM_CHOICE('option1','option2',...)
	if m := generatorPatterns["RANDOM_CHOICE"].FindStringSubmatch(expr); m != nil {
		options := parseChoiceOptions(m[1])
		if len(options) > 0 {
			return fmt.Sprintf("'%s'", options[rng.Intn(len(options))])
		}
	}

	// SEQUENCE(start)
	if m := generatorPatterns["SEQUENCE"].FindStringSubmatch(expr); m != nil {
		start, _ := strconv.Atoi(m[1])
		key := colName + "_seq"
		if _, exists := sequences[key]; !exists {
			sequences[key] = start
		}
		val := sequences[key]
		sequences[key]++
		return strconv.Itoa(val)
	}

	// NULL
	if strings.ToUpper(expr) == "NULL" {
		return "NULL"
	}

	// Default: return as-is (literal value or SQL expression)
	return expr
}

// randomString generates a random alphanumeric string
func randomString(rng *rand.Rand, length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = charset[rng.Intn(len(charset))]
	}
	return string(result)
}

// parseChoiceOptions parses comma-separated options from RANDOM_CHOICE
func parseChoiceOptions(input string) []string {
	var options []string
	parts := strings.Split(input, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		// Remove surrounding quotes
		if len(part) >= 2 && ((part[0] == '\'' && part[len(part)-1] == '\'') ||
			(part[0] == '"' && part[len(part)-1] == '"')) {
			part = part[1 : len(part)-1]
		}
		if part != "" {
			options = append(options, part)
		}
	}
	return options
}
