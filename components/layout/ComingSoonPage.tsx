import { NavIcon } from "@/components/layout/NavIcon";

interface ComingSoonPageProps {
  title: string;
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <NavIcon name="settings" className="h-10 w-10 text-gray-300" />
        <h1 className="mt-4 text-xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          This section is coming soon. Check back after the next update.
        </p>
      </div>
    </div>
  );
}
