// src/utils/logger.js
// Structured logging with Winston.
// In development: coloured console output
// In production: JSON lines (readable by AWS CloudWatch, Azure Monitor, etc.)

import winston from 'winston'

const { combine, timestamp, colorize, printf, json, errors } = winston.format

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? '\n' + JSON.stringify(meta, null, 2)
      : ''
    return `${timestamp} [${level}] ${message}${metaStr}`
  })
)

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
)

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console()
  ]
})
