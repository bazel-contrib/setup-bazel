const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const core = require('@actions/core')

function init(cacheConfig) {
  core.startGroup(`Computing initial ${cacheConfig.name} cache hash`)
  const hashFile = cacheConfig.paths[0] + '.sha256'
  const parentDir = path.dirname(hashFile)
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true })
  }
  fs.writeFileSync(hashFile, computeCacheHash(cacheConfig.paths[0]))
  core.endGroup()
}

function run(cacheConfig) {
  if (!fs.existsSync(cacheConfig.paths[0])) {
    core.warning(`No ${cacheConfig.name} cache present`)
    return
  }

  const files = fs.readdirSync(cacheConfig.paths[0], { withFileTypes: true, recursive: true })
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
    if (cacheSize + size >= deleteThreshold) {
      fs.unlinkSync(file)
      reclaimed++
    } else {
      cacheSize += size
    }
  }
  core.info(`Reclaimed ${reclaimed} files`)
  core.endGroup()

  return cacheChanged(cacheConfig)
}

function cacheChanged(cacheConfig) {
  core.startGroup(`Checking ${cacheConfig.name} cache for changes`)
  const hash = computeCacheHash(cacheConfig.paths[0])
  const changed = fs.readFileSync(cacheConfig.paths[0] + '.sha256') != hash
  core.info(`Cache has changes: ${changed}`)
  core.endGroup()
  return changed ? hash : undefined
}

function computeCacheHash(cachePath) {
  let hash = crypto.createHash('sha256')

  if (fs.existsSync(cachePath)) {
    const files = fs.readdirSync(cachePath, { withFileTypes: true, recursive: true })
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
