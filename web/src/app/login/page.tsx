"use client";
/** Sign in with an email and a password. Signed in already, it is the door to the account. */
import { AuthDoor } from "@/components/account/Door";

export default function LoginPage() {
  return <AuthDoor start="signin" />;
}
