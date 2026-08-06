import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · AI Project Tracker" };

export default function LoginPage() {
  return (
    <>
      <LoginForm />
      <p className="mt-4 text-center text-sm text-muted">
        No account yet?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}
