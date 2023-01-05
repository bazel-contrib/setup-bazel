const fs = require('fs')
const os = require('os')
const yaml = require('yaml')
const core = require('@actions/core')

const cacheVersion = core.getInput('cache-version')
const externalCacheConfig = yaml.parse(core.getInput('external-cache'))

const homeDir = os.homedir()
const platform = os.platform()

let bazelDisk = core.toPosixPath(`${homeDir}/.cache/bazel-disk`)
let bazelRepository = core.toPosixPath(`${homeDir}/.cache/bazel-repo`)
let bazelOutputBase = `${homeDir}/.bazel`
let userCacheDir = `${homeDir}/.cache`

switch (platform) {
  case 'darwin':
    userCacheDir = `${homeDir}/Library/Caches`
    break
  case 'win32':
    bazelDisk = 'D:/_bazel-disk'
    bazelRepository = 'D:/_bazel-repo'
    bazelOutputBase = 'D:/_bazel'
    userCacheDir = `${homeDir}/AppData/Local`
    break
}

const baseCacheKey = `setup-bazel-${cacheVersion}-${platform}`
const bazelrc = core.getMultilineInput('bazelrc')

const diskCacheConfig = core.getInput('disk-cache')
const diskCacheEnabled = diskCacheConfig.length > 0
let diskCacheName = 'disk'
if (diskCacheEnabled) {
  bazelrc.push(`build --disk_cache=${bazelDisk}`)
  diskCacheName = `${diskCacheName}-${diskCacheConfig}`
}

const repositoryCacheEnabled = core.getBooleanInput('repository-cache')
if (repositoryCacheEnabled) {
  bazelrc.push(`build --repository_cache=${bazelRepository}`)
}

const googleCredentials = core.getInput('google-credentials')
const googleCredentialsSaved = (core.getState('google-credentials-path').length > 0)
if (googleCredentials.length > 0 && !googleCredentialsSaved) {
  const tmpDir = core.toPosixPath(fs.mkdtempSync(os.tmpdir()))
  const googleCredentialsPath = `${tmpDir}/key.json`
  fs.writeFileSync(googleCredentialsPath, googleCredentials)
  bazelrc.push(`build --google_credentials=${googleCredentialsPath}`)
  core.saveState('google-credentials-path', googleCredentialsPath)
}

const bazelExternal = core.toPosixPath(`${bazelOutputBase}/external`)
const externalCache = {}
if (externalCacheConfig) {
  externalCache.enabled = true
  externalCache.minSize = 10 // MB
  externalCache.baseCacheKey = `${baseCacheKey}-external-`
  externalCache.regexp = `^${baseCacheKey}-external-(?<name>.+)-[a-z0-9]+$`
  externalCache.default = {
    files: [
      'WORKSPACE.bazel',
      'WORKSPACE'
    ]
  }
  externalCache.name = (name) => {
    return `external-${name}`
  }
  externalCache.paths = (name) => {
    return [
      `${bazelExternal}/@${name}.marker`,
      `${bazelExternal}/${name}`
    ]
  }

  for (const name in externalCacheConfig) {
    externalCache[name] = {
      files: Array(externalCacheConfig[name]).flat()
    }
  }
}

module.exports = {
  baseCacheKey,
  bazeliskCache: {
    enabled: core.getBooleanInput('bazelisk-cache'),
    files: ['.bazelversion'],
    name: 'bazelisk',
    paths: [core.toPosixPath(`${userCacheDir}/bazelisk`)]
  },
  bazelrc,
  diskCache: {
    enabled: diskCacheEnabled,
    files: [
      '**/BUILD.bazel',
      '**/BUILD'
    ],
    name: diskCacheName,
    paths: [bazelDisk]
  },
  externalCache,
  paths: {
    bazelExternal,
    bazelOutputBase: core.toPosixPath(bazelOutputBase),
    bazelrc: core.toPosixPath(`${homeDir}/.bazelrc`)
  },
  platform,
  repositoryCache: {
    enabled: repositoryCacheEnabled,
    files: [
      'WORKSPACE.bazel',
      'WORKSPACE'
    ],
    name: 'repository',
    paths: [bazelRepository]
  },
  token: core.getInput('token'),
  useGnuTarOnWindows: core.getBooleanInput('use-gnu-tar-on-windows')
}
