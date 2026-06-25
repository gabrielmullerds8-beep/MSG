import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { Invoice, InvoiceItem, LinkedOperation } from "./types";

const isTaxableReceivedInvoice = (invoice: Invoice) => {
  if (invoice.invoiceType !== "received") return false;
  if (invoice.hasLinkedOperation) return invoice.mainCfop === "5119";
  return invoice.mainCfop !== "5923";
};

const invoiceToRow = (invoice: Invoice) => ({
  id: invoice.id,
  company_id: invoice.companyId,
  invoice_type: invoice.invoiceType,
  operation_type: invoice.operationType,
  invoice_number: invoice.invoiceNumber,
  series: invoice.series,
  access_key: invoice.accessKey,
  issue_date: invoice.issueDate,
  entry_date: invoice.entryDate || null,
  exit_date: invoice.exitDate || null,
  party_name: invoice.partyName,
  party_cnpj: invoice.partyCnpj,
  party_ie: invoice.partyIe || null,
  city: invoice.city,
  state: invoice.state,
  nature_operation: invoice.natureOperation,
  main_cfop: invoice.mainCfop,
  purpose: invoice.purpose,
  payment_condition: invoice.paymentCondition,
  payment_method: invoice.paymentMethod,
  due_date: invoice.dueDate || null,
  pf_value: invoice.pfValue || 0,
  carrier_name: invoice.carrierName || null,
  payment_date: invoice.paymentDate || null,
  paid: invoice.paid,
  status: invoice.status,
  category: invoice.category || null,
  cost_center: invoice.costCenter || null,
  total_products: invoice.totalProducts,
  freight_value: invoice.freightValue,
  total_invoice: invoice.totalInvoice,
  icms_base: invoice.icmsBase,
  icms_value: invoice.icmsValue,
  icms_credit_value: invoice.icmsCreditValue,
  pis_base: invoice.pisBase,
  pis_value: invoice.pisValue,
  pis_credit_value: invoice.pisCreditValue,
  cofins_base: invoice.cofinsBase,
  cofins_value: invoice.cofinsValue,
  cofins_credit_value: invoice.cofinsCreditValue,
  cfem_base: invoice.cfemBase,
  cfem_rate: invoice.cfemRate,
  cfem_value: invoice.cfemValue,
  tax_benefit: invoice.taxBenefit || null,
  legal_basis: invoice.legalBasis || null,
  additional_info: invoice.additionalInfo || null,
  internal_notes: invoice.internalNotes || null,
  xml_file_name: invoice.xmlFileName || null,
  pdf_file_name: invoice.pdfFileName || null,
  has_linked_operation: invoice.hasLinkedOperation,
  linked_operation_type: invoice.linkedOperationType || null,
  linked_invoice_number: invoice.linkedInvoiceNumber || null,
  final_recipient_name: invoice.finalRecipientName || null,
  physical_receiver_name: invoice.physicalReceiverName || null,
  created_at: invoice.createdAt,
  updated_at: invoice.updatedAt,
  items: invoice.items,
});

