require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 832:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const fs = __nccwpck_require__(147)
const os = __nccwpck_require__(37)
const yaml = __nccwpck_require__(288)
const core = __nccwpck_require__(881)
const github = __nccwpck_require__(297)

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
}


/***/ }),

/***/ 424:
/***/ ((module) => {

module.exports = eval("require")("@actions/cache");


/***/ }),

/***/ 881:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 297:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 699:
/***/ ((module) => {

module.exports = eval("require")("@actions/glob");


/***/ }),

/***/ 533:
/***/ ((module) => {

module.exports = eval("require")("@actions/tool-cache");


/***/ }),

/***/ 288:
/***/ ((module) => {

module.exports = eval("require")("yaml");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 37:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 670:
/***/ ((module) => {

"use strict";
module.exports = require("timers/promises");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const fs = __nccwpck_require__(147)
const { setTimeout } = __nccwpck_require__(670)
const core = __nccwpck_require__(881)
const cache = __nccwpck_require__(424)
const github = __nccwpck_require__(297)
const glob = __nccwpck_require__(699)
const tc = __nccwpck_require__(533)
const config = __nccwpck_require__(832)

async function run() {
  try {
    await setupBazel()
  } catch (error) {
    core.setFailed(error.stack)
  }
}

async function setupBazel() {
  core.startGroup('Configure Bazel')
  core.info('Configuration:')
  core.info(JSON.stringify(config, null, 2))

  await setupBazelrc()
  core.endGroup()

  await setupBazelisk()
  await restoreCache(config.bazeliskCache)
  await restoreCache(config.diskCache)
  await restoreCache(config.repositoryCache)
  await restoreExternalCaches(config.externalCache)
}

async function setupBazelisk() {
  if (config.bazeliskVersion.length == 0) {
    return
  }

  core.startGroup('Setup Bazelisk')
  let toolPath = tc.find('bazelisk', config.bazeliskVersion)
  if (toolPath) {
    core.debug(`Found in cache @ ${toolPath}`)
  } else {
    toolPath = await downloadBazelisk()
  }
  core.addPath(toolPath)
  core.endGroup()
}

async function downloadBazelisk() {
  const version = config.bazeliskVersion
  core.debug(`Attempting to download ${version}`)

  // Possible values are 'arm', 'arm64', 'ia32', 'mips', 'mipsel', 'ppc', 'ppc64', 's390', 's390x' and 'x64'.
  // Bazelisk filenames use 'amd64' and 'arm64'.
  let arch = config.os.arch
  if (arch == 'x64') {
    arch = 'amd64'
  }

  // Possible values are 'aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos' and 'win32'.
  // Bazelisk filenames use 'darwin', 'linux' and 'windows'.
  let platform = config.os.platform
  if (platform == "win32") {
    platform = "windows"
  }

  let filename = `bazelisk-${platform}-${arch}`
  if (platform == 'windows') {
    filename = `${filename}.exe`
  }

  const token = core.getInput('token')
  const octokit = github.getOctokit(token, {
    baseUrl: 'https://api.github.com'
  })
  const { data: releases } = await octokit.rest.repos.listReleases({
    owner: 'bazelbuild',
    repo: 'bazelisk'
  })

  // Find version matching semver specification.
  const tagName = tc.evaluateVersions(releases.map((r) => r.tag_name), version)
  const release = releases.find((r) => r.tag_name === tagName)
  if (!release) {
    throw new Error(`Unable to find Bazelisk version ${version}`)
  }

  const asset = release.assets.find((a) => a.name == filename)
  if (!asset) {
    throw new Error(`Unable to find Bazelisk version ${version} for platform ${platform}/${arch}`)
  }

  const url = asset.browser_download_url
  core.debug(`Downloading from ${url}`)
  const downloadPath = await tc.downloadTool(url, undefined, `token ${token}`)

  core.debug('Adding to the cache...');
  fs.chmodSync(downloadPath, '755');
  const cachePath = await tc.cacheFile(downloadPath, 'bazel', 'bazelisk', version)
  core.debug(`Successfully cached bazelisk to ${cachePath}`)

  return cachePath
}

async function setupBazelrc() {
  for (const bazelrcPath of config.paths.bazelrc) {
    fs.writeFileSync(
      bazelrcPath,
      `startup --output_base=${config.paths.bazelOutputBase}\n`
    )
    fs.appendFileSync(bazelrcPath, config.bazelrc.join("\n"))
  }
}

async function restoreExternalCaches(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  // First fetch the manifest of external caches used.
  const path = cacheConfig.manifest.path
  await restoreCache({
    enabled: true,
    files: cacheConfig.manifest.files,
    name: cacheConfig.manifest.name,
    paths: [path]
  })

  // Now restore all external caches defined in manifest
  if (fs.existsSync(path)) {
    const manifest = fs.readFileSync(path, { encoding: 'utf8' })
    for (const name of manifest.split('\n').filter(s => s)) {
      await restoreCache({
        enabled: cacheConfig[name]?.enabled ?? cacheConfig.default.enabled,
        files: cacheConfig[name]?.files || cacheConfig.default.files,
        name: cacheConfig.default.name(name),
        paths: cacheConfig.default.paths(name)
      })
    }
  }
}

async function restoreCache(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const delay = Math.random() * 1000 // timeout <= 1 sec to reduce 429 errors
  await setTimeout(delay, async function () {
    core.startGroup(`Restore cache for ${cacheConfig.name}`)

    const hash = await glob.hashFiles(cacheConfig.files.join('\n'))
    const name = cacheConfig.name
    const paths = cacheConfig.paths
    const restoreKey = `${config.baseCacheKey}-${name}-`
    const key = `${restoreKey}${hash}`

    core.debug(`Attempting to restore ${name} cache from ${key}`)

    const restoredKey = await cache.restoreCache(
      paths, key, [restoreKey],
      { segmentTimeoutInMs: 300000 } // 5 minutes
    )

    if (restoredKey) {
      core.info(`Successfully restored cache from ${restoredKey}`)

      if (restoredKey === key) {
        core.saveState(`${name}-cache-hit`, 'true')
      }
    } else {
      core.info(`Failed to restore ${name} cache`)
    }

    core.endGroup()
  }())
}

run()

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=index.js.map