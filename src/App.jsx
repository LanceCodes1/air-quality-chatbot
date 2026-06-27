import { useState, useRef, useEffect } from 'react'
import './App.css'

// Converts **bold** markdown to actual <strong> tags for display
function renderMarkdown(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// Returns Tailwind color classes based on AQI category
function getBadgeStyle(category) {
  const cat = category?.toLowerCase() || ''
  if (cat.includes('good')) return 'bg-green-100 text-green-800'
  if (cat.includes('moderate')) return 'bg-yellow-100 text-yellow-800'
  if (cat.includes('unhealthy for sensitive')) return 'bg-orange-100 text-orange-800'
  if (cat.includes('unhealthy')) return 'bg-red-100 text-red-800'
  if (cat.includes('very unhealthy')) return 'bg-purple-100 text-purple-800'
  if (cat.includes('hazardous')) return 'bg-red-900 text-white'
  return 'bg-gray-100 text-gray-700'
}

// Each message has a role ("user" or "assistant") and optional badge data
function ChatMessage({ role, content, badge }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="flex flex-col gap-2 max-w-[75%]">
        {/* AQI badge shown above assistant messages when we have real data */}
        {!isUser && badge && (
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium self-start ${getBadgeStyle(badge.category)}`}>
            <span>AQI {badge.aqi}</span>
            <span>·</span>
            <span>{badge.category}</span>
            <span>·</span>
            <span className="capitalize">{badge.location}</span>
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-800 rounded-bl-sm'
          }`}
        >
          {isUser ? content : renderMarkdown(content)}
        </div>
      </div>
    </div>
  )
}

// Animated dots shown while the AI is thinking
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  // messages holds the full conversation history as an array of {role, content} objects
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your NYC Air Quality Assistant. Ask me things like \"Is it safe to run outside in Brooklyn today?\" or \"What should someone with asthma do in zip code 10001?\"",
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef(null)

  // Auto-scroll to the latest message whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function sendMessage(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    // Add the user's message to the chat immediately so it feels responsive
    const userMessage = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Send the full conversation history to our backend, which calls Claude
      const updatedMessages = [...messages, userMessage]
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Only send role/content to the API — strip out any UI-only fields
          messages: updatedMessages.map(({ role, content }) => ({ role, content })),
        }),
      })
      const data = await res.json()
      const reply = data.reply || 'Sorry, I could not get a response.'
      // Store badge data alongside the message so the UI can display it
      setMessages((prev) => [...prev, { role: 'assistant', content: reply, badge: data.badge || null }])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white max-w-2xl mx-auto">

      {/* Header */}
      <div className="bg-blue-600 text-white px-6 py-4 shadow-md">
        <h1 className="text-xl font-bold">🌿 NYC Air Quality Assistant</h1>
        <p className="text-blue-100 text-sm mt-0.5">Powered by EPA AirNow + Claude AI</p>
      </div>

      {/* Message list — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} badge={msg.badge} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input bar pinned to bottom */}
      <form onSubmit={sendMessage} className="border-t border-gray-200 px-4 py-3 flex gap-2 bg-white">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about air quality in your neighborhood..."
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-blue-600 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}
