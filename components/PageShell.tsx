interface PageShellProps {
  title?: string;
  children: React.ReactNode;
  /** Content max width — default is standard page width */
  width?: "default" | "narrow" | "wide" | "full";
}

const widthClasses = {
  default: "max-w-7xl",
  narrow: "max-w-3xl",
  wide: "max-w-6xl",
  full: "max-w-full",
};

export function PageShell({
  title,
  children,
  width = "default",
}: PageShellProps) {
  return (
    <div className={`mx-auto w-full px-6 py-8 ${widthClasses[width]}`}>
      {title ? (
        <div className="mb-6 border-b border-gray-100 pb-5">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </div>
      ) : null}
      {children}
    </div>
  );
}
