import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Shown when the API rejects a mutation with 401: the action changed nothing,
 * so the user needs a clear route back into a session instead of a raw detail.
 */
export function SignInPrompt({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] leading-5 text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {message}{" "}
        <Link
          href="/auth/signin"
          className="font-semibold underline underline-offset-2 hover:text-rose-900"
        >
          Sign in
        </Link>{" "}
        to continue.
      </p>
    </div>
  );
}
