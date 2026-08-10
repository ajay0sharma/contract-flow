import {
  PAGE_CONTAINER_CLASS,
  PAGE_HEADER_SPACING_CLASS,
} from "@/lib/page-layout";

interface LegalShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function LegalShell({ title, description, children }: LegalShellProps) {
  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <header className={PAGE_HEADER_SPACING_CLASS}>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        ) : null}
      </header>
      <main className="w-full min-w-0">{children}</main>
    </div>
  );
}
