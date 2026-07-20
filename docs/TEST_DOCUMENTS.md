# MarxMatrix PDF test catalog

This catalog links to public documents hosted by their original publishers. Download them from the source and upload them through MarxMatrix; do not commit third-party PDFs to this repository.

## Recommended starter set

| Document                                                                | Language / size                    | Download                                                                                                                                                                                                                                                                                 | Best test                                                            |
| ----------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Apple Form 10-K / Annual Report 2024                                    | English · 121 pages                | [Direct PDF](https://d18rn0p25nwr6d.cloudfront.net/CIK-0000320193/c87043b9-5d89-4717-9f49-c4f9663d0061.pdf) · [Apple filing page](https://investor.apple.com/sec-filings/sec-filings-details/default.aspx?FilingId=17933082)                                                             | Scanner financial tables, notes, risk factors and page evidence      |
| Amazon Form 10-K / Annual Report 2023                                   | English · 94 pages                 | [Direct PDF](https://d18rn0p25nwr6d.cloudfront.net/CIK-0001018724/c7c14359-36fa-40c3-b3ca-5bf7f3fa0b96.pdf) · [Amazon filing page](https://ir.aboutamazon.com/sec-filings/sec-filings-details/default.aspx?FilingId=17229449)                                                            | Scanner segment data for North America, International and AWS        |
| Generative AI and Jobs: A Refined Global Index of Occupational Exposure | English · 4.02 MB                  | [Direct PDF](https://www.ilo.org/sites/default/files/2025-05/WP140_web.pdf) · [ILO publication page](https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure)                                                                                 | Lightweight Copilot upload, retrieval and citation test              |
| OECD Digital Economy Outlook 2024, Volume 1                             | English · 161 pages · about 3.6 MB | [Direct PDF](https://www.oecd.org/content/dam/oecd/en/publications/reports/2024/05/oecd-digital-economy-outlook-2024-volume-1_d30a04c9/a1689dc5-en.pdf) · [OECD publication page](https://www.oecd.org/en/publications/2024/05/oecd-digital-economy-outlook-2024-volume-1_d30a04c9.html) | Copilot chapter retrieval, comparative claims and source navigation  |
| Artificial Intelligence Index Report 2025                               | English · 434 pages · about 29 MB  | [Direct PDF](https://hai.stanford.edu/assets/files/hai_ai_index_report_2025.pdf) · [Stanford HAI report page](https://hai.stanford.edu/ai-index/2025-ai-index-report)                                                                                                                    | Heavy indexing, long-document retrieval and hallucination resistance |
| Sách trắng Công nghiệp CNTT Việt Nam năm 2024                           | Vietnamese · about 12.4 MB         | [Direct PDF](https://mic.mediacdn.vn/639352410187198464/2025/5/20/sach-trang-2024-tv-bong3-tuyen-comment-26-12-2024-17477057164501311953470.pdf) · [MST publication page](https://mst.gov.vn/sach-trang-cong-nghe-thong-tin-va-truyen-thong-19724042616014143.htm)                       | Vietnamese text, tables, diacritics and semantic retrieval           |

The ILO server may reject automated download clients with HTTP 403. If that happens, open the ILO publication page in a normal browser and use its **PDF 4.02 MB** download action.

## Suggested questions

### Scanner

Apple 2024:

> Doanh thu năm 2024 được phân bổ theo từng khu vực địa lý như thế nào? Hãy chỉ rõ trang và bảng nguồn cho từng dữ kiện được sử dụng.

Amazon 2023:

> So sánh net sales và operating income của North America, International và AWS trong năm 2023. Tách rõ dữ kiện, giả định và diễn giải.

Scanner extraction candidates must remain `pending_review`; review every page citation before applying a fact to an analysis.

### Copilot

ILO:

> Bốn mức độ phơi nhiễm với GenAI được định nghĩa như thế nào? Phân biệt rõ “occupational exposure”, “automation” và “job transformation”, kèm trích dẫn theo trang.

OECD:

> OECD mô tả sự tăng trưởng của ngành ICT và khoảng cách số như thế nào? Chỉ sử dụng nội dung có trong tài liệu và mở đúng trang nguồn.

Stanford AI Index:

> Chi phí truy vấn mô hình ở mức hiệu năng tương đương GPT-3.5 đã thay đổi như thế nào từ tháng 11/2022 đến tháng 10/2024? Nếu không đủ bằng chứng, hãy nói rõ giới hạn.

Sách trắng CNTT Việt Nam:

> Tóm tắt các chỉ số nổi bật của ngành công nghiệp CNTT Việt Nam năm 2024. Với mỗi chỉ số, cung cấp trang nguồn và bối cảnh đo lường.

## Upload routes

- Scanner financial extraction: sign in, open `/scanner/extract`, upload as `financial_report`, wait for `parsed`, then create/review extraction candidates.
- Private Copilot: sign in, open `/copilot`, upload the PDF, wait for `ready`, select only ready sources, ask a question and open each citation page.
- Admin course corpus: an admin can use `/admin/documents`; this is not required for ordinary private Copilot testing.

## Test matrix

| Case                        | Input/action                                              | Expected result                                                                            |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Searchable financial report | Upload Apple or Amazon through Scanner                    | `uploaded → parsing → parsed`; pages are readable and extraction candidates require review |
| Searchable Copilot source   | Upload ILO or OECD                                        | `uploaded → parsing → embedding → ready`; query returns source-grounded citations          |
| Vietnamese source           | Upload the MST white paper                                | Vietnamese text and diacritics remain readable; citations open the correct page            |
| Long document               | Upload Stanford AI Index                                  | Processing remains stable; UI continues polling; answers do not cite unrelated pages       |
| Duplicate                   | Upload the exact same PDF twice with one account          | Existing owner-scoped document is reused rather than creating a second stored blob         |
| Fake PDF                    | Rename HTML/PNG to `.pdf` and declare PDF MIME            | Server rejects `INVALID_PDF_SIGNATURE`                                                     |
| Wrong extension/MIME        | Genuine PDF renamed `.txt`, or sent as `text/plain`       | Server rejects `INVALID_EXTENSION` or `INVALID_MIME_TYPE`                                  |
| Image-only scan             | Upload a scanned PDF without a text layer                 | Upload may be accepted, then parsing ends as `OCR_UNSUPPORTED`                             |
| Truncated PDF               | Keep `%PDF-` header but corrupt the body/xref             | Ingress accepts the signature, asynchronous parsing ends as `PDF_PARSE_FAILED`             |
| Ownership                   | Account B requests Account A's document/page/delete/query | Server returns not found and does not disclose private metadata                            |
| Delete                      | Owner deletes a ready document                            | It disappears from lists and its pages/download become unavailable                         |

## Current limitations to observe

- OCR is not implemented, so image-only PDFs cannot become searchable sources.
- Uploads are buffered in application memory before service-level size validation; do not begin stress testing with many large concurrent files.
- The configured maximum upload size is deployment-specific. This catalog intentionally does not inspect runtime environment files.
- Deleting a document removes document pages and GridFS bytes, but the current implementation should be audited further for orphaned RAG chunks.
- Publisher copyright and permissions still apply. Use these documents for personal testing and citation; do not bundle or redistribute them from this repository.
