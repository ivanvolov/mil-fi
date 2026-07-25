# verification/ — 0G Compute vision-inference harness

Standalone test harness proving MilFi's verification agents (threat ID / kill confirm,
see `docs/02-architecture.md`) can run on 0G Compute's hosted vision models via the
OpenAI-compatible 0G Router.

## Setup

```bash
cd verification
npm install
cp .env.example .env   # or put the ZG_* keys in the repo-root .env
```

Get an API key (~2 min, free on testnet):

1. Open https://pc.testnet.0g.ai and connect a wallet.
2. Grab testnet 0G from the faucet if prompted.
3. Dashboard → API keys → create → paste into `ZG_ROUTER_API_KEY`.

Mainnet instead: https://pc.0g.ai, base URL `https://router-api.0g.ai/v1`,
vision model `Qwen3-VL-30B-A3B-Instruct` (needs a small real 0G deposit).

## Usage

```bash
npm run models                                    # live catalog, vision models flagged
npm run detect -- --image fixtures/simple.jpg     # sanity baseline (golden retriever)
npm run detect -- --image fixtures/airframe.jpg   # Agent A: Shahed-class drone in flight
npm run detect -- --image fixtures/drone.jpg      # Agent B-ish: Geran-2 wing wreckage
npm run detect -- --image fixtures/drone2.jpg     # Agent B-ish: Geran-2 debris, Kyiv street
npm run detect -- --image x.jpg --model <id>      # override model
```

Fixtures are public-domain / CC photos from Wikimedia Commons (`airframe.jpg` is the
US Navy LUCAS, a Shahed-136 analogue, launching — US government work, public domain).

`02-detect.ts` sends the image as a base64 data URL and asks for a strict-JSON
Agent A verdict: `{is_threat, classification, objects_seen, confidence, reasoning}`.
