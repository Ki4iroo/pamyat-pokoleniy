export default function Header({ title, action, left }) {
  return (
    <header className="header">
      <div className="header__left">{left}</div>
      <h1 className="header__title">{title}</h1>
      <div className="header__right">{action}</div>
    </header>
  );
}
