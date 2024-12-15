const core = require('@actions/core')
const { unmountAndCommitStickyDisk } = require('./stickydisk')
const process = require('node:process');

async function run() {
  try {
    // Handle sticky disk unmounting and committing.
    await cleanupStickyDisks()
  } catch (error) {
    core.setFailed(error.message)
  }
  process.exit(0)
}

async function cleanupStickyDisks() {
  const mountsJson = core.getState('sticky-disk-mounts')
  if (!mountsJson) {
    core.debug('No sticky disk mounts found in state')
    return
  }

  const mounts = JSON.parse(mountsJson)
  core.debug(`Mounts: ${JSON.stringify(mounts, null, 2)}`)

  // Process each mounted sticky disk
  await Promise.all(Object.entries(mounts).map(async ([path, mountInfo]) => {
    await unmountAndCommitStickyDisk(path, mountInfo, mountInfo.stickyDiskKey)
  }))
}

run()
