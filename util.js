// https://www.npmjs.com/package/get-folder-size
// Adapted for CommonJS and synchronous Filesystem calls.

import fs from 'fs'
import path from 'path'

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

async function deleteOldCaches(token, prefix) {
  const { owner, repo } = getRepo()
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com'
  const baseUrl = `${apiUrl}/repos/${owner}/${repo}/actions/caches`
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  }

  // List caches matching the prefix
  const listUrl = `${baseUrl}?key=${encodeURIComponent(prefix)}`
  const response = await fetch(listUrl, { headers })

  if (!response.ok) {
    throw new Error(`Failed to list caches (${listUrl}): ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const caches = data.actions_caches || []

  if (caches.length === 0) {
    return 0
  }

  // Delete each matching cache
  let deleted = 0
  for (const c of caches) {
    const deleteUrl = `${baseUrl}/${c.id}`
    const deleteResponse = await fetch(deleteUrl, { method: 'DELETE', headers })
    if (deleteResponse.ok) {
      deleted++
    } else {
      const body = await deleteResponse.text().catch(() => '')
      throw new Error(`Failed to delete cache ${c.id} (key: ${c.key}): ${deleteResponse.status} ${deleteResponse.statusText} ${body}`)
    }
  }

  return deleted
}

function getRepo() {
  const repository = process.env.GITHUB_REPOSITORY || ''
  const [owner, repo] = repository.split('/')
  return { owner, repo }
}

export { getFolderSize, deleteOldCaches }
