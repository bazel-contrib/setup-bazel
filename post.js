import fs from 'fs'
import path from 'path'
import * as cache from '@actions/cache'
import * as core from '@actions/core'
import * as github from '@actions/github'
import * as glob from '@actions/glob'
import config from './config.js'
import { getFolderSize, hashCacheContents } from './util.js'

async function run() {
  await saveCaches()
  process.exit(0)
}

async function saveCaches() {
  if (!config.cacheSave) {
    core.info('Cache saving is disabled (cache-save: false)')
    return
  }

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

async function deleteCache(key) {
  const token = core.getInput('token')
  if (!token) {
    core.warning('No token provided, cannot delete cache')
    return false
  }

  try {
    const octokit = github.getOctokit(token)
    const { owner, repo } = github.context.repo

    // Find cache by key
    const { data: caches } = await octokit.rest.actions.getActionsCacheList({
      owner,
      repo,
      key,  // exact match
    })

    if (caches.actions_caches && caches.actions_caches.length > 0) {
      for (const cacheEntry of caches.actions_caches) {
        if (cacheEntry.key === key) {
          core.info(`Deleting outdated cache: ${key}`)
          await octokit.rest.actions.deleteActionsCacheById({
            owner,
            repo,
            cache_id: cacheEntry.id,
          })
          return true
        }
      }
    }
  } catch (error) {
    core.warning(`Failed to delete cache ${key}: ${error.message}`)
  }
  return false
}

async function saveCache(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const name = cacheConfig.name
  const paths = cacheConfig.paths
  const cacheHit = core.getState(`${name}-cache-hit`)
  const restoredKey = core.getState(`${name}-restored-key`)
  const originalContentHash = core.getState(`${name}-content-hash`)
  const originalFilesPath = core.getState(`${name}-content-files-path`)

  core.debug(`${name}-cache-hit is ${cacheHit}`)
  core.debug(`${name}-restored-key is ${restoredKey}`)
  core.debug(`${name}-content-hash is ${originalContentHash}`)

  // Check if cache contents changed since restore
  let contentsChanged = false
  if (originalContentHash) {
    // For disk cache, only track cas/ (actual outputs), not ac/ (action cache mappings)
    const hashPath = name.startsWith('disk') ? `${paths[0]}/cas` : paths[0]
    const { hash: currentContentHash, files: currentFiles } = await hashCacheContents(hashPath)
    core.debug(`${name} current content hash: ${currentContentHash}`)
    contentsChanged = currentContentHash !== originalContentHash
    if (contentsChanged) {
      core.info(`Cache contents changed for ${name}`)

      // Log which files changed
      if (originalFilesPath && fs.existsSync(originalFilesPath)) {
        const originalFiles = new Set(fs.readFileSync(originalFilesPath, 'utf8').split('\n'))
        const currentFilesSet = new Set(currentFiles)

        const added = currentFiles.filter(f => !originalFiles.has(f))
        const removed = [...originalFiles].filter(f => !currentFilesSet.has(f))

        if (added.length > 0) {
          core.info(`Files added (${added.length}):`)
          added.slice(0, 50).forEach(f => core.info(`  + ${f}`))
          if (added.length > 50) core.info(`  ... and ${added.length - 50} more`)
        }
        if (removed.length > 0) {
          core.info(`Files removed (${removed.length}):`)
          removed.slice(0, 50).forEach(f => core.info(`  - ${f}`))
          if (removed.length > 50) core.info(`  ... and ${removed.length - 50} more`)
        }
      }
    }
  }

  // Skip save if exact cache hit AND contents haven't changed
  if (cacheHit === 'true' && !contentsChanged) {
    core.info(`Cache hit and contents unchanged for ${name}, skipping save`)
    return
  }

  // Skip re-upload if reupload is disabled and we had a cache hit (even if contents changed)
  if (cacheConfig.reupload === false && cacheHit === 'true' && contentsChanged) {
    core.info(`Cache contents changed for ${name}, but reupload is disabled - skipping save`)
    return
  }

  try {
    core.startGroup(`Save cache for ${name}`)
    const hash = await glob.hashFiles(
      cacheConfig.files.join('\n'),
      undefined,
      // We don't want to follow symlinks as it's extremely slow on macOS.
      { followSymbolicLinks: false }
    )
    const key = `${config.baseCacheKey}-${name}-${hash}`

    // If contents changed and we had a cache hit, delete the old cache first
    if (contentsChanged && cacheHit === 'true' && restoredKey) {
      await deleteCache(restoredKey)
    }

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
