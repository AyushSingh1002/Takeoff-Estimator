export type Role = 'customer' | 'reviewer' | 'admin';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  company?: string;
  role: Role;
  isActive: boolean;
  freeTrialUsedAt?: string;
  lastLoginAt?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  reference: string;
  regionPackCode: string;
  status: string;
  createdAt?: string;
}

export interface DrawingFile {
  id: string;
  projectId: string;
  originalName: string;
  sizeBytes: number;
  contentType: string;
  pageCount?: number;
  status: string;
  rejectionReason?: string;
  createdAt?: string;
  intakeReport?: {
    status: string;
    rejectionReason?: string;
    pageCount: number;
    sourceKind: string;
    unreadablePages: number;
    missingScalePages: number;
  };
}

export interface SheetScale {
  status: string;
  label?: string;
  ratio?: number;
  source?: string;
  confidence?: number;
}

export interface DrawingSheet {
  id: string;
  projectId: string;
  fileId: string;
  fileName?: string;
  pageNumber: number;
  sourceKind: string;
  sheetNumber?: string;
  title?: string;
  classification: string;
  classificationConfidence: number;
  discipline: string;
  sheetType: string;
  quality: string;
  qualityReasons: string[];
  widthPt?: number;
  heightPt?: number;
  scale: SheetScale;
  inclusion: string;
  exclusionReason?: string;
}

export interface PriceQuote {
  planCode: string;
  planVersion: number;
  amountMinor: number;
  currency: string;
  isFreeTrial: boolean;
  overage: boolean;
}

export interface ProjectQuote {
  projectId: string;
  sheetCount: number;
  includedSheets: number;
  excludedSheets: number;
  price: PriceQuote;
  entitlement: {
    allowed: boolean;
    code?: string;
    message?: string;
  };
  targetTurnaroundHours: number;
  targetDeadlineAt: string;
}

export interface JobProgress {
  stage: 'processing' | 'review' | 'preparing' | 'ready' | 'delayed' | 'cancelled';
  label: string;
}

export interface TakeoffJob {
  _id: string;
  projectId: string;
  parentJobId?: string;
  reason?: string;
  status: string;
  isTestData?: boolean;
  fileIds?: string[];
  sheetIds?: string[];
  priceQuote?: PriceQuote;
  sla: {
    submittedAt?: string;
    processingStartedAt?: string;
    qaCompletedAt?: string;
    deadlineAt?: string;
    deliveredAt?: string;
    status?: string;
  };
  createdAt?: string;
}

export interface ReviewerJobCounts {
  objects: number;
  measurements: number;
  boqItems: number;
  openDiscrepancies: number;
  blockingDiscrepancies: number;
  sheets: number;
}

export interface ReviewerJobSummary {
  job: TakeoffJob;
  projectReference?: string;
  counts: ReviewerJobCounts;
}

export interface ReviewerJobDetail {
  job: TakeoffJob;
  projectReference?: string;
  reviewStatus: string;
  counts: ReviewerJobCounts;
}

export interface ReviewerSheet {
  id: string;
  sheetRef: string;
  projectId: string;
  fileId: string;
  fileName?: string;
  pageNumber: number;
  sheetNumber?: string;
  title?: string;
  classification: string;
  classificationConfidence: number;
  discipline: string;
  sheetType: string;
  quality: string;
  qualityReasons: string[];
  widthPt?: number;
  heightPt?: number;
  scale: SheetScale;
  inclusion: string;
  exclusionReason?: string;
  objectCount: number;
  measurementCount: number;
  openDiscrepancies: number;
  blockingDiscrepancies: number;
  hasImage: boolean;
}

export interface DetectedObjectGeometry {
  kind: 'Point' | 'LineString' | 'Polygon';
  coordinates: number[][];
}

export interface DetectedObject {
  _id: string;
  sheetId?: string;
  class: string;
  geometry: DetectedObjectGeometry;
  confidence?: number;
}

export interface ReviewerMeasurement {
  _id: string;
  sheetId?: string;
  objectIds: string[];
  zone?: { level?: string; room?: string };
  type: string;
  value: number;
  unit: string;
  method: string;
  confidence: number;
  scaleRef?: string;
  annotationId?: string;
  geometry?: DetectedObjectGeometry;
}

