import { NextResponse } from "next/server";
import { financeQuery } from "@/lib/financedb";

export async function GET() {
  try {
    const result = await financeQuery(
      `SELECT
         iu.internal_user_id AS id,
         iu.email,
         iu.first_name,
         iu.last_name,
         STRING_AGG(r.role_name, ',' ORDER BY r.role_name) AS roles
       FROM internal_users iu
       JOIN user_roles ur ON iu.internal_user_id = ur.internal_user_id
       JOIN roles r ON ur.role_id = r.role_id
       WHERE iu.is_active = true
       GROUP BY iu.internal_user_id, iu.email, iu.first_name, iu.last_name
       HAVING STRING_AGG(r.role_name, ',') LIKE '%HITL%'
       ORDER BY iu.first_name NULLS LAST, iu.email`,
      []
    );

    const users = result.rows.map((u) => ({
      id: String(u.id),
      email: u.email,
      label: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
    }));

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error("GET /api/hitl-users error:", error);
    return NextResponse.json({ users: [] }, { status: 200 });
  }
}
