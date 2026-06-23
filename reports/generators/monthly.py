"""
Monthly Reporting Hub — generate the 10-piece branded set for one month and
store each piece as a Report row (durable file_bytes in Postgres; Railway's
container FS is ephemeral).

  Per org (PHD, Bandhu, CIPRB): infographic (PNG) + report (PDF)        = 6
  Overall (all partners):      infographic + report + deck + web report = 4
                                                                        ────
                                                                          10

Every piece is rendered from collect_programme_data() through the HTML-first
kit (reports.generators.html_render → Playwright Chromium). One AI narrative is
produced per scope and feeds that scope's pieces. Idempotent and per-piece
isolated, mirroring generate_scheduled_reports: one failure never aborts the set.
"""
from __future__ import annotations

import calendar
import logging
import re
import secrets
from datetime import date

from django.core.files.base import ContentFile

from .data import collect_programme_data
from .html_render import (LazyBrowser, render_infographic_png, render_report_pdf,
                          render_pptx, web_report_html)
from ..ai_narrative import generate_narrative
from ..models import NarrativeSource, PeriodType, Report, ReportFormat, ReportType

logger = logging.getLogger(__name__)

SCOPES = ['PHD', 'Bandhu', 'CIPRB', '']   # '' = overall / all partners


def _split_paras(text: str) -> list[str]:
    text = (text or '').strip()
    if not text:
        return []
    parts = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    if len(parts) <= 1:
        parts = [p.strip() for p in text.split('\n') if p.strip()]
    return parts


def _lead_sentences(text: str, n: int = 2) -> str:
    text = (text or '').strip()
    if not text:
        return ''
    return ' '.join(re.split(r'(?<=[.!?])\s+', text)[:n]).strip()


def _ai_context(prog_data: dict, period_lbl: str) -> dict:
    return {
        'organisation':     prog_data['organisation'],
        'period':           period_lbl,
        'total_activities': prog_data['total_submissions'],
        **prog_data['counts'],
        'fistula_cases':    prog_data['fistula_cases'],
        'mpdsr_cases':      prog_data['mpdsr_cases'],
    }


def _pieces_for_scope(org: str) -> list[tuple]:
    """(report_type, format, ext) for a scope — overall gets the deck + web report."""
    base = [
        (ReportType.ONE_PAGER,       ReportFormat.PNG, 'png'),
        (ReportType.MONTHLY_SUMMARY, ReportFormat.PDF, 'pdf'),
    ]
    if org == '':
        base += [
            (ReportType.MONTHLY_SUMMARY, ReportFormat.PPTX, 'pptx'),
            (ReportType.WEB_REPORT,      ReportFormat.HTML, 'html'),
        ]
    return base


def _render(report_type, fmt, prog_data, paras, ai_summary, renderer) -> bytes:
    if fmt == ReportFormat.PNG:
        return render_infographic_png(prog_data, ai_summary=ai_summary, renderer=renderer)
    if report_type == ReportType.WEB_REPORT:
        return web_report_html(prog_data, narrative=paras, ai_summary=ai_summary).encode('utf-8')
    if fmt == ReportFormat.PPTX:
        return render_pptx(prog_data, narrative=paras, ai_summary=ai_summary, renderer=renderer)
    return render_report_pdf(prog_data, narrative=paras, ai_summary=ai_summary, renderer=renderer)


