import { NextResponse } from "next/server";
import { lazyCleanup } from "@/lib/lazy-cleanup";

export async function GET() {
  try {
    // Perform centralized robust row-locked lazy cleanup
    await lazyCleanup();

    return NextResponse.json({
      success: true,
      message: "Expired reservations released successfully",
    });
  } catch (error) {
    console.error("Cron job execution error:", error);
    return NextResponse.json(
      { error: "Cron job execution failed" },
      { status: 500 }
    );
  }
}