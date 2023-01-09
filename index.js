const fs = require('fs')
const core = require('@actions/core')
const cache = require('@actions/cache')
const github = require('@actions/github')
const glob = require('@actions/glob')
const config = require('./config')

async function run () {
  try {
    await setupBazel()
  } catch (error) {
    core.setFailed(error.stack)
  }
}

async function setupBazel () {
  core.startGroup('Configure Bazel')
  console.log('Configuration:')
  console.log(JSON.stringify(config, null, 2))

  await setupBazelrc()
  core.endGroup()

  await restoreCache(config.bazeliskCache)
  await restoreCache(config.diskCache)
  await restoreCache(config.repositoryCache)
  await restoreExternalCaches(config.externalCache)
}

async function setupBazelrc () {
  fs.writeFileSync(
    config.paths.bazelrc,
    `startup --output_base=${config.paths.bazelOutputBase}\n`
  )

  for (const line of config.bazelrc) {
    fs.appendFileSync(config.paths.bazelrc, `${line}\n`)
  }
}

async function restoreExternalCaches (cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const repo = github.context.repo
  const octokit = github.getOctokit(config.token)
  const { data: { actions_caches: caches } } = await octokit.rest.actions.getActionsCacheList({
    owner: repo.owner,
    repo: repo.repo,
    key: cacheConfig.baseCacheKey,
    per_page: 100
  })

  const names = new Set([])
  const regexp = new RegExp(cacheConfig.regexp)
  for (const cache of caches) {
    core.debug(`Cache key is ${cache.key}`)

    const match = cache.key.match(regexp)
    if (match) {
      names.add(match.groups.name)
    }
  }

  for (const name of names) {
    await restoreCache({
      enabled: true,
      files: cacheConfig[name]?.files || cacheConfig.default.files,
      name: cacheConfig.name(name),
      paths: cacheConfig.paths(name)
    })
  }
}

async function restoreCache (cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  core.startGroup(`Restore cache for ${cacheConfig.name}`)

  const hash = await glob.hashFiles(cacheConfig.files.join('\n'))
  const name = cacheConfig.name
  const paths = cacheConfig.paths
  const restoreKey = `${config.baseCacheKey}-${name}-`
  const key = `${restoreKey}${hash}`

  console.log(`Attempting to restore ${name} cache from ${key}`)

  const restoredKey = await cache.restoreCache(paths, key, [restoreKey])
  if (restoredKey) {
    console.log(`Successfully restored cache from ${restoredKey}`)

    if (restoredKey === key) {
      core.saveState(`${name}-cache-hit`, 'true')
    }
  } else {
    console.log(`Failed to restore ${name} cache`)
  }

  core.endGroup()
}

run()
