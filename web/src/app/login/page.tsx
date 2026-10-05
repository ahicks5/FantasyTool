"use client";
/** Sign in: a phone number and a texted code first, email and password as the fallback. Signed in already, it is the door to the account. */
import { AuthDoor } from "@/components/account/Door";

export default function LoginPage() {
  return <AuthDoor start="signin" />;
}
