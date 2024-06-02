const fs = require('fs')
const { setTimeout } = require('timers/promises')
const core = require('@actions/core')
const cache = require('@actions/cache')
const github = require('@actions/github')
const glob = require('@actions/glob')
const tc = require('@actions/tool-cache')
const config = require('./config')
const { spawn } = require('child_process')
const path = require('path')

async function run() {
  try {
    await setupBazel()
  } catch (error) {
    core.setFailed(error.stack)
  }
}

async function setupBazel() {
  core.startGroup('Configure Bazel')
  core.info('Configuration:')
  core.info(JSON.stringify(config, null, 2))

  await setupBazelrc()
  core.endGroup()

  await setupBazelisk()
  await restoreCache(config.bazeliskCache)
  await restoreCache(config.diskCache)
  await restoreCache(config.repositoryCache)
  await restoreExternalCaches(config.externalCache)
  await startRemoteCacheServer()
}

async function setupBazelisk() {
  if (config.bazeliskVersion.length == 0) {
    return
  }

  core.startGroup('Setup Bazelisk')
  let toolPath = tc.find('bazelisk', config.bazeliskVersion)
  if (toolPath) {
    core.info(`Found in cache @ ${toolPath}`)
  } else {
    toolPath = await downloadBazelisk()
  }
  core.addPath(toolPath)
  core.endGroup()
}

async function downloadBazelisk() {
  const version = config.bazeliskVersion
  core.debug(`Attempting to download ${version}`)

  // Possible values are 'arm', 'arm64', 'ia32', 'mips', 'mipsel', 'ppc', 'ppc64', 's390', 's390x' and 'x64'.
  // Bazelisk filenames use 'amd64' and 'arm64'.
  let arch = config.os.arch
  if (arch == 'x64') {
    arch = 'amd64'
  }

  // Possible values are 'aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos' and 'win32'.
  // Bazelisk filenames use 'darwin', 'linux' and 'windows'.
  let platform = config.os.platform
  if (platform == "win32") {
    platform = "windows"
  }

  let filename = `bazelisk-${platform}-${arch}`
  if (platform == 'windows') {
    filename = `${filename}.exe`
  }

  const token = core.getInput('token')
  const octokit = github.getOctokit(token)
  const { data: releases } = await octokit.rest.repos.listReleases({
    owner: 'bazelbuild',
    repo: 'bazelisk'
  })

  // Find version matching semver specification.
  const tagName = tc.evaluateVersions(releases.map((r) => r.tag_name), version)
  const release = releases.find((r) => r.tag_name === tagName)
  if (!release) {
    throw new Error(`Unable to find Bazelisk version ${version}`)
  }

  const asset = release.assets.find((a) => a.name == filename)
  if (!asset) {
    throw new Error(`Unable to find Bazelisk version ${version} for platform ${platform}/${arch}`)
  }

  const url = asset.browser_download_url
  core.info(`Downloading from ${url}`)
  const downloadPath = await tc.downloadTool(url, undefined, `token ${token}`)

  core.debug('Adding to the cache...')
  fs.chmodSync(downloadPath, '755')

  let bazelBinName = 'bazel'
  let bazeliskBinName = 'bazelisk'
  if (platform == 'windows') {
    bazelBinName = `${bazelBinName}.exe`
    bazeliskBinName = `${bazelBinName}.exe`
  }

  const cachePath = await tc.cacheFile(downloadPath, bazelBinName, bazeliskBinName, version)
  core.info(`Successfully cached bazelisk to ${cachePath}`)

  return cachePath
}

async function setupBazelrc() {
  for (const bazelrcPath of config.paths.bazelrc) {
    fs.writeFileSync(
      bazelrcPath,
      `startup --output_base=${config.paths.bazelOutputBase}\n`
    )
    fs.appendFileSync(bazelrcPath, config.bazelrc.join("\n"))
  }
}

async function restoreExternalCaches(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  // First fetch the manifest of external caches used.
  const path = cacheConfig.manifest.path
  await restoreCache({
    enabled: true,
    files: cacheConfig.manifest.files,
    name: cacheConfig.manifest.name,
    paths: [path]
  })

  // Now restore all external caches defined in manifest
  if (fs.existsSync(path)) {
    const manifest = fs.readFileSync(path, { encoding: 'utf8' })
    for (const name of manifest.split('\n').filter(s => s)) {
      await restoreCache({
        enabled: cacheConfig[name]?.enabled ?? cacheConfig.default.enabled,
        files: cacheConfig[name]?.files || cacheConfig.default.files,
        name: cacheConfig.default.name(name),
        paths: cacheConfig.default.paths(name)
      })
    }
  }
}

async function restoreCache(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const delay = Math.random() * 1000 // timeout <= 1 sec to reduce 429 errors
  await setTimeout(delay, async function () {
    core.startGroup(`Restore cache for ${cacheConfig.name}`)

    const hash = await glob.hashFiles(cacheConfig.files.join('\n'))
    const name = cacheConfig.name
    const paths = cacheConfig.paths
    const restoreKey = `${config.baseCacheKey}-${name}-`
    const key = `${restoreKey}${hash}`

    core.debug(`Attempting to restore ${name} cache from ${key}`)

    const restoredKey = await cache.restoreCache(
      paths, key, [restoreKey],
      { segmentTimeoutInMs: 300000 } // 5 minutes
    )

    if (restoredKey) {
      core.info(`Successfully restored cache from ${restoredKey}`)

      if (restoredKey === key) {
        core.saveState(`${name}-cache-hit`, 'true')
      }
    } else {
      core.info(`Failed to restore ${name} cache`)
    }

    core.endGroup()
  }())
}

async function startRemoteCacheServer() {
  if (!config.remoteCache.enabled) {
    return
  }

  core.startGroup("Start remote cache server")
  core.info(`Remote cache server log file path: ${config.remoteCache.logPath}`)

  const log = fs.openSync(config.remoteCache.logPath, 'a')
  const remoteCacheServer = path.join(__dirname, '..', 'remote-cache-server', 'index.js')
  const serverProcess = spawn(process.execPath, [remoteCacheServer], {
    detached: true,
    stdio: ['ignore', log, log]
  })

  core.info(`Started remote cache server with PID: ${serverProcess.pid}`)
  core.saveState('remote-cache-server-pid', serverProcess.pid.toString())

  serverProcess.unref()
  core.endGroup()
}

run()
