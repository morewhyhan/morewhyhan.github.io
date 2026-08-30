import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const toolsDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(toolsDir, "..")
const quartzDir = path.join(rootDir, "apps", "quartz")
const quartzPublicDir = path.join(quartzDir, "public")
const sitePublicDir = path.join(rootDir, "public")
const notesPublicDir = path.join(sitePublicDir, "notes")

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`)
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function assertInside(parent, child) {
  const relative = path.relative(parent, child)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${parent}: ${child}`)
  }
}

assertInside(rootDir, sitePublicDir)
assertInside(sitePublicDir, notesPublicDir)

run(process.execPath, [path.join(toolsDir, "sync-quartz-content.mjs")], rootDir)
run(process.execPath, [path.join(rootDir, "node_modules", "hexo", "bin", "hexo"), "clean"], rootDir)
run(process.execPath, [path.join(rootDir, "node_modules", "hexo", "bin", "hexo"), "generate"], rootDir)
run(process.execPath, [path.join("quartz", "bootstrap-cli.mjs"), "build"], quartzDir)

await fs.rm(notesPublicDir, { recursive: true, force: true })
await fs.cp(quartzPublicDir, notesPublicDir, { recursive: true })
await fs.writeFile(path.join(sitePublicDir, ".nojekyll"), "", "utf8")

run(process.execPath, [path.join(toolsDir, "verify-site-output.mjs")], rootDir)

console.log(`\nUnified site ready: ${sitePublicDir}`)
console.log(`Quartz mounted at: ${notesPublicDir}`)
