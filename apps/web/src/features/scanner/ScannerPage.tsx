import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAnalysisInputSchema,
  scannerManualFormSchema,
  type AnalysisDetail,
  type FinancialFact,
  type ScannerManualForm
} from '@marxmatrix/contracts';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/api-error.js';
import { apiClient } from '../../shared/api/runtime.js';
import { PageState } from '../../shared/ui/PageState.js';
import { useSessionStore } from '../auth/session.js';
import './ScannerWorkspace.css';

const ResultChart = lazy(async () =>
  import('./ResultChart.js').then((module) => ({ default: module.ResultChart }))
);
const fact = (
  key: string,
  label: string,
  value: number,
  classification: FinancialFact['classification'],
  form: ScannerManualForm,
  sensitivity: Pick<FinancialFact, 'sensitivityCategory' | 'sensitivityClassification'> &
    Partial<Pick<FinancialFact, 'reviewStatus'>> = {
    sensitivityCategory: 'standard',
    sensitivityClassification: null
  }
): FinancialFact => ({
  key,
  label,
  value,
  currency: form.currency,
  scale: form.scale,
  reportingPeriod: form.reportingPeriod,
  classification,
  extractionMode: 'manual',
  sourcePage: null,
  sourceChunkId: null,
  evidenceText: `Dữ liệu thủ công: ${label}.`,
  classificationReason: 'Accounting proxy do người học nhập và xác nhận.',
  reviewStatus: 'approved',
  ...sensitivity
});
const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
const metric = (value: number | null, suffix = '') =>
  value === null ? 'Không áp dụng' : `${value.toFixed(2)}${suffix}`;

const newIdempotencyKey = () =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
type IdempotencyOperation = { key: string; signature: string };
const stableOperationKey = (
  operation: { current: IdempotencyOperation | undefined },
  payload: unknown
) => {
  const signature = JSON.stringify(payload);
  if (operation.current?.signature !== signature)
    operation.current = { key: newIdempotencyKey(), signature };
  return operation.current.key;
};

