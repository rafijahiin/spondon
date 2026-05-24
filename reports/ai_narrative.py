"""
AI-generated narrative summaries using the Groq API (llama-3 family).
Gracefully returns a fallback message when GROQ_API_KEY is not configured.
"""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    'You are a public health data analyst for a Bangladesh maternal health programme. '
    'Write concise, professional narrative summaries (2-3 paragraphs) of the data '
    'provided. Use plain English suitable for a health ministry report. '
    'Do not invent numbers not present in the data.'
)


def generate_narrative(context: dict) -> str:
    """
    Generate a narrative summary from a dict of programme statistics.
    Returns an empty string and logs a warning if the Groq API is unavailable.
    """
    api_key = getattr(settings, 'GROQ_API_KEY', '')
    if not api_key:
        logger.warning('GROQ_API_KEY not configured — skipping AI narrative generation.')
        return ''

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        user_content = _build_prompt(context)
        completion = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[
                {'role': 'system', 'content': _SYSTEM_PROMPT},
                {'role': 'user', 'content': user_content},
            ],
            max_tokens=500,
            temperature=0.3,
        )
        return completion.choices[0].message.content.strip()
    except Exception as exc:
        logger.error('AI narrative generation failed: %s', exc)
        return ''


def _build_prompt(context: dict) -> str:
    lines = ['Programme data summary:']
    for key, value in context.items():
        lines.append(f'- {key}: {value}')
    lines.append('\nWrite a 2-3 paragraph narrative summary of this data for a health report.')
    return '\n'.join(lines)
