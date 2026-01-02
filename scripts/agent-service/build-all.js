#!/usr/bin/env node
/**
 * Cross-platform build script for agent-service sidecar
 * Builds binaries for all target platforms with correct Tauri naming
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Target triples for Tauri sidecar naming
const targets = [
  { pkg: "node18-macos-arm64", triple: "aarch64-apple-darwin", ext: "" },
  { pkg: "node18-macos-x64", triple: "x86_64-apple-darwin", ext: "" },
  { pkg: "node18-win-x64", triple: "x86_64-pc-windows-msvc", ext: ".exe" },
  { pkg: "node18-linux-x64", triple: "x86_64-unknown-linux-gnu", ext: "" },
];

const binariesDir = path.join(__dirname, "..", "..", "src-tauri", "binaries");
const distFile = path.join(__dirname, "dist", "index.cjs");

async function main() {
  // Ensure binaries directory exists
  if (!fs.existsSync(binariesDir)) {
    fs.mkdirSync(binariesDir, { recursive: true });
    console.log(`Created ${binariesDir}`);
  }

  // Check if dist/index.js exists
  if (!fs.existsSync(distFile)) {
    console.log("Building TypeScript...");
    execSync("npm run build", { cwd: __dirname, stdio: "inherit" });
  }

  // Build for each target
  for (const target of targets) {
    const outputName = `agent-service-${target.triple}${target.ext}`;
    const outputPath = path.join(binariesDir, outputName);

    console.log(`\nBuilding for ${target.triple}...`);

    try {
      // Use pkg to create binary
      execSync(
        `npx pkg ${distFile} --target ${target.pkg} --output ${outputPath}`,
        { cwd: __dirname, stdio: "inherit" },
      );

      // Verify binary was created
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  ✓ Created ${outputName} (${sizeMB} MB)`);
      } else {
        console.error(`  ✗ Failed to create ${outputName}`);
      }
    } catch (err) {
      console.error(`  ✗ Error building for ${target.triple}:`, err.message);
    }
  }

  console.log("\nBuild complete!");
  console.log(`Binaries placed in: ${binariesDir}`);
}

main().catch(console.error);
