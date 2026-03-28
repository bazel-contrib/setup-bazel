import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import nodeResolve from '@rollup/plugin-node-resolve'

const plugins = [nodeResolve({ preferBuiltins: true }), commonjs(), json()]

// Inject createRequire shim for lazy-loaded Node builtins in CJS code
const banner = `import { createRequire } from 'module';
const require = createRequire(import.meta.url);`

// Suppress THIS_IS_UNDEFINED warnings from dependencies we can't control
function onwarn(warning, warn) {
  if (warning.code === 'THIS_IS_UNDEFINED' && warning.id?.includes('node_modules')) {
    return
  }
  warn(warning)
}

export default [
  {
    input: 'index.js',
    output: {
      esModule: true,
      file: 'dist/main/index.js',
      format: 'es',
      sourcemap: true,
      banner
    },
    plugins,
    onwarn
  },
  {
    input: 'post.js',
    output: {
      esModule: true,
      file: 'dist/post/index.js',
      format: 'es',
      sourcemap: true,
      banner
    },
    plugins,
    onwarn
  }
]
