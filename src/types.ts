export type InvoiceType = "issued" | "received";

export type InvoiceStatus =
  | "Lancada"
  | "Pendente"
  | "Cancelada"
  | "Aguardando XML"
  | "Em conferência";

export type LinkedStatus =
  | "Aberta"
  | "Finalizada"
  | "Parcialmente vinculada"
  | "Pendente de XML"
  | "Pendente de conferência"
  | "Cancelada";

export interface InvoiceItem {
  id: string;
  productId?: string;
  itemCode: string;
  description: string;
  category: string;
  costCenter: string;
  accountingAccount?: string;
  productColor?: string;
  ncm: string;
  cfop: string;
  cstIcms: string;
  unit: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  discountValue?: number;
  freightValue?: number;
  icmsBase: number;
  icmsRate: number;
  icmsValue: number;
  icmsCreditable: boolean;
  pisBase: number;
  pisRate?: number;
  pisValue: number;
  pisCreditable: boolean;
  cofinsBase: number;
  cofinsRate?: number;
  cofinsValue: number;
  cofinsCreditable: boolean;
  ipiBase?: number;
  ipiRate?: number;
  ipiValue?: number;
  ibsBase?: number;
  ibsRate?: number;
  ibsValue?: number;
  cbsBase?: number;
  cbsRate?: number;
  cbsValue?: number;
  cfemRate: number;
  cfemValue: number;
  materialType?: string;
  blockNumber?: string;
  blockColor?: string;
  blockQuality?: string;
  blockMeasures?: string;
  cubicMeters?: number;
  kilograms?: number;
  tons?: number;
  notes?: string;
}

export interface PaymentInstallment {
  id: string;
  paymentCondition: string;
  paymentMethod: string;
  holder?: string;
  dueDate: string;
  amount: number;
  pfValue: number;
  paid: boolean;
  paymentDate?: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  companyId: string;
  invoiceType: InvoiceType;
  operationType: string;
  invoiceNumber: string;
  series: string;
  accessKey: string;
  issueDate: string;
  entryDate?: string;
  exitDate?: string;
  partyName: string;
  partyCnpj: string;
  partyIe?: string;
  city: string;
  state: string;
  natureOperation: string;
  mainCfop: string;
  purpose: string;
  paymentCondition: string;
  paymentMethod: string;
  dueDate?: string;
  pfValue?: number;
  carrierName?: string;
  paymentDate?: string;
  paid: boolean;
  status: InvoiceStatus;
  category?: string;
  costCenter?: string;
  totalProducts: number;
  freightValue: number;
  discountValue?: number;
  retentionType?: string;
  retentionValue?: number;
  totalInvoice: number;
  icmsBase: number;
  icmsValue: number;
  icmsCreditValue: number;
  pisBase: number;
  pisValue: number;
  pisCreditValue: number;
  cofinsBase: number;
  cofinsValue: number;
  cofinsCreditValue: number;
  cfemBase: number;
  cfemRate: number;
  cfemValue: number;
  taxBenefit?: string;
  legalBasis?: string;
  additionalInfo?: string;
  internalNotes?: string;
  xmlFileName?: string;
  pdfFileName?: string;
  hasLinkedOperation: boolean;
  linkedOperationType?: string;
  linkedInvoiceNumber?: string;
  finalRecipientName?: string;
  physicalReceiverName?: string;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
  financialInstallments?: PaymentInstallment[];
}

export interface ProductItem {
  id: string;
  name: string;
  ncm: string;
  defaultCostCenter: string;
  defaultCategory: string;
  defaultUnit: string;
  accountingAccount: string;
  color: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedOperation {
  id: string;
  companyId: string;
  operationType: string;
  mainInvoiceId?: string;
  linkedInvoiceId?: string;
  mainInvoiceNumber: string;
  linkedInvoiceNumber: string;
  supplierName: string;
  finalRecipientName: string;
  finalRecipientCnpj: string;
  physicalReceiverName: string;
  physicalReceiverCnpj: string;
  mainCfop: string;
  linkedCfop: string;
  mainAccessKey?: string;
  linkedAccessKey?: string;
  operationDate: string;
  amount: number;
  status: LinkedStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Party {
  id: string;
  kind: "customer" | "supplier" | "carrier";
  name: string;
  cnpj: string;
  ie: string;
  city: string;
  state: string;
  address: string;
  phone: string;
  email: string;
  category?: string;
  plate?: string;
  active: boolean;
}

export interface FiscalConfig {
  icmsRate: number;
  pisRate: number;
  cofinsRate: number;
  cfemRate: number;
  bankBalance?: number;
  cfops: string[];
  cfopRules?: Record<string, CfopRule>;
  csts: string[];
  ncms: string[];
  categories: string[];
  costCenters: string[];
  linkedTypes: string[];
  units?: string[];
}

export interface CfopRule {
  considerSale?: boolean;
  considerCost?: boolean;
}

export interface AssetItem {
  id: string;
  itemType: string;
  itemName: string;
  acquisitionDate: string;
  acquisitionValue: number;
  plate?: string;
  registrationNumber?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CashMovementType = "entry" | "outflow" | "transfer";

export interface CashMovement {
  id: string;
  movementType: CashMovementType;
  date: string;
  holder: string;
  destinationHolder?: string;
  costCenter: string;
  destinationCostCenter?: string;
  history: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
}
