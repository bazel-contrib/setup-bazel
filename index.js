const fs = require('fs')
const { setTimeout } = require('timers/promises')
const core = require('@actions/core')
const github = require('@actions/github')
const glob = require('@actions/glob')
const tc = require('@actions/tool-cache')
const config = require('./config')
const { mountStickyDisk } = require('./stickydisk');
const crypto = require('crypto')
const cache = require('@actions/cache')

async function run() {
  try {
    await setupBazel()
  } catch (error) {
    core.saveState('action-failed', 'true')
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
  const bazeliskMounts = await loadStickyDisk(config.bazeliskCache)
  const diskMounts = await loadStickyDisk(config.diskCache)
  const repoMounts = await loadStickyDisk(config.repositoryCache)
  await restoreExternalCaches(config.externalCache)

  const allMounts = {
    ...bazeliskMounts,
    ...diskMounts,
    ...repoMounts,
  };

  // Save the combined mounts from this run
  core.saveState('sticky-disk-mounts', JSON.stringify(allMounts));

  return allMounts;
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


async function setupBazelisk() {
  if (config.bazeliskVersion.length == 0) {
    return
  }

  core.startGroup('Setup Bazelisk')
  let toolPath = tc.find('bazelisk', config.bazeliskVersion)
  if (toolPath) {
    core.debug(`Found in cache @ ${toolPath}`)
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
  const octokit = github.getOctokit(token, {
    baseUrl: 'https://api.github.com'
  })
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
  core.debug(`Downloading from ${url}`)
  const downloadPath = await tc.downloadTool(url, undefined, `token ${token}`)

  core.debug('Adding to the cache...');
  fs.chmodSync(downloadPath, '755');
  const cachePath = await tc.cacheFile(downloadPath, 'bazel', 'bazelisk', version)
  core.debug(`Successfully cached bazelisk to ${cachePath}`)

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

async function loadExternalStickyDisks(cacheConfig) {
  if (!cacheConfig.enabled) {
    return {}
  }

  // First fetch the manifest of external caches used.
  const path = cacheConfig.manifest.path
  const manifestMounts = await loadStickyDisk({
    enabled: true,
    files: cacheConfig.manifest.files,
    name: cacheConfig.manifest.name,
    paths: [path]
  })

  let allMounts = { ...manifestMounts }

  // Now restore all external caches defined in manifest
  if (fs.existsSync(path)) {
    process.stderr.write(`Restoring external caches from ${path}\n`)
    const manifest = fs.readFileSync(path, { encoding: 'utf8' })
    for (const name of manifest.split('\n').filter(s => s)) {
      const mounts = await loadStickyDisk({
        enabled: cacheConfig[name]?.enabled ?? cacheConfig.default.enabled,
        files: cacheConfig[name]?.files || cacheConfig.default.files,
        name: cacheConfig.default.name(name),
        paths: cacheConfig.default.paths(name)
      })
      allMounts = { ...allMounts, ...mounts }
    }
  }

  return allMounts
}

async function loadStickyDisk(cacheConfig) {
  if (!cacheConfig.enabled) {
    return {};
  }

  const delay = Math.random() * 1000 // timeout <= 1 sec to reduce contention
  const mounts = await setTimeout(delay, async function () {
    core.startGroup(`Setting up sticky disk for ${cacheConfig.name}`)

    const hash = await glob.hashFiles(cacheConfig.files.join('\n'))
    const name = cacheConfig.name
    const paths = cacheConfig.paths
    const baseKey = `${config.baseCacheKey}-${name}-${hash}`
    const newMounts = {};

    try {
      const controller = new AbortController();

      // Mount sticky disk for each path in the config and collect results
      const mountResults = await Promise.all(paths.map(async (path) => {
        try {
          // Create a unique key for each path by including a hash of the path
          const pathHash = crypto
            .createHash('sha256')
            .update(path)
            .digest('hex')
            .slice(0, 8); // Take first 8 chars of hash for brevity

          const pathKey = `${baseKey}-${pathHash}`;

          const { device, exposeId } = await mountStickyDisk(
            pathKey,
            path,
            controller.signal,
            controller
          );
          core.debug(`Mounted device ${device} at ${path} with expose ID ${exposeId}`);

          return {
            path,
            mount: { device, exposeId, stickyDiskKey: pathKey }
          };
        } catch (error) {
          core.warning(`Failed to mount sticky disk for ${path}: ${error}`);
          return null;
        }
      }));

      // Add successful mounts to the collection
      for (const result of mountResults) {
        if (result) {
          newMounts[result.path] = result.mount;
        }
      }

      core.info('Successfully mounted sticky disks');
    } catch (error) {
      core.warning(`Failed to setup sticky disks for ${name}: ${error}`);
    }

    core.endGroup()
    return newMounts;
  }())

  return mounts;
}

run()

module.exports = {
  loadStickyDisk,
  loadExternalStickyDisks,
  setupBazel
}
