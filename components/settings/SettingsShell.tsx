import { SettingsNav } from "@/components/settings/SettingsNav";

interface SettingsShellProps {
  title: string;
  description?: string;
  isAdmin?: boolean;
  children: React.ReactNode;
}

export function SettingsShell({
  title,
  description,
  isAdmin = false,
  children,
}: SettingsShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row lg:gap-8">
      <aside className="lg:hidden">
        <SettingsNav isAdmin={isAdmin} compact />
      </aside>
      <aside className="hidden w-[200px] shrink-0 lg:block">
        <SettingsNav isAdmin={isAdmin} compact />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          ) : null}
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
