import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { AssetItem, FiscalConfig, Invoice, InvoiceItem, InvoiceType, LinkedOperation, Party, PaymentInstallment } from "./types";

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
  | "assets"
  | "dre"
  | "reports"
  | "registrations"
  | "settings"
  | "backup";

const views: Array<{ id: View; label: string; icon: any }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "issued", label: "Notas Emitidas", icon: FileOutput },
  { id: "new-issued", label: "Nova Nota Emitida", icon: Plus },
  { id: "received", label: "Notas Recebidas", icon: FileInput },
  { id: "new-received", label: "Nova Nota Recebida", icon: PackagePlus },
  { id: "linked", label: "Operações Vinculadas", icon: Link2 },
  { id: "search", label: "Consulta Fiscal", icon: FileSearch },
  { id: "tax", label: "Apuração Fiscal", icon: ClipboardList },
  { id: "financial", label: "Financeira", icon: Database },
  { id: "assets", label: "Patrimonial", icon: Building2 },
  { id: "dre", label: "DRE", icon: BarChart3 },
  { id: "reports", label: "Relatórios", icon: BarChart3 },
  { id: "registrations", label: "Cadastros", icon: Building2 },
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "backup", label: "Backup", icon: Database },
];

const colors = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0f766e"];
const unitOptions = ["UN", "KG", "TN", "MT", "PC", "SV"];
const blockQualityOptions = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"];
type FiscalConfigListName = keyof Pick<FiscalConfig, "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "linkedTypes" | "units">;

const fiscalConfigSnapshot = (): FiscalConfig => ({
  ...fiscalConfig,
  cfops: [...fiscalConfig.cfops],
  cfopRules: { ...(fiscalConfig.cfopRules || {}) },
  csts: [...fiscalConfig.csts],
  ncms: [...fiscalConfig.ncms],
  categories: [...fiscalConfig.categories],
  costCenters: [...fiscalConfig.costCenters],
  linkedTypes: [...fiscalConfig.linkedTypes],
  units: [...(fiscalConfig.units || unitOptions)],
});

