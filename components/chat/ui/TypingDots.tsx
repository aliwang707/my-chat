export const TypingDots = () => (
  <div className="flex gap-1.5 px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm w-fit shadow-sm">
    {[0, 1, 2].map(i => (
      <span key={i} className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
    ))}
  </div>
);