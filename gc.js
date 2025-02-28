const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const core = require('@actions/core')
const config = require('./config')

const diskCachePath = config.diskCache.paths[0]
const diskCacheHash = diskCachePath + '.sha256'

function init() {
  if (!config.diskCache.enabled) {
    return
  }

  core.startGroup("Computing initial disk cache hash")
  fs.writeFileSync(diskCacheHash, computeDiskCacheHash())
  core.endGroup()
}

function run() {
  const files = fs.readdirSync(diskCachePath, { withFileTypes: true, recursive: true })
    .filter(d => d.isFile())
    .map(d => {
      const file = path.join(d.path, d.name)
      const stats = fs.statSync(file)
      return { file, mtime: stats.mtime, size: stats.size }
    })
    .sort((a, b) => b.mtime - a.mtime)

  core.startGroup(`Running disk cache garbage collection`)
  const deleteThreshold = config.maxDiskCacheSize * 1024 ** 3
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
}

function cacheChanged() {
  core.startGroup(`Checking disk cache for changes`)
  const changed = fs.readFileSync(diskCacheHash) != computeDiskCacheHash()
  core.info(`Cache has changes: ${changed}`)
  core.endGroup()
  return changed
}

function computeDiskCacheHash() {
  const files = fs.readdirSync(diskCachePath, { withFileTypes: true, recursive: true })
    .filter(d => d.isFile())
    .map(d => d.path)
    .sort()

  core.info(`Collected ${files.length} files`)

  return crypto.createHash('sha256').update(files.join('\n')).digest('hex')
}

module.exports = {
  init,
  run,
  cacheChanged,
}
