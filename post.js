const fs = require('fs')
const path = require('path')
const cache = require('@actions/cache')
const core = require('@actions/core')
const glob = require('@actions/glob')
const config = require('./config')
const { getFolderSize } = require('./util')
const process = require('node:process');

async function run() {
  await saveCaches()
  process.exit(0)
}

async function saveCaches() {
  await saveCache(config.bazeliskCache)
  await saveCache(config.diskCache)
  await saveCache(config.repositoryCache)
  await saveExternalCaches(config.externalCache)
}

async function saveExternalCaches(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const globber = await glob.create(
    `${config.paths.bazelExternal}/*`,
    { implicitDescendants: false }
  )
  const externalPaths = await globber.glob()
  const savedCaches = []

  for (const externalPath of externalPaths) {
    const size = await getFolderSize(externalPath)
    const sizeMB = (size / 1024 / 1024).toFixed(2)
    core.debug(`${externalPath} size is ${sizeMB}MB`)

    if (sizeMB >= cacheConfig.minSize) {
      const name = path.basename(externalPath)
      await saveCache({
        enabled: cacheConfig[name]?.enabled ?? cacheConfig.default.enabled,
        files: cacheConfig[name]?.files || cacheConfig.default.files,
        name: cacheConfig.default.name(name),
        paths: cacheConfig.default.paths(name)
      })
      savedCaches.push(name)
    }
  }

  if (savedCaches.length > 0) {
    const path = cacheConfig.manifest.path
    fs.writeFileSync(path, savedCaches.join('\n'))
    await saveCache({
      enabled: true,
      files: cacheConfig.manifest.files,
      name: cacheConfig.manifest.name,
      paths: [path]
    })
  }
}

async function saveCache(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const cacheHit = core.getState(`${cacheConfig.name}-cache-hit`)
  core.debug(`${cacheConfig.name}-cache-hit is ${cacheHit}`)
  if (cacheHit === 'true') {
    return
  }

  try {
    core.startGroup(`Save cache for ${cacheConfig.name}`)
    const paths = cacheConfig.paths
    const hash = await glob.hashFiles(
      cacheConfig.files.join('\n'),
      undefined,
      // We don't want to follow symlinks as it's extremely slow on macOS.
      { followSymbolicLinks: false }
    )
    const key = `${config.baseCacheKey}-${cacheConfig.name}-${hash}`
    core.debug(`Attempting to save ${paths} cache to ${key}`)
    await cache.saveCache(paths, key)
    core.info('Successfully saved cache')
  } catch (error) {
    core.warning(error.stack)
  } finally {
    core.endGroup()
  }
}

run()
