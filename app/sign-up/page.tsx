import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Contract App</h1>
        <p className="mt-2 text-sm text-text-secondary">Create your account</p>
      </div>
      <SignUp
        routing="hash"
        signInUrl="/login"
        forceRedirectUrl="/dashboard"
      />
    </div>
  );
}
