import {
  PAGE_CONTAINER_CLASS,
  PAGE_SHELL_WIDTH_CLASS,
} from "@/lib/page-layout";

interface PageShellProps {
  title?: string;
  children: React.ReactNode;
  /** Content max width — default uses full available width */
  width?: keyof typeof PAGE_SHELL_WIDTH_CLASS;
}

export function PageShell({
  title,
  children,
  width = "default",
}: PageShellProps) {
  return (
    <div className={`${PAGE_CONTAINER_CLASS} ${PAGE_SHELL_WIDTH_CLASS[width]}`}>
      {title ? (
        <div className="mb-4 border-b border-gray-100 pb-4">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </div>
      ) : null}
      {children}
    </div>
  );
}
