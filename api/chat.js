// This is the Vercel serverless function version of server.js
// It runs on Vercel's infrastructure instead of your local Express server.
// The logic is identical — only the format is different.

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY,
})

const NEIGHBORHOOD_ZIPS = {
  brooklyn: '11201',
  manhattan: '10001',
  queens: '11101',
  bronx: '10451',
  'staten island': '10301',
  harlem: '10027',
  astoria: '11102',
  flushing: '11354',
  'upper east side': '10065',
  'upper west side': '10024',
  williamsburg: '11211',
  bushwick: '11221',
  'bed-stuy': '11233',
  'bedford-stuyvesant': '11233',
  'crown heights': '11213',
  'bay ridge': '11209',
  'park slope': '11215',
  'lower east side': '10002',
  chelsea: '10001',
  soho: '10012',
  tribeca: '10007',
  'financial district': '10004',
  'long island city': '11101',
  jamaica: '11432',
  'jackson heights': '11372',
  'washington heights': '10040',
  inwood: '10034',
  'east harlem': '10029',
  "hell's kitchen": '10036',
}

function extractZipCode(text) {
  const match = text.match(/\b(\d{5})\b/)
  return match ? match[1] : null
}

function extractNeighborhoodZip(text) {
  const lower = text.toLowerCase()
  for (const [neighborhood, zip] of Object.entries(NEIGHBORHOOD_ZIPS)) {
    if (lower.includes(neighborhood)) {
      return { zip, neighborhood }
    }
  }
  return null
}

async function fetchAQI(zipCode) {
  const apiKey = process.env.VITE_AIRNOW_API_KEY
  const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zipCode}&distance=25&API_KEY=${apiKey}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`AirNow API error: ${response.status}`)
  return response.json()
}

function formatAQIContext(aqiData, locationName) {
  if (!aqiData || aqiData.length === 0) {
    return `No AQI data currently available for ${locationName}.`
  }
  const readings = aqiData.map((r) => `${r.ParameterName}: AQI ${r.AQI} (${r.Category.Name})`)
  const highest = aqiData.reduce((max, r) => (r.AQI > max.AQI ? r : max), aqiData[0])
  return `Current air quality data for ${locationName}:
${readings.join('\n')}
Overall condition: ${highest.Category.Name} (AQI ${highest.AQI})
Reported at: ${aqiData[0].DateObserved} ${aqiData[0].HourObserved}:00 local time`
}

const SYSTEM_PROMPT = `You are a friendly NYC air quality assistant helping residents understand
if it is safe to be outside. You will be given real-time AQI (Air Quality Index) data for a location
when available.

Always respond in plain, simple English — no jargon. Give clear, actionable advice.
If someone asks about running, exercising, or outdoor activities, give a direct yes/no recommendation
followed by a short reason. If someone mentions asthma or other health conditions, be extra cautious
in your advice. Keep responses to 2-4 sentences maximum.

When you have real AQI data, always mention the specific number and category in your response.

AQI scale for your reference:
- 0-50: Good — safe for everyone
- 51-100: Moderate — unusually sensitive people should consider reducing prolonged outdoor exertion
- 101-150: Unhealthy for Sensitive Groups — people with asthma, heart disease, elderly should limit outdoor time
- 151-200: Unhealthy — everyone should reduce prolonged outdoor exertion
- 201-300: Very Unhealthy — avoid outdoor activity
- 300+: Hazardous — stay indoors`

// Vercel serverless functions export a default async function
// that receives a request and sends a response — similar to Express but simpler
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Allow requests from any origin (needed for the frontend to call this)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  let aqiContext = ''
  let aqiBadge = null

  if (lastUserMessage) {
    try {
      let zip = extractZipCode(lastUserMessage.content)
      let locationName = zip

      if (!zip) {
        const neighborhoodResult = extractNeighborhoodZip(lastUserMessage.content)
        if (neighborhoodResult) {
          zip = neighborhoodResult.zip
          locationName = neighborhoodResult.neighborhood
        }
      }

      if (zip) {
        const aqiData = await fetchAQI(zip)
        aqiContext = formatAQIContext(aqiData, locationName)
        if (aqiData && aqiData.length > 0) {
          const highest = aqiData.reduce((max, r) => (r.AQI > max.AQI ? r : max), aqiData[0])
          aqiBadge = { aqi: highest.AQI, category: highest.Category.Name, location: locationName }
        }
      }
    } catch (err) {
      console.error('AirNow fetch failed:', err.message)
    }
  }

  const systemWithData = aqiContext
    ? `${SYSTEM_PROMPT}\n\n---\nREAL-TIME DATA:\n${aqiContext}`
    : SYSTEM_PROMPT

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: systemWithData,
      messages: messages.map(({ role, content }) => ({ role, content })),
    })

    const reply = response.content[0].text
    res.json({ reply, badge: aqiBadge })
  } catch (err) {
    console.error('Anthropic API error:', err.message)
    res.status(500).json({ error: 'Failed to get response from Claude' })
  }
}
