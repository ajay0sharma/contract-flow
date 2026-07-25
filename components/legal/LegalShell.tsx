interface LegalShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function LegalShell({ title, description, children }: LegalShellProps) {
  return (
    <div className="w-full max-w-none min-w-0 px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        ) : null}
      </header>
      <main className="w-full min-w-0">{children}</main>
    </div>
  );
}
