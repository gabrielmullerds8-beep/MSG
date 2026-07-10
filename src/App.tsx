import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileInput,
  FileOutput,
  FileSearch,
  Files,
  Gauge,
  Link2,
  Lock,
  LogOut,
  Menu,
  MoreVertical,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fiscalConfig,
  formatCurrency,
  getCfopCode,
  invoiceFinancialAmount,
  invoiceConsidersCost,
  invoiceConsidersSale,
  invoiceHasFinancialEffect,
  newId,
  todayIso,
} from "./data";
import { useFiscalStore } from "./store";
import { isSupabaseConfigured, supabase } from "./supabase";
import { AssetItem, CashMovement, CashMovementType, CheckItem, CheckStatus, FiscalConfig, Invoice, InvoiceItem, InvoiceType, LinkedOperation, Party, PaymentInstallment, ProductItem } from "./types";

type View =
  | "dashboard"
  | "issued"
  | "new-issued"
  | "received"
  | "new-received"
  | "linked"
  | "search"
  | "tax"
  | "financial"
  | "financial-pf"
  | "checks"
  | "bills"
  | "closures"
  | "cash"
  | "cash-pf"
  | "products"
  | "assets"
  | "dre"
  | "registrations"
  | "conference"
  | "settings"
  | "backup";

const views: Array<{ id: View; label: string; icon: any }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "financial", label: "Financeiro", icon: Database },
  { id: "financial-pf", label: "Financeiro PF", icon: Database },
  { id: "cash", label: "Caixa", icon: Database },
  { id: "cash-pf", label: "Caixa PF", icon: Database },
  { id: "checks", label: "Cheques", icon: CheckCircle2 },
  { id: "dre", label: "DRE", icon: BarChart3 },
  { id: "assets", label: "Patrimônio", icon: Building2 },
  { id: "issued", label: "Notas Emitidas", icon: FileOutput },
  { id: "received", label: "Notas Recebidas", icon: FileInput },
  { id: "bills", label: "Faturas", icon: Files },
  { id: "tax", label: "Apuração Fiscal", icon: ClipboardList },
  { id: "closures", label: "Fechamentos", icon: Lock },
  { id: "linked", label: "Operações Vinculadas", icon: Link2 },
  { id: "new-issued", label: "Nova Nota Emitida", icon: Plus },
  { id: "new-received", label: "Nova Nota Recebida", icon: PackagePlus },
  { id: "registrations", label: "Cadastros", icon: Building2 },
  { id: "products", label: "Produtos", icon: PackagePlus },
  { id: "conference", label: "Conferência", icon: AlertTriangle },
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "backup", label: "Backup", icon: Database },
];

const colors = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0f766e"];
const unitOptions = ["UN", "KG", "TN", "MT", "PC", "SV"];
const holderOptions = ["Itaú", "Sicredi", "Itaú Mailson"];
const paymentConditionOptions = ["a prazo", "à vista", "sem pagamento"];
const paymentMethodOptions = ["boleto", "depósito bancário", "pix", "dinheiro", "cheque", "cartão"];
const blockQualityOptions = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"];
type ReceivedDocumentModel = "NF-e" | "NFS-e" | "CT-e";
type FiscalConfigListName = keyof Pick<FiscalConfig, "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "operationTypes" | "linkedTypes" | "units" | "paymentConditions" | "paymentMethods" | "holders" | "financialCategories">;
const configList = (list: string[] | undefined, fallback: string[]) => (list?.length ? list : fallback);
const operationTypeOptions = ["Venda de Produção", "Devolução", "Remessa para Industrialização", "Remessa para Conserto", "Remessa para armazenagem"];
const configuredHolders = () => configList(fiscalConfig.holders, holderOptions);
const configuredPaymentConditions = () => configList(fiscalConfig.paymentConditions, paymentConditionOptions);
const configuredPaymentMethods = () => configList(fiscalConfig.paymentMethods, paymentMethodOptions);
const configuredOperationTypes = () => configList(fiscalConfig.operationTypes, operationTypeOptions);

const fiscalConfigSnapshot = (): FiscalConfig => ({
  ...fiscalConfig,
  closedPeriods: { ...(fiscalConfig.closedPeriods || {}) },
  cfops: [...fiscalConfig.cfops],
  cfopRules: { ...(fiscalConfig.cfopRules || {}) },
  csts: [...fiscalConfig.csts],
  ncms: [...fiscalConfig.ncms],
  categories: [...fiscalConfig.categories],
  costCenters: [...fiscalConfig.costCenters],
  operationTypes: [...configuredOperationTypes()],
  linkedTypes: [...fiscalConfig.linkedTypes],
  units: [...(fiscalConfig.units || unitOptions)],
  paymentConditions: [...configList(fiscalConfig.paymentConditions, paymentConditionOptions)],
  paymentMethods: [...configList(fiscalConfig.paymentMethods, paymentMethodOptions)],
  holders: [...configList(fiscalConfig.holders, holderOptions)],
  financialCategories: [...configList(fiscalConfig.financialCategories, fiscalConfig.categories || [])],
});

const applyFiscalConfig = (nextConfig: Partial<FiscalConfig>) => {
  const mergeList = (current: string[], incoming?: string[]) => Array.from(new Set([...(incoming || []), ...current]));
  fiscalConfig.icmsRate = Number(nextConfig.icmsRate ?? fiscalConfig.icmsRate);
  fiscalConfig.pisRate = Number(nextConfig.pisRate ?? fiscalConfig.pisRate);
  fiscalConfig.cofinsRate = Number(nextConfig.cofinsRate ?? fiscalConfig.cofinsRate);
  fiscalConfig.cfemRate = Number(nextConfig.cfemRate ?? fiscalConfig.cfemRate);
  fiscalConfig.bankBalance = Number(nextConfig.bankBalance ?? fiscalConfig.bankBalance ?? 0);
  fiscalConfig.closedPeriods = nextConfig.closedPeriods ? { ...nextConfig.closedPeriods } : { ...(fiscalConfig.closedPeriods || {}) };
  fiscalConfig.cfops = mergeList(fiscalConfig.cfops, nextConfig.cfops);
  fiscalConfig.cfopRules = { ...(fiscalConfig.cfopRules || {}), ...(nextConfig.cfopRules || {}) };
  fiscalConfig.csts = mergeList(fiscalConfig.csts, nextConfig.csts);
  fiscalConfig.ncms = mergeList(fiscalConfig.ncms, nextConfig.ncms);
  fiscalConfig.categories = mergeList(fiscalConfig.categories, nextConfig.categories);
  fiscalConfig.costCenters = mergeList(fiscalConfig.costCenters, nextConfig.costCenters);
  fiscalConfig.operationTypes = mergeList(fiscalConfig.operationTypes || operationTypeOptions, nextConfig.operationTypes);
  fiscalConfig.linkedTypes = mergeList(fiscalConfig.linkedTypes, nextConfig.linkedTypes);
  fiscalConfig.units = mergeList(fiscalConfig.units || unitOptions, nextConfig.units);
  fiscalConfig.paymentConditions = mergeList(fiscalConfig.paymentConditions || paymentConditionOptions, nextConfig.paymentConditions);
  fiscalConfig.paymentMethods = mergeList(fiscalConfig.paymentMethods || paymentMethodOptions, nextConfig.paymentMethods);
  fiscalConfig.holders = mergeList(fiscalConfig.holders || holderOptions, nextConfig.holders);
  fiscalConfig.financialCategories = mergeList(fiscalConfig.financialCategories || fiscalConfig.categories, nextConfig.financialCategories);
};

const saveFiscalConfig = async () => {
  if (!supabase) {
    window.alert("Supabase não configurado. As configurações não foram salvas.");
    return false;
  }

  const { error } = await supabase
    .from("fiscal_settings")
    .upsert({ id: "default", config: fiscalConfigSnapshot(), updated_at: new Date().toISOString() });

  if (error) {
    window.alert("Não foi possível salvar as configurações no Supabase.");
    return false;
  }

  return true;
};

const partyToRow = (party: Party) => ({
  id: party.id,
  kind: party.kind,
  name: party.name,
  cnpj: party.cnpj,
  ie: party.ie,
  city: party.city,
  state: party.state,
  address: party.address,
  phone: party.phone,
  email: party.email,
  category: party.category || null,
  plate: party.plate || null,
  active: party.active,
  updated_at: new Date().toISOString(),
});

const rowToParty = (row: Record<string, any>): Party => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  cnpj: row.cnpj || "",
  ie: row.ie || "",
  city: row.city || "",
  state: row.state || "",
  address: row.address || "",
  phone: row.phone || "",
  email: row.email || "",
  category: row.category || undefined,
  plate: row.plate || undefined,
  active: Boolean(row.active),
});

