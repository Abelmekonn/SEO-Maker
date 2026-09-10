import { SignIn } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

export default function SignInPage() {
  return (
    <div className="dash-root flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <SignIn
        fallbackRedirectUrl="/dashboard"
        signUpUrl="/sign-up"
        appearance={clerkDarkAppearance}
      />
    </div>
  );
}
