const http = require('http')
const cache = require('@actions/cache')
const fs = require('fs')

// https://bazel.build/remote/caching#http-caching
const server = http.createServer(async (req, res) => {
  const { method, url } = req
  const [, , cacheType, sha] = url.split('/')
  const cacheKey = `setup-bazel-1-remote-cache-${sha}`
  const filePath = `/tmp/cache-${cacheType}-${sha}`

  if (method === 'GET') {
    try {
      const cacheId = await cache.restoreCache([filePath], cacheKey)
      if (!cacheId) {
        console.log(`Cache miss for ${cacheKey}`)
        res.writeHead(404)
        return res.end('Cache miss')
      }
      const data = fs.readFileSync(filePath)
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      res.end(data)
    } catch (error) {
      console.error(`Error retrieving cache for ${cacheKey}: ${error}`)
      res.writeHead(500)
      res.end('Internal Server Error')
    }
  } else if (method === 'PUT') {
    const data = []
    req.on('data', chunk => data.push(chunk))
    req.on('end', async () => {
      try {
        fs.writeFileSync(filePath, Buffer.concat(data))
        await cache.saveCache([filePath], cacheKey)
        console.log(`Cache saved for ${cacheKey}`)
        res.writeHead(201)
        res.end('Cache saved')
      } catch (error) {
        console.error(`Error saving cache for ${cacheKey}: ${error}`)
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    })
  } else {
    res.writeHead(405)
    res.end('Method Not Allowed')
  }
})

const PORT = process.env.PORT || 9889
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
