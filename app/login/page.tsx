import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Contract App</h1>
        <p className="mt-2 text-sm text-text-secondary">Sign in to continue</p>
      </div>
      <SignIn
        routing="hash"
        signUpUrl="/sign-up"
        forceRedirectUrl="/dashboard"
      />
    </div>
  );
}
