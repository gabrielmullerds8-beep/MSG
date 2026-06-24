import { FormEvent, useMemo, useState } from "react";
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
  Users,
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
import { fiscalConfig, formatCurrency, newId, parties, todayIso } from "./data";
import { useFiscalStore } from "./store";
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
  { id: "reports", label: "Relatórios", icon: BarChart3 },
  { id: "registrations", label: "Cadastros", icon: Building2 },
  { id: "settings", label: "Configurações", icon: Settings },
  { id: "backup", label: "Backup", icon: Database },
];

const colors = ["#2563eb", "#16a34a", "#f97316", "#dc2626", "#7c3aed", "#0f766e"];
const PARTIES_KEY = "msg-fiscal-parties";
const unitOptions = ["UN", "KG", "TN", "MT", "PC"];
const blockQualityOptions = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta"];

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
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

const exportRows = (rows: Record<string, unknown>[], filename: string) => {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
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
  tone?: "default" | "good" | "warn" | "danger";
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
  sanitize?: "letters" | "digits" | "kg";
}) {
  const sanitizeValue = (value: string) => {
    if (sanitize === "letters") return value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");
    if (sanitize === "digits") return value.replace(/\D/g, "");
    if (sanitize === "kg") return value.replace(/[^\d.,]/g, "");
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
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
}) {
  return <Field label={label} name={name} defaultValue={defaultValue} required={required} placeholder="R$ 0,00" inputMode="decimal" />;
}

