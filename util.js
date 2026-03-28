// https://www.npmjs.com/package/get-folder-size
// Adapted for ESM and synchronous Filesystem calls.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

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

/**
 * Hash cache contents by hashing the sorted list of filenames.
 * Works for Bazel's content-addressable caches where filenames ARE content hashes.
 * Returns { hash, files } for comparison.
 */
async function hashCacheContents(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return { hash: null, files: [] }
  }

  const files = []
  await collectFiles(rootPath, files)
  files.sort()

  const hash = crypto.createHash('sha256')
    .update(files.join('\n'))
    .digest('hex')

  return { hash, files }
}

async function collectFiles(dirPath, files) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(fullPath, files)
    } else {
      files.push(fullPath)
    }
  }
}

export { getFolderSize, hashCacheContents }
