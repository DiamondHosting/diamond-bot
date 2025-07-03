// Type definitions for Diamond Bot
declare module "*.js" {
  const content: any;
  export default content;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TOKEN: string;
      CLIENT_ID: string;
      GUILD_ID?: string;
      BOT_PREFIX?: string;
      BOT_STATUS?: string;
      BOT_ACTIVITY?: string;
      DB_BACKUP_INTERVAL?: string;
      MAX_BACKUP_COUNT?: string;
      LOG_LEVEL?: string;
      LOG_FILE?: string;
      NODE_ENV?: 'development' | 'production';
    }
  }
}

export {};
