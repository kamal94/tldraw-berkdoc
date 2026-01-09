/**
 * Test script for parser logic with real test data
 * Tests the new Zod-based parsing against actual LLM responses
 */

import { parseSummary, parseTags } from "./parsers.js";
import * as fs from "fs";
import * as path from "path";

interface TestData {
  request: {
    prompt: string;
    max_tokens: number;
    temperature: number;
  };
  response: string;
}

/**
 * Load test data from a JSON file
 */
function loadTestData(filename: string): TestData | null {
  try {
    const testDataDir = path.resolve(process.cwd(), "ollama-test-data");
    const filePath = path.join(testDataDir, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content) as TestData;
  } catch (error) {
    console.error(`Failed to load ${filename}:`, error);
    return null;
  }
}

/**
 * Test summary parsing
 */
function testSummaryParsing(filename: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing Summary: ${filename}`);
  console.log(`${"=".repeat(80)}`);

  const data = loadTestData(filename);
  if (!data) {
    console.log("❌ Failed to load test data");
    return;
  }

  console.log("\n📥 Original Response:");
  console.log(`"${data.response}"`);
  console.log(`\nLength: ${data.response.length} characters`);

  const parsed = parseSummary(data.response);

  console.log("\n✅ Parsed Summary:");
  console.log(`"${parsed}"`);
  console.log(`\nLength: ${parsed.length} characters`);

  // Validation
  const isValid = parsed.length > 0 && parsed.length <= 500;
  console.log(`\n${isValid ? "✅" : "❌"} Validation: ${isValid ? "PASS" : "FAIL"}`);
  if (!isValid) {
    console.log(`   - Summary should be 1-500 characters`);
  }
}

/**
 * Test tags parsing
 */
function testTagsParsing(filename: string) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Testing Tags: ${filename}`);
  console.log(`${"=".repeat(80)}`);

  const data = loadTestData(filename);
  if (!data) {
    console.log("❌ Failed to load test data");
    return;
  }

  console.log("\n📥 Original Response:");
  console.log(`"${data.response}"`);
  console.log(`\nLength: ${data.response.length} characters`);

  const parsed = parseTags(data.response);

  console.log("\n✅ Parsed Tags:");
  console.log(JSON.stringify(parsed, null, 2));
  console.log(`\nCount: ${parsed.length} tags`);

  // Validation
  const isValid =
    Array.isArray(parsed) &&
    parsed.length >= 0 &&
    parsed.length <= 10 &&
    parsed.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length < 30);

  console.log(`\n${isValid ? "✅" : "❌"} Validation: ${isValid ? "PASS" : "FAIL"}`);
  if (!isValid) {
    console.log(`   - Tags should be an array of 0-10 strings`);
    console.log(`   - Each tag should be 1-30 characters`);
  }

  // Show individual tag validation
  if (parsed.length > 0) {
    console.log("\n📋 Tag Details:");
    parsed.forEach((tag, index) => {
      const tagValid = tag.length > 0 && tag.length < 30;
      console.log(
        `   ${index + 1}. ${tagValid ? "✅" : "❌"} "${tag}" (${tag.length} chars)`
      );
    });
  }
}

/**
 * Run tests on multiple files
 */
function runTests() {
  console.log("\n🧪 Testing Parser Logic with Real Test Data");
  console.log("=".repeat(80));

  // Test summary files
  const summaryFiles = [
    "summary-2026-01-08T20-59-13-639Z.json",
    "summary-2026-01-08T20-58-44-175Z.json",
    "summary-2026-01-08T21-11-00-523Z.json",
  ];

  console.log("\n📝 Testing Summary Parsing");
  for (const file of summaryFiles) {
    testSummaryParsing(file);
  }

  // Test tags files
  const tagsFiles = [
    "tags-2026-01-08T21-11-23-844Z.json",
    "tags-2026-01-08T20-59-18-439Z.json",
    "tags-2026-01-08T21-11-28-290Z.json",
  ];

  console.log("\n\n🏷️  Testing Tags Parsing");
  for (const file of tagsFiles) {
    testTagsParsing(file);
  }

  console.log("\n\n" + "=".repeat(80));
  console.log("✅ Test Complete");
  console.log("=".repeat(80));
}

// Run tests if executed directly
if (import.meta.main) {
  runTests();
}

export { testSummaryParsing, testTagsParsing, runTests };
