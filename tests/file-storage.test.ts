import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { FileStorage } from "../src/storage/file.ts";

for (const initial of ["missing", "invalid JSON"]) {
  it(`retries loading a manifest after ${initial}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "file-storage-"));
    const path = join(dir, "manifest.json");
    const storage = new FileStorage(path);
    try {
      if (initial === "invalid JSON") {
        await writeFile(path, "{");
      }
      await assert.rejects(storage.get("known"));
      await writeFile(
        path,
        JSON.stringify({
          operations: [{ document: "query { hello }", hash: "known" }],
          version: 1,
        })
      );
      assert.deepEqual(
        await Promise.all([storage.get("known"), storage.has("known")]),
        ["query { hello }", true]
      );
      await rm(path);
      assert.equal(await storage.get("known"), "query { hello }");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });
}
