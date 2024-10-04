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

/***/ 351:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

// https://www.npmjs.com/package/get-folder-size
// Adapted for CommonJS and synchronous Filesystem calls.

const fs = __nccwpck_require__(147)
const path = __nccwpck_require__(17)

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

/***/ 288:
/***/ ((module) => {

module.exports = eval("require")("yaml");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 742:
/***/ ((module) => {

"use strict";
module.exports = require("node:process");

/***/ }),

/***/ 37:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

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
const path = __nccwpck_require__(17)
const cache = __nccwpck_require__(424)
const core = __nccwpck_require__(881)
const glob = __nccwpck_require__(699)
const config = __nccwpck_require__(832)
const { getFolderSize } = __nccwpck_require__(351)
const process = __nccwpck_require__(742);

async function run() {
  await saveCaches()
  process.exit(0)
}

async function saveCaches() {
  await saveCache(config.bazeliskCache)
  await saveCache(config.diskCache)
  await saveCache(config.repositoryCache)
  await saveExternalCaches(config.externalCache)
}

async function saveExternalCaches(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const globber = await glob.create(
    `${config.paths.bazelExternal}/*`,
    { implicitDescendants: false }
  )
  const externalPaths = await globber.glob()
  const savedCaches = []

  for (const externalPath of externalPaths) {
    const size = await getFolderSize(externalPath)
    const sizeMB = (size / 1024 / 1024).toFixed(2)
    core.debug(`${externalPath} size is ${sizeMB}MB`)

    if (sizeMB >= cacheConfig.minSize) {
      const name = path.basename(externalPath)
      await saveCache({
        enabled: cacheConfig[name]?.enabled ?? cacheConfig.default.enabled,
        files: cacheConfig[name]?.files || cacheConfig.default.files,
        name: cacheConfig.default.name(name),
        paths: cacheConfig.default.paths(name)
      })
      savedCaches.push(name)
    }
  }

  if (savedCaches.length > 0) {
    const path = cacheConfig.manifest.path
    fs.writeFileSync(path, savedCaches.join('\n'))
    await saveCache({
      enabled: true,
      files: cacheConfig.manifest.files,
      name: cacheConfig.manifest.name,
      paths: [path]
    })
  }
}

async function saveCache(cacheConfig) {
  if (!cacheConfig.enabled) {
    return
  }

  const cacheHit = core.getState(`${cacheConfig.name}-cache-hit`)
  core.debug(`${cacheConfig.name}-cache-hit is ${cacheHit}`)
  if (cacheHit === 'true') {
    return
  }

  try {
    core.startGroup(`Save cache for ${cacheConfig.name}`)
    const paths = cacheConfig.paths
    const hash = await glob.hashFiles(
      cacheConfig.files.join('\n'),
      undefined,
      // We don't want to follow symlinks as it's extremely slow on macOS.
      { followSymbolicLinks: false }
    )
    const key = `${config.baseCacheKey}-${cacheConfig.name}-${hash}`
    core.debug(`Attempting to save ${paths} cache to ${key}`)
    await cache.saveCache(paths, key)
    core.info('Successfully saved cache')
  } catch (error) {
    core.warning(error.stack)
  } finally {
    core.endGroup()
  }
}

run()

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=index.js.map