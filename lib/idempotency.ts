import { NextResponse } from "next/server";
import { prisma } from "./prisma";

/**
 * Wraps an API handler with persistent DB-based idempotency.
 * If the "Idempotency-Key" header is present, it caches and returns identical responses.
 */
export async function handleIdempotentRequest(
  req: Request,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key");

  // If no idempotency key is provided, execute the handler normally
  if (!key || key.trim() === "") {
    return handler();
  }

  try {
    // 1. Check if the key already exists
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (existing) {
      const data = JSON.parse(existing.response);
      return NextResponse.json(data, { status: existing.statusCode });
    }

    // 2. Execute the handler
    const response = await handler();

    // 3. Cache the response (only for successful or client-side errors, i.e., < 500)
    if (response.status < 500) {
      try {
        const clone = response.clone();
        const body = await clone.json();

        await prisma.idempotencyKey.create({
          data: {
            key,
            statusCode: response.status,
            response: JSON.stringify(body),
          },
        });
      } catch (err) {
        // Handle concurrent requests trying to insert the same key simultaneously
        const concurrent = await prisma.idempotencyKey.findUnique({
          where: { key },
        });
        if (concurrent) {
          const data = JSON.parse(concurrent.response);
          return NextResponse.json(data, { status: concurrent.statusCode });
        }
        console.error("Failed to store idempotency key:", err);
      }
    }

    return response;
  } catch (error) {
    console.error("Error in idempotency handler:", error);
    return NextResponse.json(
      { error: "Internal server error during idempotent transaction" },
      { status: 500 }
    );
  }
}