export function ScannerPage() {
  const { analysisId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.user?.id);
  const [analysis, setAnalysis] = useState<AnalysisDetail>();
  const [serverError, setServerError] = useState<string>();
  const [retryAction, setRetryAction] = useState<(() => void) | undefined>();
  const [compareVersion, setCompareVersion] = useState<number>();
  const createdAnalysis = useRef<{ id: string; signature: string } | undefined>(undefined);
  const createIdempotency = useRef<IdempotencyOperation | undefined>(undefined);
  const createCalculationIdempotency = useRef<IdempotencyOperation | undefined>(undefined);
  const sensitivityCalculationIdempotency = useRef<IdempotencyOperation | undefined>(undefined);
  const reclassificationCalculationIdempotency = useRef<IdempotencyOperation | undefined>(
    undefined
  );
  const detail = useQuery({
    queryKey: ['analysis', userId, analysisId],
    enabled: analysisId !== undefined,
    queryFn: () => apiClient.request<AnalysisDetail>(`/analyses/${analysisId}`)
  });
  const form = useForm<ScannerManualForm>({
    resolver: zodResolver(scannerManualFormSchema),
    defaultValues: {
      title: '',
      currency: 'USD',
      reportingPeriod: 'FY2025',
      scale: 'millions',
      revenue: 1000,
      constantCapital: 400,
      variableCapital: 200,
      contractorAmount: 0,
      stockCompensationAmount: 0,
      needsReviewAmount: 0,
      needsReviewClassification: 'variable_capital',
      revenueAdjustment: 1,
      includeSurplusProxy: false,
      contractorClassification: 'constant_capital',
      includeStockCompensation: false,
      includeNeedsReview: false
    }
  });
  useEffect(() => {
    setAnalysis(undefined);
    setServerError(undefined);
    setRetryAction(undefined);
    setCompareVersion(undefined);
  }, [analysisId]);
  useEffect(() => {
    if (detail.data !== undefined && detail.data.id === analysisId) {
      setAnalysis(detail.data);
      form.setValue('title', detail.data.title);
      form.setValue('revenueAdjustment', detail.data.assumptions.revenueAdjustment);
      form.setValue('includeSurplusProxy', detail.data.assumptions.includeSurplusProxy);
      form.setValue('contractorClassification', detail.data.assumptions.contractorClassification);
      form.setValue('includeStockCompensation', detail.data.assumptions.includeStockCompensation);
      form.setValue('includeNeedsReview', detail.data.assumptions.includeNeedsReview);
    }
  }, [analysisId, detail.data, form]);
  const create = useMutation({
    mutationFn: async (values: ScannerManualForm) => {
      const creationKey = stableOperationKey(createIdempotency, values);
      const calculationKey = stableOperationKey(createCalculationIdempotency, values);
      const creationSignature = createIdempotency.current?.signature;
      if (creationSignature === undefined) throw new Error('Missing create operation signature.');
      if (createdAnalysis.current?.signature !== creationSignature)
        createdAnalysis.current = undefined;
      if (createdAnalysis.current === undefined) {
        const input = createAnalysisInputSchema.parse({
          title: values.title,
          facts: [
            fact('revenue', 'Doanh thu', values.revenue, 'revenue', values),
            fact(
              'constant-capital',
              'Tư bản bất biến',
              values.constantCapital,
              'constant_capital',
              values
            ),
            fact(
              'variable-capital',
              'Tư bản khả biến',
              values.variableCapital,
              'variable_capital',
              values
            ),
            fact('contractor', 'Chi phí contractor', values.contractorAmount, 'excluded', values, {
              sensitivityCategory: 'contractor',
              sensitivityClassification: null
            }),
            fact(
              'stock-compensation',
              'Stock compensation',
              values.stockCompensationAmount,
              'excluded',
              values,
              { sensitivityCategory: 'stock_compensation', sensitivityClassification: null }
            ),
            fact(
              'needs-review',
              'Khoản cần review',
              values.needsReviewAmount,
              'needs_review',
              values,
              {
                sensitivityCategory: 'standard',
                sensitivityClassification: values.needsReviewClassification,
                reviewStatus: 'pending_review'
              }
            )
          ],
          assumptions: {
            revenueAdjustment: values.revenueAdjustment,
            includeSurplusProxy: values.includeSurplusProxy,
            contractorClassification: values.contractorClassification,
            includeStockCompensation: values.includeStockCompensation,
            includeNeedsReview: values.includeNeedsReview,
            notes: 'Nhập thủ công từ Scanner.'
          }
        });
        const created = await apiClient.request<AnalysisDetail>('/analyses', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': creationKey
          },
          body: JSON.stringify(input)
        });
        createdAnalysis.current = { id: created.id, signature: creationSignature };
      }
      return apiClient.request<AnalysisDetail>(
        `/analyses/${createdAnalysis.current.id}/calculate`,
        {
          method: 'POST',
          headers: { 'idempotency-key': calculationKey }
        }
      );
    },
    onSuccess: (next) => {
      setAnalysis(next);
      createdAnalysis.current = undefined;
      createIdempotency.current = undefined;
      createCalculationIdempotency.current = undefined;
      setServerError(undefined);
      void navigate(`/scanner/${next.id}`, { replace: true });
      void queryClient.invalidateQueries({ queryKey: ['analyses', userId] });
    },
    onError: (error, values) => {
      setServerError(errorMessage(error));
      setRetryAction(() => () => create.mutate(values));
    }
  });
  const sensitivity = useMutation({
    mutationFn: async (assumptions: AnalysisDetail['assumptions']) => {
      const calculationKey = stableOperationKey(sensitivityCalculationIdempotency, assumptions);
      const current = analysis ?? detail.data;
      if (current === undefined) throw new Error('No active analysis.');
      await apiClient.request<AnalysisDetail>(`/analyses/${current.id}/assumptions`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(assumptions)
      });
      return apiClient.request<AnalysisDetail>(`/analyses/${current.id}/calculate`, {
        method: 'POST',
        headers: { 'idempotency-key': calculationKey }
      });
    },
    onSuccess: (next) => {
      setAnalysis(next);
      sensitivityCalculationIdempotency.current = undefined;
      setServerError(undefined);
      setRetryAction(undefined);
    },
    onError: (error, assumptions) => {
      setServerError(errorMessage(error));
      setRetryAction(() => () => sensitivity.mutate(assumptions));
    }
  });
  const submit = (values: ScannerManualForm) => create.mutate(values);
  const activeAnalysis =
    (analysisId === undefined || analysis?.id === analysisId ? analysis : undefined) ??
    (detail.data?.id === analysisId ? detail.data : undefined);
  const latest = activeAnalysis?.calculationVersions.at(-1);
  const reportingContext = activeAnalysis?.facts[0];
  const reclassify = useMutation({
    mutationFn: async ({ factId, input }: { factId: string; input: Record<string, unknown> }) => {
      const calculationKey = stableOperationKey(reclassificationCalculationIdempotency, {
        factId,
        input
      });
      if (activeAnalysis === undefined) throw new Error('No active analysis.');
      await apiClient.request<AnalysisDetail>(`/analyses/${activeAnalysis.id}/facts/${factId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      });
      return apiClient.request<AnalysisDetail>(`/analyses/${activeAnalysis.id}/calculate`, {
        method: 'POST',
        headers: { 'idempotency-key': calculationKey }
      });
    },
    onSuccess: (next) => {
      setAnalysis(next);
      reclassificationCalculationIdempotency.current = undefined;
      setServerError(undefined);
      setRetryAction(undefined);
    },
    onError: (error, variables) => {
      setServerError(errorMessage(error));
      setRetryAction(() => () => reclassify.mutate(variables));
    }
  });
  return (
    <section className="scanner-page scanner-workspace" aria-labelledby="scanner-page-title">
      <header className="scanner-workspace__header">
        <p className="scanner-workspace__index">
          {analysisId === undefined ? '06 / PHÂN TÍCH THỦ CÔNG' : '07 / PHIẾU PHÂN TÍCH'}
        </p>
        <h1 id="scanner-page-title">
          {analysisId === undefined ? 'Khởi tạo hồ sơ giá trị thặng dư' : 'Hồ sơ cấu trúc giá trị'}
        </h1>
        <p>
          Phân loại số liệu theo accounting proxy trước, rồi diễn giải thành value-structure
          estimate có giới hạn rõ ràng.
        </p>
      </header>
      {analysisId === undefined && (
        <form
          noValidate
          onSubmit={(event) => void form.handleSubmit(submit)(event)}
          className="scanner-form scanner-manual-form"
        >
          <h2>Nhập dữ kiện</h2>
          <section className="scanner-form-section" aria-labelledby="scanner-context-title">
            <h3 id="scanner-context-title">01 / Bối cảnh</h3>
            <label>
              Tiêu đề phân tích
              <input
                aria-invalid={form.formState.errors.title !== undefined}
                aria-describedby={form.formState.errors.title ? 'scanner-title-error' : undefined}
                {...form.register('title')}
              />
            </label>
            {form.formState.errors.title && (
              <p id="scanner-title-error" role="alert">
                {form.formState.errors.title.message}
              </p>
            )}
            <div className="scanner-fields">
              <label>
                Đơn vị tiền tệ
                <input
                  maxLength={3}
                  aria-invalid={form.formState.errors.currency !== undefined}
                  aria-describedby={
                    form.formState.errors.currency ? 'scanner-currency-error' : undefined
                  }
                  {...form.register('currency')}
                />
              </label>
              <label>
                Kỳ báo cáo
                <input
                  aria-invalid={form.formState.errors.reportingPeriod !== undefined}
                  aria-describedby={
                    form.formState.errors.reportingPeriod ? 'scanner-period-error' : undefined
                  }
                  {...form.register('reportingPeriod')}
                />
              </label>
              <label>
                Quy mô
                <select
                  aria-invalid={form.formState.errors.scale !== undefined}
                  aria-describedby={form.formState.errors.scale ? 'scanner-scale-error' : undefined}
                  {...form.register('scale')}
                >
                  <option value="ones">Đơn vị</option>
                  <option value="thousands">Nghìn</option>
                  <option value="millions">Triệu</option>
                  <option value="billions">Tỷ</option>
                </select>
              </label>
            </div>
          </section>
          {form.formState.errors.currency && (
            <p id="scanner-currency-error" role="alert">
              {form.formState.errors.currency.message}
            </p>
          )}
          {form.formState.errors.reportingPeriod && (
            <p id="scanner-period-error" role="alert">
              {form.formState.errors.reportingPeriod.message}
            </p>
          )}
          {form.formState.errors.scale && (
            <p id="scanner-scale-error" role="alert">
              {form.formState.errors.scale.message}
            </p>
          )}
          <section className="scanner-form-section" aria-labelledby="scanner-values-title">
            <h3 id="scanner-values-title">02 / Dữ liệu tính toán</h3>
            <div className="scanner-fields">
              <label>
                Doanh thu
                <input
                  type="number"
                  step="any"
                  aria-invalid={form.formState.errors.revenue !== undefined}
                  aria-describedby={
                    form.formState.errors.revenue ? 'scanner-revenue-error' : undefined
                  }
                  {...form.register('revenue', { valueAsNumber: true })}
                />
              </label>
              <label>
                Tư bản bất biến c
                <input
                  type="number"
                  step="any"
                  aria-invalid={form.formState.errors.constantCapital !== undefined}
                  aria-describedby={
                    form.formState.errors.constantCapital ? 'scanner-c-error' : undefined
                  }
                  {...form.register('constantCapital', { valueAsNumber: true })}
                />
              </label>
              <label>
                Tư bản khả biến v
                <input
                  type="number"
                  step="any"
                  aria-invalid={form.formState.errors.variableCapital !== undefined}
                  aria-describedby={
                    form.formState.errors.variableCapital ? 'scanner-v-error' : undefined
                  }
                  {...form.register('variableCapital', { valueAsNumber: true })}
                />
              </label>
            </div>
          </section>
          {form.formState.errors.revenue && (
            <p id="scanner-revenue-error" role="alert">
              {form.formState.errors.revenue.message}
            </p>
          )}
          {form.formState.errors.constantCapital && (
            <p id="scanner-c-error" role="alert">
              {form.formState.errors.constantCapital.message}
            </p>
          )}
          {form.formState.errors.variableCapital && (
            <p id="scanner-v-error" role="alert">
              {form.formState.errors.variableCapital.message}
            </p>
          )}
          <fieldset className="scanner-form-section">
            <legend>Khoản nhạy cảm nâng cao</legend>
            <div className="scanner-fields">
              <label>
                Chi phí contractor
                <input
                  type="number"
                  step="any"
                  aria-invalid={form.formState.errors.contractorAmount !== undefined}
                  aria-describedby={
                    form.formState.errors.contractorAmount ? 'scanner-contractor-error' : undefined
                  }
                  {...form.register('contractorAmount', { valueAsNumber: true })}
                />
              </label>
              <label>
                Stock compensation
                <input
                  type="number"
                  step="any"
                  aria-invalid={form.formState.errors.stockCompensationAmount !== undefined}
                  aria-describedby={
                    form.formState.errors.stockCompensationAmount
                      ? 'scanner-stock-compensation-error'
                      : undefined
                  }
                  {...form.register('stockCompensationAmount', { valueAsNumber: true })}
                />
              </label>
              <label>
                Khoản cần review
                <input
                  type="number"
                  step="any"
                  aria-invalid={form.formState.errors.needsReviewAmount !== undefined}
                  aria-describedby={
                    form.formState.errors.needsReviewAmount
                      ? 'scanner-needs-review-error'
                      : undefined
                  }
                  {...form.register('needsReviewAmount', { valueAsNumber: true })}
                />
              </label>
              <label>
                Gợi ý phân loại khoản review
                <select {...form.register('needsReviewClassification')}>
                  <option value="revenue">Doanh thu</option>
                  <option value="constant_capital">c</option>
                  <option value="variable_capital">v</option>
                  <option value="surplus_proxy">Proxy thặng dư</option>
                  <option value="excluded">Loại trừ</option>
                </select>
              </label>
            </div>
            {form.formState.errors.contractorAmount && (
              <p id="scanner-contractor-error" role="alert">
                Chi phí contractor không được âm.
              </p>
            )}
            {form.formState.errors.stockCompensationAmount && (
              <p id="scanner-stock-compensation-error" role="alert">
                Stock compensation không được âm.
              </p>
            )}
            {form.formState.errors.needsReviewAmount && (
              <p id="scanner-needs-review-error" role="alert">
                Khoản cần review không được âm.
              </p>
            )}
          </fieldset>
          <button disabled={create.isPending}>
            {create.isPending ? 'Đang tính…' : 'Tạo phân tích và tính'}
          </button>
        </form>
      )}
      {detail.isLoading && (
        <PageState>
          <p>Đang tải phân tích đã lưu…</p>
        </PageState>
      )}
      {detail.isError && (
        <PageState>
          <p>Không thể tải phân tích này.</p>
          <button type="button" onClick={() => void detail.refetch()}>
            Thử lại
          </button>
        </PageState>
      )}
      {serverError && (
        <PageState>
          <p role="alert">{serverError}</p>
          <button
            type="button"
            onClick={() => {
              setServerError(undefined);
              retryAction?.();
            }}
          >
            Thử lại
          </button>
        </PageState>
      )}
      {activeAnalysis && latest && (
        <section className="scanner-result scanner-analysis-sheet" aria-labelledby="result-title">
          <h2 id="result-title">Kết quả: {activeAnalysis.title}</h2>
          {activeAnalysis.finalized && (
            <p role="status">Phân tích đã hoàn tất và hiện là bản ghi bất biến.</p>
          )}
          {reportingContext !== undefined && (
            <p>
              Kỳ và đơn vị tiền tệ: {reportingContext.reportingPeriod} · {reportingContext.currency}{' '}
              · {reportingContext.scale}. Các chỉ số m′ và p′ là tỷ lệ phần trăm; c/v là tỷ số.
            </p>
          )}
          <p className="scanner-disclaimer">Ước lượng theo bộ giả định MarxMatrix</p>
          <div className="result-grid">
            <article>
              <span>m</span>
              <strong>{latest.result.surplusValue.toLocaleString('vi-VN')}</strong>
              <small>giá trị thặng dư ước tính</small>
            </article>
            <article>
              <span>m′</span>
              <strong>{metric(latest.result.surplusValueRate, '%')}</strong>
              <small>tỷ suất giá trị thặng dư</small>
            </article>
            <article>
              <span>c/v</span>
              <strong>{metric(latest.result.organicComposition)}</strong>
              <small>cấu tạo hữu cơ</small>
            </article>
            <article>
              <span>p′</span>
              <strong>{metric(latest.result.profitRate, '%')}</strong>
              <small>tỷ suất lợi nhuận</small>
            </article>
          </div>
          <p aria-live="polite">
            {latest.result.evidenceCoverage.toFixed(0)}% dữ kiện tính toán đã kiểm chứng.
          </p>
          <Suspense fallback={<p>Đang tải biểu đồ cấu phần…</p>}>
            <ResultChart analysis={activeAnalysis} />
          </Suspense>
          <section aria-labelledby="evidence-title">
            <h3 id="evidence-title">Bằng chứng và phân loại</h3>
            <p>Accounting proxy cần được diễn giải thành value-structure estimate có điều kiện.</p>
            <ul className="evidence-list">
              {activeAnalysis.facts.map((item) => (
                <li key={item.id}>
                  <strong>{item.label}</strong> · {item.value.toLocaleString('vi-VN')} ·{' '}
                  <span>
                    {item.reviewStatus === 'approved' || item.reviewStatus === 'reclassified'
                      ? 'Đã kiểm chứng'
                      : 'Cần rà soát'}
                  </span>
                  <small>
                    {item.evidenceText ?? 'Chưa có trích đoạn bằng chứng.'}{' '}
                    {item.sourcePage === null
                      ? 'Không có trang nguồn.'
                      : `Trang ${item.sourcePage}.`}
                  </small>
                  <label>
                    Phân loại{' '}
                    <select
                      aria-label={`Phân loại fact ${item.label}`}
                      disabled={activeAnalysis.finalized}
                      value={item.classification}
                      onChange={(event) =>
                        reclassify.mutate({
                          factId: item.id,
                          input:
                            event.target.value === 'needs_review'
                              ? {
                                  classification: 'needs_review',
                                  reviewStatus: 'pending_review',
                                  sensitivityClassification: item.classification
                                }
                              : {
                                  classification: event.target.value,
                                  reviewStatus: 'reclassified',
                                  sensitivityClassification: null
                                }
                        })
                      }
                    >
                      <option value="revenue">Doanh thu</option>
                      <option value="constant_capital">c</option>
                      <option value="variable_capital">v</option>
                      <option value="surplus_proxy">Proxy thặng dư</option>
                      <option value="excluded">Loại trừ</option>
                      <option value="needs_review">Cần rà soát</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="sensitivity-title">
            <h3 id="sensitivity-title">Độ nhạy giả định</h3>
            <label>
              Hệ số điều chỉnh doanh thu{' '}
              <input
                type="number"
                disabled={activeAnalysis.finalized}
                min="0"
                max="1"
                step="0.01"
                aria-invalid={form.formState.errors.revenueAdjustment !== undefined}
                aria-describedby={
                  form.formState.errors.revenueAdjustment ? 'scanner-adjustment-error' : undefined
                }
                {...form.register('revenueAdjustment', { valueAsNumber: true })}
              />
            </label>
            {form.formState.errors.revenueAdjustment && (
              <p id="scanner-adjustment-error" role="alert">
                {form.formState.errors.revenueAdjustment.message}
              </p>
            )}
            <label>
              <input
                type="checkbox"
                disabled={activeAnalysis.finalized}
                {...form.register('includeSurplusProxy')}
              />{' '}
              Tính surplus proxy
            </label>
            <label>
              Contractor được tính là{' '}
              <select
                disabled={activeAnalysis.finalized}
                {...form.register('contractorClassification')}
              >
                <option value="constant_capital">c — tư bản bất biến</option>
                <option value="variable_capital">v — tư bản khả biến</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                disabled={activeAnalysis.finalized}
                {...form.register('includeStockCompensation')}
              />{' '}
              Tính stock compensation vào v
            </label>
            <label>
              <input
                type="checkbox"
                disabled={activeAnalysis.finalized}
                {...form.register('includeNeedsReview')}
              />{' '}
              Tính các khoản cần review theo phân loại gợi ý
            </label>
            <p>
              Chính sách nhạy cảm được lưu trong phiên bản: contractor là c/v, stock compensation
              có/không vào v, và khoản cần review có/không được tính.
            </p>
            <button
              type="button"
              disabled={sensitivity.isPending || activeAnalysis.finalized}
              onClick={() =>
                void form
                  .trigger([
                    'revenueAdjustment',
                    'includeSurplusProxy',
                    'contractorClassification',
                    'includeStockCompensation',
                    'includeNeedsReview'
                  ])
                  .then((valid) => {
                    if (valid)
                      sensitivity.mutate({
                        revenueAdjustment: form.getValues('revenueAdjustment'),
                        includeSurplusProxy: form.getValues('includeSurplusProxy'),
                        contractorClassification: form.getValues('contractorClassification'),
                        includeStockCompensation: form.getValues('includeStockCompensation'),
                        includeNeedsReview: form.getValues('includeNeedsReview'),
                        notes: 'Cập nhật độ nhạy thủ công.'
                      });
                  })
              }
            >
              Tính lại theo giả định
            </button>
          </section>
          <section aria-labelledby="history-title">
            <h3 id="history-title">Lịch sử phiên bản bất biến</h3>
            <label>
              So sánh với phiên bản{' '}
              <select
                value={compareVersion ?? ''}
                onChange={(event) => setCompareVersion(Number(event.target.value))}
              >
                <option value="">Chọn phiên bản</option>
                {activeAnalysis.calculationVersions.slice(0, -1).map((version) => (
                  <option key={version.id} value={version.version}>
                    Phiên bản {version.version}
                  </option>
                ))}
              </select>
            </label>
            {compareVersion !== undefined && (
              <p>
                {(() => {
                  const prior = activeAnalysis.calculationVersions.find(
                    (version) => version.version === compareVersion
                  );
                  return prior === undefined
                    ? 'Không tìm thấy phiên bản.'
                    : `Chênh lệch m so với phiên bản ${compareVersion}: ${(latest.result.surplusValue - prior.result.surplusValue).toLocaleString('vi-VN')}.`;
                })()}
              </p>
            )}
            <ol>
              {activeAnalysis.calculationVersions.map((version) => (
                <li key={version.id}>
                  Phiên bản {version.version} · m ={' '}
                  {version.result.surplusValue.toLocaleString('vi-VN')} ·{' '}
                  {new Date(version.createdAt).toLocaleString('vi-VN')}
                </li>
              ))}
            </ol>
          </section>
          <p>
            <Link to="/scanner">Quay lại lịch sử Scanner</Link>
          </p>
        </section>
      )}
    </section>
  );
}
