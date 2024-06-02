const fs = require('fs')
const os = require('os')
const yaml = require('yaml')
const core = require('@actions/core')
const github = require('@actions/github')

const bazeliskVersion = core.getInput('bazelisk-version')
const cacheVersion = core.getInput('cache-version')
const externalCacheConfig = yaml.parse(core.getInput('external-cache'))

const homeDir = os.homedir()
const arch = os.arch()
const platform = os.platform()

let bazelDisk = core.toPosixPath(`${homeDir}/.cache/bazel-disk`)
let bazelRepository = core.toPosixPath(`${homeDir}/.cache/bazel-repo`)
let bazelOutputBase = `${homeDir}/.bazel`
let bazelrcPaths = [core.toPosixPath(`${homeDir}/.bazelrc`)]
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
    if (process.env.HOME) {
      bazelrcPaths.push(core.toPosixPath(`${process.env.HOME}/.bazelrc`))
    }
    break
}

const baseCacheKey = `setup-bazel-${cacheVersion}-${platform}`
const bazelrc = core.getMultilineInput('bazelrc')

const diskCacheConfig = core.getInput('disk-cache')
const diskCacheEnabled = diskCacheConfig !== 'false'
let diskCacheName = 'disk'
if (diskCacheEnabled) {
  bazelrc.push(`build --disk_cache=${bazelDisk}`)
  if (diskCacheName !== 'true') {
    diskCacheName = `${diskCacheName}-${diskCacheConfig}`
  }
}

const remoteCacheLogPath = core.toPosixPath(`${os.tmpdir()}/remote-cache-server.log`)
const remoteCacheServerUrl = 'http://localhost:9889/cache'
const remoteCacheEnabled = core.getBooleanInput('remote-cache')
if (remoteCacheEnabled) {
  bazelrc.push(`build --remote_cache=${remoteCacheServerUrl}`)
  if (diskCacheEnabled) {
    core.error('Disk cache and remote cache cannot be enabled at the same time')
  }
}

const repositoryCacheConfig = core.getInput('repository-cache')
const repositoryCacheEnabled = repositoryCacheConfig !== 'false'
let repositoryCacheFiles = [
  'MODULE.bazel',
  'WORKSPACE.bazel',
  'WORKSPACE.bzlmod',
  'WORKSPACE'
]
if (repositoryCacheEnabled) {
  bazelrc.push(`build --repository_cache=${bazelRepository}`)
  if (repositoryCacheConfig !== 'true') {
    repositoryCacheFiles = Array(repositoryCacheConfig).flat()
  }
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
  const { workflow, job } = github.context
  const manifestName = externalCacheConfig.name ||
    `${workflow.toLowerCase().replaceAll(/[ /]/g, '-')}-${job}`

  externalCache.enabled = true
  externalCache.minSize = 10 // MB
  externalCache.baseCacheKey = `${baseCacheKey}-external-`
  externalCache.manifest = {
    files: [
      'MODULE.bazel',
      'WORKSPACE.bazel',
      'WORKSPACE.bzlmod',
      'WORKSPACE'
    ],
    name: `external-${manifestName}-manifest`,
    path: `${os.tmpdir()}/external-cache-manifest.txt`
  }
  externalCache.default = {
    enabled: true,
    files: [
      'MODULE.bazel',
      'WORKSPACE.bazel',
      'WORKSPACE.bzlmod',
      'WORKSPACE'
    ],
    name: (name) => { return `external-${name}` },
    paths: (name) => {
      return [
        `${bazelExternal}/@${name}.marker`,
        `${bazelExternal}/${name}`
      ]
    }
  }

  for (const name in externalCacheConfig.manifest) {
    externalCache[name] = {
      enabled: externalCacheConfig.manifest[name] != false,
      files: Array(externalCacheConfig.manifest[name]).flat()
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
  bazeliskVersion,
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
    bazelrc: bazelrcPaths
  },
  os: {
    arch,
    platform,
  },
  repositoryCache: {
    enabled: repositoryCacheEnabled,
    files: repositoryCacheFiles,
    name: 'repository',
    paths: [bazelRepository]
  },
  remoteCache: {
    enabled: remoteCacheEnabled,
    logPath: remoteCacheLogPath,
    url: remoteCacheServerUrl,
  }
}
