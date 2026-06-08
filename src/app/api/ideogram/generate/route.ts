import { relayIdeogramRequest } from "@/lib/ideogram/relay";

export const runtime = "nodejs";

export function POST(request: Request) {
  return relayIdeogramRequest(request, "/v1/ideogram-v4/generate");
}
