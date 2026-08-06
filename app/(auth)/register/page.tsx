import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account · AI Project Tracker" };

export default function RegisterPage() {
  return (
    <>
      <RegisterForm />
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
