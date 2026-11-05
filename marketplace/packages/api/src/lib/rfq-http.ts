// Odpowiedzi tras RFQ: sukces jako JSON, błąd reguły jako { code, message } z 422/404 (kontrakt F00).
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { parseRuleError } from "./rfq";

export async function respond<T>(
  req: MedusaRequest,
  res: MedusaResponse,
  work: () => Promise<T>,
  status = 200
): Promise<void> {
  try {
    res.status(status).json(await work());
  } catch (error: unknown) {
    const parsed = parseRuleError(error);
    if (parsed.status >= 500) {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).error(`RFQ ${req.method} ${req.path}: ${parsed.message}`);
    }
    res.status(parsed.status).json({ code: parsed.code, message: parsed.message });
  }
}
