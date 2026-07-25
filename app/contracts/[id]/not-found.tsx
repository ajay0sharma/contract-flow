import Link from "next/link";

export default function ContractNotFound() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-6 py-16">
      <div className="text-center">
        <p className="text-sm font-medium text-text-muted">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Contract not found
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          This contract record does not exist in the current workspace.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
