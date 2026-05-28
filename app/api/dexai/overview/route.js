import { NextResponse } from "next/server";
import {
  getDexaiOverview,
  getRecentDexaiRequests,
} from "@/lib/dexaiOverview";

export async function GET() {
  try {
    const [overview, recent] = await Promise.all([
      getDexaiOverview(),
      getRecentDexaiRequests(6),
    ]);
    return NextResponse.json(
      {
        overview: overview || {
          users_count: 0,
          active_users_count: 0,
          total_requests: 0,
          completed_requests: 0,
          failed_requests: 0,
          pending_requests: 0,
          distinct_doc_types: 0,
        },
        recent,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/dexai/overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch overview" },
      { status: 500 }
    );
  }
}
