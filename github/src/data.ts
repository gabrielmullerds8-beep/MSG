import { CfopRule, FiscalConfig, Invoice } from "./types";

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const fiscalConfig: FiscalConfig = {
  icmsRate: 12,
  pisRate: 1.65,
  cofinsRate: 7.6,
  cfemRate: 2,
  bankBalance: 0,
  cfops: [
    "5101 - Venda de produção do estabelecimento",
    "5119 - Venda a ordem",
    "5923 - Remessa por conta e ordem",
    "1102 - Compra para comercialização",
    "1556 - Compra de material para uso ou consumo",
    "1656 - Compra de combustível ou lubrificante",
    "1353 - Aquisição de serviço de transporte",
    "1949 - Outra entrada",
    "5949 - Outra saída",
    "NFS-e - Serviço tomado",
  ],
  cfopRules: {
    "5101": { considerSale: true },
    "5119": { considerCost: true },
    "1102": { considerCost: true },
    "1556": { considerCost: true },
    "1656": { considerCost: true },
    "1353": { considerCost: true },
    "1949": { considerCost: true },
    "NFS-e": { considerCost: true },
  },
  csts: ["000", "020", "040", "041", "051", "060", "090"],
  ncms: ["25171000", "25161200", "84839000"],
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
  linkedTypes: [
    "Compra com triangulação",
    "Venda à ordem",
    "Remessa por conta e ordem",
    "Remessa simbólica",
    "Entrega futura",
    "Retorno",
    "Devolução",
    "Industrialização",
    "Outra",
  ],
  units: ["UN", "KG", "TN", "MT", "PC", "SV"],
};

export const getCfopCode = (value: string) => String(value || "").split(" - ")[0].trim();

export const getCfopRule = (cfop: string): CfopRule => {
  const code = getCfopCode(cfop);
  return fiscalConfig.cfopRules?.[code] || {};
};

export const invoiceConsidersSale = (invoice: Invoice) =>
  invoice.invoiceType === "issued" && Boolean(getCfopRule(invoice.mainCfop).considerSale);

export const invoiceConsidersCost = (invoice: Invoice) =>
  invoice.invoiceType === "received" && Boolean(getCfopRule(invoice.mainCfop).considerCost);

export const invoiceHasFinancialEffect = (invoice: Invoice) =>
  invoiceConsidersSale(invoice) || invoiceConsidersCost(invoice);

export const invoiceFinancialAmount = (invoice: Invoice) =>
  Number(invoice.totalInvoice || 0) + Number(invoice.pfValue || 0);
