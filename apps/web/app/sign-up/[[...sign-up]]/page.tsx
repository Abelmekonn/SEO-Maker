import { SignUp } from "@clerk/nextjs";
import { clerkDarkAppearance } from "@/lib/clerk-appearance";

export default function SignUpPage() {
  return (
    <div className="dash-root flex min-h-screen items-center justify-center bg-canvas px-6 py-16">
      <SignUp
        fallbackRedirectUrl="/dashboard"
        signInUrl="/sign-in"
        appearance={clerkDarkAppearance}
      />
    </div>
  );
}
