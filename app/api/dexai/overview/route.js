import { NextResponse } from "next/server";
import {
  getDexaiOverview,
  getRecentDexaiRequests,
} from "@/lib/dexaiOverview";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(req) {
  try {
    // CLIENT_ADMIN/CLIENT_USER only ever see homepage analytics for their
    // own client — forced from the verified JWT-derived header.
    const { isClientRole, clientId } = getRequesterClientScope(req);
    if (isClientRole && !clientId) {
      return NextResponse.json(
        {
          overview: {
            users_count: 0,
            active_users_count: 0,
            total_requests: 0,
            completed_requests: 0,
            failed_requests: 0,
            pending_requests: 0,
            distinct_doc_types: 0,
          },
          recent: [],
        },
        { status: 200 }
      );
    }

    const scope = isClientRole ? { clientId } : {};
    const [overview, recent] = await Promise.all([
      getDexaiOverview(scope),
      getRecentDexaiRequests(6, scope),
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
