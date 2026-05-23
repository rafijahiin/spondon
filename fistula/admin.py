from django.contrib import admin
from .models import FistulaCase


def _mask(value: str) -> str:
    if not value:
        return '—'
    return value[:3] + '***'


@admin.register(FistulaCase)
class FistulaCaseAdmin(admin.ModelAdmin):
    list_display = [
        'case_hash', 'partner', 'district', 'status',
        'masked_patient_name', 'age', 'follow_up_date', 'is_overdue_flag',
    ]
    list_filter = ['partner', 'status']
    search_fields = ['case_hash', 'district']
    readonly_fields = [
        'id', 'case_hash', 'submission', 'patient_name_enc', 'patient_id_enc',
        'created_at', 'updated_at',
    ]
    ordering = ['-date_identified']

    @admin.display(description='Patient name')
    def masked_patient_name(self, obj):
        return _mask(obj.patient_name)

    @admin.display(boolean=True, description='Overdue')
    def is_overdue_flag(self, obj):
        return obj.is_overdue
