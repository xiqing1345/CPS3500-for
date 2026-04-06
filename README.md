# Connect Four: HP Arena (Vercel Ready)

This folder is a deployment-ready version of the project for Vercel.

## Game Features

- Player is **X (Red)**, AI is **O (Yellow)**.
- Free placement: both sides can place on any empty cell.
- Connecting 4 or more pieces deals damage and combat continues.
- Damage scales with line length and combo count.
- After an attack, all successful line pieces are removed, then play continues.
- ChatGPT API is the default AI engine with local fallback.

## Project Structure

- `index.html`, `styles.css`, `app.js`: frontend.
- `api/ai-move.js`: Vercel Serverless Function for ChatGPT move generation.

## Environment Variables (Vercel)

Set these in Vercel Project Settings -> Environment Variables:

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default: `gpt-4.1-mini`)
- `OPENAI_TIMEOUT_MS` (optional, default: `20000`)

## Deploy To Vercel

1. Push this folder to a GitHub repository.
2. Import that repository in Vercel.
3. Framework preset: **Other**.
4. Add the environment variables above.
5. Deploy.

## Local Development

Install Vercel CLI, then run:

```bash
npm install
npm run dev
```

This starts `vercel dev`, serving static files and `/api/ai-move` locally.
