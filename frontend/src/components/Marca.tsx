/** Logotipo DESLOC: seta em movimento sobre fundo escuro. */
export function Marca() {
  return (
    <div className="marca">
      <svg className="marca__simbolo" viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
        <rect width="40" height="40" rx="11" fill="currentColor" />
        <path d="M11 28 L20 10 L29 28 L20 23 Z" fill="var(--cor-acento)" />
        <circle cx="20" cy="31.5" r="2" fill="var(--cor-acento)" opacity="0.6" />
      </svg>
      <span className="marca__nome">DESLOC</span>
    </div>
  );
}
