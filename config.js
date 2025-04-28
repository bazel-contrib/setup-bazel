const fs = require('fs')
const os = require('os')
const yaml = require('yaml')
const core = require('@actions/core')
const github = require('@actions/github')

const bazeliskVersion = core.getInput('bazelisk-version')
const cachePrefix = core.getInput('cache-prefix')
const cacheVersion = core.getInput('cache-version')
const externalCacheConfig = yaml.parse(core.getInput('external-cache'))
const moduleRoot = core.getInput('module-root')

const homeDir = os.homedir()
const arch = os.arch()
const platform = os.platform()

let bazelOutputBase = core.getInput('output-base')
if (!bazelOutputBase) {
  if (platform === 'win32') {
    bazelOutputBase = 'D:/_bazel'
  } else {
    bazelOutputBase = `${homeDir}/.bazel`
  }
}

let bazelDisk = core.toPosixPath(`${homeDir}/.cache/bazel-disk`)
let bazelRepository = core.toPosixPath(`${homeDir}/.cache/bazel-repo`)
let bazelrcPaths = [core.toPosixPath(`${homeDir}/.bazelrc`)]
let userCacheDir = `${homeDir}/.cache`

switch (platform) {
  case 'darwin':
    userCacheDir = `${homeDir}/Library/Caches`
    break
  case 'win32':
    bazelDisk = `${bazelOutputBase}-disk`
    bazelRepository = `${bazelOutputBase}-repo`
    userCacheDir = `${homeDir}/AppData/Local`
    if (process.env.HOME) {
      bazelrcPaths.push(core.toPosixPath(`${process.env.HOME}/.bazelrc`))
    }
    break
}

const baseCacheKey = `setup-bazel-${cacheVersion}-${cachePrefix}`
const bazelrc = core.getMultilineInput('bazelrc')

let diskCacheEnabled
try {
  diskCacheEnabled = core.getBooleanInput('disk-cache')
} catch (error) {
  core.error("`disk-cache` now only accepts a boolean, use `cache-prefix` to provide unique cache keys")
  core.error("https://github.com/bazel-contrib/setup-bazel/releases/tag/0.15.0")
  throw error
}
const diskCacheMaxSize = core.getInput('disk-cache-max-size')
if (diskCacheEnabled) {
  bazelrc.push(`common --disk_cache=${bazelDisk}`)
}

let repositoryCacheEnabled
try {
  repositoryCacheEnabled = core.getBooleanInput('repository-cache')
} catch (error) {
  core.error("`repository-cache` now only accepts a boolean, it is no longer necessary to provide a file path")
  core.error("https://github.com/bazel-contrib/setup-bazel/releases/tag/0.15.0")
  throw error
}
const repositoryCacheMaxSize = core.getInput('repository-cache-max-size')
if (repositoryCacheEnabled) {
  bazelrc.push(`common --repository_cache=${bazelRepository}`)
}

const googleCredentials = core.getInput('google-credentials')
const googleCredentialsSaved = (core.getState('google-credentials-path').length > 0)
if (googleCredentials.length > 0 && !googleCredentialsSaved) {
  const tmpDir = core.toPosixPath(fs.mkdtempSync(process.env.RUNNER_TEMP))
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
      `${moduleRoot}/MODULE.bazel`,
      `${moduleRoot}/WORKSPACE.bazel`,
      `${moduleRoot}/WORKSPACE.bzlmod`,
      `${moduleRoot}/WORKSPACE`
    ],
    name: `external-${manifestName}-manifest`,
    path: `${os.tmpdir()}/external-cache-manifest.txt`
  }
  externalCache.default = {
    enabled: true,
    files: [
      `${moduleRoot}/MODULE.bazel`,
      `${moduleRoot}/WORKSPACE.bazel`,
      `${moduleRoot}/WORKSPACE.bzlmod`,
      `${moduleRoot}/WORKSPACE`
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

const token = core.getInput('token')
core.exportVariable('BAZELISK_GITHUB_TOKEN', token)

module.exports = {
  baseCacheKey,
  bazeliskCache: {
    enabled: core.getBooleanInput('bazelisk-cache'),
    files: [`${moduleRoot}/.bazelversion`],
    name: 'bazelisk',
    paths: [core.toPosixPath(`${userCacheDir}/bazelisk`)]
  },
  bazeliskVersion,
  bazelrc,
  diskCache: {
    enabled: diskCacheEnabled,
    maxSize: diskCacheMaxSize,
    name: 'disk',
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
    maxSize: repositoryCacheMaxSize,
    name: 'repository',
    paths: [bazelRepository]
  },
}
