import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { toErrorMessage } from "@/lib/utils";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("Invalid request: " + error.issues.map((i) => i.message).join("; "), 422);
  }
  const message = toErrorMessage(error);
  const code = (error as { code?: string })?.code;
  // Postgres check / unique violation from an RPC = business rule rejection.
  const status = code?.startsWith("23") || code === "42501" ? 409 : 500;
  return fail(message, status);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
