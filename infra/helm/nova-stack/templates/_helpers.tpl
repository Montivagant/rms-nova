{{- define "nova-stack.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "nova-stack.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "nova-stack.labels" -}}
app.kubernetes.io/name: {{ include "nova-stack.name" . }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "nova-stack.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nova-stack.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "nova-stack.registry" -}}
{{- if .Values.global.imageRegistry -}}
{{- printf "%s/" (trimSuffix "/" .Values.global.imageRegistry) -}}
{{- end -}}
{{- end -}}

{{- define "nova-stack.imageTag" -}}
{{- default .Values.global.imageTag .image.tag -}}
{{- end -}}
