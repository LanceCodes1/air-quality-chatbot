import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import 'dotenv/config'

const app = express()
app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({
  apiKey: process.env.VITE_ANTHROPIC_API_KEY,
})

// Maps common NYC neighborhood names to zip codes for AirNow lookups
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
  'hell\'s kitchen': '10036',
}

// Pull a 5-digit zip code out of the user's message if one exists
function extractZipCode(text) {
  const match = text.match(/\b(\d{5})\b/)
  return match ? match[1] : null
}

// Check if the message mentions a known NYC neighborhood and return its zip
function extractNeighborhoodZip(text) {
  const lower = text.toLowerCase()
  for (const [neighborhood, zip] of Object.entries(NEIGHBORHOOD_ZIPS)) {
    if (lower.includes(neighborhood)) {
      return { zip, neighborhood }
    }
  }
  return null
}

// Fetch current AQI data from the EPA AirNow API for a given zip code
async function fetchAQI(zipCode) {
  const apiKey = process.env.VITE_AIRNOW_API_KEY
  const url = `https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${zipCode}&distance=25&API_KEY=${apiKey}`

  const response = await fetch(url)
  if (!response.ok) throw new Error(`AirNow API error: ${response.status}`)

  const data = await response.json()
  return data // array of pollutant readings (PM2.5, Ozone, etc.)
}

// Convert raw AirNow data into a human-readable summary string for Claude
function formatAQIContext(aqiData, locationName) {
  if (!aqiData || aqiData.length === 0) {
    return `No AQI data currently available for ${locationName}.`
  }

  const readings = aqiData.map((r) => {
    return `${r.ParameterName}: AQI ${r.AQI} (${r.Category.Name})`
  })

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

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' })
  }

  // Look at only the latest user message to find a location
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
  let aqiContext = ''

  if (lastUserMessage) {
    try {
      // Try zip code first, then neighborhood name
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
        // Store the highest AQI reading to send back for the badge
        if (aqiData && aqiData.length > 0) {
          const highest = aqiData.reduce((max, r) => (r.AQI > max.AQI ? r : max), aqiData[0])
          req.aqiBadge = { aqi: highest.AQI, category: highest.Category.Name, location: locationName }
        }
        console.log(`Fetched AQI for ${locationName} (${zip}):`, aqiContext)
      }
    } catch (err) {
      // If AirNow fails, Claude will still answer without data — not a fatal error
      console.error('AirNow fetch failed:', err.message)
    }
  }

  // Inject AQI data into the system prompt when we have it
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
    // Send back the reply plus badge data if we have it
    res.json({ reply, badge: req.aqiBadge || null })
  } catch (err) {
    console.error('Anthropic API error:', err.message)
    res.status(500).json({ error: 'Failed to get response from Claude' })
  }
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`)
})
