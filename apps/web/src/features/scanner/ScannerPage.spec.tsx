import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAnalysisInputSchema } from '@marxmatrix/contracts';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerPage } from './ScannerPage.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request } }));
const renderPage = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ScannerPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
const renderDetailPage = () =>
  render(
    <MemoryRouter initialEntries={['/scanner/507f1f77bcf86cd799439011']}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/scanner/:analysisId" element={<ScannerPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
function RouteHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => void navigate('/scanner/507f1f77bcf86cd799439022')}>
        Open analysis B
      </button>
      <ScannerPage />
    </>
  );
}
beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue([]);
});
afterEach(() => cleanup());
describe('ScannerPage', () => {
  it('keeps analysis history on Screen 05 instead of fetching it below the manual form', () => {
    renderPage();

    expect(
      request.mock.calls.filter(([path, options]) => path === '/analyses' && options === undefined)
    ).toHaveLength(0);
  });

  it('announces invalid manual inputs before it calls the server', async () => {
    renderPage();
    expect(screen.getByText('06 / PHÂN TÍCH THỦ CÔNG')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Khởi tạo hồ sơ giá trị thặng dư' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '01 / Bối cảnh' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '02 / Dữ liệu tính toán' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/ít nhất 3 ký tự|expected/i);
    expect(request).not.toHaveBeenCalledWith('/analyses', expect.anything());
  });
  it('blocks negative sensitivity amounts with linked Vietnamese field errors', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Chi phí contractor'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Stock compensation'), { target: { value: '-2' } });
    fireEvent.change(screen.getByLabelText('Khoản cần review'), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByText('Chi phí contractor không được âm.')).toHaveAttribute(
      'role',
      'alert'
    );
    expect(screen.getByText('Stock compensation không được âm.')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Khoản cần review không được âm.')).toHaveAttribute('role', 'alert');
    expect(screen.getByLabelText('Chi phí contractor')).toHaveAttribute(
      'aria-describedby',
      'scanner-contractor-error'
    );
    expect(screen.getByLabelText('Stock compensation')).toHaveAttribute(
      'aria-describedby',
      'scanner-stock-compensation-error'
    );
    expect(screen.getByLabelText('Khoản cần review')).toHaveAttribute(
      'aria-describedby',
      'scanner-needs-review-error'
    );
    expect(request).not.toHaveBeenCalledWith('/analyses', expect.anything());
  });

  it('hydrates saved policies in a detail route and resubmits them unchanged', async () => {
    const assumptions = {
      revenueAdjustment: 0.8,
      includeSurplusProxy: true,
      contractorClassification: 'variable_capital',
      includeStockCompensation: true,
      includeNeedsReview: true,
      notes: 'Persisted policy set'
    };
    const saved = {
      id: '507f1f77bcf86cd799439011',
      title: 'Persisted policy analysis',
      facts: [],
      assumptions,
      calculationVersions: [
        {
          id: '507f1f77bcf86cd799439012',
          version: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          assumptions,
          result: {
            constantCapital: 400,
            variableCapital: 200,
            adjustedRevenue: 800,
            surplusValue: 200,
            surplusValueRate: 100,
            organicComposition: 2,
            profitRate: 33.33,
            evidenceCoverage: 100
          }
        }
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    let assumptionsBody: string | undefined;
    request.mockImplementation((path: string, options?: { method?: string; body?: string }) => {
      if (path === '/analyses') return Promise.resolve([]);
      if (path.endsWith('/assumptions')) {
        assumptionsBody = options?.body;
        return Promise.resolve(saved);
      }
      return Promise.resolve(saved);
    });
    renderDetailPage();
    await screen.findByText('m');
    expect(screen.getByText('07 / PHIẾU PHÂN TÍCH')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bằng chứng và phân loại' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Hệ số điều chỉnh doanh thu/i)).toHaveValue(0.8);
    expect(screen.getByLabelText('Contractor được tính là')).toHaveValue('variable_capital');
    expect(screen.getByLabelText('Tính surplus proxy')).toBeChecked();
    expect(screen.getByLabelText(/Tính stock compensation/i)).toBeChecked();
    expect(screen.getByLabelText(/Tính các khoản cần review/i)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Tính lại theo giả định/i }));
    await waitFor(() => expect(assumptionsBody).toBeDefined());
    expect(JSON.parse(assumptionsBody as string)).toMatchObject({
      revenueAdjustment: 0.8,
      includeSurplusProxy: true,
      contractorClassification: 'variable_capital',
      includeStockCompensation: true,
      includeNeedsReview: true
    });
  });
  it('never keeps analysis A active after navigating to a failed analysis B route', async () => {
    const assumptions = {
      revenueAdjustment: 1,
      includeSurplusProxy: false,
      contractorClassification: 'constant_capital' as const,
      includeStockCompensation: false,
      includeNeedsReview: false,
      notes: ''
    };
    const analysisA = {
      id: '507f1f77bcf86cd799439011',
      title: 'Analysis A',
      facts: [],
      assumptions,
      calculationVersions: [
        {
          id: '507f1f77bcf86cd799439012',
          version: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          assumptions,
          result: {
            constantCapital: 400,
            variableCapital: 200,
            adjustedRevenue: 1000,
            surplusValue: 400,
            surplusValueRate: 200,
            organicComposition: 2,
            profitRate: 66.67,
            evidenceCoverage: 100
          }
        }
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    request.mockImplementation((path: string) => {
      if (path === '/analyses') return Promise.resolve([]);
      if (path.endsWith('507f1f77bcf86cd799439011')) return Promise.resolve(analysisA);
      return Promise.reject(new Error('analysis B unavailable'));
    });
    render(
      <MemoryRouter initialEntries={['/scanner/507f1f77bcf86cd799439011']}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Routes>
            <Route path="/scanner/:analysisId" element={<RouteHarness />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: /Analysis A/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open analysis B' }));
    await screen.findByText(/Không thể tải phân tích này/i);
    expect(screen.queryByRole('heading', { name: /Analysis A/ })).not.toBeInTheDocument();
  });
  it('marks finalized analysis details immutable and disables mutation controls', async () => {
    const assumptions = {
      revenueAdjustment: 1,
      includeSurplusProxy: false,
      contractorClassification: 'constant_capital' as const,
      includeStockCompensation: false,
      includeNeedsReview: false,
      notes: ''
    };
    const saved = {
      id: '507f1f77bcf86cd799439011',
      title: 'Finalized analysis',
      finalized: true,
      facts: [
        {
          id: '507f1f77bcf86cd799439099',
          key: 'c',
          label: 'Constant capital',
          value: 400,
          currency: 'USD',
          scale: 'millions',
          reportingPeriod: 'FY2025',
          classification: 'constant_capital',
          extractionMode: 'manual',
          sourcePage: null,
          sourceChunkId: null,
          evidenceText: 'Manual evidence.',
          classificationReason: 'Manual proxy.',
          reviewStatus: 'approved',
          sensitivityCategory: 'standard',
          sensitivityClassification: null
        }
      ],
      assumptions,
      calculationVersions: [
        {
          id: '507f1f77bcf86cd799439012',
          version: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          assumptions,
          result: {
            constantCapital: 400,
            variableCapital: 200,
            adjustedRevenue: 1000,
            surplusValue: 400,
            surplusValueRate: 200,
            organicComposition: 2,
            profitRate: 66.67,
            evidenceCoverage: 100
          }
        }
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    request.mockImplementation((path: string) =>
      path === '/analyses' ? Promise.resolve([]) : Promise.resolve(saved)
    );
    renderDetailPage();

    expect(await screen.findByText(/phân tích đã hoàn tất/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Phân loại fact Constant capital')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Tính lại theo giả định/i })).toBeDisabled();
  });

  it('creates explicit sensitivity facts from the manual form', async () => {
    let createBody: string | undefined;
    request.mockImplementation((path: string, options?: { method?: string; body?: string }) => {
      if (path === '/analyses' && options?.method === 'POST') {
        createBody = options.body;
        return new Promise(() => undefined);
      }
      return Promise.resolve([]);
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.change(screen.getByLabelText('Chi phí contractor'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Stock compensation'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Khoản cần review'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Gợi ý phân loại khoản review'), {
      target: { value: 'constant_capital' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    await waitFor(() => expect(createBody).toBeDefined());
    const input = createAnalysisInputSchema.parse(JSON.parse(createBody as string) as unknown);
    expect(input.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'contractor',
          sensitivityCategory: 'contractor',
          value: 50
        }),
        expect.objectContaining({
          key: 'stock-compensation',
          sensitivityCategory: 'stock_compensation',
          value: 25
        }),
        expect.objectContaining({
          key: 'needs-review',
          classification: 'needs_review',
          reviewStatus: 'pending_review',
          sensitivityClassification: 'constant_capital',
          value: 10
        })
      ])
    );
  });
  it('shows server result, evidence state, sensitivity and immutable history', async () => {
    const base = {
      id: '507f1f77bcf86cd799439011',
      title: 'Cloud Platform 2025',
      facts: [
        {
          id: '507f1f77bcf86cd799439099',
          key: 'c',
          label: 'Tư bản bất biến',
          value: 400,
          currency: 'USD',
          scale: 'millions',
          reportingPeriod: 'FY2025',
          classification: 'constant_capital',
          extractionMode: 'manual',
          sourcePage: 12,
          sourceChunkId: null,
          evidenceText: 'Báo cáo trang 12.',
          classificationReason: 'Manual proxy.',
          reviewStatus: 'approved',
          sensitivityCategory: 'standard',
          sensitivityClassification: null
        }
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    const v1 = {
      id: '507f1f77bcf86cd799439012',
      version: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      },
      result: {
        constantCapital: 400,
        variableCapital: 200,
        adjustedRevenue: 1000,
        surplusValue: 400,
        surplusValueRate: 200,
        organicComposition: 2,
        profitRate: 66.67,
        evidenceCoverage: 100
      }
    };
    const v2 = {
      ...v1,
      id: '507f1f77bcf86cd799439013',
      version: 2,
      assumptions: { ...v1.assumptions, revenueAdjustment: 0.9 },
      result: {
        ...v1.result,
        adjustedRevenue: 900,
        surplusValue: 300,
        surplusValueRate: 150,
        profitRate: 50
      }
    };
    const v3 = {
      ...v2,
      id: '507f1f77bcf86cd799439014',
      version: 3,
      result: {
        ...v2.result,
        constantCapital: 0,
        surplusValue: 700,
        surplusValueRate: 350,
        organicComposition: 0,
        profitRate: 350
      }
    };
    request
      .mockResolvedValueOnce({ ...base, assumptions: v1.assumptions, calculationVersions: [] })
      .mockResolvedValueOnce({ ...base, assumptions: v1.assumptions, calculationVersions: [v1] })
      .mockResolvedValueOnce({ ...base, assumptions: v2.assumptions, calculationVersions: [v1] })
      .mockResolvedValueOnce({
        ...base,
        assumptions: v2.assumptions,
        calculationVersions: [v1, v2]
      })
      .mockResolvedValueOnce({
        ...base,
        assumptions: v2.assumptions,
        calculationVersions: [v1, v2]
      })
      .mockResolvedValueOnce({
        ...base,
        assumptions: v2.assumptions,
        calculationVersions: [v1, v2, v3]
      });
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByText('m')).toBeInTheDocument();
    expect(screen.getByText(/FY2025 · USD · millions/)).toBeInTheDocument();
    expect(screen.getByText(/100% dữ kiện tính toán đã kiểm chứng/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Phiên bản 1/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Ước lượng theo bộ giả định MarxMatrix')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Hệ số điều chỉnh doanh thu/i), {
      target: { value: '0.9' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tính lại theo giả định/i }));
    await waitFor(() => expect(screen.getAllByText(/Phiên bản 2/i).length).toBeGreaterThan(0));
    expect(request).toHaveBeenCalledWith(
      '/analyses/507f1f77bcf86cd799439011/assumptions',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(screen.getByText(/m = 400/)).toBeInTheDocument();
    expect(screen.getByText(/m = 300/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Phân loại fact Tư bản bất biến'), {
      target: { value: 'needs_review' }
    });
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/analyses/507f1f77bcf86cd799439011/facts/507f1f77bcf86cd799439099',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            classification: 'needs_review',
            reviewStatus: 'pending_review',
            sensitivityClassification: 'constant_capital'
          })
        })
      )
    );
    expect(request).toHaveBeenCalledWith(
      '/analyses/507f1f77bcf86cd799439011/calculate',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect((await screen.findAllByText(/Phiên bản 3/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(/m = 700/)).toBeInTheDocument();
  });
  it('exposes a recoverable server error', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByText(/Không thể hoàn tất yêu cầu/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument();
  });

  it('retries an idempotent reclassification followed by failed recalculation', async () => {
    const fact = {
      id: '507f1f77bcf86cd799439099',
      key: 'c',
      label: 'Tư bản bất biến',
      value: 400,
      currency: 'USD',
      scale: 'millions',
      reportingPeriod: 'FY2025',
      classification: 'constant_capital',
      extractionMode: 'manual',
      sourcePage: null,
      sourceChunkId: null,
      evidenceText: 'Synthetic evidence.',
      classificationReason: 'Manual proxy.',
      reviewStatus: 'approved',
      sensitivityCategory: 'standard',
      sensitivityClassification: null
    };
    const assumptions = {
      revenueAdjustment: 1,
      includeSurplusProxy: false,
      contractorClassification: 'constant_capital',
      includeStockCompensation: false,
      includeNeedsReview: false,
      notes: ''
    };
    const saved = {
      id: '507f1f77bcf86cd799439011',
      title: 'Cloud Platform 2025',
      facts: [fact],
      assumptions,
      calculationVersions: [
        {
          id: '507f1f77bcf86cd799439012',
          version: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          assumptions,
          result: {
            constantCapital: 400,
            variableCapital: 200,
            adjustedRevenue: 1000,
            surplusValue: 400,
            surplusValueRate: 200,
            organicComposition: 2,
            profitRate: 66.67,
            evidenceCoverage: 100
          }
        }
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    let patchAttempts = 0;
    let calculationAttempts = 0;
    const calculationKeys: Array<string | undefined> = [];
    request.mockImplementation(
      (path: string, options?: { method?: string; headers?: Record<string, string> }) => {
        if (path === '/analyses' && options?.method === 'POST') return Promise.resolve(saved);
        if (path.endsWith(`/facts/${fact.id}`)) {
          patchAttempts += 1;
          return Promise.resolve(saved);
        }
        if (path.endsWith('/calculate')) {
          calculationAttempts += 1;
          calculationKeys.push(options?.headers?.['idempotency-key']);
          return calculationAttempts === 2
            ? Promise.reject(new Error('offline'))
            : Promise.resolve(saved);
        }
        if (path === '/analyses') return Promise.resolve([]);
        return Promise.resolve(saved);
      }
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    await screen.findByText('m');
    fireEvent.change(screen.getByLabelText('Phân loại fact Tư bản bất biến'), {
      target: { value: 'variable_capital' }
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể hoàn tất/i);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(patchAttempts).toBe(2));
    expect(calculationAttempts).toBe(3);
    expect(calculationKeys[1]).toBeDefined();
    expect(calculationKeys[2]).toBe(calculationKeys[1]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries the failed create mutation instead of only refetching the list', async () => {
    const saved = {
      id: '507f1f77bcf86cd799439011',
      title: 'Cloud Platform 2025',
      facts: [],
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      },
      calculationVersions: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    let createAttempts = 0;
    const createKeys: Array<string | undefined> = [];
    const createBodies: Array<string | undefined> = [];
    request.mockImplementation(
      (
        path: string,
        options?: { method?: string; headers?: Record<string, string>; body?: string }
      ) => {
        if (path === '/analyses' && options?.method === 'POST') {
          createAttempts += 1;
          createKeys.push(options.headers?.['idempotency-key']);
          createBodies.push(options.body);
          return createAttempts === 1
            ? Promise.reject(new Error('offline'))
            : Promise.resolve(saved);
        }
        if (path.endsWith('/calculate')) return Promise.resolve(saved);
        if (path === '/analyses') return Promise.resolve([]);
        return Promise.resolve(saved);
      }
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể hoàn tất/i);
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'A different accidental edit' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(createAttempts).toBe(2));
    expect(createKeys[0]).toBeDefined();
    expect(createKeys[1]).toBe(createKeys[0]);
    expect(createBodies[1]).toBe(createBodies[0]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries only calculation when creation succeeded before calculation failed', async () => {
    const saved = {
      id: '507f1f77bcf86cd799439011',
      title: 'Cloud Platform 2025',
      facts: [],
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      },
      calculationVersions: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    let createAttempts = 0;
    let calculationAttempts = 0;
    const calculationKeys: Array<string | undefined> = [];
    request.mockImplementation(
      (path: string, options?: { method?: string; headers?: Record<string, string> }) => {
        if (path === '/analyses' && options?.method === 'POST') {
          createAttempts += 1;
          return Promise.resolve(saved);
        }
        if (path.endsWith('/calculate')) {
          calculationAttempts += 1;
          calculationKeys.push(options?.headers?.['idempotency-key']);
          return calculationAttempts === 1
            ? Promise.reject(new Error('offline'))
            : Promise.resolve(saved);
        }
        if (path === '/analyses') return Promise.resolve([]);
        return Promise.resolve(saved);
      }
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể hoàn tất/i);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(calculationAttempts).toBe(2));
    expect(createAttempts).toBe(1);
    expect(calculationKeys[0]).toBeDefined();
    expect(calculationKeys[1]).toBe(calculationKeys[0]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('creates a new analysis when the form intent changes after a calculation response failure', async () => {
    const analysis = (id: string, title: string) => ({
      id,
      title,
      facts: [],
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital' as const,
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      },
      calculationVersions: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    });
    const first = analysis('507f1f77bcf86cd799439011', 'First intent');
    const second = analysis('507f1f77bcf86cd799439022', 'Second intent');
    let createAttempts = 0;
    const calculationPaths: string[] = [];
    request.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/analyses' && options?.method === 'POST') {
        createAttempts += 1;
        return Promise.resolve(createAttempts === 1 ? first : second);
      }
      if (path.endsWith('/calculate')) {
        calculationPaths.push(path);
        return calculationPaths.length === 1
          ? Promise.reject(new Error('response lost'))
          : Promise.resolve(second);
      }
      if (path === '/analyses') return Promise.resolve([]);
      return Promise.resolve(second);
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'First intent' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể hoàn tất/i);

    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Second intent' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    await waitFor(() => expect(createAttempts).toBe(2));
    expect(calculationPaths).toEqual([
      '/analyses/507f1f77bcf86cd799439011/calculate',
      '/analyses/507f1f77bcf86cd799439022/calculate'
    ]);
  });

  it('retries the failed sensitivity mutation and clears its error after a calculation', async () => {
    const base = {
      id: '507f1f77bcf86cd799439011',
      title: 'Cloud Platform 2025',
      facts: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    };
    const assumptions = {
      revenueAdjustment: 1,
      includeSurplusProxy: false,
      contractorClassification: 'constant_capital',
      includeStockCompensation: false,
      includeNeedsReview: false,
      notes: ''
    };
    const version = {
      id: '507f1f77bcf86cd799439012',
      version: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
      assumptions,
      result: {
        constantCapital: 400,
        variableCapital: 200,
        adjustedRevenue: 1000,
        surplusValue: 400,
        surplusValueRate: 200,
        organicComposition: 2,
        profitRate: 66.67,
        evidenceCoverage: 100
      }
    };
    const saved = { ...base, assumptions, calculationVersions: [version] };
    let sensitivityAttempts = 0;
    let calculationAttempts = 0;
    const assumptionBodies: Array<string | undefined> = [];
    request.mockImplementation((path: string, options?: { method?: string; body?: string }) => {
      if (path === '/analyses' && options?.method === 'POST') return Promise.resolve(saved);
      if (path.endsWith('/assumptions')) {
        sensitivityAttempts += 1;
        assumptionBodies.push(options?.body);
        return sensitivityAttempts === 1
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(saved);
      }
      if (path.endsWith('/calculate')) {
        calculationAttempts += 1;
        return Promise.resolve(saved);
      }
      if (path === '/analyses') return Promise.resolve([]);
      return Promise.resolve(saved);
    });
    renderPage();
    fireEvent.change(screen.getByLabelText('Tiêu đề phân tích'), {
      target: { value: 'Cloud Platform 2025' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tạo phân tích/i }));
    await screen.findByText('m');
    fireEvent.change(screen.getByLabelText(/Hệ số điều chỉnh doanh thu/i), {
      target: { value: '0.9' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Tính lại theo giả định/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không thể hoàn tất/i);
    fireEvent.change(screen.getByLabelText(/Hệ số điều chỉnh doanh thu/i), {
      target: { value: '0.8' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(sensitivityAttempts).toBe(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(calculationAttempts).toBe(2);
    expect(assumptionBodies[1]).toBe(assumptionBodies[0]);
  });
});
