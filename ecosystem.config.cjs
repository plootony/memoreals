module.exports = {
  apps: [{
    name: 'memoreals',
    script: './server/src/index.js',
    cwd: '/home/ubuntu/memoreals',   // путь на VPS
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
  }]
}
