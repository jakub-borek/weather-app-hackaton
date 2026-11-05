import { MedusaService } from "@medusajs/framework/utils";
import { Rfq, RfqMessage, RfqNegotiation } from "./models/rfq";

class RfqModuleService extends MedusaService({ Rfq, RfqNegotiation, RfqMessage }) {}

export default RfqModuleService;
