import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config();

export interface Config {
  port: number;
  dataDir: string;
  dailyBudget: number;
  monthlyBudget: number;
  logFormat: 'pretty' | 'json';
  upstreamUrl: string;
}

function resolveHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export const config: Config = {
  port: parseInt(process.env.CCGATE_PORT || '4100', 10),
  dataDir: resolveHome(process.env.CCGATE_DATA_DIR || '~/.ccgate'),
  dailyBudget: parseFloat(process.env.CCGATE_DAILY_BUDGET || '5.00'),
  monthlyBudget: parseFloat(process.env.CCGATE_MONTHLY_BUDGET || '50.00'),
  logFormat: (process.env.CCGATE_LOG_FORMAT || 'pretty') as 'pretty' | 'json',
  upstreamUrl: process.env.CCGATE_UPSTREAM_URL || 'https://api.deepseek.com/anthropic',
};
