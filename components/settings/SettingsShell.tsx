import { SettingsNav } from "@/components/settings/SettingsNav";
import { PAGE_CONTAINER_CLASS, PAGE_HEADER_SPACING_CLASS } from "@/lib/page-layout";

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
    <div
      className={`${PAGE_CONTAINER_CLASS} flex flex-col gap-5 lg:flex-row lg:gap-6`}
    >
      <aside className="lg:hidden">
        <SettingsNav isAdmin={isAdmin} compact />
      </aside>
      <aside className="hidden w-[200px] shrink-0 lg:block">
        <SettingsNav isAdmin={isAdmin} compact />
      </aside>
      <div className="min-w-0 flex-1">
        <header className={`${PAGE_HEADER_SPACING_CLASS} rounded-2xl border border-gray-100 bg-white p-5 shadow-sm`}>
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
