#!/usr/bin/env node
/**
 * dsh-model-sync CLI — install the plugin into the current DSH web profile.
 *
 * Usage:
 *   npx github:zhangyqjiaoshou-oss/dsh-model-sync install
 *   npx @dsh-external/dsh-model-sync install
 *
 * The CLI probes $DSH_HOME (default ~/.dsh), packs the current package into
 * a tarball, and runs `dsh plugin --profile web add <tarball>`.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PACKAGE_NAME = '@dsh-external/dsh-model-sync'

function dshHome() {
  return process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE || '~', '.dsh')
}

function profileDir() {
  return join(dshHome(), 'profiles', 'web')
}

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  const result = execSync(cmd, { stdio: 'inherit', ...opts })
  return result
}

function help() {
  console.log(`
dsh-model-sync — install the plugin into the current DSH web profile.

Commands:
  install    Pack and install the plugin into DSH's web profile
  help       Show this help

Examples:
  npx github:zhangyqjiaoshou-oss/dsh-model-sync install
  npx @dsh-external/dsh-model-sync install
`)
}

async function cmdInstall() {
  // 1. sanity checks
  if (!existsSync(join(ROOT, 'package.json'))) {
    console.error('error: not inside a dsh-model-sync checkout (no package.json)')
    process.exit(1)
  }
  const profile = profileDir()
  if (!existsSync(profile)) {
    console.error(`error: DSH web profile not found at ${profile}`)
    console.error('  Start dsh web at least once to create the profile, then retry.')
    process.exit(1)
  }

  // 2. pack the tarball
  console.log('📦 Packing plugin...')
  const tarball = execSync('npm pack --pack-destination ' + profile, {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim()
  // npm pack on Windows may print the full path; extract just the filename
  const tgzName = tarball.split('\n').pop().trim()
  const tgzPath = join(profile, tgzName)

  // 3. dsh plugin add
  console.log(`🔌 Installing ${tgzName}...`)
  try {
    run(`dsh plugin --profile web add "${tgzPath}"`, { cwd: ROOT })
  } catch (_) {
    // dsh binary may not be on PATH; try via pnpm
    try {
      run(`pnpm dsh plugin --profile web add "${tgzPath}"`, { cwd: profile })
    } catch (_2) {
      console.error('error: could not run dsh plugin add')
      console.error('  Ensure dsh or pnpm is on PATH, then run:')
      console.error(`  dsh plugin --profile web add "${tgzPath}"`)
      process.exit(1)
    }
  }

  // 4. cleanup
  try { unlinkSync(tgzPath) } catch (_) { /* ok */ }

  console.log('\n✅ dsh-model-sync installed! Restart dsh web to load the plugin.')
  console.log('  Open Settings → Model Sync to use it.')
}

const cmd = process.argv[2] || 'help'
switch (cmd) {
  case 'install': await cmdInstall(); break
  default: help(); break
}