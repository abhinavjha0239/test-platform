package grader

import (
	"encoding/json"
	"reflect"
	"sort"
	"time"
)

// compareResults compares two result sets with optional order sensitivity
func compareResults(actual, expected []map[string]any, orderSensitive bool) bool {
	if len(actual) != len(expected) {
		return false
	}

	if len(actual) == 0 {
		return true
	}

	// Canonicalize both
	actualCanon := canonicalizeRows(actual)
	expectedCanon := canonicalizeRows(expected)

	// Sort if order-insensitive
	if !orderSensitive {
		sort.Slice(actualCanon, func(i, j int) bool {
			return rowKey(actualCanon[i]) < rowKey(actualCanon[j])
		})
		sort.Slice(expectedCanon, func(i, j int) bool {
			return rowKey(expectedCanon[i]) < rowKey(expectedCanon[j])
		})
	}

	return reflect.DeepEqual(actualCanon, expectedCanon)
}

// canonicalizeRows converts all values to comparable format
func canonicalizeRows(rows []map[string]any) []map[string]any {
	result := make([]map[string]any, len(rows))
	for i, row := range rows {
		result[i] = canonicalizeRow(row)
	}
	return result
}

// canonicalizeRow converts a single row to canonical form
func canonicalizeRow(row map[string]any) map[string]any {
	result := make(map[string]any)
	for k, v := range row {
		result[k] = canonicalizeValue(v)
	}
	return result
}

// canonicalizeValue normalizes a single value for comparison
func canonicalizeValue(v any) any {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case time.Time:
		return val.Format(time.RFC3339)
	case []byte:
		return string(val)
	case float64:
		// Handle integer stored as float
		if val == float64(int64(val)) {
			return int64(val)
		}
		return val
	case float32:
		floatVal := float64(val)
		if floatVal == float64(int64(floatVal)) {
			return int64(floatVal)
		}
		return floatVal
	case int:
		return int64(val)
	case int32:
		return int64(val)
	case uint:
		return int64(val)
	case uint32:
		return int64(val)
	case uint64:
		return int64(val)
	case bool:
		return val
	case string:
		return val
	case []any:
		// Recursively canonicalize arrays
		result := make([]any, len(val))
		for i, item := range val {
			result[i] = canonicalizeValue(item)
		}
		return result
	case map[string]any:
		// Recursively canonicalize nested maps
		return canonicalizeRow(val)
	default:
		// For unknown types, convert to string via JSON
		if jsonBytes, err := json.Marshal(val); err == nil {
			var decoded any
			if json.Unmarshal(jsonBytes, &decoded) == nil {
				return canonicalizeValue(decoded)
			}
		}
		return val
	}
}

// rowKey creates a deterministic string key from a row for sorting
func rowKey(row map[string]any) string {
	// Sort keys for deterministic order
	keys := make([]string, 0, len(row))
	for k := range row {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build key from sorted key-value pairs
	b, _ := json.Marshal(row)
	return string(b)
}

// DiffResult represents the difference between expected and actual results
type DiffResult struct {
	Match          bool
	RowCountMatch  bool
	ExpectedCount  int
	ActualCount    int
	MissingRows    []map[string]any
	ExtraRows      []map[string]any
	ColumnsMatched bool
	ExpectedCols   []string
	ActualCols     []string
}

// ComputeDiff computes detailed difference between expected and actual
func ComputeDiff(actual, expected []map[string]any) DiffResult {
	result := DiffResult{
		ExpectedCount: len(expected),
		ActualCount:   len(actual),
		RowCountMatch: len(actual) == len(expected),
	}

	if len(actual) == 0 && len(expected) == 0 {
		result.Match = true
		result.ColumnsMatched = true
		return result
	}

	// Get column names
	if len(expected) > 0 {
		for k := range expected[0] {
			result.ExpectedCols = append(result.ExpectedCols, k)
		}
		sort.Strings(result.ExpectedCols)
	}
	if len(actual) > 0 {
		for k := range actual[0] {
			result.ActualCols = append(result.ActualCols, k)
		}
		sort.Strings(result.ActualCols)
	}

	result.ColumnsMatched = reflect.DeepEqual(result.ExpectedCols, result.ActualCols)

	// Canonicalize and compare
	actualCanon := canonicalizeRows(actual)
	expectedCanon := canonicalizeRows(expected)

	// Find missing rows (in expected but not in actual)
	actualSet := make(map[string]bool)
	for _, row := range actualCanon {
		actualSet[rowKey(row)] = true
	}
	for _, row := range expectedCanon {
		if !actualSet[rowKey(row)] {
			result.MissingRows = append(result.MissingRows, row)
		}
	}

	// Find extra rows (in actual but not in expected)
	expectedSet := make(map[string]bool)
	for _, row := range expectedCanon {
		expectedSet[rowKey(row)] = true
	}
	for _, row := range actualCanon {
		if !expectedSet[rowKey(row)] {
			result.ExtraRows = append(result.ExtraRows, row)
		}
	}

	result.Match = len(result.MissingRows) == 0 && len(result.ExtraRows) == 0 && result.RowCountMatch

	return result
}
