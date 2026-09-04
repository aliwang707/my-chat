export const TypingDots = () => (
  <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm w-fit shadow-sm">
    {[0, 1, 2].map(i => (
      <span
        key={i}
        className="w-2.5 h-2.5 bg-gray-400 dark:bg-gray-500 rounded-full"
        style={{
          animation: 'typing-bounce 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
        }}
      />
    ))}
    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1 select-none">
      思考中
    </span>
  </div>
);