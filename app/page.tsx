import { redirect } from "next/navigation";

// proxy.ts has already established there is a session by the time this runs.
export default function Home() {
  redirect("/dashboard");
}
