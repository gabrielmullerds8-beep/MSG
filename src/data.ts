import { CfopRule, FiscalConfig, Invoice } from "./types";

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);

export const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const fiscalConfig: FiscalConfig = {
  icmsRate: 12,
  pisRate: 1.65,
  cofinsRate: 7.6,
  cfemRate: 2,
  bankBalance: 0,
  closedPeriods: {},
  fiscalClosedPeriods: {},
  financialClosedPeriods: {},
  cfops: [
    "5101 - Venda de produção do estabelecimento",
    "5119 - Venda a ordem",
    "5923 - Remessa por conta e ordem",
    "1102 - Compra para comercialização",
    "1556 - Compra de material para uso ou consumo",
    "2556 - Compra de material para uso ou consumo",
    "1656 - Compra de combustível ou lubrificante",
    "1353 - Aquisição de serviço de transporte",
    "1933 - Aquisição de serviço",
    "1949 - Outra entrada",
    "5949 - Outra saída",
  ],
  cfopRules: {
    "5101": { considerSale: true },
    "5119": { considerCost: true },
    "1102": { considerCost: true },
    "1556": { considerCost: true },
    "2556": { considerCost: true },
    "1656": { considerCost: true },
    "1353": { considerCost: true },
    "1933": { considerCost: true },
    "1949": { considerSale: false, considerCost: false },
    "5949": { considerSale: false, considerCost: false },
  },
  csts: ["000", "020", "040", "041", "051", "060", "090"],
  invoiceStatuses: ["Faturada", "Pendente", "Cancelada", "Em conferência"],
  categories: [
    "Manutenção e peças",
    "Combustível",
    "Transporte/frete",
    "Energia elétrica",
    "Serviços tomados",
    "Serviços administrativos",
    "Serviços operacionais",
    "Insumos de produção",
    "Material de escritório",
    "Equipamentos",
    "Ativo imobilizado",
    "Uso e consumo",
    "Segurança/EPI",
    "Outros",
    "Vendas",
    "Compras",
    "Fretes",
    "Serviços",
    "Manutenção",
    "Administrativo",
    "Financeiro",
  ],
  costCenters: [
    "Produção - Lavra",
    "Produção - Britagem",
    "Produção - Corte/Blocos",
    "Administrativo",
    "Comercial",
    "Manutenção",
    "Frota",
    "Equipamentos",
    "Fretes",
    "Financeiro",
  ],
  operationTypes: [
    "Venda de Produção",
    "Devolução",
    "Remessa para Industrialização",
    "Remessa para Conserto",
    "Remessa para armazenagem",
    "Entrada",
    "Serviço tomado",
    "A pagar",
    "Compra para uso e consumo",
    "Compra com triangulação",
    "Conhecimento de frete",
  ],
  linkedTypes: [
    "Compra com triangulação",
    "Venda à ordem",
    "Remessa por conta e ordem",
    "Remessa simbólica",
    "Entrega futura",
    "Vinculação CTE",
    "Retorno",
    "Devolução",
    "Industrialização",
    "Outra",
  ],
  units: ["UN", "KG", "M3", "TN", "TON", "MT", "PC", "SV", "BR", "BD", "GALÃO", "KIT", "L"],
  paymentConditions: ["a prazo", "à vista", "sem pagamento"],
  paymentMethods: ["boleto", "depósito bancário", "pix", "dinheiro", "cheque", "cartão"],
  holders: ["Itaú", "Sicredi", "Itaú Mailson"],
  assetTypes: ["Máquinas", "Caminhões", "Veículos", "Escavadeiras", "Britadores", "Terrenos", "Diversos"],
};

export const getCfopCode = (value: string) => String(value || "").split(" - ")[0].trim();

const nonFinancialRemittanceCfops = new Set(["1949", "5949"]);

export const isNonFinancialRemittanceCfop = (value: string) =>
  nonFinancialRemittanceCfops.has(getCfopCode(value));

export const getCfopRule = (cfop: string): CfopRule => {
  const code = getCfopCode(cfop);
  return fiscalConfig.cfopRules?.[code] || {};
};

const isCancelledInvoice = (invoice: Invoice) =>
  String(invoice.status || "").trim().toLocaleLowerCase("pt-BR") === "cancelada";

export const invoiceConsidersSale = (invoice: Invoice) =>
  invoice.invoiceType === "issued" &&
  !isCancelledInvoice(invoice) &&
  !isNonFinancialRemittanceCfop(invoice.mainCfop) &&
  Boolean(getCfopRule(invoice.mainCfop).considerSale);

export const invoiceConsidersCost = (invoice: Invoice) =>
  invoice.invoiceType === "received" &&
  !isCancelledInvoice(invoice) &&
  !isNonFinancialRemittanceCfop(invoice.mainCfop) &&
  Boolean(getCfopRule(invoice.mainCfop).considerCost);

export const invoiceHasFinancialEffect = (invoice: Invoice) =>
  invoiceConsidersSale(invoice) || invoiceConsidersCost(invoice);

export const invoiceFinancialAmount = (invoice: Invoice) =>
  Number(invoice.totalInvoice || 0) + Number(invoice.pfValue || 0);
