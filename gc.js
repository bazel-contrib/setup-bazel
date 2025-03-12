const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const core = require('@actions/core')

function init(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  core.startGroup(`Computing initial ${cacheConfig.name} cache hash`)
  fs.writeFileSync(cacheConfig.path + '.sha256', computeCacheHash(cacheConfig.path))
  core.endGroup()
}

function run(cacheConfig) {
  if (!fs.existsSync(cacheConfig.path)) {
    return
  }

  const files = fs.readdirSync(cacheConfig.path, { withFileTypes: true, recursive: true })
    .filter(d => d.isFile())
    .map(d => {
      const file = path.join(d.path, d.name)
      const { mtime, size} = fs.statSync(file)
      return { file, mtime, size }
    })
    .sort((a, b) => b.mtime - a.mtime)

  core.startGroup(`Running ${cacheConfig.name} cache garbage collection`)
  const deleteThreshold = cacheConfig.maxSize * 1024 ** 3
  let cacheSize = 0
  let reclaimed = 0
  for (const { file, size } of files) {
    cacheSize += size
    if (cacheSize >= deleteThreshold) {
      fs.unlinkSync(file)
      reclaimed++
    }
  }
  core.info(`Reclaimed ${reclaimed} files`)
  core.endGroup()

  return cacheChanged(cacheConfig)
}

function cacheChanged(cacheConfig) {
  core.startGroup(`Checking ${cacheConfig.name} cache for changes`)
  const hash = computeCacheHash(cacheConfig.path)
  const changed = fs.readFileSync(cacheConfig.path + '.sha256') != hash
  core.info(`Cache has changes: ${changed}`)
  core.endGroup()
  return changed ? hash : undefined
}

function computeCacheHash(path) {
  let hash = crypto.createHash('sha256')

  if (fs.existsSync(path)) {
    const files = fs.readdirSync(path, { withFileTypes: true, recursive: true })
      .filter(d => d.isFile())
      .map(d => d.path)
      .sort()

    hash.update(files.join('\n'))

    core.info(`Collected ${files.length} files`)
  }

  return hash.digest('hex')
}

module.exports = {
  init,
  run,
}
