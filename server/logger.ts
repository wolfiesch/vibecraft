/**
 * Structured Logger for Vibecraft Server
 *
 * Provides categorized logging with timestamps and context.
 * Categories help filter and analyze logs by area of concern.
 */

export type LogCategory =
  | 'server' // Server lifecycle, startup, shutdown
  | 'network' // WebSocket, HTTP connections
  | 'parsing' // JSON parsing, data validation
  | 'file' // File I/O operations
  | 'session' // Session management
  | 'tmux' // tmux operations
  | 'event' // Event processing

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  context?: Record<string, unknown>
}

class Logger {
  private debugEnabled: boolean

  constructor() {
    this.debugEnabled = process.env.VIBECRAFT_DEBUG === 'true'
  }

  private formatEntry(entry: LogEntry): string {
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}${contextStr}`
  }

  private createEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      context,
    }
  }

  debug(category: LogCategory, message: string, context?: Record<string, unknown>): void {
    if (!this.debugEnabled) return
    const entry = this.createEntry('debug', category, message, context)
    console.log(this.formatEntry(entry))
  }

  info(category: LogCategory, message: string, context?: Record<string, unknown>): void {
    const entry = this.createEntry('info', category, message, context)
    console.log(this.formatEntry(entry))
  }

  warn(category: LogCategory, message: string, context?: Record<string, unknown>): void {
    const entry = this.createEntry('warn', category, message, context)
    console.warn(this.formatEntry(entry))
  }

  error(category: LogCategory, message: string, context?: Record<string, unknown>): void {
    const entry = this.createEntry('error', category, message, context)
    console.error(this.formatEntry(entry))
  }

  /**
   * Enable or disable debug logging at runtime
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled
  }
}

export const logger = new Logger()
