from rest_framework import serializers
from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    report_type_display = serializers.CharField(source='get_report_type_display', read_only=True)
    format_display = serializers.CharField(source='get_format_display', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'report_type', 'report_type_display', 'format', 'format_display',
            'partner', 'year', 'month', 'title', 'narrative',
            'file', 'generated_by', 'created_at',
        ]
        read_only_fields = ['id', 'narrative', 'file', 'generated_by', 'created_at']


class GenerateReportSerializer(serializers.Serializer):
    report_type = serializers.ChoiceField(choices=['monthly_summary', 'one_pager', 'newsletter'])
    format = serializers.ChoiceField(choices=['pdf', 'docx', 'pptx'])
    partner = serializers.CharField(max_length=20, required=False, default='')
    year = serializers.IntegerField(min_value=2020, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    include_narrative = serializers.BooleanField(default=False)
