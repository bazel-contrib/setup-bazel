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

  core.debug(`${name}-cache-hit is ${cacheHit}`)
  core.debug(`${name}-restored-key is ${restoredKey}`)
  core.debug(`${name}-content-hash is ${originalContentHash}`)

  // Check if cache contents changed since restore
  let contentsChanged = false
  if (originalContentHash) {
    const currentContentHash = await hashCacheContents(paths[0])
    core.debug(`${name} current content hash: ${currentContentHash}`)
    contentsChanged = currentContentHash !== originalContentHash
    if (contentsChanged) {
      core.info(`Cache contents changed for ${name}`)
    }
  }

  // Skip save if exact cache hit AND contents haven't changed
  if (cacheHit === 'true' && !contentsChanged) {
    core.info(`Cache hit and contents unchanged for ${name}, skipping save`)
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
