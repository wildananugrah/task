import { createApp } from './app'
import { env } from './lib/env'

const app = createApp()

const server = Bun.serve({
  port: env.apiPort,
  fetch: app.fetch,
  // Uploads bypass this process entirely (presigned straight to the bucket), so
  // the request body limit only has to cover JSON.
  maxRequestBodySize: 2 * 1024 * 1024,
})

console.log(`taskspace-api listening on http://localhost:${server.port}  (origin ${env.appOrigin})`)
