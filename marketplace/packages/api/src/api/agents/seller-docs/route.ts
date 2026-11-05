// GET /agents/seller-docs: publiczna instrukcja i lista endpointów RFQ dla bota sprzedawcy (Markdown, bez haseł).
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { publicBaseUrl } from "../../../lib/agent-manifest";
import { renderSellerAgentDoc } from "../../../lib/seller-agent-doc";

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const base = publicBaseUrl(req.headers as Record<string, unknown>, req.protocol, req.get("host"));
  res.setHeader("content-type", "text/markdown; charset=utf-8");
  res.send(renderSellerAgentDoc(base));
}
