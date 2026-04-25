import ReactMarkdown from "react-markdown";
import { Bot, User } from "lucide-react";

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser 
          ? "bg-blue-600 text-white" 
          : "bg-gradient-to-br from-violet-500 to-indigo-600 text-white"
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser 
          ? "bg-blue-600 text-white rounded-br-md" 
          : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md"
      }`}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 
            prose-headings:text-gray-900 dark:prose-headings:text-white 
            prose-strong:text-gray-900 dark:prose-strong:text-white
            prose-code:text-pink-600 dark:prose-code:text-pink-400
            prose-code:bg-gray-100 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-li:marker:text-gray-400
            prose-a:text-blue-600 dark:prose-a:text-blue-400">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        <p className={`text-[10px] mt-1.5 ${isUser ? "text-blue-200" : "text-gray-400"}`}>
          {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
        </p>
      </div>
    </div>
  );
}