def generate_monthly_set(year: int, month: int, *, system_user=None,
                         include_narrative: bool = True, regenerate: bool = False,
                         log=None) -> dict:
    """Generate (or refresh) the monthly hub set. Returns counts + period info."""
    say = log or (lambda *a, **k: None)
    ps = date(year, month, 1)
    pe = date(year, month, calendar.monthrange(year, month)[1])
    period_lbl = ps.strftime('%B %Y')
    created = skipped = failed = 0

    # Phases are separated because Playwright's sync API keeps an asyncio loop
    # live, and Django's ORM refuses to run inside it (SynchronousOnlyOperation).
    # So: do ALL the DB work with Chromium closed, render with NO DB work open.

    # ── Phase 1 · plan + data + narrative (ORM + HTTP, no Chromium) ──────────
    work: list[dict] = []
    for org in SCOPES:
        try:
            prog_data = collect_programme_data(ps, pe, org)
            prog_data['organisation'] = org or 'All Partners'
            prog_data['period_label'] = period_lbl
        except Exception as exc:                                  # noqa: BLE001
            logger.exception('collect_programme_data failed for %s', org or 'all')
            say(f'  FAIL  data · {org or "all"}: {exc}')
            failed += len(_pieces_for_scope(org))
            continue

        narrative_text, meta = '', {'source': NarrativeSource.AI_DISABLED, 'model': ''}
        if include_narrative:
            try:
                narrative_text, meta = generate_narrative(_ai_context(prog_data, period_lbl))
            except Exception as exc:                              # noqa: BLE001
                logger.warning('narrative failed for %s: %s', org or 'all', exc)
                meta = {'source': NarrativeSource.AI_API_ERROR, 'model': ''}
        paras = _split_paras(narrative_text)
        ai_summary = _lead_sentences(narrative_text, 2)

        for report_type, fmt, ext in _pieces_for_scope(org):
            label = f'{report_type}/{fmt} · {org or "all"}'
            existing = Report.objects.filter(
                report_type=report_type, format=fmt, partner=org,
                period_type=PeriodType.MONTHLY, period_start=ps, period_end=pe,
            )
            if existing.exists():
                if not regenerate:
                    say(f'  SKIP  {label} (exists)')
                    skipped += 1
                    continue
                existing.delete()
            work.append(dict(
                org=org, report_type=report_type, fmt=fmt, ext=ext, label=label,
                prog_data=prog_data, paras=paras, ai_summary=ai_summary,
                narrative_text=narrative_text, meta=meta, file_bytes=None,
            ))

    # ── Phase 2 · render every planned piece (one Chromium, NO ORM) ─────────
    if work:
        browser = LazyBrowser()
        try:
            for w in work:
                try:
                    w['file_bytes'] = _render(w['report_type'], w['fmt'], w['prog_data'],
                                              w['paras'], w['ai_summary'], browser.get())
                except Exception as exc:                          # noqa: BLE001
                    logger.exception('render failed for %s', w['label'])
                    say(f'  FAIL  {w["label"]}: {type(exc).__name__}: {exc}')
        finally:
            browser.close()

    # ── Phase 3 · persist (ORM, Chromium closed) ────────────────────────────
    for w in work:
        if w['file_bytes'] is None:
            failed += 1
            continue
        try:
            title = f'{ReportType(w["report_type"]).label} — {w["org"] or "All Partners"} · {period_lbl}'
            filename = f'{w["report_type"]}_{w["org"] or "all"}_{ps:%Y%m}.{w["ext"]}'
            token = secrets.token_urlsafe(24) if w['report_type'] == ReportType.WEB_REPORT else ''
            rep = Report.objects.create(
                report_type=w['report_type'], format=w['fmt'], partner=w['org'],
                year=ps.year, month=ps.month,
                period_type=PeriodType.MONTHLY, period_start=ps, period_end=pe,
                title=title, narrative=w['narrative_text'] or '',
                narrative_source=w['meta'].get('source', NarrativeSource.TEMPLATE),
                model_used=w['meta'].get('model', ''),
                generated_by=system_user, file_bytes=w['file_bytes'],
                original_filename=filename, share_token=token,
            )
            try:
                rep.file.save(filename, ContentFile(w['file_bytes']), save=True)
            except Exception as exc:                              # noqa: BLE001
                logger.warning('disk file.save failed for %s (bytes safe in DB): %s', w['label'], exc)
            say(f'  OK    {w["label"]} -> {filename} [{w["meta"].get("source")}]')
            created += 1
        except Exception as exc:                                  # noqa: BLE001
            logger.exception('persist failed for %s', w['label'])
            say(f'  FAIL  {w["label"]}: {type(exc).__name__}: {exc}')
            failed += 1

    return {'created': created, 'skipped': skipped, 'failed': failed,
            'period': period_lbl, 'period_start': ps, 'period_end': pe}
