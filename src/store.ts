import { useCallback, useEffect, useState } from "react";
import { invoiceConsidersCost, invoiceConsidersSale, invoiceFinancialAmount } from "./data";
import { supabase } from "./supabase";
import { assetToRow, cashMovementToRow, checkToRow, invoiceToRow, operationToRow, productToRow, rowToAsset, rowToCashMovement, rowToCheck, rowToInvoice, rowToOperation, rowToProduct } from "./services/supabaseMappers";
import { AssetItem, CashMovement, CheckItem, Invoice, LinkedOperation, ProductItem } from "./types";

export function useFiscalStore() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [linkedOperations, setLinkedOperations] = useState<LinkedOperation[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [syncMode, setSyncMode] = useState<"offline" | "supabase">("offline");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;
    let mounted = true;

    const loadRemote = async () => {
      setSyncing(true);
      const { data: sessionData } = await client.auth.getSession();

      if (!sessionData.session) {
        if (mounted) {
          setInvoices([]);
          setLinkedOperations([]);
          setAssets([]);
          setCashMovements([]);
          setProducts([]);
          setChecks([]);
          setSyncMode("offline");
          setSyncing(false);
        }
        return;
      }

      const [invoiceResult, operationResult, assetResult, cashMovementResult, productResult, checkResult] = await Promise.all([
        client.from("invoices").select("*").order("issue_date", { ascending: false }),
        client.from("linked_operations").select("*").order("operation_date", { ascending: false }),
        client.from("assets").select("*").order("acquisition_date", { ascending: false }),
        client.from("cash_movements").select("*").order("movement_date", { ascending: false }),
        client.from("products").select("*").order("name", { ascending: true }),
        client.from("checks").select("*").order("received_date", { ascending: false }),
      ]);

      if (!mounted) return;

      if (invoiceResult.error || operationResult.error || assetResult.error || cashMovementResult.error || productResult.error) {
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

      if (assetResult.data) {
        setAssets(assetResult.data.map(rowToAsset));
      }

      if (cashMovementResult.data) {
        setCashMovements(cashMovementResult.data.map(rowToCashMovement));
      }

      if (productResult.data) {
        setProducts(productResult.data.map(rowToProduct));
      }

      if (!checkResult.error && checkResult.data) {
        setChecks(checkResult.data.map(rowToCheck));
      }

      setSyncMode("supabase");
      setLastSync(new Date().toISOString());
      setSyncing(false);
    };

    client.auth.getSession().then(({ data }) => {
      if (data.session) loadRemote();
      else setSyncMode("offline");
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) loadRemote();
      if (event === "SIGNED_OUT") {
        setInvoices([]);
        setLinkedOperations([]);
        setAssets([]);
        setCashMovements([]);
        setProducts([]);
        setChecks([]);
        setSyncMode("offline");
        setSyncing(false);
      }
    });

    const channel = client
      .channel("msg-fiscal-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "linked_operations" }, loadRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "assets" }, loadRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_movements" }, loadRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, loadRemote)
      .on("postgres_changes", { event: "*", schema: "public", table: "checks" }, loadRemote)
      .subscribe();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      client.removeChannel(channel);
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

  const saveAsset = useCallback(async (asset: AssetItem) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O patrimônio não foi salvo.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("assets").upsert(assetToRow(asset));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível salvar o patrimônio no Supabase.");
      return;
    }

    setAssets((current) => {
      const exists = current.some((item) => item.id === asset.id);
      return exists ? current.map((item) => (item.id === asset.id ? asset : item)) : [asset, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O patrimônio não foi excluído.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível excluir o patrimônio no Supabase.");
      return;
    }

    setAssets((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const saveCashMovement = useCallback(async (movement: CashMovement) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O movimento de caixa nao foi salvo.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("cash_movements").upsert(cashMovementToRow(movement));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel salvar o movimento de caixa no Supabase.");
      return;
    }

    setCashMovements((current) => {
      const exists = current.some((item) => item.id === movement.id);
      return exists ? current.map((item) => (item.id === movement.id ? movement : item)) : [movement, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const deleteCashMovement = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O movimento de caixa nao foi excluido.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("cash_movements").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel excluir o movimento de caixa no Supabase.");
      return;
    }

    setCashMovements((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const saveProduct = useCallback(async (product: ProductItem) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O produto nao foi salvo.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("products").upsert(productToRow(product));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel salvar o produto no Supabase.");
      return;
    }

    setProducts((current) => {
      const exists = current.some((item) => item.id === product.id);
      return exists
        ? current.map((item) => (item.id === product.id ? product : item)).sort((a, b) => a.name.localeCompare(b.name))
        : [...current, product].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O produto nao foi excluido.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel excluir o produto no Supabase.");
      return;
    }

    setProducts((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const saveCheck = useCallback(async (check: CheckItem) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O cheque nao foi salvo.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("checks").upsert(checkToRow(check));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel salvar o cheque no Supabase.");
      return;
    }

    setChecks((current) => {
      const exists = current.some((item) => item.id === check.id);
      return exists ? current.map((item) => (item.id === check.id ? check : item)) : [check, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const deleteCheck = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O cheque nao foi excluido.");
      return;
    }

    setSyncing(true);
    const { error } = await supabase.from("checks").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel excluir o cheque no Supabase.");
      return;
    }

    setChecks((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
  }, []);

  const issued = invoices.filter((invoice) => invoice.invoiceType === "issued");
  const received = invoices.filter((invoice) => invoice.invoiceType === "received");
  const taxableIssued = issued.filter(invoiceConsidersSale);
  const taxableReceived = received.filter(invoiceConsidersCost);
  const sum = (items: Invoice[], field: keyof Invoice) =>
    items.reduce((total, item) => total + Number(item[field] || 0), 0);
  const cfemDue = taxableIssued.reduce((total, invoice) => {
    const base = invoice.totalInvoice - invoice.icmsValue - invoice.pisValue - invoice.cofinsValue;
    return total + Math.max(base, 0) * 0.02;
  }, 0);

  const totals = {
    issued,
    received,
    revenue: taxableIssued.reduce((total, invoice) => total + invoiceFinancialAmount(invoice), 0),
    purchases: taxableReceived.reduce((total, invoice) => total + invoiceFinancialAmount(invoice), 0),
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
    soldWeight: taxableIssued.reduce(
      (total, invoice) =>
        total + invoice.items.reduce((sub, item) => sub + Number(item.kilograms || 0), 0),
      0,
    ),
    averageTicket: taxableIssued.length
      ? taxableIssued.reduce((total, invoice) => total + invoiceFinancialAmount(invoice), 0) / taxableIssued.length
      : 0,
  };

  return {
    invoices,
    linkedOperations,
    assets,
    cashMovements,
    products,
    checks,
    totals,
    syncMode,
    syncing,
    lastSync,
    saveInvoice,
    deleteInvoice,
    saveLinkedOperation,
    deleteLinkedOperation,
    saveAsset,
    deleteAsset,
    saveCashMovement,
    deleteCashMovement,
    saveProduct,
    deleteProduct,
    saveCheck,
    deleteCheck,
  };
}

