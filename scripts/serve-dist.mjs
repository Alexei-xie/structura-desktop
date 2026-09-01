import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { constants, createBrotliCompress, createGzip } from 'node:zlib'

const root = join(process.cwd(), 'dist')
const host = '127.0.0.1'
const port = 4173
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${host}`).pathname)
  const requested = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '')
  let file = join(root, requested === '/' ? 'index.html' : requested)
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, 'index.html')

  const type = mimeTypes[extname(file)] ?? 'application/octet-stream'
  const compressible = /^(text\/|application\/(javascript|json))/.test(type)
  const acceptsBrotli = /\bbr\b/.test(request.headers['accept-encoding'] ?? '')
  const acceptsGzip = /\bgzip\b/.test(request.headers['accept-encoding'] ?? '')
  response.setHeader('Content-Type', type)
  response.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable')
  response.setHeader('Vary', 'Accept-Encoding')

  if (compressible && acceptsBrotli) {
    response.setHeader('Content-Encoding', 'br')
    createReadStream(file)
      .pipe(createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }))
      .pipe(response)
  } else if (compressible && acceptsGzip) {
    response.setHeader('Content-Encoding', 'gzip')
    createReadStream(file).pipe(createGzip({ level: 9 })).pipe(response)
  } else {
    response.setHeader('Content-Length', statSync(file).size)
    createReadStream(file).pipe(response)
  }
}).listen(port, host, () => {
  console.log(`Compressed preview: http://${host}:${port}/`)
})
