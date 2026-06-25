import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import { fiscalConfig, formatCurrency, newId, todayIso } from "./data";
import { useFiscalStore } from "./store";
import { isSupabaseConfigured, supabase } from "./supabase";
import { FiscalConfig, Invoice, InvoiceItem, InvoiceType, LinkedOperation, Party } from "./types";

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
const unitOptions = ["UN", "KG", "TN", "MT", "PC"];
const blockQualityOptions = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"];
type FiscalConfigListName = keyof Pick<FiscalConfig, "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "linkedTypes" | "units">;

const fiscalConfigSnapshot = (): FiscalConfig => ({
  ...fiscalConfig,
  cfops: [...fiscalConfig.cfops],
  csts: [...fiscalConfig.csts],
  ncms: [...fiscalConfig.ncms],
  categories: [...fiscalConfig.categories],
  costCenters: [...fiscalConfig.costCenters],
  linkedTypes: [...fiscalConfig.linkedTypes],
  units: [...(fiscalConfig.units || unitOptions)],
});

const applyFiscalConfig = (nextConfig: Partial<FiscalConfig>) => {
  fiscalConfig.icmsRate = Number(nextConfig.icmsRate ?? fiscalConfig.icmsRate);
  fiscalConfig.pisRate = Number(nextConfig.pisRate ?? fiscalConfig.pisRate);
  fiscalConfig.cofinsRate = Number(nextConfig.cofinsRate ?? fiscalConfig.cofinsRate);
  fiscalConfig.cfemRate = Number(nextConfig.cfemRate ?? fiscalConfig.cfemRate);
  fiscalConfig.cfops = [...(nextConfig.cfops || fiscalConfig.cfops)];
  fiscalConfig.csts = [...(nextConfig.csts || fiscalConfig.csts)];
  fiscalConfig.ncms = [...(nextConfig.ncms || fiscalConfig.ncms)];
  fiscalConfig.categories = [...(nextConfig.categories || fiscalConfig.categories)];
  fiscalConfig.costCenters = [...(nextConfig.costCenters || fiscalConfig.costCenters)];
  fiscalConfig.linkedTypes = [...(nextConfig.linkedTypes || fiscalConfig.linkedTypes)];
  fiscalConfig.units = [...(nextConfig.units || fiscalConfig.units || unitOptions)];
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
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

const exportCsv = (rows: Record<string, unknown>[], filename: string) => {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
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
  if (!invoice.items?.length) {
    return [{ name: "Produto sem descrição", value: invoice.totalInvoice }];
  }

  return invoice.items.map((item) => ({
    name: productLabel(item),
    value: Number(item.totalValue || invoice.totalInvoice || 0),
  }));
};

const invoiceDate = (invoice: Invoice) => (invoice.invoiceType === "received" ? invoice.entryDate || invoice.issueDate : invoice.issueDate);
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

const isTaxableReceivedInvoice = (invoice: Invoice) => {
  if (invoice.invoiceType !== "received") return false;
  if (invoice.hasLinkedOperation) return invoice.mainCfop === "5119";
  return invoice.mainCfop !== "5923";
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
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  autoCalc?: boolean;
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
        onBlur={(event) => {
          event.currentTarget.value = formatMoneyInput(event.currentTarget.value);
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

function Login({ onLogin }: { onLogin: (email?: string) => void }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-mark">MSG</div>
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
                setError("E-mail ou senha inválidos.");
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
      .filter((invoice) => invoice.mainCfop === "5101")
      .reduce<Record<string, { name: string; value: number }>>((acc, invoice) => {
        acc[invoice.partyName] ||= { name: invoice.partyName, value: 0 };
        acc[invoice.partyName].value += invoice.totalInvoice;
        return acc;
      }, {}),
  );
  const byProduct = Object.values(
    totals.issued
      .filter((invoice) => invoice.mainCfop === "5101")
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
      .filter((invoice) => invoice.mainCfop === "5101")
      .reduce<Record<string, { month: string; faturamento: number }>>((acc, invoice) => {
        const key = invoice.issueDate.slice(0, 7);
        acc[key] ||= { month: `${key.slice(5, 7)}/${key.slice(0, 4)}`, faturamento: 0 };
        acc[key].faturamento += invoice.totalInvoice;
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
  const showPfValue = !compact && (showPf || invoices.some((invoice) => invoice.invoiceType === "issued"));

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
            {showPfValue && <td>{invoice.invoiceType === "issued" ? formatCurrency(invoice.pfValue || 0) : "-"}</td>}
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
        {invoice.invoiceType === "issued" && <StatCard title="Valor PF" value={formatCurrency(invoice.pfValue || 0)} />}
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
                  valorPf: invoice.invoiceType === "issued" ? invoice.pfValue || 0 : "",
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
            showPf={type === "issued"}
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
  const [linked, setLinked] = useState(editingInvoice?.hasLinkedOperation ?? isReceived);
  const [itemIndexes, setItemIndexes] = useState(
    editingInvoice?.items?.length ? editingInvoice.items.map((_, index) => index) : [0],
  );
  const [selectedParty, setSelectedParty] = useState<Party | undefined>(() =>
    parties.find((party) => party.kind === (isReceived ? "supplier" : "customer") && (party.name === editingInvoice?.partyName || party.cnpj === editingInvoice?.partyCnpj)),
  );
  const [selectedCarrier, setSelectedCarrier] = useState<Party | undefined>(() =>
    parties.find((party) => party.kind === "carrier" && party.name === editingInvoice?.carrierName),
  );
  const [thirdPartyFreight, setThirdPartyFreight] = useState(false);

  const recalcItemValues = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    itemIndexes.forEach((itemIndex) => {
      const suffix = `_${itemIndex}`;
      const quantity = cleanNumber(new FormData(form).get(`quantity${suffix}`));
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
      const icmsBase = cleanNumber(icmsBaseField?.value || null) || totalValue;
      const icmsRate = cleanNumber(icmsRateField?.value || null);
      if (icmsBase && icmsRate && icmsValueField) icmsValueField.value = formatCurrency((icmsBase * icmsRate) / 100);

      const pisBase = cleanNumber(pisBaseField?.value || null) || totalValue;
      const pisRate = cleanNumber(pisRateField?.value || null);
      const cofinsRate = cleanNumber(cofinsRateField?.value || null);
      if (pisBase && pisRate && pisValueField) pisValueField.value = formatCurrency((pisBase * pisRate) / 100);
      if (pisBase && cofinsRate && cofinsValueField) cofinsValueField.value = formatCurrency((pisBase * cofinsRate) / 100);
    });
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    if (isEditing && !window.confirm("Tem certeza que deseja salvar as alterações deste lançamento?")) return;
    const form = new FormData(event.currentTarget);
    const mainCfop = String(form.get("mainCfop") || "");
    const items = itemIndexes.map((index) => makeItem(form, type, index, mainCfop));
    const totalProducts = items.reduce((total, item) => total + item.totalValue, 0);
    const freightValue = form.get("thirdPartyFreight") === "on" ? 0 : cleanNumber(form.get("freightValue"));
    const totalInvoice = totalProducts + freightValue;
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
      operationType: String(form.get("operationType") || (isReceived ? "Entrada" : "Saida")),
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
      natureOperation: "",
      mainCfop,
      purpose: "Normal",
      paymentCondition: String(form.get("paymentCondition") || ""),
      paymentMethod: String(form.get("paymentMethod") || ""),
      dueDate: String(form.get("dueDate") || ""),
      pfValue: isReceived ? 0 : cleanNumber(form.get("pfValue")),
      carrierName: String(form.get("carrierName") || ""),
      paymentDate: "",
      paid: false,
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
          <Field label="CFOP principal" name="mainCfop" options={fiscalConfig.cfops} defaultValue={editingInvoice?.mainCfop || ""} required />
          <Field label="Tipo de operação" name="operationType" defaultValue={editingInvoice?.operationType || (isReceived ? "Compra para uso e consumo" : "Venda de produção")} />
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
                <Field label="NCM" name={`ncm_${itemIndex}`} defaultValue={onlyDigits(editingInvoice?.items[position]?.ncm)} required inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <Field label="CST ICMS" name={`cstIcms_${itemIndex}`} options={fiscalConfig.csts} defaultValue={editingInvoice?.items[position]?.cstIcms || ""} />
                <Field label="Unidade" name={`unit_${itemIndex}`} options={fiscalConfig.units || unitOptions} defaultValue={editingInvoice?.items[position]?.unit || "UN"} />
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
      </section>

      <section className="split-grid">
        <section className="panel">
          <h2>Transporte</h2>
          <div className="form-grid compact">
            <MoneyField label="Valor frete" name="freightValue" defaultValue={formatCurrency(editingInvoice?.freightValue || 0)} />
            <label className="check">
              <input name="thirdPartyFreight" type="checkbox" checked={thirdPartyFreight} onChange={(event) => setThirdPartyFreight(event.target.checked)} />
              Frete por conta de terceiros
            </label>
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
          <h2>Financeiro</h2>
          <div className="form-grid compact">
            <Field label="Forma de pagamento" name="paymentCondition" defaultValue={editingInvoice?.paymentCondition || "A prazo"} />
            <Field label="Meio de pagamento" name="paymentMethod" defaultValue={editingInvoice?.paymentMethod || "Boleto"} />
            <Field label="Vencimento" name="dueDate" type="date" defaultValue={editingInvoice?.dueDate || ""} />
            {!isReceived && <MoneyField label="Valor PF" name="pfValue" defaultValue={formatCurrency(editingInvoice?.pfValue || 0)} />}
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
  const issuedTaxable = periodInvoices.filter((invoice) => invoice.invoiceType === "issued" && invoice.mainCfop === "5101");
  const receivedTaxable = periodInvoices.filter(isTaxableReceivedInvoice);
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

function FinancialView({ invoices }: { invoices: Invoice[] }) {
  const today = todayIso();
  const addDays = (days: number) => {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const payables = invoices.filter((invoice) => invoice.invoiceType === "received" && !invoice.paid);
  const receivables = invoices.filter((invoice) => invoice.invoiceType === "issued" && !invoice.paid);
  const inRange = (invoice: Invoice, days: number) => {
    const dueDate = invoice.dueDate || invoice.issueDate;
    return dueDate >= today && dueDate <= addDays(days);
  };
  const sumTotal = (items: Invoice[]) => items.reduce((total, invoice) => total + invoice.totalInvoice, 0);
  const flow30 = sumTotal(receivables.filter((invoice) => inRange(invoice, 30))) - sumTotal(payables.filter((invoice) => inRange(invoice, 30)));
  const flow60 = sumTotal(receivables.filter((invoice) => inRange(invoice, 60))) - sumTotal(payables.filter((invoice) => inRange(invoice, 60)));
  const flow90 = sumTotal(receivables.filter((invoice) => inRange(invoice, 90))) - sumTotal(payables.filter((invoice) => inRange(invoice, 90)));

  return (
    <div className="view-stack">
      <section className="stats-grid">
        <StatCard title="Contas a receber" value={formatCurrency(sumTotal(receivables))} tone="good" />
        <StatCard title="Contas a pagar" value={formatCurrency(sumTotal(payables))} tone="danger" />
        <StatCard title="Fluxo 30 dias" value={formatCurrency(flow30)} tone={flow30 >= 0 ? "good" : "danger"} />
        <StatCard title="Fluxo 90 dias" value={formatCurrency(flow90)} tone={flow90 >= 0 ? "good" : "danger"} />
      </section>
      <section className="split-grid">
        <section className="panel">
          <h2>Contas a pagar</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {payables.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.partyName}</td>
                    <td>{formatDate(invoice.dueDate || invoice.issueDate)}</td>
                    <td>{formatCurrency(invoice.totalInvoice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>Contas a receber</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.partyName}</td>
                    <td>{formatDate(invoice.dueDate || invoice.issueDate)}</td>
                    <td>{formatCurrency(invoice.totalInvoice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
      <section className="panel">
        <h2>Fluxo de caixa</h2>
        <section className="stats-grid">
          <StatCard title="30 dias" value={formatCurrency(flow30)} tone={flow30 >= 0 ? "good" : "danger"} />
          <StatCard title="60 dias" value={formatCurrency(flow60)} tone={flow60 >= 0 ? "good" : "danger"} />
          <StatCard title="90 dias" value={formatCurrency(flow90)} tone={flow90 >= 0 ? "good" : "danger"} />
        </section>
      </section>
    </div>
  );
}

function AssetsView() {
  const assets = ["Máquinas", "Caminhões", "Escavadeiras", "Britadores", "Terrenos"];

  return (
    <div className="view-stack">
      <section className="panel">
        <h2>Módulo patrimonial</h2>
        <div className="report-grid">
          {assets.map((asset) => (
            <article className="report-card" key={asset}>
              <Building2 size={21} />
              <h3>{asset}</h3>
              <p className="muted">Cadastro e acompanhamento patrimonial.</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DreView({ invoices }: { invoices: Invoice[] }) {
  const issued = invoices.filter((invoice) => invoice.invoiceType === "issued" && invoice.mainCfop === "5101");
  const received = invoices.filter(isTaxableReceivedInvoice);
  const sum = (items: Invoice[], selector: (invoice: Invoice) => number) => items.reduce((total, invoice) => total + selector(invoice), 0);
  const grossRevenue = sum(issued, (invoice) => invoice.totalInvoice);
  const taxes = sum(issued, (invoice) => invoice.icmsValue + invoice.pisValue + invoice.cofinsValue + invoice.cfemValue);
  const costs = sum(received, (invoice) => invoice.totalInvoice);
  const expenses = sum(received.filter((invoice) => invoice.mainCfop !== "5119"), (invoice) => invoice.totalInvoice);
  const profit = grossRevenue - taxes - costs - expenses;

  return (
    <div className="view-stack">
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
    </div>
  );
}

function ReportsView({ invoices, operations }: { invoices: Invoice[]; operations: LinkedOperation[] }) {
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
              <button onClick={() => exportRows(invoices as unknown as Record<string, unknown>[], report.toLowerCase().replaceAll(" ", "-"))}>Excel</button>
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
  const [configSnapshot, setConfigSnapshot] = useState<FiscalConfig>(fiscalConfigSnapshot());

  function refreshConfigSnapshot() {
    setConfigSnapshot(fiscalConfigSnapshot());
  }

  async function saveFiscalSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const listName = selectedConfigList;
    const itemValue = configItemValue.trim();
    if (!itemValue) return;

    if (listName === "units" && !fiscalConfig.units) fiscalConfig.units = [...unitOptions];
    if (editingConfigItem) {
      if (!window.confirm("Tem certeza que deseja salvar esta alteração?")) return;
      fiscalConfig[editingConfigItem.listName] = fiscalConfig[editingConfigItem.listName].map((item) =>
        item === editingConfigItem.itemValue ? itemValue : item,
      );
    } else if (!fiscalConfig[listName].includes(itemValue)) {
      fiscalConfig[listName].push(itemValue);
    }

    await saveFiscalConfig();
    refreshConfigSnapshot();
    setConfigItemValue("");
    setEditingConfigItem(null);
  }

  function editConfigItem(listName: FiscalConfigListName, itemValue: string) {
    if (!window.confirm("Tem certeza que deseja editar este item?")) return;
    if (listName === "units" && !fiscalConfig.units) fiscalConfig.units = [...unitOptions];
    setSelectedConfigList(listName);
    setConfigItemValue(itemValue);
    setEditingConfigItem({ listName, itemValue });
    setShowEditor(true);
  }

  function deleteConfigItem(listName: FiscalConfigListName, itemValue: string) {
    if (!window.confirm("Tem certeza que deseja excluir este item?")) return;
    if (listName === "units" && !fiscalConfig.units) fiscalConfig.units = [...unitOptions];
    fiscalConfig[listName] = fiscalConfig[listName].filter((item) => item !== itemValue);
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
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
        <div className="tag-list">
          {([
            ["cfops", configSnapshot.cfops],
            ["csts", configSnapshot.csts],
            ["ncms", configSnapshot.ncms],
            ["categories", configSnapshot.categories],
            ["costCenters", configSnapshot.costCenters],
            ["linkedTypes", configSnapshot.linkedTypes],
            ["units", configSnapshot.units || unitOptions],
          ] as Array<[FiscalConfigListName, string[]]>).flatMap(([listName, list]) =>
            list.map((item, index) => (
              <span className="tag-item" key={`${listName}-${item}-${index}`}>
                {item}
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
            )),
          )}
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
  const [view, setView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [registryParties, setRegistryParties] = useState<Party[]>([]);
  const [, setConfigVersion] = useState(0);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [registrationKind, setRegistrationKind] = useState<Party["kind"] | undefined>();
  const store = useFiscalStore();

  const title = useMemo(() => views.find((item) => item.id === view)?.label || "Dashboard", [view]);
  const canEdit = true;
  useEffect(() => {
    if (!logged || !supabase) return;

    let mounted = true;

    const loadOnlineRegistries = async () => {
      const [partyResult, configResult] = await Promise.all([
        supabase.from("parties").select("*").order("name", { ascending: true }),
        supabase.from("fiscal_settings").select("config").eq("id", "default").maybeSingle(),
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

    const channel = supabase
      .channel("msg-fiscal-registries")
      .on("postgres_changes", { event: "*", schema: "public", table: "parties" }, loadOnlineRegistries)
      .on("postgres_changes", { event: "*", schema: "public", table: "fiscal_settings" }, loadOnlineRegistries)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [logged]);

  const updateRegistryParties = (value: Party[] | ((current: Party[]) => Party[])) => {
    setRegistryParties((current) => {
      const next = typeof value === "function" ? value(current) : value;
      if (!supabase) {
        window.alert("Supabase não configurado. O cadastro não foi salvo.");
        return current;
      }

      const removed = current.filter((party) => !next.some((item) => item.id === party.id));
      const changed = next.filter((party) => {
        const previous = current.find((item) => item.id === party.id);
        return !previous || JSON.stringify(previous) !== JSON.stringify(party);
      });

      Promise.all([
        ...removed.map((party) => supabase.from("parties").delete().eq("id", party.id)),
        ...(changed.length ? [supabase.from("parties").upsert(changed.map(partyToRow), { onConflict: "id" })] : []),
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

  if (!logged) {
    return <Login onLogin={(email) => {
      setUserEmail(email || "");
      setLogged(true);
    }} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small">MSG</div>
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
          {view === "financial" && <FinancialView invoices={store.invoices} />}
          {view === "assets" && <AssetsView />}
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