export interface ReviewerDiscrepancy {
  _id: string;
  sheetId?: string;
  type: string;
  severity: 'info' | 'warning' | 'blocking';
  status: 'open' | 'resolved' | 'dismissed';
  note?: string;
  measurementId?: string;
  boqItemId?: string;
}

export interface ReviewerSheetDetail {
  sheet: ReviewerSheet;
  image: { url: string; expiresIn: number; contentType: string };
  objects: DetectedObject[];
  measurements: ReviewerMeasurement[];
  discrepancies: ReviewerDiscrepancy[];
}

export interface Deliverable {
  _id: string;
  projectId: string;
  jobId: string;
  type: 'boq_xlsx' | 'annotated_pdf';
  status: string;
  sizeBytes?: number;
  version: number;
  isTestData: boolean;
  createdAt?: string;
}

export interface BoqItem {
  _id: string;
  trade: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  wasteFactor: number;
  adjustedQuantity: number;
  reviewStatus: string;
  measurementIds?: string[];
  sheetRefs: string[];
  assumptions: string[];
  override?: { value: number; reason: string };
}

export interface UsageSummary {
  planCode: string;
  planVersion?: number;
  trialAvailable: boolean;
  trialUsedAt?: string;
  amountMinor?: number;
  currency?: string;
  maxSheets?: number;
  used?: number;
  includedTakeoffs?: number;
  remaining?: number;
  overageCount?: number;
  overageAmountMinor?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface Project {
  _id: string;
  name: string;
  reference: string;
  regionPackCode: string;
  tier?: string;
  location?: { country?: string; region?: string };
  status: string;
  createdAt?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  company?: string;
  role: Role;
  isActive: boolean;
  freeTrialUsedAt?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface AdminProject {
  _id: string;
  ownerId: string;
  name: string;
  reference: string;
  regionPackCode: string;
  tier?: string;
  status: string;
  submittedAt?: string;
  deliveredAt?: string;
  createdAt?: string;
}

export interface AdminProjectSummary {
  project: AdminProject;
  ownerEmail?: string;
}

export interface AdminReviewerAssignment {
  id: string;
  reviewerId: string;
  reviewerName?: string;
  reviewerEmail?: string;
  kind: string;
  status: string;
  startedAt?: string;
}

export interface AdminJobSummary {
  job: TakeoffJob;
  projectReference?: string;
  reviewers: AdminReviewerAssignment[];
}

export interface PricingPlan {
  _id: string;
  code: string;
  version: number;
  status: string;
  effectiveFrom: string;
  currency: string;
  amountMinor: number;
  parameters: {
    includedTakeoffs?: number;
    overageAmountMinor?: number;
    maxSheets?: number;
    turnaroundHours?: number;
  };
}

export interface RulePack {
  _id: string;
  trade: string;
  regionPackCode: string;
  version: string;
  status: string;
  parameters: Record<string, number>;
  unitsDisplay?: string;
  engineVersionRange?: string;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  createdAt?: string;
}

export interface AccuracyClaim {
  _id: string;
  jobId: string;
  projectId: string;
  filedBy: string;
  status: string;
  reason: string;
  evidence: string[];
  benchmarkId?: string;
  retakeoffJobId?: string;
  decision?: { by: string; note: string; at: string };
  createdAt?: string;
}

export interface AccuracyBenchmarkLine {
  trade: string;
  code: string;
  benchmarkQuantity: number;
  unit: string;
  deliveredQuantity: number;
  variancePct: number;
}

export interface AccuracyBenchmark {
  _id: string;
  jobId: string;
  source: string;
  benchmarkBy: string;
  lines: AccuracyBenchmarkLine[];
  metricVersion: string;
  withinTolerance: boolean;
  createdAt?: string;
}

export interface AccuracyClaimDetail {
  claim: AccuracyClaim;
  benchmark: AccuracyBenchmark | null;
}

export interface UploadTarget {
  url: string;
  fields: Record<string, string>;
}
