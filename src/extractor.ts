import { createHash } from "node:crypto";
import { glob, readFile, writeFile } from "node:fs/promises";
import type { OperationManifest, OperationRecord } from "./types.js";

const GQL_TAG_PATTERN = /gql\s*`([^`]+)`/g;
const OPERATION_NAME_PATTERN = /(?:query|mutation|subscription)\s+(\w+)/;

async function globFiles(pattern: string): Promise<string[]> {
  const files: string[] = [];
  for await (const filePath of glob(pattern)) {
    files.push(filePath);
  }
  return files;
}

export interface ExtractOptions {
  output: string;
  patterns: string[];
}

export async function extractOperations(
  opts: ExtractOptions
): Promise<OperationManifest> {
  const seen = new Map<string, OperationRecord>();

  const fileGroups = await Promise.all(opts.patterns.map(globFiles));
  const files = await Promise.all(
    fileGroups.flat().map(async (filePath) => ({
      content: await readFile(filePath, "utf-8"),
      filePath,
    }))
  );

  for (const { content, filePath } of files) {
    const ext = filePath.split(".").pop();

    if (ext === "graphql" || ext === "gql") {
      addOperation(seen, content.trim());
    } else {
      // Look for gql`...` template literals
      extractGqlTags(seen, content);
    }
  }

  const manifest: OperationManifest = {
    operations: Array.from(seen.values()),
    version: 1,
  };

  await writeFile(opts.output, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

function extractGqlTags(
  seen: Map<string, OperationRecord>,
  content: string
): void {
  // Match gql`...` template literals (no interpolation support)
  for (const match of content.matchAll(GQL_TAG_PATTERN)) {
    const doc = match[1].trim();
    if (doc) {
      addOperation(seen, doc);
    }
  }
}

function addOperation(
  seen: Map<string, OperationRecord>,
  document: string
): void {
  const hash = createHash("sha256").update(document).digest("hex");
  if (seen.has(hash)) {
    return;
  }

  const nameMatch = document.match(OPERATION_NAME_PATTERN);

  seen.set(hash, {
    document,
    hash,
    name: nameMatch?.[1],
  });
}
