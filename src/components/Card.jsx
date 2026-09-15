// =====================================================
// Reusable Card component
// =====================================================

function Card({ children, className = "", padding = true, ...props }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm ${padding ? "p-5" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export default Card;
