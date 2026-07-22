import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getHitlMemberStats } from "@/lib/hitlAssignment";

export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const companiesParam = searchParams.get("companies") || "";
    const companies = companiesParam ? companiesParam.split(",").filter(Boolean) : [];
    const email = searchParams.get("email") || "";
    const docType = searchParams.get("docType") || "";

    const members = await getHitlMemberStats({ dateFrom, dateTo, companies, email, docType });
    return NextResponse.json({ members });
  } catch (err) {
    console.error("GET /api/hitl-stats error:", err);
    return NextResponse.json({ error: "Failed to fetch HITL stats" }, { status: 500 });
  }
}
