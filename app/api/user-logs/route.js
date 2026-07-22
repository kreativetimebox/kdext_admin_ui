import { getClients } from "@/lib/dexai";
import { verifyAuthToken } from "@/lib/auth";

export async function GET(req) {
  try {
    // Verify user is authenticated
    const user = await verifyAuthToken(req);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is super user
    if (!user.roles || !user.roles.includes("SUPER_ADMIN")) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const sortBy = searchParams.get("sortBy") || "last_login_at";
    const sortOrder = searchParams.get("sortOrder") || "DESC";

    const users = await getClients({ search, sortBy, sortOrder });

    return Response.json({ users });
  } catch (error) {
    console.error("Error fetching user logs:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
