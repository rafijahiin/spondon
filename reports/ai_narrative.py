"""
AI-generated narrative summaries using the Groq API (llama-3.3-70b-versatile).
Gracefully returns fallback text when GROQ_API_KEY is not configured.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# --- System prompts ---

_SYSTEM_SUMMARY = (
    'You are a senior public health programme officer for CIPRB, Bangladesh, '
    'writing formal reports for UNFPA, the Bangladesh Ministry of Health, and international donors. '
    'Your writing is precise, confident, and evidence-based. '
    'Summarise the programme data in 2–3 short paragraphs. '
    'Highlight progress, note any gaps without alarmism, and connect the numbers to human impact. '
    'Do not invent or extrapolate figures not present in the data. '
    'Write in formal British English.'
)

_SYSTEM_NEWSLETTER = (
    'You are a senior communications officer at CIPRB, Bangladesh, '
    'writing a programme bulletin for senior Bangladesh government officials, UNFPA leadership, '
    'and international donors. '
    'Your tone is authoritative, positive, and forward-looking. '
    'Structure your response as follows — use these exact headings:\n\n'
    'EXECUTIVE SUMMARY\n'
    '[One concise paragraph summarising the reporting period — outcomes, reach, key achievements]\n\n'
    'PROGRAMME HIGHLIGHTS\n'
    '[Three to four specific, data-backed bullet points starting with a strong verb, e.g. "Delivered", "Reached", "Recorded"]\n\n'
    'NARRATIVE\n'
    '[Two paragraphs of narrative context: what the numbers mean for communities, '
    'any operational challenges, and how the programme is responding]\n\n'
    'FORWARD LOOK\n'
    '[One paragraph on planned activities, targets for the next period, '
    'and any specific requests or recommendations for stakeholders]\n\n'
    'Do not invent or extrapolate figures. Write in formal British English. '
    'Each section must use the exact heading text shown above.'
)


def generate_narrative(context: dict) -> str:
    """
    Generate a brief 2–3 paragraph summary narrative.
    Used for monthly summary PDFs and the report narrative field.
    """
    return _call_groq(_SYSTEM_SUMMARY, _build_prompt(context), max_tokens=500)


def generate_newsletter_narrative(context: dict) -> str:
    """
    Generate a full structured newsletter narrative for government officials and donors.
    Returns text with section headings EXECUTIVE SUMMARY / PROGRAMME HIGHLIGHTS /
    NARRATIVE / FORWARD LOOK.
    """
    return _call_groq(_SYSTEM_NEWSLETTER, _build_prompt(context), max_tokens=900)


def _build_prompt(context: dict) -> str:
    lines = ['Programme data for this reporting period:']
    for key, value in context.items():
        if isinstance(value, dict):
            for k2, v2 in value.items():
                lines.append(f'  {key}.{k2}: {v2}')
        elif isinstance(value, list):
            pass  # skip nested lists in prompt
        else:
            lines.append(f'  {key}: {value}')
    lines.append('\nPlease write the report as instructed.')
    return '\n'.join(lines)


def _call_groq(system: str, user_content: str, max_tokens: int = 500) -> str:
    """
    Direct REST call to Groq's OpenAI-compatible chat completions endpoint.
    Avoids the SDK to dodge the httpx/proxies compatibility issue in older groq versions.
    """
    api_key = getattr(settings, 'GROQ_API_KEY', '')
    if not api_key:
        logger.warning('GROQ_API_KEY not configured — skipping AI narrative generation.')
        return ''
    try:
        import requests
        response = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'llama-3.3-70b-versatile',
                'messages': [
                    {'role': 'system', 'content': system},
                    {'role': 'user', 'content': user_content},
                ],
                'max_tokens': max_tokens,
                'temperature': 0.3,
            },
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        return payload['choices'][0]['message']['content'].strip()
    except Exception as exc:
        logger.error('AI narrative generation failed: %s', exc)
        return ''
