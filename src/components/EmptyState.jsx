export default function EmptyState({ icon, text, children }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <p>{text}</p>
      {children}
    </div>
  );
}
