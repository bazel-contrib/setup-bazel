// https://www.npmjs.com/package/get-folder-size
// Adapted for CommonJS and synchronous Filesystem calls.

const fs = require('fs')
const path = require('path')

async function getFolderSize (rootItemPath, options = {}) {
  const fileSizes = new Map()

  await processItem(rootItemPath)

  async function processItem (itemPath) {
    if (options.ignore?.test(itemPath)) return

    const stats = lstatSync(itemPath, { bigint: true })
    if (typeof stats !== 'object') return

    fileSizes.set(stats.ino, stats.size)

    if (stats.isDirectory()) {
      const directoryItems = fs.readdirSync(itemPath)
      if (typeof directoryItems !== 'object') return
      await Promise.all(
        directoryItems.map(directoryItem =>
          processItem(path.join(itemPath, directoryItem))
        )
      )
    }
  }

  let folderSize = Array.from(fileSizes.values()).reduce((total, fileSize) => total + fileSize, 0n)

  if (!options.bigint) {
    if (folderSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError('The folder size is too large to return as a Number. You can instruct this package to return a BigInt instead.')
    }
    folderSize = Number(folderSize)
  }

  return folderSize
}

function lstatSync(path, opts) {
  try {
    return fs.lstatSync(path, opts)
  } catch (error) {
    return
  }
}

module.exports = { getFolderSize }