const applyFiscalConfig = (nextConfig: Partial<FiscalConfig>) => {
  const mergeList = (current: string[], incoming?: string[]) => Array.from(new Set([...(incoming || []), ...current]));
  fiscalConfig.icmsRate = Number(nextConfig.icmsRate ?? fiscalConfig.icmsRate);
  fiscalConfig.pisRate = Number(nextConfig.pisRate ?? fiscalConfig.pisRate);
  fiscalConfig.cofinsRate = Number(nextConfig.cofinsRate ?? fiscalConfig.cofinsRate);
  fiscalConfig.cfemRate = Number(nextConfig.cfemRate ?? fiscalConfig.cfemRate);
  fiscalConfig.bankBalance = Number(nextConfig.bankBalance ?? fiscalConfig.bankBalance ?? 0);
  fiscalConfig.cfops = mergeList(fiscalConfig.cfops, nextConfig.cfops);
  fiscalConfig.cfopRules = { ...(fiscalConfig.cfopRules || {}), ...(nextConfig.cfopRules || {}) };
  fiscalConfig.csts = mergeList(fiscalConfig.csts, nextConfig.csts);
  fiscalConfig.ncms = mergeList(fiscalConfig.ncms, nextConfig.ncms);
  fiscalConfig.categories = mergeList(fiscalConfig.categories, nextConfig.categories);
  fiscalConfig.costCenters = mergeList(fiscalConfig.costCenters, nextConfig.costCenters);
  fiscalConfig.linkedTypes = mergeList(fiscalConfig.linkedTypes, nextConfig.linkedTypes);
  fiscalConfig.units = mergeList(fiscalConfig.units || unitOptions, nextConfig.units);
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
const invoiceInstallments = (invoice: Invoice): PaymentInstallment[] =>
  invoice.financialInstallments?.length
    ? invoice.financialInstallments
    : [
        {
          id: "parcela_1",
          paymentCondition: invoice.paymentCondition,
          paymentMethod: invoice.paymentMethod,
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
  const main = onlyDigits(mainInvoiceNumber).replace(/^0+/, "");
  const linked = onlyDigits(linkedInvoiceNumber).replace(/^0+/, "");
  return main && linked ? `op_${main}_${linked}` : newId("op");
};

function makeItem(form: FormData, invoiceType: InvoiceType, index: number, mainCfop: string): InvoiceItem {
  const suffix = `_${index}`;
  const quantity = cleanNumber(form.get(`quantity${suffix}`));
  const unitValue = cleanNumber(form.get(`unitValue${suffix}`));
  const totalValue = cleanNumber(form.get(`totalValue${suffix}`)) || quantity * unitValue;
  const icmsRate = cleanNumber(form.get(`icmsRate${suffix}`));
  const icmsBase = cleanNumber(form.get(`icmsBase${suffix}`)) || totalValue;
  const icmsValue = cleanNumber(form.get(`icmsValue${suffix}`)) || (icmsBase * icmsRate) / 100;
  const pisCofinsBase = cleanNumber(form.get(`pisCofinsBase${suffix}`)) || totalValue;
  const pisBase = pisCofinsBase;
  const pisRate = cleanNumber(form.get(`pisRate${suffix}`));
  const pisValue = cleanNumber(form.get(`pisValue${suffix}`)) || (pisBase * pisRate) / 100;
  const cofinsBase = pisCofinsBase;
  const cofinsRate = cleanNumber(form.get(`cofinsRate${suffix}`));
  const cofinsValue = cleanNumber(form.get(`cofinsValue${suffix}`)) || (cofinsBase * cofinsRate) / 100;
  const cfemBase = Math.max(totalValue - icmsValue - pisValue - cofinsValue, 0);

  return {
    id: newId("item"),
    itemCode: "",
    description: String(form.get(`description${suffix}`) || ""),
    category: String(form.get(`category${suffix}`) || ""),
    costCenter: String(form.get(`costCenter${suffix}`) || ""),
    ncm: String(form.get(`ncm${suffix}`) || ""),
    cfop: mainCfop,
    cstIcms: String(form.get(`cstIcms${suffix}`) || "000"),
    unit: String(form.get(`unit${suffix}`) || "UN"),
    quantity,
    unitValue,
    totalValue,
    icmsBase,
    icmsRate,
    icmsValue,
    icmsCreditable: invoiceType === "received" && form.get(`icmsCreditable${suffix}`) === "on",
    pisBase,
    pisRate,
    pisValue,
    pisCreditable: invoiceType === "received" && form.get(`pisCreditable${suffix}`) === "on",
    cofinsBase,
    cofinsRate,
    cofinsValue,
    cofinsCreditable: invoiceType === "received" && form.get(`cofinsCreditable${suffix}`) === "on",
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
  const byCustomer = Object.values(
    totals.issued
      .filter(invoiceConsidersSale)
      .reduce<Record<string, { name: string; value: number }>>((acc, invoice) => {
        acc[invoice.partyName] ||= { name: invoice.partyName, value: 0 };
        acc[invoice.partyName].value += invoiceFinancialAmount(invoice);
        return acc;
      }, {}),
  );
  const byProduct = Object.values(
    totals.issued
      .filter(invoiceConsidersSale)
      .flatMap(invoiceProductEntries)
      .reduce<Record<string, { name: string; value: number }>>((acc, product) => {
        const key = product.name;
        acc[key] ||= { name: key, value: 0 };
        acc[key].value += product.value;
        return acc;
      }, {}),
  );
  const monthly = Object.values(
    totals.issued
      .filter(invoiceConsidersSale)
      .reduce<Record<string, { month: string; faturamento: number }>>((acc, invoice) => {
        const key = invoice.issueDate.slice(0, 7);
        acc[key] ||= { month: `${key.slice(5, 7)}/${key.slice(0, 4)}`, faturamento: 0 };
        acc[key].faturamento += invoiceFinancialAmount(invoice);
        return acc;
      }, {}),
  );

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
        <StatCard title="Faturamento bruto" value={formatCurrency(totals.revenue)} tone="good" />
        <StatCard title="Compras brutas" value={formatCurrency(totals.purchases)} tone="danger" />
        <StatCard title="Notas emitidas" value={String(totals.issuedCount)} tone="info" />
        <StatCard title="Notas recebidas" value={String(totals.receivedCount)} tone="good" />
        <StatCard title="CFEM a recolher" value={formatCurrency(totals.cfemDue)} tone="warn" />
        <StatCard title="Operações Vinculadas" value={String(totals.linkedCount)} tone="warn" />
      </section>

      <section className="chart-grid">
        <ChartCard title="Faturamento por cliente">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byCustomer}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Faturamento por produto">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byProduct} layout="vertical" margin={{ left: 24, right: 18 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={132} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Evolução mensal do faturamento">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthly}>
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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel chart-card">
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
          <th>N° NF-e</th>
          <th>Data</th>
          <th>{compact ? "Fornecedor" : "Cliente/Fornecedor"}</th>
          <th>CFOP</th>
          {!compact && <th>NCM</th>}
          <th>Valor total</th>
          {showPfValue && <th>Valor PF</th>}
          <th>ICMS</th>
          <th>Triang.</th>
          <th>Status</th>
          {actions && <th>Ações</th>}
        </tr>
      </thead>
      <tbody>
        {invoices.map((invoice) => (
          <tr key={invoice.id}>
            <td>{invoice.invoiceNumber}</td>
            <td>{formatDate(invoice.entryDate || invoice.issueDate)}</td>
            <td>{invoice.partyName}</td>
            <td>{invoice.mainCfop}</td>
            {!compact && <td>{invoice.items[0]?.ncm}</td>}
            <td>{formatCurrency(invoice.totalInvoice)}</td>
            {showPfValue && <td>{formatCurrency(invoice.pfValue || 0)}</td>}
            <td>{formatCurrency(invoice.invoiceType === "received" ? invoice.icmsCreditValue : invoice.icmsValue)}</td>
            <td>{invoice.hasLinkedOperation ? "Sim" : "Não"}</td>
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
  onPaid,
  onDelete,
  onOpen,
  canEdit,
}: {
  type: InvoiceType;
  invoices: Invoice[];
  onNew: () => void;
  onPaid: (invoice: Invoice) => void;
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
                {canEdit && type === "received" && !invoice.paid && (
                  <button className="icon-btn" title="Marcar como paga" onClick={() => window.confirm("Tem certeza que deseja marcar esta nota como paga?") && onPaid(invoice)}>
                    <CheckCircle2 size={16} />
                  </button>
                )}
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
  editingInvoice?: Invoice | null;
  canEdit?: boolean;
  onSave: (invoice: Invoice) => void;
  onDelete?: (id: string) => void;
  onOperation: (operation: LinkedOperation) => void;
  onAddParty: (kind: Party["kind"]) => void;
  onDone: () => void;
}) {
  const isReceived = type === "received";
  const isEditing = Boolean(editingInvoice);
  const [documentModel, setDocumentModel] = useState<"NF-e" | "NFS-e">(
    editingInvoice?.natureOperation === "NFS-e" || editingInvoice?.mainCfop === "NFS-e" ? "NFS-e" : "NF-e",
  );
  const [selectedMainCfop, setSelectedMainCfop] = useState(editingInvoice?.mainCfop || "");
  const isServiceReceived = isReceived && documentModel === "NFS-e";
  const [linked, setLinked] = useState(editingInvoice?.hasLinkedOperation ?? (isReceived && documentModel !== "NFS-e"));
  const [itemIndexes, setItemIndexes] = useState(
    editingInvoice?.items?.length ? editingInvoice.items.map((_, index) => index) : [0],
  );
  const [installmentIndexes, setInstallmentIndexes] = useState(
    editingInvoice?.financialInstallments?.length ? editingInvoice.financialInstallments.map((_, index) => index) : [0],
  );
  const [itemTotals, setItemTotals] = useState(() => ({
    products: editingInvoice?.totalProducts || 0,
    icms: editingInvoice?.icmsValue || editingInvoice?.icmsCreditValue || 0,
    pis: editingInvoice?.pisValue || editingInvoice?.pisCreditValue || 0,
    cofins: editingInvoice?.cofinsValue || editingInvoice?.cofinsCreditValue || 0,
  }));
  const [financePfTotal, setFinancePfTotal] = useState(
    () => editingInvoice?.financialInstallments?.reduce((total, installment) => total + Number(installment.pfValue || 0), 0) || Number(editingInvoice?.pfValue || 0),
  );
  const [selectedParty, setSelectedParty] = useState<Party | undefined>(() =>
    parties.find((party) => party.kind === (isReceived ? "supplier" : "customer") && (party.name === editingInvoice?.partyName || party.cnpj === editingInvoice?.partyCnpj)),
  );
  const [selectedCarrier, setSelectedCarrier] = useState<Party | undefined>(() =>
    parties.find((party) => party.kind === "carrier" && party.name === editingInvoice?.carrierName),
  );
  const [thirdPartyFreight, setThirdPartyFreight] = useState(
    Boolean(editingInvoice?.carrierName?.includes("terceiros")) || (!editingInvoice?.freightValue && Boolean(editingInvoice)),
  );

  useEffect(() => {
    if (documentModel === "NFS-e" && !editingInvoice?.hasLinkedOperation) setLinked(false);
  }, [documentModel, editingInvoice?.hasLinkedOperation]);

  const updateFormSummaries = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    let products = 0;
    let icms = 0;
    let pis = 0;
    let cofins = 0;

    itemIndexes.forEach((itemIndex) => {
      const suffix = `_${itemIndex}`;
      const quantity = cleanNumber(formData.get(`quantity${suffix}`));
      const unitValueField = form.elements.namedItem(`unitValue${suffix}`) as HTMLInputElement | null;
      const totalValueField = form.elements.namedItem(`totalValue${suffix}`) as HTMLInputElement | null;
      const icmsBaseField = form.elements.namedItem(`icmsBase${suffix}`) as HTMLInputElement | null;
      const icmsRateField = form.elements.namedItem(`icmsRate${suffix}`) as HTMLInputElement | null;
      const icmsValueField = form.elements.namedItem(`icmsValue${suffix}`) as HTMLInputElement | null;
      const pisBaseField = form.elements.namedItem(`pisCofinsBase${suffix}`) as HTMLInputElement | null;
      const pisRateField = form.elements.namedItem(`pisRate${suffix}`) as HTMLInputElement | null;
      const pisValueField = form.elements.namedItem(`pisValue${suffix}`) as HTMLInputElement | null;
      const cofinsRateField = form.elements.namedItem(`cofinsRate${suffix}`) as HTMLInputElement | null;
      const cofinsValueField = form.elements.namedItem(`cofinsValue${suffix}`) as HTMLInputElement | null;

      const unitValue = cleanNumber(unitValueField?.value || null);
      if (quantity && unitValue && totalValueField) totalValueField.value = formatCurrency(quantity * unitValue);

      const totalValue = cleanNumber(totalValueField?.value || null);
      products += totalValue;
      const icmsBase = cleanNumber(icmsBaseField?.value || null) || totalValue;
      const icmsRate = cleanNumber(icmsRateField?.value || null);
      if (icmsBase && icmsRate && icmsValueField) icmsValueField.value = formatCurrency((icmsBase * icmsRate) / 100);

      const pisBase = cleanNumber(pisBaseField?.value || null) || totalValue;
      const pisRate = cleanNumber(pisRateField?.value || null);
      const cofinsRate = cleanNumber(cofinsRateField?.value || null);
      if (pisBase && pisRate && pisValueField) pisValueField.value = formatCurrency((pisBase * pisRate) / 100);
      if (pisBase && cofinsRate && cofinsValueField) cofinsValueField.value = formatCurrency((pisBase * cofinsRate) / 100);
      icms += cleanNumber(icmsValueField?.value || null);
      pis += cleanNumber(pisValueField?.value || null);
      cofins += cleanNumber(cofinsValueField?.value || null);
    });
    setItemTotals({ products, icms, pis, cofins });
    setFinancePfTotal(
      installmentIndexes.reduce((total, index) => total + cleanNumber(formData.get(`installmentPfValue_${index}`)), 0),
    );
  };

  const recalcItemValues = (event: FormEvent<HTMLFormElement>) => {
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
    const items = itemIndexes.map((index) => makeItem(form, type, index, mainCfop));
    const totalProducts = items.reduce((total, item) => total + item.totalValue, 0);
    const freightValue = form.get("thirdPartyFreight") === "on" ? 0 : cleanNumber(form.get("freightValue"));
    const totalInvoice = totalProducts + freightValue;
    const rawInstallments = installmentIndexes.map((index, position) => ({
      id: editingInvoice?.financialInstallments?.[position]?.id || `parcela_${position + 1}`,
      paymentCondition: String(form.get(`paymentCondition_${index}`) || ""),
      paymentMethod: String(form.get(`paymentMethod_${index}`) || ""),
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
      paymentCondition: installment.paymentCondition || (index === 0 ? editingInvoice?.paymentCondition || "A prazo" : "A prazo"),
      paymentMethod: installment.paymentMethod || (index === 0 ? editingInvoice?.paymentMethod || "Boleto" : "Boleto"),
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

    const invoice: Invoice = {
      id: editingInvoice?.id || newId("inv"),
      companyId: "msg",
      invoiceType: type,
      operationType: String(
        form.get("operationType") ||
          (currentDocumentModel === "NFS-e" ? "Serviço tomado" : isReceived ? "Entrada" : "Saida"),
      ),
      invoiceNumber: String(form.get("invoiceNumber") || ""),
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
      carrierName: String(form.get("carrierName") || ""),
      paymentDate: editingInvoice?.paymentDate || "",
      paid: Boolean(editingInvoice?.paid),
      status: String(form.get("status") || "Lancada") as Invoice["status"],
      category: items[0]?.category || "",
      costCenter: items[0]?.costCenter || "",
      totalProducts,
      freightValue,
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
      internalNotes: String(form.get("internalNotes") || ""),
      xmlFileName: "",
      pdfFileName: "",
      hasLinkedOperation,
      linkedOperationType: String(form.get("linkedOperationType") || ""),
      linkedInvoiceNumber: String(form.get("linkedInvoiceNumber") || ""),
      finalRecipientName: String(form.get("finalRecipientName") || ""),
      physicalReceiverName: "",
      createdAt: editingInvoice?.createdAt || now,
      updatedAt: now,
      items,
      financialInstallments,
    };

    onSave(invoice);

    if (hasLinkedOperation) {
      const linkedInvoiceNumber = String(form.get("linkedInvoiceNumber") || "");
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
        <div className="form-grid">
          <Field label={isReceived ? "Data de emissão fornecedor" : "Data de emissão"} name="issueDate" type="date" defaultValue={editingInvoice?.issueDate || todayIso()} required />
          <Field label="Número da nota" name="invoiceNumber" defaultValue={onlyDigits(editingInvoice?.invoiceNumber)} required inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
          {isReceived && (
            <label className="field">
              <span>Tipo de documento</span>
              <select name="documentModel" value={documentModel} onChange={(event) => setDocumentModel(event.target.value as "NF-e" | "NFS-e")}>
                <option value="NF-e">NF-e / mercadoria</option>
                <option value="NFS-e">NFS-e / serviço tomado</option>
              </select>
            </label>
          )}
          <PartySelect
            label={isReceived ? "Fornecedor" : "Cliente"}
            name="partyId"
            kind={isReceived ? "supplier" : "customer"}
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
          <Field label="Tipo de operação" name="operationType" defaultValue={editingInvoice?.operationType || (isServiceReceived ? "Serviço tomado" : isReceived ? "Compra para uso e consumo" : "Venda de produção")} />
          <label className="field">
            <span>Status</span>
            <select name="status" defaultValue={editingInvoice?.status || "Lancada"}>
              {["Lancada", "Pendente", "Cancelada", "Aguardando XML", "Em conferência"].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

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
          {itemIndexes.map((itemIndex, position) => (
            <article className="item-card" key={itemIndex}>
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
                <Field label="Descrição do produto/serviço" name={`description_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.description || ""} required sanitize="letters" />
                {isReceived && <Field label="Categoria" name={`category_${itemIndex}`} options={fiscalConfig.categories} defaultValue={editingInvoice?.items[position]?.category || ""} />}
                {isReceived && <Field label="Centro de custo" name={`costCenter_${itemIndex}`} options={fiscalConfig.costCenters} defaultValue={editingInvoice?.items[position]?.costCenter || ""} />}
                <Field label={isServiceReceived ? "NCM (opcional para NFS-e)" : "NCM"} name={`ncm_${itemIndex}`} defaultValue={onlyDigits(editingInvoice?.items[position]?.ncm)} required={!isServiceReceived} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <Field label="CST ICMS" name={`cstIcms_${itemIndex}`} options={fiscalConfig.csts} defaultValue={editingInvoice?.items[position]?.cstIcms || ""} />
                <Field label="Unidade" name={`unit_${itemIndex}`} options={fiscalConfig.units || unitOptions} defaultValue={editingInvoice?.items[position]?.unit || (isServiceReceived ? "SV" : "UN")} />
                <Field label="Quantidade" name={`quantity_${itemIndex}`} defaultValue={onlyDigits(editingInvoice?.items[position]?.quantity || "1")} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <MoneyField label="Valor unitário" name={`unitValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.unitValue || 0)} autoCalc />
                <MoneyField label="Valor total" name={`totalValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.totalValue || 0)} autoCalc />
                <MoneyField label="Base ICMS" name={`icmsBase_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.icmsBase || 0)} autoCalc />
                <PercentField label="Alíquota ICMS %" name={`icmsRate_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.icmsRate || (isReceived ? 12 : fiscalConfig.icmsRate)} />
                <MoneyField label="Valor ICMS" name={`icmsValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.icmsValue || 0)} autoCalc />
                <MoneyField label="Base PIS/COFINS" name={`pisCofinsBase_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.pisBase || 0)} autoCalc />
                <PercentField label="Alíquota PIS %" name={`pisRate_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.pisRate || fiscalConfig.pisRate} />
                <MoneyField label="Valor PIS" name={`pisValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.pisValue || 0)} autoCalc />
                <PercentField label="Alíquota COFINS %" name={`cofinsRate_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.cofinsRate || fiscalConfig.cofinsRate} />
                <MoneyField label="Valor COFINS" name={`cofinsValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.cofinsValue || 0)} autoCalc />
                {!isReceived && <Field label="Tipo do material" name={`materialType_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.materialType || ""} sanitize="letters" />}
                {!isReceived && <Field label="Número do bloco" name={`blockNumber_${itemIndex}`} defaultValue={onlyDigits(editingInvoice?.items[position]?.blockNumber)} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />}
                {!isReceived && <Field label="Cor do bloco" name={`blockColor_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.blockColor || ""} sanitize="letters" />}
                {!isReceived && <Field label="Qualidade do bloco" name={`blockQuality_${itemIndex}`} options={blockQualityOptions} defaultValue={editingInvoice?.items[position]?.blockQuality || ""} />}
                {!isReceived && <Field label="Medidas do bloco" name={`blockMeasures_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.blockMeasures || ""} />}
                {!isReceived && <KgField label="KG" name={`kilograms_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.kilograms || "0"} />}
              </div>
              {isReceived && (
                <div className="check-row">
                  <label className="check">
                    <input name={`icmsCreditable_${itemIndex}`} type="checkbox" defaultChecked />
                    ICMS creditável
                  </label>
                  <label className="check">
                    <input name={`pisCreditable_${itemIndex}`} type="checkbox" defaultChecked />
                    PIS creditável
                  </label>
                  <label className="check">
                    <input name={`cofinsCreditable_${itemIndex}`} type="checkbox" defaultChecked />
                    COFINS creditável
                  </label>
                </div>
              )}
            </article>
          ))}
        </div>
        <div className="item-totals-grid">
          <StatCard title="Total produtos" value={formatCurrency(itemTotals.products)} tone="info" />
          <StatCard title="Total ICMS" value={formatCurrency(itemTotals.icms)} tone="danger" />
          <StatCard title="Total PIS" value={formatCurrency(itemTotals.pis)} tone="warn" />
          <StatCard title="Total COFINS" value={formatCurrency(itemTotals.cofins)} tone="warn" />
        </div>
      </section>

      <section className="split-grid">
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

        <section className="panel">
          <div className="panel-title between">
            <h2>Financeiro</h2>
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
              const installment = editingInvoice?.financialInstallments?.[position];
              return (
                <article className="installment-row" key={installmentIndex}>
                  <strong>Parcela {position + 1}</strong>
                  <Field label="Forma de pagamento" name={`paymentCondition_${installmentIndex}`} defaultValue={installment?.paymentCondition || editingInvoice?.paymentCondition || "A prazo"} />
                  <Field label="Meio de pagamento" name={`paymentMethod_${installmentIndex}`} defaultValue={installment?.paymentMethod || editingInvoice?.paymentMethod || "Boleto"} />
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
                <Field label="Tipo de operação vinculada" name="linkedOperationType" options={fiscalConfig.linkedTypes} defaultValue={editingInvoice?.linkedOperationType || "Compra com triangulação"} />
                <Field label="Nota vinculada" name="linkedInvoiceNumber" defaultValue={editingInvoice?.linkedInvoiceNumber || ""} />
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

function SearchView({ invoices, operations }: { invoices: Invoice[]; operations: LinkedOperation[] }) {
  const [query, setQuery] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const rows = invoices
    .filter((invoice) => searchMatches(invoiceSearchText(invoice), query))
    .filter((invoice) => withinDateRange(invoiceDate(invoice), dateStart, dateEnd));
  const operationRows = operations.filter((op) => searchMatches(operationSearchText(op), query) && withinDateRange(op.operationDate, dateStart, dateEnd));

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
      <section className="panel">
        <h2>Operações Vinculadas</h2>
        <div className="table-wrap">
          <OperationRows operations={operationRows} />
        </div>
      </section>
    </div>
  );
}

function TaxView({ invoices }: { totals: ReturnType<typeof useFiscalStore>["totals"]; invoices: Invoice[] }) {
  const [period, setPeriod] = useState("2026-06");
  const periodInvoices = invoices.filter((invoice) => {
    const date = invoice.invoiceType === "received" ? invoice.entryDate || invoice.issueDate : invoice.issueDate;
    return date?.slice(0, 7) === period;
  });
  const issuedTaxable = periodInvoices.filter(invoiceConsidersSale);
  const receivedTaxable = periodInvoices.filter(invoiceConsidersCost);
  const sumInvoices = (items: Invoice[], field: keyof Invoice) =>
    items.reduce((total, invoice) => total + Number(invoice[field] || 0), 0);

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

  return (
    <div className="view-stack">
      <div className="toolbar">
        <div className="filters">
          <label className="field">
            <span>Período de apuração</span>
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
        </div>
        <ActionButton icon={RefreshCw} onClick={() => setPeriod("2026-06")}>
          Atualizar
        </ActionButton>
      </div>

      <section className="tax-summary-grid">
        <StatCard title="Receita tributável emitida" value={formatCurrency(issuedRevenue)} tone="good" />
        <StatCard title="Receita tributável recebida" value={formatCurrency(receivedRevenue)} />
        <StatCard title="CFEM a recolher" value={formatCurrency(cfemDue)} tone="warn" />
        <StatCard title="ICMS débito" value={formatCurrency(issuedIcms)} tone="danger" />
        <StatCard title="ICMS crédito" value={formatCurrency(receivedIcms)} tone="good" />
        <StatCard title="Saldo ICMS" value={formatCurrency(issuedIcms - receivedIcms)} tone="warn" />
        <StatCard title="PIS débito" value={formatCurrency(issuedPis)} tone="danger" />
        <StatCard title="PIS crédito" value={formatCurrency(receivedPis)} tone="good" />
        <StatCard title="Saldo PIS" value={formatCurrency(issuedPis - receivedPis)} tone="warn" />
        <StatCard title="COFINS débito" value={formatCurrency(issuedCofins)} tone="danger" />
        <StatCard title="COFINS crédito" value={formatCurrency(receivedCofins)} tone="good" />
        <StatCard title="Saldo COFINS" value={formatCurrency(issuedCofins - receivedCofins)} tone="warn" />
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

function FinancialView({
  invoices,
  onSave,
  bankBalanceValue,
  onBankBalanceSave,
}: {
  invoices: Invoice[];
  onSave: (invoice: Invoice) => void;
  bankBalanceValue: number;
  onBankBalanceSave: (value: number) => void;
}) {
  const today = todayIso();
  const [startDate, setStartDate] = useState(today.slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState(today);
  const [listType, setListType] = useState<"all" | "receivable" | "payable">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid">("open");
  const [bankBalance, setBankBalance] = useState(() => formatCurrency(bankBalanceValue));
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [financialNotes, setFinancialNotes] = useState<Record<string, string>>({});
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
  };
  const allEntries = invoices.flatMap((invoice) => {
    const kind: FinancialEntry["kind"] | null = invoiceConsidersSale(invoice)
      ? "receivable"
      : invoiceConsidersCost(invoice)
        ? "payable"
        : null;
    if (!kind) return [];
    return invoiceInstallments(invoice).map((installment) => ({
      id: `${invoice.id}_${installment.id}`,
      invoice,
      installment,
      kind,
    }));
  });
  const byEntryPeriod = (entry: FinancialEntry) =>
    (!startDate || entry.installment.dueDate >= startDate) && (!endDate || entry.installment.dueDate <= endDate);
  const byEntryStatus = (entry: FinancialEntry) => {
    if (statusFilter === "paid") return entry.installment.paid;
    if (statusFilter === "open") return !entry.installment.paid;
    return true;
  };
  const payables = allEntries.filter((entry) => entry.kind === "payable" && byEntryStatus(entry) && byEntryPeriod(entry));
  const receivables = allEntries.filter((entry) => entry.kind === "receivable" && byEntryStatus(entry) && byEntryPeriod(entry));
  const openPayables = allEntries.filter((entry) => entry.kind === "payable" && !entry.installment.paid && byEntryPeriod(entry));
  const openReceivables = allEntries.filter((entry) => entry.kind === "receivable" && !entry.installment.paid && byEntryPeriod(entry));
  const inRange = (entry: FinancialEntry, days: number) => {
    const dueDate = entry.installment.dueDate;
    return dueDate >= today && dueDate <= addDays(days);
  };
  const sumTotal = (items: FinancialEntry[]) => items.reduce((total, entry) => total + installmentTotal(entry.installment), 0);
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
    { name: "Saldo atual", value: Math.max(currentBankBalance, 0), color: "#2563eb" },
    { name: "30 dias", value: flow30Parts.receive, color: "#16a34a" },
    { name: "60 dias", value: Math.max(flow60Parts.receive - flow30Parts.receive, 0), color: "#22c55e" },
    { name: "90 dias", value: Math.max(flow90Parts.receive - flow60Parts.receive, 0), color: "#86efac" },
  ];
  const payFlowChart = [
    { name: "Saldo atual", value: Math.max(currentBankBalance, 0), color: "#2563eb" },
    { name: "30 dias", value: flow30Parts.pay, color: "#dc2626" },
    { name: "60 dias", value: Math.max(flow60Parts.pay - flow30Parts.pay, 0), color: "#f97316" },
    { name: "90 dias", value: Math.max(flow90Parts.pay - flow60Parts.pay, 0), color: "#fdba74" },
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
  const markPaid = (entry: FinancialEntry) => {
    const paymentDate = paymentDates[entry.id] || today;
    if (window.confirm("Tem certeza que deseja marcar este lançamento como pago?")) {
      updateInstallment(entry, {
        paid: true,
        paymentDate,
        notes: financialNotes[entry.id] ?? entry.installment.notes,
      });
    }
  };
  const reopenPayment = (entry: FinancialEntry) => {
    if (window.confirm("Tem certeza que deseja remover o pagamento deste lançamento?")) {
      updateInstallment(entry, {
        paid: false,
        paymentDate: "",
        notes: financialNotes[entry.id] ?? entry.installment.notes,
      });
    }
  };
  const saveFinancialNote = (entry: FinancialEntry) => {
    const note = financialNotes[entry.id] ?? entry.installment.notes ?? "";
    if (note !== (entry.installment.notes || "")) {
      updateInstallment(entry, { notes: note });
    }
  };
  const renderRows = (items: FinancialEntry[], partyLabel: string, paymentDateLabel: string) => (
    <table className="static-table">
      <thead>
        <tr>
          <th>{partyLabel}</th>
          <th>Vencimento</th>
          <th>Valor</th>
          <th>{paymentDateLabel}</th>
          <th>Pago</th>
          <th>Observações</th>
        </tr>
      </thead>
      <tbody>
        {items.map((entry) => (
          <tr key={entry.id}>
            <td>{entry.invoice.partyName}</td>
            <td>{formatDate(entry.installment.dueDate)}</td>
            <td>{formatCurrency(installmentTotal(entry.installment))}</td>
            <td>
              <input
                className="compact-input"
                type="date"
                value={paymentDates[entry.id] || entry.installment.paymentDate || today}
                onChange={(event) => setPaymentDates((current) => ({ ...current, [entry.id]: event.target.value }))}
              />
            </td>
            <td>
              <input type="checkbox" checked={entry.installment.paid} onChange={() => (entry.installment.paid ? reopenPayment(entry) : markPaid(entry))} />
            </td>
            <td>
              <input
                className="compact-input"
                value={financialNotes[entry.id] ?? entry.installment.notes ?? ""}
                onChange={(event) => setFinancialNotes((current) => ({ ...current, [entry.id]: event.target.value }))}
                onBlur={() => saveFinancialNote(entry)}
                placeholder="Livre"
              />
            </td>
          </tr>
        ))}
        {!items.length && (
          <tr>
            <td colSpan={6}>Nenhum lançamento no período.</td>
          </tr>
        )}
      </tbody>
    </table>
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
        </div>
      </section>
      <section className="stats-grid">
        <StatCard title="Total contas a receber" value={formatCurrency(sumTotal(openReceivables))} tone="good" />
        <StatCard title="Total contas a pagar" value={formatCurrency(sumTotal(openPayables))} tone="danger" />
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
        {!!visibleReceivables.length || listType !== "payable" ? <section className="panel">
          <h2>Contas a receber</h2>
          {renderRows(visibleReceivables, "Cliente", "Data de recebimento")}
        </section> : null}
        {!!visiblePayables.length || listType !== "receivable" ? <section className="panel">
          <h2>Contas a pagar</h2>
          {renderRows(visiblePayables, "Fornecedor", "Data de pagamento")}
        </section> : null}
      </section>
      <section className="split-grid">
        <FinancePie title="Fluxo a receber" data={receiveFlowChart} />
        <FinancePie title="Fluxo a pagar" data={payFlowChart} />
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
  const profit = grossRevenue - taxes - costs - expenses;
  const dreChart = [
    { name: "Impostos", value: Math.max(taxes, 0), color: "#dc2626" },
    { name: "Custos", value: Math.max(costs, 0), color: "#f97316" },
    { name: "Despesas", value: Math.max(expenses, 0), color: "#7c3aed" },
    { name: "Lucro", value: Math.max(profit, 0), color: "#16a34a" },
  ];

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
          <div><span>(-) Impostos</span><strong>{formatCurrency(taxes)}</strong></div>
          <div><span>(-) Custos</span><strong>{formatCurrency(costs)}</strong></div>
          <div><span>(-) Despesas</span><strong>{formatCurrency(expenses)}</strong></div>
          <div className="dre-total"><span>= Lucro</span><strong>{formatCurrency(profit)}</strong></div>
        </div>
      </section>
      <section className="panel chart-panel">
        <h2>DRE em gráfico</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={dreChart.some((item) => item.value > 0) ? dreChart : [{ name: "Sem dados", value: 1, color: "#94a3b8" }]} dataKey="value" nameKey="name" outerRadius={92}>
              {(dreChart.some((item) => item.value > 0) ? dreChart : [{ name: "Sem dados", value: 1, color: "#94a3b8" }]).map((entry) => (
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

function ReportsView({ invoices, operations }: { invoices: Invoice[]; operations: LinkedOperation[] }) {
  const financialInvoices = invoices.filter(invoiceHasFinancialEffect);
  const reports = [
    "Faturamento por cliente",
    "Faturamento por produto",
    "Faturamento por CFOP",
    "Notas por cliente",
    "Notas por fornecedor",
    "Notas por CFOP",
    "Operações vinculadas",
    "Triangulações em compras",
    "Apuração de ICMS",
    "Apuração de PIS/COFINS",
    "CFEM",
    "Notas canceladas",
    "Compras por categoria",
    "Compras por centro de custo",
    "Fretes",
    "Livro fiscal simplificado",
  ];

  return (
    <div className="view-stack">
      <div className="report-grid">
        {reports.map((report) => (
          <article className="report-card" key={report}>
            <BarChart3 size={21} />
            <h3>{report}</h3>
            <div className="report-actions">
              <button onClick={() => exportRows(financialInvoices as unknown as Record<string, unknown>[], report.toLowerCase().replace(/\s+/g, "-"))}>Excel</button>
              <button onClick={() => exportCsv(operations as unknown as Record<string, unknown>[], "operacoes")}>CSV</button>
              <button onClick={() => window.print()}>PDF</button>
            </div>
          </article>
        ))}
      </div>
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

      {(["customer", "supplier", "carrier"] as const).map((kind) => (
        <section className="panel" key={kind}>
          <h2>{kind === "customer" ? "Clientes" : kind === "supplier" ? "Fornecedores" : "Transportadoras"}</h2>
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
                {registryParties
                  .filter((party) => party.kind === kind)
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
              </tbody>
            </table>
          </div>
        </section>
      ))}
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

    return fiscalConfig[listName];
  }

  function setConfigList(listName: FiscalConfigListName, list: string[]) {
    if (listName === "units") {
      fiscalConfig.units = list;
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
                  <option value="linkedTypes">Tipo de operação vinculada</option>
                  <option value="units">Unidade</option>
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
            ["linkedTypes", "Operações vinculadas", configSnapshot.linkedTypes],
            ["units", "Unidades", configSnapshot.units || unitOptions],
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
              onPaid={store.markInvoicePaid}
              onDelete={store.deleteInvoice}
              onOpen={openInvoiceForm}
              canEdit={canEdit}
            />
          )}
          {view === "received" && (
            <InvoiceList
              type="received"
              invoices={store.invoices}
              onNew={() => openNewInvoice("new-received")}
              onPaid={store.markInvoicePaid}
              onDelete={store.deleteInvoice}
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
              editingInvoice={editingInvoice?.invoiceType === "issued" ? editingInvoice : null}
              canEdit={canEdit}
              onSave={store.saveInvoice}
              onDelete={store.deleteInvoice}
              onOperation={store.saveLinkedOperation}
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
              editingInvoice={editingInvoice?.invoiceType === "received" ? editingInvoice : null}
              canEdit={canEdit}
              onSave={store.saveInvoice}
              onDelete={store.deleteInvoice}
              onOperation={store.saveLinkedOperation}
              onAddParty={openRegistration}
              onDone={() => {
                setEditingInvoice(null);
                setView("received");
              }}
            />
          )}
          {view === "linked" && <LinkedOperationsView operations={store.linkedOperations} onSave={store.saveLinkedOperation} onDelete={store.deleteLinkedOperation} canEdit={canEdit} />}
          {view === "search" && <SearchView invoices={store.invoices} operations={store.linkedOperations} />}
          {view === "tax" && <TaxView totals={store.totals} invoices={store.invoices} />}
          {view === "financial" && (
            <FinancialView
              invoices={store.invoices}
              onSave={store.saveInvoice}
              bankBalanceValue={bankBalanceValue}
              onBankBalanceSave={saveBankBalance}
            />
          )}
          {view === "assets" && <AssetsView assets={store.assets} onSave={store.saveAsset} onDelete={store.deleteAsset} />}
          {view === "dre" && <DreView invoices={store.invoices} />}
          {view === "reports" && <ReportsView invoices={store.invoices} operations={store.linkedOperations} />}
          {view === "registrations" && <RegistrationsView registryParties={registryParties} setRegistryParties={updateRegistryParties} canEdit={canEdit} initialKind={registrationKind} />}
          {view === "settings" && <SettingsView syncMode={store.syncMode} canEdit={canEdit} />}
          {view === "backup" && <BackupView invoices={store.invoices} operations={store.linkedOperations} />}
        </div>
      </main>
    </div>
  );
}



