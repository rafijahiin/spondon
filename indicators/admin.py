from django.contrib import admin
from .models import IndicatorTarget


@admin.register(IndicatorTarget)
class IndicatorTargetAdmin(admin.ModelAdmin):
    list_display = [
        'indicator_code', 'organisation', 'indicator_name',
        'target_value', 'unit', 'period_start', 'period_end', 'is_active',
    ]
    list_filter = ['organisation', 'is_active', 'period_start']
    search_fields = ['indicator_code', 'indicator_name']
    ordering = ['organisation', 'indicator_code']
    list_editable = ['target_value', 'is_active']
