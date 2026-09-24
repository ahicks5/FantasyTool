"use client";
/** Create an account: the same door as /login, opened on the register side. */
import { AuthDoor } from "@/components/account/Door";

export default function RegisterPage() {
  return <AuthDoor start="register" />;
}
