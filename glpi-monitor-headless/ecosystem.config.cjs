// pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
    apps: [{
        name: 'glpi-monitor',
        script: 'src/index.js',
        autorestart: true,
        max_restarts: 20,
        restart_delay: 5000,
        max_memory_restart: '700M'
    }]
};
