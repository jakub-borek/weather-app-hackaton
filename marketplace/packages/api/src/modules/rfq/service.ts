import { MedusaService } from "@medusajs/framework/utils";
import { Rfq, RfqMessage, RfqNegotiation, SellerPriceRule } from "./models/rfq";

class RfqModuleService extends MedusaService({ Rfq, RfqNegotiation, RfqMessage, SellerPriceRule }) {}

export default RfqModuleService;
