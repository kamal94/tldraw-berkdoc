import {parseSummary, parseTags} from "./parsers";
import * as fs from "fs";
import * as path from "path";

const dir = path.join(__dirname, "../../ollama-test-data");
const allFiles = fs.readdirSync(dir);
const summaryFiles = allFiles.filter((file) => file.startsWith("summary-")).sort();
const allTagsFiles = allFiles.filter((file) => file.startsWith("tags-")).sort().filter((file) => file.endsWith("tags-2026-01-09T00-55-11-481Z.json"));
console.log(summaryFiles);
// for (const file of summaryFiles) {
//   const filePath = path.join(__dirname,"../../ollama-test-data", file);
//   const data = fs.readFileSync(filePath, "utf-8");
//   const parsed = parseSummary(JSON.parse(data).response);
//   console.log("===========", file, "===========")
//   console.log(parsed);
// }

for (const file of allTagsFiles) {
  const filePath = path.join(__dirname,"../../ollama-test-data", file);
  const data = fs.readFileSync(filePath, "utf-8");
  console.log("===========", file, "===========")
  const parsed = parseTags(JSON.parse(data).response);
  console.log(parsed);
}