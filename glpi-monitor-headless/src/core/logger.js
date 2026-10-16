import winston from 'winston';
import { config } from './config.js';

export const logger = winston.createLogger({
    level: config.monitor.debug ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: `${config.paths.logs}/monitor.log`,
            maxsize: 5 * 1024 * 1024,
            maxFiles: 3,
            tailable: true
        })
    ]
});