function OnlineVersionGuard() {
  useEffect(() => {
    let active = true;
    let currentVersion = "";

    const checkVersion = async () => {
      try {
        const response = await fetch(`/version.json?ts=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        const data = (await response.json()) as { version?: string };

        if (!active || !data.version) return;
        if (!currentVersion) {
          currentVersion = data.version;
          return;
        }

        if (data.version !== currentVersion) {
          window.location.reload();
        }
      } catch {
        // A falha de versão não bloqueia o uso; a sincronização com Supabase continua controlando os dados.
      }
    };

    checkVersion();
    const interval = window.setInterval(checkVersion, 60_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

const onlyDigits = (value?: string | number) => String(value ?? "").replace(/\D/g, "");

const normalizeNoteNumber = (value?: string | number) => {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
};

const cleanNumber = (value: FormDataEntryValue | null) => {
  const raw = String(value || "0").trim();
  if (!raw) return 0;
  let normalized = raw.replace(/\s/g, "").replace(/[^\d,.-]/g, "");

  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(normalized) || (normalized.match(/\./g) || []).length > 1) {
    normalized = normalized.replace(/\./g, "");
  }

  return Number(normalized) || 0;
};

const chartValue = (value: number) => (Number.isFinite(value) ? Math.max(value, 0) : 0);
const chartLabel = (value: string, max = 26) => {
  const text = String(value || "Sem dados").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");

const formatMoneyInput = (value: string) => {
  const amount = cleanNumber(value);
  return formatCurrency(amount);
};

const formatPercentInput = (value: string) => {
  const amount = cleanNumber(value);
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} %`;
};

const formatKgInput = (value: string) => {
  const amount = cleanNumber(value);
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const formatCpfCnpj = (value: string) => {
  const digits = digitsOnly(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
};

const exportRows = (rows: Record<string, unknown>[], filename: string) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const html = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table>
          <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`)
              .join("")}
          </tbody>
        </table>
      </body>
    </html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xls`;
  link.click();
  URL.revokeObjectURL(url);
};

const exportCsv = (rows: Record<string, unknown>[], filename: string) => {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeCsv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    columns.map(escapeCsv).join(";"),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(";")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Sem sincronização nesta sessão";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
};

const productLabel = (item: InvoiceItem) => {
  if (item.ncm === "25171000") return "Pedra Detonada";
  if (item.ncm === "25161200") return "Bloco de Granito";
  if (/pedra detonada/i.test(item.description)) return "Pedra Detonada";
  if (/bloco|granito/i.test(item.description)) return "Bloco de Granito";
  if (/^\d+([.,]\d+)?$/.test(item.description.trim())) return "Produto sem descrição";
  return item.description || "Produto sem descrição";
};

const invoiceProductEntries = (invoice: Invoice) => {
  const pfValue = Number(invoice.pfValue || 0);
  if (!invoice.items?.length) {
    return [{ name: "Produto sem descrição", value: invoiceFinancialAmount(invoice) }];
  }

  const itemsTotal = invoice.items.reduce((total, item) => total + Number(item.totalValue || 0), 0) || invoice.totalInvoice || 1;
  return invoice.items.map((item) => ({
    name: productLabel(item),
    value: Number(item.totalValue || invoice.totalInvoice || 0) + pfValue * (Number(item.totalValue || 0) / itemsTotal),
  }));
};

const invoiceDate = (invoice: Invoice) => (invoice.invoiceType === "received" ? invoice.entryDate || invoice.issueDate : invoice.issueDate);
const invoicePeriodKey = (invoice: Invoice) => invoiceDate(invoice)?.slice(0, 7) || "";
const operationPeriodKey = (operation: LinkedOperation) => operation.operationDate?.slice(0, 7) || "";
const periodLabel = (period: string) => {
  const [year, month] = period.split("-");
  if (!year || !month) return period;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
};
const isPeriodClosed = (period: string) => Boolean(period && fiscalConfig.closedPeriods?.[period]);
const hasInvoiceCostCenter = (invoice: Invoice) =>
  Boolean(invoice.costCenter || invoice.items?.some((item) => item.costCenter));
const cfopIsConfigured = (invoice: Invoice) => {
  const code = getCfopCode(invoice.mainCfop);
  return Boolean(code && (fiscalConfig.cfopRules?.[code] || fiscalConfig.cfops.some((cfop) => getCfopCode(cfop) === code)));
};
const invoiceNeedsLink = (invoice: Invoice) => {
  const cfop = getCfopCode(invoice.mainCfop);
  const linkedType = invoice.linkedOperationType || invoice.operationType || "";
  return (
    ["5119", "5923", "1353"].includes(cfop) ||
    invoice.natureOperation === "CT-e" ||
    /triangula|ordem|vincula|cte|frete/i.test(linkedType)
  );
};
const invoiceHasLinkReference = (invoice: Invoice) =>
  Boolean(invoice.linkedInvoiceNumber || invoice.hasLinkedOperation || invoice.finalRecipientName || invoice.physicalReceiverName);
const invoiceHasHolder = (invoice: Invoice) => invoiceInstallments(invoice).every((installment) => Boolean(installment.holder));
const isBillInvoice = (invoice: Invoice) => invoice.natureOperation === "Fatura" || invoice.natureOperation === "Recibo";
const billFinancialKind = (invoice: Invoice): "receivable" | "payable" | null => {
  if (!isBillInvoice(invoice)) return null;
  if (/receber/i.test(invoice.operationType)) return "receivable";
  if (/pagar/i.test(invoice.operationType)) return "payable";
  return invoice.invoiceType === "issued" ? "receivable" : "payable";
};
const invoiceInstallments = (invoice: Invoice): PaymentInstallment[] =>
  invoice.financialInstallments?.length
    ? invoice.financialInstallments
    : [
        {
          id: "parcela_1",
          paymentCondition: invoice.paymentCondition,
          paymentMethod: invoice.paymentMethod,
          holder: "Itaú",
          dueDate: invoice.dueDate || invoice.issueDate,
          amount: invoice.totalInvoice,
          pfValue: Number(invoice.pfValue || 0),
          paid: invoice.paid,
          paymentDate: invoice.paymentDate,
          notes: invoice.internalNotes,
        },
      ];

const installmentTotal = (installment: PaymentInstallment) =>
  Number(installment.amount || 0) + Number(installment.pfValue || 0);

const invoiceHasPostedPayments = (invoice: Invoice) =>
  invoiceInstallments(invoice).some((installment) => installment.paid || installment.pfPaid);

const invoiceDataSnapshot = (invoice: Invoice) => {
  const {
    financialInstallments,
    paid,
    paymentDate,
    dueDate,
    paymentCondition,
    paymentMethod,
    pfValue,
    updatedAt,
    ...data
  } = invoice;
  return JSON.stringify(data);
};

const withinDateRange = (date: string | undefined, start: string, end: string) => {
  if (!date) return false;
  const value = date.slice(0, 10);
  if (start && value < start) return false;
  if (end && value > end) return false;
  return true;
};

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isCloseWord = (word: string, term: string) => {
  if (term.length < 4 || !/[a-z]/.test(term) || Math.abs(word.length - term.length) > 1) return false;
  let differences = Math.abs(word.length - term.length);
  const maxLength = Math.max(word.length, term.length);

  for (let index = 0; index < maxLength && differences <= 1; index += 1) {
    if (word[index] !== term[index]) differences += 1;
  }

  return differences <= 1;
};

const searchMatches = (text: string, query: string) => {
  const haystack = normalizeSearch(text);
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  return terms.every((term) => haystack.includes(term) || words.some((word) => isCloseWord(word, term)));
};

const invoiceSearchText = (invoice: Invoice) =>
  [
    invoice.invoiceNumber,
    invoice.partyName,
    invoice.partyCnpj,
    invoice.partyIe,
    invoice.city,
    invoice.state,
    invoice.mainCfop,
    invoice.natureOperation,
    invoice.operationType,
    invoice.status,
    invoice.carrierName,
    invoice.accessKey,
    invoice.xmlFileName,
    invoice.pdfFileName,
    invoice.additionalInfo,
    invoice.internalNotes,
    invoice.items.map((item) => [
      item.description,
      item.ncm,
      item.cfop,
      item.category,
      item.costCenter,
      item.materialType,
      item.blockNumber,
      item.blockColor,
      item.blockQuality,
      item.blockMeasures,
    ].join(" ")).join(" "),
  ]
    .join(" ")
    .toLowerCase();

const operationSearchText = (op: LinkedOperation) =>
  [
    op.id,
    op.operationType,
    op.mainInvoiceNumber,
    op.linkedInvoiceNumber,
    op.supplierName,
    op.finalRecipientName,
    op.finalRecipientCnpj,
    op.physicalReceiverName,
    op.physicalReceiverCnpj,
    op.mainCfop,
    op.linkedCfop,
    op.mainAccessKey,
    op.linkedAccessKey,
    op.amount,
    op.status,
    op.notes,
  ].join(" ");

const operationIdFromInvoices = (mainInvoiceNumber: string, linkedInvoiceNumber: string) => {
  const main = normalizeNoteNumber(mainInvoiceNumber);
  const linked = normalizeNoteNumber(linkedInvoiceNumber);
  return main && linked ? `op_${main}_${linked}` : newId("op");
};

function makeItem(form: FormData, invoiceType: InvoiceType, index: number, mainCfop: string, noteTaxBaseOverride?: number): InvoiceItem {
  const suffix = `_${index}`;
  const quantity = cleanNumber(form.get(`quantity${suffix}`));
  const unitValue = cleanNumber(form.get(`unitValue${suffix}`));
  const totalValue = cleanNumber(form.get(`totalValue${suffix}`)) || quantity * unitValue;
  const discountValue = cleanNumber(form.get(`discountValue${suffix}`));
  const freightValue = cleanNumber(form.get(`itemFreightValue${suffix}`));
  const taxBase = noteTaxBaseOverride !== undefined ? noteTaxBaseOverride : cleanNumber(form.get(`taxBase${suffix}`)) || totalValue;
  const icmsEnabled = form.get(`icmsEnabled${suffix}`) === "on";
  const pisEnabled = form.get(`pisEnabled${suffix}`) === "on";
  const cofinsEnabled = form.get(`cofinsEnabled${suffix}`) === "on";
  const ipiEnabled = form.get(`ipiEnabled${suffix}`) === "on";
  const ibsEnabled = form.get(`ibsEnabled${suffix}`) === "on";
  const cbsEnabled = form.get(`cbsEnabled${suffix}`) === "on";
  const icmsRate = icmsEnabled ? cleanNumber(form.get(`icmsRate${suffix}`)) : 0;
  const icmsBase = icmsEnabled ? taxBase : 0;
  const icmsValue = icmsEnabled ? cleanNumber(form.get(`icmsValue${suffix}`)) || (icmsBase * icmsRate) / 100 : 0;
  const pisBase = pisEnabled ? taxBase : 0;
  const pisRate = pisEnabled ? cleanNumber(form.get(`pisRate${suffix}`)) : 0;
  const pisValue = pisEnabled ? cleanNumber(form.get(`pisValue${suffix}`)) || (pisBase * pisRate) / 100 : 0;
  const cofinsBase = cofinsEnabled ? taxBase : 0;
  const cofinsRate = cofinsEnabled ? cleanNumber(form.get(`cofinsRate${suffix}`)) : 0;
  const cofinsValue = cofinsEnabled ? cleanNumber(form.get(`cofinsValue${suffix}`)) || (cofinsBase * cofinsRate) / 100 : 0;
  const ipiRate = ipiEnabled ? cleanNumber(form.get(`ipiRate${suffix}`)) : 0;
  const ipiBase = ipiEnabled ? taxBase : 0;
  const ipiValue = ipiEnabled ? cleanNumber(form.get(`ipiValue${suffix}`)) || (ipiBase * ipiRate) / 100 : 0;
  const ibsRate = ibsEnabled ? cleanNumber(form.get(`ibsRate${suffix}`)) : 0;
  const ibsBase = ibsEnabled ? taxBase : 0;
  const ibsValue = ibsEnabled ? cleanNumber(form.get(`ibsValue${suffix}`)) || (ibsBase * ibsRate) / 100 : 0;
  const cbsRate = cbsEnabled ? cleanNumber(form.get(`cbsRate${suffix}`)) : 0;
  const cbsBase = cbsEnabled ? taxBase : 0;
  const cbsValue = cbsEnabled ? cleanNumber(form.get(`cbsValue${suffix}`)) || (cbsBase * cbsRate) / 100 : 0;
  const cfemBase = Math.max(totalValue - icmsValue - pisValue - cofinsValue, 0);

  return {
    id: newId("item"),
    productId: String(form.get(`productId${suffix}`) || ""),
    itemCode: "",
    description: String(form.get(`description${suffix}`) || ""),
    category: String(form.get(`category${suffix}`) || ""),
    costCenter: String(form.get(`costCenter${suffix}`) || ""),
    accountingAccount: "",
    productColor: String(form.get(`productColor${suffix}`) || ""),
    ncm: String(form.get(`ncm${suffix}`) || ""),
    cfop: mainCfop,
    cstIcms: String(form.get(`cstIcms${suffix}`) || "000"),
    unit: String(form.get(`unit${suffix}`) || "UN"),
    quantity,
    unitValue,
    totalValue,
    discountValue,
    freightValue,
    icmsBase,
    icmsRate,
    icmsValue,
    icmsCreditable: invoiceType === "received" && icmsEnabled && form.get(`icmsCreditable${suffix}`) === "on",
    pisBase,
    pisRate,
    pisValue,
    pisCreditable: invoiceType === "received" && pisEnabled && form.get(`pisCreditable${suffix}`) === "on",
    cofinsBase,
    cofinsRate,
    cofinsValue,
    cofinsCreditable: invoiceType === "received" && cofinsEnabled && form.get(`cofinsCreditable${suffix}`) === "on",
    ipiBase,
    ipiRate,
    ipiValue,
    ibsBase,
    ibsRate,
    ibsValue,
    ibsCreditable: invoiceType === "received" && ibsEnabled && form.get(`ibsCreditable${suffix}`) === "on",
    cbsBase,
    cbsRate,
    cbsValue,
    cbsCreditable: invoiceType === "received" && cbsEnabled && form.get(`cbsCreditable${suffix}`) === "on",
    cfemRate: invoiceType === "issued" ? fiscalConfig.cfemRate : 0,
    cfemValue: invoiceType === "issued" ? cfemBase * (fiscalConfig.cfemRate / 100) : 0,
    materialType: String(form.get(`materialType${suffix}`) || ""),
    blockNumber: String(form.get(`blockNumber${suffix}`) || ""),
    blockColor: String(form.get(`blockColor${suffix}`) || ""),
    blockQuality: String(form.get(`blockQuality${suffix}`) || ""),
    blockMeasures: String(form.get(`blockMeasures${suffix}`) || ""),
    kilograms: cleanNumber(form.get(`kilograms${suffix}`)),
    notes: String(form.get(`itemNotes${suffix}`) || ""),
  };
}

function Badge({ value }: { value: string }) {
  const kind = value.includes("Cancelada")
    || value.includes("Devolvido")
    ? "danger"
    : value.includes("Pendente") || value.includes("Aberta")
      ? "warn"
      : "ok";
  return <span className={`badge ${kind}`}>{value}</span>;
}

function StatCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: string;
  tone?: "default" | "good" | "warn" | "danger" | "info";
}) {
  return (
    <article className={`stat ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

type TaxBreakdownRow = {
  invoiceNumber: string;
  issueDate: string;
  partyName: string;
  amount: number;
};

function TaxBreakdownPopover({
  title,
  rows,
  onClose,
}: {
  title: string;
  rows: TaxBreakdownRow[];
  onClose: () => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="tax-popover" role="dialog" aria-label={`Composição de ${title}`}>
      <div className="popover-title">
        <strong>{title}</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar detalhamento">
          <X size={15} />
        </button>
      </div>
      <div className="tax-popover-table">
        <table className="static-table compact-table">
          <thead>
            <tr>
              <th>N° nota</th>
              <th>Emissão</th>
              <th>Cliente/fornecedor</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={`${row.invoiceNumber}-${row.issueDate}-${index}`}>
                  <td>{row.invoiceNumber || "-"}</td>
                  <td>{formatDate(row.issueDate)}</td>
                  <td>{row.partyName || "-"}</td>
                  <td>{formatCurrency(row.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Nenhum lançamento compondo este valor.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="popover-total">
        <span>Total</span>
        <strong>{formatCurrency(total)}</strong>
      </div>
    </div>
  );
}

function TaxStatCard({
  title,
  value,
  tone = "default",
  rows,
  isOpen,
  onToggle,
  onClose,
}: {
  title: string;
  value: number;
  tone?: "default" | "good" | "warn" | "danger" | "info";
  rows: TaxBreakdownRow[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <article className={`stat ${tone} tax-click-card`}>
      <button type="button" className="tax-card-button" onClick={onToggle} title="Ver composição do valor">
        <span>{title}</span>
        <strong>{formatCurrency(value)}</strong>
      </button>
      {isOpen && <TaxBreakdownPopover title={title} rows={rows} onClose={onClose} />}
    </article>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  options,
  required,
  placeholder,
  inputMode,
  pattern,
  maxLength,
  sanitize,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  pattern?: string;
  maxLength?: number;
  sanitize?: "letters" | "digits" | "kg" | "cpfCnpj";
}) {
  const sanitizeValue = (value: string) => {
    if (sanitize === "letters") return value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");
    if (sanitize === "digits") return value.replace(/\D/g, "");
    if (sanitize === "kg") return value.replace(/[^\d.,]/g, "");
    if (sanitize === "cpfCnpj") return formatCpfCnpj(value);
    return value;
  };

  return (
    <label className="field">
      <span>{label}</span>
      {options ? (
        <select name={name} defaultValue={defaultValue} required={required}>
          <option value="">Selecione</option>
          {options.map((option) => (
            <option key={option} value={option.split(" - ")[0]}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          placeholder={placeholder}
          inputMode={inputMode}
          pattern={pattern}
          maxLength={maxLength}
          onInput={(event) => {
            if (!sanitize) return;
            const input = event.currentTarget;
            input.value = sanitizeValue(input.value);
          }}
        />
      )}
    </label>
  );
}

function MoneyField({
  label,
  name,
  defaultValue = "R$ 0,00",
  required,
  autoCalc,
  onChangeValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  autoCalc?: boolean;
  onChangeValue?: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder="R$ 0,00"
        inputMode="decimal"
        data-money={autoCalc ? "true" : undefined}
        onChange={(event) => onChangeValue?.(event.currentTarget.value)}
        onBlur={(event) => {
          event.currentTarget.value = formatMoneyInput(event.currentTarget.value);
          onChangeValue?.(event.currentTarget.value);
          if (autoCalc) event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
        }}
      />
    </label>
  );
}

function PercentField({ label, name, defaultValue = "0,00 %" }: { label: string; name: string; defaultValue?: string | number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={typeof defaultValue === "number" ? `${defaultValue.toFixed(2).replace(".", ",")} %` : defaultValue}
        inputMode="decimal"
        data-percent="true"
        onBlur={(event) => {
          event.currentTarget.value = formatPercentInput(event.currentTarget.value);
          event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
        }}
      />
    </label>
  );
}

function TaxControl({
  title,
  enabledName,
  defaultChecked,
  baseName,
  baseValue,
  rateName,
  rateValue,
  valueName,
  valueValue,
  creditName,
  creditDefault,
  showCredit,
}: {
  title: string;
  enabledName: string;
  defaultChecked: boolean;
  baseName: string;
  baseValue: string;
  rateName: string;
  rateValue: string | number;
  valueName: string;
  valueValue: string;
  creditName?: string;
  creditDefault?: boolean;
  showCredit?: boolean;
}) {
  return (
    <div className="tax-control-row">
      <label className="tax-toggle">
        <input
          name={enabledName}
          type="checkbox"
          defaultChecked={defaultChecked}
          onChange={(event) => event.currentTarget.form?.dispatchEvent(new Event("input", { bubbles: true }))}
        />
        <span>{title}</span>
      </label>
      <div className="tax-fields">
        <MoneyField label={`Base ${title}`} name={baseName} defaultValue={baseValue} autoCalc />
        <PercentField label={`Alíquota ${title} %`} name={rateName} defaultValue={rateValue} />
        <MoneyField label={`Valor ${title}`} name={valueName} defaultValue={valueValue} autoCalc />
        {showCredit && creditName && (
          <label className="check tax-credit">
            <input name={creditName} type="checkbox" defaultChecked={creditDefault} />
            {title} creditável
          </label>
        )}
      </div>
    </div>
  );
}

function KgField({ label, name, defaultValue = "0,00" }: { label: string; name: string; defaultValue?: string | number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        defaultValue={
          typeof defaultValue === "number"
            ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(defaultValue)
            : defaultValue
        }
        inputMode="decimal"
        onInput={(event) => {
          event.currentTarget.value = event.currentTarget.value.replace(/[^\d.,]/g, "");
        }}
        onBlur={(event) => {
          event.currentTarget.value = formatKgInput(event.currentTarget.value);
        }}
      />
    </label>
  );
}

function CpfCnpjField({ label, name, defaultValue = "" }: { label: string; name: string; defaultValue?: string }) {
  return (
    <Field
      label={label}
      name={name}
      defaultValue={defaultValue}
      placeholder="00.000.000/0000-00"
      inputMode="numeric"
      maxLength={18}
      sanitize="cpfCnpj"
    />
  );
}

function PartySelect({
  label,
  name,
  kind,
  parties,
  value,
  onChange,
  onAdd,
}: {
  label: string;
  name: string;
  kind: Party["kind"];
  parties: Party[];
  value: string;
  onChange: (party: Party | undefined) => void;
  onAdd?: (kind: Party["kind"]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = parties.filter((party) => party.kind === kind && party.active);
  const suggestions = filtered.filter((party) => normalizeSearch(party.name).includes(normalizeSearch(query))).slice(0, 8);
  const selected = filtered.find((party) => party.id === value);

  return (
    <div className="field party-search">
      <span>{label}</span>
      <input
        value={query || selected?.name || ""}
        placeholder={`Buscar ${label.toLowerCase()}`}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!event.target.value) onChange(undefined);
        }}
      />
      <input name={name} type="hidden" value={value} readOnly />
      {query && !selected && (
        <div className="suggestion-list">
          {suggestions.map((party) => (
            <button
              key={party.id}
              type="button"
              onClick={() => {
                onChange(party);
                setQuery(party.name);
              }}
            >
              {party.name}
            </button>
          ))}
          {!suggestions.length && onAdd && (
            <button type="button" onClick={() => onAdd(kind)}>
              Cadastrar novo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReadOnlyField({ label, name, value }: { label: string; name: string; value?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} value={value || ""} readOnly />
    </label>
  );
}

function ActionButton({
  children,
  icon: Icon,
  onClick,
  type = "button",
  variant = "primary",
}: {
  children: string;
  icon: any;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button className={`btn ${variant}`} onClick={onClick} type={type}>
      <Icon size={17} />
      {children}
    </button>
  );
}

function getAuthReturnMessage() {
  const params = new URLSearchParams(`${window.location.search.replace(/^\?/, "")}&${window.location.hash.replace(/^#/, "")}`);
  const errorCode = params.get("error_code");
  const description = params.get("error_description");

  if (errorCode === "otp_expired") {
    return "O link de confirmação do e-mail expirou ou já foi usado. Gere um novo convite/recuperação no Supabase e use o link mais recente.";
  }

  if (description) return `Retorno do Supabase: ${description.replace(/\+/g, " ")}`;
  return "";
}

function Login({ onLogin, authMessage }: { onLogin: (email?: string) => void; authMessage?: string }) {
  const [error, setError] = useState(authMessage || "");
  const [loading, setLoading] = useState(false);

  return (
    <main className="login-page">
      <div className="login-showcase">
        <img src="/brand/msg-mark.png" alt="MSG Mineração Serra Geral" />
      </div>
      <section className="login-panel">
        <img className="brand-logo login-logo" src="/brand/msg-mark.png" alt="MSG Mineração Serra Geral" />
        <h1>MSG Mineração - Sistema Fiscal</h1>
        <p>Controle interno de notas, triangulações, apuração e relatórios fiscais.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            const form = new FormData(event.currentTarget);
            const email = String(form.get("email") || "").trim().toLowerCase();
            const password = String(form.get("password") || "");

            if (isSupabaseConfigured && supabase) {
              const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
              if (signInError) {
                const message = signInError.message.toLowerCase().includes("invalid login credentials")
                  ? "Login recusado pelo Supabase: e-mail ou senha não conferem, ou o usuário ainda não foi confirmado no Supabase."
                  : `Login recusado pelo Supabase: ${signInError.message}`;
                setError(message);
                setLoading(false);
                return;
              }

              const signedEmail = data.user?.email || email;
              setError("");
              setLoading(false);
              onLogin(signedEmail);
              return;
            }

            setError("Configure o Supabase para entrar com e-mail e senha cadastrados.");
            setLoading(false);
          }}
        >
          <Field label="E-mail" name="email" type="email" required />
          <Field label="Senha" name="password" type="password" required />
          {error && <p className="form-error">{error}</p>}
          <ActionButton icon={Lock} type="submit">
            {loading ? "Entrando..." : "Entrar no sistema"}
          </ActionButton>
        </form>
      </section>
    </main>
  );
}

function Dashboard({
  invoices,
  operations,
  totals,
  onView,
}: {
  invoices: Invoice[];
  operations: LinkedOperation[];
  totals: ReturnType<typeof useFiscalStore>["totals"];
  onView: (view: View) => void;
}) {
  const [chartBreakdown, setChartBreakdown] = useState<{ title: string; rows: TaxBreakdownRow[] } | null>(null);
  const issuedSales = totals.issued.filter(invoiceConsidersSale);
  const invoiceBreakdownRow = (invoice: Invoice, amount: number): TaxBreakdownRow => ({
    invoiceNumber: normalizeNoteNumber(invoice.invoiceNumber),
    issueDate: invoice.issueDate,
    partyName: invoice.partyName,
    amount,
  });
  const customerRows = issuedSales.reduce<Record<string, TaxBreakdownRow[]>>((acc, invoice) => {
    const name = invoice.partyName || "Cliente sem nome";
    acc[name] ||= [];
    acc[name].push(invoiceBreakdownRow(invoice, invoiceFinancialAmount(invoice)));
    return acc;
  }, {});
  const productRows = issuedSales.reduce<Record<string, TaxBreakdownRow[]>>((acc, invoice) => {
    invoiceProductEntries(invoice).forEach((product) => {
      const name = product.name || "Produto sem descrição";
      acc[name] ||= [];
      acc[name].push(invoiceBreakdownRow(invoice, product.value));
    });
    return acc;
  }, {});
  const byCustomer = Object.values(
    issuedSales
      .reduce<Record<string, { name: string; value: number }>>((acc, invoice) => {
        const name = invoice.partyName || "Cliente sem nome";
        acc[name] ||= { name, value: 0 };
        acc[name].value += chartValue(invoiceFinancialAmount(invoice));
        return acc;
      }, {}),
  ).map((item) => ({ ...item, label: chartLabel(item.name) }));
  const byProduct = Object.values(
    issuedSales
      .flatMap(invoiceProductEntries)
      .reduce<Record<string, { name: string; value: number }>>((acc, product) => {
        const key = product.name || "Produto sem descrição";
        acc[key] ||= { name: key, value: 0 };
        acc[key].value += chartValue(product.value);
        return acc;
      }, {}),
  ).map((item) => ({ ...item, label: chartLabel(item.name, 22) }));
  const monthly = Object.values(
    issuedSales
      .reduce<Record<string, { month: string; faturamento: number }>>((acc, invoice) => {
        const key = invoice.issueDate.slice(0, 7);
        acc[key] ||= { month: `${key.slice(5, 7)}/${key.slice(0, 4)}`, faturamento: 0 };
        acc[key].faturamento += chartValue(invoiceFinancialAmount(invoice));
        return acc;
      }, {}),
  );
  const customerChart = byCustomer.length ? byCustomer : [{ name: "Sem dados", label: "Sem dados", value: 0 }];
  const productChart = byProduct.length ? byProduct : [{ name: "Sem dados", label: "Sem dados", value: 0 }];
  const monthlyChart = monthly.length ? monthly : [{ month: "Sem dados", faturamento: 0 }];

  const alerts = [
    `${totals.received.filter((invoice) => !invoice.costCenter).length} notas recebidas sem centro de custo`,
    `${operations.filter((op) => op.status !== "Finalizada").length} triangulações abertas`,
    `CFEM do mês: ${formatCurrency(totals.cfemDue)}`,
  ];

  return (
    <div className="view-stack">
      <div className="toolbar">
        <div className="filters">
          <Field label="Empresa" name="company" defaultValue="MSG Mineração Serra Geral Ltda" />
          <Field label="Competência" name="period" type="month" defaultValue="2026-06" />
        </div>
        <ActionButton icon={RefreshCw} onClick={() => window.location.reload()}>
          Atualizar
        </ActionButton>
      </div>

      <section className="stats-grid">
        <StatCard title="Notas emitidas" value={String(totals.issuedCount)} tone="good" />
        <StatCard title="Faturamento bruto" value={formatCurrency(totals.revenue)} tone="good" />
        <StatCard title="Notas recebidas" value={String(totals.receivedCount)} tone="danger" />
        <StatCard title="Compras brutas" value={formatCurrency(totals.purchases)} tone="danger" />
      </section>

      <section className="chart-grid">
        <ChartCard title="Faturamento por cliente" interactive>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={customerChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar
                dataKey="value"
                fill="#2563eb"
                radius={[4, 4, 0, 0]}
                onClick={(data: unknown) => {
                  const name = (data as { payload?: { name?: string } }).payload?.name;
                  if (!name || name === "Sem dados") return;
                  setChartBreakdown({ title: `Faturamento por cliente: ${name}`, rows: customerRows[name] || [] });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          {chartBreakdown?.title.startsWith("Faturamento por cliente") && (
            <ChartBreakdownPanel title={chartBreakdown.title} rows={chartBreakdown.rows} onClose={() => setChartBreakdown(null)} />
          )}
        </ChartCard>
        <ChartCard title="Faturamento por produto" interactive>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={productChart} layout="vertical" margin={{ left: 24, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="label" width={142} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar
                dataKey="value"
                fill="#f97316"
                radius={[0, 4, 4, 0]}
                onClick={(data: unknown) => {
                  const name = (data as { payload?: { name?: string } }).payload?.name;
                  if (!name || name === "Sem dados") return;
                  setChartBreakdown({ title: `Faturamento por produto: ${name}`, rows: productRows[name] || [] });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          {chartBreakdown?.title.startsWith("Faturamento por produto") && (
            <ChartBreakdownPanel title={chartBreakdown.title} rows={chartBreakdown.rows} onClose={() => setChartBreakdown(null)} />
          )}
        </ChartCard>
        <ChartCard title="Evolução mensal do faturamento">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Area dataKey="faturamento" fill="#93c5fd" stroke="#2563eb" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="split-grid">
        <QuickTable title="Notas Recebidas Recentes" action={() => onView("received")}>
          <InvoiceRows invoices={totals.received.slice(0, 5)} compact />
        </QuickTable>
        <QuickTable title="Operações Vinculadas Recentes" action={() => onView("linked")}>
          <OperationRows operations={operations.slice(0, 5)} />
        </QuickTable>
      </section>

      <section className="panel">
        <div className="panel-title">
          <AlertTriangle size={20} />
          <h2>Alertas e Pendências</h2>
        </div>
        <div className="alerts">
          {alerts.map((alert) => (
            <div className="alert" key={alert}>
              <Bell size={16} />
              {alert}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ChartBreakdownPanel({
  title,
  rows,
  onClose,
}: {
  title: string;
  rows: TaxBreakdownRow[];
  onClose: () => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="chart-breakdown-panel" role="dialog" aria-label={title}>
      <div className="popover-title">
        <strong>{title}</strong>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar detalhamento">
          <X size={15} />
        </button>
      </div>
      <div className="tax-popover-table">
        <table className="static-table compact-table">
          <thead>
            <tr>
              <th>N° nota</th>
              <th>Emissão</th>
              <th>Cliente</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={`${row.invoiceNumber}-${row.issueDate}-${index}`}>
                  <td>{row.invoiceNumber || "-"}</td>
                  <td>{formatDate(row.issueDate)}</td>
                  <td>{row.partyName || "-"}</td>
                  <td>{formatCurrency(row.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Nenhum lançamento compondo este valor.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="popover-total">
        <span>Total</span>
        <strong>{formatCurrency(total)}</strong>
      </div>
    </div>
  );
}

function ChartCard({ title, children, interactive = false }: { title: string; children: React.ReactNode; interactive?: boolean }) {
  return (
    <section className={`panel chart-card${interactive ? " interactive-chart" : ""}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function QuickTable({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title between">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={action} title="Abrir tela">
          <Search size={18} />
        </button>
      </div>
      <div className="table-wrap">{children}</div>
    </section>
  );
}

function InvoiceRows({
  invoices,
  compact,
  showPf,
  actions,
}: {
  invoices: Invoice[];
  compact?: boolean;
  showPf?: boolean;
  actions?: (invoice: Invoice) => React.ReactNode;
}) {
  const showPfValue = !compact && (showPf || invoices.some((invoice) => Number(invoice.pfValue || 0) > 0));

  return (
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>N° NF-e</th>
          <th>{compact ? "Fornecedor" : "Cliente/Fornecedor"}</th>
          <th>CFOP</th>
          <th>Valor total</th>
          {showPfValue && <th>Valor PF</th>}
          <th>Status</th>
          {actions && <th>Ações</th>}
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.id}>
            <td>{formatDate(invoice.issueDate)}</td>
            <td>{invoice.invoiceNumber}</td>
            <td>{invoice.partyName}</td>
            <td>{invoice.mainCfop}</td>
            <td>{formatCurrency(invoice.totalInvoice)}</td>
            {showPfValue && <td>{formatCurrency(invoice.pfValue || 0)}</td>}
            <td>
              <Badge value={invoice.status} />
            </td>
            {actions && <td>{actions(invoice)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OperationRows({ operations, actions }: { operations: LinkedOperation[]; actions?: (op: LinkedOperation) => React.ReactNode }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Notas vinculadas</th>
          <th>Tipo</th>
          <th>Nota principal</th>
          <th>Nota vinculada</th>
          <th>Fornecedor</th>
          <th>Destinatário final</th>
          <th>Valor</th>
          <th>Status</th>
          {actions && <th>Ações</th>}
        </tr>
      </thead>
      <tbody>
        {operations.map((op) => (
          <tr key={op.id}>
            <td>{[op.mainInvoiceNumber, op.linkedInvoiceNumber].filter(Boolean).join(" / ")}</td>
            <td>{op.operationType}</td>
            <td>{op.mainInvoiceNumber}</td>
            <td>{op.linkedInvoiceNumber}</td>
            <td>{op.supplierName}</td>
            <td>{op.finalRecipientName}</td>
            <td>{formatCurrency(op.amount)}</td>
            <td>
              <Badge value={op.status} />
            </td>
            {actions && <td>{actions(op)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceDetailPanel({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <section className="panel detail-panel">
      <div className="panel-title between">
        <h2>Detalhamento do lançamento {invoice.invoiceNumber}</h2>
        <button className="icon-btn" title="Fechar" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="detail-grid">
        <StatCard title="Tipo" value={invoice.invoiceType === "issued" ? "Emitida" : "Recebida"} />
        <StatCard title="Data" value={formatDate(invoice.entryDate || invoice.issueDate)} />
        <StatCard title="CFOP" value={invoice.mainCfop} />
        <StatCard title="Valor total" value={formatCurrency(invoice.totalInvoice)} />
        <StatCard title="Valor PF" value={formatCurrency(invoice.pfValue || 0)} />
        <StatCard title="Parte" value={invoice.partyName || "-"} />
        <StatCard title="CNPJ/CPF" value={invoice.partyCnpj || "-"} />
        <StatCard title="Transportadora" value={invoice.carrierName || "-"} />
        <StatCard title="ICMS" value={formatCurrency(invoice.icmsValue)} />
        <StatCard title="ICMS crédito" value={formatCurrency(invoice.icmsCreditValue)} />
        <StatCard title="PIS" value={formatCurrency(invoice.pisValue)} />
        <StatCard title="PIS crédito" value={formatCurrency(invoice.pisCreditValue)} />
        <StatCard title="COFINS" value={formatCurrency(invoice.cofinsValue)} />
        <StatCard title="COFINS crédito" value={formatCurrency(invoice.cofinsCreditValue)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Descrição</th>
              <th>NCM</th>
              <th>CFOP</th>
              <th>Qtd.</th>
              <th>Valor unitário</th>
              <th>Valor total</th>
              <th>ICMS</th>
              <th>PIS</th>
              <th>COFINS</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.ncm}</td>
                <td>{item.cfop}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.unitValue)}</td>
                <td>{formatCurrency(item.totalValue)}</td>
                <td>{formatCurrency(item.icmsValue)}</td>
                <td>{formatCurrency(item.pisValue)}</td>
                <td>{formatCurrency(item.cofinsValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(invoice.hasLinkedOperation || invoice.internalNotes || invoice.additionalInfo) && (
        <div className="detail-notes">
          {invoice.hasLinkedOperation && <p>Operação vinculada: {invoice.linkedOperationType || "Sim"} - Nota vinculada {invoice.linkedInvoiceNumber || "-"}</p>}
          {invoice.additionalInfo && <p>Informações complementares: {invoice.additionalInfo}</p>}
          {invoice.internalNotes && <p>Observações internas: {invoice.internalNotes}</p>}
        </div>
      )}
    </section>
  );
}

function InvoiceList({
  type,
  invoices,
  onNew,
  onDelete,
  onOpen,
  canEdit,
}: {
  type: InvoiceType;
  invoices: Invoice[];
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpen: (invoice: Invoice) => void;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [cfop, setCfop] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const filtered = invoices
    .filter((invoice) => invoice.invoiceType === type)
    .filter((invoice) => searchMatches(invoiceSearchText(invoice), query))
    .filter((invoice) => withinDateRange(invoiceDate(invoice), dateStart, dateEnd))
    .filter((invoice) => (!cfop ? true : invoice.mainCfop === cfop))
    .filter((invoice) => (!linkedOnly ? true : invoice.hasLinkedOperation));

  return (
    <div className="view-stack">
      <div className="toolbar">
        <div className="filters">
          <label className="field">
            <span>Busca geral</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número, CNPJ, CFOP, NCM..." />
          </label>
          <label className="field">
            <span>Data inicial</span>
            <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
          </label>
          <label className="field">
            <span>Data final</span>
            <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
          </label>
          <label className="field">
            <span>CFOP</span>
            <select value={cfop} onChange={(event) => setCfop(event.target.value)}>
              <option value="">Todos</option>
              {fiscalConfig.cfops.map((option) => (
                <option key={option} value={option.split(" - ")[0]}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {type === "received" && (
            <label className="check">
              <input type="checkbox" checked={linkedOnly} onChange={(event) => setLinkedOnly(event.target.checked)} />
              Somente triangulação
            </label>
          )}
        </div>
        {canEdit && (
          <ActionButton icon={Plus} onClick={onNew}>
            Nova nota
          </ActionButton>
        )}
      </div>
      <section className="panel">
        <div className="panel-title between">
          <h2>{type === "issued" ? "Notas Emitidas" : "Notas Recebidas"}</h2>
          <ActionButton
            icon={Download}
            variant="ghost"
            onClick={() =>
              exportRows(
                filtered.map((invoice) => ({
                  numero: invoice.invoiceNumber,
                  data: formatDate(invoice.entryDate || invoice.issueDate),
                  parte: invoice.partyName,
                  cnpj: invoice.partyCnpj,
                  cfop: invoice.mainCfop,
                  ncm: invoice.items[0]?.ncm,
                  valor: invoice.totalInvoice,
                  valorPf: invoice.pfValue || 0,
                  icms: invoice.invoiceType === "issued" ? invoice.icmsValue : invoice.icmsCreditValue,
                  status: invoice.status,
                })),
                type === "issued" ? "notas-emitidas" : "notas-recebidas",
              )
            }
          >
            Exportar
          </ActionButton>
        </div>
        <div className="table-wrap">
          <InvoiceRows
            invoices={filtered}
            showPf
            actions={(invoice) => (
              <div className="row-actions">
                <button className="icon-btn" title="Visualizar" onClick={() => onOpen(invoice)}>
                  <Search size={16} />
                </button>
                {canEdit && (
                  <>
                    <button
                      className="icon-btn"
                      title="Editar lançamento"
                      onClick={() => {
                        if (window.confirm("Tem certeza que deseja editar este lançamento?")) {
                          onOpen(invoice);
                        }
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn danger" title="Excluir" onClick={() => window.confirm("Tem certeza que deseja excluir este lançamento?") && onDelete(invoice.id)}>
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
            )}
          />
        </div>
      </section>
    </div>
  );
}

function InvoiceForm({
  type,
  invoices,
  operations,
  parties,
  products,
  editingInvoice,
  canEdit = true,
  onSave,
  onDelete,
  onOperation,
  onAddParty,
  onDone,
}: {
  type: InvoiceType;
  invoices: Invoice[];
  operations: LinkedOperation[];
  parties: Party[];
  products: ProductItem[];
  editingInvoice?: Invoice | null;
  canEdit?: boolean;
  onSave: (invoice: Invoice) => boolean | void;
  onDelete?: (id: string) => void;
  onOperation: (operation: LinkedOperation) => void;
  onAddParty: (kind: Party["kind"]) => void;
  onDone: () => void;
}) {
  const isReceived = type === "received";
  const isEditing = Boolean(editingInvoice);
  const [documentModel, setDocumentModel] = useState<ReceivedDocumentModel>(
    editingInvoice?.natureOperation === "CT-e" || editingInvoice?.operationType === "Conhecimento de frete"
      ? "CT-e"
      : editingInvoice?.natureOperation === "NFS-e" || editingInvoice?.mainCfop === "NFS-e"
        ? "NFS-e"
        : "NF-e",
  );
  const [selectedMainCfop, setSelectedMainCfop] = useState(editingInvoice?.mainCfop || "");
  const isServiceReceived = isReceived && documentModel === "NFS-e";
  const isFreightDocument = isReceived && documentModel === "CT-e";
  const isNonProductDocument = isServiceReceived || isFreightDocument;
  const partyKind: Party["kind"] = isFreightDocument ? "carrier" : isReceived ? "supplier" : "customer";
  const [linked, setLinked] = useState(editingInvoice?.hasLinkedOperation ?? (isReceived && documentModel === "NF-e"));
  const [itemIndexes, setItemIndexes] = useState(
    editingInvoice?.items?.length ? editingInvoice.items.map((_, index) => index) : [0],
  );
  const [installmentIndexes, setInstallmentIndexes] = useState(
    editingInvoice?.financialInstallments?.length ? editingInvoice.financialInstallments.map((_, index) => index) : [0],
  );
  const [selectedProducts, setSelectedProducts] = useState<Record<number, string>>(() =>
    Object.fromEntries((editingInvoice?.items || []).map((item, index) => [index, item.productId || ""])),
  );
  const [itemTotals, setItemTotals] = useState(() => ({
    products: editingInvoice?.totalProducts || 0,
    discounts: editingInvoice?.items?.reduce((total, item) => total + Number(item.discountValue || 0), 0) || editingInvoice?.discountValue || 0,
    freightItems: editingInvoice?.items?.reduce((total, item) => total + Number(item.freightValue || 0), 0) || 0,
    icms: editingInvoice?.icmsValue || editingInvoice?.icmsCreditValue || 0,
    pis: editingInvoice?.pisValue || editingInvoice?.pisCreditValue || 0,
    cofins: editingInvoice?.cofinsValue || editingInvoice?.cofinsCreditValue || 0,
    ipi: editingInvoice?.items?.reduce((total, item) => total + Number(item.ipiValue || 0), 0) || 0,
    ibs: editingInvoice?.items?.reduce((total, item) => total + Number(item.ibsValue || 0), 0) || 0,
    cbs: editingInvoice?.items?.reduce((total, item) => total + Number(item.cbsValue || 0), 0) || 0,
    retention: editingInvoice?.natureOperation === "NFS-e" || editingInvoice?.mainCfop === "NFS-e" ? editingInvoice?.retentionValue || 0 : 0,
    net: editingInvoice?.totalInvoice || 0,
  }));
  const [financePfTotal, setFinancePfTotal] = useState(
    () => editingInvoice?.financialInstallments?.reduce((total, installment) => total + Number(installment.pfValue || 0), 0) || Number(editingInvoice?.pfValue || 0),
  );
  const [selectedParty, setSelectedParty] = useState<Party | undefined>(() =>
    parties.find((party) => party.kind === partyKind && (party.name === editingInvoice?.partyName || party.cnpj === editingInvoice?.partyCnpj)),
  );
  const [selectedCarrier, setSelectedCarrier] = useState<Party | undefined>(() =>
    parties.find((party) => party.kind === "carrier" && party.name === editingInvoice?.carrierName),
  );
  const [thirdPartyFreight, setThirdPartyFreight] = useState(
    Boolean(editingInvoice?.carrierName?.includes("terceiros")) || (!editingInvoice?.freightValue && Boolean(editingInvoice)),
  );
  const [retentionEnabled, setRetentionEnabled] = useState(
    Boolean((editingInvoice?.natureOperation === "NFS-e" || editingInvoice?.mainCfop === "NFS-e") && editingInvoice?.retentionValue),
  );
  const [formWarnings, setFormWarnings] = useState<string[]>([]);

  useEffect(() => {
    if ((documentModel === "NFS-e" || documentModel === "CT-e") && !editingInvoice?.hasLinkedOperation) setLinked(false);
    if (documentModel === "CT-e" && !selectedMainCfop) setSelectedMainCfop("1353");
  }, [documentModel, editingInvoice?.hasLinkedOperation]);

  useEffect(() => {
    if (selectedParty && selectedParty.kind !== partyKind) setSelectedParty(undefined);
  }, [partyKind, selectedParty]);

  const updateFormSummaries = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    let products = 0;
    let discounts = 0;
    let freightItems = 0;
    let icms = 0;
    let pis = 0;
    let cofins = 0;
    let ipi = 0;
    let ibs = 0;
    let cbs = 0;

    itemIndexes.forEach((itemIndex) => {
      const suffix = `_${itemIndex}`;
      const quantity = cleanNumber(formData.get(`quantity${suffix}`));
      const unitValueField = form.elements.namedItem(`unitValue${suffix}`) as HTMLInputElement | null;
      const totalValueField = form.elements.namedItem(`totalValue${suffix}`) as HTMLInputElement | null;
      const unitValue = cleanNumber(unitValueField?.value || null);
      if (quantity && unitValue && totalValueField) totalValueField.value = formatCurrency(quantity * unitValue);
    });

    const noteProducts = itemIndexes.reduce((total, itemIndex) => {
      const suffix = `_${itemIndex}`;
      const totalValueField = form.elements.namedItem(`totalValue${suffix}`) as HTMLInputElement | null;
      return total + cleanNumber(totalValueField?.value || formData.get(`totalValue${suffix}`));
    }, 0);
    const noteItemDiscounts = itemIndexes.reduce((total, itemIndex) => total + cleanNumber(formData.get(`discountValue_${itemIndex}`)), 0);
    const noteItemFreight = itemIndexes.reduce((total, itemIndex) => total + cleanNumber(formData.get(`itemFreightValue_${itemIndex}`)), 0);
    const noteFreight = formData.get("thirdPartyFreight") === "on" ? 0 : cleanNumber(formData.get("freightValue"));
    const noteDiscount = cleanNumber(formData.get("discountValue"));
    const noteRetentionValue = isServiceReceived && formData.get("retentionEnabled") === "on" ? cleanNumber(formData.get("retentionValue")) : 0;
    const noteTaxBase = Math.max(noteProducts + noteFreight - noteItemDiscounts - noteDiscount - noteRetentionValue, 0);

    itemIndexes.forEach((itemIndex) => {
      const suffix = `_${itemIndex}`;
      const quantity = cleanNumber(formData.get(`quantity${suffix}`));
      const unitValueField = form.elements.namedItem(`unitValue${suffix}`) as HTMLInputElement | null;
      const totalValueField = form.elements.namedItem(`totalValue${suffix}`) as HTMLInputElement | null;
      const discountValueField = form.elements.namedItem(`discountValue${suffix}`) as HTMLInputElement | null;
      const itemFreightValueField = form.elements.namedItem(`itemFreightValue${suffix}`) as HTMLInputElement | null;
      const taxBaseField = form.elements.namedItem(`taxBase${suffix}`) as HTMLInputElement | null;
      const icmsBaseField = form.elements.namedItem(`icmsBase${suffix}`) as HTMLInputElement | null;
      const icmsRateField = form.elements.namedItem(`icmsRate${suffix}`) as HTMLInputElement | null;
      const icmsValueField = form.elements.namedItem(`icmsValue${suffix}`) as HTMLInputElement | null;
      const pisBaseField = form.elements.namedItem(`pisBase${suffix}`) as HTMLInputElement | null;
      const pisRateField = form.elements.namedItem(`pisRate${suffix}`) as HTMLInputElement | null;
      const pisValueField = form.elements.namedItem(`pisValue${suffix}`) as HTMLInputElement | null;
      const cofinsBaseField = form.elements.namedItem(`cofinsBase${suffix}`) as HTMLInputElement | null;
      const cofinsRateField = form.elements.namedItem(`cofinsRate${suffix}`) as HTMLInputElement | null;
      const cofinsValueField = form.elements.namedItem(`cofinsValue${suffix}`) as HTMLInputElement | null;
      const ipiBaseField = form.elements.namedItem(`ipiBase${suffix}`) as HTMLInputElement | null;
      const ipiRateField = form.elements.namedItem(`ipiRate${suffix}`) as HTMLInputElement | null;
      const ipiValueField = form.elements.namedItem(`ipiValue${suffix}`) as HTMLInputElement | null;
      const ibsBaseField = form.elements.namedItem(`ibsBase${suffix}`) as HTMLInputElement | null;
      const ibsRateField = form.elements.namedItem(`ibsRate${suffix}`) as HTMLInputElement | null;
      const ibsValueField = form.elements.namedItem(`ibsValue${suffix}`) as HTMLInputElement | null;
      const cbsBaseField = form.elements.namedItem(`cbsBase${suffix}`) as HTMLInputElement | null;
      const cbsRateField = form.elements.namedItem(`cbsRate${suffix}`) as HTMLInputElement | null;
      const cbsValueField = form.elements.namedItem(`cbsValue${suffix}`) as HTMLInputElement | null;
      const updateTaxFields = (
        enabledName: string,
        baseField: HTMLInputElement | null,
        rateField: HTMLInputElement | null,
        valueField: HTMLInputElement | null,
      ) => {
        const enabled = formData.get(`${enabledName}${suffix}`) === "on";
        const base = enabled ? taxBase : 0;
        if (baseField) baseField.value = formatCurrency(base);
        const rate = cleanNumber(rateField?.value || null);
        const value = enabled && base && rate ? (base * rate) / 100 : 0;
        if (valueField) valueField.value = formatCurrency(value);
        return value;
      };

      const unitValue = cleanNumber(unitValueField?.value || null);
      if (quantity && unitValue && totalValueField) totalValueField.value = formatCurrency(quantity * unitValue);

      const totalValue = cleanNumber(totalValueField?.value || null);
      products += totalValue;
      discounts += cleanNumber(discountValueField?.value || null);
      freightItems += cleanNumber(itemFreightValueField?.value || null);
      const taxBase = noteTaxBase;
      if (taxBaseField) taxBaseField.value = formatCurrency(taxBase);
      updateTaxFields("icmsEnabled", icmsBaseField, icmsRateField, icmsValueField);
      updateTaxFields("pisEnabled", pisBaseField, pisRateField, pisValueField);
      updateTaxFields("cofinsEnabled", cofinsBaseField, cofinsRateField, cofinsValueField);
      updateTaxFields("ipiEnabled", ipiBaseField, ipiRateField, ipiValueField);
      updateTaxFields("ibsEnabled", ibsBaseField, ibsRateField, ibsValueField);
      updateTaxFields("cbsEnabled", cbsBaseField, cbsRateField, cbsValueField);
      icms += cleanNumber(icmsValueField?.value || null);
      pis += cleanNumber(pisValueField?.value || null);
      cofins += cleanNumber(cofinsValueField?.value || null);
      ipi += cleanNumber(ipiValueField?.value || null);
      ibs += cleanNumber(ibsValueField?.value || null);
      cbs += cleanNumber(cbsValueField?.value || null);
    });
    const freightValue = formData.get("thirdPartyFreight") === "on" ? 0 : cleanNumber(formData.get("freightValue"));
    const discountValue = cleanNumber(formData.get("discountValue"));
    const retentionValue = isServiceReceived && formData.get("retentionEnabled") === "on" ? cleanNumber(formData.get("retentionValue")) : 0;
    const net = Math.max(products + freightValue - discounts - discountValue - retentionValue, 0);
    const amountFields = installmentIndexes
      .map((index) => form.elements.namedItem(`installmentAmount_${index}`) as HTMLInputElement | null)
      .filter(Boolean) as HTMLInputElement[];
    const untouched = amountFields.filter((field) => field.dataset.userEdited !== "true");
    if (amountFields.length && untouched.length === amountFields.length) {
      const share = net / amountFields.length;
      amountFields.forEach((field, index) => {
        const value = index === amountFields.length - 1 ? net - share * (amountFields.length - 1) : share;
        field.value = formatCurrency(value);
      });
    }
    const nextWarnings: string[] = [];
    const mainCfop = String(formData.get("mainCfop") || selectedMainCfop || "");
    const cfopCode = getCfopCode(mainCfop);
    const cfopExists = !cfopCode || fiscalConfig.cfops.some((cfop) => getCfopCode(cfop) === cfopCode);
    const cfopRule = cfopCode ? fiscalConfig.cfopRules?.[cfopCode] : undefined;
    if (!selectedParty && !formData.get("partyName")) {
      nextWarnings.push(isReceived ? "Selecione um fornecedor cadastrado antes de salvar." : "Selecione um cliente cadastrado antes de salvar.");
    }
    if (!cfopExists) nextWarnings.push("CFOP selecionado não está cadastrado nas configurações.");
    if (cfopCode && documentModel !== "NFS-e" && !cfopRule?.considerSale && !cfopRule?.considerCost) {
      nextWarnings.push("CFOP sem marcação de venda ou custo. A nota será listada, mas não entra nos relatórios financeiros.");
    }
    if (net > 0 && cfopCode && documentModel !== "NFS-e" && !cfopRule?.considerSale && !cfopRule?.considerCost) {
      nextWarnings.push("Há valor na nota com CFOP sem impacto financeiro. Confira se é remessa/simbólica.");
    }
    if (itemIndexes.some((itemIndex) => !String(formData.get(`costCenter_${itemIndex}`) || "").trim() && isReceived)) {
      nextWarnings.push("Há item sem centro de custo.");
    }
    const hasEnabledTaxWithoutRate = itemIndexes.some((itemIndex) =>
      ["icms", "pis", "cofins", "ipi", "ibs", "cbs"].some((tax) => {
        const suffix = `_${itemIndex}`;
        return formData.get(`${tax}Enabled${suffix}`) === "on" && cleanNumber(formData.get(`${tax}Rate${suffix}`)) === 0;
      }),
    );
    if (hasEnabledTaxWithoutRate) nextWarnings.push("Há imposto marcado com alíquota zerada.");
    const installmentTotal = amountFields.reduce((total, field) => total + cleanNumber(field.value), 0);
    if (amountFields.length && Math.abs(installmentTotal - net) > 0.01) {
      nextWarnings.push("A soma das parcelas está diferente do total líquido da nota.");
    }
    setFormWarnings(Array.from(new Set(nextWarnings)));
    setItemTotals({ products, discounts: discounts + discountValue, freightItems, icms, pis, cofins, ipi, ibs, cbs, retention: retentionValue, net });
    setFinancePfTotal(
      installmentIndexes.reduce((total, index) => total + cleanNumber(formData.get(`installmentPfValue_${index}`)), 0),
    );
  };

  const recalcItemValues = (event: FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement;
    if (target?.name?.startsWith("installmentAmount_")) {
      target.dataset.userEdited = "true";
    }
    updateFormSummaries(event.currentTarget);
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    if (isEditing && !window.confirm("Tem certeza que deseja salvar as alterações deste lançamento?")) return;
    const form = new FormData(event.currentTarget);
    const currentDocumentModel = String(form.get("documentModel") || documentModel);
    let mainCfop = String(form.get("mainCfop") || "");
    if (currentDocumentModel === "NFS-e") mainCfop = "NFS-e";
    const rawTotalProducts = itemIndexes.reduce((total, index) => {
      const suffix = `_${index}`;
      const quantity = cleanNumber(form.get(`quantity${suffix}`));
      const unitValue = cleanNumber(form.get(`unitValue${suffix}`));
      return total + (cleanNumber(form.get(`totalValue${suffix}`)) || quantity * unitValue);
    }, 0);
    const rawItemDiscounts = itemIndexes.reduce((total, index) => total + cleanNumber(form.get(`discountValue_${index}`)), 0);
    const rawFreightValue = form.get("thirdPartyFreight") === "on" ? 0 : cleanNumber(form.get("freightValue"));
    const rawDiscountValue = cleanNumber(form.get("discountValue"));
    const rawRetentionValue = isServiceReceived && form.get("retentionEnabled") === "on" ? cleanNumber(form.get("retentionValue")) : 0;
    const noteTaxBase = Math.max(rawTotalProducts + rawFreightValue - rawItemDiscounts - rawDiscountValue - rawRetentionValue, 0);
    const items = itemIndexes.map((index) => makeItem(form, type, index, mainCfop, noteTaxBase));
    const totalProducts = items.reduce((total, item) => total + item.totalValue, 0);
    const itemDiscountTotal = items.reduce((total, item) => total + Number(item.discountValue || 0), 0);
    const freightValue = form.get("thirdPartyFreight") === "on" ? 0 : cleanNumber(form.get("freightValue"));
    const discountValue = cleanNumber(form.get("discountValue"));
    const retentionType = isServiceReceived && !isFreightDocument && form.get("retentionEnabled") === "on"
      ? "Retenções de impostos"
      : "";
    const retentionValue = retentionType ? cleanNumber(form.get("retentionValue")) : 0;
    const totalInvoice = Math.max(totalProducts + freightValue - discountValue - itemDiscountTotal - retentionValue, 0);
    const rawInstallments = installmentIndexes.map((index, position) => ({
      id: editingInvoice?.financialInstallments?.[position]?.id || `parcela_${position + 1}`,
      paymentCondition: String(form.get(`paymentCondition_${index}`) || ""),
      paymentMethod: String(form.get(`paymentMethod_${index}`) || ""),
      holder: String(form.get(`holder_${index}`) || "Itaú"),
      dueDate: String(form.get(`dueDate_${index}`) || todayIso()),
      amount: cleanNumber(form.get(`installmentAmount_${index}`)),
      pfValue: cleanNumber(form.get(`installmentPfValue_${index}`)),
      paid: Boolean(editingInvoice?.financialInstallments?.[position]?.paid),
      paymentDate: editingInvoice?.financialInstallments?.[position]?.paymentDate || "",
      notes: editingInvoice?.financialInstallments?.[position]?.notes || "",
    }));
    const financialInstallments = rawInstallments.map((installment, index) => ({
      ...installment,
      amount: rawInstallments.length === 1 && installment.amount === 0 ? totalInvoice : installment.amount,
      paymentCondition: installment.paymentCondition || (index === 0 ? editingInvoice?.paymentCondition || "a prazo" : "a prazo"),
      paymentMethod: installment.paymentMethod || (index === 0 ? editingInvoice?.paymentMethod || "boleto" : "boleto"),
      holder: installment.holder || "Itaú",
    }));
    const firstInstallment = financialInstallments[0];
    const totalPfValue = financialInstallments.reduce((total, installment) => total + Number(installment.pfValue || 0), 0);
    const icmsBase = items.reduce((total, item) => total + item.icmsBase, 0);
    const icmsValue = items.reduce((total, item) => total + item.icmsValue, 0);
    const icmsCreditValue = items.reduce((total, item) => total + (item.icmsCreditable ? item.icmsValue : 0), 0);
    const pisValue = items.reduce((total, item) => total + item.pisValue, 0);
    const pisCreditValue = items.reduce((total, item) => total + (item.pisCreditable ? item.pisValue : 0), 0);
    const pisBase = items.reduce((total, item) => total + item.pisBase, 0);
    const cofinsValue = items.reduce((total, item) => total + item.cofinsValue, 0);
    const cofinsCreditValue = items.reduce((total, item) => total + (item.cofinsCreditable ? item.cofinsValue : 0), 0);
    const cofinsBase = items.reduce((total, item) => total + item.cofinsBase, 0);
    const cfemBase = Math.max(totalInvoice - icmsValue - pisValue - cofinsValue, 0);
    const cfemValue = isReceived ? 0 : cfemBase * (fiscalConfig.cfemRate / 100);
    const now = new Date().toISOString();
    const hasLinkedOperation = form.get("hasLinkedOperation") === "on";
    const linkedInvoiceNumberValue = normalizeNoteNumber(String(form.get("linkedInvoiceNumber") || ""));
    const freightLinkNote = isFreightDocument && linkedInvoiceNumberValue
      ? `Frete referente à NF-e ${linkedInvoiceNumberValue}`
      : "";
    const manualInternalNotes = String(form.get("internalNotes") || "");

    const invoice: Invoice = {
      id: editingInvoice?.id || newId("inv"),
      companyId: "msg",
      invoiceType: type,
      operationType: String(
        form.get("operationType") ||
          (currentDocumentModel === "NFS-e"
            ? "Serviço tomado"
            : currentDocumentModel === "CT-e"
              ? "Conhecimento de frete"
              : isReceived
                ? "Entrada"
                : "Saida"),
      ),
      invoiceNumber: normalizeNoteNumber(String(form.get("invoiceNumber") || "")),
      series: "1",
      accessKey: "",
      issueDate: String(form.get("issueDate") || todayIso()),
      entryDate: isReceived ? String(form.get("issueDate") || todayIso()) : undefined,
      exitDate: !isReceived ? String(form.get("issueDate") || todayIso()) : undefined,
      partyName: String(form.get("partyName") || ""),
      partyCnpj: String(form.get("partyCnpj") || ""),
      partyIe: String(form.get("partyIe") || ""),
      city: String(form.get("city") || ""),
      state: String(form.get("state") || "RS"),
      natureOperation: currentDocumentModel,
      mainCfop,
      purpose: "Normal",
      paymentCondition: firstInstallment?.paymentCondition || "",
      paymentMethod: firstInstallment?.paymentMethod || "",
      dueDate: firstInstallment?.dueDate || "",
      pfValue: totalPfValue,
      carrierName: isFreightDocument ? "" : String(form.get("carrierName") || ""),
      paymentDate: editingInvoice?.paymentDate || "",
      paid: Boolean(editingInvoice?.paid),
      status: String(form.get("status") || "Faturada") as Invoice["status"],
      category: items[0]?.category || "",
      costCenter: items[0]?.costCenter || "",
      totalProducts,
      freightValue,
      discountValue,
      retentionType,
      retentionValue,
      totalInvoice,
      icmsBase,
      icmsValue,
      icmsCreditValue,
      pisBase,
      pisValue,
      pisCreditValue,
      cofinsBase,
      cofinsValue,
      cofinsCreditValue,
      cfemBase,
      cfemRate: isReceived ? 0 : fiscalConfig.cfemRate,
      cfemValue,
      taxBenefit: "",
      legalBasis: "",
      additionalInfo: String(form.get("additionalInfo") || ""),
      internalNotes: [manualInternalNotes, freightLinkNote, String(form.get("linkedNotes") || "")]
        .filter(Boolean)
        .join("\n"),
      xmlFileName: "",
      pdfFileName: "",
      hasLinkedOperation,
      linkedOperationType: String(form.get("linkedOperationType") || (isFreightDocument ? "Vinculação CTE" : "")),
      linkedInvoiceNumber: linkedInvoiceNumberValue,
      finalRecipientName: String(form.get("finalRecipientName") || ""),
      physicalReceiverName: "",
      createdAt: editingInvoice?.createdAt || now,
      updatedAt: now,
      items,
      financialInstallments,
    };

    const saved = onSave(invoice);
    if (saved === false) return;

    if (hasLinkedOperation && !isFreightDocument) {
      const linkedInvoiceNumber = linkedInvoiceNumberValue;
      const existingOperation = operations.find(
        (operation) =>
          operation.mainInvoiceId === invoice.id ||
          operation.mainInvoiceNumber === invoice.invoiceNumber ||
          operation.id === operationIdFromInvoices(invoice.invoiceNumber, linkedInvoiceNumber),
      );

      onOperation({
        id: existingOperation?.id || operationIdFromInvoices(invoice.invoiceNumber, linkedInvoiceNumber),
        companyId: "msg",
        operationType: invoice.linkedOperationType || "Compra com triangulação",
        mainInvoiceId: invoice.id,
        linkedInvoiceId: invoices.find((candidate) => candidate.invoiceNumber === linkedInvoiceNumber)?.id,
        mainInvoiceNumber: invoice.invoiceNumber,
        linkedInvoiceNumber,
        supplierName: invoice.partyName,
        finalRecipientName: invoice.finalRecipientName || "",
        finalRecipientCnpj: String(form.get("finalRecipientCnpj") || ""),
        physicalReceiverName: "",
        physicalReceiverCnpj: "",
        mainCfop: invoice.mainCfop,
        linkedCfop: String(form.get("linkedCfop") || ""),
        mainAccessKey: invoice.accessKey,
        linkedAccessKey: String(form.get("linkedAccessKey") || ""),
        operationDate: String(form.get("operationDate") || invoice.issueDate),
        amount: cleanNumber(form.get("linkedAmount")) || invoice.totalInvoice,
        status: String(form.get("linkedStatus") || "Aberta") as LinkedOperation["status"],
        notes: String(form.get("linkedNotes") || ""),
        createdAt: existingOperation?.createdAt || now,
        updatedAt: now,
      });
    }

    onDone();
  }

  return (
    <form className="view-stack" onSubmit={submit} onInput={recalcItemValues}>
      <fieldset disabled={!canEdit} className="form-fieldset">
      <section className="panel">
        <div className="panel-title between">
          <div className="panel-title">
            <Files size={20} />
            <h2>{isEditing ? "Alterar lançamento" : isReceived ? "Nova Nota Recebida" : "Nova Nota Emitida"}</h2>
          </div>
          {isEditing && canEdit && onDelete && (
            <button
              className="btn danger"
              type="button"
              onClick={() => {
                if (!editingInvoice || !window.confirm("Tem certeza que deseja excluir este lançamento?")) return;
                onDelete(editingInvoice.id);
                onDone();
              }}
            >
              <X size={17} />
              Excluir lançamento
            </button>
          )}
        </div>
        {isEditing && !canEdit && (
          <div className="warning-list">
            <span>Este lançamento pertence a uma competência fechada. Desbloqueie o período em Fechamentos para alterar.</span>
          </div>
        )}
        <div className="form-grid">
          <Field label={isReceived ? "Data de emissão fornecedor" : "Data de emissão"} name="issueDate" type="date" defaultValue={editingInvoice?.issueDate || todayIso()} required />
          <Field label="Número da nota" name="invoiceNumber" defaultValue={normalizeNoteNumber(editingInvoice?.invoiceNumber)} required inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
          {isReceived && (
            <label className="field">
              <span>Tipo de documento</span>
              <select name="documentModel" value={documentModel} onChange={(event) => setDocumentModel(event.target.value as ReceivedDocumentModel)}>
                <option value="NF-e">NF-e / mercadoria</option>
                <option value="NFS-e">NFS-e / serviço tomado</option>
                <option value="CT-e">Conhecimento de frete</option>
              </select>
            </label>
          )}
          <PartySelect
            label={isFreightDocument ? "Transportadora" : isReceived ? "Fornecedor" : "Cliente"}
            name="partyId"
            kind={partyKind}
            parties={parties}
            value={selectedParty?.id || ""}
            onChange={setSelectedParty}
            onAdd={onAddParty}
          />
          <ReadOnlyField label="CNPJ/CPF" name="partyCnpj" value={selectedParty?.cnpj || editingInvoice?.partyCnpj} />
          <ReadOnlyField label="Inscrição Estadual" name="partyIe" value={selectedParty?.ie || editingInvoice?.partyIe} />
          <ReadOnlyField label="Município" name="city" value={selectedParty?.city || editingInvoice?.city} />
          <ReadOnlyField label="UF" name="state" value={selectedParty?.state || editingInvoice?.state} />
          <input name="partyName" type="hidden" value={selectedParty?.name || editingInvoice?.partyName || ""} readOnly />
          <label className="field">
            <span>{isServiceReceived ? "Regra fiscal de custo" : "CFOP principal"}</span>
            <select
              name="mainCfop"
              value={isServiceReceived ? "NFS-e" : selectedMainCfop}
              onChange={(event) => setSelectedMainCfop(event.target.value)}
              required
            >
              <option value="">Selecione</option>
              {fiscalConfig.cfops.map((option) => (
                <option key={option} value={option.split(" - ")[0]}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Tipo de operação"
            name="operationType"
            options={Array.from(new Set([...(editingInvoice?.operationType ? [editingInvoice.operationType] : []), ...configuredOperationTypes()]))}
            defaultValue={editingInvoice?.operationType || configuredOperationTypes()[0] || ""}
          />
          <label className="field">
            <span>Status</span>
            <select name="status" defaultValue={editingInvoice?.status || "Faturada"}>
              {["Faturada", "Pendente", "Cancelada", "Em conferência"].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {formWarnings.length > 0 && (
        <section className="invoice-warnings">
          {formWarnings.map((warning) => (
            <div className="invoice-warning" key={warning}>
              <AlertTriangle size={16} />
              <span>{warning}</span>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <div className="panel-title between">
          <h2>Itens da Nota</h2>
          {canEdit && (
            <ActionButton
              icon={Plus}
              variant="ghost"
              onClick={() => setItemIndexes((current) => [...current, Math.max(...current) + 1])}
            >
              Adicionar item
            </ActionButton>
          )}
        </div>
        <div className="items-stack">
          {itemIndexes.map((itemIndex, position) => {
            const existingItem = editingInvoice?.items[position];
            const selectedProductId = selectedProducts[itemIndex] || existingItem?.productId || "";
            const selectedProduct = products.find((product) => product.id === selectedProductId);
            const taxIsEnabled = (base?: number, value?: number, rate?: number) => Boolean(Number(base || 0) || Number(value || 0) || Number(rate || 0));
            const taxBaseValue = formatCurrency(existingItem?.icmsBase || existingItem?.pisBase || existingItem?.cofinsBase || existingItem?.totalValue || 0);
            return (
            <article className="item-card" key={`${itemIndex}-${selectedProductId || "manual"}`}>
              <div className="panel-title between">
                <h3>Item {position + 1}</h3>
                {canEdit && itemIndexes.length > 1 && (
                  <button
                    className="icon-btn danger"
                    title="Remover item"
                    type="button"
                    onClick={() => setItemIndexes((current) => current.filter((value) => value !== itemIndex))}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <div className="form-grid">
                <div className="subsection-label">Produto/serviço</div>
                {!isReceived ? (
                  <>
                    <label className="field">
                      <span>Produto vendido</span>
                      <select
                        name={`productId_${itemIndex}`}
                        value={selectedProductId}
                        onChange={(event) => setSelectedProducts((current) => ({ ...current, [itemIndex]: event.target.value }))}
                        required
                      >
                        <option value="">Selecione</option>
                        {products.filter((product) => product.active).map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <ReadOnlyField label="Descrição do produto/serviço" name={`description_${itemIndex}`} value={selectedProduct?.name || existingItem?.description || ""} />
                  </>
                ) : (
                  <Field label="Descrição do produto/serviço" name={`description_${itemIndex}`} defaultValue={existingItem?.description || ""} required sanitize="letters" />
                )}
                {isReceived && <Field label="Categoria" name={`category_${itemIndex}`} options={fiscalConfig.categories} defaultValue={existingItem?.category || selectedProduct?.defaultCategory || ""} />}
                {isReceived && <Field label="Centro de custo" name={`costCenter_${itemIndex}`} options={fiscalConfig.costCenters} defaultValue={existingItem?.costCenter || selectedProduct?.defaultCostCenter || ""} />}
                <Field label={isNonProductDocument ? "NCM (opcional)" : "NCM"} name={`ncm_${itemIndex}`} defaultValue={onlyDigits(existingItem?.ncm || selectedProduct?.ncm)} required={!isNonProductDocument} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <Field label="CST ICMS" name={`cstIcms_${itemIndex}`} options={fiscalConfig.csts} defaultValue={existingItem?.cstIcms || ""} />
                <Field label="Unidade" name={`unit_${itemIndex}`} options={fiscalConfig.units || unitOptions} defaultValue={existingItem?.unit || selectedProduct?.defaultUnit || (isNonProductDocument ? "SV" : "UN")} />
                <div className="subsection-label">Valores</div>
                <Field label="Quantidade" name={`quantity_${itemIndex}`} defaultValue={onlyDigits(existingItem?.quantity || "1")} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <MoneyField label="Valor unitário" name={`unitValue_${itemIndex}`} defaultValue={formatCurrency(existingItem?.unitValue || 0)} autoCalc />
                <MoneyField label="Valor total" name={`totalValue_${itemIndex}`} defaultValue={formatCurrency(existingItem?.totalValue || 0)} autoCalc />
                <MoneyField label="Desconto do item" name={`discountValue_${itemIndex}`} defaultValue={formatCurrency(existingItem?.discountValue || 0)} autoCalc />
                <div className="item-freight-demo">
                  <MoneyField label="Frete do item (demonstrativo)" name={`itemFreightValue_${itemIndex}`} defaultValue={formatCurrency(existingItem?.freightValue || 0)} autoCalc />
                </div>
                <input name={`taxBase_${itemIndex}`} type="hidden" defaultValue={taxBaseValue} />
                <div className="subsection-label">Impostos</div>
                <div className="tax-control-list">
                  <TaxControl
                    title="ICMS"
                    enabledName={`icmsEnabled_${itemIndex}`}
                    defaultChecked={taxIsEnabled(existingItem?.icmsBase, existingItem?.icmsValue, existingItem?.icmsRate)}
                    baseName={`icmsBase_${itemIndex}`}
                    baseValue={formatCurrency(existingItem?.icmsBase || 0)}
                    rateName={`icmsRate_${itemIndex}`}
                    rateValue={existingItem?.icmsRate || (isReceived ? 12 : fiscalConfig.icmsRate)}
                    valueName={`icmsValue_${itemIndex}`}
                    valueValue={formatCurrency(existingItem?.icmsValue || 0)}
                    creditName={`icmsCreditable_${itemIndex}`}
                    creditDefault={existingItem?.icmsCreditable ?? true}
                    showCredit={isReceived}
                  />
                  <TaxControl
                    title="PIS"
                    enabledName={`pisEnabled_${itemIndex}`}
                    defaultChecked={taxIsEnabled(existingItem?.pisBase, existingItem?.pisValue, existingItem?.pisRate)}
                    baseName={`pisBase_${itemIndex}`}
                    baseValue={formatCurrency(existingItem?.pisBase || 0)}
                    rateName={`pisRate_${itemIndex}`}
                    rateValue={existingItem?.pisRate || fiscalConfig.pisRate}
                    valueName={`pisValue_${itemIndex}`}
                    valueValue={formatCurrency(existingItem?.pisValue || 0)}
                    creditName={`pisCreditable_${itemIndex}`}
                    creditDefault={existingItem?.pisCreditable ?? true}
                    showCredit={isReceived}
                  />
                  <TaxControl
                    title="COFINS"
                    enabledName={`cofinsEnabled_${itemIndex}`}
                    defaultChecked={taxIsEnabled(existingItem?.cofinsBase, existingItem?.cofinsValue, existingItem?.cofinsRate)}
                    baseName={`cofinsBase_${itemIndex}`}
                    baseValue={formatCurrency(existingItem?.cofinsBase || 0)}
                    rateName={`cofinsRate_${itemIndex}`}
                    rateValue={existingItem?.cofinsRate || fiscalConfig.cofinsRate}
                    valueName={`cofinsValue_${itemIndex}`}
                    valueValue={formatCurrency(existingItem?.cofinsValue || 0)}
                    creditName={`cofinsCreditable_${itemIndex}`}
                    creditDefault={existingItem?.cofinsCreditable ?? true}
                    showCredit={isReceived}
                  />
                  <TaxControl
                    title="IPI"
                    enabledName={`ipiEnabled_${itemIndex}`}
                    defaultChecked={taxIsEnabled(existingItem?.ipiBase, existingItem?.ipiValue, existingItem?.ipiRate)}
                    baseName={`ipiBase_${itemIndex}`}
                    baseValue={formatCurrency(existingItem?.ipiBase || 0)}
                    rateName={`ipiRate_${itemIndex}`}
                    rateValue={existingItem?.ipiRate || 0}
                    valueName={`ipiValue_${itemIndex}`}
                    valueValue={formatCurrency(existingItem?.ipiValue || 0)}
                  />
                  <TaxControl
                    title="IBS"
                    enabledName={`ibsEnabled_${itemIndex}`}
                    defaultChecked={taxIsEnabled(existingItem?.ibsBase, existingItem?.ibsValue, existingItem?.ibsRate)}
                    baseName={`ibsBase_${itemIndex}`}
                    baseValue={formatCurrency(existingItem?.ibsBase || 0)}
                    rateName={`ibsRate_${itemIndex}`}
                    rateValue={existingItem?.ibsRate || 0}
                    valueName={`ibsValue_${itemIndex}`}
                    valueValue={formatCurrency(existingItem?.ibsValue || 0)}
                    creditName={`ibsCreditable_${itemIndex}`}
                    creditDefault={existingItem?.ibsCreditable ?? true}
                    showCredit={isReceived}
                  />
                  <TaxControl
                    title="CBS"
                    enabledName={`cbsEnabled_${itemIndex}`}
                    defaultChecked={taxIsEnabled(existingItem?.cbsBase, existingItem?.cbsValue, existingItem?.cbsRate)}
                    baseName={`cbsBase_${itemIndex}`}
                    baseValue={formatCurrency(existingItem?.cbsBase || 0)}
                    rateName={`cbsRate_${itemIndex}`}
                    rateValue={existingItem?.cbsRate || 0}
                    valueName={`cbsValue_${itemIndex}`}
                    valueValue={formatCurrency(existingItem?.cbsValue || 0)}
                    creditName={`cbsCreditable_${itemIndex}`}
                    creditDefault={existingItem?.cbsCreditable ?? true}
                    showCredit={isReceived}
                  />
                </div>
                {!isReceived && <div className="subsection-label">Dados do bloco</div>}
                {!isReceived && <Field label="Tipo do material" name={`materialType_${itemIndex}`} defaultValue={existingItem?.materialType || ""} sanitize="letters" />}
                {!isReceived && <Field label="Número do bloco" name={`blockNumber_${itemIndex}`} defaultValue={onlyDigits(existingItem?.blockNumber)} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />}
                {!isReceived && <Field label="Cor do bloco" name={`blockColor_${itemIndex}`} defaultValue={existingItem?.blockColor || ""} sanitize="letters" />}
                {!isReceived && <Field label="Qualidade do bloco" name={`blockQuality_${itemIndex}`} options={blockQualityOptions} defaultValue={existingItem?.blockQuality || ""} />}
                {!isReceived && <Field label="Medidas do bloco" name={`blockMeasures_${itemIndex}`} defaultValue={existingItem?.blockMeasures || ""} />}
                {!isReceived && <KgField label="KG" name={`kilograms_${itemIndex}`} defaultValue={existingItem?.kilograms || "0"} />}
              </div>
            </article>
          );
          })}
        </div>
        <div className="note-adjustments">
          <MoneyField
            label="Desconto total da nota"
            name="discountValue"
            defaultValue={formatCurrency(editingInvoice?.discountValue || 0)}
            autoCalc
          />
        </div>
        <div className="item-totals-grid">
          <StatCard title="Total produtos" value={formatCurrency(itemTotals.products)} tone="info" />
          <StatCard title="Descontos" value={formatCurrency(itemTotals.discounts)} tone="danger" />
          <StatCard title="Frete por item" value={formatCurrency(itemTotals.freightItems)} tone="warn" />
          <StatCard title="Total ICMS" value={formatCurrency(itemTotals.icms)} tone="danger" />
          <StatCard title="Total PIS" value={formatCurrency(itemTotals.pis)} tone="warn" />
          <StatCard title="Total COFINS" value={formatCurrency(itemTotals.cofins)} tone="warn" />
          <StatCard title="Total IPI" value={formatCurrency(itemTotals.ipi)} tone="warn" />
          <StatCard title="Total IBS" value={formatCurrency(itemTotals.ibs)} tone="warn" />
          <StatCard title="Total CBS" value={formatCurrency(itemTotals.cbs)} tone="warn" />
          <StatCard title="Retenções" value={formatCurrency(itemTotals.retention)} tone="danger" />
          <StatCard title="Total líquido da nota" value={formatCurrency(itemTotals.net || itemTotals.products)} tone="good" />
        </div>
        {isServiceReceived && !isFreightDocument && (
          <div className="retention-box">
            <label className="check">
              <input
                name="retentionEnabled"
                type="checkbox"
                checked={retentionEnabled}
                onChange={(event) => setRetentionEnabled(event.target.checked)}
              />
              Retenção de impostos
            </label>
            {retentionEnabled && (
              <MoneyField
                label="Valor das retenções"
                name="retentionValue"
                defaultValue={formatCurrency(editingInvoice?.retentionValue || 0)}
                autoCalc
              />
            )}
          </div>
        )}
        {isFreightDocument && (
          <div className="linked-note-box">
            <h3>Vincular NF-e ao frete</h3>
            <div className="form-grid compact">
              <Field label="Nota eletrônica relacionada" name="linkedInvoiceNumber" defaultValue={normalizeNoteNumber(editingInvoice?.linkedInvoiceNumber)} />
              <label className="field wide">
                <span>Observação do vínculo</span>
                <input
                  name="linkedNotes"
                  defaultValue={editingInvoice?.internalNotes?.includes("Frete referente") ? editingInvoice.internalNotes : ""}
                  placeholder="Ex.: Frete referente à NF-e 5574"
                />
              </label>
            </div>
          </div>
        )}
      </section>

      <section className={isFreightDocument ? "view-stack" : "split-grid"}>
        {!isFreightDocument && (
          <section className="panel">
            <h2>Transporte</h2>
            <label className="check transport-third-party">
              <input name="thirdPartyFreight" type="checkbox" checked={thirdPartyFreight} onChange={(event) => setThirdPartyFreight(event.target.checked)} />
              Frete por conta de terceiros
            </label>
            <div className="form-grid compact">
              <MoneyField label="Valor frete" name="freightValue" defaultValue={formatCurrency(editingInvoice?.freightValue || 0)} />
              <PartySelect
                label="Transportadora"
                name="carrierId"
                kind="carrier"
                parties={parties}
                value={selectedCarrier?.id || ""}
                onChange={setSelectedCarrier}
                onAdd={onAddParty}
              />
              <input name="carrierName" type="hidden" value={selectedCarrier?.name || editingInvoice?.carrierName || ""} readOnly />
              {!thirdPartyFreight && <Field label="Vencimento" name="freightDueDate" type="date" />}
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-title between">
            <h2>Financeiro</h2>
            <button
              className="icon-btn"
              type="button"
              title="Adicionar parcela"
              onClick={(event) => {
                const form = event.currentTarget.closest("form") as HTMLFormElement | null;
                setInstallmentIndexes((current) => [...current, Math.max(...current) + 1]);
                window.setTimeout(() => {
                  if (!form) return;
                  const fields = Array.from(form.querySelectorAll<HTMLInputElement>('input[name^="installmentAmount_"]'));
                  if (!fields.length) return;
                  const total = itemTotals.net || itemTotals.products;
                  const share = total / fields.length;
                  fields.forEach((field, index) => {
                    const value = index === fields.length - 1 ? total - share * (fields.length - 1) : share;
                    field.value = formatCurrency(value);
                    delete field.dataset.userEdited;
                  });
                }, 0);
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="installments-stack">
            {installmentIndexes.map((installmentIndex, position) => {
              const installment = editingInvoice?.financialInstallments?.[position];
              return (
                <article className="installment-row" key={installmentIndex}>
                  <strong>Parcela {position + 1}</strong>
                  <Field label="Forma de pagamento" name={`paymentCondition_${installmentIndex}`} options={configuredPaymentConditions()} defaultValue={installment?.paymentCondition || editingInvoice?.paymentCondition || "a prazo"} />
                  <Field label="Meio de pagamento" name={`paymentMethod_${installmentIndex}`} options={configuredPaymentMethods()} defaultValue={installment?.paymentMethod || editingInvoice?.paymentMethod || "boleto"} />
                  <Field label="Portador" name={`holder_${installmentIndex}`} options={configuredHolders()} defaultValue={installment?.holder || "Itaú"} />
                  <Field label="Vencimento" name={`dueDate_${installmentIndex}`} type="date" defaultValue={installment?.dueDate || editingInvoice?.dueDate || ""} />
                  <MoneyField label="Valor da parcela" name={`installmentAmount_${installmentIndex}`} defaultValue={formatCurrency(installment?.amount || (position === 0 ? editingInvoice?.totalInvoice || 0 : 0))} autoCalc />
                  <MoneyField label="Valor PF" name={`installmentPfValue_${installmentIndex}`} defaultValue={formatCurrency(installment?.pfValue || (position === 0 && !editingInvoice?.financialInstallments?.length ? editingInvoice?.pfValue || 0 : 0))} autoCalc />
                  {installmentIndexes.length > 1 && (
                    <button
                      className="icon-btn danger"
                      type="button"
                      title="Remover parcela"
                      onClick={() => setInstallmentIndexes((current) => current.filter((value) => value !== installmentIndex))}
                    >
                      <X size={16} />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <div className="finance-pf-total">
            <span>Total PF</span>
            <strong>{formatCurrency(financePfTotal)}</strong>
          </div>
        </section>
      </section>

      <section className="panel">
        <h2>Observações</h2>
        <label className="field wide">
          <span>Informações complementares</span>
          <textarea name="additionalInfo" defaultValue={editingInvoice?.additionalInfo || ""} />
        </label>
        <label className="field wide">
          <span>Observações internas</span>
          <textarea name="internalNotes" defaultValue={editingInvoice?.internalNotes || ""} />
        </label>
      </section>

      {isReceived && (
        <section className="panel emphasis">
          <div className="panel-title between">
            <h2>Operação Vinculada / Triangulação</h2>
            <label className="toggle">
              <input name="hasLinkedOperation" type="checkbox" checked={linked} onChange={(event) => setLinked(event.target.checked)} />
              <span>Possui vinculo</span>
            </label>
          </div>
          {linked && (
            <div className="form-grid">
                <Field label="Tipo de operação vinculada" name="linkedOperationType" options={fiscalConfig.linkedTypes} defaultValue={editingInvoice?.linkedOperationType || (isFreightDocument ? "Vinculação CTE" : "Compra com triangulação")} />
                <Field label="Nota vinculada" name="linkedInvoiceNumber" defaultValue={normalizeNoteNumber(editingInvoice?.linkedInvoiceNumber)} />
                <Field label="Chave nota vinculada" name="linkedAccessKey" />
                <Field label="CFOP nota vinculada" name="linkedCfop" defaultValue="5923" />
                <Field label="Destinatário final" name="finalRecipientName" defaultValue={editingInvoice?.finalRecipientName || ""} />
                <Field label="CNPJ destinatario final" name="finalRecipientCnpj" />
                <Field label="Data da operação" name="operationDate" type="date" defaultValue={todayIso()} />
                <MoneyField label="Valor vinculado" name="linkedAmount" defaultValue={formatCurrency(editingInvoice?.totalInvoice || 0)} />
              <label className="field">
                <span>Status da operação</span>
                <select name="linkedStatus" defaultValue="Aberta">
                  {["Aberta", "Finalizada", "Parcialmente vinculada", "Pendente de XML", "Pendente de conferência", "Cancelada"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <Field label="Observações da operação" name="linkedNotes" />
            </div>
          )}
        </section>
      )}
      </fieldset>

      {canEdit && (
        <div className="form-actions">
          {isEditing && (
            <ActionButton icon={X} variant="ghost" onClick={onDone}>
              Cancelar
            </ActionButton>
          )}
          <ActionButton icon={Save} type="submit">
            {isEditing ? "Salvar alterações" : "Salvar nota"}
          </ActionButton>
        </div>
      )}
    </form>
  );
}

function LinkedOperationsView({
  operations,
  onSave,
  onDelete,
  canEdit,
}: {
  operations: LinkedOperation[];
  onSave: (op: LinkedOperation) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = operations.filter((op) => searchMatches(operationSearchText(op), query));
  const editOperation = (op: LinkedOperation) => {
    if (!window.confirm("Tem certeza que deseja editar esta operação vinculada?")) return;
    const nextStatus = window.prompt("Informe o status da operação:", op.status)?.trim();
    if (!nextStatus) return;
    const nextNotes = window.prompt("Informe as observações da operação:", op.notes)?.trim() ?? op.notes;
    onSave({ ...op, status: nextStatus as LinkedOperation["status"], notes: nextNotes, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="view-stack">
      <div className="toolbar">
        <label className="field">
          <span>Filtro</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tipo, nota, fornecedor, status..." />
        </label>
        <ActionButton icon={Download} onClick={() => exportRows(filtered as unknown as Record<string, unknown>[], "operacoes-vinculadas")}>
          Exportar
        </ActionButton>
      </div>
      <section className="panel">
        <div className="panel-title">
          <Link2 size={20} />
          <h2>Operações Vinculadas</h2>
        </div>
        <div className="table-wrap">
          <OperationRows
            operations={filtered}
            actions={
              canEdit
                ? (op) => (
              <div className="row-actions">
                <button
                  className="icon-btn"
                  title="Finalizar"
                  onClick={() =>
                    window.confirm("Tem certeza que deseja finalizar esta operação vinculada?") &&
                    onSave({ ...op, status: "Finalizada", updatedAt: new Date().toISOString() })
                  }
                >
                  <CheckCircle2 size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Marcar pendência"
                  onClick={() =>
                    window.confirm("Tem certeza que deseja marcar esta operação como pendente?") &&
                    onSave({ ...op, status: "Pendente de conferência", updatedAt: new Date().toISOString() })
                  }
                >
                  <AlertTriangle size={16} />
                </button>
                <button
                  className="icon-btn"
                  title="Editar"
                  onClick={() => editOperation(op)}
                >
                  <Pencil size={16} />
                </button>
                <button className="icon-btn danger" title="Excluir" onClick={() => window.confirm("Tem certeza que deseja excluir esta operação vinculada?") && onDelete(op.id)}>
                  <X size={16} />
                </button>
              </div>
                )
                : undefined
            }
          />
        </div>
      </section>
    </div>
  );
}

function SearchView({ invoices }: { invoices: Invoice[]; operations: LinkedOperation[] }) {
  const [query, setQuery] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const rows = invoices
    .filter((invoice) => searchMatches(invoiceSearchText(invoice), query))
    .filter((invoice) => withinDateRange(invoiceDate(invoice), dateStart, dateEnd));

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="toolbar">
          <div className="filters">
            <label className="field wide">
              <span>Consulta fiscal avançada</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Período, tipo, cliente, fornecedor, CNPJ, NCM, CFOP, chave, status..." />
            </label>
            <label className="field">
              <span>Data inicial</span>
              <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} />
            </label>
            <label className="field">
              <span>Data final</span>
              <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <InvoiceRows invoices={rows} />
        </div>
      </section>
    </div>
  );
}

type ConferenceIssue = {
  invoice: Invoice;
  reason: string;
};

function ConferenceView({ invoices, onOpen }: { invoices: Invoice[]; onOpen: (invoice: Invoice) => void }) {
  const financialInvoices = invoices.filter(invoiceHasFinancialEffect);
  const missingCostCenter: ConferenceIssue[] = financialInvoices
    .filter((invoice) => !hasInvoiceCostCenter(invoice))
    .map((invoice) => ({ invoice, reason: "Sem centro de custo informado" }));
  const missingCfop: ConferenceIssue[] = invoices
    .filter((invoice) => !cfopIsConfigured(invoice))
    .map((invoice) => ({ invoice, reason: "CFOP ausente ou não cadastrado" }));
  const missingLinks: ConferenceIssue[] = invoices
    .filter((invoice) => invoiceNeedsLink(invoice) && !invoiceHasLinkReference(invoice))
    .map((invoice) => ({ invoice, reason: "Operação exige vínculo com outra nota" }));
  const missingHolder: ConferenceIssue[] = financialInvoices
    .filter((invoice) => !invoiceHasHolder(invoice))
    .map((invoice) => ({ invoice, reason: "Parcela sem portador informado" }));
  const sections = [
    { title: "Notas sem centro de custo", items: missingCostCenter, tone: "warn" as const },
    { title: "Notas sem CFOP configurado", items: missingCfop, tone: "danger" as const },
    { title: "Notas sem vínculo necessário", items: missingLinks, tone: "warn" as const },
    { title: "Lançamentos sem portador", items: missingHolder, tone: "danger" as const },
  ];

  return (
    <div className="view-stack">
      <section className="stats-grid">
        {sections.map((section) => (
          <StatCard key={section.title} title={section.title} value={String(section.items.length)} tone={section.tone} />
        ))}
      </section>

      <section className="conference-grid">
        {sections.map((section) => (
          <section className="panel conference-panel" key={section.title}>
            <div className="panel-title between">
              <h2>{section.title}</h2>
              <Badge value={section.items.length ? "Pendente" : "Conferido"} />
            </div>
            <div className="table-wrap conference-table">
              <table className="static-table">
                <thead>
                  <tr>
                    <th>N° nota</th>
                    <th>Data</th>
                    <th>Cliente/fornecedor</th>
                    <th>CFOP</th>
                    <th>Motivo</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map(({ invoice, reason }) => (
                    <tr key={`${section.title}-${invoice.id}`}>
                      <td>{normalizeNoteNumber(invoice.invoiceNumber) || "-"}</td>
                      <td>{formatDate(invoiceDate(invoice))}</td>
                      <td>{invoice.partyName || "-"}</td>
                      <td>{invoice.mainCfop || "-"}</td>
                      <td>{reason}</td>
                      <td>
                        <button className="icon-btn" type="button" title="Abrir lançamento" onClick={() => onOpen(invoice)}>
                          <Search size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!section.items.length && (
                    <tr>
                      <td colSpan={6}>Nenhuma pendência encontrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}

function TaxView({
  invoices,
  closedPeriods,
  onTogglePeriodLock,
}: {
  totals: ReturnType<typeof useFiscalStore>["totals"];
  invoices: Invoice[];
  closedPeriods: Record<string, string>;
  onTogglePeriodLock: (period: string, close: boolean) => void;
}) {
  const [period, setPeriod] = useState("2026-06");
  const [openBreakdown, setOpenBreakdown] = useState<string | null>(null);
  const closedAt = closedPeriods[period];
  const periodInvoices = invoices.filter((invoice) => {
    const date = invoice.invoiceType === "received" ? invoice.entryDate || invoice.issueDate : invoice.issueDate;
    return date?.slice(0, 7) === period;
  });
  const issuedTaxable = periodInvoices.filter(invoiceConsidersSale);
  const receivedTaxable = periodInvoices.filter(invoiceConsidersCost);
  const sumInvoices = (items: Invoice[], field: keyof Invoice) =>
    items.reduce((total, invoice) => total + Number(invoice[field] || 0), 0);
  const buildRows = (items: Invoice[], selector: (invoice: Invoice) => number): TaxBreakdownRow[] =>
    items
      .map((invoice) => ({
        invoiceNumber: normalizeNoteNumber(invoice.invoiceNumber),
        issueDate: invoice.issueDate,
        partyName: invoice.partyName,
        amount: selector(invoice),
      }))
      .filter((row) => Math.abs(row.amount) > 0.009);

  const issuedRevenue = sumInvoices(issuedTaxable, "totalInvoice");
  const receivedRevenue = sumInvoices(receivedTaxable, "totalInvoice");
  const issuedIcms = sumInvoices(issuedTaxable, "icmsValue");
  const receivedIcms = sumInvoices(receivedTaxable, "icmsCreditValue");
  const issuedPis = sumInvoices(issuedTaxable, "pisValue");
  const receivedPis = sumInvoices(receivedTaxable, "pisCreditValue");
  const issuedCofins = sumInvoices(issuedTaxable, "cofinsValue");
  const receivedCofins = sumInvoices(receivedTaxable, "cofinsCreditValue");
  const cfemBase = Math.max(issuedRevenue - issuedIcms - issuedPis - issuedCofins, 0);
  const cfemDue = cfemBase * (fiscalConfig.cfemRate / 100);
  const retainedInvoices = periodInvoices.filter((invoice) => invoice.retentionType === "Retenções de impostos" && Number(invoice.retentionValue || 0) > 0);
  const retainedTaxes = sumInvoices(retainedInvoices, "retentionValue");
  const breakdowns: Record<string, TaxBreakdownRow[]> = {
    issuedRevenue: buildRows(issuedTaxable, (invoice) => invoice.totalInvoice),
    receivedRevenue: buildRows(receivedTaxable, (invoice) => invoice.totalInvoice),
    cfemDue: buildRows(issuedTaxable, (invoice) => Math.max(invoice.totalInvoice - invoice.icmsValue - invoice.pisValue - invoice.cofinsValue, 0) * (fiscalConfig.cfemRate / 100)),
    issuedIcms: buildRows(issuedTaxable, (invoice) => invoice.icmsValue),
    receivedIcms: buildRows(receivedTaxable, (invoice) => invoice.icmsCreditValue),
    balanceIcms: [
      ...buildRows(issuedTaxable, (invoice) => invoice.icmsValue),
      ...buildRows(receivedTaxable, (invoice) => -invoice.icmsCreditValue),
    ],
    issuedPis: buildRows(issuedTaxable, (invoice) => invoice.pisValue),
    receivedPis: buildRows(receivedTaxable, (invoice) => invoice.pisCreditValue),
    balancePis: [
      ...buildRows(issuedTaxable, (invoice) => invoice.pisValue),
      ...buildRows(receivedTaxable, (invoice) => -invoice.pisCreditValue),
    ],
    issuedCofins: buildRows(issuedTaxable, (invoice) => invoice.cofinsValue),
    receivedCofins: buildRows(receivedTaxable, (invoice) => invoice.cofinsCreditValue),
    balanceCofins: [
      ...buildRows(issuedTaxable, (invoice) => invoice.cofinsValue),
      ...buildRows(receivedTaxable, (invoice) => -invoice.cofinsCreditValue),
    ],
    retainedTaxes: buildRows(retainedInvoices, (invoice) => invoice.retentionValue || 0),
  };
  const retainedByType = retainedInvoices.reduce<Record<string, number>>((groups, invoice) => {
    const label = invoice.retentionType || "Retenção";
    groups[label] = (groups[label] || 0) + Number(invoice.retentionValue || 0);
    return groups;
  }, {});
  const card = (
    key: string,
    title: string,
    value: number,
    tone: "default" | "good" | "warn" | "danger" | "info" = "default",
  ) => (
    <TaxStatCard
      key={key}
      title={title}
      value={value}
      tone={tone}
      rows={breakdowns[key] || []}
      isOpen={openBreakdown === key}
      onToggle={() => setOpenBreakdown(openBreakdown === key ? null : key)}
      onClose={() => setOpenBreakdown(null)}
    />
  );

  return (
    <div className="view-stack">
      <div className="toolbar">
        <div className="filters">
          <label className="field">
            <span>Período de apuração</span>
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          <div className={`period-lock-pill ${closedAt ? "closed" : "open"}`}>
            <Lock size={15} />
            {closedAt ? `Competência fechada em ${formatDate(closedAt)}` : "Competência aberta"}
          </div>
        </div>
        <div className="toolbar-actions">
          <ActionButton icon={Lock} variant={closedAt ? "ghost" : "primary"} onClick={() => onTogglePeriodLock(period, !closedAt)}>
            {closedAt ? "Desbloquear competência" : "Fechar competência"}
          </ActionButton>
          <ActionButton icon={RefreshCw} onClick={() => setPeriod("2026-06")}>
            Atualizar
          </ActionButton>
        </div>
      </div>

      <section className="tax-summary-grid">
        {card("issuedRevenue", "Receita tributável emitida", issuedRevenue, "good")}
        {card("receivedRevenue", "Receita tributável recebida", receivedRevenue)}
        {card("cfemDue", "CFEM a recolher", cfemDue, "warn")}
        {card("issuedIcms", "ICMS débito", issuedIcms, "danger")}
        {card("receivedIcms", "ICMS crédito", receivedIcms, "good")}
        {card("balanceIcms", "Saldo ICMS", issuedIcms - receivedIcms, "warn")}
        {card("issuedPis", "PIS débito", issuedPis, "danger")}
        {card("receivedPis", "PIS crédito", receivedPis, "good")}
        {card("balancePis", "Saldo PIS", issuedPis - receivedPis, "warn")}
        {card("issuedCofins", "COFINS débito", issuedCofins, "danger")}
        {card("receivedCofins", "COFINS crédito", receivedCofins, "good")}
        {card("balanceCofins", "Saldo COFINS", issuedCofins - receivedCofins, "warn")}
        {card("retainedTaxes", "Impostos retidos", retainedTaxes, "danger")}
      </section>

      <section className="tax-grid">
        <TaxDetailCard
          title="ICMS"
          issuedRevenue={issuedRevenue}
          receivedRevenue={receivedRevenue}
          debit={issuedIcms}
          credit={receivedIcms}
          balance={issuedIcms - receivedIcms}
        />
        <TaxDetailCard
          title="PIS"
          issuedRevenue={issuedRevenue}
          receivedRevenue={receivedRevenue}
          debit={issuedPis}
          credit={receivedPis}
          balance={issuedPis - receivedPis}
        />
        <TaxDetailCard
          title="COFINS"
          issuedRevenue={issuedRevenue}
          receivedRevenue={receivedRevenue}
          debit={issuedCofins}
          credit={receivedCofins}
          balance={issuedCofins - receivedCofins}
        />
        <section className="panel tax-detail-card">
          <h2>CFEM</h2>
          <p className="summary-line">Receita tributável emitida: {formatCurrency(issuedRevenue)}</p>
          <p className="summary-line">Base CFEM: {formatCurrency(cfemBase)}</p>
          <p className="summary-line">Alíquota CFEM: {fiscalConfig.cfemRate}%</p>
          <p className="summary-line">Valor a recolher: {formatCurrency(cfemDue)}</p>
        </section>
        <section className="panel tax-detail-card">
          <h2>Impostos retidos</h2>
          <p className="summary-line">Total retido no período: {formatCurrency(retainedTaxes)}</p>
          <p className="summary-line">Notas com retenção: {retainedInvoices.length}</p>
          {Object.entries(retainedByType).map(([label, value]) => (
            <p className="summary-line" key={label}>
              {label}: {formatCurrency(value)}
            </p>
          ))}
        </section>
      </section>
    </div>
  );
}

function TaxDetailCard({
  title,
  issuedRevenue,
  receivedRevenue,
  debit,
  credit,
  balance,
}: {
  title: string;
  issuedRevenue: number;
  receivedRevenue: number;
  debit: number;
  credit: number;
  balance: number;
}) {
  return (
    <section className="panel tax-detail-card">
      <h2>{title}</h2>
      <p className="summary-line">Receita tributável emitida: {formatCurrency(issuedRevenue)}</p>
      <p className="summary-line">Receita tributável recebida: {formatCurrency(receivedRevenue)}</p>
      <p className="summary-line">Débito: {formatCurrency(debit)}</p>
      <p className="summary-line">Crédito: {formatCurrency(credit)}</p>
      <p className="summary-line">Saldo: {formatCurrency(balance)}</p>
    </section>
  );
}

function ClosuresView({
  invoices,
  closedPeriods,
  onTogglePeriodLock,
}: {
  invoices: Invoice[];
  closedPeriods: Record<string, string>;
  onTogglePeriodLock: (period: string, close: boolean) => void;
}) {
  const today = todayIso();
  const currentPeriod = today.slice(0, 7);
  const [period, setPeriod] = useState(currentPeriod);
  const periods = Array.from(new Set([
    currentPeriod,
    ...invoices.map(invoicePeriodKey).filter(Boolean),
    ...Object.keys(closedPeriods || {}),
  ])).sort((a, b) => b.localeCompare(a));
  const periodInvoices = invoices.filter((invoice) => invoicePeriodKey(invoice) === period);
  const closedAt = closedPeriods?.[period];
  const financialInvoices = periodInvoices.filter(invoiceHasFinancialEffect);
  const pendingCostCenter = financialInvoices.filter((invoice) => !hasInvoiceCostCenter(invoice)).length;
  const pendingCfop = periodInvoices.filter((invoice) => !cfopIsConfigured(invoice)).length;
  const pendingLinks = periodInvoices.filter((invoice) => invoiceNeedsLink(invoice) && !invoiceHasLinkReference(invoice)).length;
  const pendingHolders = periodInvoices.filter((invoice) =>
    invoiceInstallments(invoice).some((installment) => !installment.holder),
  ).length;
  const pendingTotal = pendingCostCenter + pendingCfop + pendingLinks + pendingHolders;

  return (
    <div className="view-stack">
      <section className="toolbar">
        <div className="filters">
          <label className="field">
            <span>Competência</span>
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          <label className="field">
            <span>Status</span>
            <input value={closedAt ? `Fechada em ${formatDate(closedAt)}` : "Aberta"} readOnly />
          </label>
        </div>
        <div className="toolbar-actions">
          <ActionButton icon={Lock} variant={closedAt ? "ghost" : "primary"} onClick={() => onTogglePeriodLock(period, !closedAt)}>
            {closedAt ? "Desbloquear mês" : "Fechar mês"}
          </ActionButton>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard title="Notas no período" value={String(periodInvoices.length)} tone="info" />
        <StatCard title="Pendências de conferência" value={String(pendingTotal)} tone={pendingTotal ? "warn" : "good"} />
        <StatCard title="Notas sem centro de custo" value={String(pendingCostCenter)} tone={pendingCostCenter ? "warn" : "good"} />
        <StatCard title="CFOP sem configuração" value={String(pendingCfop)} tone={pendingCfop ? "warn" : "good"} />
        <StatCard title="Vínculos pendentes" value={String(pendingLinks)} tone={pendingLinks ? "warn" : "good"} />
        <StatCard title="Lançamentos sem portador" value={String(pendingHolders)} tone={pendingHolders ? "warn" : "good"} />
      </section>

      <section className="panel">
        <h2>Competências</h2>
        <div className="table-wrap">
          <table className="static-table">
            <thead>
              <tr>
                <th>Competência</th>
                <th>Status</th>
                <th>Notas</th>
                <th>Pendências</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((item) => {
                const rows = invoices.filter((invoice) => invoicePeriodKey(invoice) === item);
                const pending =
                  rows.filter(invoiceHasFinancialEffect).filter((invoice) => !hasInvoiceCostCenter(invoice)).length +
                  rows.filter((invoice) => !cfopIsConfigured(invoice)).length +
                  rows.filter((invoice) => invoiceNeedsLink(invoice) && !invoiceHasLinkReference(invoice)).length +
                  rows.filter((invoice) => invoiceInstallments(invoice).some((installment) => !installment.holder)).length;
                const itemClosedAt = closedPeriods?.[item];
                return (
                  <tr key={item}>
                    <td>{periodLabel(item)}</td>
                    <td><Badge value={itemClosedAt ? "Fechada" : "Aberta"} /></td>
                    <td>{rows.length}</td>
                    <td>{pending}</td>
                    <td>
                      <button className="btn ghost" type="button" onClick={() => onTogglePeriodLock(item, !itemClosedAt)}>
                        {itemClosedAt ? "Desbloquear" : "Fechar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FinancialView({
  invoices,
  onSave,
  onDelete,
  onOpenInvoice,
  bankBalanceValue,
  onBankBalanceSave,
  mode = "normal",
}: {
  invoices: Invoice[];
  onSave: (invoice: Invoice) => boolean | void;
  onDelete: (id: string) => void;
  onOpenInvoice: (invoice: Invoice) => void;
  bankBalanceValue: number;
  onBankBalanceSave: (value: number) => void;
  mode?: "normal" | "pf";
}) {
  const today = todayIso();
  const [startDate, setStartDate] = useState(today.slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState(today);
  const [listType, setListType] = useState<"all" | "receivable" | "payable">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("open");
  const [holderFilter, setHolderFilter] = useState("all");
  const [bankBalance, setBankBalance] = useState(() => formatCurrency(bankBalanceValue));
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [financialNotes, setFinancialNotes] = useState<Record<string, string>>({});
  const [settlementEntry, setSettlementEntry] = useState<FinancialEntry | null>(null);
  const [settlementHolder, setSettlementHolder] = useState("Itaú");
  const [settlementDiscount, setSettlementDiscount] = useState("R$ 0,00");
  const [settlementAddition, setSettlementAddition] = useState("R$ 0,00");
  useEffect(() => {
    setBankBalance(formatCurrency(bankBalanceValue));
  }, [bankBalanceValue]);
  const addDays = (days: number) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const byPeriod = (invoice: Invoice) => {
    const dueDate = invoice.dueDate || invoice.issueDate;
    return (!startDate || dueDate >= startDate) && (!endDate || dueDate <= endDate);
  };
  type FinancialEntry = {
    id: string;
    invoice: Invoice;
    installment: PaymentInstallment;
    kind: "receivable" | "payable";
    position: number;
    totalInstallments: number;
  };
  const entryAmount = (entry: FinancialEntry) =>
    mode === "pf" ? Number(entry.installment.pfValue || 0) : Number(entry.installment.amount || 0);
  const entryPaid = (entry: FinancialEntry) =>
    mode === "pf" ? Boolean(entry.installment.pfPaid) : Boolean(entry.installment.paid);
  const entryPaymentDate = (entry: FinancialEntry) =>
    mode === "pf" ? entry.installment.pfPaymentDate : entry.installment.paymentDate;
  const entryNotes = (entry: FinancialEntry) =>
    mode === "pf" ? entry.installment.pfNotes || entry.installment.notes : entry.installment.notes;
  const entryConciled = (entry: FinancialEntry) =>
    mode === "pf" ? Boolean(entry.installment.pfConciled) : Boolean(entry.installment.conciled);
  const entryHolder = (entry: FinancialEntry) =>
    mode === "pf" ? entry.installment.pfHolder || entry.installment.holder || "Itaú" : entry.installment.holder || "Itaú";
  const allEntries = invoices.flatMap((invoice) => {
    const kind: FinancialEntry["kind"] | null = billFinancialKind(invoice) || (invoiceConsidersSale(invoice)
      ? "receivable"
      : invoiceConsidersCost(invoice)
        ? "payable"
        : null);
    if (!kind) return [];
    const installments = invoiceInstallments(invoice);
    return installments
      .map((installment, index) => ({
        id: `${invoice.id}_${installment.id}_${mode}`,
        invoice,
        installment,
        kind,
        position: index + 1,
        totalInstallments: installments.length,
      }))
      .filter((entry) => entryAmount(entry) > 0);
  });
  const byEntryPeriod = (entry: FinancialEntry) =>
    (!startDate || entry.installment.dueDate >= startDate) && (!endDate || entry.installment.dueDate <= endDate);
  const byEntryStatus = (entry: FinancialEntry) => {
    if (statusFilter === "paid") return entryPaid(entry);
    if (statusFilter === "open") return !entryPaid(entry);
    return true;
  };
  const byEntryHolder = (entry: FinancialEntry) =>
    holderFilter === "all" || entryHolder(entry) === holderFilter;
  const byDueDate = (a: FinancialEntry, b: FinancialEntry) =>
    a.installment.dueDate.localeCompare(b.installment.dueDate) ||
    a.invoice.partyName.localeCompare(b.invoice.partyName) ||
    a.invoice.invoiceNumber.localeCompare(b.invoice.invoiceNumber);
  const payables = allEntries.filter((entry) => entry.kind === "payable" && byEntryStatus(entry) && byEntryPeriod(entry) && byEntryHolder(entry)).sort(byDueDate);
  const receivables = allEntries.filter((entry) => entry.kind === "receivable" && byEntryStatus(entry) && byEntryPeriod(entry) && byEntryHolder(entry)).sort(byDueDate);
  const openPayables = allEntries.filter((entry) => entry.kind === "payable" && !entryPaid(entry) && byEntryPeriod(entry) && byEntryHolder(entry)).sort(byDueDate);
  const openReceivables = allEntries.filter((entry) => entry.kind === "receivable" && !entryPaid(entry) && byEntryPeriod(entry) && byEntryHolder(entry)).sort(byDueDate);
  const inRange = (entry: FinancialEntry, days: number) => {
    const dueDate = entry.installment.dueDate;
    return dueDate >= today && dueDate <= addDays(days);
  };
  const sumTotal = (items: FinancialEntry[]) => items.reduce((total, entry) => total + entryAmount(entry), 0);
  const flowParts = (days: number) => ({
    receive: sumTotal(openReceivables.filter((invoice) => inRange(invoice, days))),
    pay: sumTotal(openPayables.filter((invoice) => inRange(invoice, days))),
  });
  const flow30Parts = flowParts(30);
  const flow60Parts = flowParts(60);
  const flow90Parts = flowParts(90);
  const currentBankBalance = cleanNumber(bankBalance);
  const flow30 = currentBankBalance + flow30Parts.receive - flow30Parts.pay;
  const flow60 = currentBankBalance + flow60Parts.receive - flow60Parts.pay;
  const flow90 = currentBankBalance + flow90Parts.receive - flow90Parts.pay;
  const receiveFlowChart = [
    { name: "Saldo atual", value: chartValue(currentBankBalance), color: "#2563eb" },
    { name: "30 dias", value: chartValue(flow30Parts.receive), color: "#16a34a" },
    { name: "60 dias", value: chartValue(flow60Parts.receive - flow30Parts.receive), color: "#22c55e" },
    { name: "90 dias", value: chartValue(flow90Parts.receive - flow60Parts.receive), color: "#86efac" },
  ];
  const payFlowChart = [
    { name: "Saldo atual", value: chartValue(currentBankBalance), color: "#2563eb" },
    { name: "30 dias", value: chartValue(flow30Parts.pay), color: "#dc2626" },
    { name: "60 dias", value: chartValue(flow60Parts.pay - flow30Parts.pay), color: "#f97316" },
    { name: "90 dias", value: chartValue(flow90Parts.pay - flow60Parts.pay), color: "#fdba74" },
  ];
  const visiblePayables = listType === "receivable" ? [] : payables;
  const visibleReceivables = listType === "payable" ? [] : receivables;
  const updateInstallment = (entry: FinancialEntry, changes: Partial<PaymentInstallment>) => {
    const installments = invoiceInstallments(entry.invoice).map((installment) =>
      installment.id === entry.installment.id ? { ...installment, ...changes } : installment,
    );
    const firstInstallment = installments[0];
    onSave({
      ...entry.invoice,
      financialInstallments: installments,
      paid: installments.every((installment) => installment.paid),
      paymentDate: installments.every((installment) => installment.paid) ? changes.paymentDate || entry.invoice.paymentDate : "",
      dueDate: firstInstallment?.dueDate || entry.invoice.dueDate,
      paymentCondition: firstInstallment?.paymentCondition || entry.invoice.paymentCondition,
      paymentMethod: firstInstallment?.paymentMethod || entry.invoice.paymentMethod,
      pfValue: installments.reduce((total, installment) => total + Number(installment.pfValue || 0), 0),
      updatedAt: new Date().toISOString(),
    });
  };
  const openSettlement = (entry: FinancialEntry) => {
    setPaymentDates((current) => ({ ...current, [entry.id]: current[entry.id] || entryPaymentDate(entry) || today }));
    setFinancialNotes((current) => ({ ...current, [entry.id]: current[entry.id] ?? entryNotes(entry) ?? "" }));
    setSettlementHolder(entryHolder(entry));
    setSettlementDiscount(formatCurrency(mode === "pf" ? entry.installment.pfDiscountValue || 0 : entry.installment.discountValue || 0));
    setSettlementAddition(formatCurrency(mode === "pf" ? entry.installment.pfAdditionValue || 0 : entry.installment.additionValue || 0));
    setSettlementEntry(entry);
  };
  const saveSettlement = (entry: FinancialEntry) => {
    const paymentDate = paymentDates[entry.id] || today;
    const notes = financialNotes[entry.id] ?? entryNotes(entry) ?? "";
    const discountValue = cleanNumber(settlementDiscount);
    const additionValue = cleanNumber(settlementAddition);
    const settledValue = Math.max(entryAmount(entry) - discountValue + additionValue, 0);
    if (!window.confirm(`Confirmar ${entry.kind === "receivable" ? "recebimento" : "pagamento"} deste lançamento?`)) return;
    updateInstallment(entry, mode === "pf"
      ? {
          pfPaid: true,
          pfPaymentDate: paymentDate,
          pfNotes: notes,
          pfDiscountValue: discountValue,
          pfAdditionValue: additionValue,
          pfSettledValue: settledValue,
          pfHolder: settlementHolder,
        }
      : {
          paid: true,
          paymentDate,
          notes,
          discountValue,
          additionValue,
          settledValue,
          holder: settlementHolder,
        });
    setSettlementEntry(null);
  };
  const reopenPayment = (entry: FinancialEntry) => {
    if (window.confirm("Tem certeza que deseja remover o pagamento deste lançamento?")) {
      updateInstallment(entry, mode === "pf"
        ? {
            pfPaid: false,
            pfPaymentDate: "",
            pfConciled: false,
            pfNotes: financialNotes[entry.id] ?? entryNotes(entry),
          }
        : {
            paid: false,
            paymentDate: "",
            conciled: false,
            notes: financialNotes[entry.id] ?? entryNotes(entry),
          });
    }
  };
  const saveFinancialNote = (entry: FinancialEntry) => {
    const note = financialNotes[entry.id] ?? entryNotes(entry) ?? "";
    if (note !== (entryNotes(entry) || "")) {
      updateInstallment(entry, mode === "pf" ? { pfNotes: note } : { notes: note });
    }
  };
  const toggleConciled = (entry: FinancialEntry) => {
    updateInstallment(entry, mode === "pf" ? { pfConciled: !entryConciled(entry) } : { conciled: !entryConciled(entry) });
  };
  const renderRows = (items: FinancialEntry[], partyLabel: string) => (
    <div className="financial-table-scroll">
      <table className="static-table financial-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Categorias financeiras</th>
            <th>{partyLabel}</th>
            <th>Nota fiscal</th>
            <th>Observações / Descrição</th>
            <th>Parcela</th>
            <th>Valor (R$)</th>
            <th>Pago</th>
            <th>Conciliado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => {
            const amount = entryAmount(entry);
            const rowTone = entry.kind === "payable" ? "finance-row-payable" : "finance-row-receivable";
            const description = entryNotes(entry) || entry.invoice.additionalInfo || entry.invoice.items?.[0]?.description || "-";
            return (
            <tr key={entry.id} className={rowTone}>
              <td>{formatDate(entry.installment.dueDate)}</td>
              <td>{entry.invoice.category || entry.invoice.costCenter || entry.invoice.items?.[0]?.category || "-"}</td>
              <td>{entry.invoice.partyName}</td>
              <td>{entry.invoice.invoiceNumber || "-"}</td>
              <td>{description}</td>
              <td>{entry.position}/{entry.totalInstallments}</td>
              <td className={entry.kind === "payable" ? "money-negative" : "money-positive"}>{formatCurrency(amount)}</td>
              <td>
                <input type="checkbox" checked={entryPaid(entry)} onChange={() => (entryPaid(entry) ? reopenPayment(entry) : openSettlement(entry))} />
              </td>
              <td>
                <input type="checkbox" checked={entryConciled(entry)} onChange={() => toggleConciled(entry)} />
              </td>
              <td>
                <details className="row-menu">
                  <summary title="Ações"><MoreVertical size={16} /></summary>
                  <button type="button" onClick={() => onOpenInvoice(entry.invoice)}>Visualizar</button>
                  <button type="button" onClick={() => onOpenInvoice(entry.invoice)}>Editar</button>
                  <button type="button" onClick={() => window.confirm("Tem certeza que deseja excluir este lançamento?") && onDelete(entry.invoice.id)}>Excluir</button>
                </details>
              </td>
            </tr>
            );
          })}
          {!items.length && (
            <tr>
              <td colSpan={10}>Nenhum lançamento no período.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="view-stack">
      <section className="toolbar">
        <div className="filters">
          <label className="field">
            <span>Data inicial</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Data final</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select value={listType} onChange={(event) => setListType(event.target.value as typeof listType)}>
              <option value="all">A receber e a pagar</option>
              <option value="receivable">A receber</option>
              <option value="payable">A pagar</option>
            </select>
          </label>
          <label className="field">
            <span>Situação</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Todos</option>
              <option value="open">Em aberto</option>
              <option value="paid">Pagos</option>
            </select>
          </label>
          <label className="field">
            <span>Portador</span>
            <select value={holderFilter} onChange={(event) => setHolderFilter(event.target.value)}>
              <option value="all">Todos</option>
              {configuredHolders().map((holder) => (
                <option key={holder} value={holder}>{holder}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="stats-grid">
        <StatCard title={mode === "pf" ? "Total PF a receber" : "Total contas a receber"} value={formatCurrency(sumTotal(openReceivables))} tone="good" />
        <StatCard title={mode === "pf" ? "Total PF a pagar" : "Total contas a pagar"} value={formatCurrency(sumTotal(openPayables))} tone="danger" />
        <section className="stat info bank-balance-card">
          <span>Saldo bancário atual</span>
          <input
            value={bankBalance}
            onChange={(event) => {
              setBankBalance(event.target.value);
            }}
            onBlur={(event) => {
              const value = cleanNumber(event.target.value);
              const formatted = formatCurrency(value);
              setBankBalance(formatted);
              onBankBalanceSave(value);
            }}
            placeholder="R$ 0,00"
          />
        </section>
        <StatCard title="Fluxo 30 dias" value={formatCurrency(flow30)} tone={flow30 >= 0 ? "good" : "danger"} />
        <StatCard title="Fluxo 60 dias" value={formatCurrency(flow60)} tone={flow60 >= 0 ? "good" : "danger"} />
        <StatCard title="Fluxo 90 dias" value={formatCurrency(flow90)} tone={flow90 >= 0 ? "good" : "danger"} />
      </section>
      <section className="split-grid">
        {!!visibleReceivables.length || listType !== "payable" ? <section className="panel financial-list-panel">
          <h2>Contas a receber</h2>
          {renderRows(visibleReceivables, "Cliente")}
        </section> : null}
        {!!visiblePayables.length || listType !== "receivable" ? <section className="panel financial-list-panel">
          <h2>Contas a pagar</h2>
          {renderRows(visiblePayables, "Fornecedor")}
        </section> : null}
      </section>
      <section className="split-grid">
        <FinancePie title="Fluxo a receber" data={receiveFlowChart} />
        <FinancePie title="Fluxo a pagar" data={payFlowChart} />
      </section>
      {settlementEntry && (
        <div className="modal-backdrop">
          <section className="settlement-modal">
            <h2>{settlementEntry.kind === "receivable" ? "Recebimento" : "Pagamento"}</h2>
            <div className="settlement-grid">
              <label className="field">
                <span>Vencimento *</span>
                <input type="date" value={settlementEntry.installment.dueDate} readOnly />
              </label>
              <label className="field">
                <span>Valor (R$)</span>
                <input value={formatCurrency(entryAmount(settlementEntry))} readOnly />
              </label>
              <label className="field wide">
                <span>Observações</span>
                <input
                  maxLength={100}
                  value={financialNotes[settlementEntry.id] ?? entryNotes(settlementEntry) ?? ""}
                  onChange={(event) => setFinancialNotes((current) => ({ ...current, [settlementEntry.id]: event.target.value }))}
                />
              </label>
              <label className="switch-line wide">
                <input type="checkbox" checked readOnly />
                {settlementEntry.kind === "receivable" ? "Recebido" : "Pago"}
              </label>
              <label className="field">
                <span>{settlementEntry.kind === "receivable" ? "Recebimento" : "Pagamento"}</span>
                <input
                  type="date"
                  value={paymentDates[settlementEntry.id] || entryPaymentDate(settlementEntry) || today}
                  onChange={(event) => setPaymentDates((current) => ({ ...current, [settlementEntry.id]: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>Conta bancária</span>
                <select value={settlementHolder} onChange={(event) => setSettlementHolder(event.target.value)}>
                  {configuredHolders().map((holder) => (
                    <option key={holder} value={holder}>{holder}</option>
                  ))}
                </select>
              </label>
              <MoneyField label="Descontos (R$)" name="settlementDiscount" defaultValue={settlementDiscount} onChangeValue={setSettlementDiscount} />
              <MoneyField label="Acréscimos (R$)" name="settlementAddition" defaultValue={settlementAddition} onChangeValue={setSettlementAddition} />
              <label className="field wide settlement-total">
                <span>Valor (R$)</span>
                <input value={formatCurrency(Math.max(entryAmount(settlementEntry) - cleanNumber(settlementDiscount) + cleanNumber(settlementAddition), 0))} readOnly />
              </label>
            </div>
            <div className="form-actions inline settlement-actions">
              <button className="btn ghost" type="button" onClick={() => setSettlementEntry(null)}>Cancelar</button>
              <ActionButton icon={Save} onClick={() => saveSettlement(settlementEntry)}>Salvar</ActionButton>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const checkStatusLabel = (status: CheckStatus) => {
  if (status === "received") return "Recebido";
  if (status === "holding") return "Em posse";
  if (status === "passed") return "Repassado";
  return "Devolvido";
};

function ChecksView({
  checks,
  onSave,
  onDelete,
}: {
  checks: CheckItem[];
  onSave: (check: CheckItem) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"received" | "holding" | "passed">("holding");
  const [selectedId, setSelectedId] = useState<string>("");
  const [editingCheck, setEditingCheck] = useState<CheckItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [passFormOpen, setPassFormOpen] = useState(false);
  const sortedChecks = [...checks].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const selectedCheck = sortedChecks.find((check) => check.id === selectedId) || sortedChecks[0];
  const receivedChecks = sortedChecks.filter((check) => check.status === "received" || check.status === "returned");
  const holdingChecks = sortedChecks.filter((check) => check.status === "holding");
  const passedChecks = sortedChecks.filter((check) => check.status === "passed");
  const filteredChecks = filter === "received" ? receivedChecks : filter === "holding" ? holdingChecks : passedChecks;
  const totalInChecks = sortedChecks
    .filter((check) => check.status !== "passed")
    .reduce((total, check) => total + Number(check.amount || 0), 0);

  const startNew = () => {
    setEditingCheck(null);
    setShowForm(true);
    setPassFormOpen(false);
  };

  const editCheck = (check: CheckItem) => {
    if (!window.confirm("Tem certeza que deseja alterar este cheque?")) return;
    setEditingCheck(check);
    setShowForm(true);
    setPassFormOpen(false);
  };

  const saveCheck = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const receivedDate = String(form.get("receivedDate") || todayIso());
    const currentStatus = editingCheck?.status || "holding";
    const receivedMovement = {
      type: "received" as const,
      date: receivedDate,
      partyName: String(form.get("receivedFrom") || ""),
      notes: "Cheque recebido",
    };
    const holdingMovement = {
      type: "holding" as const,
      date: receivedDate,
      partyName: "MSG Mineração",
      notes: "Cheque em posse",
    };
    const previousMovements = editingCheck?.movements?.length ? editingCheck.movements : [receivedMovement, holdingMovement];

    const check: CheckItem = {
      id: editingCheck?.id || newId("check"),
      checkNumber: String(form.get("checkNumber") || ""),
      amount: cleanNumber(form.get("amount")),
      issuerName: String(form.get("issuerName") || ""),
      issuerDocument: String(form.get("issuerDocument") || ""),
      bank: String(form.get("bank") || ""),
      agency: String(form.get("agency") || ""),
      account: String(form.get("account") || ""),
      dueDate: String(form.get("dueDate") || todayIso()),
      receivedDate,
      receivedFrom: String(form.get("receivedFrom") || ""),
      passedDate: editingCheck?.passedDate,
      passedTo: editingCheck?.passedTo,
      relatedInvoices: String(form.get("relatedInvoices") || "")
        .split(",")
        .map((item) => normalizeNoteNumber(item.trim()) || item.trim())
        .filter(Boolean),
      notes: String(form.get("notes") || ""),
      status: currentStatus,
      movements: previousMovements,
      createdAt: editingCheck?.createdAt || now,
      updatedAt: now,
    };

    onSave(check);
    setSelectedId(check.id);
    setShowForm(false);
    setEditingCheck(null);
  };

  const updateCheckStatus = (check: CheckItem, status: CheckStatus, movement: CheckItem["movements"][number], patch: Partial<CheckItem> = {}) => {
    const filteredMovements = (check.movements || []).filter((item) => item.type !== movement.type);
    const next = {
      ...check,
      ...patch,
      status,
      movements: [...filteredMovements, movement],
      updatedAt: new Date().toISOString(),
    };
    onSave(next);
    setSelectedId(next.id);
  };

  const markHolding = (check: CheckItem) => {
    if (!window.confirm("Confirmar que este cheque voltou/ficou em posse da empresa?")) return;
    updateCheckStatus(check, "holding", {
      type: "holding",
      date: todayIso(),
      partyName: "MSG Mineração",
      notes: "Cheque em posse",
    });
  };

  const markReturned = (check: CheckItem) => {
    const notes = window.prompt("Informe o motivo da devolução:", "Rasura ou falta de saldo") || "";
    if (!window.confirm("Confirmar cheque devolvido? Ele voltará para recebidos em vermelho.")) return;
    updateCheckStatus(check, "returned", {
      type: "returned",
      date: todayIso(),
      partyName: "Banco",
      notes,
    }, { passedDate: undefined, passedTo: undefined });
    setFilter("received");
  };

  const passCheck = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCheck) return;
    const form = new FormData(event.currentTarget);
    const passedTo = String(form.get("passedTo") || "");
    if (!passedTo.trim()) {
      window.alert("Informe para quem o cheque será repassado.");
      return;
    }
    if (!window.confirm("Confirmar repasse deste cheque?")) return;
    const passedDate = String(form.get("passedDate") || todayIso());
    const relatedInvoices = String(form.get("relatedInvoices") || "")
      .split(",")
      .map((item) => normalizeNoteNumber(item.trim()) || item.trim())
      .filter(Boolean);
    updateCheckStatus(selectedCheck, "passed", {
      type: "passed",
      date: passedDate,
      partyName: passedTo,
      notes: String(form.get("passNotes") || ""),
    }, { passedDate, passedTo, relatedInvoices });
    setPassFormOpen(false);
    setFilter("passed");
  };

  const timeline = selectedCheck?.movements?.length
    ? selectedCheck.movements.filter((movement) => ["received", "holding", "passed"].includes(movement.type))
    : [];

  return (
    <div className="view-stack checks-view">
      <section className="stats-grid">
        <StatCard title="Total em cheques" value={formatCurrency(totalInChecks)} tone="info" />
        <StatCard title="Recebidos pendentes" value={String(receivedChecks.length)} tone="danger" />
        <StatCard title="Em posse" value={String(holdingChecks.length)} tone="good" />
        <StatCard title="Repassados" value={String(passedChecks.length)} tone="warn" />
      </section>

      <section className="panel">
        <div className="panel-title between">
          <div>
            <h2>Controle de cheques</h2>
            <p className="muted">Recebimento, posse, repasse e devolução de cheques.</p>
          </div>
          <ActionButton icon={Plus} onClick={startNew}>Novo cheque recebido</ActionButton>
        </div>
        <div className="check-tabs">
          <button className={filter === "received" ? "active" : ""} type="button" onClick={() => setFilter("received")}>Recebidos</button>
          <button className={filter === "holding" ? "active" : ""} type="button" onClick={() => setFilter("holding")}>Em posse</button>
          <button className={filter === "passed" ? "active" : ""} type="button" onClick={() => setFilter("passed")}>Repassados</button>
        </div>
      </section>

      {showForm && (
        <section className="panel">
          <div className="panel-title between">
            <h2>{editingCheck ? "Alterar cheque" : "Novo cheque recebido"}</h2>
            <ActionButton icon={X} variant="ghost" onClick={() => { setShowForm(false); setEditingCheck(null); }}>Cancelar</ActionButton>
          </div>
          <form className="view-stack" onSubmit={saveCheck}>
            <div className="form-grid">
              <Field label="N° do cheque" name="checkNumber" defaultValue={editingCheck?.checkNumber || ""} required sanitize="digits" />
              <MoneyField label="Valor do cheque" name="amount" defaultValue={formatCurrency(editingCheck?.amount || 0)} autoCalc />
              <Field label="Emitente" name="issuerName" defaultValue={editingCheck?.issuerName || ""} required />
              <Field label="CPF/CNPJ emitente" name="issuerDocument" defaultValue={editingCheck?.issuerDocument || ""} sanitize="cpfCnpj" />
              <Field label="Banco" name="bank" defaultValue={editingCheck?.bank || ""} />
              <Field label="Agência" name="agency" defaultValue={editingCheck?.agency || ""} />
              <Field label="Conta" name="account" defaultValue={editingCheck?.account || ""} />
              <Field label="Pré-datado para" name="dueDate" type="date" defaultValue={editingCheck?.dueDate || todayIso()} required />
              <Field label="Recebido em" name="receivedDate" type="date" defaultValue={editingCheck?.receivedDate || todayIso()} required />
              <Field label="Recebido de" name="receivedFrom" defaultValue={editingCheck?.receivedFrom || ""} required />
              <Field label="Notas relacionadas" name="relatedInvoices" defaultValue={(editingCheck?.relatedInvoices || []).join(", ")} placeholder="Ex.: 5574, 5575" />
              <label className="field wide">
                <span>Observação</span>
                <textarea name="notes" defaultValue={editingCheck?.notes || ""} placeholder="Livre" />
              </label>
            </div>
            <div className="form-actions">
              <ActionButton icon={Save} type="submit">Salvar cheque</ActionButton>
            </div>
          </form>
        </section>
      )}

      <section className="checks-layout">
        <section className="panel checks-list-panel">
          <h2>{filter === "received" ? "Cheques recebidos" : filter === "holding" ? "Cheques em posse" : "Cheques repassados"}</h2>
          <div className="checks-list">
            {filteredChecks.map((check) => (
              <button
                key={check.id}
                type="button"
                className={`check-card ${selectedCheck?.id === check.id ? "selected" : ""} ${check.status === "returned" ? "returned" : ""}`}
                onClick={() => setSelectedId(check.id)}
              >
                <div>
                  <strong>{formatCurrency(check.amount)}</strong>
                  <span>{check.issuerName}</span>
                  <small>Recebido em {formatDate(check.receivedDate)}</small>
                </div>
                <div>
                  <Badge value={checkStatusLabel(check.status)} />
                  <small>Pré-datado {formatDate(check.dueDate)}</small>
                </div>
              </button>
            ))}
            {!filteredChecks.length && <p className="muted">Nenhum cheque nessa situação.</p>}
          </div>
        </section>

        <section className="panel check-detail-panel">
          {selectedCheck ? (
            <>
              <div className="panel-title between">
                <div>
                  <h2>Detalhes do cheque</h2>
                  <p className="muted">Cheque N° {selectedCheck.checkNumber}</p>
                </div>
                <Badge value={checkStatusLabel(selectedCheck.status)} />
              </div>
              <div className={`check-value-box ${selectedCheck.status === "returned" ? "returned" : ""}`}>
                <span>Valor do cheque</span>
                <strong>{formatCurrency(selectedCheck.amount)}</strong>
              </div>
              <div className="detail-list">
                <p><span>Emitente</span><strong>{selectedCheck.issuerName}</strong></p>
                <p><span>CPF/CNPJ</span><strong>{selectedCheck.issuerDocument || "-"}</strong></p>
                <p><span>Banco</span><strong>{selectedCheck.bank || "-"}</strong></p>
                <p><span>Agência</span><strong>{selectedCheck.agency || "-"}</strong></p>
                <p><span>Conta</span><strong>{selectedCheck.account || "-"}</strong></p>
                <p><span>Pré-datado para</span><strong>{formatDate(selectedCheck.dueDate)}</strong></p>
                <p><span>Recebido de</span><strong>{selectedCheck.receivedFrom}</strong></p>
                <p><span>Notas relacionadas</span><strong>{selectedCheck.relatedInvoices.join(", ") || "-"}</strong></p>
                <p><span>Observação</span><strong>{selectedCheck.notes || "-"}</strong></p>
              </div>
              <div className="check-history">
                <h3>Histórico do cheque</h3>
                {timeline.map((movement) => (
                  <div className="check-history-row" key={`${movement.type}-${movement.date}`}>
                    <span className={movement.type}>{movement.type === "received" ? "Recebido" : movement.type === "holding" ? "Em posse" : "Repassado"}</span>
                    <strong>{movement.partyName}</strong>
                    <small>{formatDate(movement.date)} {movement.notes ? `- ${movement.notes}` : ""}</small>
                  </div>
                ))}
                {selectedCheck.status === "returned" && (
                  <div className="check-history-row returned">
                    <span>Devolvido</span>
                    <strong>Banco</strong>
                    <small>{selectedCheck.movements.find((movement) => movement.type === "returned")?.notes || "Cheque devolvido"}</small>
                  </div>
                )}
              </div>
              {passFormOpen ? (
                <form className="pass-check-form" onSubmit={passCheck}>
                  <div className="form-grid">
                    <Field label="Repassar para" name="passedTo" defaultValue={selectedCheck.passedTo || ""} required />
                    <Field label="Data do repasse" name="passedDate" type="date" defaultValue={selectedCheck.passedDate || todayIso()} required />
                    <Field label="Referente às notas" name="relatedInvoices" defaultValue={selectedCheck.relatedInvoices.join(", ")} placeholder="Ex.: 5574, 5575" />
                    <label className="field wide">
                      <span>Observação do repasse</span>
                      <textarea name="passNotes" defaultValue="" placeholder="Livre" />
                    </label>
                  </div>
                  <div className="form-actions">
                    <ActionButton icon={X} variant="ghost" onClick={() => setPassFormOpen(false)}>Cancelar</ActionButton>
                    <ActionButton icon={Save} type="submit">Confirmar repasse</ActionButton>
                  </div>
                </form>
              ) : (
                <div className="check-actions">
                  <ActionButton icon={Pencil} variant="ghost" onClick={() => editCheck(selectedCheck)}>Editar</ActionButton>
                  {selectedCheck.status !== "holding" && <ActionButton icon={CheckCircle2} onClick={() => markHolding(selectedCheck)}>Marcar em posse</ActionButton>}
                  {selectedCheck.status === "holding" && <ActionButton icon={Plus} onClick={() => setPassFormOpen(true)}>Repassar cheque</ActionButton>}
                  {selectedCheck.status !== "returned" && <ActionButton icon={AlertTriangle} variant="danger" onClick={() => markReturned(selectedCheck)}>Cheque devolvido</ActionButton>}
                  <button className="btn danger" type="button" onClick={() => window.confirm("Tem certeza que deseja excluir este cheque?") && onDelete(selectedCheck.id)}>
                    <X size={17} />
                    Excluir
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="muted">Selecione um cheque para ver os detalhes.</p>
          )}
        </section>
      </section>
    </div>
  );
}

function BillFormView({
  invoices,
  parties,
  onSave,
  onDelete,
  onAddParty,
}: {
  invoices: Invoice[];
  parties: Party[];
  onSave: (invoice: Invoice) => boolean | void;
  onDelete: (id: string) => void;
  onAddParty: (kind: Party["kind"]) => void;
}) {
  const [entryType, setEntryType] = useState<"payable" | "receivable">("payable");
  const [series, setSeries] = useState<"Fatura" | "Recibo">("Fatura");
  const [selectedParty, setSelectedParty] = useState<Party | undefined>();
  const [editingBill, setEditingBill] = useState<Invoice | null>(null);
  const [installmentIndexes, setInstallmentIndexes] = useState([0]);
  const [totalValue, setTotalValue] = useState("R$ 0,00");
  const [installmentsTotal, setInstallmentsTotal] = useState(0);
  const partyKind: Party["kind"] = entryType === "payable" ? "supplier" : "customer";
  const billInvoices = invoices
    .filter(isBillInvoice)
    .sort((a, b) => invoiceDate(b).localeCompare(invoiceDate(a)));

  useEffect(() => {
    if (selectedParty && selectedParty.kind !== partyKind) setSelectedParty(undefined);
  }, [partyKind, selectedParty]);

  const startNew = () => {
    setEditingBill(null);
    setEntryType("payable");
    setSeries("Fatura");
    setSelectedParty(undefined);
    setInstallmentIndexes([0]);
    setTotalValue("R$ 0,00");
    setInstallmentsTotal(0);
  };

  const editBill = (invoice: Invoice) => {
    if (!window.confirm("Tem certeza que deseja alterar esta fatura?")) return;
    const kind = billFinancialKind(invoice) || "payable";
    setEditingBill(invoice);
    setEntryType(kind);
    setSeries(invoice.natureOperation === "Recibo" ? "Recibo" : "Fatura");
    setSelectedParty(parties.find((party) => party.kind === (kind === "payable" ? "supplier" : "customer") && (party.name === invoice.partyName || party.cnpj === invoice.partyCnpj)));
    setInstallmentIndexes(invoiceInstallments(invoice).map((_, index) => index));
    setTotalValue(formatCurrency(invoice.totalInvoice || 0));
    setInstallmentsTotal(invoiceInstallments(invoice).reduce((total, installment) => total + installmentTotal(installment), 0));
  };

  const updateInstallmentSummary = (form: HTMLFormElement) => {
    const data = new FormData(form);
    setInstallmentsTotal(
      installmentIndexes.reduce((total, index) => total + cleanNumber(data.get(`installmentAmount_${index}`)) + cleanNumber(data.get(`installmentPfValue_${index}`)), 0),
    );
  };

  const submitBill = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingBill && !window.confirm("Tem certeza que deseja salvar a alteração desta fatura?")) return;
    if (!selectedParty) {
      window.alert(entryType === "payable" ? "Selecione um fornecedor cadastrado." : "Selecione um cliente cadastrado.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const amount = cleanNumber(form.get("totalInvoice"));
    const costCenter = String(form.get("costCenter") || "");
    const comment = String(form.get("comment") || "");
    const currentSeries = String(form.get("series") || series);
    const currentEntryType = String(form.get("entryType") || entryType) as "payable" | "receivable";
    const now = new Date().toISOString();
    const rawInstallments = installmentIndexes.map((index, position) => ({
      id: editingBill?.financialInstallments?.[position]?.id || `parcela_${position + 1}`,
      paymentCondition: String(form.get(`paymentCondition_${index}`) || "a prazo"),
      paymentMethod: String(form.get(`paymentMethod_${index}`) || "boleto"),
      holder: String(form.get(`holder_${index}`) || "Itaú"),
      dueDate: String(form.get(`dueDate_${index}`) || todayIso()),
      amount: cleanNumber(form.get(`installmentAmount_${index}`)),
      pfValue: cleanNumber(form.get(`installmentPfValue_${index}`)),
      paid: Boolean(editingBill?.financialInstallments?.[position]?.paid),
      paymentDate: editingBill?.financialInstallments?.[position]?.paymentDate || "",
      notes: editingBill?.financialInstallments?.[position]?.notes || "",
    }));
    const financialInstallments = rawInstallments.map((installment, index) => ({
      ...installment,
      amount: rawInstallments.length === 1 && installment.amount === 0 ? amount : installment.amount,
    }));
    const firstInstallment = financialInstallments[0];
    const invoiceType: InvoiceType = currentEntryType === "receivable" ? "issued" : "received";

    const invoice: Invoice = {
      id: editingBill?.id || newId("bill"),
      companyId: "msg",
      invoiceType,
      operationType: `${currentSeries} a ${currentEntryType === "receivable" ? "receber" : "pagar"}`,
      invoiceNumber: String(form.get("title") || ""),
      series: currentSeries,
      accessKey: "",
      issueDate: String(form.get("issueDate") || todayIso()),
      entryDate: invoiceType === "received" ? String(form.get("issueDate") || todayIso()) : undefined,
      exitDate: invoiceType === "issued" ? String(form.get("issueDate") || todayIso()) : undefined,
      partyName: selectedParty?.name || String(form.get("partyName") || ""),
      partyCnpj: selectedParty?.cnpj || String(form.get("partyCnpj") || ""),
      partyIe: selectedParty?.ie || "",
      city: selectedParty?.city || "",
      state: selectedParty?.state || "RS",
      natureOperation: currentSeries,
      mainCfop: "FATURA",
      purpose: "Normal",
      paymentCondition: firstInstallment?.paymentCondition || "",
      paymentMethod: firstInstallment?.paymentMethod || "",
      dueDate: firstInstallment?.dueDate || "",
      pfValue: financialInstallments.reduce((total, installment) => total + Number(installment.pfValue || 0), 0),
      carrierName: "",
      paymentDate: editingBill?.paymentDate || "",
      paid: Boolean(editingBill?.paid),
      status: "Faturada",
      category: "Fatura",
      costCenter,
      totalProducts: amount,
      freightValue: 0,
      totalInvoice: amount,
      icmsBase: 0,
      icmsValue: 0,
      icmsCreditValue: 0,
      pisBase: 0,
      pisValue: 0,
      pisCreditValue: 0,
      cofinsBase: 0,
      cofinsValue: 0,
      cofinsCreditValue: 0,
      cfemBase: 0,
      cfemRate: 0,
      cfemValue: 0,
      additionalInfo: comment,
      internalNotes: "",
      xmlFileName: "",
      pdfFileName: "",
      hasLinkedOperation: false,
      createdAt: editingBill?.createdAt || now,
      updatedAt: now,
      items: [
        {
          id: editingBill?.items?.[0]?.id || newId("item"),
          itemCode: "",
          description: comment || currentSeries,
          category: "Fatura",
          costCenter,
          ncm: "",
          cfop: "FATURA",
          cstIcms: "",
          unit: "SV",
          quantity: 1,
          unitValue: amount,
          totalValue: amount,
          icmsBase: 0,
          icmsRate: 0,
          icmsValue: 0,
          icmsCreditable: false,
          pisBase: 0,
          pisRate: 0,
          pisValue: 0,
          pisCreditable: false,
          cofinsBase: 0,
          cofinsRate: 0,
          cofinsValue: 0,
          cofinsCreditable: false,
          cfemRate: 0,
          cfemValue: 0,
          notes: comment,
        },
      ],
      financialInstallments,
    };

    const saved = onSave(invoice);
    if (saved === false) return;
    startNew();
  };

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title between">
          <h2>{editingBill ? "Alterar fatura" : "Lançamento de faturas"}</h2>
          {editingBill && (
            <ActionButton icon={X} variant="ghost" onClick={startNew}>Cancelar</ActionButton>
          )}
        </div>
        <form className="view-stack" onSubmit={submitBill} onInput={(event) => updateInstallmentSummary(event.currentTarget)}>
          <div className="form-grid">
            <label className="field">
              <span>Tipo de lcto</span>
              <select name="entryType" value={entryType} onChange={(event) => setEntryType(event.target.value as typeof entryType)}>
                <option value="payable">A pagar</option>
                <option value="receivable">A receber</option>
              </select>
            </label>
            <label className="field">
              <span>Série</span>
              <select name="series" value={series} onChange={(event) => setSeries(event.target.value as typeof series)}>
                <option value="Fatura">Fatura</option>
                <option value="Recibo">Recibo</option>
              </select>
            </label>
            <Field label="Título" name="title" defaultValue={editingBill?.invoiceNumber || ""} required />
            <Field label="Data de emissão" name="issueDate" type="date" defaultValue={editingBill?.issueDate || todayIso()} required />
            <PartySelect
              label={entryType === "payable" ? "Fornecedor" : "Cliente"}
              name="partyId"
              kind={partyKind}
              parties={parties}
              value={selectedParty?.id || ""}
              onChange={setSelectedParty}
              onAdd={onAddParty}
            />
            <ReadOnlyField label="CNPJ/CPF" name="partyCnpj" value={selectedParty?.cnpj || editingBill?.partyCnpj} />
            <input name="partyName" type="hidden" value={selectedParty?.name || editingBill?.partyName || ""} readOnly />
            <label className="field">
              <span>Centro de custo</span>
              <select name="costCenter" defaultValue={editingBill?.costCenter || ""} required>
                <option value="">Selecione</option>
                {fiscalConfig.costCenters.map((center) => (
                  <option key={center} value={center}>{center}</option>
                ))}
              </select>
            </label>
            <MoneyField label="Valor total" name="totalInvoice" defaultValue={editingBill ? formatCurrency(editingBill.totalInvoice) : totalValue} required onChangeValue={setTotalValue} />
            <label className="field wide">
              <span>Comentário</span>
              <textarea name="comment" defaultValue={editingBill?.additionalInfo || ""} placeholder="Descreva o serviço ou produto adquirido" />
            </label>
          </div>

          <section className="panel subtle-panel">
            <div className="panel-title between">
              <h2>Dados financeiros</h2>
              <button
                className="icon-btn"
                type="button"
                title="Adicionar parcela"
                onClick={() => setInstallmentIndexes((current) => [...current, Math.max(...current) + 1])}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="installments-stack">
              {installmentIndexes.map((installmentIndex, position) => {
                const installment = editingBill?.financialInstallments?.[position];
                return (
                  <article className="installment-row" key={installmentIndex}>
                    <strong>Parcela {position + 1}</strong>
                    <Field label="Forma de pagamento" name={`paymentCondition_${installmentIndex}`} options={configuredPaymentConditions()} defaultValue={installment?.paymentCondition || "a prazo"} />
                    <Field label="Meio de pagamento" name={`paymentMethod_${installmentIndex}`} options={configuredPaymentMethods()} defaultValue={installment?.paymentMethod || "boleto"} />
                    <Field label="Portador" name={`holder_${installmentIndex}`} options={configuredHolders()} defaultValue={installment?.holder || "Itaú"} />
                    <Field label="Vencimento" name={`dueDate_${installmentIndex}`} type="date" defaultValue={installment?.dueDate || todayIso()} />
                    <MoneyField label="Valor da parcela" name={`installmentAmount_${installmentIndex}`} defaultValue={formatCurrency(installment?.amount || (position === 0 ? cleanNumber(totalValue) : 0))} autoCalc />
                    <MoneyField label="Valor PF" name={`installmentPfValue_${installmentIndex}`} defaultValue={formatCurrency(installment?.pfValue || 0)} autoCalc />
                    {installmentIndexes.length > 1 && (
                      <button className="icon-btn danger" type="button" title="Remover parcela" onClick={() => setInstallmentIndexes((current) => current.filter((value) => value !== installmentIndex))}>
                        <X size={16} />
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            <div className="finance-pf-total">
              <span>Total parcelado</span>
              <strong>{formatCurrency(installmentsTotal)}</strong>
            </div>
          </section>

          <div className="form-actions">
            <ActionButton icon={Save} type="submit">{editingBill ? "Salvar alteração" : "Salvar fatura"}</ActionButton>
            {editingBill && (
              <ActionButton
                icon={X}
                variant="danger"
                onClick={() => {
                  if (!window.confirm("Tem certeza que deseja excluir esta fatura?")) return;
                  onDelete(editingBill.id);
                  startNew();
                }}
              >
                Excluir fatura
              </ActionButton>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Faturas lançadas</h2>
        <table className="static-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Série</th>
              <th>Título</th>
              <th>Cliente/Fornecedor</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {billInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{billFinancialKind(invoice) === "receivable" ? "A receber" : "A pagar"}</td>
                <td>{invoice.natureOperation}</td>
                <td>{invoice.invoiceNumber}</td>
                <td>{invoice.partyName}</td>
                <td>{formatDate(invoice.dueDate)}</td>
                <td>{formatCurrency(invoiceFinancialAmount(invoice))}</td>
                <td><Badge value={invoice.paid ? "Paga" : "Em aberto"} /></td>
                <td>
                  <button className="icon-btn" type="button" title="Editar" onClick={() => editBill(invoice)}>
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {!billInvoices.length && (
              <tr>
                <td colSpan={8}>Nenhuma fatura lançada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type CashExtractEntry = {
  id: string;
  source: "invoice" | "manual";
  manualId?: string;
  date: string;
  action: "Entrada" | "Saída" | "Transferência";
  holder: string;
  costCenter: string;
  history: string;
  amount: number;
  movement?: CashMovement;
};

function CashView({
  invoices,
  cashMovements,
  onSaveMovement,
  onDeleteMovement,
  mode = "normal",
}: {
  invoices: Invoice[];
  cashMovements: CashMovement[];
  onSaveMovement: (movement: CashMovement) => void;
  onDeleteMovement: (id: string) => void;
  mode?: "normal" | "pf";
}) {
  const today = todayIso();
  const [startDate, setStartDate] = useState(today.slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState(today);
  const [holderFilter, setHolderFilter] = useState("all");
  const [costCenterFilter, setCostCenterFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CashMovement | null>(null);
  const [movementType, setMovementType] = useState<CashMovementType>("entry");

  const invoiceEntries: CashExtractEntry[] = invoices.flatMap((invoice) => {
    const financialKind = billFinancialKind(invoice);
    const kind = financialKind === "receivable" || invoiceConsidersSale(invoice)
      ? "Entrada"
      : financialKind === "payable" || invoiceConsidersCost(invoice)
        ? "Saída"
        : null;
    if (!kind) return [];
    return invoiceInstallments(invoice)
      .filter((installment) => mode === "pf" ? Boolean(installment.pfPaid && installment.pfPaymentDate && installment.pfValue) : Boolean(installment.paid && installment.paymentDate && installment.amount))
      .map((installment) => ({
        id: `invoice_${invoice.id}_${installment.id}`,
        source: "invoice" as const,
        date: mode === "pf" ? installment.pfPaymentDate || today : installment.paymentDate || today,
        action: kind,
        holder: mode === "pf" ? installment.pfHolder || installment.holder || "Itaú" : installment.holder || "Itaú",
        costCenter: invoice.costCenter || invoice.items?.[0]?.costCenter || (kind === "Entrada" ? "Vendas" : "Sem centro de custo"),
        history: `${kind === "Entrada" ? "Recebimento" : "Pagamento"} ${mode === "pf" ? "PF " : ""}NF-e N° ${invoice.invoiceNumber} - ${invoice.partyName}`,
        amount: kind === "Entrada"
          ? (mode === "pf" ? Number(installment.pfSettledValue || installment.pfValue || 0) : Number(installment.settledValue || installment.amount || 0))
          : -(mode === "pf" ? Number(installment.pfSettledValue || installment.pfValue || 0) : Number(installment.settledValue || installment.amount || 0)),
      }));
  });

  const manualEntries: CashExtractEntry[] = cashMovements
  .filter((movement) => (movement.cashScope || "normal") === mode)
  .flatMap<CashExtractEntry>((movement) => {
    if (movement.movementType === "transfer") {
      return [
        {
          id: `${movement.id}_source`,
          source: "manual" as const,
          manualId: movement.id,
          date: movement.date,
          action: "Transferência" as const,
          holder: movement.holder,
          costCenter: movement.costCenter || "Transferência",
          history: `${movement.history || "Transferência entre contas"} - destino ${movement.destinationHolder || "-"}`,
          amount: -Math.abs(movement.amount),
          movement,
        },
        {
          id: `${movement.id}_destination`,
          source: "manual" as const,
          manualId: movement.id,
          date: movement.date,
          action: "Transferência" as const,
          holder: movement.destinationHolder || "",
          costCenter: movement.destinationCostCenter || movement.costCenter || "Transferência",
          history: `${movement.history || "Transferência entre contas"} - origem ${movement.holder}`,
          amount: Math.abs(movement.amount),
          movement,
        },
      ];
    }

    const isEntry = movement.movementType === "entry";
    return [
      {
        id: movement.id,
        source: "manual" as const,
        manualId: movement.id,
        date: movement.date,
        action: isEntry ? "Entrada" : "Saída",
        holder: movement.holder,
        costCenter: movement.costCenter || "Sem centro de custo",
        history: movement.history,
        amount: isEntry ? Math.abs(movement.amount) : -Math.abs(movement.amount),
        movement,
      },
    ];
  });

  const allEntries = [...invoiceEntries, ...manualEntries]
    .filter((entry) => withinDateRange(entry.date, startDate, endDate))
    .filter((entry) => holderFilter === "all" || entry.holder === holderFilter)
    .filter((entry) => costCenterFilter === "all" || entry.costCenter === costCenterFilter)
    .sort((a, b) => a.date.localeCompare(b.date) || a.holder.localeCompare(b.holder));

  const costCenters = Array.from(new Set([...fiscalConfig.costCenters, ...allEntries.map((entry) => entry.costCenter)].filter(Boolean)));
  const holders = Array.from(new Set([...configuredHolders(), ...cashMovements.flatMap((item) => [item.holder, item.destinationHolder || ""])].filter(Boolean)));
  const totalIn = allEntries.filter((entry) => entry.amount > 0).reduce((total, entry) => total + entry.amount, 0);
  const totalOut = Math.abs(allEntries.filter((entry) => entry.amount < 0).reduce((total, entry) => total + entry.amount, 0));
  const balance = totalIn - totalOut;
  const groupedDates = Array.from(new Set(allEntries.map((entry) => entry.date)));

  const openNew = (type: CashMovementType = "entry") => {
    setEditingMovement(null);
    setMovementType(type);
    setShowForm(true);
  };

  const openEdit = (movement: CashMovement) => {
    if (!window.confirm("Tem certeza que deseja alterar este movimento?")) return;
    setEditingMovement(movement);
    setMovementType(movement.movementType);
    setShowForm(true);
  };

  const submitMovement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingMovement && !window.confirm("Tem certeza que deseja salvar a alteração deste movimento?")) return;
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    onSaveMovement({
      id: editingMovement?.id || newId("cash"),
      movementType,
      cashScope: mode,
      date: String(form.get("date") || today),
      holder: String(form.get("holder") || "Itaú"),
      destinationHolder: movementType === "transfer" ? String(form.get("destinationHolder") || "") : undefined,
      costCenter: String(form.get("costCenter") || ""),
      destinationCostCenter: movementType === "transfer" ? String(form.get("destinationCostCenter") || "") : undefined,
      history: String(form.get("history") || ""),
      amount: Math.abs(cleanNumber(form.get("amount"))),
      createdAt: editingMovement?.createdAt || now,
      updatedAt: now,
    });
    setShowForm(false);
    setEditingMovement(null);
  };

  const deleteMovement = () => {
    if (!editingMovement) return;
    if (!window.confirm("Tem certeza que deseja excluir este movimento?")) return;
    onDeleteMovement(editingMovement.id);
    setEditingMovement(null);
    setShowForm(false);
  };

  return (
    <div className="view-stack">
      <section className="toolbar cash-toolbar">
        <div className="filters">
          <label className="field">
            <span>Data inicial</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Data final</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Portador</span>
            <select value={holderFilter} onChange={(event) => setHolderFilter(event.target.value)}>
              <option value="all">Todos</option>
              {holders.map((holder) => (
                <option key={holder} value={holder}>{holder}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Centro de custo</span>
            <select value={costCenterFilter} onChange={(event) => setCostCenterFilter(event.target.value)}>
              <option value="all">Todos</option>
              {costCenters.map((center) => (
                <option key={center} value={center}>{center}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="toolbar-actions">
          <ActionButton icon={Plus} onClick={() => openNew("entry")}>Novo</ActionButton>
        </div>
      </section>

      <section className="stats-grid three">
        <StatCard title="Entradas liquidadas" value={formatCurrency(totalIn)} tone="good" />
        <StatCard title="Saídas liquidadas" value={formatCurrency(totalOut)} tone="danger" />
        <StatCard title="Resultado do período" value={formatCurrency(balance)} tone={balance >= 0 ? "good" : "danger"} />
      </section>

      {showForm && (
        <section className="panel">
          <div className="panel-title between">
            <h2>{editingMovement ? "Editar lançamento manual" : "Novo lançamento manual"}</h2>
            <button className="icon-btn" type="button" title="Cancelar" onClick={() => { setShowForm(false); setEditingMovement(null); }}>
              <X size={16} />
            </button>
          </div>
          <form className="form-grid cash-form" onSubmit={submitMovement}>
            <label className="field">
              <span>Tipo</span>
              <select value={movementType} onChange={(event) => setMovementType(event.target.value as CashMovementType)}>
                <option value="entry">E - Entrada</option>
                <option value="outflow">S - Saída</option>
                <option value="transfer">T - Transferência</option>
              </select>
            </label>
            <Field label="Data" name="date" type="date" defaultValue={editingMovement?.date || today} required />
            <Field label={movementType === "transfer" ? "Conta origem" : "Portador"} name="holder" options={configuredHolders()} defaultValue={editingMovement?.holder || "Itaú"} />
            {movementType === "transfer" && (
              <Field label="Conta destino" name="destinationHolder" options={configuredHolders()} defaultValue={editingMovement?.destinationHolder || "Sicredi"} />
            )}
            <Field label="Centro custo" name="costCenter" options={fiscalConfig.costCenters} defaultValue={editingMovement?.costCenter || ""} />
            {movementType === "transfer" && (
              <Field label="Centro custo destino" name="destinationCostCenter" options={fiscalConfig.costCenters} defaultValue={editingMovement?.destinationCostCenter || editingMovement?.costCenter || ""} />
            )}
            <MoneyField label="Valor" name="amount" defaultValue={formatCurrency(editingMovement?.amount || 0)} />
            <label className="field wide">
              <span>Histórico</span>
              <textarea name="history" defaultValue={editingMovement?.history || ""} />
            </label>
            <div className="form-actions inline">
              <ActionButton icon={Save} type="submit">{editingMovement ? "Salvar alteração" : "Salvar"}</ActionButton>
              {editingMovement && (
                <ActionButton icon={X} variant="danger" onClick={deleteMovement}>Excluir</ActionButton>
              )}
              <ActionButton icon={X} variant="ghost" onClick={() => { setShowForm(false); setEditingMovement(null); }}>Cancelar</ActionButton>
            </div>
          </form>
        </section>
      )}

      <section className="panel cash-panel">
        <div className="panel-title between">
          <h2>Extrato do caixa</h2>
          <span className="muted">{allEntries.length} liquidações no período</span>
        </div>
        <table className="static-table cash-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Ação</th>
              <th>Conta</th>
              <th>Centro de custo</th>
              <th>Histórico</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {groupedDates.map((date) => {
              const rows = allEntries.filter((entry) => entry.date === date);
              const dayResult = rows.reduce((total, entry) => total + entry.amount, 0);
              return (
                <>
                  <tr className="date-group-row" key={`${date}_group`}>
                    <td colSpan={7}>{formatDate(date)} · Resultado do dia: {formatCurrency(dayResult)}</td>
                  </tr>
                  {rows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.date)}</td>
                      <td>{entry.action}</td>
                      <td>{entry.holder || "-"}</td>
                      <td>{entry.costCenter || "-"}</td>
                      <td>{entry.history}</td>
                      <td className={entry.amount < 0 ? "money-negative" : "money-positive"}>{formatCurrency(entry.amount)}</td>
                      <td>
                        {entry.source === "manual" && entry.movement ? (
                          <button className="icon-btn" type="button" title="Editar" onClick={() => openEdit(entry.movement!)}>
                            <Pencil size={15} />
                          </button>
                        ) : (
                          <span className="muted">Nota</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
            {!allEntries.length && (
              <tr>
                <td colSpan={7}>Nenhuma liquidação encontrada no período.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function FinancePie({ title, data }: { title: string; data: Array<{ name: string; value: number; color: string }> }) {
  const chartData = data.some((item) => item.value > 0) ? data : [{ name: "Sem lançamentos", value: 1, color: "#94a3b8" }];
  return (
    <section className="panel chart-panel compact-chart">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={68}>
            {chartData.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </section>
  );
}

const assetTypeOptions = ["Máquinas", "Caminhões", "Veículos", "Escavadeiras", "Britadores", "Terrenos", "Diversos"];
const assetTypesWithPlate = new Set(["Máquinas", "Caminhões", "Veículos"]);

function AssetsView({
  assets,
  onSave,
  onDelete,
}: {
  assets: AssetItem[];
  onSave: (asset: AssetItem) => void;
  onDelete: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState(editingAsset?.itemType || "");
  const visibleAssets = assets.filter((asset) => !asset.archived);
  const groupedAssets = assetTypeOptions.map((type) => ({
    type,
    items: visibleAssets.filter((asset) => asset.itemType === type),
  }));

  function openEdit(asset: AssetItem) {
    if (!window.confirm("Tem certeza que deseja alterar este patrimônio?")) return;
    setEditingAsset(asset);
    setSelectedAssetType(asset.itemType);
    setShowForm(true);
  }

  function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const registrationNumber = String(form.get("registrationNumber") || "");
    const registrationKinds = ["Matrícula", "Escritura", "CCIR"].filter((kind) => form.get(`registration${kind}`) === "on");
    const asset: AssetItem = {
      id: editingAsset?.id || newId("asset"),
      itemType: String(form.get("itemType") || ""),
      itemName: String(form.get("itemName") || ""),
      acquisitionDate: String(form.get("acquisitionDate") || todayIso()),
      acquisitionValue: cleanNumber(form.get("acquisitionValue")),
      plate: assetTypesWithPlate.has(String(form.get("itemType") || "")) ? String(form.get("plate") || "") : "",
      registrationNumber: registrationKinds.length && registrationNumber ? `${registrationKinds.join(" / ")}: ${registrationNumber}` : registrationNumber,
      archived: editingAsset?.archived || false,
      createdAt: editingAsset?.createdAt || now,
      updatedAt: now,
    };

    onSave(asset);
    setEditingAsset(null);
    setShowForm(false);
    event.currentTarget.reset();
  }

  function archiveAsset() {
    if (!editingAsset) return;
    if (!window.confirm("Tem certeza que deseja arquivar este patrimônio vendido?")) return;
    onSave({ ...editingAsset, archived: true, updatedAt: new Date().toISOString() });
    setEditingAsset(null);
    setShowForm(false);
  }

  function deleteAsset() {
    if (!editingAsset) return;
    if (!window.confirm("Tem certeza que deseja excluir definitivamente este patrimônio?")) return;
    onDelete(editingAsset.id);
    setEditingAsset(null);
    setShowForm(false);
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title between">
          <div className="panel-title">
            <Building2 size={20} />
            <h2>Módulo patrimonial</h2>
          </div>
          <button
            className="add-card compact-card"
            type="button"
            onClick={() => {
              setEditingAsset(null);
              setSelectedAssetType("");
              setShowForm((current) => !current);
            }}
          >
            <Plus size={20} />
            <strong>Adicionar/alterar</strong>
          </button>
        </div>
        {showForm && (
          <form className="form-grid" onSubmit={saveAsset}>
            <label className="field">
              <span>Tipo do item</span>
              <select
                name="itemType"
                value={selectedAssetType}
                onChange={(event) => setSelectedAssetType(event.target.value)}
                required
              >
                <option value="">Selecione</option>
                {assetTypeOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <Field label="Nome do item" name="itemName" defaultValue={editingAsset?.itemName || ""} required />
            <Field label="Data de aquisição" name="acquisitionDate" type="date" defaultValue={editingAsset?.acquisitionDate || todayIso()} required />
            <MoneyField label="Valor de aquisição" name="acquisitionValue" defaultValue={formatCurrency(editingAsset?.acquisitionValue || 0)} />
            {assetTypesWithPlate.has(selectedAssetType) && <Field label="Placa" name="plate" defaultValue={editingAsset?.plate || ""} />}
            <label className="field registration-field">
              <span>Número da matrícula, escritura ou CCIR</span>
              <input name="registrationNumber" defaultValue={editingAsset?.registrationNumber?.replace(/^(Matrícula|Escritura|CCIR)( \/ (Matrícula|Escritura|CCIR))*: /, "") || ""} />
              <div className="mini-check-row">
                {["Matrícula", "Escritura", "CCIR"].map((kind) => (
                  <label key={kind}>
                    <input name={`registration${kind}`} type="checkbox" defaultChecked={editingAsset?.registrationNumber?.includes(kind)} />
                    {kind}
                  </label>
                ))}
              </div>
            </label>
            <div className="form-actions inline">
              <ActionButton icon={Save} type="submit">
                {editingAsset ? "Salvar alteração" : "Salvar patrimônio"}
              </ActionButton>
              {editingAsset && (
                <>
                  <ActionButton
                    icon={X}
                    variant="ghost"
                    onClick={() => {
                      setEditingAsset(null);
                      setSelectedAssetType("");
                      setShowForm(false);
                    }}
                  >
                    Cancelar
                  </ActionButton>
                  <ActionButton icon={Archive} variant="ghost" onClick={archiveAsset}>
                    Arquivar item
                  </ActionButton>
                  <ActionButton icon={X} variant="danger" onClick={deleteAsset}>
                    Excluir item
                  </ActionButton>
                </>
              )}
            </div>
          </form>
        )}
      </section>
      <div className="asset-card-grid">
        {groupedAssets.map(({ type, items }) => (
          <section className="panel asset-group-card" key={type}>
            <div className="panel-title between">
              <h2>{type}</h2>
              <span className="asset-count">{items.length}</span>
            </div>
            <div className="asset-list">
              {items.map((asset) => (
                <article className="asset-card" key={asset.id}>
                  <div>
                    <strong>{asset.itemName}</strong>
                    <span>{formatDate(asset.acquisitionDate)} · {formatCurrency(asset.acquisitionValue)}</span>
                    {(asset.plate || asset.registrationNumber) && (
                      <small>{asset.plate ? `Placa: ${asset.plate}` : ""}{asset.plate && asset.registrationNumber ? " | " : ""}{asset.registrationNumber ? `Matrícula: ${asset.registrationNumber}` : ""}</small>
                    )}
                  </div>
                  <button className="icon-btn" type="button" title="Editar patrimônio" onClick={() => openEdit(asset)}>
                    <Pencil size={16} />
                  </button>
                </article>
              ))}
              {!items.length && <p className="muted">Nenhum item ativo.</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DreView({ invoices }: { invoices: Invoice[] }) {
  const [startDate, setStartDate] = useState(todayIso().slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState(todayIso());
  const [showAdjust, setShowAdjust] = useState(false);
  const [showRevenueAdjust, setShowRevenueAdjust] = useState(false);
  const [simulatedCosts, setSimulatedCosts] = useState("");
  const [simulatedExpenses, setSimulatedExpenses] = useState("");
  const [simulatedGrossRevenue, setSimulatedGrossRevenue] = useState("");
  const [simulatedTaxes, setSimulatedTaxes] = useState("");
  const [includePfInDre, setIncludePfInDre] = useState(false);
  const inPeriod = (invoice: Invoice) => {
    const date = invoice.invoiceType === "received" ? invoice.entryDate || invoice.issueDate : invoice.issueDate;
    return (!startDate || date >= startDate) && (!endDate || date <= endDate);
  };
  const issued = invoices.filter((invoice) => invoiceConsidersSale(invoice) && inPeriod(invoice));
  const received = invoices.filter((invoice) => invoiceConsidersCost(invoice) && inPeriod(invoice));
  const sum = (items: Invoice[], selector: (invoice: Invoice) => number) => items.reduce((total, invoice) => total + selector(invoice), 0);
  const grossRevenueAutomatic = sum(issued, invoiceFinancialAmount);
  const taxesAutomatic = sum(issued, (invoice) => invoice.icmsValue + invoice.pisValue + invoice.cofinsValue + invoice.cfemValue);
  const grossRevenue = simulatedGrossRevenue ? cleanNumber(simulatedGrossRevenue) : grossRevenueAutomatic;
  const taxes = simulatedTaxes ? cleanNumber(simulatedTaxes) : taxesAutomatic;
  const automaticCosts = sum(received, invoiceFinancialAmount);
  const automaticExpenses = 0;
  const costs = simulatedCosts ? cleanNumber(simulatedCosts) : automaticCosts;
  const expenses = simulatedExpenses ? cleanNumber(simulatedExpenses) : automaticExpenses;
  const issuedPfTotal = sum(issued, (invoice) => Number(invoice.pfValue || 0));
  const receivedPfTotal = sum(received, (invoice) => Number(invoice.pfValue || 0));
  const pfRevenueImpact = includePfInDre ? issuedPfTotal : 0;
  const pfCostImpact = includePfInDre ? receivedPfTotal : 0;
  const profit = grossRevenue + pfRevenueImpact - taxes - costs - expenses - pfCostImpact;
  const dreChart = [
    { name: "Impostos", value: chartValue(taxes), color: "#dc2626" },
    { name: "Custos", value: chartValue(costs), color: "#f97316" },
    { name: "Despesas", value: chartValue(expenses), color: "#7c3aed" },
    ...(includePfInDre ? [
      { name: "PF Faturado", value: chartValue(issuedPfTotal), color: "#0f766e" },
      { name: "PF Compras", value: chartValue(receivedPfTotal), color: "#92400e" },
    ] : []),
    { name: "Lucro", value: chartValue(profit), color: "#16a34a" },
  ];
  const dreChartData = dreChart.some((item) => item.value > 0) ? dreChart : [{ name: "Sem dados", value: 1, color: "#94a3b8" }];

  return (
    <div className="view-stack">
      <section className="toolbar">
        <div className="filters">
          <label className="field">
            <span>Data inicial</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">
            <span>Data final</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <div className="dre-toolbar-actions">
          <section className="pf-mini-card">
            <strong>Total PF</strong>
            <span>Faturado: {formatCurrency(issuedPfTotal)}</span>
            <span>Compras: {formatCurrency(receivedPfTotal)}</span>
            <label className="check compact-check">
              <input type="checkbox" checked={includePfInDre} onChange={(event) => setIncludePfInDre(event.target.checked)} />
              Considerar no DRE
            </label>
          </section>
          <ActionButton icon={Settings} variant="ghost" onClick={() => setShowAdjust((current) => !current)}>
            Ajustar Custos e Despesas
          </ActionButton>
          <ActionButton icon={Settings} variant="ghost" onClick={() => setShowRevenueAdjust((current) => !current)}>
            Ajustar Receita Bruta e Impostos
          </ActionButton>
        </div>
      </section>
      {showRevenueAdjust && (
        <section className="panel">
          <h2>Simulação de receita e impostos</h2>
          <div className="form-grid">
            <MoneyField label="Receita bruta simulada" name="simulatedGrossRevenue" defaultValue={grossRevenue} onChangeValue={setSimulatedGrossRevenue} />
            <MoneyField label="Impostos simulados" name="simulatedTaxes" defaultValue={taxes} onChangeValue={setSimulatedTaxes} />
          </div>
        </section>
      )}
      {showAdjust && (
        <section className="panel">
          <h2>Simulação de custos e despesas</h2>
          <div className="form-grid">
            <MoneyField label="Custos simulados" name="simulatedCosts" defaultValue={costs} onChangeValue={setSimulatedCosts} />
            <MoneyField label="Despesas simuladas" name="simulatedExpenses" defaultValue={expenses} onChangeValue={setSimulatedExpenses} />
          </div>
        </section>
      )}
      <section className="panel">
        <h2>DRE automática</h2>
        <div className="dre-lines">
          <div><span>Receita Bruta</span><strong>{formatCurrency(grossRevenue)}</strong></div>
          {includePfInDre && <div><span>Total PF Faturado</span><strong>{formatCurrency(issuedPfTotal)}</strong></div>}
          <div><span>(-) Impostos</span><strong>{formatCurrency(taxes)}</strong></div>
          <div><span>(-) Custos</span><strong>{formatCurrency(costs)}</strong></div>
          <div><span>(-) Despesas</span><strong>{formatCurrency(expenses)}</strong></div>
          {includePfInDre && <div><span>Total PF Compras</span><strong>{formatCurrency(receivedPfTotal)}</strong></div>}
          <div className="dre-total"><span>= Lucro</span><strong>{formatCurrency(profit)}</strong></div>
        </div>
      </section>
      <section className="panel chart-panel">
        <h2>DRE em gráfico</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={dreChartData} dataKey="value" nameKey="name" outerRadius={92}>
              {dreChartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function RegistrationsView({
  registryParties,
  setRegistryParties,
  canEdit,
  initialKind = "customer",
}: {
  registryParties: Party[];
  setRegistryParties: (value: Party[] | ((current: Party[]) => Party[])) => void;
  canEdit: boolean;
  initialKind?: Party["kind"];
}) {
  const [showAdd, setShowAdd] = useState(Boolean(initialKind));
  const [addKind, setAddKind] = useState<Party["kind"]>(initialKind || "customer");
  const [selectedKind, setSelectedKind] = useState<Party["kind"]>(initialKind || "customer");
  const [searchField, setSearchField] = useState<"cnpj" | "name" | "city" | "state" | "email" | "phone">("name");
  const [searchQuery, setSearchQuery] = useState("");
  const partyKinds: Array<{ id: Party["kind"]; label: string }> = [
    { id: "customer", label: "Clientes" },
    { id: "supplier", label: "Fornecedores" },
    { id: "carrier", label: "Transportadoras" },
  ];
  const searchFieldLabels = {
    cnpj: "CNPJ/CPF",
    name: "Razão social",
    city: "Cidade",
    state: "Estado",
    email: "E-mail",
    phone: "Telefone",
  };
  const filteredParties = registryParties.filter((party) => {
    if (party.kind !== selectedKind) return false;
    const value = String(party[searchField] || "");
    return searchMatches(value, searchQuery);
  });

  function addParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const party: Party = {
      id: newId("party"),
      kind: String(form.get("kind") || "customer") as Party["kind"],
      name: String(form.get("name") || ""),
      cnpj: String(form.get("cnpj") || ""),
      ie: String(form.get("ie") || ""),
      city: String(form.get("city") || ""),
      state: String(form.get("state") || "RS"),
      address: String(form.get("address") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      category: String(form.get("category") || ""),
      plate: String(form.get("plate") || ""),
      active: true,
    };

    setRegistryParties((current) => [party, ...current]);
    setShowAdd(false);
    event.currentTarget.reset();
  }

  return (
    <div className="view-stack">
      <section className="panel add-registration-panel">
        <div>
          <h2>Cadastros</h2>
          <p className="muted">Clientes, fornecedores e transportadoras usados nas notas fiscais.</p>
        </div>
        {canEdit && (
          <button className="add-card" type="button" onClick={() => setShowAdd((current) => !current)}>
            <Plus size={22} />
            <strong>Adicionar</strong>
          </button>
        )}
      </section>

      {showAdd && (
        <section className="panel">
          <h2>Novo cadastro</h2>
          <form className="form-grid" onSubmit={addParty}>
            <label className="field">
              <span>Tipo</span>
              <select name="kind" value={addKind} onChange={(event) => setAddKind(event.target.value as Party["kind"])}>
                <option value="customer">Cliente</option>
                <option value="supplier">Fornecedor</option>
                <option value="carrier">Transportadora</option>
              </select>
            </label>
            <Field label="Nome/Razão social" name="name" required />
            <CpfCnpjField label="CNPJ/CPF" name="cnpj" />
            <Field label="Inscrição Estadual" name="ie" />
            <Field label="Município" name="city" />
            <Field label="UF" name="state" defaultValue="RS" />
            <Field label="Endereço" name="address" />
            <Field label="Telefone" name="phone" />
            <Field label="E-mail" name="email" type="email" />
            {addKind === "supplier" && <Field label="Categoria principal" name="category" />}
            {addKind === "carrier" && <Field label="Placa padrão" name="plate" />}
            <div className="form-actions inline">
              <ActionButton icon={Save} type="submit">
                Salvar cadastro
              </ActionButton>
            </div>
          </form>
        </section>
      )}

      <section className="panel registration-browser">
        <div className="panel-title between">
          <h2>Consultar cadastros</h2>
          <span className="muted">{filteredParties.length} encontrado(s)</span>
        </div>
        <div className="registration-filter-grid">
          <div className="kind-tabs">
            {partyKinds.map((kind) => (
              <button
                key={kind.id}
                className={selectedKind === kind.id ? "active" : ""}
                type="button"
                onClick={() => setSelectedKind(kind.id)}
              >
                {kind.label}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Buscar por</span>
            <select value={searchField} onChange={(event) => setSearchField(event.target.value as typeof searchField)}>
              {Object.entries(searchFieldLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field registration-search">
            <span>Pesquisa</span>
            <div>
              <Search size={17} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={`Digite ${searchFieldLabels[searchField].toLowerCase()}`}
              />
            </div>
          </label>
        </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome/Razão social</th>
                  <th>CNPJ/CPF</th>
                  <th>IE</th>
                  <th>Município</th>
                  <th>UF</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Ativo</th>
                  {canEdit && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filteredParties
                  .map((party) => (
                    <tr key={party.id}>
                      <td>{party.name}</td>
                      <td>{party.cnpj}</td>
                      <td>{party.ie}</td>
                      <td>{party.city}</td>
                      <td>{party.state}</td>
                      <td>{party.phone}</td>
                      <td>{party.email}</td>
                      <td>{party.active ? "Sim" : "Não"}</td>
                      {canEdit && (
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-btn"
                            title="Editar cadastro"
                            onClick={() => {
                              if (!window.confirm("Tem certeza que deseja editar este cadastro?")) return;
                              const name = window.prompt("Informe o novo nome/razão social:", party.name)?.trim();
                              if (!name) return;
                              setRegistryParties((current) => current.map((item) => (item.id === party.id ? { ...item, name } : item)));
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-btn danger"
                            title="Excluir cadastro"
                            onClick={() =>
                              window.confirm("Tem certeza que deseja excluir este cadastro?") &&
                              setRegistryParties((current) => current.filter((item) => item.id !== party.id))
                            }
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                      )}
                    </tr>
                  ))}
                {!filteredParties.length && (
                  <tr>
                    <td colSpan={canEdit ? 9 : 8}>Nenhum cadastro encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
    </div>
  );
}

function ProductsView({
  invoices,
  products,
  onSave,
  onDelete,
  canEdit,
}: {
  invoices: Invoice[];
  products: ProductItem[];
  onSave: (product: ProductItem) => void;
  onDelete: (id: string) => void;
  canEdit: boolean;
}) {
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const autoRegisteredProducts = useRef(new Set<string>());
  const issuedProductSuggestions = useMemo(() => {
    const catalog = new Map<string, Omit<ProductItem, "id" | "createdAt" | "updatedAt">>();
    invoices
      .filter((invoice) => invoice.invoiceType === "issued")
      .flatMap((invoice) => invoice.items || [])
      .forEach((item) => {
        const name = productLabel(item);
        if (!name || name === "Produto sem descrição") return;
        const ncm = onlyDigits(item.ncm);
        const key = `${normalizeSearch(name)}|${ncm}`;
        if (catalog.has(key)) return;
        catalog.set(key, {
          code: String(item.itemCode || "").trim(),
          name,
          ncm,
          defaultCostCenter: item.costCenter || "",
          defaultCategory: item.category || "",
          defaultUnit: item.unit || "UN",
          accountingAccount: "",
          color: "",
          active: true,
        });
      });
    return Array.from(catalog.entries()).map(([key, product]) => ({ key, product }));
  }, [invoices]);

  useEffect(() => {
    if (!canEdit || !issuedProductSuggestions.length) return;
    const existingKeys = new Set(products.map((product) => `${normalizeSearch(product.name)}|${onlyDigits(product.ncm)}`));
    issuedProductSuggestions.forEach(({ key, product }) => {
      if (existingKeys.has(key) || autoRegisteredProducts.current.has(key)) return;
      autoRegisteredProducts.current.add(key);
      const now = new Date().toISOString();
      const stableId = `prod_${key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48)}`;
      onSave({
        id: stableId || newId("prod"),
        ...product,
        createdAt: now,
        updatedAt: now,
      });
    });
  }, [canEdit, issuedProductSuggestions, onSave, products]);

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    if (editingProduct && !window.confirm("Tem certeza que deseja salvar as alterações deste produto?")) return;
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    onSave({
      id: editingProduct?.id || newId("prod"),
      name: String(form.get("name") || "").trim(),
      code: String(form.get("code") || "").trim(),
      ncm: onlyDigits(String(form.get("ncm") || "")),
      defaultCostCenter: String(form.get("defaultCostCenter") || ""),
      defaultCategory: String(form.get("defaultCategory") || ""),
      defaultUnit: String(form.get("defaultUnit") || "UN"),
      accountingAccount: "",
      color: "",
      active: form.get("active") === "on",
      createdAt: editingProduct?.createdAt || now,
      updatedAt: now,
    });
    setEditingProduct(null);
    event.currentTarget.reset();
  }

  return (
    <div className="view-stack">
      <section className="panel add-registration-panel">
        <div>
          <h2>Cadastro de Produtos</h2>
          <p className="muted">Produtos vendidos usados nas notas emitidas. Variações como medidas e blocos continuam no lançamento da nota.</p>
        </div>
      </section>

      {canEdit && (
        <section className="panel" key={editingProduct?.id || "new-product"}>
          <div className="panel-title between">
            <h2>{editingProduct ? "Alterar produto" : "Novo produto"}</h2>
            {editingProduct && (
              <ActionButton icon={X} variant="ghost" onClick={() => setEditingProduct(null)}>
                Cancelar
              </ActionButton>
            )}
          </div>
          <form className="form-grid" onSubmit={saveProduct}>
            <Field label="Nome do produto" name="name" defaultValue={editingProduct?.name || ""} required />
            <Field label="Código do produto" name="code" defaultValue={editingProduct?.code || ""} />
            <Field label="NCM" name="ncm" defaultValue={editingProduct?.ncm || ""} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
            <Field label="Centro de custo padrão" name="defaultCostCenter" options={fiscalConfig.costCenters} defaultValue={editingProduct?.defaultCostCenter || ""} />
            <Field label="Categoria padrão" name="defaultCategory" options={fiscalConfig.categories} defaultValue={editingProduct?.defaultCategory || ""} />
            <Field label="Unidade padrão" name="defaultUnit" options={fiscalConfig.units || unitOptions} defaultValue={editingProduct?.defaultUnit || "UN"} />
            <label className="check align-end">
              <input name="active" type="checkbox" defaultChecked={editingProduct?.active ?? true} />
              Produto ativo
            </label>
            <div className="form-actions inline">
              <ActionButton icon={Save} type="submit">
                Salvar produto
              </ActionButton>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <h2>Produtos cadastrados</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Código do produto</th>
                <th>NCM</th>
                <th>Centro de custo padrão</th>
                <th>Categoria</th>
                <th>Unidade</th>
                <th>Ativo</th>
                {canEdit && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.code}</td>
                  <td>{product.ncm}</td>
                  <td>{product.defaultCostCenter}</td>
                  <td>{product.defaultCategory}</td>
                  <td>{product.defaultUnit}</td>
                  <td>{product.active ? "Sim" : "Não"}</td>
                  {canEdit && (
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-btn"
                          title="Editar produto"
                          type="button"
                          onClick={() => {
                            if (!window.confirm("Tem certeza que deseja editar este produto?")) return;
                            setEditingProduct(product);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title="Excluir produto"
                          type="button"
                          onClick={() => window.confirm("Tem certeza que deseja excluir este produto?") && onDelete(product.id)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!products.length && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7}>Nenhum produto cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SettingsView({ syncMode, canEdit }: { syncMode: string; canEdit: boolean }) {
  const [showEditor, setShowEditor] = useState(false);
  const [selectedConfigList, setSelectedConfigList] = useState<FiscalConfigListName>("cfops");
  const [configItemValue, setConfigItemValue] = useState("");
  const [editingConfigItem, setEditingConfigItem] = useState<{
    listName: FiscalConfigListName;
    itemValue: string;
  } | null>(null);
  const [cfopConsiderSale, setCfopConsiderSale] = useState(false);
  const [cfopConsiderCost, setCfopConsiderCost] = useState(false);
  const [configSnapshot, setConfigSnapshot] = useState<FiscalConfig>(fiscalConfigSnapshot());

  function refreshConfigSnapshot() {
    setConfigSnapshot(fiscalConfigSnapshot());
  }

  function getConfigList(listName: FiscalConfigListName) {
    if (listName === "units") {
      if (!fiscalConfig.units) fiscalConfig.units = [...unitOptions];
      return fiscalConfig.units;
    }
    if (listName === "paymentConditions") {
      if (!fiscalConfig.paymentConditions) fiscalConfig.paymentConditions = [...paymentConditionOptions];
      return fiscalConfig.paymentConditions;
    }
    if (listName === "paymentMethods") {
      if (!fiscalConfig.paymentMethods) fiscalConfig.paymentMethods = [...paymentMethodOptions];
      return fiscalConfig.paymentMethods;
    }
    if (listName === "holders") {
      if (!fiscalConfig.holders) fiscalConfig.holders = [...holderOptions];
      return fiscalConfig.holders;
    }
    if (listName === "financialCategories") {
      if (!fiscalConfig.financialCategories) fiscalConfig.financialCategories = [...fiscalConfig.categories];
      return fiscalConfig.financialCategories;
    }

    return fiscalConfig[listName];
  }

  function setConfigList(listName: FiscalConfigListName, list: string[]) {
    if (listName === "units") {
      fiscalConfig.units = list;
      return;
    }
    if (listName === "paymentConditions") {
      fiscalConfig.paymentConditions = list;
      return;
    }
    if (listName === "paymentMethods") {
      fiscalConfig.paymentMethods = list;
      return;
    }
    if (listName === "holders") {
      fiscalConfig.holders = list;
      return;
    }
    if (listName === "financialCategories") {
      fiscalConfig.financialCategories = list;
      return;
    }

    fiscalConfig[listName] = list;
  }

  function applyCfopRule(itemValue: string, previousValue?: string) {
    if (selectedConfigList !== "cfops" && editingConfigItem?.listName !== "cfops") return;

    const nextCode = getCfopCode(itemValue);
    const previousCode = previousValue ? getCfopCode(previousValue) : "";
    fiscalConfig.cfopRules = { ...(fiscalConfig.cfopRules || {}) };

    if (previousCode && previousCode !== nextCode) {
      delete fiscalConfig.cfopRules[previousCode];
    }

    if (nextCode) {
      fiscalConfig.cfopRules[nextCode] = {
        considerSale: cfopConsiderSale,
        considerCost: cfopConsiderCost,
      };
    }
  }

  function resetCfopRuleInputs() {
    setCfopConsiderSale(false);
    setCfopConsiderCost(false);
  }

  async function saveFiscalSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const listName = selectedConfigList;
    const itemValue = configItemValue.trim();
    if (!itemValue) return;

    if (editingConfigItem) {
      if (!window.confirm("Tem certeza que deseja salvar esta alteração?")) return;
      setConfigList(editingConfigItem.listName, getConfigList(editingConfigItem.listName).map((item) =>
        item === editingConfigItem.itemValue ? itemValue : item,
      ));
      applyCfopRule(itemValue, editingConfigItem.itemValue);
    } else if (!getConfigList(listName).includes(itemValue)) {
      setConfigList(listName, [...getConfigList(listName), itemValue]);
      applyCfopRule(itemValue);
    }

    await saveFiscalConfig();
    refreshConfigSnapshot();
    setConfigItemValue("");
    setEditingConfigItem(null);
    resetCfopRuleInputs();
  }

  function editConfigItem(listName: FiscalConfigListName, itemValue: string) {
    if (!window.confirm("Tem certeza que deseja editar este item?")) return;
    setSelectedConfigList(listName);
    setConfigItemValue(itemValue);
    setEditingConfigItem({ listName, itemValue });
    if (listName === "cfops") {
      const rule = fiscalConfig.cfopRules?.[getCfopCode(itemValue)] || {};
      setCfopConsiderSale(Boolean(rule.considerSale));
      setCfopConsiderCost(Boolean(rule.considerCost));
    } else {
      resetCfopRuleInputs();
    }
    setShowEditor(true);
  }

  function deleteConfigItem(listName: FiscalConfigListName, itemValue: string) {
    if (!window.confirm("Tem certeza que deseja excluir este item?")) return;
    setConfigList(listName, getConfigList(listName).filter((item) => item !== itemValue));
    if (listName === "cfops" && fiscalConfig.cfopRules) {
      delete fiscalConfig.cfopRules[getCfopCode(itemValue)];
    }
    saveFiscalConfig();
    refreshConfigSnapshot();
  }

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title between">
          <div className="panel-title">
            <ShieldCheck size={20} />
            <h2>Configurações Fiscais</h2>
          </div>
          {canEdit && (
            <button className="add-card compact-card" type="button" onClick={() => setShowEditor((current) => !current)}>
              <Plus size={20} />
              <strong>Alterar/adicionar</strong>
            </button>
          )}
        </div>
        {showEditor && (
          <form className="settings-editor" onSubmit={saveFiscalSettings}>
            <div className="form-grid">
              <label className="field">
                <span>Lista para adicionar</span>
                <select
                  name="listName"
                  value={selectedConfigList}
                  onChange={(event) => {
                    setSelectedConfigList(event.target.value as typeof selectedConfigList);
                    setEditingConfigItem(null);
                    setConfigItemValue("");
                    resetCfopRuleInputs();
                  }}
                >
                  <option value="cfops">CFOP</option>
                  <option value="csts">CST</option>
                  <option value="ncms">NCM</option>
                  <option value="categories">Categoria</option>
                  <option value="costCenters">Centro de custo</option>
                  <option value="operationTypes">Tipo de operação</option>
                  <option value="linkedTypes">Tipo de operação vinculada</option>
                  <option value="units">Unidade</option>
                  <option value="paymentConditions">Forma de pagamento</option>
                  <option value="paymentMethods">Meio de pagamento</option>
                  <option value="holders">Portador</option>
                  <option value="financialCategories">Categoria financeira</option>
                </select>
              </label>
              <label className="field">
                <span>{editingConfigItem ? "Alterar item" : "Novo item"}</span>
                <input name="itemValue" value={configItemValue} onChange={(event) => setConfigItemValue(event.target.value)} />
              </label>
              {selectedConfigList === "cfops" && (
                <div className="checkbox-field rule-checkboxes">
                  <label>
                    <input
                      type="checkbox"
                      checked={cfopConsiderSale}
                      onChange={(event) => setCfopConsiderSale(event.target.checked)}
                    />
                    Considerar venda
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={cfopConsiderCost}
                      onChange={(event) => setCfopConsiderCost(event.target.checked)}
                    />
                    Considerar custo
                  </label>
                </div>
              )}
              <div className="form-actions inline">
                <ActionButton icon={Save} type="submit">
                  {editingConfigItem ? "Salvar alteração" : "Salvar alterações"}
                </ActionButton>
                {editingConfigItem && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      setEditingConfigItem(null);
                      setConfigItemValue("");
                      resetCfopRuleInputs();
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
        <div className="settings-list-grid">
          {([
            ["cfops", "CFOP", configSnapshot.cfops],
            ["csts", "CST", configSnapshot.csts],
            ["ncms", "NCM", configSnapshot.ncms],
            ["categories", "Categorias", configSnapshot.categories],
            ["costCenters", "Centro de custos", configSnapshot.costCenters],
            ["operationTypes", "Tipos de operação", configSnapshot.operationTypes || operationTypeOptions],
            ["linkedTypes", "Operações vinculadas", configSnapshot.linkedTypes],
            ["units", "Unidades", configSnapshot.units || unitOptions],
            ["paymentConditions", "Formas de pagamento", configSnapshot.paymentConditions || paymentConditionOptions],
            ["paymentMethods", "Meios de pagamento", configSnapshot.paymentMethods || paymentMethodOptions],
            ["holders", "Portadores", configSnapshot.holders || holderOptions],
            ["financialCategories", "Categorias financeiras", configSnapshot.financialCategories || fiscalConfig.categories],
          ] as Array<[FiscalConfigListName, string, string[]]>).map(([listName, title, list]) => (
            <section className="settings-list-group" key={listName}>
              <h3>{title}</h3>
              <div className="tag-list">
                {list.map((item, index) => (
                  <span className="tag-item" key={`${listName}-${item}-${index}`}>
                    {item}
                    {listName === "cfops" && (
                      <span className="cfop-rule-badges">
                        {configSnapshot.cfopRules?.[getCfopCode(item)]?.considerSale && <small className="rule-badge sale">Venda</small>}
                        {configSnapshot.cfopRules?.[getCfopCode(item)]?.considerCost && <small className="rule-badge cost">Custo</small>}
                        {!configSnapshot.cfopRules?.[getCfopCode(item)]?.considerSale &&
                          !configSnapshot.cfopRules?.[getCfopCode(item)]?.considerCost && (
                            <small className="rule-badge neutral">Sem efeito financeiro</small>
                          )}
                      </span>
                    )}
                    {canEdit && (
                      <>
                        <button className="edit-tag" type="button" title="Editar item" onClick={() => editConfigItem(listName, item)}>
                          <Pencil size={12} />
                        </button>
                        <button type="button" title="Excluir item" onClick={() => deleteConfigItem(listName, item)}>
                          <X size={13} />
                        </button>
                      </>
                    )}
                  </span>
                ))}
                {!list.length && <p className="muted">Nenhum item cadastrado.</p>}
              </div>
            </section>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Importar XML e Logs</h2>
        <div className="placeholder-row">
          <Upload size={20} />
          Estrutura reservada para importação automática de XML de NF-e.
        </div>
        <div className="placeholder-row">
          <Database size={20} />
          Modo atual de dados: {syncMode === "supabase" ? "Supabase Realtime" : "sem conexão com Supabase"}.
        </div>
      </section>
    </div>
  );
}

function BackupView({ invoices, operations }: { invoices: Invoice[]; operations: LinkedOperation[] }) {
  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="muted">Exporte uma cópia dos dados online cadastrados no Supabase.</p>
      <div className="backup-actions">
        <ActionButton icon={Download} onClick={() => exportRows(invoices as unknown as Record<string, unknown>[], "backup-notas")}>
          Backup notas
        </ActionButton>
        <ActionButton icon={Download} onClick={() => exportRows(operations as unknown as Record<string, unknown>[], "backup-operacoes")}>
          Backup operações
        </ActionButton>
      </div>
    </section>
  );
}

export default function App() {
  const [logged, setLogged] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [authMessage, setAuthMessage] = useState(() => getAuthReturnMessage());
  const [view, setView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [registryParties, setRegistryParties] = useState<Party[]>([]);
  const [configVersion, setConfigVersion] = useState(0);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [registrationKind, setRegistrationKind] = useState<Party["kind"] | undefined>();
  const store = useFiscalStore();

  const title = useMemo(() => views.find((item) => item.id === view)?.label || "Dashboard", [view]);
  const canEdit = true;
  const bankBalanceValue = useMemo(() => fiscalConfig.bankBalance || 0, [configVersion]);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    const clearAuthParams = () => {
      if (window.location.search || window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user.email) {
        setUserEmail(data.session.user.email);
        setLogged(true);
        setAuthMessage("");
        clearAuthParams();
      } else if (authMessage) {
        clearAuthParams();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session?.user.email) {
        setUserEmail(session.user.email);
        setLogged(true);
        setAuthMessage("");
        clearAuthParams();
      }
      if (event === "SIGNED_OUT") {
        setLogged(false);
        setUserEmail("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [authMessage]);

  useEffect(() => {
    if (!logged || !supabase) return;

    const client = supabase;
    let mounted = true;

    const loadOnlineRegistries = async () => {
      const [partyResult, configResult] = await Promise.all([
        client.from("parties").select("*").order("name", { ascending: true }),
        client.from("fiscal_settings").select("config").eq("id", "default").maybeSingle(),
      ]);

      if (!mounted) return;

      if (!partyResult.error && partyResult.data) {
        setRegistryParties(partyResult.data.map(rowToParty));
      }

      if (!configResult.error && configResult.data?.config) {
        applyFiscalConfig(configResult.data.config as Partial<FiscalConfig>);
        setConfigVersion((current) => current + 1);
      }
    };

    loadOnlineRegistries();

    const channel = client
      .channel("msg-fiscal-registries")
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, loadOnlineRegistries)
      .on("postgres_changes", { event: "*", schema: "public", table: "fiscal_settings" }, loadOnlineRegistries)
      .subscribe();

    return () => {
      mounted = false;
      client.removeChannel(channel);
    };
  }, [logged]);

  const updateRegistryParties = (value: Party[] | ((current: Party[]) => Party[])) => {
    setRegistryParties((current) => {
      const next = typeof value === "function" ? value(current) : value;
      const client = supabase;
      if (!client) {
        window.alert("Supabase não configurado. O cadastro não foi salvo.");
        return current;
      }

      const removed = current.filter((party) => !next.some((item) => item.id === party.id));
      const changed = next.filter((party) => {
        const previous = current.find((item) => item.id === party.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(party);
      });

      Promise.all([
        ...removed.map((party) => client.from("parties").delete().eq("id", party.id)),
        ...(changed.length ? [client.from("parties").upsert(changed.map(partyToRow), { onConflict: "id" })] : []),
      ]).then((results) => {
        if (results.some((result) => result.error)) {
          window.alert("Não foi possível salvar o cadastro no Supabase.");
        }
      });

      return next;
    });
  };
  const openInvoiceForm = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setView(invoice.invoiceType === "issued" ? "new-issued" : "new-received");
  };
  const openNewInvoice = (nextView: View) => {
    setEditingInvoice(null);
    setView(nextView);
  };
  const openRegistration = (kind: Party["kind"]) => {
    setRegistrationKind(kind);
    setEditingInvoice(null);
    setView("registrations");
  };
  const blockedPeriodMessage = (period: string) =>
    `A competência ${periodLabel(period)} está fechada. Desbloqueie a competência em Fechamentos antes de alterar lançamentos desse período.`;
  const ensurePeriodOpen = (period: string) => {
    if (!isPeriodClosed(period)) return true;
    window.alert(blockedPeriodMessage(period));
    return false;
  };
  const guardedSaveInvoice = (invoice: Invoice) => {
    const periods = new Set([invoicePeriodKey(invoice)]);
    const previous = store.invoices.find((item) => item.id === invoice.id);
    if (previous) periods.add(invoicePeriodKey(previous));
    if (![...periods].every(ensurePeriodOpen)) return false;
    if (
      previous &&
      invoiceHasPostedPayments(previous) &&
      invoiceDataSnapshot(previous) !== invoiceDataSnapshot(invoice)
    ) {
      window.alert("Esta nota possui pagamento/recebimento lançado. Remova a baixa na tela Financeiro antes de alterar a nota.");
      return false;
    }
    store.saveInvoice(invoice);
    return true;
  };
  const guardedDeleteInvoice = (id: string) => {
    const invoice = store.invoices.find((item) => item.id === id);
    if (invoice && !ensurePeriodOpen(invoicePeriodKey(invoice))) return;
    if (invoice && invoiceHasPostedPayments(invoice)) {
      window.alert("Esta nota possui pagamento/recebimento lançado. Remova a baixa na tela Financeiro antes de excluir a nota.");
      return;
    }
    store.deleteInvoice(id);
  };
  const guardedSaveLinkedOperation = (operation: LinkedOperation) => {
    const periods = new Set([operationPeriodKey(operation)]);
    const previous = store.linkedOperations.find((item) => item.id === operation.id);
    if (previous) periods.add(operationPeriodKey(previous));
    if (![...periods].every(ensurePeriodOpen)) return;
    store.saveLinkedOperation(operation);
  };
  const guardedDeleteLinkedOperation = (id: string) => {
    const operation = store.linkedOperations.find((item) => item.id === id);
    if (operation && !ensurePeriodOpen(operationPeriodKey(operation))) return;
    store.deleteLinkedOperation(id);
  };
  const togglePeriodLock = async (period: string, close: boolean) => {
    if (!period) return;
    if (close) {
      const periodInvoices = store.invoices.filter((invoice) => invoicePeriodKey(invoice) === period);
      const financialInvoices = periodInvoices.filter(invoiceHasFinancialEffect);
      const pendingCount =
        financialInvoices.filter((invoice) => !hasInvoiceCostCenter(invoice)).length +
        periodInvoices.filter((invoice) => !cfopIsConfigured(invoice)).length +
        periodInvoices.filter((invoice) => invoiceNeedsLink(invoice) && !invoiceHasLinkReference(invoice)).length +
        financialInvoices.filter((invoice) => !invoiceHasHolder(invoice)).length;
      if (pendingCount && !window.confirm(`Ainda existem ${pendingCount} pendência(s) na conferência de ${periodLabel(period)}. Deseja fechar mesmo assim?`)) return;
    }
    const message = close
      ? `Tem certeza que deseja fechar a competência ${periodLabel(period)}? Os lançamentos desse período ficarão bloqueados para alteração.`
      : `Tem certeza que deseja desbloquear a competência ${periodLabel(period)}?`;
    if (!window.confirm(message)) return;

    const previousClosedPeriods = { ...(fiscalConfig.closedPeriods || {}) };
    const nextClosedPeriods = { ...previousClosedPeriods };
    if (close) nextClosedPeriods[period] = todayIso();
    else delete nextClosedPeriods[period];
    fiscalConfig.closedPeriods = nextClosedPeriods;
    setConfigVersion((current) => current + 1);
    const saved = await saveFiscalConfig();
    if (!saved) {
      fiscalConfig.closedPeriods = previousClosedPeriods;
      setConfigVersion((current) => current + 1);
    }
  };
  const saveBankBalance = async (value: number) => {
    fiscalConfig.bankBalance = value;
    setConfigVersion((current) => current + 1);
    await saveFiscalConfig();
  };

  if (!logged) {
    return (
      <>
        <OnlineVersionGuard />
        <Login onLogin={(email) => {
          setUserEmail(email || "");
          setAuthMessage("");
          setLogged(true);
        }} authMessage={authMessage} />
      </>
    );
  }

  return (
    <div className="app-shell">
      <OnlineVersionGuard />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img className="brand-logo small" src="/brand/msg-mark.png" alt="MSG Mineração Serra Geral" />
          <div>
            <strong>MSG Mineração</strong>
            <span>Sistema Fiscal</span>
          </div>
        </div>
        <nav>
          {views
            .filter(({ id }) => canEdit || (id !== "new-issued" && id !== "new-received"))
            .map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                if (id === "new-issued" || id === "new-received") setEditingInvoice(null);
                if (id === "registrations") setRegistrationKind(undefined);
                setView(id);
                setSidebarOpen(false);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          <button onClick={async () => {
            if (supabase) await supabase.auth.signOut();
            setLogged(false);
            setUserEmail("");
            setView("dashboard");
          }}>
            <LogOut size={18} />
            Sair
          </button>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <div>
            <span className="eyebrow">MSG Mineração Serra Geral Ltda</span>
            <h1>{title}</h1>
            {userEmail && <span className="muted">Usuário: {userEmail}</span>}
          </div>
          <div
            className="sync-pill"
            title={`Última sincronização: ${formatDateTime(store.lastSync)}`}
            onClick={() => window.alert(`Última sincronização:\n${formatDateTime(store.lastSync)}`)}
          >
            <span className={store.syncing ? "dot syncing" : store.syncMode === "supabase" ? "dot online" : "dot offline"} />
            {store.syncing ? "Sincronizando" : store.syncMode === "supabase" ? "Sincronizado com Supabase" : "Sem conexão com Supabase"}
          </div>
        </header>

        <div className="content">
          {view === "dashboard" && <Dashboard invoices={store.invoices} operations={store.linkedOperations} totals={store.totals} onView={setView} />}
          {view === "issued" && (
            <InvoiceList
              type="issued"
              invoices={store.invoices}
              onNew={() => openNewInvoice("new-issued")}
              onDelete={guardedDeleteInvoice}
              onOpen={openInvoiceForm}
              canEdit={canEdit}
            />
          )}
          {view === "received" && (
            <InvoiceList
              type="received"
              invoices={store.invoices}
              onNew={() => openNewInvoice("new-received")}
              onDelete={guardedDeleteInvoice}
              onOpen={openInvoiceForm}
              canEdit={canEdit}
            />
          )}
          {view === "new-issued" && (canEdit || editingInvoice) && (
            <InvoiceForm
              type="issued"
              invoices={store.invoices}
              operations={store.linkedOperations}
              parties={registryParties}
              products={store.products}
              editingInvoice={editingInvoice?.invoiceType === "issued" ? editingInvoice : null}
              canEdit={canEdit && (!editingInvoice || (!isPeriodClosed(invoicePeriodKey(editingInvoice)) && !invoiceHasPostedPayments(editingInvoice)))}
              onSave={guardedSaveInvoice}
              onDelete={guardedDeleteInvoice}
              onOperation={guardedSaveLinkedOperation}
              onAddParty={openRegistration}
              onDone={() => {
                setEditingInvoice(null);
                setView("issued");
              }}
            />
          )}
          {view === "new-received" && (canEdit || editingInvoice) && (
            <InvoiceForm
              type="received"
              invoices={store.invoices}
              operations={store.linkedOperations}
              parties={registryParties}
              products={store.products}
              editingInvoice={editingInvoice?.invoiceType === "received" ? editingInvoice : null}
              canEdit={canEdit && (!editingInvoice || (!isPeriodClosed(invoicePeriodKey(editingInvoice)) && !invoiceHasPostedPayments(editingInvoice)))}
              onSave={guardedSaveInvoice}
              onDelete={guardedDeleteInvoice}
              onOperation={guardedSaveLinkedOperation}
              onAddParty={openRegistration}
              onDone={() => {
                setEditingInvoice(null);
                setView("received");
              }}
            />
          )}
          {view === "linked" && <LinkedOperationsView operations={store.linkedOperations} onSave={guardedSaveLinkedOperation} onDelete={guardedDeleteLinkedOperation} canEdit={canEdit} />}
          {view === "search" && <SearchView invoices={store.invoices} operations={store.linkedOperations} />}
          {view === "conference" && <ConferenceView invoices={store.invoices} onOpen={openInvoiceForm} />}
          {view === "tax" && <TaxView totals={store.totals} invoices={store.invoices} closedPeriods={fiscalConfig.closedPeriods || {}} onTogglePeriodLock={togglePeriodLock} />}
          {view === "closures" && <ClosuresView invoices={store.invoices} closedPeriods={fiscalConfig.closedPeriods || {}} onTogglePeriodLock={togglePeriodLock} />}
          {view === "financial" && (
            <FinancialView
              invoices={store.invoices}
              onSave={guardedSaveInvoice}
              onDelete={guardedDeleteInvoice}
              onOpenInvoice={openInvoiceForm}
              bankBalanceValue={bankBalanceValue}
              onBankBalanceSave={saveBankBalance}
            />
          )}
          {view === "financial-pf" && (
            <FinancialView
              invoices={store.invoices}
              onSave={guardedSaveInvoice}
              onDelete={guardedDeleteInvoice}
              onOpenInvoice={openInvoiceForm}
              bankBalanceValue={bankBalanceValue}
              onBankBalanceSave={saveBankBalance}
              mode="pf"
            />
          )}
          {view === "checks" && <ChecksView checks={store.checks} onSave={store.saveCheck} onDelete={store.deleteCheck} />}
          {view === "bills" && (
            <BillFormView
              invoices={store.invoices}
              parties={registryParties}
              onSave={guardedSaveInvoice}
              onDelete={guardedDeleteInvoice}
              onAddParty={openRegistration}
            />
          )}
          {view === "cash" && (
            <CashView
              invoices={store.invoices}
              cashMovements={store.cashMovements}
              onSaveMovement={store.saveCashMovement}
              onDeleteMovement={store.deleteCashMovement}
            />
          )}
          {view === "cash-pf" && (
            <CashView
              invoices={store.invoices}
              cashMovements={store.cashMovements}
              onSaveMovement={store.saveCashMovement}
              onDeleteMovement={store.deleteCashMovement}
              mode="pf"
            />
          )}
          {view === "products" && (
            <ProductsView
              invoices={store.invoices}
              products={store.products}
              onSave={store.saveProduct}
              onDelete={store.deleteProduct}
              canEdit={canEdit}
            />
          )}
          {view === "assets" && <AssetsView assets={store.assets} onSave={store.saveAsset} onDelete={store.deleteAsset} />}
          {view === "dre" && <DreView invoices={store.invoices} />}
          {view === "registrations" && <RegistrationsView registryParties={registryParties} setRegistryParties={updateRegistryParties} canEdit={canEdit} initialKind={registrationKind} />}
          {view === "settings" && <SettingsView syncMode={store.syncMode} canEdit={canEdit} />}
          {view === "backup" && <BackupView invoices={store.invoices} operations={store.linkedOperations} />}
        </div>
      </main>
    </div>
  );
}



