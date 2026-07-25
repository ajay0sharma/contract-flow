interface AdminShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function AdminShell({ title, description, children }: AdminShellProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        ) : null}
      </header>
      <main>{children}</main>
    </div>
  );
}
