# NYC Air Quality Chatbot

**Bloomberg x TKH Hackathon 2026**

A working chatbot prototype that lets NYC residents ask plain-language questions about their neighborhood's air quality and get clear, actionable safety advice — no confusing numbers.

## What it does

- Ask questions like "Is it safe to run outside in Brooklyn today?"
- Get real-time AQI data from the EPA AirNow API
- Receive plain-English health recommendations powered by Claude AI
- See a color-coded AQI badge (Good / Moderate / Unhealthy) with every response
- Supports NYC neighborhood names and zip codes

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **AI:** Anthropic Claude (claude-sonnet-4-6)
- **Air Quality Data:** EPA AirNow API

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/LanceCodes1/air-quality-chatbot.git
cd air-quality-chatbot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Add your API keys

Create a `.env.local` file in the root of the project:

```
VITE_ANTHROPIC_API_KEY=your-anthropic-key-here
VITE_AIRNOW_API_KEY=your-airnow-key-here
```

- Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com)
- Get a free AirNow API key at [airnowapi.org](https://www.airnowapi.org/account/request/)

### 4. Run the app

You need two terminals running at the same time:

**Terminal 1 — Frontend:**
```bash
npm run dev
```

**Terminal 2 — Backend:**
```bash
npm run server
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Example Questions

- "Is it safe to run outside in Brooklyn today?"
- "What should someone with asthma do in zip code 10001?"
- "How is the air in Queens right now?"
- "Is it okay to take my kids to the park in Harlem?"

## Team

Built by the TKH x Bloomberg Hackathon Team — June 2026
