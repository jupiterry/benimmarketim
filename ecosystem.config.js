module.exports = {
  apps: [
    {
      name: 'benimmarketim-api',
      script: './backend/server.js',
      instances: 'max', // CPU core sayısı kadar instance oluştur
      exec_mode: 'cluster', // Cluster mode aktif
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      // Log ayarları
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Otomatik restart ayarları
      watch: false,
      max_memory_restart: '1G', // 1GB'dan fazla memory kullanırsa restart
      
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Instance sayısını manuel olarak belirlemek isterseniz:
      // instances: 4, // 4 instance çalıştır
      
      // Development için tek instance
      // instances: 1,
      // exec_mode: 'fork',
    }
  ]
};

