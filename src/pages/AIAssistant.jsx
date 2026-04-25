import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bot, Send, Trash2, Loader2 } from "lucide-react";
import ChatMessage from "../components/ai/ChatMessage";
import SuggestedPrompts from "../components/ai/SuggestedPrompts";

export default function AIAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function sendMessage(text) {
    const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    // Build conversation history (last 10 messages for context window management)
    const history = updatedMessages.slice(-10).map(m => ({ role: m.role, content: m.content }));

    const response = await base44.functions.invoke("aiAssistant", {
      message: text,
      conversationHistory: history.slice(0, -1), // exclude the current message
    });

    const aiMsg = {
      role: "assistant",
      content: response.data.response,
      timestamp: response.data.timestamp,
    };
    setMessages(prev => [...prev, aiMsg]);
    setLoading(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  }

  function clearChat() {
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">AI Operations Advisor</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Analyzes all client, lead, and infrastructure data in real-time</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Ask me anything about your operations</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
                I have access to all client data, check-ins, alerts, lead lists, Instantly stats, HeyReach campaigns, and Slack insights. I'll find issues and make recommendations.
              </p>
            </div>
            <div className="w-full max-w-2xl">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 text-center">Quick Actions</p>
              <SuggestedPrompts onSelect={sendMessage} />
            </div>
          </div>
        ) : (
          messages.map((msg, i) => <ChatMessage key={i} message={msg} />)
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing your data…
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about client health, find data issues, get recommendations…"
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          Uses advanced AI model • Reads all operational data live • Responses may take 10-20 seconds
        </p>
      </form>
    </div>
  );
}