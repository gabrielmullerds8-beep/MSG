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
    let loadSequence = 0;

    const loadRemote = async () => {
      const sequence = ++loadSequence;
      setSyncing(true);
      const { data: sessionData } = await client.auth.getSession();

      if (!sessionData.session) {
        if (mounted && sequence === loadSequence) {
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

      if (!mounted || sequence !== loadSequence) return;

      if (invoiceResult.error || operationResult.error || assetResult.error || cashMovementResult.error || productResult.error || checkResult.error) {
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
      loadSequence += 1;
      subscription.unsubscribe();
      client.removeChannel(channel);
    };
  }, []);

  const saveInvoice = useCallback(async (invoice: Invoice) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O lançamento não foi salvo.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("invoices").upsert(invoiceToRow(invoice));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível salvar no Supabase. Verifique a conexão e tente novamente.");
      return false;
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
    return true;
  }, []);

  const deleteInvoice = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O lançamento não foi excluído.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível excluir no Supabase. Verifique a conexão e tente novamente.");
      return false;
    }

    setInvoices((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const saveLinkedOperation = useCallback(async (operation: LinkedOperation) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. A operação não foi salva.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("linked_operations").upsert(operationToRow(operation));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível salvar no Supabase. Verifique a conexão e tente novamente.");
      return false;
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
    return true;
  }, []);

  const deleteLinkedOperation = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. A operação não foi excluída.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("linked_operations").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível excluir no Supabase. Verifique a conexão e tente novamente.");
      return false;
    }

    setLinkedOperations((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const saveAsset = useCallback(async (asset: AssetItem) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O patrimônio não foi salvo.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("assets").upsert(assetToRow(asset));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível salvar o patrimônio no Supabase.");
      return false;
    }

    setAssets((current) => {
      const exists = current.some((item) => item.id === asset.id);
      return exists ? current.map((item) => (item.id === asset.id ? asset : item)) : [asset, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase não configurado. O patrimônio não foi excluído.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Não foi possível excluir o patrimônio no Supabase.");
      return false;
    }

    setAssets((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const saveCashMovement = useCallback(async (movement: CashMovement) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O movimento de caixa nao foi salvo.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("cash_movements").upsert(cashMovementToRow(movement));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel salvar o movimento de caixa no Supabase.");
      return false;
    }

    setCashMovements((current) => {
      const exists = current.some((item) => item.id === movement.id);
      return exists ? current.map((item) => (item.id === movement.id ? movement : item)) : [movement, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const deleteCashMovement = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O movimento de caixa nao foi excluido.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("cash_movements").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel excluir o movimento de caixa no Supabase.");
      return false;
    }

    setCashMovements((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const saveProduct = useCallback(async (product: ProductItem) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O produto nao foi salvo.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("products").upsert(productToRow(product));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel salvar o produto no Supabase.");
      return false;
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
    return true;
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O produto nao foi excluido.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel excluir o produto no Supabase.");
      return false;
    }

    setProducts((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const saveCheck = useCallback(async (check: CheckItem) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O cheque nao foi salvo.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("checks").upsert(checkToRow(check));
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel salvar o cheque no Supabase.");
      return false;
    }

    setChecks((current) => {
      const exists = current.some((item) => item.id === check.id);
      return exists ? current.map((item) => (item.id === check.id ? check : item)) : [check, ...current];
    });
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const deleteCheck = useCallback(async (id: string) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. O cheque nao foi excluido.");
      return false;
    }

    setSyncing(true);
    const { error } = await supabase.from("checks").delete().eq("id", id);
    if (error) {
      setSyncMode("offline");
      setSyncing(false);
      window.alert("Nao foi possivel excluir o cheque no Supabase.");
      return false;
    }

    setChecks((current) => current.filter((item) => item.id !== id));
    setSyncMode("supabase");
    setLastSync(new Date().toISOString());
    setSyncing(false);
    return true;
  }, []);

  const migrateConfigurationReferences = useCallback(async (
    listName: string,
    previousValue: string,
    nextValue: string | null,
  ) => {
    if (!supabase) {
      setSyncMode("offline");
      window.alert("Supabase nao configurado. Os lancamentos vinculados nao foram atualizados.");
      return false;
    }

    const replacement = nextValue || "";
    const previousCfopCode = previousValue.split(" - ")[0].trim();
    const nextCfopCode = nextValue ? nextValue.split(" - ")[0].trim() : "";
    const replaceExact = (value?: string) => value === previousValue ? replacement : value;
    const replaceCfop = (value?: string) => value === previousCfopCode ? nextCfopCode : value;
    const replaceInstallments = (invoice: Invoice) => (invoice.financialInstallments || []).map((installment) => ({
      ...installment,
      paymentCondition: listName === "paymentConditions" ? replaceExact(installment.paymentCondition) || "" : installment.paymentCondition,
      paymentMethod: listName === "paymentMethods" ? replaceExact(installment.paymentMethod) || "" : installment.paymentMethod,
      holder: listName === "holders" ? replaceExact(installment.holder) : installment.holder,
      pfHolder: listName === "holders" ? replaceExact(installment.pfHolder) : installment.pfHolder,
    }));
    const categoryList = listName === "categories";
    const now = new Date().toISOString();

    const nextInvoices = invoices.map((invoice) => {
      const candidate = {
        ...invoice,
        operationType: listName === "operationTypes" ? replaceExact(invoice.operationType) || "" : invoice.operationType,
        mainCfop: listName === "cfops" ? replaceCfop(invoice.mainCfop) || "" : invoice.mainCfop,
        status: listName === "invoiceStatuses" ? replaceExact(invoice.status) || "" : invoice.status,
        category: categoryList ? replaceExact(invoice.category) : invoice.category,
        costCenter: listName === "costCenters" ? replaceExact(invoice.costCenter) : invoice.costCenter,
        paymentCondition: listName === "paymentConditions" ? replaceExact(invoice.paymentCondition) || "" : invoice.paymentCondition,
        paymentMethod: listName === "paymentMethods" ? replaceExact(invoice.paymentMethod) || "" : invoice.paymentMethod,
        linkedOperationType: listName === "linkedTypes" ? replaceExact(invoice.linkedOperationType) : invoice.linkedOperationType,
        items: invoice.items.map((item) => ({
          ...item,
          category: categoryList ? replaceExact(item.category) || "" : item.category,
          costCenter: listName === "costCenters" ? replaceExact(item.costCenter) || "" : item.costCenter,
          cfop: listName === "cfops" ? replaceCfop(item.cfop) || "" : item.cfop,
          cstIcms: listName === "csts" ? replaceExact(item.cstIcms) || "" : item.cstIcms,
          unit: listName === "units" ? replaceExact(item.unit) || "" : item.unit,
        })),
        financialInstallments: replaceInstallments(invoice),
      };
      return JSON.stringify(candidate) === JSON.stringify(invoice) ? invoice : { ...candidate, updatedAt: now };
    });
    const changedInvoices = nextInvoices.filter((invoice, index) => invoice !== invoices[index]);

    const nextOperations = linkedOperations.map((operation) => {
      const candidate = {
        ...operation,
        operationType: listName === "linkedTypes" ? replaceExact(operation.operationType) || "" : operation.operationType,
        mainCfop: listName === "cfops" ? replaceCfop(operation.mainCfop) || "" : operation.mainCfop,
        linkedCfop: listName === "cfops" ? replaceCfop(operation.linkedCfop) || "" : operation.linkedCfop,
      };
      return JSON.stringify(candidate) === JSON.stringify(operation) ? operation : { ...candidate, updatedAt: now };
    });
    const changedOperations = nextOperations.filter((operation, index) => operation !== linkedOperations[index]);

    const nextProducts = products.map((product) => {
      const candidate = {
        ...product,
        defaultCategory: categoryList ? replaceExact(product.defaultCategory) || "" : product.defaultCategory,
        defaultCostCenter: listName === "costCenters" ? replaceExact(product.defaultCostCenter) || "" : product.defaultCostCenter,
        defaultUnit: listName === "units" ? replaceExact(product.defaultUnit) || "" : product.defaultUnit,
      };
      return JSON.stringify(candidate) === JSON.stringify(product) ? product : { ...candidate, updatedAt: now };
    });
    const changedProducts = nextProducts.filter((product, index) => product !== products[index]);

    const nextCashMovements = cashMovements.map((movement) => {
      const candidate = {
        ...movement,
        holder: listName === "holders" ? replaceExact(movement.holder) || "" : movement.holder,
        destinationHolder: listName === "holders" ? replaceExact(movement.destinationHolder) : movement.destinationHolder,
        costCenter: listName === "costCenters" ? replaceExact(movement.costCenter) || "" : movement.costCenter,
        destinationCostCenter: listName === "costCenters" ? replaceExact(movement.destinationCostCenter) : movement.destinationCostCenter,
      };
      return JSON.stringify(candidate) === JSON.stringify(movement) ? movement : { ...candidate, updatedAt: now };
    });
    const changedCashMovements = nextCashMovements.filter((movement, index) => movement !== cashMovements[index]);

    const nextChecks = checks.map((check) => {
      const candidate = {
        ...check,
        depositHolder: listName === "holders" ? replaceExact(check.depositHolder) : check.depositHolder,
        compensationHolder: listName === "holders" ? replaceExact(check.compensationHolder) : check.compensationHolder,
      };
      return JSON.stringify(candidate) === JSON.stringify(check) ? check : { ...candidate, updatedAt: now };
    });
    const changedChecks = nextChecks.filter((check, index) => check !== checks[index]);

    const nextAssets = assets.map((asset) => {
      const candidate = {
        ...asset,
        itemType: listName === "assetTypes" ? replaceExact(asset.itemType) || "" : asset.itemType,
      };
      return JSON.stringify(candidate) === JSON.stringify(asset) ? asset : { ...candidate, updatedAt: now };
    });
    const changedAssets = nextAssets.filter((asset, index) => asset !== assets[index]);

    const writes = [
      ...(changedInvoices.length ? [supabase.from("invoices").upsert(changedInvoices.map(invoiceToRow))] : []),
      ...(changedOperations.length ? [supabase.from("linked_operations").upsert(changedOperations.map(operationToRow))] : []),
      ...(changedProducts.length ? [supabase.from("products").upsert(changedProducts.map(productToRow))] : []),
      ...(changedCashMovements.length ? [supabase.from("cash_movements").upsert(changedCashMovements.map(cashMovementToRow))] : []),
      ...(changedChecks.length ? [supabase.from("checks").upsert(changedChecks.map(checkToRow))] : []),
      ...(changedAssets.length ? [supabase.from("assets").upsert(changedAssets.map(assetToRow))] : []),
    ];

    setSyncing(true);
    const results = await Promise.all(writes);
    if (results.some((result) => result.error)) {
      const rollbackWrites = [
        ...(changedInvoices.length ? [supabase.from("invoices").upsert(changedInvoices.map((item) => invoiceToRow(invoices.find((original) => original.id === item.id)!)))] : []),
        ...(changedOperations.length ? [supabase.from("linked_operations").upsert(changedOperations.map((item) => operationToRow(linkedOperations.find((original) => original.id === item.id)!)))] : []),
        ...(changedProducts.length ? [supabase.from("products").upsert(changedProducts.map((item) => productToRow(products.find((original) => original.id === item.id)!)))] : []),
        ...(changedCashMovements.length ? [supabase.from("cash_movements").upsert(changedCashMovements.map((item) => cashMovementToRow(cashMovements.find((original) => original.id === item.id)!)))] : []),
        ...(changedChecks.length ? [supabase.from("checks").upsert(changedChecks.map((item) => checkToRow(checks.find((original) => original.id === item.id)!)))] : []),
        ...(changedAssets.length ? [supabase.from("assets").upsert(changedAssets.map((item) => assetToRow(assets.find((original) => original.id === item.id)!)))] : []),
      ];
      await Promise.all(rollbackWrites);
      setSyncing(false);
      window.alert("Nao foi possivel atualizar todos os lancamentos vinculados. A alteracao foi desfeita.");
      return false;
    }

    if (changedInvoices.length) setInvoices(nextInvoices);
    if (changedOperations.length) setLinkedOperations(nextOperations);
    if (changedProducts.length) setProducts(nextProducts);
    if (changedCashMovements.length) setCashMovements(nextCashMovements);
    if (changedChecks.length) setChecks(nextChecks);
    if (changedAssets.length) setAssets(nextAssets);
    setSyncMode("supabase");
    setLastSync(now);
    setSyncing(false);
    return true;
  }, [assets, cashMovements, checks, invoices, linkedOperations, products]);

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
    migrateConfigurationReferences,
  };
}