function PartySelect({
  label,
  name,
  kind,
  parties,
  value,
  onChange,
}: {
  label: string;
  name: string;
  kind: Party["kind"];
  parties: Party[];
  value: string;
  onChange: (party: Party | undefined) => void;
}) {
  const filtered = parties.filter((party) => party.kind === kind && party.active);

  return (
    <label className="field">
      <span>{label}</span>
      <select
        name={name}
        value={value}
        required
        onChange={(event) => onChange(filtered.find((party) => party.id === event.target.value))}
      >
        <option value="">Selecione um cadastro</option>
        {filtered.map((party) => (
          <option key={party.id} value={party.id}>
            {party.name}
          </option>
        ))}
      </select>
    </label>
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

function Login({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-mark">MSG</div>
        <h1>MSG Mineração - Sistema Fiscal</h1>
        <p>Controle interno de notas, triangulações, apuração e relatórios fiscais.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onLogin();
          }}
        >
          <Field label="E-mail" name="email" type="email" defaultValue="fiscal@msgmineracao.com.br" />
          <Field label="Senha" name="password" type="password" defaultValue="demo123" />
          <ActionButton icon={Lock} type="submit">
            Entrar no sistema
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
    totals.issued.reduce<Record<string, { name: string; value: number }>>((acc, invoice) => {
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
        <StatCard title="Compras brutas" value={formatCurrency(totals.purchases)} />
        <StatCard title="Notas emitidas" value={String(totals.issuedCount)} />
        <StatCard title="Notas recebidas" value={String(totals.receivedCount)} />
        <StatCard title="CFEM a recolher" value={formatCurrency(totals.cfemDue)} tone="warn" />
        <StatCard title="Operações Vinculadas" value={String(totals.linkedCount)} />
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
          {actions && <th>Acoes</th>}
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
            <td>{invoice.hasLinkedOperation ? "Sim" : "Nao"}</td>
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
          <th>ID</th>
          <th>Tipo</th>
          <th>Nota principal</th>
          <th>Nota vinculada</th>
          <th>Fornecedor</th>
          <th>Destinatario final</th>
          <th>Valor</th>
          <th>Status</th>
          {actions && <th>Acoes</th>}
        </tr>
      </thead>
      <tbody>
        {operations.map((op) => (
          <tr key={op.id}>
            <td>{op.id.replace("op_", "")}</td>
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
}: {
  type: InvoiceType;
  invoices: Invoice[];
  onNew: () => void;
  onPaid: (invoice: Invoice) => void;
  onDelete: (id: string) => void;
  onOpen: (invoice: Invoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [cfop, setCfop] = useState("");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const filtered = invoices
    .filter((invoice) => invoice.invoiceType === type)
    .filter((invoice) =>
      [invoice.invoiceNumber, invoice.partyName, invoice.partyCnpj, invoice.mainCfop, invoice.items[0]?.ncm]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
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
        <ActionButton icon={Plus} onClick={onNew}>
          Nova nota
        </ActionButton>
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
                {type === "received" && !invoice.paid && (
                  <button className="icon-btn" title="Marcar como paga" onClick={() => window.confirm("Tem certeza que deseja marcar esta nota como paga?") && onPaid(invoice)}>
                    <CheckCircle2 size={16} />
                  </button>
                )}
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
  parties,
  editingInvoice,
  onSave,
  onDelete,
  onOperation,
  onDone,
}: {
  type: InvoiceType;
  invoices: Invoice[];
  parties: Party[];
  editingInvoice?: Invoice | null;
  onSave: (invoice: Invoice) => void;
  onDelete?: (id: string) => void;
  onOperation: (operation: LinkedOperation) => void;
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEditing && !window.confirm("Tem certeza que deseja salvar as alterações deste lançamento?")) return;
    const form = new FormData(event.currentTarget);
    const mainCfop = String(form.get("mainCfop") || "");
    const items = itemIndexes.map((index) => makeItem(form, type, index, mainCfop));
    const totalProducts = items.reduce((total, item) => total + item.totalValue, 0);
    const freightValue = cleanNumber(form.get("freightValue"));
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
      onOperation({
        id: newId("op"),
        companyId: "msg",
        operationType: invoice.linkedOperationType || "Compra com triangulação",
        mainInvoiceId: invoice.id,
        linkedInvoiceId: invoices.find((candidate) => candidate.invoiceNumber === invoice.linkedInvoiceNumber)?.id,
        mainInvoiceNumber: invoice.invoiceNumber,
        linkedInvoiceNumber: invoice.linkedInvoiceNumber || "",
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
        createdAt: now,
        updatedAt: now,
      });
    }

    onDone();
  }

  return (
    <form className="view-stack" onSubmit={submit}>
      <section className="panel">
        <div className="panel-title between">
          <div className="panel-title">
            <Files size={20} />
            <h2>{isEditing ? "Alterar lançamento" : isReceived ? "Nova Nota Recebida" : "Nova Nota Emitida"}</h2>
          </div>
          {isEditing && onDelete && (
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
          <Field label={isReceived ? "Data de emissao fornecedor" : "Data de emissao"} name="issueDate" type="date" defaultValue={editingInvoice?.issueDate || todayIso()} required />
          <Field label="Número da nota" name="invoiceNumber" defaultValue={(editingInvoice?.invoiceNumber || "").replace(/\D/g, "")} required inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
          <PartySelect
            label={isReceived ? "Fornecedor" : "Cliente"}
            name="partyId"
            kind={isReceived ? "supplier" : "customer"}
            parties={parties}
            value={selectedParty?.id || ""}
            onChange={setSelectedParty}
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
          <ActionButton
            icon={Plus}
            variant="ghost"
            onClick={() => setItemIndexes((current) => [...current, Math.max(...current) + 1])}
          >
            Adicionar item
          </ActionButton>
        </div>
        <div className="items-stack">
          {itemIndexes.map((itemIndex, position) => (
            <article className="item-card" key={itemIndex}>
              <div className="panel-title between">
                <h3>Item {position + 1}</h3>
                {itemIndexes.length > 1 && (
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
                <Field label="Descrição do produto/serviço" name={`description_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.description || ""} required sanitize="letters" pattern="[A-Za-zÀ-ÿ\\s]*" />
                {isReceived && <Field label="Categoria" name={`category_${itemIndex}`} options={fiscalConfig.categories} defaultValue={editingInvoice?.items[position]?.category || ""} />}
                {isReceived && <Field label="Centro de custo" name={`costCenter_${itemIndex}`} options={fiscalConfig.costCenters} defaultValue={editingInvoice?.items[position]?.costCenter || ""} />}
                <Field label="NCM" name={`ncm_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.ncm || ""} required inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <Field label="CST ICMS" name={`cstIcms_${itemIndex}`} options={fiscalConfig.csts} defaultValue={editingInvoice?.items[position]?.cstIcms || ""} />
                <Field label="Unidade" name={`unit_${itemIndex}`} options={fiscalConfig.units || unitOptions} defaultValue={editingInvoice?.items[position]?.unit || "UN"} />
                <Field label="Quantidade" name={`quantity_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.quantity || "1"} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />
                <MoneyField label="Valor unitario" name={`unitValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.unitValue || 0)} />
                <MoneyField label="Valor total" name={`totalValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.totalValue || 0)} />
                <MoneyField label="Base ICMS" name={`icmsBase_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.icmsBase || 0)} />
                <Field label="Alíquota ICMS %" name={`icmsRate_${itemIndex}`} type="number" defaultValue={editingInvoice?.items[position]?.icmsRate || (isReceived ? 12 : fiscalConfig.icmsRate)} />
                <MoneyField label="Valor ICMS" name={`icmsValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.icmsValue || 0)} />
                <MoneyField label="Base PIS/COFINS" name={`pisCofinsBase_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.pisBase || 0)} />
                <Field label="Alíquota PIS %" name={`pisRate_${itemIndex}`} type="number" defaultValue={editingInvoice?.items[position]?.pisRate || fiscalConfig.pisRate} />
                <MoneyField label="Valor PIS" name={`pisValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.pisValue || 0)} />
                <Field label="Alíquota COFINS %" name={`cofinsRate_${itemIndex}`} type="number" defaultValue={editingInvoice?.items[position]?.cofinsRate || fiscalConfig.cofinsRate} />
                <MoneyField label="Valor COFINS" name={`cofinsValue_${itemIndex}`} defaultValue={formatCurrency(editingInvoice?.items[position]?.cofinsValue || 0)} />
                {!isReceived && <Field label="Tipo do material" name={`materialType_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.materialType || ""} sanitize="letters" pattern="[A-Za-zÀ-ÿ\\s]*" />}
                {!isReceived && <Field label="Número do bloco" name={`blockNumber_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.blockNumber || ""} inputMode="numeric" sanitize="digits" pattern="[0-9]*" />}
                {!isReceived && <Field label="Cor do bloco" name={`blockColor_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.blockColor || ""} sanitize="letters" pattern="[A-Za-zÀ-ÿ\\s]*" />}
                {!isReceived && <Field label="Qualidade do bloco" name={`blockQuality_${itemIndex}`} options={blockQualityOptions} defaultValue={editingInvoice?.items[position]?.blockQuality || ""} />}
                {!isReceived && <Field label="Medidas do bloco" name={`blockMeasures_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.blockMeasures || ""} placeholder="1,50x2,00x10,50m" />}
                {!isReceived && <Field label="KG" name={`kilograms_${itemIndex}`} defaultValue={editingInvoice?.items[position]?.kilograms || "0"} inputMode="decimal" sanitize="kg" placeholder="17.310,50" />}
              </div>
              {isReceived && (
                <div className="check-row">
                  <label className="check">
                    <input name={`icmsCreditable_${itemIndex}`} type="checkbox" defaultChecked />
                    ICMS creditavel
                  </label>
                  <label className="check">
                    <input name={`pisCreditable_${itemIndex}`} type="checkbox" defaultChecked />
                    PIS creditavel
                  </label>
                  <label className="check">
                    <input name={`cofinsCreditable_${itemIndex}`} type="checkbox" defaultChecked />
                    COFINS creditavel
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
            <PartySelect
              label="Transportadora"
              name="carrierId"
              kind="carrier"
              parties={parties}
              value={selectedCarrier?.id || ""}
              onChange={setSelectedCarrier}
            />
            <input name="carrierName" type="hidden" value={selectedCarrier?.name || editingInvoice?.carrierName || ""} readOnly />
            <Field label="Vencimento" name="freightDueDate" type="date" />
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
                <Field label="Destinatario final" name="finalRecipientName" defaultValue={editingInvoice?.finalRecipientName || ""} />
                <Field label="CNPJ destinatario final" name="finalRecipientCnpj" />
                <Field label="Data da operacao" name="operationDate" type="date" defaultValue={todayIso()} />
                <MoneyField label="Valor vinculado" name="linkedAmount" defaultValue={formatCurrency(editingInvoice?.totalInvoice || 0)} />
              <label className="field">
                <span>Status da operacao</span>
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

      <div className="form-actions">
        <ActionButton icon={Save} type="submit">
          {isEditing ? "Salvar alterações" : "Salvar nota"}
        </ActionButton>
      </div>
    </form>
  );
}

function LinkedOperationsView({
  operations,
  onSave,
  onDelete,
}: {
  operations: LinkedOperation[];
  onSave: (op: LinkedOperation) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = operations.filter((op) =>
    [op.operationType, op.mainInvoiceNumber, op.linkedInvoiceNumber, op.supplierName, op.finalRecipientName, op.status]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

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
            actions={(op) => (
              <div className="row-actions">
                <button className="icon-btn" title="Finalizar" onClick={() => onSave({ ...op, status: "Finalizada", updatedAt: new Date().toISOString() })}>
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
                  onClick={() =>
                    window.confirm("Tem certeza que deseja editar esta operação vinculada?") &&
                    onSave({ ...op, updatedAt: new Date().toISOString() })
                  }
                >
                  <Pencil size={16} />
                </button>
                <button className="icon-btn danger" title="Excluir" onClick={() => window.confirm("Tem certeza que deseja excluir esta operação vinculada?") && onDelete(op.id)}>
                  <X size={16} />
                </button>
              </div>
            )}
          />
        </div>
      </section>
    </div>
  );
}

function SearchView({ invoices, operations }: { invoices: Invoice[]; operations: LinkedOperation[] }) {
  const [query, setQuery] = useState("");
  const rows = invoices.filter((invoice) =>
    [invoice.invoiceNumber, invoice.partyName, invoice.partyCnpj, invoice.mainCfop, invoice.natureOperation, invoice.status, invoice.items[0]?.description]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="toolbar flat">
          <label className="field wide">
            <span>Consulta fiscal avancada</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Periodo, tipo, cliente, fornecedor, CNPJ, NCM, CFOP, chave, status..." />
          </label>
        </div>
        <div className="table-wrap">
          <InvoiceRows invoices={rows} />
        </div>
      </section>
      <section className="panel">
        <h2>Operações encontradas</h2>
        <div className="table-wrap">
          <OperationRows operations={operations.filter((op) => JSON.stringify(op).toLowerCase().includes(query.toLowerCase()))} />
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
              <button onClick={() => exportRows(operations as unknown as Record<string, unknown>[], "operacoes")}>CSV</button>
              <button>PDF</button>
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
}: {
  registryParties: Party[];
  setRegistryParties: (value: Party[] | ((current: Party[]) => Party[])) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<Party["kind"]>("customer");

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
        <button className="add-card" type="button" onClick={() => setShowAdd((current) => !current)}>
          <Plus size={22} />
          <strong>Adicionar</strong>
        </button>
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
            <Field label="CNPJ/CPF" name="cnpj" />
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
                  <th>Ações</th>
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
                      <td>{party.active ? "Sim" : "Nao"}</td>
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

function SettingsView({ syncMode }: { syncMode: string }) {
  const [showEditor, setShowEditor] = useState(false);
  const [configSnapshot, setConfigSnapshot] = useState<FiscalConfig>({
    ...fiscalConfig,
    cfops: [...fiscalConfig.cfops],
    csts: [...fiscalConfig.csts],
    ncms: [...fiscalConfig.ncms],
    categories: [...fiscalConfig.categories],
    costCenters: [...fiscalConfig.costCenters],
    linkedTypes: [...fiscalConfig.linkedTypes],
    units: [...(fiscalConfig.units || unitOptions)],
  });

  function refreshConfigSnapshot() {
    setConfigSnapshot({
      ...fiscalConfig,
      cfops: [...fiscalConfig.cfops],
      csts: [...fiscalConfig.csts],
      ncms: [...fiscalConfig.ncms],
      categories: [...fiscalConfig.categories],
      costCenters: [...fiscalConfig.costCenters],
      linkedTypes: [...fiscalConfig.linkedTypes],
      units: [...(fiscalConfig.units || unitOptions)],
    });
  }

  function saveFiscalSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const listName = String(form.get("listName") || "") as keyof Pick<
      FiscalConfig,
      "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "linkedTypes" | "units"
    >;
    const itemValue = String(form.get("itemValue") || "").trim();

    if (listName === "units" && !fiscalConfig.units) fiscalConfig.units = [...unitOptions];
    if (listName && itemValue && !fiscalConfig[listName].includes(itemValue)) {
      fiscalConfig[listName].push(itemValue);
    }

    refreshConfigSnapshot();
    event.currentTarget.reset();
  }

  function editConfigItem(
    listName: keyof Pick<FiscalConfig, "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "linkedTypes" | "units">,
    itemValue: string,
  ) {
    if (!window.confirm("Tem certeza que deseja editar este item?")) return;
    const nextValue = window.prompt("Informe o novo valor:", itemValue)?.trim();
    if (!nextValue || nextValue === itemValue) return;
    if (listName === "units" && !fiscalConfig.units) fiscalConfig.units = [...unitOptions];
    fiscalConfig[listName] = fiscalConfig[listName].map((item) => (item === itemValue ? nextValue : item));
    refreshConfigSnapshot();
  }

  function deleteConfigItem(
    listName: keyof Pick<FiscalConfig, "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "linkedTypes" | "units">,
    itemValue: string,
  ) {
    if (!window.confirm("Tem certeza que deseja excluir este item?")) return;
    if (listName === "units" && !fiscalConfig.units) fiscalConfig.units = [...unitOptions];
    fiscalConfig[listName] = fiscalConfig[listName].filter((item) => item !== itemValue);
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
          <button className="add-card compact-card" type="button" onClick={() => setShowEditor((current) => !current)}>
            <Plus size={20} />
            <strong>Alterar/adicionar</strong>
          </button>
        </div>
        {showEditor && (
          <form className="settings-editor" onSubmit={saveFiscalSettings}>
            <div className="form-grid">
              <label className="field">
                <span>Lista para adicionar</span>
                <select name="listName" defaultValue="cfops">
                  <option value="cfops">CFOP</option>
                  <option value="csts">CST</option>
                  <option value="ncms">NCM</option>
                  <option value="categories">Categoria</option>
                  <option value="costCenters">Centro de custo</option>
                  <option value="linkedTypes">Tipo de operação vinculada</option>
                  <option value="units">Unidade</option>
                </select>
              </label>
              <Field label="Novo item" name="itemValue" />
              <div className="form-actions inline">
                <ActionButton icon={Save} type="submit">
                  Salvar alterações
                </ActionButton>
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
          ] as Array<[keyof Pick<FiscalConfig, "cfops" | "csts" | "ncms" | "categories" | "costCenters" | "linkedTypes" | "units">, string[]]>).flatMap(([listName, list]) =>
            list.map((item, index) => (
              <span className="tag-item" key={`${listName}-${item}-${index}`}>
                {item}
                <button className="edit-tag" type="button" title="Editar item" onClick={() => editConfigItem(listName, item)}>
                  <Pencil size={12} />
                </button>
                <button type="button" title="Excluir item" onClick={() => deleteConfigItem(listName, item)}>
                  <X size={13} />
                </button>
              </span>
            )),
          )}
        </div>
      </section>
      <section className="panel">
        <h2>Usuários e Permissões</h2>
        <div className="role-grid">
          {["Administrador", "Consulta", "Diretoria"].map((role) => (
            <article key={role}>
              <Users size={18} />
              <strong>{role}</strong>
              <span>Criar, editar, consultar, exportar e acompanhar conforme perfil.</span>
            </article>
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
          Modo atual de dados: {syncMode === "supabase" ? "Supabase Realtime" : "local demonstrativo"}.
        </div>
      </section>
    </div>
  );
}

function BackupView({ invoices, operations, resetDemo }: { invoices: Invoice[]; operations: LinkedOperation[]; resetDemo: () => void }) {
  return (
    <section className="panel">
      <h2>Backup</h2>
      <p className="muted">Exporte uma copia dos dados ou restaure a base demonstrativa.</p>
      <div className="backup-actions">
        <ActionButton icon={Download} onClick={() => exportRows(invoices as unknown as Record<string, unknown>[], "backup-notas")}>
          Backup notas
        </ActionButton>
        <ActionButton icon={Download} onClick={() => exportRows(operations as unknown as Record<string, unknown>[], "backup-operacoes")}>
          Backup operações
        </ActionButton>
        <ActionButton icon={RefreshCw} variant="ghost" onClick={resetDemo}>
          Restaurar demonstracao
        </ActionButton>
      </div>
    </section>
  );
}

export default function App() {
  const [logged, setLogged] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [registryParties, setRegistryParties] = useState<Party[]>(() => readLocal(PARTIES_KEY, parties));
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const store = useFiscalStore();

  const title = useMemo(() => views.find((item) => item.id === view)?.label || "Dashboard", [view]);
  const updateRegistryParties = (value: Party[] | ((current: Party[]) => Party[])) => {
    setRegistryParties((current) => {
      const next = typeof value === "function" ? value(current) : value;
      localStorage.setItem(PARTIES_KEY, JSON.stringify(next));
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

  if (!logged) {
    return <Login onLogin={() => setLogged(true)} />;
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
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => {
                if (id === "new-issued" || id === "new-received") setEditingInvoice(null);
                setView(id);
                setSidebarOpen(false);
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          <button onClick={() => setLogged(false)}>
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
          </div>
          <div className="sync-pill">
            <span className={store.syncMode === "supabase" ? "dot online" : "dot"} />
            {store.syncMode === "supabase" ? "Online sincronizado" : "Demo local"}
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
            />
          )}
          {view === "new-issued" && (
            <InvoiceForm
              type="issued"
              invoices={store.invoices}
              parties={registryParties}
              editingInvoice={editingInvoice?.invoiceType === "issued" ? editingInvoice : null}
              onSave={store.saveInvoice}
              onDelete={store.deleteInvoice}
              onOperation={store.saveLinkedOperation}
              onDone={() => {
                setEditingInvoice(null);
                setView("issued");
              }}
            />
          )}
          {view === "new-received" && (
            <InvoiceForm
              type="received"
              invoices={store.invoices}
              parties={registryParties}
              editingInvoice={editingInvoice?.invoiceType === "received" ? editingInvoice : null}
              onSave={store.saveInvoice}
              onDelete={store.deleteInvoice}
              onOperation={store.saveLinkedOperation}
              onDone={() => {
                setEditingInvoice(null);
                setView("received");
              }}
            />
          )}
          {view === "linked" && <LinkedOperationsView operations={store.linkedOperations} onSave={store.saveLinkedOperation} onDelete={store.deleteLinkedOperation} />}
          {view === "search" && <SearchView invoices={store.invoices} operations={store.linkedOperations} />}
          {view === "tax" && <TaxView totals={store.totals} invoices={store.invoices} />}
          {view === "reports" && <ReportsView invoices={store.invoices} operations={store.linkedOperations} />}
          {view === "registrations" && <RegistrationsView registryParties={registryParties} setRegistryParties={updateRegistryParties} />}
          {view === "settings" && <SettingsView syncMode={store.syncMode} />}
          {view === "backup" && <BackupView invoices={store.invoices} operations={store.linkedOperations} resetDemo={store.resetDemo} />}
        </div>
      </main>
    </div>
  );
}