const rowToInvoice = (row: Record<string, any>): Invoice => ({
  id: row.id,
  companyId: row.company_id,
  invoiceType: row.invoice_type,
  operationType: row.operation_type,
  invoiceNumber: row.invoice_number,
  series: row.series,
  accessKey: row.access_key || "",
  issueDate: row.issue_date,
  entryDate: row.entry_date || undefined,
  exitDate: row.exit_date || undefined,
  partyName: row.party_name,
  partyCnpj: row.party_cnpj,
  partyIe: row.party_ie || undefined,
  city: row.city,
  state: row.state,
  natureOperation: row.nature_operation,
  mainCfop: row.main_cfop,
  purpose: row.purpose,
  paymentCondition: row.payment_condition,
  paymentMethod: row.payment_method,
  dueDate: row.due_date || undefined,
  pfValue: Number(row.pf_value || 0),
  carrierName: row.carrier_name || undefined,
  paymentDate: row.payment_date || undefined,
  paid: Boolean(row.paid),
  status: row.status,
  category: row.category || undefined,
  costCenter: row.cost_center || undefined,
  totalProducts: Number(row.total_products || 0),
  freightValue: Number(row.freight_value || 0),
  totalInvoice: Number(row.total_invoice || 0),
  icmsBase: Number(row.icms_base || 0),
  icmsValue: Number(row.icms_value || 0),
  icmsCreditValue: Number(row.icms_credit_value || 0),
  pisBase: Number(row.pis_base || 0),
  pisValue: Number(row.pis_value || 0),
  pisCreditValue: Number(row.pis_credit_value || 0),
  cofinsBase: Number(row.cofins_base || 0),
  cofinsValue: Number(row.cofins_value || 0),
  cofinsCreditValue: Number(row.cofins_credit_value || 0),
  cfemBase: Number(row.cfem_base || 0),
  cfemRate: Number(row.cfem_rate || 0),
  cfemValue: Number(row.cfem_value || 0),
  taxBenefit: row.tax_benefit || undefined,
  legalBasis: row.legal_basis || undefined,
  additionalInfo: row.additional_info || undefined,
  internalNotes: row.internal_notes || undefined,
  xmlFileName: row.xml_file_name || undefined,
  pdfFileName: row.pdf_file_name || undefined,
  hasLinkedOperation: Boolean(row.has_linked_operation),
  linkedOperationType: row.linked_operation_type || undefined,
  linkedInvoiceNumber: row.linked_invoice_number || undefined,
  finalRecipientName: row.final_recipient_name || undefined,
  physicalReceiverName: row.physical_receiver_name || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  items: (row.items || []) as InvoiceItem[],
});

const operationToRow = (op: LinkedOperation) => ({
  id: op.id,
  company_id: op.companyId,
  operation_type: op.operationType,
  main_invoice_id: op.mainInvoiceId || null,
  linked_invoice_id: op.linkedInvoiceId || null,
  main_invoice_number: op.mainInvoiceNumber,
  linked_invoice_number: op.linkedInvoiceNumber,
  supplier_name: op.supplierName,
  final_recipient_name: op.finalRecipientName,
  final_recipient_cnpj: op.finalRecipientCnpj,
  physical_receiver_name: op.physicalReceiverName,
  physical_receiver_cnpj: op.physicalReceiverCnpj,
  main_cfop: op.mainCfop,
  linked_cfop: op.linkedCfop,
  main_access_key: op.mainAccessKey || null,
  linked_access_key: op.linkedAccessKey || null,
  operation_date: op.operationDate,
  amount: op.amount,
  status: op.status,
  notes: op.notes,
  created_at: op.createdAt,
  updated_at: op.updatedAt,
});

