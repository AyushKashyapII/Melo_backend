import { createClient } from 'redis';
import dotenv from 'dotenv';
dotenv.config();

const client = createClient({
  username: process.env.REDIS_USERNAME || 'default',
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '16649')
  }
});

client.on('error', err => console.error('❌ Redis Client Error', err));
client.on('connect', () => console.log('✅ Connected to Redis'));
client.on('ready', () => console.log('🚀 Redis Client Ready'));

await client.connect();

export default client;


