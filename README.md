# ccgate

**Transparent LLM cost proxy** for Claude Code → DeepSeek API.

Tracks sessions, tokens, and spending in real-time — with zero added latency.

## Quick Start

```bash
# Clone and install
cd ccgate
npm install

# Set your DeepSeek API key (used by Claude Code)
export DEEPSEEK_API_KEY=sk-your-key-here

# Start the proxy
npm run dev
```

Then configure Claude Code:

```env
ANTHROPIC_BASE_URL=http://127.0.0.1:4100/v1
ANTHROPIC_API_KEY=sk-your-deepseek-key
```

## How It Works

```
Claude Code ──SSE stream──▶ ccgate (localhost:4100) ──SSE stream──▶ DeepSeek API /anthropic
                                   │
                                   ▼
                            Console output
                         (JSON Lines or Pretty)
```

The proxy sits between Claude Code and DeepSeek, intercepting every API request:

1. **Zero-latency SSE passthrough** — chunks are forwarded immediately, no buffering
2. **Token extraction** — input/output/cache tokens are extracted from SSE events
3. **Cost calculation** — real-time cost based on DeepSeek pricing
4. **Console logging** — structured JSON Lines or colorful pretty output
5. **Budget tracking** — daily/monthly limits with warnings

## Configuration

| Variable | Default | Description |
|---|---|---|
| `CCGATE_PORT` | `4100` | Proxy server port |
| `CCGATE_DATA_DIR` | `~/.ccgate` | Data directory (SQLite future) |
| `CCGATE_DAILY_BUDGET` | `5.00` | Daily spending limit (USD) |
| `CCGATE_MONTHLY_BUDGET` | `50.00` | Monthly spending limit (USD) |
| `CCGATE_LOG_FORMAT` | `pretty` | `pretty` or `json` |
| `CCGATE_UPSTREAM_URL` | `https://api.deepseek.com/anthropic` | Upstream API |

## Log Formats

### Pretty (default)
```
14:32:01 3f8a2b deepseek-v4-flash        1240 →   380  $0.000560 (session: $0.0142)
14:35:00 🟡 Budget daily: $4.23 / $5.00 ████████░░ 84.6%
```

### JSON Lines
```jsonl
{"level":"info","event":"request","ts":"...","session":"3f8a2b","model":"deepseek-v4-flash","tokens_in":1240,"tokens_out":380,"cost":0.00056,"duration_ms":2340}
{"level":"warn","event":"budget","budget_period":"daily","budget_spent":4.23,"budget_limit":5.00,"budget_pct":84.6,"budget_status":"warning"}
```

## Supported Models

| Model | Input $/MTok | Output $/MTok | Context |
|---|---|---|---|
| `deepseek-v4-flash` | $0.30 | $0.50 | 1M |
| `deepseek-v4-pro` | $0.42 | $0.84 | 1M |
| `deepseek-r1` | $0.55 | $2.19 | 128K |
| `deepseek-v3.2` | $0.28 | $0.42 | 128K |

Cache hit discount: 90% off input price.

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm test         # Run tests
npm start        # Run compiled JS
```

## Architecture

```
src/
├── index.ts              # Entry point
├── proxy.ts              # Fastify HTTP proxy server
├── sse-interceptor.ts    # SSE Transform Stream (zero-latency)
├── config.ts             # Environment config
├── pricing.ts            # Cost calculation engine
├── logger.ts             # Structured console logger
├── sse-interceptor.test.ts   # SSE parsing tests
└── pricing.test.ts           # Cost calculation tests

pricing.json              # Model pricing config
```

## MVP Status

- [x] HTTP proxy (Fastify)
- [x] SSE streaming passthrough (zero-latency)
- [x] Token extraction from SSE events
- [x] Cost calculation for all DeepSeek models
- [x] Console output (pretty + JSON Lines)
- [ ] SQLite database (Phase 2)
- [ ] Session management (Phase 3)
- [ ] Budget enforcement (Phase 5)
- [ ] Terminal TUI (Phase 5)
- [ ] Web dashboard (Phase 6)
- [ ] Docker deployment (Phase 7)

## License

MIT
