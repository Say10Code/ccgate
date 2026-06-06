import { discoverAllSessions, type DiscoveredSession } from './discovery.js';
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: DiscoveredSession[] = []; let lastScan = 0; let scanning = false; let scanPromise: Promise<DiscoveredSession[]> | null = null;
export function getSessionCache(): DiscoveredSession[] { return cache; }
export function startDiscoveryScan(): void { if (scanning) return; scanning = true; scanPromise = discoverAllSessions().then(s => { cache = s; lastScan = Date.now(); scanning = false; return s; }).catch(() => { scanning = false; return cache; }); }
export async function getSessions(): Promise<DiscoveredSession[]> { if (lastScan === 0) { startDiscoveryScan(); await scanPromise; return cache; } if (Date.now() - lastScan > CACHE_TTL_MS && !scanning) startDiscoveryScan(); return cache; }
export async function refreshSessions(): Promise<DiscoveredSession[]> { startDiscoveryScan(); await scanPromise; return cache; }
