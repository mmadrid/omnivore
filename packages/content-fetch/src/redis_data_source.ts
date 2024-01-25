import Redis, { RedisOptions } from 'ioredis'

type RedisClientType = 'cache' | 'mq'
type RedisDataSourceOption = {
  url?: string
  cert?: string
}
export type RedisDataSourceOptions = {
  [key in RedisClientType]: RedisDataSourceOption
}

export class RedisDataSource {
  options: RedisDataSourceOptions

  cacheClient: Redis
  queueRedisClient: Redis

  constructor(options: RedisDataSourceOptions) {
    this.options = options

    const cacheClient = createIORedisClient('cache', this.options)
    if (!cacheClient) throw 'Error initializing cache redis client'

    this.cacheClient = cacheClient
    this.queueRedisClient =
      createIORedisClient('mq', this.options) || this.cacheClient // if mq is not defined, use cache
  }

  setOptions(options: RedisDataSourceOptions): void {
    this.options = options
  }

  async shutdown(): Promise<void> {
    try {
      await this.queueRedisClient?.quit()
      await this.cacheClient?.quit()
    } catch (err) {
      console.error('error while shutting down redis', err)
    }
  }
}

const createIORedisClient = (
  name: RedisClientType,
  options: RedisDataSourceOptions
): Redis | undefined => {
  const option = options[name]
  const redisURL = option.url
  if (!redisURL) {
    console.log(`no redisURL supplied: ${name}`)
    return undefined
  }

  const redisCert = option.cert
  const tls =
    redisURL.startsWith('rediss://') && redisCert
      ? {
          ca: redisCert,
          rejectUnauthorized: false,
        }
      : undefined

  const redisOptions: RedisOptions = {
    tls,
    name,
    connectTimeout: 10000,
    maxRetriesPerRequest: null,
    offlineQueue: false,
  }
  return new Redis(redisURL, redisOptions)
}

export const redisDataSource = new RedisDataSource({
  cache: {
    url: process.env.REDIS_CACHE_URL,
    cert: process.env.REDIS_CACHE_CERT,
  },
  mq: {
    url: process.env.MQ_REDIS_URL,
    cert: process.env.MQ_REDIS_CERT,
  },
})

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGINT', async () => {
  console.log('SIGINT signal received.')

  try {
    await redisDataSource.shutdown()
  } catch (error) {
    console.error('error while shutting down redis', error)
  }

  process.exit(0)
})
