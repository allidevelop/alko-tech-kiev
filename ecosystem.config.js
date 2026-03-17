module.exports = {
  apps: [
    {
      name: "alko-backend",
      cwd: "/home/developer/projects/alko-store",
      script: "./node_modules/.bin/medusa",
      args: "develop",
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 9000,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/home/developer/.pm2/logs/alko-backend-error.log",
      out_file: "/home/developer/.pm2/logs/alko-backend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "alko-storefront",
      cwd: "/home/developer/projects/alko-store-storefront",
      script: "./node_modules/.bin/next",
      args: "start -p 3104",
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 3104,
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/home/developer/.pm2/logs/alko-storefront-error.log",
      out_file: "/home/developer/.pm2/logs/alko-storefront-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
}
