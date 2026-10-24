import { SESSION_COOKIE } from "@/lib/auth";
import { redirectTo } from "@/lib/http";

export function POST() {
  const response = redirectTo("/login");
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