const rowToOperation = (row: Record<string, any>): LinkedOperation => ({
  id: row.id,
  companyId: row.company_id,
  operationType: row.operation_type,
  mainInvoiceId: row.main_invoice_id || undefined,
  linkedInvoiceId: row.linked_invoice_id || undefined,
  mainInvoiceNumber: row.main_invoice_number,
  linkedInvoiceNumber: row.linked_invoice_number,
  supplierName: row.supplier_name,
  finalRecipientName: row.final_recipient_name,
  finalRecipientCnpj: row.final_recipient_cnpj,
  physicalReceiverName: row.physical_receiver_name,
  physicalReceiverCnpj: row.physical_receiver_cnpj,
  mainCfop: row.main_cfop,
  linkedCfop: row.linked_cfop,
  mainAccessKey: row.main_access_key || undefined,
  linkedAccessKey: row.linked_access_key || undefined,
  operationDate: row.operation_date,
  amount: Number(row.amount || 0),
  status: row.status,
  notes: row.notes || "",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function useFiscalStore() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [linkedOperations, setLinkedOperations] = useState<LinkedOperation[]>([]);
  const [syncMode, setSyncMode] = useState<"offline" | "supabase">("offline");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    const loadRemote = async () => {
      setSyncing(true);
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        if (mounted) {
          setInvoices([]);
          setLinkedOperations([]);
          setSyncMode("offline");
          setSyncing(false);
        }
        return;
      }

      const [invoiceResult, operationResult] = await Promise.all([
        supabase.from("invoices").select("*").order("issue_date", { ascending: false }),
        supabase.from("linked_operations").select("*").order("operation_date", { ascending: false }),
      ]);

      if (!mounted) return;

      if (invoiceResult.error || operationResult.error) {
        setSyncMode("offline");
        setSyncing(false);
        return;
      }

      if (invoiceResult.data) {
        setInvoices(invoiceResult.data.map(rowToInvoice));
      }

      if (operationResult.data) {
        setLinkedOperations(operationResult.data.map(rowToOperation));
      }

      setSyncMode("supabase");
      setLastSync(new Date().toISOString());
      setSyncing(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) loadRemote();
      else setSyncMode("offline");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) loadRemote();
      if (event === "SIGNED_OUT") {
        setInvoices([]);
        setLinkedOperations([]);
        setSyncMode("offline");
      }
    });

    const channel = supabase
      .channel("msg-fiscal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "linked_operations" }, loadRemote)
      .subscribe();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const saveInvoice = useCallback(async (invoice: Invoice) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O lançamento não foi salvo.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("invoices").upsert(invoiceToRow(invoice));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível salvar no Supabase. Verifique a conexão e tente novamente.");
      return;
    }

    setInvoices((current) => {
      const exists = current.some((item) => item.id === invoice.id);
      return exists
        ? current.map((item) => (item.id === invoice.id ? invoice : item))
        : [invoice, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const deleteInvoice = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O lançamento não foi excluído.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível excluir no Supabase. Verifique a conexão e tente novamente.");
      return;
    }

    setInvoices((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const saveLinkedOperation = useCallback(async (operation: LinkedOperation) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. A operação não foi salva.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("linked_operations").upsert(operationToRow(operation));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível salvar no Supabase. Verifique a conexão e tente novamente.");
      return;
    }

    setLinkedOperations((current) => {
      const exists = current.some((item) => item.id === operation.id);
      return exists
        ? current.map((item) => (item.id === operation.id ? operation : item))
        : [operation, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const deleteLinkedOperation = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. A operação não foi excluída.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("linked_operations").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível excluir no Supabase. Verifique a conexão e tente novamente.");
      return;
    }

    setLinkedOperations((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const markInvoicePaid = useCallback(
    (invoice: Invoice) =>
      saveInvoice({
        ...invoice,
        paid: true,
        paymentDate: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      }),
    [saveInvoice],
  );

  const totals = useMemo(() => {
    const issued = invoices.filter((invoice) => invoice.invoiceType === "issued");
    const received = invoices.filter((invoice) => invoice.invoiceType === "received");
    const taxableIssued = issued.filter((invoice) => invoice.mainCfop === "5101");
    const taxableReceived = received.filter(isTaxableReceivedInvoice);
    const sum = (items: Invoice[], field: keyof Invoice) =>
      items.reduce((total, item) => total + Number(item[field] || 0), 0);
    const cfemDue = taxableIssued.reduce((total, invoice) => {
      const base =
        invoice.totalInvoice -
        invoice.icmsValue -
        invoice.pisValue -
        invoice.cofinsValue;
      return total + Math.max(base, 0) * 0.02;
    }, 0);

    return {
      issued,
      received,
      revenue: sum(taxableIssued, "totalInvoice"),
      purchases: sum(taxableReceived, "totalInvoice"),
      issuedCount: issued.length,
      receivedCount: received.length,
      icmsDebit: sum(taxableIssued, "icmsValue"),
      icmsCredit: sum(taxableReceived, "icmsCreditValue"),
      pisDebit: sum(taxableIssued, "pisValue"),
      pisCredit: sum(taxableReceived, "pisCreditValue"),
      cofinsDebit: sum(taxableIssued, "cofinsValue"),
      cofinsCredit: sum(taxableReceived, "cofinsCreditValue"),
      cfemDue,
      canceled: invoices.filter((invoice) => invoice.status === "Cancelada").length,
      linkedCount: linkedOperations.length,
      soldWeight: issued.reduce(
        (total, invoice) =>
          total + invoice.items.reduce((sub, item) => sub + Number(item.kilograms || 0), 0),
        0,
      ),
      averageTicket: issued.length ? sum(issued, "totalInvoice") / issued.length : 0,
    };
  }, [invoices, linkedOperations]);

  return {
    invoices,
    linkedOperations,
    totals,
    syncMode,
    syncing,
    lastSync,
    saveInvoice,
    deleteInvoice,
    saveLinkedOperation,
    deleteLinkedOperation,
    markInvoicePaid,
  };
}
